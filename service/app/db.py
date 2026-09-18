from collections.abc import AsyncIterator

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from .config import get_settings

_engine = create_async_engine(get_settings().database_url, pool_pre_ping=True)
_session_factory = async_sessionmaker(_engine, expire_on_commit=False)


async def get_session() -> AsyncIterator[AsyncSession]:
    async with _session_factory() as session:
        yield session


async def set_tenant_context(session: AsyncSession, tenant_id: str) -> None:
    await session.execute(
        text("select set_config('app.current_tenant_id', :tenant_id, true)"),
        {"tenant_id": tenant_id},
    )


async def set_auth_lookup_context(session: AsyncSession, setting: str, value: str) -> None:
    """Restrict the RLS credential lookup to the presented identifier."""
    if setting not in {"app.auth_client_id", "app.auth_station_token_hash"}:
        raise ValueError("Contexto de autenticação inválido")
    await session.execute(
        text("select set_config(:setting, :value, true)"),
        {"setting": setting, "value": value},
    )


async def clear_auth_lookup_context(session: AsyncSession, setting: str) -> None:
    if setting not in {"app.auth_client_id", "app.auth_station_token_hash"}:
        raise ValueError("Contexto de autenticação inválido")
    await session.execute(
        text("select set_config(:setting, '', true)"),
        {"setting": setting},
    )


async def set_platform_admin_context(session: AsyncSession, admin_user_id: str) -> None:
    """Marca a identidade global autenticada para as políticas RLS da plataforma."""
    await session.execute(
        text("select set_config('app.platform_admin_id', :admin_user_id, true)"),
        {"admin_user_id": admin_user_id},
    )


async def dispose_engine() -> None:
    await _engine.dispose()
