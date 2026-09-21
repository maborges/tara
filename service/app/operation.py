"""Deep module for the operational weighing context."""

from datetime import datetime, timedelta
from decimal import Decimal
import hashlib
import uuid

from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from .auth import new_activation_code, new_token, station_token_hash
from .models import (
    Cliente,
    Conta,
    DeliveryReceipt,
    Estacao,
    EstacaoInstalacao,
    DeviceConfiguration,
    MarcoPesagemOficial,
    Operador,
    Ordem,
    OrdemResultadoHistorico,
    Pesagem,
)
from .weighing_events import build_completed_weighing_outbox


FINAL_STAGE_BY_WEIGHING_TYPE = {
    "UNICA": "UNICA",
    "DUPLA": "SAIDA",
    "DUPLA_ENTRADA_DESCARGA": "POS_DESCARGA",
    "DUPLA_SAIDA_CARREGAMENTO": "SAIDA",
}

# Vocabulário canônico de etapas por tipo de pesagem (G07).
# Toda etapa fora deste conjunto é rejeitada antes de persistir a Pesagem.
VALID_STAGES_BY_TYPE: dict[str, set[str]] = {
    "UNICA":                    {"UNICA"},
    "DUPLA":                    {"CHEGADA", "SAIDA"},
    "DUPLA_ENTRADA_DESCARGA":   {"CHEGADA", "POS_DESCARGA"},
    "DUPLA_SAIDA_CARREGAMENTO": {"CHEGADA", "SAIDA"},
}

N_CAPTURE_STAGES = {"CHEGADA", "PRE_OPERACAO", "INTERMEDIARIA", "POS_OPERACAO", "SAIDA"}


async def _get_account(session: AsyncSession, tenant_id: uuid.UUID) -> Conta:
    account = (await session.execute(select(Conta).where(Conta.tenant_id == tenant_id))).scalar_one_or_none()
    if account is None:
        account = Conta(id=uuid.uuid4(), tenant_id=tenant_id, nome="Conta Balança", status="ATIVA")
        session.add(account)
        await session.flush()
    return account


async def register_client(session: AsyncSession, tenant_id: uuid.UUID, data) -> Cliente:
    account = await _get_account(session, tenant_id)
    client = (await session.execute(select(Cliente).where(
        Cliente.tenant_id == tenant_id,
        Cliente.sistema_cliente == data.sistema_cliente,
        Cliente.tenant_cliente_id == data.tenant_cliente_id,
    ))).scalar_one_or_none()
    if client:
        client.nome_exibicao = data.nome_exibicao
        return client
    client = Cliente(
        id=uuid.uuid4(), tenant_id=tenant_id, conta_id=account.id,
        sistema_cliente=data.sistema_cliente, tenant_cliente_id=data.tenant_cliente_id,
        nome_exibicao=data.nome_exibicao, status="ATIVO",
    )
    session.add(client)
    await session.flush()
    return client


async def create_order(session: AsyncSession, tenant_id: uuid.UUID, data) -> Ordem:
    client = await register_client(session, tenant_id, type("Client", (), {
        "sistema_cliente": data.client_system,
        "tenant_cliente_id": data.client_tenant_id,
        "nome_exibicao": data.client_system,
    })())
    modalidade = getattr(data, "modalidade", None) or ("MULTIPLA" if data.tipo_pesagem == "MULTIPLA" else None)
    natureza_operacao = getattr(data, "natureza_operacao", None)
    tipo_pesagem = data.tipo_pesagem or ("MULTIPLA" if modalidade == "MULTIPLA" else "UNICA")
    if modalidade == "MULTIPLA" and not natureza_operacao:
        raise ValueError("natureza_operacao é obrigatória para uma operação MULTIPLA")
    existing = (await session.execute(select(Ordem).where(
        Ordem.cliente_id == client.id,
        Ordem.referencia_externa == data.external_reference,
    ))).scalar_one_or_none()
    if existing:
        same_request = (
            existing.tenant_cliente_id == data.client_tenant_id
            and existing.correlation_id == data.correlation_id
            and existing.subject_type == data.subject_type
            and existing.tipo_pesagem == tipo_pesagem
            and existing.natureza_operacao == natureza_operacao
            and existing.modalidade == modalidade
            and existing.contexto == data.contexto
        )
        if same_request:
            return existing
        raise ValueError("CONFLICT: referência externa já existe com dados incompatíveis")
    order = Ordem(
        id=uuid.uuid4(), tenant_id=tenant_id, cliente_id=client.id,
        sistema_cliente=data.client_system, tenant_cliente_id=data.client_tenant_id,
        referencia_externa=data.external_reference, correlation_id=data.correlation_id,
        operation_local_id=getattr(data, "operation_local_id", None),
        subject_type=data.subject_type, tipo_pesagem=tipo_pesagem,
        natureza_operacao=natureza_operacao, modalidade=modalidade,
        contexto=data.contexto,
        status="EM_PESAGEM" if modalidade == "MULTIPLA" else "PENDENTE",
        created_at=datetime.utcnow(),
    )
    session.add(order)
    await session.flush()
    return order


