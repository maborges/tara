import asyncio
from app.db import AsyncSessionLocal
from app.models import ApiClient, ApiClientSecret, Cliente, Conta
import uuid
import hashlib
from datetime import datetime

async def seed():
    async with AsyncSessionLocal() as session:
        from sqlalchemy import select
        tenant_id = (await session.execute(select(Cliente.id).limit(1))).scalar_one_or_none()
        
        if not tenant_id:
            tenant_id = uuid.uuid4()
            cliente = Cliente(id=tenant_id, cpf_cnpj="00000000000000", status="ATIVO", razao_social="T", nome_fantasia="T")
            conta = Conta(tenant_id=tenant_id, is_active=True)
            session.add(cliente)
            session.add(conta)
            await session.commit()
            print("Created new tenant")
        
        client_id_uuid = uuid.uuid4()
        client_id = "client-id-da-estacao"
        api_client = ApiClient(
            id=client_id_uuid,
            tenant_id=tenant_id,
            client_id=client_id,
            nome="Estacao API Client",
            scopes=["stations:activate"],
            status="ATIVO"
        )
        session.add(api_client)
        
        secret_hash = hashlib.sha256(b"segredo-da-estacao").hexdigest()
        api_client_secret = ApiClientSecret(
            id=uuid.uuid4(),
            tenant_id=tenant_id,
            api_client_id=client_id_uuid,
            secret_hash=secret_hash,
            status="ATIVO",
            valid_from=datetime.utcnow()
        )
        session.add(api_client_secret)
        
        await session.commit()
        print("Seed successful! You can now use client-id-da-estacao and segredo-da-estacao")

asyncio.run(seed())
