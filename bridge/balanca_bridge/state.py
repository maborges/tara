from __future__ import annotations

import asyncio
import time
from dataclasses import dataclass, field
from decimal import Decimal


@dataclass
class Leitura:
    peso_kg: Decimal
    raw: str
    timestamp: float = field(default_factory=time.time)
    stable: bool = False


class LeituraState:
    """Estado compartilhado da última leitura + fan-out para assinantes WebSocket."""

    def __init__(self, stale_after_seconds: float = 5.0, stable_readings: int = 3, stable_tolerance_kg: float = 0.5):
        self.stale_after_seconds = stale_after_seconds
        self.stable_readings = stable_readings
        self.stable_tolerance_kg = Decimal(str(stable_tolerance_kg))
        self._ultima: Leitura | None = None
        self._recent_weights: list[Decimal] = []
        self._lock = asyncio.Lock()
        self._subscribers: set[asyncio.Queue[Leitura]] = set()
        self.conectado = False
        self.erro: str | None = None

    async def atualizar(self, leitura: Leitura) -> None:
        self._recent_weights.append(leitura.peso_kg)
        self._recent_weights = self._recent_weights[-self.stable_readings :]
        stable = len(self._recent_weights) >= self.stable_readings and (
            max(self._recent_weights) - min(self._recent_weights) <= self.stable_tolerance_kg
        )
        leitura = Leitura(peso_kg=leitura.peso_kg, raw=leitura.raw, timestamp=leitura.timestamp, stable=stable)
        async with self._lock:
            self._ultima = leitura
            self.conectado = True
            self.erro = None
        for queue in list(self._subscribers):
            queue.put_nowait(leitura)

    async def marcar_erro(self, mensagem: str) -> None:
        async with self._lock:
            self.conectado = False
            self.erro = mensagem

    async def obter(self) -> dict:
        async with self._lock:
            if self._ultima is None:
                return {
                    "conectado": self.conectado,
                    "erro": self.erro,
                    "peso_kg": None,
                    "raw": None,
                    "timestamp": None,
                    "stale": True,
                    "stable": False,
                }
            idade = time.time() - self._ultima.timestamp
            return {
                "conectado": self.conectado,
                "erro": self.erro,
                "peso_kg": str(self._ultima.peso_kg),
                "raw": self._ultima.raw,
                "timestamp": self._ultima.timestamp,
                "stale": idade > self.stale_after_seconds,
                "stable": self._ultima.stable and idade <= self.stale_after_seconds,
            }

    def subscribe(self) -> asyncio.Queue[Leitura]:
        queue: asyncio.Queue[Leitura] = asyncio.Queue(maxsize=10)
        self._subscribers.add(queue)
        return queue

    def unsubscribe(self, queue: asyncio.Queue[Leitura]) -> None:
        self._subscribers.discard(queue)