def _offline_operation_context(data) -> dict:
    """Canonical operational context kept opaque to ERP domains.

    The values are snapshots supplied by the Station. They are not master data
    and are only compared for a safe technical reconciliation.
    """
    context = dict(data.contexto or {})
    context.update({
        "processo": {"tipo": data.processo.tipo, "referencia": data.processo.referencia},
        "veiculo": {
            "placa_cavalo": data.veiculo.placa_cavalo,
            "carretas": data.veiculo.carretas,
        },
        "motorista": {
            "nome": data.motorista.nome.strip(),
            "documento": {
                "tipo": str(data.motorista.documento.get("tipo", "")).strip().upper(),
                "numero": str(data.motorista.documento.get("numero", "")).strip(),
            },
        },
    })
    if context["motorista"]["documento"]["tipo"] not in {"CNH", "CPF", "RG", "OUTRO"}:
        raise ValueError("Tipo de documento do motorista inválido")
    if not context["motorista"]["documento"]["numero"]:
        raise ValueError("Número do documento do motorista é obrigatório")
    for carreta in context["veiculo"]["carretas"]:
        placa = "".join(char for char in str(carreta.get("placa", "")).upper() if char.isalnum())
        if not placa:
            raise ValueError("Placa de carreta inválida")
        carreta["placa"] = placa
    return context


def _same_operational_context(existing: dict, incoming: dict) -> bool:
    """Compare only the required operational identity; never merge silently."""
    def plate(value) -> str:
        return "".join(char for char in str(value or "").upper() if char.isalnum())

    def text(value) -> str:
        return " ".join(str(value or "").split()).upper()

    def identity(context: dict) -> tuple:
        processo = context.get("processo") or {}
        veiculo = context.get("veiculo") or {}
        motorista = context.get("motorista") or {}
        documento = motorista.get("documento") or {}
        carretas = tuple(sorted(plate(item.get("placa")) for item in veiculo.get("carretas", [])))
        return (
            text(processo.get("tipo")), text(processo.get("referencia")),
            plate(veiculo.get("placa_cavalo")), carretas,
            text(motorista.get("nome")), text(documento.get("tipo")), text(documento.get("numero")),
        )

    return identity(existing) == identity(incoming)


async def resolve_offline_operation(session: AsyncSession, tenant_id: uuid.UUID, data) -> tuple[Ordem | None, str | None]:
    """Map an offline Station operation to exactly one canonical Ordem.

    Returns ``(order, None)`` on success or ``(None, reason)`` for an explicit
    reconciliation conflict. The operation_local_id gives retries a stable key;
    an existing external reference is only adopted after exact context matching.
    """
    context = _offline_operation_context(data)
    mapped = (await session.execute(select(Ordem).where(
        Ordem.tenant_id == tenant_id,
        Ordem.operation_local_id == data.operation_local_id,
    ))).scalar_one_or_none()
    if mapped is not None:
        return mapped, None

    candidates = list((await session.execute(select(Ordem).where(
        Ordem.tenant_id == tenant_id,
        Ordem.referencia_externa == data.referencia_externa,
    ))).scalars())
    if len(candidates) > 1:
        return None, "Conflito: mais de uma Ordem possui a mesma referência externa"
    if candidates:
        existing = candidates[0]
        incoming_modalidade = getattr(data, "modalidade", None) or (
            "MULTIPLA" if data.tipo_pesagem == "MULTIPLA" else None
        )
        if (
            existing.tipo_pesagem != data.tipo_pesagem
            or existing.natureza_operacao != getattr(data, "natureza_operacao", None)
            or existing.modalidade != incoming_modalidade
            or existing.subject_type != data.subject_type
            or not _same_operational_context(existing.contexto or {}, context)
        ):
            return None, "Conflito: referência externa existe com contexto operacional divergente"
        # The pre-existing order remains the authority; no overwrite of its
        # context or operation_local_id is performed.
        return existing, None

    order_data = type("OfflineOrder", (), {
        "client_system": "station-offline",
        "client_tenant_id": str(tenant_id),
        "external_reference": data.referencia_externa,
        "correlation_id": data.correlation_id,
        "subject_type": data.subject_type,
        "tipo_pesagem": data.tipo_pesagem,
        "natureza_operacao": getattr(data, "natureza_operacao", None),
        "modalidade": getattr(data, "modalidade", None),
        "contexto": context,
        "operation_local_id": data.operation_local_id,
    })()
    return await create_order(session, tenant_id, order_data), None


