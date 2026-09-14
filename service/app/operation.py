"""Deep module for the operational weighing context."""

from datetime import datetime
from decimal import Decimal
import hashlib
import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from .auth import new_activation_code, new_token, station_token_hash
from .models import Cliente, Conta, Estacao, Operador, Ordem, Pesagem
from .weighing_events import build_completed_weighing_outbox


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


async def activate_station(session: AsyncSession, tenant_id: uuid.UUID, data) -> tuple[Estacao, str, str]:
    station = (await session.execute(select(Estacao).where(
        Estacao.tenant_id == tenant_id, Estacao.activation_code == data.activation_code,
    ))).scalar_one_or_none()
    if station is None:
        raise ValueError("Código de ativação inválido")
    token = new_token()
    recovery_secret = new_token()
    station.token_hash = station_token_hash(token)
    station.recovery_secret_hash = hashlib.sha256(recovery_secret.encode()).hexdigest()
    station.recovery_secret_version = (station.recovery_secret_version or 0) + 1
    station.activation_code = None
    station.status = "ATIVA"
    return station, token, recovery_secret


async def create_operator(session: AsyncSession, tenant_id: uuid.UUID, data) -> Operador:
    existing = (await session.execute(select(Operador).where(
        Operador.tenant_id == tenant_id, Operador.codigo == data.codigo,
    ))).scalar_one_or_none()
    if existing:
        raise ValueError("Código de operador já cadastrado")
    if getattr(data, "identificador_externo", None):
        existing_external = (await session.execute(select(Operador).where(
            Operador.tenant_id == tenant_id,
            Operador.identificador_externo == data.identificador_externo,
        ))).scalar_one_or_none()
        if existing_external:
            raise ValueError("Identificador externo de operador já cadastrado")
    operator = Operador(
        id=uuid.uuid4(), tenant_id=tenant_id, codigo=data.codigo,
        nome_exibicao=data.nome_exibicao, identificador_externo=data.identificador_externo, pessoa_ref=data.pessoa_ref,
        pin_hash=(
            data.pin_hash
            or (hashlib.sha256(data.pin.encode()).hexdigest() if data.pin else None)
        ),
        status="ATIVO", created_at=datetime.utcnow(),
    )
    session.add(operator)
    await session.flush()
    return operator


async def complete_weighing(session: AsyncSession, tenant_id: uuid.UUID, data) -> Pesagem:
    order = None
    if data.ordem_id:
        order = (await session.execute(select(Ordem).where(
            Ordem.id == data.ordem_id, Ordem.tenant_id == tenant_id,
        ))).scalar_one_or_none()
        if order is None:
            raise ValueError("Ordem não encontrada para o tenant")
    duplicate = (await session.execute(select(Pesagem).where(
        Pesagem.tenant_id == tenant_id, Pesagem.local_id == data.local_id,
    ))).scalar_one_or_none()
    if duplicate:
        return duplicate
    weight = Pesagem(
        id=uuid.uuid4(), tenant_id=tenant_id, estacao_id=data.estacao_id,
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
        order.status = "CONCLUIDA"
        order.peso_liquido_kg = data.peso_aferido_kg - (data.peso_tara_kg or Decimal("0"))
        order.concluida_em = datetime.utcnow()
    session.add(build_completed_weighing_outbox(
        weight, order, data, account.id
    ))
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
