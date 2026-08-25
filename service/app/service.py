from datetime import datetime
from decimal import Decimal
import uuid
import hashlib
import secrets

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from .auth import new_activation_code, new_token, station_token_hash
from .db import set_tenant_context
from .models import Cliente, Conta, Estacao, Operador, Ordem, Outbox, Pesagem
from .models import (
    AdministradorPlataforma, ApiClient, Papel, PapelPermissao, Permissao,
    Usuario, UsuarioPapel,
)
from .security import (
    BACKOFFICE_PERMISSIONS,
    INTEGRATION_SCOPES,
    hash_password,
    issue_backoffice_token,
    verify_password,
)


async def get_account(session: AsyncSession, tenant_id: uuid.UUID) -> Conta:
    account = (await session.execute(select(Conta).where(Conta.tenant_id == tenant_id))).scalar_one_or_none()
    if account:
        return account
    account = Conta(id=uuid.uuid4(), tenant_id=tenant_id, nome="Conta Balança", status="ATIVA")
    session.add(account)
    await session.flush()
    return account


async def login_backoffice(session: AsyncSession, tenant_id: uuid.UUID, login: str, password: str):
    user = (await session.execute(
        select(Usuario).where(
            Usuario.tenant_id == tenant_id,
            Usuario.login == login,
            Usuario.status == "ATIVO",
        )
    )).scalar_one_or_none()
    if user is None or not verify_password(password, user.password_hash):
        raise ValueError("Usuário ou senha inválidos")
    permissions = await _permissions_for_user(session, user.id, tenant_id)
    user.last_login_at = datetime.utcnow()
    return user, permissions, issue_backoffice_token(user, permissions)


async def login_backoffice_without_tenant(session: AsyncSession, login: str, password: str):
    admin = (await session.execute(
        select(AdministradorPlataforma).where(
            AdministradorPlataforma.login == login,
            AdministradorPlataforma.status == "ATIVO",
        )
    )).scalar_one_or_none()
    if admin is None or not verify_password(password, admin.password_hash):
        raise ValueError("Usuário ou senha inválidos")
    tenant_id = admin.tenant_id
    await set_tenant_context(session, str(tenant_id))
    user = (await session.execute(
        select(Usuario).where(
            Usuario.id == admin.usuario_id,
            Usuario.tenant_id == tenant_id,
            Usuario.status == "ATIVO",
        )
    )).scalar_one_or_none()
    if user is None:
        raise ValueError("Administrador da plataforma inválido")
    permissions = await _permissions_for_user(session, user.id, tenant_id)
    now = datetime.utcnow()
    user.last_login_at = now
    admin.last_login_at = now
    return user, permissions, issue_backoffice_token(user, permissions)


async def _permissions_for_user(
    session: AsyncSession, user_id: uuid.UUID, tenant_id: uuid.UUID
) -> set[str]:
    result = await session.execute(
        select(Permissao.codigo)
        .join(PapelPermissao, PapelPermissao.permissao_id == Permissao.id)
        .join(Papel, Papel.id == PapelPermissao.papel_id)
        .join(UsuarioPapel, UsuarioPapel.papel_id == Papel.id)
        .where(
            UsuarioPapel.usuario_id == user_id,
            Papel.tenant_id == tenant_id,
            Permissao.tenant_id == tenant_id,
            Papel.status == "ATIVO",
        )
    )
    return set(result.scalars())