async def create_station(session: AsyncSession, tenant_id: uuid.UUID, data) -> Estacao:
    account = await _get_account(session, tenant_id)
    if data.conta_id is not None and data.conta_id != account.id:
        raise ValueError("A conta selecionada não pertence ao tenant autenticado")
    station = Estacao(
        id=uuid.uuid4(), tenant_id=tenant_id, conta_id=account.id, external_id=data.external_id,
        nome=data.nome, activation_code=new_activation_code(), status="PENDENTE",
        created_at=datetime.utcnow(),
    )
    session.add(station)
    await session.flush()
    return station


async def activate_station(session: AsyncSession, tenant_id: uuid.UUID, data) -> tuple[Estacao, str, str, uuid.UUID, uuid.UUID]:
    station = (await session.execute(select(Estacao).where(
        Estacao.tenant_id == tenant_id, Estacao.activation_code == data.activation_code,
    ))).scalar_one_or_none()
    if station is None:
        raise ValueError("Código de ativação inválido")
    if station.status not in {"PENDENTE", "ATIVA"}:
        raise ValueError("A estação não está disponível para ativação")
    if station.status == "ATIVA":
        now = datetime.utcnow()
        await session.execute(update(EstacaoInstalacao).where(
            EstacaoInstalacao.estacao_id == station.id, EstacaoInstalacao.tenant_id == tenant_id,
            EstacaoInstalacao.status == "ACTIVE",
        ).values(status="REPLACED", revoked_at=now, drain_expires_at=now + timedelta(days=7)))
        await session.execute(update(DeviceConfiguration).where(
            DeviceConfiguration.estacao_id == station.id, DeviceConfiguration.tenant_id == tenant_id,
            DeviceConfiguration.status == "ACTIVE",
        ).values(status="REPLACED", replaced_at=now))
    token = new_token()
    recovery_secret = new_token()
    station.token_hash = station_token_hash(token)
    station.recovery_secret_hash = hashlib.sha256(recovery_secret.encode()).hexdigest()
    station.recovery_secret_version = (station.recovery_secret_version or 0) + 1
    station.activation_code = None
    station.status = "ATIVA"

    installation = EstacaoInstalacao(
        id=uuid.uuid4(), tenant_id=tenant_id, estacao_id=station.id,
        status="ACTIVE", token_hash=station_token_hash(token), created_at=datetime.utcnow(),
    )
    session.add(installation)
    await session.flush()  # persists installation.id so DeviceConfiguration FK resolves

    device_config = DeviceConfiguration(
        id=uuid.uuid4(), tenant_id=tenant_id, estacao_id=station.id,
        instalacao_id=installation.id, bridge_url=None,
        status="ACTIVE", created_at=datetime.utcnow(),
    )
    session.add(device_config)

    return station, token, recovery_secret, installation.id, device_config.id


async def update_station_status(session: AsyncSession, tenant_id: uuid.UUID, station_id: uuid.UUID, status: str) -> Estacao:
    station = (await session.execute(select(Estacao).where(
        Estacao.id == station_id, Estacao.tenant_id == tenant_id,
    ))).scalar_one_or_none()
    if station is None:
        raise ValueError("Estação não encontrada")

    allowed_transitions = {
        "PENDENTE": {"REVOGADA"},
        "ATIVA": {"SUSPENSA", "REVOGADA"},
        "SUSPENSA": {"ATIVA", "REVOGADA"},
        "REVOGADA": set(),
    }
    if status not in allowed_transitions.get(station.status, set()):
        raise ValueError(f"Transição de {station.status} para {status} não permitida")
    station.status = status
    return station


async def create_operator(session: AsyncSession, tenant_id: uuid.UUID, data) -> Operador:
    existing = (await session.execute(select(Operador).where(
        Operador.tenant_id == tenant_id, Operador.codigo == data.codigo,
    ))).scalar_one_or_none()
    if existing:
        raise ValueError("Código de operador já cadastrado")
    external_identifier = getattr(data, "identificador_externo", None)
    if external_identifier is not None:
        external_identifier = external_identifier.strip().upper() or None
    if external_identifier:
        existing_external = (await session.execute(select(Operador).where(
            Operador.tenant_id == tenant_id,
            func.lower(func.btrim(Operador.identificador_externo)) == external_identifier.lower(),
        ))).scalar_one_or_none()
        if existing_external:
            raise ValueError("Identificador externo de operador já cadastrado")
    operator = Operador(
        id=uuid.uuid4(), tenant_id=tenant_id, codigo=data.codigo,
        nome_exibicao=data.nome_exibicao, identificador_externo=external_identifier, pessoa_ref=data.pessoa_ref,
        pin_hash=(
            data.pin_hash
            or (hashlib.sha256(data.pin.encode()).hexdigest() if data.pin else None)
        ),
        status="ATIVO", created_at=datetime.utcnow(),
    )
    session.add(operator)
    await session.flush()
    return operator


