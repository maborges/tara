import asyncio
import getpass
import os
import uuid

from sqlalchemy.ext.asyncio import async_sessionmaker

from app.db import _engine, set_tenant_context
from app.service import bootstrap_admin


async def main() -> None:
    tenant_value = os.environ.get("BALANCA_BOOTSTRAP_TENANT_ID")
    if not tenant_value:
        raise RuntimeError(
            "BALANCA_BOOTSTRAP_TENANT_ID é necessário para vincular o "
            "administrador às operações iniciais da conta"
        )
    tenant_id = uuid.UUID(tenant_value)
    login = input("Login do administrador Balança: ").strip()
    nome = input("Nome exibido: ").strip()
    password = getpass.getpass("Senha (mínimo 8 caracteres): ")
    async with async_sessionmaker(_engine, expire_on_commit=False)() as session:
        await set_tenant_context(session, str(tenant_id))
        await bootstrap_admin(session, tenant_id, login, nome, password)
        await session.commit()
    await _engine.dispose()
    print("Administrador da Balança criado.")


if __name__ == "__main__":
    asyncio.run(main())
