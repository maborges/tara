from decimal import Decimal

import pytest

from balanca_bridge.config import ProtocolConfig
from balanca_bridge.protocol_adapter import ProtocolAdapter, FrameParseError


def test_parse_frame_generico_virgula_decimal():
    adapter = ProtocolAdapter(ProtocolConfig(decimal_separator=",", unit="kg"))
    assert adapter.parse("ST,GS,+012345,500kg\r\n") == Decimal("12345.500")


def test_parse_frame_ponto_decimal():
    adapter = ProtocolAdapter(ProtocolConfig(decimal_separator=".", unit="kg"))
    assert adapter.parse("W: 1234.75 kg") == Decimal("1234.75")


def test_parse_unidade_gramas_normaliza_para_kg():
    adapter = ProtocolAdapter(ProtocolConfig(decimal_separator=".", unit="g"))
    assert adapter.parse("1500.000") == Decimal("1.500")


def test_parse_unidade_toneladas_normaliza_para_kg():
    adapter = ProtocolAdapter(ProtocolConfig(decimal_separator=".", unit="t"))
    assert adapter.parse("2.5") == Decimal("2500.0")


def test_parse_scale_factor():
    adapter = ProtocolAdapter(ProtocolConfig(decimal_separator=".", unit="kg", scale_factor=10))
    assert adapter.parse("125.0") == Decimal("1250.0")


def test_parse_linha_vazia_levanta_erro():
    adapter = ProtocolAdapter(ProtocolConfig())
    with pytest.raises(FrameParseError):
        adapter.parse("   \r\n")


def test_parse_sem_numero_levanta_erro():
    adapter = ProtocolAdapter(ProtocolConfig())
    with pytest.raises(FrameParseError):
        adapter.parse("ERRO SENSOR\r\n")


def test_parse_peso_negativo():
    adapter = ProtocolAdapter(ProtocolConfig(decimal_separator=".", unit="kg"))
    assert adapter.parse("-15.250") == Decimal("-15.250")
