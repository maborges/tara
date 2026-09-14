import os
import sys
import uuid
from pathlib import Path

import httpx
import pytest
from sqlalchemy.ext.asyncio import async_sessionmaker

os.environ.setdefault("TARA_DATABASE_URL", "postgresql+asyncpg://borgus:numsey01@192.168.0.3/farms")
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.db import _engine, set_tenant_context
from app.main import app
from app.service import bootstrap_admin, create_api_client


@pytest.mark.asyncio
async def test_avulsa_sync_query_and_reconciliation_flow():
    tenant_id = uuid.uuid4()
    login = f"avulsa-{uuid.uuid4().hex[:8]}"
    password = "Senha-Avulsa-123"
    async with async_sessionmaker(_engine, expire_on_commit=False)() as session:
        await set_tenant_context(session, str(tenant_id))
        await bootstrap_admin(session, tenant_id, login, "Admin Avulsa", password)
        client, secret = await create_api_client(
            session, tenant_id, "Cliente Avulsa",
            ["orders:write", "weighings:read", "weighings:reconcile", "stations:activate"], None,
        )
        await session.commit()

    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://balanca.test") as api:
        credentials = {
            "X-Balanca-Client-ID": client.client_id,
            "X-Balanca-Client-Secret": secret,
        }
        admin_login = await api.post("/v1/auth/login", json={"login": login, "password": password})
        assert admin_login.status_code == 200
        admin_headers = {
            "X-Tenant-ID": str(tenant_id),
            "Authorization": f"Bearer {admin_login.json()['access_token']}",
        }
        station = await api.post(
            "/v1/stations", headers=admin_headers,
            json={"external_id": f"station-{uuid.uuid4()}", "nome": "Estação Avulsa"},
        )
        assert station.status_code == 201, station.text
        activation = await api.post(
            "/v1/stations/activate", headers=credentials,
            json={"activation_code": station.json()["activation_code"]},
        )
        assert activation.status_code == 200, activation.text
        station_headers = {
            "Authorization": f"Bearer {activation.json()['station_token']}",
        }

        capture_id = str(uuid.uuid4())
        pushed = await api.post(
            "/v1/stations/sync/push", headers=station_headers,
            json={"items": [{"local_id": capture_id, "payload": {
                "ordem_id": None,
                "etapa": "UNICA",
                "peso_aferido_kg": "12000.000",
                "peso_tara_kg": "1000.000",
                "captured_via": "ELETRONICA",
                "direcao_veiculo": "ENTRADA",
                "natureza_mercadoria": "ENTRADA",
                "tipo_operacao": "RECEBIMENTO",
                "contexto": {
                    "cfop": "1101", "nota_fiscal": {"numero": "123"},
                    "veiculo": {"placa": "ABC1D23"}, "motorista": {"nome": "João"},
                    "transportadora": {"nome": "Transporte Teste"},
                },
            }}]},
        )
        assert pushed.status_code == 200, pushed.text
        assert pushed.json()["results"][0]["status"] == "CREATED"

        second_capture = await api.post(
            "/v1/stations/sync/push", headers=station_headers,
            json={"items": [{"local_id": str(uuid.uuid4()), "payload": {
                "ordem_id": None, "etapa": "UNICA", "peso_aferido_kg": "8000.000",
                "peso_tara_kg": "500.000", "captured_via": "MANUAL",
                "direcao_veiculo": "SAIDA", "natureza_mercadoria": "SAIDA",
                "tipo_operacao": "EXPEDICAO", "contexto": {"cfop": "5101"},
            }}]},
        )
        assert second_capture.status_code == 200, second_capture.text

        listed = await api.get("/v1/weighings?status=NAO_RECONCILIADA&limit=1", headers=credentials)
        assert listed.status_code == 200, listed.text
        assert listed.json()["next_cursor"]
        weighing = listed.json()["items"][0]
        assert weighing["ordem_id"] is None
        assert weighing["contexto"]["cfop"] == "5101"
        next_page = await api.get(
            f"/v1/weighings?status=NAO_RECONCILIADA&limit=1&cursor={listed.json()['next_cursor']}",
            headers=credentials,
        )
        assert next_page.status_code == 200, next_page.text
        assert len(next_page.json()["items"]) == 1
        first_weighing = next_page.json()["items"][0]
        assert first_weighing["contexto"]["nota_fiscal"]["numero"] == "123"

        order = await api.post(
            "/v1/orders", headers=credentials,
            json={"client_system": "agrosaas", "client_tenant_id": "fazenda-avulsa",
                  "external_reference": f"ordem-{uuid.uuid4()}", "correlation_id": f"corr-{uuid.uuid4()}",
                  "subject_type": "VEICULO", "tipo_pesagem": "UNICA", "contexto": {}},
        )
        assert order.status_code == 201, order.text
        reconciled = await api.post(
            f"/v1/weighings/{first_weighing['id']}/reconcile", headers=credentials,
            json={"status": "VINCULADA", "ordem_id": order.json()["id"]},
        )
        assert reconciled.status_code == 200, reconciled.text
        assert reconciled.json()["ordem_id"] == order.json()["id"]
