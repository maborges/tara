from __future__ import annotations

import re
from decimal import Decimal, InvalidOperation

from TARA_bridge.config import ProtocolConfig


class FrameParseError(ValueError):
    pass


class ProtocolAdapter:
    """Extrai o peso (em kg) de uma linha bruta recebida do indicador.

    Genérico por desenho: não assume marca/modelo. A regex e os fatores de
    normalização vêm de `ProtocolConfig` (config.yaml), ajustáveis por
    instalação sem alterar código.
    """

    def __init__(self, config: ProtocolConfig):
        self.config = config
        self._pattern = re.compile(config.weight_regex)

    def parse(self, raw_line: str) -> Decimal:
        raw_line = raw_line.strip()
        if not raw_line:
            raise FrameParseError("Linha vazia recebida do indicador.")

        match = self._pattern.search(raw_line)
        if not match:
            raise FrameParseError(f"Não foi possível extrair peso da linha: {raw_line!r}")

        numero = match.group(0)
        if self.config.decimal_separator == ",":
            numero = numero.replace(".", "").replace(",", ".")

        try:
            valor = Decimal(numero)
        except InvalidOperation as exc:
            raise FrameParseError(f"Valor numérico inválido: {numero!r}") from exc

        valor_kg = valor * Decimal(str(self.config.scale_factor))
        if self.config.unit == "g":
            valor_kg = valor_kg / Decimal("1000")
        elif self.config.unit == "t":
            valor_kg = valor_kg * Decimal("1000")

        return valor_kg
