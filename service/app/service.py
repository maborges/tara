from datetime import datetime, timedelta
from decimal import Decimal
import uuid
import hashlib
import secrets
import asyncio
import logging
import smtplib
import base64
import ssl
from email.message import EmailMessage
from cryptography.fernet import Fernet, InvalidToken

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from .auth import new_activation_code, new_token, station_token_hash
from .config import get_settings
from .db import set_tenant_context
from .models import Cliente, Conta, Estacao, Operador, Ordem, Outbox, Pesagem
from .models import (
    AdministradorPlataforma, ApiClient, ApiClientSecret, Conta, Papel, PapelPermissao,
    Permissao, PlatformSetting, PortalToken, PortalUser, Usuario, UsuarioPapel,
)
from .security import (
    BACKOFFICE_PERMISSIONS,
    INTEGRATION_SCOPES,
    hash_password,
    issue_backoffice_token,
    issue_portal_token,
    verify_password,
)


async def register_portal_user(session: AsyncSession, data):
    """Cria uma conta Balança e seu primeiro administrador do portal."""
    email = data.email.strip().lower()
    exists = (await session.execute(
        select(PortalUser).where(PortalUser.email == email)
    )).scalar_one_or_none()
    if exists:
        raise ValueError("E-mail já cadastrado")
    tenant_id = uuid.uuid4()
    await set_tenant_context(session, str(tenant_id))
    account = Conta(
        id=uuid.uuid4(), tenant_id=tenant_id, nome=data.nome_conta.strip(), status="ATIVA"
    )
    session.add(account)
    await session.flush()
    user = PortalUser(
        id=uuid.uuid4(), conta_id=account.id, tenant_id=tenant_id, email=email,
        nome_exibicao=data.nome_exibicao.strip(), password_hash=hash_password(data.password),
        role="OWNER", status="ATIVO", created_at=datetime.utcnow(),
    )
    session.add(user)
    await session.flush()
    token = await create_portal_token(session, user, "EMAIL_CONFIRMATION")
    await send_portal_email(session,
        email, "Confirme seu e-mail na Plataforma Balança",
        f"Confirme seu e-mail: {get_settings().public_url}/verify-email?token={token}",
    )
    return user, account


async def login_portal_user(session: AsyncSession, email: str, password: str):
    """Autentica um administrador do Portal e resolve sua conta."""
    user = (await session.execute(
        select(PortalUser).where(
            PortalUser.email == email.strip().lower(), PortalUser.status == "ATIVO"
        )
    )).scalar_one_or_none()
    if user is None or not verify_password(password, user.password_hash):
        raise ValueError("E-mail ou senha inválidos")
    if user.email_verified_at is None:
        raise ValueError("Confirme seu e-mail antes de entrar")
    await set_tenant_context(session, str(user.tenant_id))
    user.last_login_at = datetime.utcnow()
    account = (await session.execute(
        select(Conta).where(Conta.id == user.conta_id, Conta.tenant_id == user.tenant_id)
    )).scalar_one_or_none()
    if account is None or account.status != "ATIVA":
        raise ValueError("Conta do cliente inativa")
    return user, account, issue_portal_token(user)


async def create_portal_token(session, user, purpose: str) -> str:
    """Cria token opaco, armazenando somente seu hash no banco."""
    raw = secrets.token_urlsafe(48)
    now = datetime.utcnow()
    session.add(PortalToken(
        id=uuid.uuid4(), portal_user_id=user.id, tenant_id=user.tenant_id,
        token_hash=hashlib.sha256(raw.encode()).hexdigest(), purpose=purpose,
        expires_at=now + timedelta(minutes=get_settings().email_token_minutes),
        created_at=now,
    ))
    await session.flush()
    return raw


async def request_portal_password_reset(session, email: str) -> None:
    """Solicita recuperação sem revelar se o e-mail existe."""
    user = (await session.execute(select(PortalUser).where(
        PortalUser.email == email.strip().lower(), PortalUser.status == "ATIVO"
    ))).scalar_one_or_none()
    if user is None:
        return
    await set_tenant_context(session, str(user.tenant_id))
    raw = await create_portal_token(session, user, "PASSWORD_RESET")
    await send_portal_email(session,
        user.email, "Recuperação de senha da Plataforma Balança",
        f"Redefina sua senha: {get_settings().public_url}/reset-password?token={raw}",
    )


