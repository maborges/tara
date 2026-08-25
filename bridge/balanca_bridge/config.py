from __future__ import annotations

from pathlib import Path
from typing import Literal

import yaml
from pydantic import BaseModel, Field


class SerialConfig(BaseModel):
    port: str = "/dev/ttyUSB0"
    baudrate: int = 9600
    bytesize: int = 8
    parity: str = "N"
    stopbits: float = 1
    timeout: float = 1.0


class TcpConfig(BaseModel):
    host: str = "192.168.0.50"
    port: int = 4001
    timeout: float = 5.0
    reconnect_seconds: float = 3.0


class ProtocolConfig(BaseModel):
    """Extração genérica do peso a partir do frame bruto do indicador.

    A maioria dos indicadores em modo "contínuo" manda uma linha de texto por
    leitura (ex.: "ST,GS,+001234kg\\r\\n"). Em vez de fixar o parser numa marca,
    a regex abaixo captura o primeiro número (com sinal/decimal opcional) da
    linha — funciona para a esmagadora maioria dos formatos sem precisar saber
    o modelo do indicador com antecedência. Quando a marca for conhecida,
    ajuste `weight_regex`/`unit`/`scale_factor` aqui, sem tocar em código.
    """

    weight_regex: str = r"[-+]?\d+(?:[.,]\d+)?"
    # A maioria dos indicadores emite o frame serial em ASCII com ponto decimal,
    # independente da localidade do equipamento — "," é a exceção, não a regra.
    decimal_separator: Literal[",", "."] = "."
    unit: Literal["kg", "g", "t"] = "kg"
    scale_factor: float = 1.0  # multiplica o valor lido para normalizar em kg
    line_terminator: str = "\r\n"


class BridgeConfig(BaseModel):
    connection_type: Literal["SERIAL", "TCP"] = "SERIAL"
    serial: SerialConfig = Field(default_factory=SerialConfig)
    tcp: TcpConfig = Field(default_factory=TcpConfig)
    protocol: ProtocolConfig = Field(default_factory=ProtocolConfig)
    http_host: str = "0.0.0.0"
    http_port: int = 8321
    stale_after_seconds: float = 5.0
    stable_readings: int = Field(default=3, ge=1, le=20)
    stable_tolerance_kg: float = Field(default=0.5, ge=0, le=100)
    # Token simples opcional para restringir quem consulta a ponte na LAN.
    # Vazio = sem autenticação (aceitável em rede local isolada/confiável).
    api_token: str | None = None


def load_config(path: str | Path = "config.yaml") -> BridgeConfig:
    path = Path(path)
    if not path.exists():
        return BridgeConfig()
    with path.open("r", encoding="utf-8") as f:
        data = yaml.safe_load(f) or {}
    return BridgeConfig.model_validate(data)
