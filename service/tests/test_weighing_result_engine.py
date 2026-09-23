import os
import sys
import uuid
from decimal import Decimal
from pathlib import Path

import pytest
from sqlalchemy import select
from sqlalchemy.exc import DBAPIError
from sqlalchemy.ext.asyncio import async_sessionmaker

os.environ.setdefault("TARA_DATABASE_URL", "postgresql+asyncpg://borgus:numsey01@192.168.0.2/farms")
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.db import _engine, set_tenant_context
from app.models import Ordem, OrdemResultadoHistorico, Pesagem
from app.operation import complete_weighing, create_order, list_result_history, set_official_mark
from app.schemas import OfficialMarkIn, OrderIn, WeighingIn


def _capture(order_id, stage, value, finalidade="OPERACIONAL"):
    return WeighingIn(
        ordem_id=order_id,
        local_id=f"result-{uuid.uuid4()}",
        etapa=stage,
        peso_aferido_kg=Decimal(value),
        captured_via="MANUAL",
        direcao_veiculo="ENTRADA",
        finalidade=finalidade,
        metodo_medicao="ESTATICA",
    )


async def _new_order(session, tenant_id, nature):
    return await create_order(session, tenant_id, OrderIn(
        client_system="02C-test",
        client_tenant_id=str(tenant_id),
        external_reference=f"result-{uuid.uuid4()}",
        correlation_id=str(uuid.uuid4()),
        subject_type="VEICULO",
        tipo_pesagem="MULTIPLA",
        natureza_operacao=nature,
        modalidade="MULTIPLA",
        contexto={},
    ))


async def _mark(session, tenant_id, order_id, weight, stage):
    return await set_official_mark(
        session, tenant_id, order_id,
        OfficialMarkIn(pesagem_id=weight.id, etapa=stage),
    )


@pytest.mark.asyncio
async def test_recebimento_uses_only_official_pre_pos_and_auxiliary_deltas():
    tenant_id = uuid.uuid4()
    async with async_sessionmaker(_engine, expire_on_commit=False)() as session:
        await set_tenant_context(session, str(tenant_id))
        order = await _new_order(session, tenant_id, "RECEBIMENTO")
        chegada = await complete_weighing(session, tenant_id, _capture(order.id, "CHEGADA", "43000"))
        pre = await complete_weighing(session, tenant_id, _capture(order.id, "PRE_OPERACAO", "42000"))
        intermediate = await complete_weighing(session, tenant_id, _capture(order.id, "INTERMEDIARIA", "25000"))
        pos = await complete_weighing(session, tenant_id, _capture(order.id, "POS_OPERACAO", "15000"))
        saida = await complete_weighing(session, tenant_id, _capture(order.id, "SAIDA", "14000"))
        await _mark(session, tenant_id, order.id, chegada, "CHEGADA")
        await _mark(session, tenant_id, order.id, pre, "PRE_OPERACAO")
        await _mark(session, tenant_id, order.id, pos, "POS_OPERACAO")
        await _mark(session, tenant_id, order.id, saida, "SAIDA")
        assert order.status == "CONCLUIDA"
        assert order.resultado_status == "VALIDO"
        assert order.peso_bruto_kg == Decimal("42000.000")
        assert order.peso_tara_kg == Decimal("15000.000")
        assert order.peso_liquido_kg == Decimal("27000.000")
        assert order.tara_source == "MEASURED"
        assert order.delta_pre_operacao_kg == Decimal("-1000.000")
        assert order.delta_pos_operacao_kg == Decimal("-1000.000")
        assert intermediate.peso_aferido_kg == Decimal("25000.000")
        await session.commit()


