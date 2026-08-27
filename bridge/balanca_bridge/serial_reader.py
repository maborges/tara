from __future__ import annotations

import asyncio
import logging

import serial

from TARA_bridge.config import SerialConfig
from TARA_bridge.protocol_adapter import ProtocolAdapter, FrameParseError
from TARA_bridge.state import LeituraState, Leitura

logger = logging.getLogger("TARA_bridge.serial")


async def run_serial_reader(config: SerialConfig, adapter: ProtocolAdapter, state: LeituraState) -> None:
    """Loop infinito: abre a porta serial, lê linha a linha, reconecta em caso de falha.

    Roda em thread separada (pyserial é bloqueante) via `asyncio.to_thread`.
    """
    loop = asyncio.get_running_loop()
    while True:
        try:
            await asyncio.to_thread(_read_loop, config, adapter, state, loop)
        except Exception as exc:  # noqa: BLE001 - qualquer falha de hardware deve reconectar, não derrubar o processo
            logger.warning("Falha na porta serial %s: %s. Reconectando em 3s.", config.port, exc)
            await state.marcar_erro(str(exc))
            await asyncio.sleep(3)


def _read_loop(
    config: SerialConfig, adapter: ProtocolAdapter, state: LeituraState, loop: asyncio.AbstractEventLoop
) -> None:
    with serial.Serial(
        port=config.port,
        baudrate=config.baudrate,
        bytesize=config.bytesize,
        parity=config.parity,
        stopbits=config.stopbits,
        timeout=config.timeout,
    ) as ser:
        logger.info("Porta serial %s aberta (%d bps).", config.port, config.baudrate)
        while True:
            raw = ser.readline()
            if not raw:
                continue
            linha = raw.decode(errors="ignore")
            try:
                peso = adapter.parse(linha)
            except FrameParseError as exc:
                logger.debug("Linha ignorada (%s): %r", exc, linha)
                continue
            asyncio.run_coroutine_threadsafe(
                state.atualizar(Leitura(peso_kg=peso, raw=linha.strip())), loop
            )
