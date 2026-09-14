from __future__ import annotations

import json
import base64
import hashlib
import hmac
from urllib.parse import urlparse
from datetime import datetime, timedelta
from pathlib import Path
import uuid

import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from .config import get_settings
from .models import Outbox, WebhookDestination
from .platform_identity import decrypt_platform_secret


class PermanentDeliveryError(RuntimeError):
    """Rejeição contratual do consumidor que não deve ser repetida."""


def canonical_json(value: dict) -> bytes:
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"), sort_keys=True).encode("utf-8")


def signed_headers(event: Outbox, body: bytes, secret: str, timestamp: str, path: str = "/") -> dict[str, str]:
    message = b"\n".join((b"POST", path.encode(), timestamp.encode(), body))
    digest = hmac.new(secret.encode("utf-8"), message, hashlib.sha256).digest()
    return {
        "content-type": "application/json",
        "X-TARA-Event-Id": str(event.id),
        "X-TARA-Account-Id": str(event.conta_id),
        "X-TARA-Timestamp": timestamp,
        "X-TARA-Signature": "sha256=" + base64.b64encode(digest).decode("ascii"),
    }


class OutboxDelivery:
    """Deep module that delivers one outbox event through its configured adapter."""

    def __init__(self, settings=None, session: AsyncSession | None = None) -> None:
        self.settings = settings or get_settings()
        self.session = session
        self.retry_policy = (8, 2)

    async def deliver(self, event: Outbox) -> None:
        """Deliver an event using the file or account-specific HTTP adapter."""
        if self.settings.outbox_file_path and self.session is None:
            await self._deliver_file(event)
            return
        await self._deliver_http(event)

    async def is_event_enabled(self, event: Outbox) -> bool:
        if self.session is None:
            return True
        destination = (await self.session.execute(select(WebhookDestination).where(
            WebhookDestination.conta_id == event.conta_id,
            WebhookDestination.tenant_id == event.tenant_id,
        ))).scalar_one_or_none()
        if destination is None:
            return True
        return destination.status == "ATIVO" and event.event_type in (destination.event_types or [])

    async def _deliver_file(self, event: Outbox) -> None:
        path = Path(self.settings.outbox_file_path)
        path.parent.mkdir(parents=True, exist_ok=True)
        with path.open("a", encoding="utf-8") as stream:
            stream.buffer.write(canonical_json(event.payload) + b"\n")

    async def _deliver_http(self, event: Outbox) -> None:
        destination = None
        if self.session is not None:
            configured = (await self.session.execute(select(WebhookDestination).where(
                WebhookDestination.conta_id == event.conta_id,
                WebhookDestination.tenant_id == event.tenant_id,
                WebhookDestination.status == "ATIVO",
            ))).scalar_one_or_none()
            if configured:
                secret = decrypt_platform_secret(configured.hmac_secret_encrypted)
                if secret:
                    destination = (configured.target_url, secret)
                    self.retry_policy = (configured.max_attempts, configured.retry_base_seconds)
        destination = destination or self.settings.outbox_destination(str(event.conta_id))
        if not destination:
            if self.settings.outbox_file_path:
                await self._deliver_file(event)
                return
            raise RuntimeError(
                "Configure o destino HMAC da Conta em TARA_OUTBOX_ACCOUNT_DESTINATIONS_JSON "
                "ou a configuração legada TARA_OUTBOX_TARGET_URL/TARA_OUTBOX_TARGET_API_KEY"
            )
        target_url, hmac_secret = destination
        body = canonical_json(event.payload)
        timestamp = str(int(datetime.utcnow().timestamp()))
        path = urlparse(target_url).path or "/"
        headers = signed_headers(event, body, hmac_secret, timestamp, path)
        await self._post_http(target_url, body, headers)

    async def deliver_test(self, account_id, target_url: str, hmac_secret: str) -> int:
        """Send a signed synthetic event to validate a customer's webhook."""
        event_id = uuid.uuid4()
        timestamp = str(int(datetime.utcnow().timestamp()))
        body = canonical_json({
            "event_id": str(event_id), "event_type": "tara.webhook.test.v1",
            "event_version": "v1", "account_id": str(account_id),
            "occurred_at": datetime.utcnow().isoformat(),
            "payload": {"message": "Webhook TARA configurado com sucesso"},
        })
        headers = signed_headers(_TestEvent(event_id, account_id), body, hmac_secret, timestamp, urlparse(target_url).path or "/")
        return await self._post_http(target_url, body, headers)

    async def _post_http(self, target_url: str, body: bytes, headers: dict[str, str]) -> int:
        async with httpx.AsyncClient(timeout=15) as client:
            response = await client.post(target_url, content=body, headers=headers)
            if 200 <= response.status_code < 300 or response.status_code == 409:
                return response.status_code
            if 400 <= response.status_code < 500:
                raise PermanentDeliveryError(
                    f"Consumidor rejeitou a entrega (HTTP {response.status_code})"
                )
            raise RuntimeError(f"Consumidor indisponível (HTTP {response.status_code})")


class _TestEvent:
    def __init__(self, event_id, account_id) -> None:
        self.id = event_id
        self.conta_id = account_id


async def deliver(event: Outbox) -> None:
    """Backward-compatible entry point for one default-configured delivery."""
    await OutboxDelivery().deliver(event)


async def process_pending_events(
    session: AsyncSession, tenant_id, limit: int = 50, delivery: OutboxDelivery | None = None
) -> int:
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
    adapter = delivery or OutboxDelivery(session=session)
    for event in events:
        try:
            if hasattr(adapter, "is_event_enabled") and not await adapter.is_event_enabled(event):
                event.status = "DESABILITADO"
                event.next_attempt_at = None
                event.last_error = "Tipo de evento desabilitado na configuração da Conta"
                event.updated_at = datetime.utcnow()
                continue
            await adapter.deliver(event)
            event.status = "ENTREGUE"
            event.attempts += 1
            event.delivered_at = datetime.utcnow()
            event.last_error = None
        except Exception as exc:
            event.attempts += 1
            max_attempts, base_seconds = getattr(adapter, "retry_policy", (8, 2))
            event.status = "FALHA" if isinstance(exc, PermanentDeliveryError) or event.attempts >= max_attempts else "PENDENTE"
            event.last_error = str(exc)[:240]
            event.next_attempt_at = None if event.status == "FALHA" else datetime.utcnow() + timedelta(seconds=min(3600, base_seconds ** event.attempts))
        event.updated_at = datetime.utcnow()
    await session.commit()
    return len(events)
