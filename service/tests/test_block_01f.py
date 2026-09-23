import uuid
from datetime import datetime, timezone
from decimal import Decimal
import os
import sys
from pathlib import Path

os.environ.setdefault("TARA_DATABASE_URL", "postgresql+asyncpg://borgus:numsey01@192.168.0.2/farms")
os.environ.setdefault("TARA_API_KEY", "service-test")
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import httpx
import pytest
from sqlalchemy.ext.asyncio import async_sessionmaker

from app.db import _engine, set_tenant_context
from app.main import app
from app.service import bootstrap_admin, create_api_client, create_station, create_order
from app.schemas import StationIn, OrderIn
from app.contingency import canonical_payload
import base64
from jose import jwk


def b64(value: int) -> str:
    raw = value.to_bytes(32, "big")
    return base64.urlsafe_b64encode(raw).decode().rstrip("=")

def signed_package_v2(tenant_id: str, station_id: str, order_id: str, installation_id: str, device_config_id: str) -> dict:
    from cryptography.hazmat.primitives.asymmetric import ec
    private = ec.generate_private_key(ec.SECP256R1())
    numbers = private.private_numbers()
    public = numbers.public_numbers
    public_jwk = {"kty": "EC", "crv": "P-256", "x": b64(public.x), "y": b64(public.y)}
    private_jwk = {**public_jwk, "d": b64(numbers.private_value)}
    package = {
        "schema_version": "balanca.contingency.v2",
        "package_id": str(uuid.uuid4()),
        "sequence_number": 1,
        "tenant_id": tenant_id,
        "station_id": station_id,
        "device_id": station_id,
        "exported_at": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "station_public_key": public_jwk,
        "records": [{
            "installation_id": installation_id,
            "device_configuration_id": device_config_id,
            "local_id": str(uuid.uuid4()), "ordem_id": order_id, "subject_type": "VEICULO",
            "tipo_pesagem": "UNICA", "etapa": "UNICA", "numero_ticket": "CONT-002",
            "peso_informado_kg": "1000.000", "peso_aferido_kg": "1000.000", "peso_tara_kg": "0.000",
            "captured_via": "MANUAL", "leitura_bruta": None,
            "data_pesagem": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"), "contexto": {},
        }],
    }
    signature = jwk.construct(private_jwk, algorithm="ES256").sign(canonical_payload(package))
    package["signature"] = base64.urlsafe_b64encode(signature).decode().rstrip("=")
    return package


@pytest.mark.asyncio
async def test_block_01_replaced_station_online_barriers():
    tenant_id = str(uuid.uuid4())
    login = f"admin-{uuid.uuid4().hex[:8]}"
    async with async_sessionmaker(_engine, expire_on_commit=False)() as session:
        await set_tenant_context(session, tenant_id)
        await bootstrap_admin(session, uuid.UUID(tenant_id), login, "Admin E2E", "Senha-E2E-123")
        api_client, client_secret = await create_api_client(session, uuid.UUID(tenant_id), "AgroSaaS E2E", ["stations:activate"], None)
        await session.commit()
    
    integration_headers = {"X-Balanca-Client-ID": api_client.client_id, "X-Balanca-Client-Secret": client_secret}
    
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://balanca.test") as client:
        # Create an admin token
        response = await client.post("/v1/auth/login", headers={"X-Tenant-ID": tenant_id}, json={"login": login, "password": "Senha-E2E-123"})
        admin_headers = {"X-Tenant-ID": tenant_id, "Authorization": f"Bearer {response.json()['access_token']}"}

        response = await client.post("/v1/stations", headers=admin_headers, json={"external_id": f"station-{uuid.uuid4()}", "nome": "Estação 1"})
        assert response.status_code == 201
        activation_code = response.json()["activation_code"]
        station_id = response.json()["id"]

        # Activate installation 1
        response = await client.post("/v1/stations/activate", headers=integration_headers, json={"activation_code": activation_code})
        assert response.status_code == 200
        inst1_token = response.json()["station_token"]
        inst1_headers = {"Authorization": f"Bearer {inst1_token}"}

        # Generate a new activation code manually in db
        async with async_sessionmaker(_engine, expire_on_commit=False)() as s:
            await set_tenant_context(s, tenant_id)
            from app.models import Estacao
            from sqlalchemy import select
            st = (await s.execute(select(Estacao).where(Estacao.id == uuid.UUID(station_id)))).scalar_one()
            st.activation_code = "12345678"
            await s.commit()
        new_activation_code = "12345678"

        # Activate installation 2 (this replaces installation 1)
        response = await client.post("/v1/stations/activate", headers=integration_headers, json={"activation_code": new_activation_code})
        assert response.status_code == 200

        # Now installation 1 is REPLACED. It should fail to access /sync/pull
        response = await client.get("/v1/stations/sync/pull", headers=inst1_headers)
        assert response.status_code == 403
        assert "Instalação substituída" in response.text

        # But it should be able to push backlog
        response = await client.post("/v1/stations/sync/push", headers=inst1_headers, json={
            "items": [{"local_id": str(uuid.uuid4()), "payload": {"peso_aferido_kg": "100.0", "etapa": "UNICA", "captured_via": "MANUAL", "local_id": "test"}}]
        })
        assert response.status_code == 200


