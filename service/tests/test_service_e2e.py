import os
import sys
import uuid
from pathlib import Path

import httpx
import pytest
from sqlalchemy.ext.asyncio import async_sessionmaker

os.environ.setdefault(
    "TARA_DATABASE_URL",
    "postgresql+asyncpg://borgus:numsey01@192.168.0.2/farms",
)
os.environ.setdefault("TARA_API_KEY", "service-test")
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.db import _engine, set_tenant_context
from app.main import app
from app.service import bootstrap_admin, create_api_client


@pytest.mark.asyncio
async def test_standalone_service_order_station_weighing_observer_flow():
    tenant_id = str(uuid.uuid4())
    headers = {
        "X-Tenant-ID": tenant_id,
    }
    login = f"admin-{uuid.uuid4().hex[:8]}"
    password = "Senha-E2E-123"
    async with async_sessionmaker(_engine, expire_on_commit=False)() as session:
        await set_tenant_context(session, tenant_id)
        await bootstrap_admin(session, uuid.UUID(tenant_id), login, "Admin E2E", password)
        api_client, client_secret = await create_api_client(
            session,
            uuid.UUID(tenant_id),
            "AgroSaaS E2E",
            ["clients:write", "orders:write", "events:read", "stations:activate"],
            None,
        )
        await session.commit()

    client_id = api_client.client_id

    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app),
        base_url="http://balanca.test",
    ) as client:
        response = await client.post(
            "/v1/auth/login",
            json={"login": login, "password": password},
        )
        assert response.status_code == 200, response.text
        admin_headers = {
            "X-Tenant-ID": tenant_id,
            "Authorization": f"Bearer {response.json()['access_token']}",
        }
        integration_headers = {
            "X-Tenant-ID": tenant_id,
            "X-Balanca-Client-ID": client_id,
            "X-Balanca-Client-Secret": client_secret,
        }
        response = await client.post(
            "/v1/clients",
            headers=integration_headers,
            json={
                "sistema_cliente": "agrosaas",
                "tenant_cliente_id": f"fazenda-{uuid.uuid4()}",
                "nome_exibicao": "AgroSaaS E2E",
            },
        )
        assert response.status_code == 201, response.text

        response = await client.post(
            "/v1/orders",
            headers=integration_headers,
            json={
                "client_system": "agrosaas",
                "client_tenant_id": "fazenda-service-e2e",
                "external_reference": f"romaneio-{uuid.uuid4()}",
                "correlation_id": f"corr-{uuid.uuid4()}",
                "subject_type": "VEICULO",
                "tipo_pesagem": "UNICA",
                "contexto": {"placa": "ABC1D23"},
            },
        )
        assert response.status_code == 201, response.text
        order_id = response.json()["id"]

        response = await client.post(
            "/v1/stations",
            headers=admin_headers,
            json={"external_id": f"station-{uuid.uuid4()}", "nome": "Estação E2E"},
        )
        assert response.status_code == 201, response.text
        activation_code = response.json()["activation_code"]

        response = await client.post(
            "/v1/stations/activate",
            headers=integration_headers,
            json={"activation_code": activation_code},
        )
        assert response.status_code == 200, response.text
        station_headers = {
            "X-Tenant-ID": tenant_id,
            "Authorization": f"Bearer {response.json()['station_token']}",
        }

        response = await client.post(
            "/v1/operators",
            headers=admin_headers,
            json={"codigo": "OP-E2E", "nome_exibicao": "Operador E2E", "pin": "1234"},
        )
        assert response.status_code == 201, response.text
        operator_id = response.json()["id"]
        response = await client.get("/v1/stations/operators", headers=station_headers)
        assert response.status_code == 200, response.text
        assert response.json()[0]["id"] == operator_id
        response = await client.post(
            "/v1/stations/operators/login",
            headers=station_headers,
            json={"operador_id": operator_id, "pin": "1234"},
        )
        assert response.status_code == 200, response.text

        response = await client.post(
            "/v1/stations/sync/push",
            headers=station_headers,
            json={
                "items": [{
                    "local_id": str(uuid.uuid4()),
                    "payload": {
                        "ordem_id": order_id,
                        "etapa": "UNICA",
                        "peso_aferido_kg": "12000.000",
                        "peso_tara_kg": "1000.000",
                        "captured_via": "MANUAL",
                    },
                }],
            },
        )
        assert response.status_code == 200, response.text
        assert response.json()["results"][0]["status"] == "CREATED"

        response = await client.get("/v1/events?status=PENDENTE", headers=integration_headers)
        assert response.status_code == 200, response.text
        assert response.json()[0]["event_type"] == "balanca.pesagem.concluida.v1"

        # A credencial não pode ser usada em outro tenant e não substitui o
        # token humano do backoffice.
        wrong_tenant_headers = {**integration_headers, "X-Tenant-ID": str(uuid.uuid4())}
        response = await client.post(
            "/v1/orders", headers=wrong_tenant_headers, json={
                "client_system": "agrosaas", "client_tenant_id": "outro",
                "external_reference": "nao-deve-entrar", "correlation_id": "isolamento",
                "subject_type": "VEICULO", "tipo_pesagem": "UNICA", "contexto": {},
            },
        )
        assert response.status_code == 401, response.text
        response = await client.get("/v1/orders", headers=integration_headers)
        assert response.status_code in (401, 403), response.text

        response = await client.post(
            f"/v1/admin/api-clients/{client_id}/rotate", headers=admin_headers
        )
        assert response.status_code == 200, response.text
        rotated_secret = response.json()["client_secret"]
        response = await client.get("/v1/events", headers=integration_headers)
        assert response.status_code == 401, response.text
        rotated_headers = {**integration_headers, "X-Balanca-Client-Secret": rotated_secret}
        response = await client.get("/v1/events", headers=rotated_headers)
        assert response.status_code == 200, response.text
        response = await client.post(
            f"/v1/admin/api-clients/{client_id}/revoke", headers=admin_headers
        )
        assert response.status_code == 200, response.text
        response = await client.get("/v1/events", headers=rotated_headers)
        assert response.status_code == 401, response.text
