import base64
import json
import os
import sys
import uuid
from datetime import datetime, timezone
from pathlib import Path

import httpx
import pytest
from jose import jwk
from sqlalchemy.ext.asyncio import async_sessionmaker

os.environ.setdefault("TARA_DATABASE_URL", "postgresql+asyncpg://borgus:numsey01@192.168.0.2/farms")
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.contingency import canonical_payload
from app.db import _engine, set_tenant_context
from app.main import app
from app.service import bootstrap_admin, create_api_client, create_order, create_station
from app.schemas import OrderIn, StationIn


def b64(value: int) -> str:
    raw = value.to_bytes(32, "big")
    return base64.urlsafe_b64encode(raw).decode().rstrip("=")


def signed_package(tenant_id: str, station_id: str, order_id: str) -> dict:
    from cryptography.hazmat.primitives.asymmetric import ec

    private = ec.generate_private_key(ec.SECP256R1())
    numbers = private.private_numbers()
    public = numbers.public_numbers
    public_jwk = {"kty": "EC", "crv": "P-256", "x": b64(public.x), "y": b64(public.y)}
    private_jwk = {**public_jwk, "d": b64(numbers.private_value)}
    package = {
        "schema_version": "balanca.contingency.v1",
        "package_id": str(uuid.uuid4()),
        "sequence_number": 1,
        "tenant_id": tenant_id,
        "station_id": station_id,
        "device_id": station_id,
        "exported_at": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "station_public_key": public_jwk,
        "records": [{
            "local_id": str(uuid.uuid4()), "ordem_id": order_id, "subject_type": "VEICULO",
            "tipo_pesagem": "UNICA", "etapa": "UNICA", "numero_ticket": "CONT-001",
            "peso_informado_kg": "1000.000", "peso_aferido_kg": "1000.000", "peso_tara_kg": "0.000",
            "captured_via": "MANUAL", "leitura_bruta": None,
            "data_pesagem": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"), "contexto": {},
        }],
    }
    signature = jwk.construct(private_jwk, algorithm="ES256").sign(canonical_payload(package))
    package["signature"] = base64.urlsafe_b64encode(signature).decode().rstrip("=")
    return package


@pytest.mark.asyncio
async def test_import_contingency_is_signed_idempotent_and_tenant_scoped():
    tenant_id = str(uuid.uuid4())
    login = f"cont-{uuid.uuid4().hex[:8]}"
    password = "Senha-Contingencia-123"
    async with async_sessionmaker(_engine, expire_on_commit=False)() as session:
        await set_tenant_context(session, tenant_id)
        await bootstrap_admin(session, uuid.UUID(tenant_id), login, "Admin Contingência", password)
        api_client, secret = await create_api_client(session, uuid.UUID(tenant_id), "Cliente teste", ["orders:write"], None)
        station = await create_station(session, uuid.UUID(tenant_id), StationIn(external_id=f"cont-{uuid.uuid4()}", nome="Contingência"))
        order = await create_order(session, uuid.UUID(tenant_id), OrderIn(
            client_system="teste", client_tenant_id="fazenda", external_reference=str(uuid.uuid4()),
            correlation_id=str(uuid.uuid4()), subject_type="VEICULO", tipo_pesagem="UNICA", contexto={},
        ))
        await session.commit()

    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://balanca.test") as client:
        response = await client.post("/v1/auth/login", headers={"X-Tenant-ID": tenant_id}, json={"login": login, "password": password})
        assert response.status_code == 200, response.text
        admin = {"X-Tenant-ID": tenant_id, "Authorization": f"Bearer {response.json()['access_token']}"}
        package = signed_package(tenant_id, str(station.id), str(order.id))
        response = await client.post("/v1/contingency/import", headers=admin, json=package)
        assert response.status_code == 200, response.text
        assert response.json()["status"] == "IMPORTADO"
        # A captura importada mantém a origem física do pacote.
        response = await client.get("/v1/admin/weighings?limit=1", headers=admin)
        assert response.status_code == 200, response.text
        assert response.json()["items"][0]["estacao_id"] == str(station.id)
        response = await client.post("/v1/contingency/import", headers=admin, json=package)
        assert response.status_code == 200, response.text
        assert response.json()["message"] == "Pacote já processado"
        package["records"][0]["peso_aferido_kg"] = "2000.000"
        response = await client.post("/v1/contingency/import", headers=admin, json=package)
        assert response.status_code == 422, response.text