async def confirm_portal_email(session, raw_token: str) -> None:
    """Confirma e-mail usando token único e com expiração."""
    token, user = await get_valid_portal_token(session, raw_token, "EMAIL_CONFIRMATION")
    user.email_verified_at = datetime.utcnow()
    token.used_at = datetime.utcnow()


async def reset_portal_password(session, raw_token: str, password: str) -> None:
    """Troca senha e invalida o token usado."""
    token, user = await get_valid_portal_token(session, raw_token, "PASSWORD_RESET")
    user.password_hash = hash_password(password)
    token.used_at = datetime.utcnow()


async def verify_portal_password_reset_token(session, raw_token: str):
    try:
        token, user = await get_valid_portal_token(session, raw_token, "PASSWORD_RESET")
    except ValueError:
        return None
    return token, user


async def get_valid_portal_token(session, raw_token: str, purpose: str):
    token_hash = hashlib.sha256(raw_token.encode()).hexdigest()
    token = (await session.execute(select(PortalToken).where(
        PortalToken.token_hash == token_hash, PortalToken.purpose == purpose,
        PortalToken.used_at.is_(None), PortalToken.expires_at > datetime.utcnow(),
    ))).scalar_one_or_none()
    if token is None:
        raise ValueError("Token inválido ou expirado")
    await set_tenant_context(session, str(token.tenant_id))
    user = (await session.execute(select(PortalUser).where(
        PortalUser.id == token.portal_user_id, PortalUser.status == "ATIVO"
    ))).scalar_one_or_none()
    if user is None:
        raise ValueError("Usuário do portal inválido")
    return token, user


async def send_portal_email(session, recipient: str, subject: str, body: str) -> None:
    """Entrega mensagem usando a configuração persistida do Backoffice."""
    settings = await load_email_settings(session)
    if not settings["enabled"]:
        raise RuntimeError("Envio de e-mail não está configurado no Backoffice")
    if not settings["smtp_host"]:
        raise RuntimeError("SMTP não configurado no Backoffice")
    await asyncio.to_thread(_send_smtp_email, settings, recipient, subject, body)


async def load_email_settings(session) -> dict:
    rows = (await session.execute(select(PlatformSetting))).scalars().all()
    values = {row.key: row.value for row in rows}
    return {
        "enabled": values.get("email.enabled") == "true",
        "smtp_host": values.get("email.smtp_host"),
        "smtp_port": int(values.get("email.smtp_port") or 587),
        "smtp_username": values.get("email.smtp_username"),
        "smtp_password": decrypt_platform_secret(values.get("email.smtp_password")),
        "smtp_from": values.get("email.smtp_from") or "no-reply@balanca.local",
        "smtp_starttls": values.get("email.smtp_starttls", "true") == "true",
        # Compatibilidade com configurações antigas: a porta 465 implica SSL
        # direto quando a nova opção ainda não foi persistida.
        "smtp_ssl": values.get("email.smtp_ssl", "true" if int(values.get("email.smtp_port") or 587) == 465 else "false") == "true",
    }


async def update_portal_account(session: AsyncSession, user, nome_conta: str, nome_exibicao: str):
    account = (await session.execute(select(Conta).where(Conta.id == user.conta_id, Conta.tenant_id == user.tenant_id))).scalar_one_or_none()
    if account is None:
        raise ValueError("Conta do cliente não encontrada")
    account.nome = nome_conta.strip()
    user.nome_exibicao = nome_exibicao.strip()
    await session.flush()
    return account, user