async def update_operator_status(session: AsyncSession, tenant_id: uuid.UUID, operator_id: uuid.UUID, status: str) -> Operador:
    operator = (await session.execute(select(Operador).where(
        Operador.id == operator_id, Operador.tenant_id == tenant_id,
    ))).scalar_one_or_none()
    if operator is None:
        raise ValueError("Operador não encontrado")
    if operator.status not in {"ATIVO", "INATIVO"}:
        raise ValueError("Status atual do operador é inválido")
    operator.status = status
    return operator


async def reset_operator_pin(session: AsyncSession, tenant_id: uuid.UUID, operator_id: uuid.UUID, novo_pin: str) -> Operador:
    operator = (await session.execute(select(Operador).where(
        Operador.id == operator_id, Operador.tenant_id == tenant_id,
    ))).scalar_one_or_none()
    if operator is None:
        raise ValueError("Operador não encontrado")
    if operator.status == "REVOGADO":
        raise ValueError("Não é possível alterar o PIN de um operador revogado")
    operator.pin_hash = hashlib.sha256(novo_pin.encode()).hexdigest()
    return operator


async def _compute_order_result(
    session: AsyncSession,
    order: Ordem,
    final_weight: "Pesagem",
) -> tuple[Decimal, Decimal | None, Decimal, str]:
    """Calcula (peso_bruto_kg, peso_tara_kg, peso_liquido_kg, tara_source) da operação.

    Para pesagem UNICA:
      bruto  = peso_aferido_kg da pesagem
      tara   = peso_tara_kg informado (pode ser None)
      liquido= bruto - (tara or 0)
      source = CLIENT_PROVIDED | NONE

    Para pesagem DUPLA (qualquer variante):
      bruto  = max(peso_aferido_kg de todas as pesagens da Ordem)
      tara   = min(peso_aferido_kg de todas as pesagens da Ordem)
      liquido= bruto - tara
      source = MEASURED

    Nota: a pesagem final (final_weight) ainda não foi persistida quando esta
    função é chamada — seus dados são passados explicitamente para que o resultado
    seja calculado considerando todos os pesos, incluindo o atual.
    """
    if order.tipo_pesagem == "UNICA":
        bruto = final_weight.peso_aferido_kg
        tara = final_weight.peso_tara_kg
        liquido = bruto - (tara or Decimal("0"))
        source = "CLIENT_PROVIDED" if tara is not None else "NONE"
        return bruto, tara, liquido, source

    # Dupla (qualquer variante): coleta pesos já confirmados + o atual.
    rows = await session.execute(
        select(Pesagem.etapa, Pesagem.peso_aferido_kg)
        .where(Pesagem.ordem_id == order.id)
        .order_by(Pesagem.captured_at)
    )
    confirmed_weights = {r[0]: r[1] for r in rows.fetchall()}
    confirmed_weights[final_weight.etapa] = final_weight.peso_aferido_kg

    if order.tipo_pesagem == "DUPLA_ENTRADA_DESCARGA":
        bruto = confirmed_weights["CHEGADA"]
        tara = confirmed_weights["POS_DESCARGA"]
        if bruto <= tara:
            raise ValueError("Inconsistência operacional: peso de CHEGADA deve ser maior que POS_DESCARGA")
        liquido = bruto - tara
        return bruto, tara, liquido, "MEASURED"

    if order.tipo_pesagem == "DUPLA_SAIDA_CARREGAMENTO":
        tara = confirmed_weights["CHEGADA"]
        bruto = confirmed_weights["SAIDA"]
        if bruto <= tara:
            raise ValueError("Inconsistência operacional: peso de SAIDA deve ser maior que CHEGADA")
        liquido = bruto - tara
        return bruto, tara, liquido, "MEASURED"

    all_weights = list(confirmed_weights.values())
    bruto = max(all_weights)
    tara = min(all_weights)
    liquido = bruto - tara
    return bruto, tara, liquido, "MEASURED"


MULTIPLE_RESULT_NATURES = {"RECEBIMENTO", "EXPEDICAO"}


async def _record_multiple_result(
    session: AsyncSession,
    order: Ordem,
    *,
    status: str,
    motivo: str | None,
    marco_pre: MarcoPesagemOficial | None,
    marco_pos: MarcoPesagemOficial | None,
    bruto: Decimal | None,
    tara: Decimal | None,
    liquido: Decimal | None,
    tara_source: str | None,
    delta_pre: Decimal | None,
    delta_pos: Decimal | None,
) -> Ordem:
    """Persist the current projection and an immutable recomputation snapshot."""
    now = datetime.utcnow()
    version = (order.resultado_versao or 0) + 1
    order.resultado_status = status
    order.resultado_motivo = motivo
    order.resultado_versao = version
    order.resultado_calculado_em = now
    order.peso_bruto_kg = bruto
    order.peso_tara_kg = tara
    order.peso_liquido_kg = liquido
    order.tara_source = tara_source
    order.delta_pre_operacao_kg = delta_pre
    order.delta_pos_operacao_kg = delta_pos
    if status == "VALIDO":
        order.status = "CONCLUIDA"
        order.concluida_em = now
    else:
        order.status = "EM_PESAGEM"
        order.concluida_em = None
    session.add(OrdemResultadoHistorico(
        id=uuid.uuid4(),
        tenant_id=order.tenant_id,
        ordem_id=order.id,
        versao=version,
        status=status,
        motivo=motivo,
        marco_pre_id=marco_pre.id if marco_pre else None,
        marco_pos_id=marco_pos.id if marco_pos else None,
        peso_bruto_kg=bruto,
        peso_tara_kg=tara,
        peso_liquido_kg=liquido,
        tara_source=tara_source,
        delta_pre_operacao_kg=delta_pre,
        delta_pos_operacao_kg=delta_pos,
        calculado_em=now,
    ))
    await session.flush()
    return order


