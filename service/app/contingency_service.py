from __future__ import annotations

from datetime import datetime, timezone
from decimal import Decimal
import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from .contingency import package_hash, verify_package_signature
from .models import ContingenciaItem, ContingenciaLote, Estacao, Pesagem
from .schemas import ContingencyPackageIn, WeighingIn
from .operation import complete_weighing, create_order


async def import_contingency_package(session: AsyncSession, tenant_id: uuid.UUID, package: ContingencyPackageIn):
    """Valida, registra e importa um pacote físico de pesagens.

    Args:
        session: Sessão com o contexto RLS do tenant.
        tenant_id: Tenant autenticado no backoffice.
        package: Pacote assinado pela estação.
    Returns:
        Um resumo do lote e dos itens importados, duplicados ou rejeitados.
    Raises:
        ValueError: Se identidade, assinatura, estação ou sequência forem inválidas.
    """
    raw = package.model_dump(mode="json", exclude_unset=True)
    fingerprint = verify_package_signature(raw)
    station = await _find_station(session, tenant_id, package.station_id)
    _validate_station_identity(station, package, fingerprint)
    existing = await _find_existing_lot(session, tenant_id, package.package_id)
    if existing:
        return _lot_summary(existing, "Pacote já processado")
    await _validate_sequence(session, tenant_id, package)
    lot = _create_lot(tenant_id, package, fingerprint, raw)
    session.add(lot)
    await session.flush()
    results = await _import_items(session, tenant_id, lot.id, package.station_id, package.records)
    lot.status = _lot_status(results)
    lot.imported_at = datetime.utcnow()
    await session.flush()
    return {"lot_id": str(lot.id), "package_id": package.package_id, "status": lot.status, "results": results}


async def _find_station(session: AsyncSession, tenant_id: uuid.UUID, station_id: uuid.UUID) -> Estacao:
    station = (await session.execute(select(Estacao).where(Estacao.id == station_id, Estacao.tenant_id == tenant_id))).scalar_one_or_none()
    if station is None or station.status not in {"ATIVA", "PENDENTE"}:
        raise ValueError("Estação não encontrada ou bloqueada")
    return station


def _validate_station_identity(station: Estacao, package: ContingencyPackageIn, fingerprint: str) -> None:
    if station.identity_fingerprint and station.identity_fingerprint != fingerprint:
        raise ValueError("A identidade do pacote não corresponde à estação registrada")
    if package.tenant_id != station.tenant_id:
        raise ValueError("Tenant do pacote não corresponde à estação")
    if station.identity_fingerprint is None:
        station.identity_fingerprint = fingerprint
        station.public_key = package.station_public_key
    elif station.public_key != package.station_public_key:
        raise ValueError("Chave pública da estação não corresponde à identidade registrada")


async def _find_existing_lot(session: AsyncSession, tenant_id: uuid.UUID, package_id: str):
    return (await session.execute(select(ContingenciaLote).where(ContingenciaLote.tenant_id == tenant_id, ContingenciaLote.package_id == package_id))).scalar_one_or_none()


async def _validate_sequence(session: AsyncSession, tenant_id: uuid.UUID, package: ContingencyPackageIn) -> None:
    latest = (await session.execute(select(ContingenciaLote.sequence_number).where(ContingenciaLote.tenant_id == tenant_id, ContingenciaLote.station_id == package.station_id).order_by(ContingenciaLote.sequence_number.desc()).limit(1))).scalar_one_or_none()
    if latest is not None and package.sequence_number <= latest:
        raise ValueError("Sequência do pacote já foi importada ou está atrasada")


def _create_lot(tenant_id, package, fingerprint, raw) -> ContingenciaLote:
    return ContingenciaLote(id=uuid.uuid4(), tenant_id=tenant_id, station_id=package.station_id, package_id=package.package_id, sequence_number=package.sequence_number, schema_version=package.schema_version, package_hash=package_hash(raw), identity_fingerprint=fingerprint, record_count=len(package.records), status="RECEBIDO", raw_package=raw, created_at=datetime.utcnow())


