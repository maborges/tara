import asyncio
import uuid

from sqlalchemy.ext.asyncio import async_sessionmaker

from app.config import get_settings
from app.db import _engine, set_tenant_context
from app.delivery import process_pending_events


async def run() -> None:
    settings = get_settings()
    tenant_ids = [uuid.UUID(value) for value in settings.worker_tenant_ids()]
    if not tenant_ids:
        raise RuntimeError("TARA_OUTBOX_TENANT_IDS (ou TARA_OUTBOX_TENANT_ID) é obrigatório")
    sessions = async_sessionmaker(_engine, expire_on_commit=False)
    try:
        while True:
            async with sessions() as session:
                for tenant_id in tenant_ids:
                    await set_tenant_context(session, str(tenant_id))
                    await process_pending_events(session, tenant_id, settings.outbox_batch_size)
            await asyncio.sleep(settings.outbox_interval_seconds)
    finally:
        await _engine.dispose()


if __name__ == "__main__":
    asyncio.run(run())