@pytest.mark.asyncio
async def test_expedição_requires_pos_greater_than_pre_and_inversion_is_rejected():
    tenant_id = uuid.uuid4()
    async with async_sessionmaker(_engine, expire_on_commit=False)() as session:
        await set_tenant_context(session, str(tenant_id))
        order = await _new_order(session, tenant_id, "EXPEDICAO")
        pre = await complete_weighing(session, tenant_id, _capture(order.id, "PRE_OPERACAO", "15000"))
        pos = await complete_weighing(session, tenant_id, _capture(order.id, "POS_OPERACAO", "42000"))
        await _mark(session, tenant_id, order.id, pre, "PRE_OPERACAO")
        await _mark(session, tenant_id, order.id, pos, "POS_OPERACAO")
        assert order.peso_bruto_kg == Decimal("42000.000")
        assert order.peso_tara_kg == Decimal("15000.000")
        assert order.peso_liquido_kg == Decimal("27000.000")
        await session.commit()

    async with async_sessionmaker(_engine, expire_on_commit=False)() as session:
        await set_tenant_context(session, str(tenant_id))
        bad_order = await _new_order(session, tenant_id, "EXPEDICAO")
        bad_order_id = bad_order.id
        bad_pre = await complete_weighing(session, tenant_id, _capture(bad_order.id, "PRE_OPERACAO", "42000"))
        bad_pos = await complete_weighing(session, tenant_id, _capture(bad_order.id, "POS_OPERACAO", "15000", "CONFERENCIA"))
        await _mark(session, tenant_id, bad_order.id, bad_pre, "PRE_OPERACAO")
        await session.commit()
        await set_tenant_context(session, str(tenant_id))
        with pytest.raises(ValueError, match="Inversão física"):
            await _mark(session, tenant_id, bad_order.id, bad_pos, "POS_OPERACAO")
        await session.rollback()
        await set_tenant_context(session, str(tenant_id))
        reloaded = await session.get(Ordem, bad_order_id)
        assert reloaded.status == "EM_PESAGEM"
        assert reloaded.peso_liquido_kg is None

        receive_order = await _new_order(session, tenant_id, "RECEBIMENTO")
        receive_pre = await complete_weighing(session, tenant_id, _capture(receive_order.id, "PRE_OPERACAO", "15000"))
        receive_pos = await complete_weighing(session, tenant_id, _capture(receive_order.id, "POS_OPERACAO", "42000", "CONFERENCIA"))
        await _mark(session, tenant_id, receive_order.id, receive_pre, "PRE_OPERACAO")
        await session.commit()
        await set_tenant_context(session, str(tenant_id))
        with pytest.raises(ValueError, match="Inversão física"):
            await _mark(session, tenant_id, receive_order.id, receive_pos, "POS_OPERACAO")
        await session.rollback()


@pytest.mark.asyncio
async def test_multiple_official_captures_recompute_with_history_without_mutating_weights():
    tenant_id = uuid.uuid4()
    async with async_sessionmaker(_engine, expire_on_commit=False)() as session:
        await set_tenant_context(session, str(tenant_id))
        order = await _new_order(session, tenant_id, "RECEBIMENTO")
        pre1 = await complete_weighing(session, tenant_id, _capture(order.id, "PRE_OPERACAO", "42000"))
        pre2 = await complete_weighing(session, tenant_id, _capture(order.id, "PRE_OPERACAO", "41000"))
        pos = await complete_weighing(session, tenant_id, _capture(order.id, "POS_OPERACAO", "15000"))
        await _mark(session, tenant_id, order.id, pre1, "PRE_OPERACAO")
        await _mark(session, tenant_id, order.id, pos, "POS_OPERACAO")
        first_liquid = order.peso_liquido_kg
        await _mark(session, tenant_id, order.id, pre2, "PRE_OPERACAO")
        assert order.peso_liquido_kg == Decimal("26000.000")
        assert order.peso_liquido_kg != first_liquid
        history = await list_result_history(session, tenant_id, order.id)
        assert len(history) >= 3
        assert history[-1].peso_liquido_kg == Decimal("26000.000")
        await session.commit()
        await set_tenant_context(session, str(tenant_id))
        pre1_id = pre1.id
        original = pre1.peso_aferido_kg
        pre1.peso_aferido_kg = Decimal("99999")
        with pytest.raises(DBAPIError):
            await session.flush()
        await session.rollback()
        await set_tenant_context(session, str(tenant_id))
        untouched = await session.get(Pesagem, pre1_id)
        assert untouched.peso_aferido_kg == original
        await session.commit()


@pytest.mark.asyncio
async def test_missing_and_unsupported_nature_stay_pending_without_abs_fallback():
    tenant_id = uuid.uuid4()
    async with async_sessionmaker(_engine, expire_on_commit=False)() as session:
        await set_tenant_context(session, str(tenant_id))
        missing = await _new_order(session, tenant_id, "RECEBIMENTO")
        pre = await complete_weighing(session, tenant_id, _capture(missing.id, "PRE_OPERACAO", "100"))
        await _mark(session, tenant_id, missing.id, pre, "PRE_OPERACAO")
        assert missing.status == "EM_PESAGEM"
        assert missing.resultado_status == "PENDENTE"
        assert missing.peso_liquido_kg is None

        unsupported = await _new_order(session, tenant_id, "TRANSFERENCIA")
        pre = await complete_weighing(session, tenant_id, _capture(unsupported.id, "PRE_OPERACAO", "100"))
        pos = await complete_weighing(session, tenant_id, _capture(unsupported.id, "POS_OPERACAO", "200"))
        await _mark(session, tenant_id, unsupported.id, pre, "PRE_OPERACAO")
        await _mark(session, tenant_id, unsupported.id, pos, "POS_OPERACAO")
        assert unsupported.status == "EM_PESAGEM"
        assert unsupported.resultado_status == "PENDENTE_SEM_REGRA"
        assert unsupported.peso_liquido_kg is None
        await session.commit()
