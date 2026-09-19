import os
import sys
from pathlib import Path
os.environ.setdefault("TARA_DATABASE_URL", "postgresql+asyncpg://borgus:numsey01@192.168.0.3/farms")
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import pytest
import uuid
from datetime import datetime, timedelta
from httpx import ASGITransport, AsyncClient

from sqlalchemy.ext.asyncio import async_sessionmaker
from app.main import app
from app.db import _engine, set_tenant_context
from app.models import DeliveryReceipt, DeliveryTombstone, Pesagem
from tests.test_delivery_receipt_e2e import setup_account_and_client, create_weighing_with_receipt

# Import the logic from purge script
from purge_delivery import purge_delivery_receipts

AsyncSessionLocal = async_sessionmaker(_engine, expire_on_commit=False)

@pytest.mark.asyncio
async def test_delivery_purge_lifecycle():
    # Setup account A and B
    tenant_id_a, client_id_a, secret_a, internal_client_id_a, secret_id_a = await setup_account_and_client(["weighings:read", "delivery:read", "delivery:write"])
    tenant_id_b, client_id_b, secret_b, internal_client_id_b, secret_id_b = await setup_account_and_client(["weighings:read", "delivery:read", "delivery:write"])

    # Create weighings for Account A
    w1_id = await create_weighing_with_receipt(tenant_id_a, "PENDENTE")
    w2_id = await create_weighing_with_receipt(tenant_id_a, "PENDENTE")
    w3_id = await create_weighing_with_receipt(tenant_id_a, "PENDENTE")
    w4_id = await create_weighing_with_receipt(tenant_id_b, "PENDENTE") # Account B

    now = datetime.utcnow()
    
    # Manipulate DB to create scenarios:
    async with AsyncSessionLocal() as session:
        await set_tenant_context(session, str(tenant_id_a))
        # P1: PENDING (old) - Should not be purged
        from sqlalchemy import select
        r1 = (await session.execute(select(DeliveryReceipt).where(DeliveryReceipt.pesagem_id == w1_id))).scalar_one()
        r1.status = "PENDING"
        r1.created_at = now - timedelta(days=60)
        
        # P2: ACKNOWLEDGED (recent) - Should not be purged
        r2 = (await session.execute(select(DeliveryReceipt).where(DeliveryReceipt.pesagem_id == w2_id))).scalar_one()
        r2.status = "ACKNOWLEDGED"
        r2.acknowledged_at = now - timedelta(days=1)
        r2.acknowledged_by_api_client_id = internal_client_id_a
        
        # P3: ACKNOWLEDGED (old / eligible) - Should be purged
        r3 = (await session.execute(select(DeliveryReceipt).where(DeliveryReceipt.pesagem_id == w3_id))).scalar_one()
        r3.status = "ACKNOWLEDGED"
        r3.acknowledged_at = now - timedelta(days=60)
        r3.acknowledged_by_api_client_id = internal_client_id_a
        
        await session.commit()
        
        # Account B
        await set_tenant_context(session, str(tenant_id_b))
        r4 = (await session.execute(select(DeliveryReceipt).where(DeliveryReceipt.pesagem_id == w4_id))).scalar_one()
        r4.status = "ACKNOWLEDGED"
        r4.acknowledged_at = now - timedelta(days=60)
        r4.acknowledged_by_api_client_id = internal_client_id_b
        await session.commit()

    # Run purge script
    await purge_delivery_receipts(dry_run=False, limit=1000, batch_size=10)
    
    async with AsyncSessionLocal() as session:
        await set_tenant_context(session, str(tenant_id_a))
        # Verify P1 is intact
        r1_post = (await session.execute(select(DeliveryReceipt).where(DeliveryReceipt.pesagem_id == w1_id))).scalar_one_or_none()
        assert r1_post is not None
        assert r1_post.status == "PENDING"
        
        # Verify P2 is intact
        r2_post = (await session.execute(select(DeliveryReceipt).where(DeliveryReceipt.pesagem_id == w2_id))).scalar_one_or_none()
        assert r2_post is not None
        assert r2_post.status == "ACKNOWLEDGED"
        
        # Verify P3 is purged and tombstoned
        r3_post = (await session.execute(select(DeliveryReceipt).where(DeliveryReceipt.pesagem_id == w3_id))).scalar_one_or_none()
        assert r3_post is None
        
        from sqlalchemy import select
        result = await session.execute(select(DeliveryTombstone).where(DeliveryTombstone.pesagem_id == w3_id))
        tombstone3 = result.scalar_one_or_none()
        assert tombstone3 is not None
        assert tombstone3.tenant_id == tenant_id_a
        assert tombstone3.acknowledged_by_api_client_id == internal_client_id_a
        
        # Verify pesagem is not deleted (Strategy A)
        p3 = await session.get(Pesagem, w3_id)
        assert p3 is not None

    # Idempotency check: run purge again
    await purge_delivery_receipts(dry_run=False, limit=1000, batch_size=10)
    
    # Test POST /v1/delivery/ack ALREADY_PURGED behavior
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        headers_a = {"X-Balanca-Client-ID": str(client_id_a), "X-Balanca-Client-Secret": secret_a}
        headers_b = {"X-Balanca-Client-ID": str(client_id_b), "X-Balanca-Client-Secret": secret_b}
        
        # Account A acks P3 (purged)
        res_a = await client.post("/v1/delivery/ack", headers=headers_a, json={
            "weighing_ids": [str(w3_id)]
        })
        assert res_a.status_code == 200, res_a.json()
        assert res_a.json()["results"][0]["weighing_id"] == str(w3_id)
        assert res_a.json()["results"][0]["status"] == "ALREADY_PURGED"

        # Account A acks P4 (Account B's purged) -> should be NOT_FOUND due to RLS
        res_a_b = await client.post("/v1/delivery/ack", headers=headers_a, json={
            "weighing_ids": [str(w4_id)]
        })
        assert res_a_b.status_code == 200
        assert res_a_b.json()["results"][0]["status"] == "NOT_FOUND"
        
        # Account B acks P4
        res_b = await client.post("/v1/delivery/ack", headers=headers_b, json={
            "weighing_ids": [str(w4_id)]
        })
        assert res_b.status_code == 200
        assert res_b.json()["results"][0]["status"] == "ALREADY_PURGED"