async def recompute_multiple_result(
    session: AsyncSession,
    tenant_id: uuid.UUID,
    ordem_id: uuid.UUID,
) -> Ordem:
    """Recompute a MULTIPLA result exclusively from its official marks.

    This deliberately does not infer a mark from capture order or weight.  A
    missing/unsupported semantic leaves the operation pending; an inverted
    physical relation is rejected before any projection is persisted.
    """
    order = (await session.execute(select(Ordem).where(
        Ordem.id == ordem_id,
        Ordem.tenant_id == tenant_id,
    ).with_for_update())).scalar_one_or_none()
    if order is None:
        raise ValueError("Ordem não encontrada para o tenant")
    if order.modalidade != "MULTIPLA":
        raise ValueError("O motor de resultado consolidado exige uma operação MULTIPLA")

    marks = {
        mark.etapa: mark
        for mark in (await session.execute(select(MarcoPesagemOficial).where(
            MarcoPesagemOficial.tenant_id == tenant_id,
            MarcoPesagemOficial.ordem_id == ordem_id,
        ))).scalars()
    }
    weight_ids = [mark.pesagem_id for mark in marks.values()]
    weights = {}
    if weight_ids:
        weights = {
            weight.id: weight
            for weight in (await session.execute(select(Pesagem).where(
                Pesagem.tenant_id == tenant_id,
                Pesagem.ordem_id == ordem_id,
                Pesagem.id.in_(weight_ids),
            ))).scalars()
        }
    for stage, mark in marks.items():
        if mark.pesagem_id not in weights:
            raise ValueError(f"Marco oficial {stage} referencia uma Pesagem inválida")

    pre_mark = marks.get("PRE_OPERACAO")
    pos_mark = marks.get("POS_OPERACAO")
    pre_weight = weights.get(pre_mark.pesagem_id) if pre_mark else None
    pos_weight = weights.get(pos_mark.pesagem_id) if pos_mark else None
    chegada_mark = marks.get("CHEGADA")
    saida_mark = marks.get("SAIDA")
    chegada_weight = weights.get(chegada_mark.pesagem_id) if chegada_mark else None
    saida_weight = weights.get(saida_mark.pesagem_id) if saida_mark else None

    nature = order.natureza_operacao
    if nature not in MULTIPLE_RESULT_NATURES:
        return await _record_multiple_result(
            session, order,
            status="PENDENTE_SEM_REGRA",
            motivo=(
                "Natureza da operação sem regra física definida para resultado "
                "consolidado (TRANSFERENCIA/DEVOLUCAO/OUTRA)."
            ),
            marco_pre=pre_mark,
            marco_pos=pos_mark,
            bruto=None,
            tara=None,
            liquido=None,
            tara_source=None,
            delta_pre=(pre_weight.peso_aferido_kg - chegada_weight.peso_aferido_kg)
                if pre_weight and chegada_weight else None,
            delta_pos=(saida_weight.peso_aferido_kg - pos_weight.peso_aferido_kg)
                if saida_weight and pos_weight else None,
        )

    if pre_weight is None or pos_weight is None:
        missing = []
        if pre_weight is None:
            missing.append("PRE_OPERACAO")
        if pos_weight is None:
            missing.append("POS_OPERACAO")
        return await _record_multiple_result(
            session, order,
            status="PENDENTE",
            motivo="Marcos oficiais ausentes: " + ", ".join(missing),
            marco_pre=pre_mark,
            marco_pos=pos_mark,
            bruto=None,
            tara=None,
            liquido=None,
            tara_source=None,
            delta_pre=(pre_weight.peso_aferido_kg - chegada_weight.peso_aferido_kg)
                if pre_weight and chegada_weight else None,
            delta_pos=(saida_weight.peso_aferido_kg - pos_weight.peso_aferido_kg)
                if saida_weight and pos_weight else None,
        )

    pre = pre_weight.peso_aferido_kg
    pos = pos_weight.peso_aferido_kg
    if nature == "RECEBIMENTO":
        if pre <= pos:
            raise ValueError("Inversão física: PRE_OPERACAO deve ser maior que POS_OPERACAO para RECEBIMENTO")
        bruto, tara, liquido = pre, pos, pre - pos
    else:  # EXPEDICAO
        if pos <= pre:
            raise ValueError("Inversão física: POS_OPERACAO deve ser maior que PRE_OPERACAO para EXPEDICAO")
        bruto, tara, liquido = pos, pre, pos - pre

    return await _record_multiple_result(
        session, order,
        status="VALIDO",
        motivo=None,
        marco_pre=pre_mark,
        marco_pos=pos_mark,
        bruto=bruto,
        tara=tara,
        liquido=liquido,
        tara_source="MEASURED",
        delta_pre=(pre - chegada_weight.peso_aferido_kg) if chegada_weight else None,
        delta_pos=(saida_weight.peso_aferido_kg - pos) if saida_weight else None,
    )


