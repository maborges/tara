from __future__ import annotations

import uuid
from datetime import datetime
from decimal import Decimal
from typing import Any

from .models import Outbox


def build_completed_weighing_envelope(weight: Any, order: Any, data: Any, account_id: uuid.UUID) -> tuple[uuid.UUID, dict[str, Any]]:
    """Build the public v1 envelope for a confirmed weighing."""
    liquid_weight = weight.peso_aferido_kg - (weight.peso_tara_kg or Decimal("0"))
    client_tenant_id = order.tenant_cliente_id if order else str(weight.tenant_id)
    external_reference = order.referencia_externa if order else f"capture:{data.local_id}"
    correlation_id = order.correlation_id if order else f"capture:{data.local_id}"
    event_id = uuid.uuid4()
    envelope = {
        "event_id": str(event_id), "idempotency_key": _idempotency_key(weight, order, data),
        "capture_id": data.local_id, "event_type": "balanca.pesagem.concluida.v1",
        "event_version": "v1", "occurred_at": weight.captured_at.isoformat(),
        "received_at": datetime.utcnow().isoformat(), "account_id": str(account_id),
        "client_system": order.sistema_cliente if order else "balanca",
        "client_tenant_id": client_tenant_id, "correlation_id": correlation_id,
        "external_reference": external_reference, "entity_id": str(weight.id),
        "payload": _payload(weight, order, data, liquid_weight),
    }
    return event_id, envelope


def build_completed_weighing_outbox(weight: Any, order: Any, data: Any, account_id: uuid.UUID) -> Outbox:
    """Build the durable outbox record for one completed weighing."""
    event_id, envelope = build_completed_weighing_envelope(weight, order, data, account_id)
    now = datetime.utcnow()
    return Outbox(
        id=event_id, tenant_id=weight.tenant_id, conta_id=account_id,
        cliente_id=order.cliente_id if order else None,
        idempotency_key=envelope["idempotency_key"], event_type=envelope["event_type"],
        event_version="v1", aggregate_type="balanca.pesagem", aggregate_id=weight.id,
        correlation_id=envelope["correlation_id"], payload=envelope, status="PENDENTE",
        attempts=0, created_at=now, updated_at=now,
    )


def _idempotency_key(weight: Any, order: Any, data: Any) -> str:
    return f"ordem:{order.id}:pesagem:{weight.id}" if order else f"capture:{data.local_id}"


def _payload(weight: Any, order: Any, data: Any, liquid_weight: Decimal) -> dict[str, Any]:
    return {
        "ordem_id": str(order.id) if order else None, "pesagem_id": str(weight.id),
        "estacao_id": str(weight.estacao_id) if getattr(weight, "estacao_id", None) else None,
        "capture_id": data.local_id, "etapa": weight.etapa,
        "peso_aferido_kg": str(weight.peso_aferido_kg),
        "peso_tara_kg": str(weight.peso_tara_kg or Decimal("0")),
        "peso_liquido_kg": str(liquid_weight), "pesagem_avulsa": order is None,
        **data.contexto, "direcao_veiculo": data.direcao_veiculo,
        "natureza_mercadoria": data.natureza_mercadoria, "tipo_operacao": data.tipo_operacao,
    }
