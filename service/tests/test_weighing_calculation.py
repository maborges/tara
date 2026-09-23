import os
import sys
import uuid
from decimal import Decimal
from pathlib import Path

import httpx
import pytest
from sqlalchemy.ext.asyncio import async_sessionmaker

os.environ.setdefault("TARA_DATABASE_URL", "postgresql+asyncpg://borgus:numsey01@192.168.0.2/farms")
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.db import _engine, set_tenant_context
from app.main import app
from app.service import bootstrap_admin, create_api_client

@pytest.fixture(scope="module")
def event_loop():
    import asyncio
    loop = asyncio.new_event_loop()
    yield loop
    loop.close()


@pytest.mark.asyncio
async def test_weighing_anomalies_and_semantics():
    tenant_id = str(uuid.uuid4())
    login = f"admin-{uuid.uuid4().hex[:8]}"
    password = "Senha-E2E-123"

    async with async_sessionmaker(_engine, expire_on_commit=False)() as session:
        await set_tenant_context(session, tenant_id)
        await bootstrap_admin(session, uuid.UUID(tenant_id), login, "Admin E2E", password)
        api_client, client_secret = await create_api_client(
            session, uuid.UUID(tenant_id), "AgroSaaS",
            ["clients:write", "orders:write", "orders:read", "events:read", "weighings:read", "stations:activate"], None,
        )
        await session.commit()

    client_id = api_client.client_id

    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://balanca.test") as client:
        response = await client.post("/v1/auth/login", json={"login": login, "password": password})
        assert response.status_code == 200, response.text
        admin_headers = {"X-Tenant-ID": tenant_id, "Authorization": f"Bearer {response.json()['access_token']}"}
        integration_headers = {"X-Balanca-Client-ID": client_id, "X-Balanca-Client-Secret": client_secret}

        response = await client.post("/v1/clients", headers=integration_headers, json={
            "sistema_cliente": "agrosaas", "tenant_cliente_id": f"fazenda-{uuid.uuid4()}", "nome_exibicao": "AgroSaaS"
        })
        assert response.status_code == 201

        response = await client.post("/v1/stations", headers=admin_headers, json={"external_id": f"s-{uuid.uuid4()}", "nome": "Station"})
        assert response.status_code == 201
        activation_code = response.json()["activation_code"]

        response = await client.post("/v1/stations/activate", headers=integration_headers, json={"activation_code": activation_code})
        assert response.status_code == 200
        station_headers = {"Authorization": f"Bearer {response.json()['station_token']}"}

        # 1. Recebimento Anômalo
        resp = await client.post("/v1/orders", headers=integration_headers, json={
            "client_system": "agrosaas", "client_tenant_id": "faz", "external_reference": f"r-ano-{uuid.uuid4()}",
            "correlation_id": "1", "subject_type": "VEICULO", "tipo_pesagem": "DUPLA_ENTRADA_DESCARGA", "contexto": {}
        })
        assert resp.status_code == 201
        ano_r_id = resp.json()["id"]

        resp = await client.post("/v1/stations/pesagens", headers=station_headers, json={
            "ordem_id": ano_r_id, "local_id": str(uuid.uuid4()), "etapa": "CHEGADA", "peso_aferido_kg": "14300.000"
        })
        assert resp.status_code == 201

        resp = await client.post("/v1/stations/pesagens", headers=station_headers, json={
            "ordem_id": ano_r_id, "local_id": str(uuid.uuid4()), "etapa": "POS_DESCARGA", "peso_aferido_kg": "42800.000"
        })
        assert resp.status_code == 422
        assert "Inconsistência operacional" in resp.json()["detail"]

        # 2. Expedição Anômala
        resp = await client.post("/v1/orders", headers=integration_headers, json={
            "client_system": "agrosaas", "client_tenant_id": "faz", "external_reference": f"e-ano-{uuid.uuid4()}",
            "correlation_id": "2", "subject_type": "VEICULO", "tipo_pesagem": "DUPLA_SAIDA_CARREGAMENTO", "contexto": {}
        })
        assert resp.status_code == 201
        ano_e_id = resp.json()["id"]

        resp = await client.post("/v1/stations/pesagens", headers=station_headers, json={
            "ordem_id": ano_e_id, "local_id": str(uuid.uuid4()), "etapa": "CHEGADA", "peso_aferido_kg": "42800.000"
        })
        assert resp.status_code == 201

        resp = await client.post("/v1/stations/pesagens", headers=station_headers, json={
            "ordem_id": ano_e_id, "local_id": str(uuid.uuid4()), "etapa": "SAIDA", "peso_aferido_kg": "14300.000"
        })
        assert resp.status_code == 422
        assert "Inconsistência operacional" in resp.json()["detail"]

        # 3. Expedição Normal
        resp = await client.post("/v1/orders", headers=integration_headers, json={
            "client_system": "agrosaas", "client_tenant_id": "faz", "external_reference": f"e-norm-{uuid.uuid4()}",
            "correlation_id": "3", "subject_type": "VEICULO", "tipo_pesagem": "DUPLA_SAIDA_CARREGAMENTO", "contexto": {}
        })
        assert resp.status_code == 201
        norm_e_id = resp.json()["id"]

        resp = await client.post("/v1/stations/pesagens", headers=station_headers, json={
            "ordem_id": norm_e_id, "local_id": str(uuid.uuid4()), "etapa": "CHEGADA", "peso_aferido_kg": "14300.000"
        })
        assert resp.status_code == 201
        resp = await client.post("/v1/stations/pesagens", headers=station_headers, json={
            "ordem_id": norm_e_id, "local_id": str(uuid.uuid4()), "etapa": "SAIDA", "peso_aferido_kg": "42800.000"
        })
        assert resp.status_code == 201

        resp = await client.get("/v1/orders", headers=integration_headers)
        order = next(o for o in resp.json()["items"] if o["id"] == norm_e_id)
        assert order["peso_bruto_kg"] == "42800.000"
        assert order["peso_tara_kg"] == "14300.000"
        assert order["peso_liquido_kg"] == "28500.000"

        # 4. DUPLA genérica (max/min)
        resp = await client.post("/v1/orders", headers=integration_headers, json={
            "client_system": "agrosaas", "client_tenant_id": "faz", "external_reference": f"d-gen-{uuid.uuid4()}",
            "correlation_id": "4", "subject_type": "VEICULO", "tipo_pesagem": "DUPLA", "contexto": {}
        })
        assert resp.status_code == 201
        gen_id = resp.json()["id"]

        resp = await client.post("/v1/stations/pesagens", headers=station_headers, json={
            "ordem_id": gen_id, "local_id": str(uuid.uuid4()), "etapa": "CHEGADA", "peso_aferido_kg": "14300.000"
        })
        assert resp.status_code == 201
        resp = await client.post("/v1/stations/pesagens", headers=station_headers, json={
            "ordem_id": gen_id, "local_id": str(uuid.uuid4()), "etapa": "SAIDA", "peso_aferido_kg": "42800.000"
        })
        assert resp.status_code == 201

        resp = await client.get("/v1/orders", headers=integration_headers)
        order = next(o for o in resp.json()["items"] if o["id"] == gen_id)
        assert order["peso_bruto_kg"] == "42800.000"
        assert order["peso_tara_kg"] == "14300.000"
        assert order["peso_liquido_kg"] == "28500.000"