async def list_result_history(
    session: AsyncSession, tenant_id: uuid.UUID, ordem_id: uuid.UUID,
) -> list[OrdemResultadoHistorico]:
    return list((await session.execute(select(OrdemResultadoHistorico).where(
        OrdemResultadoHistorico.tenant_id == tenant_id,
        OrdemResultadoHistorico.ordem_id == ordem_id,
    ).order_by(OrdemResultadoHistorico.versao))).scalars())


async def complete_weighing(session: AsyncSession, tenant_id: uuid.UUID, data) -> Pesagem:
    order = None
    if data.ordem_id:
        order = (await session.execute(select(Ordem).where(
            Ordem.id == data.ordem_id, Ordem.tenant_id == tenant_id,
        ))).scalar_one_or_none()
        if order is None:
            raise ValueError("Ordem não encontrada para o tenant")

    # Valida etapa antes de qualquer persistência (G07).
    if order is not None and order.modalidade == "MULTIPLA":
        if data.etapa not in N_CAPTURE_STAGES:
            raise ValueError(
                f"Etapa {data.etapa!r} inválida para operação MULTIPLA. "
                f"Etapas válidas: {sorted(N_CAPTURE_STAGES)}"
            )
    elif order is not None:
        valid_stages = VALID_STAGES_BY_TYPE.get(order.tipo_pesagem)
        if valid_stages is None:
            raise ValueError(f"Tipo de pesagem inválido: {order.tipo_pesagem!r}")
        if data.etapa not in valid_stages:
            raise ValueError(
                f"Etapa {data.etapa!r} inválida para tipo_pesagem {order.tipo_pesagem!r}. "
                f"Etapas válidas: {sorted(valid_stages)}"
            )

    duplicate = (await session.execute(select(Pesagem).where(
        Pesagem.tenant_id == tenant_id, Pesagem.local_id == data.local_id,
    ))).scalar_one_or_none()
    if duplicate:
        return duplicate

    # Validate an operational PRE/POS candidate before inserting the physical
    # fact.  Sync processes several items in one transaction, so rejecting here
    # must not leave an invalid capture pending for the caller to commit.
    if order is not None and order.modalidade == "MULTIPLA" and data.finalidade == "OPERACIONAL" and data.etapa in {"PRE_OPERACAO", "POS_OPERACAO"} and order.natureza_operacao in MULTIPLE_RESULT_NATURES:
        counterpart_stage = "POS_OPERACAO" if data.etapa == "PRE_OPERACAO" else "PRE_OPERACAO"
        counterpart_mark = (await session.execute(select(MarcoPesagemOficial).where(
            MarcoPesagemOficial.tenant_id == tenant_id,
            MarcoPesagemOficial.ordem_id == order.id,
            MarcoPesagemOficial.etapa == counterpart_stage,
        ))).scalar_one_or_none()
        if counterpart_mark is not None:
            counterpart_weight = (await session.execute(select(Pesagem).where(
                Pesagem.id == counterpart_mark.pesagem_id,
                Pesagem.tenant_id == tenant_id,
                Pesagem.ordem_id == order.id,
            ))).scalar_one_or_none()
            if counterpart_weight is None:
                raise ValueError(f"Marco oficial {counterpart_stage} referencia uma Pesagem inválida")
            pre_value = data.peso_aferido_kg if data.etapa == "PRE_OPERACAO" else counterpart_weight.peso_aferido_kg
            pos_value = data.peso_aferido_kg if data.etapa == "POS_OPERACAO" else counterpart_weight.peso_aferido_kg
            if order.natureza_operacao == "RECEBIMENTO" and pre_value <= pos_value:
                raise ValueError("Inversão física: PRE_OPERACAO deve ser maior que POS_OPERACAO para RECEBIMENTO")
            if order.natureza_operacao == "EXPEDICAO" and pos_value <= pre_value:
                raise ValueError("Inversão física: POS_OPERACAO deve ser maior que PRE_OPERACAO para EXPEDICAO")

    weight = Pesagem(
        id=uuid.uuid4(), tenant_id=tenant_id, estacao_id=data.estacao_id, instalacao_id=data.installation_id,
        device_configuration_id=data.device_configuration_id,
        ordem_id=order.id if order else None,
        local_id=data.local_id, etapa=data.etapa,
        peso_aferido_kg=data.peso_aferido_kg,
        peso_informado_kg=data.peso_informado_kg, peso_tara_kg=data.peso_tara_kg,
        captured_via=data.captured_via, operador_id=data.operador_id,
        leitura_bruta=data.leitura_bruta, captured_at=data.captured_at or datetime.utcnow(),
        reconciliation_status="NAO_RECONCILIADA" if order is None else "NAO_APLICAVEL",
        direcao_veiculo=data.direcao_veiculo, natureza_mercadoria=data.natureza_mercadoria,
        tipo_operacao=data.tipo_operacao, finalidade=data.finalidade,
        metodo_medicao=data.metodo_medicao, contexto=data.contexto,
    )
    session.add(weight)
    account = await _get_account(session, tenant_id)

    if order is not None and order.modalidade == "MULTIPLA":
        order.status = "EM_PESAGEM"
    elif order is not None:
        final_stage = FINAL_STAGE_BY_WEIGHING_TYPE[order.tipo_pesagem]
        if data.etapa == final_stage:
            peso_bruto, peso_tara, peso_liquido, tara_source = await _compute_order_result(
                session, order, weight
            )
            order.status = "CONCLUIDA"
            order.peso_bruto_kg = peso_bruto
            order.peso_tara_kg = peso_tara
            order.peso_liquido_kg = peso_liquido
            order.tara_source = tara_source
            order.concluida_em = datetime.utcnow()
            result = (peso_bruto, peso_tara, peso_liquido, tara_source)
            outbox = build_completed_weighing_outbox(weight, order, data, account.id, result=result)
            session.add(outbox)
            session.add(DeliveryReceipt(id=uuid.uuid4(), tenant_id=weight.tenant_id, conta_id=account.id, pesagem_id=weight.id, payload=outbox.payload, created_at=outbox.created_at))
        else:
            order.status = "EM_PESAGEM"
    else:
        outbox = build_completed_weighing_outbox(weight, order, data, account.id)
        session.add(outbox)
        session.add(DeliveryReceipt(id=uuid.uuid4(), tenant_id=weight.tenant_id, conta_id=account.id, pesagem_id=weight.id, payload=outbox.payload, created_at=outbox.created_at))

    await session.flush()
    if order is not None and order.modalidade == "MULTIPLA":
        # A normal PRE/POS capture establishes the first official mark only.
        # Repeated captures remain evidence/conference and never replace it.
        if data.finalidade == "OPERACIONAL" and data.etapa in {"PRE_OPERACAO", "POS_OPERACAO"}:
            existing_mark = (await session.execute(select(MarcoPesagemOficial).where(
                MarcoPesagemOficial.tenant_id == tenant_id,
                MarcoPesagemOficial.ordem_id == order.id,
                MarcoPesagemOficial.etapa == data.etapa,
            ))).scalar_one_or_none()
            if existing_mark is None:
                session.add(MarcoPesagemOficial(
                    id=uuid.uuid4(), tenant_id=tenant_id, ordem_id=order.id,
                    pesagem_id=weight.id, etapa=data.etapa,
                    decidido_em=datetime.utcnow(), operador_id=data.operador_id,
                ))
                await session.flush()
        await recompute_multiple_result(session, tenant_id, order.id)
    return weight