async def send_api_key_rotation_instructions(session: AsyncSession, tenant_id: uuid.UUID, client_id: str):
    client = (await session.execute(select(ApiClient).where(ApiClient.tenant_id == tenant_id, ApiClient.client_id == client_id))).scalar_one_or_none()
    user = (await session.execute(select(PortalUser).where(PortalUser.tenant_id == tenant_id, PortalUser.role == "OWNER", PortalUser.status == "ATIVO").order_by(PortalUser.created_at))).scalars().first()
    if client is None or user is None:
        raise ValueError("Credencial ou e-mail de cadastro não encontrado")
    await send_portal_email(session, user.email, "Instruções para recuperar a API Key — Plataforma Balança", f"A API Key {client.client_id} teve uma solicitação de recuperação. Por segurança, o Client Secret não pode ser reenviado. Entre no Portal Balança, abra API Keys e use Resetar/rotacionar segredo para gerar um novo segredo. O segredo atual somente será invalidado quando a rotação for confirmada.")
    return user.email


def encrypt_platform_secret(value: str) -> str:
    return Fernet(platform_fernet_key()).encrypt(value.encode()).decode()


def decrypt_platform_secret(value: str | None) -> str | None:
    if not value:
        return
    try:
        return Fernet(platform_fernet_key()).decrypt(value.encode()).decode()
    except InvalidToken as exc:
        raise RuntimeError("Senha SMTP não pode ser descriptografada; salve-a novamente no Backoffice") from exc


def platform_fernet_key() -> bytes:
    digest = hashlib.sha256(get_settings().jwt_secret_secret.encode()).digest()
    return base64.urlsafe_b64encode(digest)


def _send_smtp_email(settings, recipient: str, subject: str, body: str) -> None:
    message = EmailMessage()
    message["From"], message["To"], message["Subject"] = settings["smtp_from"], recipient, subject
    message.set_content(body)
    smtp_class = smtplib.SMTP_SSL if settings["smtp_ssl"] else smtplib.SMTP
    smtp_kwargs = {"timeout": 15}
    if settings["smtp_ssl"]:
        smtp_kwargs["context"] = ssl.create_default_context()
    with smtp_class(settings["smtp_host"], settings["smtp_port"], **smtp_kwargs) as smtp:
        if settings["smtp_starttls"] and not settings["smtp_ssl"]:
            smtp.starttls(context=ssl.create_default_context())
        if settings["smtp_username"]:
            smtp.login(settings["smtp_username"], settings["smtp_password"] or "")
        smtp.send_message(message)


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
    platform_existing = (await session.execute(
        select(AdministradorPlataforma).where(
            AdministradorPlataforma.login == login,
        )
    )).scalar_one_or_none()
    if platform_existing:
        raise ValueError(
            f"Administrador global '{login}' já existe; use o login existente "
            f"(tenant técnico: {platform_existing.tenant_id})"
        )
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
    session.add(ApiClientSecret(id=uuid.uuid4(), api_client_id=client.id, tenant_id=tenant_id, version=1, secret_hash=client.secret_hash, status="ATIVO", created_at=datetime.utcnow()))
    await session.flush()
    return client, secret


async def rotate_api_client(session: AsyncSession, tenant_id: uuid.UUID, client_id: str) -> tuple[ApiClient, str]:
    client = (await session.execute(select(ApiClient).where(
        ApiClient.tenant_id == tenant_id, ApiClient.client_id == client_id,
    ))).scalar_one_or_none()
    if client is None:
        raise ValueError("Cliente de integração não encontrado")
    secret = secrets.token_urlsafe(36)
    now = datetime.utcnow()
    current_version = (await session.execute(select(ApiClientSecret.version).where(ApiClientSecret.api_client_id == client.id).order_by(ApiClientSecret.version.desc()))).scalars().first() or 1
    overlap_until = now + timedelta(hours=24)
    await session.execute(update(ApiClientSecret).where(ApiClientSecret.api_client_id == client.id, ApiClientSecret.status == "ATIVO").values(status="TRANSICAO", valid_until=overlap_until))
    session.add(ApiClientSecret(id=uuid.uuid4(), api_client_id=client.id, tenant_id=tenant_id, version=current_version + 1, secret_hash=hashlib.sha256(secret.encode()).hexdigest(), status="ATIVO", created_at=now))
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
        "TARA_account_id": str(account.id),
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
