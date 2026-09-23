import hashlib
import hmac
import os
import sys
import uuid
from pathlib import Path

import httpx
import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import async_sessionmaker

os.environ.setdefault("TARA_DATABASE_URL", "postgresql+asyncpg://borgus:numsey01@192.168.0.2/farms")
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.db import _engine, set_tenant_context
from app.main import app
from app.models import MarcoPesagemOficial, OrdemReconciliacaoAuditoria, OrdemResultadoHistorico, Pesagem
from app.service import bootstrap_admin, create_api_client


@pytest.mark.asyncio
async def test_local_origin_lifecycle_and_external_reconciliation():
    tenant_id = uuid.uuid4()
    login = f"origin-{uuid.uuid4().hex[:8]}"
    async with async_sessionmaker(_engine, expire_on_commit=False)() as session:
        await set_tenant_context(session, str(tenant_id))
        await bootstrap_admin(session, tenant_id, login, "Origin Admin", "Senha-Origin-123")
        client, secret = await create_api_client(
            session, tenant_id, "Origin Client",
            ["orders:write", "orders:read", "weighings:read", "weighings:reconcile", "stations:activate"], None,
        )
        await session.commit()

    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://origin.test") as api:
        credentials = {"X-Balanca-Client-ID": client.client_id, "X-Balanca-Client-Secret": secret}
        login_response = await api.post("/v1/auth/login", json={"login": login, "password": "Senha-Origin-123"})
        assert login_response.status_code == 200
        admin_headers = {"X-Tenant-ID": str(tenant_id), "Authorization": f"Bearer {login_response.json()['access_token']}"}
        station = await api.post("/v1/stations", headers=admin_headers, json={"external_id": f"station-{uuid.uuid4()}", "nome": "Origin Station"})
        activation = await api.post("/v1/stations/activate", headers=credentials, json={"activation_code": station.json()["activation_code"]})
        assert activation.status_code == 200, activation.text
        station_headers = {"Authorization": f"Bearer {activation.json()['station_token']}"}
        installation_id = activation.json()["installation_id"]
        device_configuration_id = activation.json()["device_configuration_id"]

        config = await api.post("/v1/stations/device-configurations", headers=station_headers, json={
            "installation_id": installation_id, "bridge_url": "http://127.0.0.1:8321",
        })
        assert config.status_code == 201, config.text
        bridge_key = config.json()["bridge_proof_key"]
        challenge = await api.post("/v1/stations/bridge-validations/challenge", headers=station_headers, json={"device_configuration_id": config.json()["id"]})
        challenge_id, nonce = challenge.json()["challenge_id"], challenge.json()["nonce"]
        async with async_sessionmaker(_engine, expire_on_commit=False)() as verify:
            from app.models import BridgeChallenge
            row = (await verify.execute(select(BridgeChallenge).where(BridgeChallenge.id == uuid.UUID(challenge_id)))).scalar_one()
            expires_at = row.expires_at.isoformat()
        canonical = f"{challenge_id}|{nonce}|{activation.json()['station_id']}|{installation_id}|{expires_at}"
        proof = hmac.new(bridge_key.encode(), canonical.encode(), hashlib.sha256).hexdigest()
        validation = await api.post("/v1/stations/bridge-validations", headers=station_headers, json={
            "bridge_url": "http://127.0.0.1:8321", "challenge_id": challenge_id,
            "bridge_token_proof": proof, "peso_kg": 100,
        })
        assert validation.status_code == 201, validation.text
        auths = await api.post("/v1/stations/offline-authorizations/replenish", headers=station_headers, json={
            "device_configuration_id": config.json()["id"], "count": 5,
        })
        assert auths.status_code == 201, auths.text
        auth_items = auths.json()["items"]

        operation_local_id = str(uuid.uuid4())
        context = {
            "processo": {"tipo": "ROMANEIO", "referencia": None},
            "veiculo": {"placa_cavalo": "ABC1D23", "carretas": []},
            "motorista": {"nome": "Maria", "documento": {"tipo": "CNH", "numero": "12345678900"}},
            "carga": {"produto": {"codigo_externo": "CAF-001", "descricao": "Café Arábica"}, "volumes": [{"quantidade": 500, "tipo": "SACO", "peso_unitario_declarado_kg": 60}], "peso_declarado_kg": 30000, "lote": "LT-001", "documentos": [{"tipo": "NF", "numero": "123456"}]},
        }
        operation = {
            "operation_local_id": operation_local_id, "origem_operacao": "LOCAL",
            "subject_type": "VEICULO", "tipo_pesagem": "MULTIPLA", "natureza_operacao": "RECEBIMENTO", "modalidade": "MULTIPLA",
            "processo": {"tipo": "ROMANEIO", "referencia": None}, "referencia_externa": None,
            "correlation_id": str(uuid.uuid4()), "veiculo": context["veiculo"], "motorista": context["motorista"], "contexto": {"carga": context["carga"]},
        }

        def item(local_id, auth_id, stage, weight):
            return {"local_id": local_id, "authorization_id": auth_id, "payload": {
                "installation_id": installation_id, "device_configuration_id": config.json()["id"], "authorization_id": auth_id,
                "ordem_id": None, "etapa": stage, "peso_aferido_kg": str(weight), "captured_via": "MANUAL",
                "finalidade": "OPERACIONAL", "metodo_medicao": "ESTATICA", "operacao": operation,
            }}

        pre_local = str(uuid.uuid4())
        pre = await api.post("/v1/stations/sync/push", headers=station_headers, json={"items": [item(pre_local, auth_items[0]["id"], "PRE_OPERACAO", "42250.000")]})
        assert pre.status_code == 200 and pre.json()["results"][0]["status"] == "CREATED", pre.text
        order_id = pre.json()["results"][0]["ordem_id"]
        retry = await api.post("/v1/stations/sync/push", headers=station_headers, json={"items": [item(pre_local, auth_items[0]["id"], "PRE_OPERACAO", "42250.000")]})
        assert retry.status_code == 200 and retry.json()["results"][0]["ordem_id"] == order_id

        pos = await api.post("/v1/stations/sync/push", headers=station_headers, json={"items": [item(str(uuid.uuid4()), auth_items[1]["id"], "POS_OPERACAO", "15200.000")]})
        assert pos.status_code == 200, pos.text
        before_external = await api.get("/v1/orders", headers=credentials)
        local_row = next(item for item in before_external.json()["items"] if item["id"] == order_id)
        assert local_row["origem_operacao"] == "LOCAL"
        assert local_row["referencia_externa"] is None
        assert local_row["reconciliation_status"] == "PENDENTE"
        external_context = context
        external = await api.post("/v1/orders", headers=credentials, json={
            "client_system": "agrosaas", "client_tenant_id": "fazenda-origin", "external_reference": "ROM-84721",
            "correlation_id": str(uuid.uuid4()), "operation_local_id": operation_local_id,
            "subject_type": "VEICULO", "tipo_pesagem": "MULTIPLA", "natureza_operacao": "RECEBIMENTO", "modalidade": "MULTIPLA",
            "origem_operacao": "EXTERNA", "contexto": external_context,
        })
        assert external.status_code == 201, external.text
        assert external.json()["id"] == order_id
        assert external.json()["origem_operacao"] == "LOCAL"
        assert external.json()["reconciliation_status"] == "CONCILIADA"
        assert external.json()["referencia_externa"] == "ROM-84721"
        assert external.json()["peso_liquido_kg"] == "27050.000"

        audit = await api.get(f"/v1/orders/{order_id}/reconciliation-audit", headers=credentials)
        assert audit.status_code == 200 and audit.json()[-1]["estado_novo"] == "CONCILIADA"
        async with async_sessionmaker(_engine, expire_on_commit=False)() as verify:
            await set_tenant_context(verify, str(tenant_id))
            captures = list((await verify.execute(select(Pesagem).where(Pesagem.ordem_id == uuid.UUID(order_id)))).scalars())
            marks = list((await verify.execute(select(MarcoPesagemOficial).where(MarcoPesagemOficial.ordem_id == uuid.UUID(order_id)))).scalars())
            history = list((await verify.execute(select(OrdemReconciliacaoAuditoria).where(OrdemReconciliacaoAuditoria.ordem_id == uuid.UUID(order_id)))).scalars())
            result_history = list((await verify.execute(select(OrdemResultadoHistorico).where(OrdemResultadoHistorico.ordem_id == uuid.UUID(order_id)))).scalars())
            assert len(captures) == 2 and len(marks) == 2 and history[-1].estado_novo == "CONCILIADA"
            assert result_history and result_history[-1].peso_liquido_kg == 27050
            assert sorted(c.etapa for c in captures) == ["POS_OPERACAO", "PRE_OPERACAO"]
            assert all(c.estacao_id == uuid.UUID(activation.json()["station_id"]) for c in captures)
            assert all(c.instalacao_id == uuid.UUID(installation_id) for c in captures)
            assert all(c.device_configuration_id == uuid.UUID(config.json()["id"]) for c in captures)
            assert all(c.contexto["carga"]["produto"]["codigo_externo"] == "CAF-001" for c in captures)

        close_operation = {
            **operation, "operation_local_id": str(uuid.uuid4()), "contexto": {"carga": {"produto": {"codigo_externo": "OUTRO"}}},
        }
        close_push = await api.post("/v1/stations/sync/push", headers=station_headers, json={"items": [
            {"local_id": str(uuid.uuid4()), "authorization_id": auth_items[2]["id"], "payload": {
                "installation_id": installation_id, "device_configuration_id": config.json()["id"], "authorization_id": auth_items[2]["id"],
                "etapa": "PRE_OPERACAO", "peso_aferido_kg": "41000.000", "operacao": close_operation,
            }}
        ]})
        assert close_push.status_code == 200 and close_push.json()["results"][0]["status"] == "CREATED"
        close_id = close_push.json()["results"][0]["ordem_id"]
        close = await api.post(f"/v1/orders/{close_id}/reconciliation", headers=credentials, json={"decision": "ENCERRAR_LOCAL", "motivo": "Operação local sem processo externo"})
        assert close.status_code == 200 and close.json()["reconciliation_status"] == "NAO_APLICAVEL"

        conflict_operation = {
            **operation, "operation_local_id": str(uuid.uuid4()),
            "veiculo": {"placa_cavalo": "XYZ9Z99", "carretas": []},
            "contexto": {"carga": {"produto": {"codigo_externo": "CAF-001"}}},
        }
        conflict_push = await api.post("/v1/stations/sync/push", headers=station_headers, json={"items": [
            {"local_id": str(uuid.uuid4()), "authorization_id": auth_items[3]["id"], "payload": {
                "installation_id": installation_id, "device_configuration_id": config.json()["id"], "authorization_id": auth_items[3]["id"],
                "etapa": "PRE_OPERACAO", "peso_aferido_kg": "40000.000", "operacao": conflict_operation,
            }}
        ]})
        assert conflict_push.status_code == 200
        conflict_order_id = conflict_push.json()["results"][0]["ordem_id"]
        conflict_external = await api.post("/v1/orders", headers=credentials, json={
            "client_system": "agrosaas", "client_tenant_id": "fazenda-origin", "external_reference": "ROM-CONFLITO",
            "correlation_id": str(uuid.uuid4()), "operation_local_id": conflict_operation["operation_local_id"],
            "subject_type": "VEICULO", "tipo_pesagem": "MULTIPLA", "natureza_operacao": "RECEBIMENTO", "modalidade": "MULTIPLA",
            "origem_operacao": "EXTERNA", "contexto": {**context, "veiculo": {"placa_cavalo": "AAA1A11", "carretas": []}},
        })
        assert conflict_external.status_code == 409, conflict_external.text
        conflict_orders = await api.get("/v1/orders", headers=credentials)
        assert sum(item["id"] == conflict_order_id for item in conflict_orders.json()["items"]) == 1
        conflict_row = next(item for item in conflict_orders.json()["items"] if item["id"] == conflict_order_id)
        assert conflict_row["reconciliation_status"] == "CONFLITO"

        same_ref_a = await api.post("/v1/orders", headers=credentials, json={
            "client_system": "system-a", "client_tenant_id": "client-a", "external_reference": "REF-SAME",
            "correlation_id": str(uuid.uuid4()), "subject_type": "VEICULO", "tipo_pesagem": "UNICA",
            "origem_operacao": "EXTERNA", "contexto": {},
        })
        same_ref_b = await api.post("/v1/orders", headers=credentials, json={
            "client_system": "system-b", "client_tenant_id": "client-b", "external_reference": "REF-SAME",
            "correlation_id": str(uuid.uuid4()), "subject_type": "VEICULO", "tipo_pesagem": "UNICA",
            "origem_operacao": "EXTERNA", "contexto": {},
        })
        assert same_ref_a.status_code == 201 and same_ref_b.status_code == 201
        assert same_ref_a.json()["id"] != same_ref_b.json()["id"]
