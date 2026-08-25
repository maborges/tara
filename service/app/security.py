from __future__ import annotations

import hashlib
import hmac
import secrets
import uuid
from datetime import datetime, timedelta, timezone

import bcrypt
from fastapi import Depends, Header, HTTPException
from jose import JWTError, jwt
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from .config import get_settings
from .db import get_session, set_tenant_context
from .models import ApiClient, Papel, PapelPermissao, Permissao, Usuario, UsuarioPapel


BACKOFFICE_PERMISSIONS = {
    "backoffice:usuarios:gerenciar",
    "backoffice:papeis:gerenciar",
    "backoffice:clientes:gerenciar",
    "backoffice:estacoes:gerenciar",
    "backoffice:operadores:gerenciar",
    "backoffice:ordens:gerenciar",
    "backoffice:pesagens:consultar",
    "backoffice:pesagens:importar",
    "backoffice:eventos:consultar",
}

INTEGRATION_SCOPES = {
    "clients:write",
    "orders:write",
    "events:read",
    "stations:activate",
}


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()


def verify_password(password: str, password_hash: str) -> bool:
    try:
        return bcrypt.checkpw(password.encode(), password_hash.encode())
    except ValueError:
        return False


def issue_backoffice_token(user: Usuario, permissions: set[str]) -> str:
    settings = get_settings()
    now = datetime.now(timezone.utc)
    payload = {
        "sub": str(user.id),
        "tenant_id": str(user.tenant_id),
        "type": "balanca_backoffice",
        "permissions": sorted(permissions),
        "iat": int(now.timestamp()),
        "exp": int((now + timedelta(minutes=settings.jwt_access_minutes)).timestamp()),
        "jti": secrets.token_urlsafe(18),
    }
    return jwt.encode(payload, settings.jwt_secret_secret, algorithm=settings.jwt_algorithm)


def _decode_backoffice_token(token: str) -> dict:
    try:
        payload = jwt.decode(
            token,
            get_settings().jwt_secret_secret,
            algorithms=[get_settings().jwt_algorithm],
        )
    except JWTError as exc:
        raise HTTPException(status_code=401, detail="Token do backoffice inválido ou expirado") from exc
    if payload.get("type") != "balanca_backoffice":
        raise HTTPException(status_code=401, detail="Token não é do backoffice da Balança")
    return payload


async def _permission_set(session: AsyncSession, user_id: uuid.UUID, tenant_id: uuid.UUID) -> set[str]:
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


def require_backoffice(permission: str | None = None):
    async def dependency(
        authorization: str | None = Header(None, alias="Authorization"),
        x_tenant_id: str | None = Header(None, alias="X-Tenant-ID"),
        session: AsyncSession = Depends(get_session),
    ) -> tuple[uuid.UUID, AsyncSession, Usuario]:
        if not authorization or not authorization.startswith("Bearer "):
            raise HTTPException(status_code=401, detail="Bearer do backoffice ausente")
        if not x_tenant_id:
            raise HTTPException(status_code=401, detail="X-Tenant-ID ausente")
        try:
            tenant_id = uuid.UUID(x_tenant_id)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail="X-Tenant-ID inválido") from exc
        payload = _decode_backoffice_token(authorization.split(" ", 1)[1])
        if payload.get("tenant_id") != str(tenant_id):
            raise HTTPException(status_code=403, detail="Token não pertence ao tenant informado")
        await set_tenant_context(session, str(tenant_id))
        user = (await session.execute(
            select(Usuario).where(
                Usuario.id == uuid.UUID(payload["sub"]),
                Usuario.tenant_id == tenant_id,
                Usuario.status == "ATIVO",
            )
        )).scalar_one_or_none()
        if user is None:
            raise HTTPException(status_code=401, detail="Usuário do backoffice inativo")
        # O JWT carrega permissões para diagnóstico, mas a autorização efetiva
        # consulta o RBAC atual; revogar um papel não espera o token expirar.
        permissions = await _permission_set(session, user.id, tenant_id)
        if permission and permission not in permissions:
            raise HTTPException(status_code=403, detail="Permissão insuficiente")
        return tenant_id, session, user

    return dependency


async def require_client_context(
    x_tenant_id: str = Header(..., alias="X-Tenant-ID"),
    x_client_id: str = Header(..., alias="X-Balanca-Client-ID"),
    x_client_secret: str = Header(..., alias="X-Balanca-Client-Secret"),
    session: AsyncSession = Depends(get_session),
) -> tuple[uuid.UUID, AsyncSession, ApiClient]:
    try:
        tenant_id = uuid.UUID(x_tenant_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="X-Tenant-ID inválido") from exc
    await set_tenant_context(session, str(tenant_id))
    client = (await session.execute(
        select(ApiClient).where(
            ApiClient.client_id == x_client_id,
            ApiClient.tenant_id == tenant_id,
            ApiClient.status == "ATIVO",
        )
    )).scalar_one_or_none()
    if client is None or not hmac.compare_digest(
        client.secret_hash, hashlib.sha256(x_client_secret.encode()).hexdigest()
    ):
        raise HTTPException(status_code=401, detail="Credencial da aplicação inválida")
    if client.expires_at and client.expires_at < datetime.utcnow():
        raise HTTPException(status_code=401, detail="Credencial da aplicação expirada")
    client.last_used_at = datetime.utcnow()
    return client.tenant_id, session, client


def require_client_scope(scope: str):
    async def dependency(context=Depends(require_client_context)):
        tenant_id, session, client = context
        if scope not in set(client.scopes):
            raise HTTPException(status_code=403, detail="Escopo da aplicação insuficiente")
        return context

    return dependency
