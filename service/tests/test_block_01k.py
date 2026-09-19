import uuid
from datetime import datetime, timezone, timedelta
import os
import sys
from pathlib import Path

os.environ.setdefault("TARA_DATABASE_URL", "postgresql+asyncpg://borgus:numsey01@192.168.0.3/farms")
os.environ.setdefault("TARA_API_KEY", "service-test")
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import httpx
import pytest
from sqlalchemy.ext.asyncio import async_sessionmaker
from sqlalchemy import select

from app.db import _engine, set_tenant_context
from app.main import app
from app.service import bootstrap_admin, create_api_client
from app.models import Estacao, OfflineCaptureAuthorization

@pytest.mark.asyncio
async def test_block_01_and_02_e2e():
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

        # Create Station A
        response = await client.post("/v1/stations", headers=admin_headers, json={"external_id": f"station-{uuid.uuid4()}", "nome": "Station A"})
        assert response.status_code == 201
        activation_code = response.json()["activation_code"]
        station_id = response.json()["id"]

        # Activate installation 1
        response = await client.post("/v1/stations/activate", headers=integration_headers, json={"activation_code": activation_code})
        assert response.status_code == 200
        inst1_token = response.json()["station_token"]
        inst1_id = response.json()["installation_id"]
        inst1_headers = {"Authorization": f"Bearer {inst1_token}"}

        # BLOCK-02: DeviceConfiguration and proof_key
        response = await client.post("/v1/stations/device-configurations", headers=inst1_headers, json={
            "installation_id": inst1_id,
            "bridge_url": "http://127.0.0.1:8321",
        })
        assert response.status_code == 201
        dev_config_1_id = response.json()["id"]
        bridge_proof_key = response.json()["bridge_proof_key"]
        assert bridge_proof_key is not None

        # Request Challenge
        response = await client.post("/v1/stations/bridge-validations/challenge", headers=inst1_headers, json={
            "device_configuration_id": dev_config_1_id
        })
        assert response.status_code == 201
        challenge_id = response.json()["challenge_id"]
        nonce = response.json()["nonce"]
        
        # Fetch challenge from DB to get exact expires_at
        async with async_sessionmaker(_engine, expire_on_commit=False)() as s:
            from app.models import BridgeChallenge
            ch = (await s.execute(select(BridgeChallenge).where(BridgeChallenge.id == uuid.UUID(challenge_id)))).scalar_one()
            expires_at = ch.expires_at.isoformat()
            
        canonical_challenge = f"{challenge_id}|{nonce}|{station_id}|{inst1_id}|{expires_at}"
        import hmac, hashlib
        proof = hmac.new(bridge_proof_key.encode(), canonical_challenge.encode(), hashlib.sha256).hexdigest()

        # Test Fake Key
        fake_key = "im_a_hacker"
        fake_proof = hmac.new(fake_key.encode(), canonical_challenge.encode(), hashlib.sha256).hexdigest()
        response = await client.post("/v1/stations/bridge-validations", headers=inst1_headers, json={
            "bridge_url": "http://127.0.0.1:8321",
            "challenge_id": challenge_id,
            "bridge_token_proof": fake_proof,
            "peso_kg": 100.0
        })
        assert response.status_code == 403 # Fake proof rejected

        # Submit Validation (Legitimate Proof)
        response = await client.post("/v1/stations/bridge-validations", headers=inst1_headers, json={
            "bridge_url": "http://127.0.0.1:8321",
            "challenge_id": challenge_id,
            "bridge_token_proof": proof,
            "peso_kg": 100.0
        })
        assert response.status_code == 201
        validation_id = response.json()["validation_id"]

        # Test Replay
        response = await client.post("/v1/stations/bridge-validations", headers=inst1_headers, json={
            "bridge_url": "http://127.0.0.1:8321",
            "challenge_id": challenge_id,
            "bridge_token_proof": proof,
            "peso_kg": 100.0
        })
        assert response.status_code == 422 # Replay rejected

        # BLOCK-01: Offline Capture Authorizations
        response = await client.post("/v1/stations/offline-authorizations/replenish", headers=inst1_headers, json={
            "device_configuration_id": dev_config_1_id,
            "count": 5
        })
        assert response.status_code == 201
        auths = response.json()["items"]
        assert len(auths) == 5
        a001 = auths[0]
        a002 = auths[1]

        p1_local_id = str(uuid.uuid4())
        p2_local_id = str(uuid.uuid4())
        p3_local_id = str(uuid.uuid4())

        # Subsitute Installation
        async with async_sessionmaker(_engine, expire_on_commit=False)() as s:
            await set_tenant_context(s, tenant_id)
            st = (await s.execute(select(Estacao).where(Estacao.id == uuid.UUID(station_id)))).scalar_one()
            st.activation_code = "87654321"
            await s.commit()

        response = await client.post("/v1/stations/activate", headers=integration_headers, json={"activation_code": "87654321"})
        assert response.status_code == 200
        inst2_token = response.json()["station_token"]
        inst2_id = response.json()["installation_id"]
        
        # Now I1 is REPLACED. Try to sync P1 and P2 with valid auths.
        response = await client.post("/v1/stations/sync/push", headers=inst1_headers, json={
            "items": [
                {
                    "local_id": p1_local_id,
                    "authorization_id": a001["id"],
                    "payload": {
                        "installation_id": inst1_id,
                        "device_configuration_id": dev_config_1_id,
                        "peso_aferido_kg": "100.0", "etapa": "UNICA", "captured_via": "MANUAL", "local_id": p1_local_id
                    }
                },
                {
                    "local_id": p2_local_id,
                    "authorization_id": a002["id"],
                    "payload": {
                        "installation_id": inst1_id,
                        "device_configuration_id": dev_config_1_id,
                        "peso_aferido_kg": "200.0", "etapa": "UNICA", "captured_via": "MANUAL", "local_id": p2_local_id
                    }
                }
            ]
        })
        assert response.status_code == 200
        res = response.json()["results"]
        assert res[0]["status"] == "CREATED"
        assert res[1]["status"] == "CREATED"

        # Reproducir ataque 01I: Try to sync P3 without auth or invalid auth
        response = await client.post("/v1/stations/sync/push", headers=inst1_headers, json={
            "items": [
                {
                    "local_id": p3_local_id,
                    "authorization_id": str(uuid.uuid4()), # Fake auth
                    "payload": {
                        "installation_id": inst1_id,
                        "device_configuration_id": dev_config_1_id,
                        "peso_aferido_kg": "300.0", "etapa": "UNICA", "captured_via": "MANUAL",
                        "data_pesagem": "2020-01-01T00:00:00Z", "local_id": p3_local_id # Retrodatado
                    }
                }
            ]
        })
        assert response.status_code == 200
        assert response.json()["results"][0]["status"] == "ERROR"
        assert "Autorização de captura inválida" in response.json()["results"][0]["error_message"]

        # Reutilization of auth
        response = await client.post("/v1/stations/sync/push", headers=inst1_headers, json={
            "items": [
                {
                    "local_id": str(uuid.uuid4()), # New local_id
                    "authorization_id": a001["id"], # Same Auth
                    "payload": {
                        "installation_id": inst1_id,
                        "device_configuration_id": dev_config_1_id,
                        "peso_aferido_kg": "100.0", "etapa": "UNICA", "captured_via": "MANUAL", "local_id": str(uuid.uuid4())
                    }
                }
            ]
        })
        assert response.status_code == 200
        assert response.json()["results"][0]["status"] == "ERROR"
        assert "já consumida por outra pesagem" in response.json()["results"][0]["error_message"]

        # Idempotence: Resend same P1
        response = await client.post("/v1/stations/sync/push", headers=inst1_headers, json={
            "items": [
                {
                    "local_id": p1_local_id, # Same local_id
                    "authorization_id": a001["id"], # Same Auth
                    "payload": {
                        "installation_id": inst1_id,
                        "device_configuration_id": dev_config_1_id,
                        "peso_aferido_kg": "100.0", "etapa": "UNICA", "captured_via": "MANUAL", "local_id": p1_local_id
                    }
                }
            ]
        })
        assert response.status_code == 200
        assert response.json()["results"][0]["status"] == "CREATED" # Handled gracefully (idempotent)

        # Try to replenish pool after REPLACED
        response = await client.post("/v1/stations/offline-authorizations/replenish", headers=inst1_headers, json={
            "device_configuration_id": dev_config_1_id,
            "count": 5
        })
        assert response.status_code == 403
        assert "Instalação inativa" in response.text
