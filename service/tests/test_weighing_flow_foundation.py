import os
import sys
import uuid
from decimal import Decimal
from pathlib import Path

import pytest
from sqlalchemy.ext.asyncio import async_sessionmaker
from sqlalchemy.exc import DBAPIError
from sqlalchemy import select

os.environ.setdefault("TARA_DATABASE_URL", "postgresql+asyncpg://borgus:numsey01@192.168.0.2/farms")
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.db import _engine, set_tenant_context
from app.models import Ordem, Pesagem
from app.operation import complete_weighing, create_order, list_official_marks, set_official_mark
from app.schemas import OfficialMarkIn, OrderIn, WeighingIn


def _capture(order_id, local_id, stage, value):
    return WeighingIn(
        ordem_id=order_id,
        local_id=local_id,
        etapa=stage,
        peso_aferido_kg=Decimal(value),
        captured_via="MANUAL",
        direcao_veiculo="ENTRADA",
        finalidade="OPERACIONAL",
        metodo_medicao="ESTATICA",
    )


@pytest.mark.asyncio
async def test_n_capture_foundation_and_official_marks():
    tenant_id = uuid.uuid4()
    other_tenant_id = uuid.uuid4()
    async with async_sessionmaker(_engine, expire_on_commit=False)() as session:
        await set_tenant_context(session, str(tenant_id))
        order = await create_order(session, tenant_id, OrderIn(
            client_system="foundation-test",
            client_tenant_id=str(tenant_id),
            external_reference=f"multi-{uuid.uuid4()}",
            correlation_id=str(uuid.uuid4()),
            subject_type="VEICULO",
            tipo_pesagem="MULTIPLA",
            natureza_operacao="RECEBIMENTO",
            modalidade="MULTIPLA",
            contexto={"source": "02B"},
        ))
        await session.flush()

        first = await complete_weighing(
            session, tenant_id, _capture(order.id, f"capture-{uuid.uuid4()}", "PRE_OPERACAO", "42000.000")
        )
        second = await complete_weighing(
            session, tenant_id, _capture(order.id, f"capture-{uuid.uuid4()}", "PRE_OPERACAO", "41999.500")
        )
        third = await complete_weighing(
            session, tenant_id, _capture(order.id, f"capture-{uuid.uuid4()}", "INTERMEDIARIA", "30000.000")
        )
        assert first.id != second.id != third.id
        assert order.status == "EM_PESAGEM"

        retry = await complete_weighing(
            session, tenant_id, _capture(order.id, first.local_id, "PRE_OPERACAO", "99999.000")
        )
        assert retry.id == first.id
        assert retry.peso_aferido_kg == Decimal("42000.000")
        assert len((await session.execute(
            select(Pesagem).where(Pesagem.ordem_id == order.id)
        )).scalars().all()) == 3

        mark = await set_official_mark(session, tenant_id, order.id, OfficialMarkIn(
            pesagem_id=first.id, etapa="PRE_OPERACAO"
        ))
        await session.flush()
        replacement = await set_official_mark(session, tenant_id, order.id, OfficialMarkIn(
            pesagem_id=second.id, etapa="PRE_OPERACAO"
        ))
        assert replacement.id == mark.id
        assert replacement.pesagem_id == second.id
        marks = await list_official_marks(session, tenant_id, order.id)
        assert len(marks) == 1

        with pytest.raises(ValueError, match="mesma Ordem e etapa"):
            await set_official_mark(session, tenant_id, order.id, OfficialMarkIn(
                pesagem_id=third.id, etapa="PRE_OPERACAO"
            ))

        other_order = await create_order(session, tenant_id, OrderIn(
            client_system="foundation-test", client_tenant_id=str(tenant_id),
            external_reference=f"other-{uuid.uuid4()}", correlation_id=str(uuid.uuid4()),
            subject_type="VEICULO", tipo_pesagem="MULTIPLA",
            natureza_operacao="EXPEDICAO", modalidade="MULTIPLA", contexto={},
        ))
        await session.flush()
        with pytest.raises(ValueError, match="mesma Ordem"):
            await set_official_mark(session, tenant_id, other_order.id, OfficialMarkIn(
                pesagem_id=second.id, etapa="PRE_OPERACAO"
            ))
        await session.commit()

    async with async_sessionmaker(_engine, expire_on_commit=False)() as session:
        await set_tenant_context(session, str(other_tenant_id))
        with pytest.raises(ValueError, match="Ordem não encontrada"):
            await set_official_mark(session, other_tenant_id, order.id, OfficialMarkIn(
                pesagem_id=second.id, etapa="PRE_OPERACAO"
            ))


@pytest.mark.asyncio
async def test_legacy_stage_uniqueness_and_capture_immutability_remain_intact():
    tenant_id = uuid.uuid4()
    async with async_sessionmaker(_engine, expire_on_commit=False)() as session:
        await set_tenant_context(session, str(tenant_id))
        order = await create_order(session, tenant_id, OrderIn(
            client_system="legacy-test", client_tenant_id=str(tenant_id),
            external_reference=f"legacy-{uuid.uuid4()}", correlation_id=str(uuid.uuid4()),
            subject_type="VEICULO", tipo_pesagem="DUPLA", contexto={},
        ))
        await session.flush()
        capture = await complete_weighing(
            session, tenant_id, _capture(order.id, f"legacy-{uuid.uuid4()}", "CHEGADA", "1000.000")
        )
        await session.commit()

    async with async_sessionmaker(_engine, expire_on_commit=False)() as session:
        await set_tenant_context(session, str(tenant_id))
        with pytest.raises(DBAPIError):
            await complete_weighing(
                session, tenant_id, _capture(order.id, f"legacy-{uuid.uuid4()}", "CHEGADA", "1001.000")
            )
        await session.rollback()
        await set_tenant_context(session, str(tenant_id))

        reloaded = await session.get(Pesagem, capture.id)
        assert reloaded is not None
        reloaded.peso_aferido_kg = Decimal("999.000")
        with pytest.raises(DBAPIError):
            await session.flush()
        await session.rollback()
        await set_tenant_context(session, str(tenant_id))

        historical = await session.get(Ordem, order.id)
        assert historical is not None
        assert historical.tipo_pesagem == "DUPLA"
        assert historical.modalidade is None
        assert historical.natureza_operacao is None