async def bootstrap_admin(
    session: AsyncSession,
    tenant_id: uuid.UUID,
    login: str,
    nome_exibicao: str,
    password: str,
) -> Usuario:
    existing = (await session.execute(
        select(Usuario).where(Usuario.tenant_id == tenant_id, Usuario.login == login)
    )).scalar_one_or_none()
    if existing:
        platform_admin = (await session.execute(
            select(AdministradorPlataforma).where(
                AdministradorPlataforma.usuario_id == existing.id
            )
        )).scalar_one_or_none()
        if platform_admin:
            raise ValueError("Usuário já cadastrado")
        if not verify_password(password, existing.password_hash):
            raise ValueError("Usuário já cadastrado; a senha informada não confere")
        session.add(AdministradorPlataforma(
            id=uuid.uuid4(), usuario_id=existing.id, tenant_id=tenant_id,
            login=existing.login, nome_exibicao=existing.nome_exibicao,
            password_hash=existing.password_hash, status="ATIVO",
            created_at=datetime.utcnow(),
        ))
        await session.flush()
        return existing
    user = Usuario(
        id=uuid.uuid4(),
        tenant_id=tenant_id,
        login=login,
        nome_exibicao=nome_exibicao,
        password_hash=hash_password(password),
        status="ATIVO",
        created_at=datetime.utcnow(),
    )
    session.add(user)
    await session.flush()
    session.add(AdministradorPlataforma(
        id=uuid.uuid4(), usuario_id=user.id, tenant_id=tenant_id, login=login,
        nome_exibicao=nome_exibicao, password_hash=user.password_hash,
        status="ATIVO", created_at=datetime.utcnow(),
    ))
    permissions = sorted(BACKOFFICE_PERMISSIONS)
    role = (await session.execute(
        select(Papel).where(Papel.tenant_id == tenant_id, Papel.codigo == "ADMIN_BALANCA")
    )).scalar_one_or_none()
    if role is None:
        role = Papel(
            id=uuid.uuid4(), tenant_id=tenant_id, codigo="ADMIN_BALANCA",
            nome="Administrador da Balança", status="ATIVO",
        )
        session.add(role)
        for code in permissions:
            permission = (await session.execute(
                select(Permissao).where(Permissao.tenant_id == tenant_id, Permissao.codigo == code)
            )).scalar_one_or_none()
            if permission is None:
                permission = Permissao(
                    id=uuid.uuid4(), tenant_id=tenant_id, codigo=code, descricao=code,
                )
                session.add(permission)
                await session.flush()
            session.add(PapelPermissao(papel_id=role.id, permissao_id=permission.id))
        await session.flush()
    session.add(UsuarioPapel(usuario_id=user.id, papel_id=role.id))
    await session.flush()
    return user


async def create_api_client(
    session: AsyncSession,
    tenant_id: uuid.UUID,
    nome: str,
    scopes: list[str],
    expires_at,
) -> tuple[ApiClient, str]:
    invalid_scopes = sorted(set(scopes) - INTEGRATION_SCOPES)
    if invalid_scopes:
        raise ValueError(f"Escopos inválidos: {', '.join(invalid_scopes)}")
    client_id = f"bal_{secrets.token_urlsafe(18)}"
    secret = secrets.token_urlsafe(36)
    client = ApiClient(
        id=uuid.uuid4(),
        tenant_id=tenant_id,
        client_id=client_id,
        nome=nome,
        secret_hash=hashlib.sha256(secret.encode()).hexdigest(),
        scopes=scopes,
        status="ATIVO",
        expires_at=expires_at,
        created_at=datetime.utcnow(),
    )
    session.add(client)
    await session.flush()
    return client, secret


async def rotate_api_client(session: AsyncSession, tenant_id: uuid.UUID, client_id: str) -> tuple[ApiClient, str]:
    client = (await session.execute(select(ApiClient).where(
        ApiClient.tenant_id == tenant_id, ApiClient.client_id == client_id,
    ))).scalar_one_or_none()
    if client is None:
        raise ValueError("Cliente de integração não encontrado")
    secret = secrets.token_urlsafe(36)
    client.secret_hash = hashlib.sha256(secret.encode()).hexdigest()
    client.status = "ATIVO"
    await session.flush()
    return client, secret


async def revoke_api_client(session: AsyncSession, tenant_id: uuid.UUID, client_id: str) -> ApiClient:
    client = (await session.execute(select(ApiClient).where(
        ApiClient.tenant_id == tenant_id, ApiClient.client_id == client_id,
    ))).scalar_one_or_none()
    if client is None:
        raise ValueError("Cliente de integração não encontrado")
    client.status = "REVOGADO"
    await session.flush()
    return client


