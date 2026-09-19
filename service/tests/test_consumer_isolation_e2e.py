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

from app.db import _engine, set_tenant_context
from app.main import app
from app.models import ApiClient, Conta, Ordem, ApiClientSecret
from sqlalchemy import select, insert

async def setup_account_and_client(scopes, expires_at=None):
    async with async_sessionmaker(_engine, expire_on_commit=False)() as session:
        from app.service import create_api_client
        tenant_id = uuid.uuid4()
        await set_tenant_context(session, str(tenant_id))
        session.add(Conta(id=tenant_id, tenant_id=tenant_id, nome=f"Account {tenant_id}", status="ATIVA"))
        await session.flush()
        api_client, client_secret = await create_api_client(session, tenant_id, f"Client {tenant_id}", scopes, expires_at)
        await session.commit()
        return tenant_id, api_client.client_id, client_secret, api_client.id

async def create_dummy_order(tenant_id):
    async with async_sessionmaker(_engine, expire_on_commit=False)() as session:
        from app.models import Cliente
        order_id = uuid.uuid4()
        cliente_id = uuid.uuid4()
        await set_tenant_context(session, str(tenant_id))
        session.add(Cliente(
            id=cliente_id,
            tenant_id=tenant_id,
            conta_id=tenant_id,
            sistema_cliente="sys",
            tenant_cliente_id="ext-t",
            nome_exibicao="Client 001",
            status="ATIVO",
        ))
        session.add(Ordem(
            id=order_id,
            tenant_id=tenant_id,
            cliente_id=cliente_id,
            sistema_cliente="sys",
            tenant_cliente_id="ext-t",
            referencia_externa=str(uuid.uuid4()),
            correlation_id=str(uuid.uuid4()),
            subject_type="VEICULO",
            tipo_pesagem="UNICA",
            contexto={},
            status="PENDENTE",
            created_at=datetime.utcnow()
        ))
        await session.commit()
        return order_id

@pytest.mark.asyncio
async def test_auth_scenarios():
    # Valid
    t1, client_id, secret, db_id = await setup_account_and_client(["orders:read"])
    # Expired
    t2, client_id_exp, secret_exp, _ = await setup_account_and_client(["orders:read"], datetime.utcnow() - timedelta(minutes=5))
    
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://balanca.test") as client:
        # Valid
        r = await client.get("/v1/orders", headers={"X-Balanca-Client-ID": client_id, "X-Balanca-Client-Secret": secret})
        assert r.status_code == 200

        # Invalid secret
        r = await client.get("/v1/orders", headers={"X-Balanca-Client-ID": client_id, "X-Balanca-Client-Secret": "wrong"})
        assert r.status_code == 401

        # Expired
        r = await client.get("/v1/orders", headers={"X-Balanca-Client-ID": client_id_exp, "X-Balanca-Client-Secret": secret_exp})
        assert r.status_code == 401

        # Revoked
        async with async_sessionmaker(_engine, expire_on_commit=False)() as session:
            await set_tenant_context(session, str(t1))
            db_cli = (await session.execute(select(ApiClient).where(ApiClient.id == db_id))).scalar_one()
            db_cli.status = "REVOGADO"
            await session.commit()
        r = await client.get("/v1/orders", headers={"X-Balanca-Client-ID": client_id, "X-Balanca-Client-Secret": secret})
        assert r.status_code == 401

@pytest.mark.asyncio
async def test_isolation_and_spoof():
    t_a, id_a, sec_a, _ = await setup_account_and_client(["orders:read"])
    t_b, id_b, sec_b, _ = await setup_account_and_client(["orders:read"])
    
    o_a = await create_dummy_order(t_a)
    o_b = await create_dummy_order(t_b)

    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://balanca.test") as client:
        # Credential A -> reads orders
        r_a = await client.get("/v1/orders", headers={"X-Balanca-Client-ID": id_a, "X-Balanca-Client-Secret": sec_a})
        assert r_a.status_code == 200
        items_a = r_a.json()["items"]
        assert len(items_a) == 1
        assert items_a[0]["id"] == str(o_a)

        # Spoof attempt: Credential A sending X-Tenant-ID of B
        r_spoof = await client.get("/v1/orders", headers={
            "X-Balanca-Client-ID": id_a,
            "X-Balanca-Client-Secret": sec_a,
            "X-Tenant-ID": str(t_b)
        })
        assert r_spoof.status_code == 200
        items_spoof = r_spoof.json()["items"]
        assert len(items_spoof) == 1
        assert items_spoof[0]["id"] == str(o_a) # Still gets A! X-Tenant-ID is securely ignored.

        # Spoof attempt via Query param. The API doesn't accept tenant_id in query for GET /orders
        r_spoof2 = await client.get(f"/v1/orders?tenant_id={str(t_b)}", headers={
            "X-Balanca-Client-ID": id_a,
            "X-Balanca-Client-Secret": sec_a
        })
        assert r_spoof2.status_code == 200
        assert r_spoof2.json()["items"][0]["id"] == str(o_a)

@pytest.mark.asyncio
async def test_rotation():
    tenant_id, id_a, sec_a, db_id = await setup_account_and_client(["orders:read"])
    async with async_sessionmaker(_engine, expire_on_commit=False)() as session:
        # Rotate logic manually to test secrets (API Client has two active secrets)
        from app.service import rotate_api_client
        await set_tenant_context(session, str(tenant_id))
        _, sec_b = await rotate_api_client(session, tenant_id, id_a)
        await session.commit()

    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://balanca.test") as client:
        # Both work
        r_a = await client.get("/v1/orders", headers={"X-Balanca-Client-ID": id_a, "X-Balanca-Client-Secret": sec_a})
        assert r_a.status_code == 200
        r_b = await client.get("/v1/orders", headers={"X-Balanca-Client-ID": id_a, "X-Balanca-Client-Secret": sec_b})
        assert r_b.status_code == 200

        # Now revoke sec_a manually
        async with async_sessionmaker(_engine, expire_on_commit=False)() as session:
            await set_tenant_context(session, str(tenant_id))
            from sqlalchemy import update
            import hashlib
            secret_hash_a = hashlib.sha256(sec_a.encode()).hexdigest()
            await session.execute(update(ApiClientSecret).where(ApiClientSecret.secret_hash == secret_hash_a).values(status="REVOGADO"))
            await session.commit()

        # sec_a should fail, sec_b should still work
        r_a2 = await client.get("/v1/orders", headers={"X-Balanca-Client-ID": id_a, "X-Balanca-Client-Secret": sec_a})
        assert r_a2.status_code == 401
        r_b2 = await client.get("/v1/orders", headers={"X-Balanca-Client-ID": id_a, "X-Balanca-Client-Secret": sec_b})
        assert r_b2.status_code == 200
