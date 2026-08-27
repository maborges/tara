"""Teste de ponta a ponta: sobe um servidor TCP fake (mesmo formato do
simulator.py), aponta a ponte para ele, e confere que /peso-atual e o
WebSocket refletem a leitura — sem precisar de hardware físico."""
from __future__ import annotations

import asyncio
from decimal import Decimal

import pytest
from httpx import ASGITransport, AsyncClient

from TARA_bridge.config import BridgeConfig, TcpConfig
from TARA_bridge.protocol_adapter import ProtocolAdapter
from TARA_bridge.state import LeituraState
from TARA_bridge.tcp_reader import run_tcp_reader


async def _fake_indicador(reader, writer, peso_kg: float):
    try:
        linha = f"ST,GS,+{peso_kg:09.3f}kg\r\n"
        for _ in range(20):
            writer.write(linha.encode())
            await writer.drain()
            await asyncio.sleep(0.05)
    except (ConnectionResetError, asyncio.CancelledError):
        pass
    finally:
        writer.close()


@pytest.mark.asyncio
async def test_tcp_reader_atualiza_estado_a_partir_de_indicador_fake():
    try:
        server = await asyncio.start_server(
            lambda r, w: _fake_indicador(r, w, peso_kg=8342.750), "127.0.0.1", 0
        )
    except PermissionError as exc:
        pytest.skip(f"ambiente não permite socket local para teste E2E: {exc}")
    if not server.sockets:
        server.close()
        await server.wait_closed()
        pytest.skip("ambiente não disponibilizou socket local para teste E2E")
    host, port = server.sockets[0].getsockname()[:2]

    config = TcpConfig(host=host, port=port, timeout=2.0, reconnect_seconds=0.2)
    # O indicador fake emite decimal com ponto (padrão ASCII do protocolo,
    # independente de localidade) — configura o adapter para bater com o frame.
    protocol_config = BridgeConfig(protocol={"decimal_separator": "."}).protocol
    adapter = ProtocolAdapter(protocol_config)
    state = LeituraState()

    reader_task = asyncio.create_task(run_tcp_reader(config, protocol_config, adapter, state))
    try:
        for _ in range(50):
            leitura = await state.obter()
            if leitura["peso_kg"] is not None:
                break
            await asyncio.sleep(0.05)

        leitura = await state.obter()
        assert leitura["peso_kg"] is not None
        assert Decimal(leitura["peso_kg"]) == Decimal("8342.750")
        assert leitura["conectado"] is True
        assert leitura["stale"] is False
    finally:
        reader_task.cancel()
        server.close()
        await server.wait_closed()


@pytest.mark.asyncio
async def test_endpoint_peso_atual_sem_leitura_retorna_stale():
    from TARA_bridge.main import app

    app.state.config = BridgeConfig()
    app.state.leitura_state = LeituraState()

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.get("/peso-atual")
        assert resp.status_code == 200
        data = resp.json()
        assert data["peso_kg"] is None
        assert data["stale"] is True


@pytest.mark.asyncio
async def test_endpoint_peso_atual_com_token_invalido_retorna_401():
    from TARA_bridge.main import app

    app.state.config = BridgeConfig(api_token="segredo123")
    app.state.leitura_state = LeituraState()

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.get("/peso-atual")
        assert resp.status_code == 401

        resp_ok = await client.get("/peso-atual", headers={"X-Bridge-Token": "segredo123"})
        assert resp_ok.status_code == 200
