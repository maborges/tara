from types import SimpleNamespace
from uuid import uuid4

from decimal import Decimal

from app.weighing_events import build_completed_weighing_outbox


def test_completed_weighing_outbox_contains_public_envelope_and_routing_fields():
    tenant_id = uuid4()
    account_id = uuid4()
    weight = SimpleNamespace(
        id=uuid4(), tenant_id=tenant_id, local_id="capture-1", etapa="ENTRADA",
        peso_aferido_kg=Decimal("1500"), peso_tara_kg=Decimal("500"),
        captured_at=__import__("datetime").datetime(2026, 8, 28, 12, 0, 0),
    )
    data = SimpleNamespace(
        local_id="capture-1", contexto={"produto": "soja"}, direcao_veiculo="ENTRADA",
        natureza_mercadoria="GRAOS", tipo_operacao="COMPRA",
    )

    result = (Decimal("1500"), Decimal("500"), Decimal("1000"), "CLIENT_PROVIDED")
    outbox = build_completed_weighing_outbox(weight, None, data, account_id, result=result)

    assert outbox.tenant_id == tenant_id
    assert outbox.conta_id == account_id
    assert outbox.event_type == "balanca.pesagem.concluida.v1"
    assert outbox.payload["payload"]["peso_bruto_kg"] == "1500"
    assert outbox.payload["payload"]["peso_tara_kg"] == "500"
    assert outbox.payload["payload"]["peso_liquido_kg"] == "1000"
    assert outbox.payload["payload"]["tara_source"] == "CLIENT_PROVIDED"
    assert outbox.payload["idempotency_key"] == "capture:capture-1"