async def set_official_mark(
    session: AsyncSession,
    tenant_id: uuid.UUID,
    ordem_id: uuid.UUID,
    data,
) -> MarcoPesagemOficial:
    """Registra ou substitui o marco oficial sem alterar a Pesagem."""
    order = (await session.execute(select(Ordem).where(
        Ordem.id == ordem_id, Ordem.tenant_id == tenant_id,
    ))).scalar_one_or_none()
    if order is None:
        raise ValueError("Ordem não encontrada para o tenant")
    if order.modalidade == "MULTIPLA" and data.etapa not in N_CAPTURE_STAGES:
        raise ValueError(
            f"Etapa {data.etapa!r} inválida para marco oficial de operação MULTIPLA"
        )
    weight = (await session.execute(select(Pesagem).where(
        Pesagem.id == data.pesagem_id, Pesagem.tenant_id == tenant_id,
    ))).scalar_one_or_none()
    if weight is None or weight.ordem_id != ordem_id or weight.etapa != data.etapa:
        raise ValueError("Marco deve referenciar uma Pesagem da mesma Ordem e etapa")
    if data.operador_id is not None:
        operator = (await session.execute(select(Operador).where(
            Operador.id == data.operador_id, Operador.tenant_id == tenant_id,
        ))).scalar_one_or_none()
        if operator is None:
            raise ValueError("Operador do marco não pertence ao tenant")

    # Validate a replacement before mutating the current mark.  This keeps a
    # rejected physical inversion from becoming persistent even when a caller
    # catches ValueError without rolling back immediately.
    if order.modalidade == "MULTIPLA" and data.etapa in {"PRE_OPERACAO", "POS_OPERACAO"}:
        counterpart_stage = "POS_OPERACAO" if data.etapa == "PRE_OPERACAO" else "PRE_OPERACAO"
        counterpart_mark = (await session.execute(select(MarcoPesagemOficial).where(
            MarcoPesagemOficial.tenant_id == tenant_id,
            MarcoPesagemOficial.ordem_id == ordem_id,
            MarcoPesagemOficial.etapa == counterpart_stage,
        ))).scalar_one_or_none()
        if counterpart_mark is not None and order.natureza_operacao in MULTIPLE_RESULT_NATURES:
            counterpart_weight = (await session.execute(select(Pesagem).where(
                Pesagem.id == counterpart_mark.pesagem_id,
                Pesagem.tenant_id == tenant_id,
                Pesagem.ordem_id == ordem_id,
            ))).scalar_one_or_none()
            if counterpart_weight is None:
                raise ValueError(f"Marco oficial {counterpart_stage} referencia uma Pesagem inválida")
            pre_value = weight.peso_aferido_kg if data.etapa == "PRE_OPERACAO" else counterpart_weight.peso_aferido_kg
            pos_value = weight.peso_aferido_kg if data.etapa == "POS_OPERACAO" else counterpart_weight.peso_aferido_kg
            if order.natureza_operacao == "RECEBIMENTO" and pre_value <= pos_value:
                raise ValueError("Inversão física: PRE_OPERACAO deve ser maior que POS_OPERACAO para RECEBIMENTO")
            if order.natureza_operacao == "EXPEDICAO" and pos_value <= pre_value:
                raise ValueError("Inversão física: POS_OPERACAO deve ser maior que PRE_OPERACAO para EXPEDICAO")

    mark = (await session.execute(select(MarcoPesagemOficial).where(
        MarcoPesagemOficial.tenant_id == tenant_id,
        MarcoPesagemOficial.ordem_id == ordem_id,
        MarcoPesagemOficial.etapa == data.etapa,
    ))).scalar_one_or_none()
    now = datetime.utcnow()
    if mark is None:
        mark = MarcoPesagemOficial(
            id=uuid.uuid4(), tenant_id=tenant_id, ordem_id=ordem_id,
            pesagem_id=weight.id, etapa=data.etapa, decidido_em=now,
            operador_id=data.operador_id,
        )
        session.add(mark)
    else:
        mark.pesagem_id = weight.id
        mark.decidido_em = now
        mark.operador_id = data.operador_id
    await session.flush()
    if order.modalidade == "MULTIPLA":
        await recompute_multiple_result(session, tenant_id, order.id)
    return mark


