"""Simulador de indicador de balança via TCP — útil para testar a ponte sem
hardware físico (ainda não há equipamento definido). Emula um indicador
genérico em modo "contínuo": abre um servidor TCP e manda uma linha de peso
por segundo, com pequena variação aleatória para simular a leitura ao vivo.

Uso:
    python simulator.py --port 4001 --peso-base 12500

Depois aponte config.yaml para connection_type: TCP, host: 127.0.0.1, port: 4001.
"""
from __future__ import annotations

import argparse
import asyncio
import random


async def handle_client(reader: asyncio.StreamReader, writer: asyncio.StreamWriter, peso_base: float) -> None:
    peer = writer.get_extra_info("peername")
    print(f"[simulator] cliente conectado: {peer}")
    try:
        while True:
            # Mantém a variação dentro da tolerância padrão de estabilidade da
            # Bridge (0,5 kg), para que o botão "Usar peso" possa ser testado.
            variacao = random.uniform(-0.2, 0.2)
            peso = max(0.0, peso_base + variacao)
            linha = f"ST,GS,+{peso:09.3f}kg\r\n"
            writer.write(linha.encode())
            await writer.drain()
            await asyncio.sleep(1.0)
    except (ConnectionResetError, asyncio.CancelledError):
        pass
    finally:
        writer.close()
        print(f"[simulator] cliente desconectado: {peer}")


async def main() -> None:
    parser = argparse.ArgumentParser(description="Simulador de indicador de balança (TCP)")
    parser.add_argument("--host", default="0.0.0.0")
    parser.add_argument("--port", type=int, default=4001)
    parser.add_argument("--peso-base", type=float, default=12500.0, help="Peso base simulado, em kg")
    args = parser.parse_args()

    server = await asyncio.start_server(
        lambda r, w: handle_client(r, w, args.peso_base), args.host, args.port
    )
    print(f"[simulator] ouvindo em {args.host}:{args.port} — peso base {args.peso_base}kg")
    async with server:
        await server.serve_forever()


if __name__ == "__main__":
    asyncio.run(main())
