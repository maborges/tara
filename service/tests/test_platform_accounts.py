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
from app.platform_identity import bootstrap_admin, get_account


@pytest.mark.asyncio
async def test_platform_admin_lists_accounts_across_tenants():
    admin_tenant = uuid.uuid4()
    second_tenant = uuid.uuid4()
    login = f"platform-{uuid.uuid4().hex[:8]}"
    password = "Senha-Plataforma-123"

    async with async_sessionmaker(_engine, expire_on_commit=False)() as session:
        await set_tenant_context(session, str(admin_tenant))
        await bootstrap_admin(session, admin_tenant, login, "Admin Plataforma", password)
        first = await get_account(session, admin_tenant)
        first.nome = "Conta principal do teste"
        await session.commit()

        await set_tenant_context(session, str(second_tenant))
        second = await get_account(session, second_tenant)
        second.nome = "Conta secundária do teste"
        await session.commit()

    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://balanca.test"
    ) as client:
        response = await client.post(
            "/v1/auth/login",
            json={"login": login, "password": password},
        )
        assert response.status_code == 200, response.text
        headers = {"Authorization": f"Bearer {response.json()['access_token']}"}

        response = await client.get("/v1/platform/accounts", headers=headers)
        assert response.status_code == 200, response.text
        accounts = {item["id"]: item for item in response.json()}

        response = await client.get("/v1/platform/dashboard", headers=headers)
        assert response.status_code == 200, response.text
        dashboard = response.json()

    assert str(first.id) in accounts
    assert str(second.id) in accounts
    assert accounts[str(second.id)]["nome"] == "Conta secundária do teste"
    assert dashboard["accounts_total"] >= 2