async def list_official_marks(
    session: AsyncSession, tenant_id: uuid.UUID, ordem_id: uuid.UUID,
) -> list[MarcoPesagemOficial]:
    return list((await session.execute(select(MarcoPesagemOficial).where(
        MarcoPesagemOficial.tenant_id == tenant_id,
        MarcoPesagemOficial.ordem_id == ordem_id,
    ).order_by(MarcoPesagemOficial.etapa))).scalars())


async def reconcile_weighing(session: AsyncSession, tenant_id: uuid.UUID, weighing_id: uuid.UUID, data) -> Pesagem:
    """Reconcile an avulsa weighing without changing its physical capture."""
    weight = (await session.execute(select(Pesagem).where(
        Pesagem.id == weighing_id, Pesagem.tenant_id == tenant_id,
    ))).scalar_one_or_none()
    if weight is None:
        raise ValueError("Pesagem não encontrada para a Conta")
    current_order = (await session.execute(select(Ordem).where(Ordem.id == weight.ordem_id))).scalar_one_or_none() if weight.ordem_id else None
    if current_order is not None and current_order.status != "PENDENTE_RECONCILIACAO":
        raise ValueError("Pesagem já está vinculada a uma ordem")
    if data.status == "CRIAR_ORDEM":
        if data.ordem is None:
            raise ValueError("Dados da nova ordem são obrigatórios")
        order = await create_order(session, tenant_id, data.ordem)
        weight.ordem_id = order.id
        weight.reconciliation_status = "VINCULADA"
    elif data.status == "VINCULADA":
        if data.ordem_id is None:
            raise ValueError("ordem_id é obrigatório para vincular a pesagem")
        order = (await session.execute(select(Ordem).where(
            Ordem.id == data.ordem_id, Ordem.tenant_id == tenant_id,
        ))).scalar_one_or_none()
        if order is None:
            raise ValueError("Ordem não encontrada para a Conta")
        weight.ordem_id = order.id
    weight.reconciliation_status = data.status
    await session.flush()
    return weight
