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
from sqlalchemy import select, insert

from app.db import _engine, set_tenant_context
from app.main import app
from app.models import Conta, ApiClient, ApiClientSecret, Pesagem, Ordem, Outbox, DeliveryReceipt
from app.security import hash_password

async def setup_account_and_client(scopes):
    async with async_sessionmaker(_engine, expire_on_commit=False)() as session:
        from app.platform_identity import create_api_client
        tenant_id = uuid.uuid4()
        await set_tenant_context(session, str(tenant_id))
        session.add(Conta(id=tenant_id, tenant_id=tenant_id, nome=f"Account {tenant_id}", status="ATIVA"))
        await session.flush()
        api_client, client_secret = await create_api_client(session, tenant_id, f"Client {tenant_id}", scopes, None)
        await session.commit()
        
        # Get the secret ID to assert later
        secret_id = (await session.execute(select(ApiClientSecret.id).where(ApiClientSecret.api_client_id == api_client.id))).scalar_one()
        return tenant_id, api_client.client_id, client_secret, api_client.id, secret_id

async def create_weighing_with_receipt(tenant_id, status="PENDENTE"):
    async with async_sessionmaker(_engine, expire_on_commit=False)() as session:
        await set_tenant_context(session, str(tenant_id))
        wid = uuid.uuid4()
        p = Pesagem(
            id=wid, tenant_id=tenant_id, local_id=f"loc_{wid.hex[:8]}", etapa="UNICA",
            peso_aferido_kg=1000, captured_via="MANUAL", captured_at=datetime.utcnow(),
            reconciliation_status="NAO_APLICAVEL", contexto={}
        )
        session.add(p)
        await session.flush()
        
        payload = {"event_type": "balanca.pesagem.concluida.v1", "pesagem_id": str(wid)}
        
        r = DeliveryReceipt(
            id=uuid.uuid4(), tenant_id=tenant_id, conta_id=tenant_id, pesagem_id=wid,
            payload=payload, status=status, created_at=datetime.utcnow(),
        )
        session.add(r)
        await session.commit()
        return wid

@pytest.mark.asyncio
async def test_delivery_pull_and_ack_lifecycle():
    tenant_id_a, client_id_a, secret_a, internal_client_id_a, secret_id_a = await setup_account_and_client(["weighings:read", "delivery:read", "delivery:write"])
    tenant_id_b, client_id_b, secret_b, internal_client_id_b, secret_id_b = await setup_account_and_client(["weighings:read", "delivery:read", "delivery:write"])

    w1_id = await create_weighing_with_receipt(tenant_id_a, "PENDENTE")
    w2_id = await create_weighing_with_receipt(tenant_id_a, "PENDENTE")
    w3_id = await create_weighing_with_receipt(tenant_id_b, "PENDENTE")

    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        # 1. PULL Idempotent
        headers_a = {"X-Balanca-Client-ID": str(client_id_a), "X-Balanca-Client-Secret": secret_a}
        headers_b = {"X-Balanca-Client-ID": str(client_id_b), "X-Balanca-Client-Secret": secret_b}
        
        res1 = await client.get("/v1/delivery/pending", headers=headers_a)
        assert res1.status_code == 200, res1.json()
        data1 = res1.json()
        assert len(data1["items"]) == 2
        w_ids = {item["weighing_id"] for item in data1["items"]}
        assert str(w1_id) in w_ids
        assert str(w2_id) in w_ids
        assert str(w3_id) not in w_ids # RLS hides B's weighing

        # Pull again (should return exactly the same, no status changed)
        res2 = await client.get("/v1/delivery/pending", headers=headers_a)
        assert res2.json() == data1

        # 2. ACK explícito
        ack_res = await client.post("/v1/delivery/ack", headers=headers_a, json={
            "weighing_ids": [str(w1_id)]
        })
        assert ack_res.status_code == 200
        ack_data = ack_res.json()
        assert len(ack_data["results"]) == 1
        assert ack_data["results"][0]["weighing_id"] == str(w1_id)
        assert ack_data["results"][0]["status"] == "ACKNOWLEDGED"

        # 3. Pull again (w1 should be gone)
        res3 = await client.get("/v1/delivery/pending", headers=headers_a)
        assert len(res3.json()["items"]) == 1
        assert res3.json()["items"][0]["weighing_id"] == str(w2_id)

        # 4. ACK idempotente
        ack_res_2 = await client.post("/v1/delivery/ack", headers=headers_a, json={
            "weighing_ids": [str(w1_id)]
        })
        assert ack_res_2.status_code == 200
        assert ack_res_2.json()["results"][0]["status"] == "ALREADY_ACKNOWLEDGED"

        # Check DB state
        async with async_sessionmaker(_engine, expire_on_commit=False)() as session:
            await set_tenant_context(session, str(tenant_id_a))
            r1 = (await session.execute(select(DeliveryReceipt).where(DeliveryReceipt.pesagem_id == w1_id))).scalar_one()
            assert r1.status == "ACKNOWLEDGED"
            assert r1.acknowledged_at is not None
            assert r1.acknowledged_by_api_client_id == internal_client_id_a

        # 5. Cross-account attempt (Account A tries to ACK B's weighing)
        cross_ack = await client.post("/v1/delivery/ack", headers=headers_a, json={
            "weighing_ids": [str(w3_id)]
        })
        assert cross_ack.status_code == 200
        assert cross_ack.json()["results"][0]["status"] == "NOT_FOUND" # RLS hides B's receipt

        # Account B Pull (should still see w3)
        res_b = await client.get("/v1/delivery/pending", headers=headers_b)
        assert len(res_b.json()["items"]) == 1
        assert res_b.json()["items"][0]["weighing_id"] == str(w3_id)
