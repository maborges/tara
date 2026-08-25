import hashlib
import secrets
import uuid
from datetime import datetime

from fastapi import Depends, Header, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from .db import get_session, set_tenant_context


def station_token_hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


async def require_station(
    authorization: str = Header(..., alias="Authorization"),
    x_tenant_id: str = Header(..., alias="X-Tenant-ID"),
    session: AsyncSession = Depends(get_session),
) -> tuple[uuid.UUID, AsyncSession]:
    if not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Bearer da estação ausente")
    try:
        tenant_id = uuid.UUID(x_tenant_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="X-Tenant-ID deve ser UUID") from exc
    token_hash = station_token_hash(authorization.split(" ", 1)[1])
    await set_tenant_context(session, str(tenant_id))
    from sqlalchemy import select
    from .models import Estacao

    station = (await session.execute(select(Estacao).where(Estacao.tenant_id == tenant_id, Estacao.token_hash == token_hash, Estacao.status == "ATIVA"))).scalar_one_or_none()
    if station is None:
        raise HTTPException(status_code=401, detail="Token da estação inválido")
    station.last_seen_at = datetime.utcnow()
    return tenant_id, session


def new_token() -> str:
    return secrets.token_urlsafe(32)


def new_activation_code() -> str:
    return secrets.token_hex(6).upper()
