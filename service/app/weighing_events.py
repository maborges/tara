from __future__ import annotations

import uuid
from datetime import datetime
from decimal import Decimal
from typing import Any

from .models import Outbox


def build_completed_weighing_envelope(
    weight: Any,
    order: Any,
    data: Any,
    account_id: uuid.UUID,
    result: "tuple[Decimal, Decimal | None, Decimal, str] | None" = None,
) -> tuple[uuid.UUID, dict[str, Any]]:
    """Build the public v1 envelope for a confirmed weighing.

    Args:
        weight:     Pesagem persistida.
        order:      Ordem associada (None para pesagem avulsa).
        data:       WeighingIn com os dados da captura.
        account_id: ID da Conta (tenant).
        result:     Tupla (peso_bruto_kg, peso_tara_kg, peso_liquido_kg, tara_source)
                    calculada por _compute_order_result(). Para pesagens avulsas pode
                    ser None — nesse caso o cálculo é feito localmente (sem Ordem).
    """
    if result is not None:
        peso_bruto, peso_tara, peso_liquido, tara_source = result
    else:
        # Pesagem avulsa ou fallback: sem Ordem, calcula diretamente.
        peso_bruto = weight.peso_aferido_kg
        peso_tara = weight.peso_tara_kg
        peso_liquido = peso_bruto - (peso_tara or Decimal("0"))
        tara_source = "CLIENT_PROVIDED" if peso_tara is not None else "NONE"
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
        "payload": _payload(weight, order, data, peso_bruto, peso_tara, peso_liquido, tara_source),
    }
    return event_id, envelope


def build_completed_weighing_outbox(
    weight: Any,
    order: Any,
    data: Any,
    account_id: uuid.UUID,
    result: "tuple[Decimal, Decimal | None, Decimal, str] | None" = None,
) -> Outbox:
    """Build the durable outbox record for one completed weighing."""
    event_id, envelope = build_completed_weighing_envelope(weight, order, data, account_id, result=result)
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


def _payload(
    weight: Any,
    order: Any,
    data: Any,
    peso_bruto: Decimal,
    peso_tara: "Decimal | None",
    peso_liquido: Decimal,
    tara_source: str,
) -> dict[str, Any]:
    return {
        **data.contexto,
        "ordem_id": str(order.id) if order else None, "pesagem_id": str(weight.id),
        "estacao_id": str(weight.estacao_id) if getattr(weight, "estacao_id", None) else None,
        "installation_id": str(weight.instalacao_id) if getattr(weight, "instalacao_id", None) else None,
        "device_configuration_id": str(weight.device_configuration_id) if getattr(weight, "device_configuration_id", None) else None,
        "operador_id": str(weight.operador_id) if getattr(weight, "operador_id", None) else None,
        "capture_id": data.local_id, "etapa": weight.etapa,
        # Fato físico da pesagem individual (imutável).
        "peso_aferido_kg": str(weight.peso_aferido_kg),
        "peso_informado_kg": str(weight.peso_informado_kg) if getattr(weight, "peso_informado_kg", None) is not None else None,
        "captured_via": getattr(weight, "captured_via", None),
        "captured_at": weight.captured_at.isoformat(),
        "leitura_bruta": getattr(weight, "leitura_bruta", None),
        # Resultado calculado da operação.
        "peso_bruto_kg": str(peso_bruto),
        "peso_tara_kg": str(peso_tara) if peso_tara is not None else None,
        "peso_liquido_kg": str(peso_liquido),
        "tara_source": tara_source,
        "pesagem_avulsa": order is None,
        "reconciliation_status": getattr(weight, "reconciliation_status", None),
        "direcao_veiculo": data.direcao_veiculo,
        "natureza_mercadoria": data.natureza_mercadoria, "tipo_operacao": data.tipo_operacao,
        "finalidade": getattr(data, "finalidade", None), "metodo_medicao": getattr(data, "metodo_medicao", None),
        "operation_local_id": order.operation_local_id if order else None,
        "tipo_pesagem": order.tipo_pesagem if order else getattr(data, "tipo_pesagem", None),
        "natureza_operacao": order.natureza_operacao if order else None,
        "modalidade": order.modalidade if order else None,
        "origem_operacao": order.origem_operacao if order else None,
        "referencia_externa": order.referencia_externa if order else f"capture:{data.local_id}",
        "resultado_status": order.resultado_status if order else None,
        "resultado_motivo": order.resultado_motivo if order else None,
        "resultado_versao": order.resultado_versao if order else None,
        "delta_pre_operacao_kg": str(order.delta_pre_operacao_kg) if order and order.delta_pre_operacao_kg is not None else None,
        "delta_pos_operacao_kg": str(order.delta_pos_operacao_kg) if order and order.delta_pos_operacao_kg is not None else None,
    }
