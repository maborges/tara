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
from app.service import bootstrap_admin, create_api_client, update_operator_status, update_station_status


@pytest.mark.asyncio
async def test_standalone_service_order_station_weighing_observer_flow():
    tenant_id = str(uuid.uuid4())
    login = f"admin-{uuid.uuid4().hex[:8]}"
    password = "Senha-E2E-123"
    async with async_sessionmaker(_engine, expire_on_commit=False)() as session:
        await set_tenant_context(session, tenant_id)
        await bootstrap_admin(session, uuid.UUID(tenant_id), login, "Admin E2E", password)
        api_client, client_secret = await create_api_client(
            session,
            uuid.UUID(tenant_id),
            "AgroSaaS E2E",
            ["clients:write", "orders:write", "orders:read", "events:read", "weighings:read", "stations:activate"],
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
        station_id = response.json()["station_id"]
        installation_id = response.json()["installation_id"]
        device_configuration_id = response.json()["device_configuration_id"]
        station_headers = {
            "Authorization": f"Bearer {response.json()['station_token']}",
        }

        response = await client.post(
            "/v1/operators",
            headers=admin_headers,
            json={"codigo": "OP-E2E", "nome_exibicao": "Operador E2E", "pin": "1234"},
        )
        assert response.status_code == 201, response.text
        operator_id = response.json()["id"]
        response = await client.put(
            f"/v1/stations/{station_id}/operators/{operator_id}",
            headers=admin_headers,
        )
        assert response.status_code == 200, response.text
        response = await client.get("/v1/stations/operators", headers=station_headers)
        assert response.status_code == 200, response.text
        assert response.json()[0]["id"] == operator_id
        response = await client.post(
            "/v1/stations/operators/login",
            headers=station_headers,
            json={"operador_id": operator_id, "pin": "1234"},
        )
        assert response.status_code == 200, response.text

        async with async_sessionmaker(_engine, expire_on_commit=False)() as session:
            await set_tenant_context(session, tenant_id)
            await update_operator_status(session, uuid.UUID(tenant_id), uuid.UUID(operator_id), "INATIVO")
            await session.commit()
        response = await client.post(
            "/v1/stations/operators/login",
            headers=station_headers,
            json={"operador_id": operator_id, "pin": "1234"},
        )
        assert response.status_code == 401, response.text

        async with async_sessionmaker(_engine, expire_on_commit=False)() as session:
            await set_tenant_context(session, tenant_id)
            await update_operator_status(session, uuid.UUID(tenant_id), uuid.UUID(operator_id), "ATIVO")
            await session.commit()

        async with async_sessionmaker(_engine, expire_on_commit=False)() as session:
            await set_tenant_context(session, tenant_id)
            await update_station_status(session, uuid.UUID(tenant_id), uuid.UUID(station_id), "SUSPENSA")
            await session.commit()
        response = await client.get("/v1/stations/operators", headers=station_headers)
        assert response.status_code == 401, response.text

        async with async_sessionmaker(_engine, expire_on_commit=False)() as session:
            await set_tenant_context(session, tenant_id)
            await update_station_status(session, uuid.UUID(tenant_id), uuid.UUID(station_id), "ATIVA")
            await session.commit()

        # Activação do device
        response = await client.post("/v1/stations/device-configurations", headers=station_headers, json={
            "installation_id": installation_id,
            "bridge_url": "http://127.0.0.1:8321",
        })
        assert response.status_code == 201
        device_configuration_id = response.json()["id"]
        bridge_proof_key = response.json()["bridge_proof_key"]

        response = await client.post("/v1/stations/bridge-validations/challenge", headers=station_headers, json={
            "device_configuration_id": device_configuration_id
        })
        challenge_id = response.json()["challenge_id"]
        nonce = response.json()["nonce"]

        async with async_sessionmaker(_engine, expire_on_commit=False)() as s:
            from app.models import BridgeChallenge
            from sqlalchemy import select
            ch = (await s.execute(select(BridgeChallenge).where(BridgeChallenge.id == uuid.UUID(challenge_id)))).scalar_one()
            expires_at = ch.expires_at.isoformat()

        canonical_challenge = f"{challenge_id}|{nonce}|{station_id}|{installation_id}|{expires_at}"
        import hmac, hashlib
        proof = hmac.new(bridge_proof_key.encode(), canonical_challenge.encode(), hashlib.sha256).hexdigest()

        response = await client.post("/v1/stations/bridge-validations", headers=station_headers, json={
            "bridge_url": "http://127.0.0.1:8321",
            "challenge_id": challenge_id,
            "bridge_token_proof": proof,
            "peso_kg": 100.0
        })
        assert response.status_code == 201

        # Replenish offline authorizations
        response = await client.post("/v1/stations/offline-authorizations/replenish", headers=station_headers, json={
            "device_configuration_id": device_configuration_id,
            "count": 1
        })
        assert response.status_code == 201
        authorization_id = response.json()["items"][0]["id"]

        response = await client.post(
            "/v1/stations/sync/push",
            headers=station_headers,
            json={
                "items": [{
                    "local_id": str(uuid.uuid4()),
                    "authorization_id": authorization_id,
                    "payload": {
                        "ordem_id": order_id,
                        "installation_id": installation_id,
                        "device_configuration_id": device_configuration_id,
                        "etapa": "UNICA",
                        "peso_aferido_kg": "12000.000",
                        "peso_tara_kg": "1000.000",
                        "captured_via": "MANUAL",
                        "authorization_id": authorization_id,
                    },
                }],
            },
        )
        assert response.status_code == 200, response.text
        assert response.json()["results"][0]["status"] == "CREATED"

        response = await client.get("/v1/weighings?limit=1", headers=integration_headers)
        assert response.status_code == 200, response.text
        assert response.json()["items"][0]["estacao_id"] == station_id

        # Uma pesagem dupla só conclui a ordem e publica o evento após a
        # etapa final; a primeira captura mantém a operação em andamento.
        response = await client.post(
            "/v1/orders", headers=integration_headers, json={
                "client_system": "agrosaas", "client_tenant_id": "fazenda-service-e2e",
                "external_reference": f"dupla-{uuid.uuid4()}", "correlation_id": f"dupla-{uuid.uuid4()}",
                "subject_type": "VEICULO", "tipo_pesagem": "DUPLA", "contexto": {},
            },
        )
        assert response.status_code == 201, response.text
        double_order_id = response.json()["id"]
        response = await client.post(
            "/v1/stations/pesagens", headers=station_headers, json={
                "ordem_id": double_order_id, "local_id": str(uuid.uuid4()), "etapa": "CHEGADA",
                "peso_aferido_kg": "13000.000", "peso_tara_kg": "1000.000",
            },
        )
        assert response.status_code == 201, response.text
        response = await client.get("/v1/orders", headers=integration_headers)
        double_order = next(item for item in response.json()["items"] if item["id"] == double_order_id)
        assert double_order["status"] == "EM_PESAGEM"
        response = await client.post(
            "/v1/stations/pesagens", headers=station_headers, json={
                "ordem_id": double_order_id, "local_id": str(uuid.uuid4()), "etapa": "SAIDA",
                "peso_aferido_kg": "9000.000", "peso_tara_kg": "1000.000",
            },
        )
        assert response.status_code == 201, response.text
        response = await client.get("/v1/orders", headers=integration_headers)
        double_order = next(item for item in response.json()["items"] if item["id"] == double_order_id)
        assert double_order["status"] == "CONCLUIDA"

        response = await client.get("/v1/events?status=PENDENTE", headers=integration_headers)
        assert response.status_code == 200, response.text
        assert response.json()[0]["event_type"] == "balanca.pesagem.concluida.v1"

        # A credencial resolve o tenant sem depender de um header externo.
        response = await client.post(
            "/v1/orders", headers=integration_headers, json={
                "client_system": "agrosaas", "client_tenant_id": "fazenda-service-e2e",
                "external_reference": f"sem-tenant-{uuid.uuid4()}", "correlation_id": f"sem-tenant-{uuid.uuid4()}",
                "subject_type": "VEICULO", "tipo_pesagem": "UNICA", "contexto": {},
            },
        )
        assert response.status_code == 201, response.text
        response = await client.get("/v1/orders", headers=integration_headers)
        assert response.status_code == 200, response.text
        assert any(item["id"] == order_id for item in response.json()["items"])

        response = await client.get("/v1/admin/orders", headers=admin_headers)
        assert response.status_code == 200, response.text
        assert any(item["id"] == order_id for item in response.json())

        response = await client.post(
            f"/v1/admin/api-clients/{client_id}/rotate", headers=admin_headers
        )
        assert response.status_code == 200, response.text
        rotated_secret = response.json()["client_secret"]
        # O segredo anterior permanece válido durante a janela de transição
        # documentada; o novo segredo também deve autenticar normalmente.
        response = await client.get("/v1/events", headers=integration_headers)
        assert response.status_code == 200, response.text
        rotated_headers = {**integration_headers, "X-Balanca-Client-Secret": rotated_secret}
        response = await client.get("/v1/events", headers=rotated_headers)
        assert response.status_code == 200, response.text
        response = await client.post(
            f"/v1/admin/api-clients/{client_id}/revoke", headers=admin_headers
        )
        assert response.status_code == 200, response.text
        response = await client.get("/v1/events", headers=rotated_headers)
        assert response.status_code == 401, response.text
