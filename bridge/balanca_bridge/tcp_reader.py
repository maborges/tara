from __future__ import annotations

import asyncio
import logging

from balanca_bridge.config import TcpConfig, ProtocolConfig
from balanca_bridge.protocol_adapter import ProtocolAdapter, FrameParseError
from balanca_bridge.state import LeituraState, Leitura

logger = logging.getLogger("balanca_bridge.tcp")


async def run_tcp_reader(config: TcpConfig, protocol: ProtocolConfig, adapter: ProtocolAdapter, state: LeituraState) -> None:
    """Loop infinito: conecta ao indicador via TCP, lê linha a linha, reconecta em caso de queda."""
    terminator = protocol.line_terminator.encode()

    while True:
        try:
            reader, writer = await asyncio.wait_for(
                asyncio.open_connection(config.host, config.port), timeout=config.timeout
            )
            logger.info("Conectado ao indicador TCP %s:%s.", config.host, config.port)
            try:
                while True:
                    raw = await reader.readuntil(terminator)
                    linha = raw.decode(errors="ignore")
                    try:
                        peso = adapter.parse(linha)
                    except FrameParseError as exc:
                        logger.debug("Linha ignorada (%s): %r", exc, linha)
                        continue
                    await state.atualizar(Leitura(peso_kg=peso, raw=linha.strip()))
            finally:
                writer.close()
        except Exception as exc:  # noqa: BLE001 - qualquer falha de rede deve reconectar, não derrubar o processo
            logger.warning(
                "Falha na conexão TCP %s:%s: %s. Reconectando em %.1fs.",
                config.host, config.port, exc, config.reconnect_seconds,
            )
            await state.marcar_erro(str(exc))
            await asyncio.sleep(config.reconnect_seconds)
