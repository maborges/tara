from __future__ import annotations

import json
from datetime import datetime, timedelta
from pathlib import Path

import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from .config import get_settings
from .models import Outbox


async def deliver(event: Outbox) -> None:
    settings = get_settings()
    envelope = event.payload
    if settings.outbox_file_path:
        path = Path(settings.outbox_file_path)
        path.parent.mkdir(parents=True, exist_ok=True)
        with path.open("a", encoding="utf-8") as stream:
            stream.write(json.dumps(envelope, ensure_ascii=False, sort_keys=True) + "\n")
        return
    if not settings.outbox_target_url:
        raise RuntimeError("Configure TARA_OUTBOX_TARGET_URL ou TARA_OUTBOX_FILE_PATH")
    headers = {"content-type": "application/json"}
    if settings.outbox_target_api_key:
        headers["authorization"] = f"Bearer {settings.outbox_target_api_key}"
    async with httpx.AsyncClient(timeout=15) as client:
        response = await client.post(settings.outbox_target_url, json=envelope, headers=headers)
        response.raise_for_status()


async def process_pending_events(session: AsyncSession, tenant_id, limit: int = 50) -> int:
    result = await session.execute(
        select(Outbox)
        .where(
            Outbox.tenant_id == tenant_id,
            Outbox.status == "PENDENTE",
            (Outbox.next_attempt_at.is_(None) | (Outbox.next_attempt_at <= datetime.utcnow())),
        )
        .order_by(Outbox.created_at)
        .with_for_update(skip_locked=True)
        .limit(limit)
    )
    events = list(result.scalars())
    for event in events:
        try:
            await deliver(event)
            event.status = "ENTREGUE"
            event.attempts += 1
            event.last_error = None
        except Exception as exc:
            event.status = "PENDENTE"
            event.attempts += 1
            event.last_error = str(exc)[:2000]
            event.next_attempt_at = datetime.utcnow() + timedelta(seconds=min(3600, 2 ** event.attempts))
    await session.commit()
    return len(events)
