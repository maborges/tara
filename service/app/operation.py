"""Deep module for the operational weighing context."""

from datetime import datetime, timedelta
from decimal import Decimal
import hashlib
import uuid

from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from .auth import new_activation_code, new_token, station_token_hash
from .models import Cliente, Conta, Estacao, EstacaoInstalacao, DeviceConfiguration, Operador, Ordem, Pesagem
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
    existing = (await session.execute(select(Ordem).where(
        Ordem.cliente_id == client.id,
        Ordem.referencia_externa == data.external_reference,
    ))).scalar_one_or_none()
    if existing:
        same_request = (
            existing.tenant_cliente_id == data.client_tenant_id
            and existing.correlation_id == data.correlation_id
            and existing.subject_type == data.subject_type
            and existing.tipo_pesagem == data.tipo_pesagem
            and existing.contexto == data.contexto
        )
        if same_request:
            return existing
        raise ValueError("CONFLICT: referência externa já existe com dados incompatíveis")
    order = Ordem(
        id=uuid.uuid4(), tenant_id=tenant_id, cliente_id=client.id,
        sistema_cliente=data.client_system, tenant_cliente_id=data.client_tenant_id,
        referencia_externa=data.external_reference, correlation_id=data.correlation_id,
        subject_type=data.subject_type, tipo_pesagem=data.tipo_pesagem,
        contexto=data.contexto, status="PENDENTE", created_at=datetime.utcnow(),
    )
    session.add(order)
    await session.flush()
    return order


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


async def complete_weighing(session: AsyncSession, tenant_id: uuid.UUID, data) -> Pesagem:
    order = None
    if data.ordem_id:
        order = (await session.execute(select(Ordem).where(
            Ordem.id == data.ordem_id, Ordem.tenant_id == tenant_id,
        ))).scalar_one_or_none()
        if order is None:
            raise ValueError("Ordem não encontrada para o tenant")

    # Valida etapa antes de qualquer persistência (G07).
    if order is not None:
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
        tipo_operacao=data.tipo_operacao, contexto=data.contexto,
    )
    session.add(weight)
    account = await _get_account(session, tenant_id)

    if order is not None:
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
            session.add(build_completed_weighing_outbox(weight, order, data, account.id, result=result))
        else:
            order.status = "EM_PESAGEM"
    else:
        session.add(build_completed_weighing_outbox(weight, order, data, account.id))

    await session.flush()
    return weight


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
