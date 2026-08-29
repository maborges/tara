from __future__ import annotations

from types import SimpleNamespace

import pytest

from app.delivery import OutboxDelivery


@pytest.mark.asyncio
async def test_file_adapter_is_hidden_behind_outbox_delivery(tmp_path):
    target = tmp_path / "events.jsonl"
    settings = SimpleNamespace(outbox_file_path=str(target))
    event = SimpleNamespace(payload={"event_type": "balanca.pesagem.concluida.v1"})

    await OutboxDelivery(settings).deliver(event)

    assert target.read_text(encoding="utf-8") == '{"event_type":"balanca.pesagem.concluida.v1"}\n'