@pytest.mark.asyncio
async def test_block_02_bridge_validation_without_backend_http():
    tenant_id = str(uuid.uuid4())
    login = f"admin-{uuid.uuid4().hex[:8]}"
    async with async_sessionmaker(_engine, expire_on_commit=False)() as session:
        await set_tenant_context(session, tenant_id)
        await bootstrap_admin(session, uuid.UUID(tenant_id), login, "Admin E2E", "Senha-E2E-123")
        api_client, client_secret = await create_api_client(session, uuid.UUID(tenant_id), "AgroSaaS E2E", ["stations:activate"], None)
        await session.commit()
    
    integration_headers = {"X-Balanca-Client-ID": api_client.client_id, "X-Balanca-Client-Secret": client_secret}
    
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://balanca.test") as client:
        response = await client.post("/v1/auth/login", headers={"X-Tenant-ID": tenant_id}, json={"login": login, "password": "Senha-E2E-123"})
        admin_headers = {"X-Tenant-ID": tenant_id, "Authorization": f"Bearer {response.json()['access_token']}"}

        response = await client.post("/v1/stations", headers=admin_headers, json={"external_id": f"station-{uuid.uuid4()}", "nome": "Estação 1"})
        activation_code = response.json()["activation_code"]
        response = await client.post("/v1/stations/activate", headers=integration_headers, json={"activation_code": activation_code})
        station_token = response.json()["station_token"]
        installation_id = response.json()["installation_id"]
        station_id = response.json()["station_id"]

        station_headers = {"Authorization": f"Bearer {station_token}"}
        
        # Create device config to get proof key
        response = await client.post("/v1/stations/device-configurations", headers=station_headers, json={
            "installation_id": installation_id,
            "bridge_url": "http://127.0.0.1:8321",
        })
        assert response.status_code == 201
        dev_config_id = response.json()["id"]
        bridge_proof_key = response.json()["bridge_proof_key"]

        # Request challenge
        response = await client.post("/v1/stations/bridge-validations/challenge", headers=station_headers, json={
            "device_configuration_id": dev_config_id
        })
        assert response.status_code == 201
        challenge_id = response.json()["challenge_id"]
        nonce = response.json()["nonce"]

        # Fetch expires_at from DB
        async with async_sessionmaker(_engine, expire_on_commit=False)() as s:
            from app.models import BridgeChallenge
            from sqlalchemy import select
            ch = (await s.execute(select(BridgeChallenge).where(BridgeChallenge.id == uuid.UUID(challenge_id)))).scalar_one()
            expires_at = ch.expires_at.isoformat()

        canonical_challenge = f"{challenge_id}|{nonce}|{station_id}|{installation_id}|{expires_at}"
        import hmac, hashlib
        proof = hmac.new(bridge_proof_key.encode(), canonical_challenge.encode(), hashlib.sha256).hexdigest()

        # Submit validation
        response = await client.post("/v1/stations/bridge-validations", headers=station_headers, json={
            "bridge_url": "http://127.0.0.1:8321",
            "challenge_id": challenge_id,
            "bridge_token_proof": proof,
            "peso_kg": 100.0
        })
        assert response.status_code == 201
        validation_id = response.json()["validation_id"]

        # Test creating device configuration using this validation id (now it should remain PENDING until explicitly challenged)
        response = await client.post("/v1/stations/device-configurations", headers=station_headers, json={
            "installation_id": installation_id,
            "bridge_url": "http://127.0.0.1:8321",
            "validation_id": validation_id
        })
        assert response.status_code == 201
        assert response.json()["status"] == "PENDING"
        assert response.json()["bridge_url"] == "http://127.0.0.1:8321"


@pytest.mark.asyncio
async def test_block_03_contingency_v2_validation():
    tenant_id = str(uuid.uuid4())
    login = f"admin-{uuid.uuid4().hex[:8]}"
    async with async_sessionmaker(_engine, expire_on_commit=False)() as session:
        await set_tenant_context(session, tenant_id)
        await bootstrap_admin(session, uuid.UUID(tenant_id), login, "Admin", "Senha-E2E-123")
        api_client, client_secret = await create_api_client(session, uuid.UUID(tenant_id), "AgroSaaS", ["stations:activate", "orders:write"], None)
        station = await create_station(session, uuid.UUID(tenant_id), StationIn(external_id=f"station-{uuid.uuid4()}", nome="Estação 1"))
        order = await create_order(session, uuid.UUID(tenant_id), OrderIn(client_system="test", client_tenant_id="test", external_reference="ref1", correlation_id="c1", subject_type="VEICULO", tipo_pesagem="UNICA"))
        await session.commit()
    
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://balanca.test") as client:
        # Create an admin token for contingency import
        response = await client.post("/v1/auth/login", headers={"X-Tenant-ID": tenant_id}, json={"login": login, "password": "Senha-E2E-123"})
        admin_headers = {"X-Tenant-ID": tenant_id, "Authorization": f"Bearer {response.json()['access_token']}"}

        # Sign a package with bad installation_id (some random UUID)
        bad_inst_id = str(uuid.uuid4())
        bad_dev_id = str(uuid.uuid4())
        package = signed_package_v2(tenant_id, str(station.id), str(order.id), bad_inst_id, bad_dev_id)
        
        response = await client.post("/v1/contingency/import", headers=admin_headers, json=package)
        assert response.status_code == 200
        
        # It should be rejected because the installation does not belong to the station
        assert response.json()["results"][0]["status"] == "REJEITADO"
        assert "Instalação não pertence" in response.json()["results"][0]["error_message"]