async def register_client(session: AsyncSession, tenant_id: uuid.UUID, data) -> Cliente:
    account = await get_account(session, tenant_id)
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
    station = Estacao(
        id=uuid.uuid4(), tenant_id=tenant_id, external_id=data.external_id,
        nome=data.nome, activation_code=new_activation_code(), status="PENDENTE",
        created_at=datetime.utcnow(),
    )
    session.add(station)
    await session.flush()
    return station


async def activate_station(session: AsyncSession, tenant_id: uuid.UUID, data) -> tuple[Estacao, str]:
    station = (await session.execute(select(Estacao).where(
        Estacao.tenant_id == tenant_id, Estacao.activation_code == data.activation_code,
    ))).scalar_one_or_none()
    if station is None:
        raise ValueError("Código de ativação inválido")
    token = new_token()
    station.token_hash = station_token_hash(token)
    station.activation_code = None
    station.status = "ATIVA"
    return station, token


async def create_operator(session: AsyncSession, tenant_id: uuid.UUID, data) -> Operador:
    existing = (await session.execute(select(Operador).where(
        Operador.tenant_id == tenant_id, Operador.codigo == data.codigo,
    ))).scalar_one_or_none()
    if existing:
        raise ValueError("Código de operador já cadastrado")
    operator = Operador(
        id=uuid.uuid4(), tenant_id=tenant_id, codigo=data.codigo,
        nome_exibicao=data.nome_exibicao, pessoa_ref=data.pessoa_ref,
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
        id=uuid.uuid4(), tenant_id=tenant_id, ordem_id=order.id,
        local_id=data.local_id, etapa=data.etapa,
        peso_aferido_kg=data.peso_aferido_kg,
        peso_informado_kg=data.peso_informado_kg, peso_tara_kg=data.peso_tara_kg,
        captured_via=data.captured_via, operador_id=data.operador_id,
        leitura_bruta=data.leitura_bruta, captured_at=data.captured_at or datetime.utcnow(),
    )
    session.add(weight)
    order.status = "CONCLUIDA"
    order.peso_liquido_kg = data.peso_aferido_kg - (data.peso_tara_kg or Decimal("0"))
    order.concluida_em = datetime.utcnow()
    account = await get_account(session, tenant_id)
    event_id = uuid.uuid4()
    envelope = {
        "event_id": str(event_id),
        "idempotency_key": f"ordem:{order.id}:pesagem:{weight.id}",
        "event_type": "balanca.pesagem.concluida.v1",
        "event_version": "v1",
        "occurred_at": weight.captured_at.isoformat(),
        "balanca_account_id": str(account.id),
        "client_system": order.sistema_cliente,
        "client_tenant_id": order.tenant_cliente_id,
        "correlation_id": order.correlation_id,
        "external_reference": order.referencia_externa,
        "entity_id": str(order.id),
        "payload": {
            "ordem_id": str(order.id),
            "pesagem_id": str(weight.id),
            "etapa": weight.etapa,
            "peso_aferido_kg": str(weight.peso_aferido_kg),
            "peso_tara_kg": str(weight.peso_tara_kg or Decimal("0")),
            "peso_liquido_kg": str(order.peso_liquido_kg),
        },
    }
    session.add(Outbox(
        id=event_id, tenant_id=tenant_id, conta_id=account.id, cliente_id=order.cliente_id,
        idempotency_key=envelope["idempotency_key"], event_type=envelope["event_type"],
        event_version="v1", aggregate_type="balanca.ordem", aggregate_id=order.id,
        correlation_id=order.correlation_id, payload=envelope, status="PENDENTE",
        attempts=0, created_at=datetime.utcnow(), updated_at=datetime.utcnow(),
    ))
    await session.flush()
    return weight