async def _import_items(session, tenant_id, lot_id, station_id, records):
    results = []
    for record in records:
        results.append(await _import_item(session, tenant_id, lot_id, station_id, record))
    return results


async def _import_item(session, tenant_id, lot_id, station_id, record):
    if record.installation_id:
        from .models import EstacaoInstalacao
        inst = (await session.execute(select(EstacaoInstalacao).where(EstacaoInstalacao.id == record.installation_id, EstacaoInstalacao.tenant_id == tenant_id))).scalar_one_or_none()
        if not inst or inst.estacao_id != station_id:
            return _save_item(session, tenant_id, lot_id, record, "REJEITADO", None, "Instalação não pertence à estação indicada")
    if record.device_configuration_id:
        from .models import DeviceConfiguration
        dev = (await session.execute(select(DeviceConfiguration).where(DeviceConfiguration.id == record.device_configuration_id, DeviceConfiguration.tenant_id == tenant_id))).scalar_one_or_none()
        if not dev or dev.instalacao_id != record.installation_id:
            return _save_item(session, tenant_id, lot_id, record, "REJEITADO", None, "Configuração de dispositivo não pertence à instalação indicada")

    duplicate = (await session.execute(select(Pesagem).where(Pesagem.tenant_id == tenant_id, Pesagem.local_id == record.local_id))).scalar_one_or_none()
    if duplicate:
        return _save_item(session, tenant_id, lot_id, record, "DUPLICADO", duplicate.id)
    try:
        order_id = record.ordem_id or await _create_shadow_order(session, tenant_id, record)
        weight = await complete_weighing(session, tenant_id, WeighingIn(estacao_id=station_id, installation_id=record.installation_id, device_configuration_id=record.device_configuration_id, ordem_id=order_id, local_id=record.local_id, etapa=record.etapa, peso_aferido_kg=Decimal(record.peso_aferido_kg), peso_informado_kg=_decimal(record.peso_informado_kg), peso_tara_kg=_decimal(record.peso_tara_kg), captured_via=record.captured_via, leitura_bruta=record.leitura_bruta, captured_at=_naive_datetime(record.data_pesagem)))
        return _save_item(session, tenant_id, lot_id, record, "IMPORTADO", weight.id)
    except (ValueError, KeyError) as exc:
        return _save_item(session, tenant_id, lot_id, record, "REJEITADO", None, str(exc))


async def _create_shadow_order(session, tenant_id, record):
    data = type("ContingencyOrder", (), {"client_system": "balanca-contingencia", "client_tenant_id": str(tenant_id), "external_reference": record.numero_ticket or record.local_id, "correlation_id": record.local_id, "subject_type": record.subject_type or "VEICULO", "tipo_pesagem": record.tipo_pesagem or "UNICA", "contexto": record.contexto or {}})()
    return (await create_order(session, tenant_id, data)).id


def _decimal(value):
    return Decimal(value) if value is not None else None


def _naive_datetime(value):
    if value is None:
        return None
    return value.astimezone(timezone.utc).replace(tzinfo=None) if value.tzinfo else value


def _save_item(session, tenant_id, lot_id, record, status, pesagem_id, error_message=None):
    session.add(ContingenciaItem(id=uuid.uuid4(), tenant_id=tenant_id, lote_id=lot_id, local_id=record.local_id, status=status, pesagem_id=pesagem_id, error_message=error_message, payload=record.model_dump(mode="json"), created_at=datetime.utcnow()))
    return {"local_id": record.local_id, "status": status, "pesagem_id": str(pesagem_id) if pesagem_id else None, "error_message": error_message}


def _lot_status(results):
    statuses = {item["status"] for item in results}
    if statuses <= {"IMPORTADO", "DUPLICADO"}:
        return "IMPORTADO"
    if "IMPORTADO" in statuses or "DUPLICADO" in statuses:
        return "PARCIAL"
    return "REJEITADO"


def _lot_summary(lot, message):
    return {"lot_id": str(lot.id), "package_id": lot.package_id, "status": lot.status, "message": message, "results": []}
