import hashlib
import secrets
import uuid
from datetime import datetime

from fastapi import Depends, Header, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from .db import clear_auth_lookup_context, get_session, set_auth_lookup_context, set_tenant_context


def station_token_hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


async def require_station(
    authorization: str = Header(..., alias="Authorization"),
    session: AsyncSession = Depends(get_session),
) -> tuple[uuid.UUID, AsyncSession, object]:
    """Authenticate a physical station and preserve its identity for capture.

    Returns:
        The tenant, active database session and authenticated station.
    Raises:
        HTTPException: If the authorization or station identity is invalid.
    """
    if not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Bearer da estação ausente")
    token_hash = station_token_hash(authorization.split(" ", 1)[1])
    await set_auth_lookup_context(session, "app.auth_station_token_hash", token_hash)
    from sqlalchemy import select
    from .models import Estacao, EstacaoInstalacao

    row = (await session.execute(
        select(Estacao, EstacaoInstalacao).join(EstacaoInstalacao, EstacaoInstalacao.estacao_id == Estacao.id).where(
            EstacaoInstalacao.token_hash == token_hash, Estacao.status == "ATIVA"
        )
    )).first()
    await clear_auth_lookup_context(session, "app.auth_station_token_hash")
    if row is None:
        raise HTTPException(status_code=401, detail="Token da estação inválido")
    station, installation = row
    if installation.status not in {"ACTIVE", "REPLACED"}:
        raise HTTPException(status_code=401, detail="Credencial da instalação revogada")
    if installation.status == "REPLACED" and installation.drain_expires_at and installation.drain_expires_at < datetime.utcnow():
        raise HTTPException(status_code=401, detail="Prazo de drenagem da instalação expirado")
    station.authenticated_installation = installation
    await set_tenant_context(session, str(station.tenant_id))
    station.last_seen_at = datetime.utcnow()
    return station.tenant_id, session, station


def new_token() -> str:
    return secrets.token_urlsafe(32)


def new_activation_code() -> str:
    return secrets.token_hex(6).upper()
