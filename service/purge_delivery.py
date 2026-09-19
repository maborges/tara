"""Utilitário CLI para executar o expurgo (purge) seguro de DeliveryReceipts retidos."""

import argparse
import asyncio
import hashlib
import json
import logging
import uuid
from datetime import datetime, timedelta

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import async_sessionmaker

from app.config import get_settings
from app.db import _engine, set_platform_admin_context
from app.models import DeliveryReceipt, DeliveryTombstone

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger(__name__)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Expurgo seguro de Delivery Receipts")
    parser.add_argument("--dry-run", action="store_true", help="Apenas relata o que seria expurgado, sem alterar o banco")
    parser.add_argument("--limit", type=int, default=10000, help="Limite máximo total de registros a processar")
    parser.add_argument("--batch-size", type=int, default=500, help="Tamanho do lote por transação")
    return parser.parse_args()


async def purge_delivery_receipts(dry_run: bool, limit: int, batch_size: int) -> None:
    settings = get_settings()
    retention_days = settings.delivery_retention_days
    cutoff = datetime.utcnow() - timedelta(days=retention_days)

    logger.info("=" * 60)
    logger.info("Iniciando processo de expurgo de DeliveryReceipts")
    logger.info(f"Retenção configurada: {retention_days} dias")
    logger.info(f"Cutoff (data máxima de acknowledged_at): {cutoff.isoformat()}")
    logger.info(f"Modo: {'DRY-RUN' if dry_run else 'EXECUÇÃO REAL'}")
    logger.info("=" * 60)

    sessions = async_sessionmaker(_engine, expire_on_commit=False)
    
    total_purged = 0
    total_skipped = 0
    
    async with sessions() as session:
        # Autorização para ler/escrever cross-tenant via RLS na sessão atual
        await set_platform_admin_context(session, str(uuid.uuid4()))

        # Contagem total de elegíveis
        stmt_count = select(DeliveryReceipt.id).where(
            DeliveryReceipt.status == "ACKNOWLEDGED",
            DeliveryReceipt.acknowledged_at != None,
            DeliveryReceipt.acknowledged_at <= cutoff
        )
        result_count = await session.execute(stmt_count)
        eligible_ids = list(result_count.scalars())
        logger.info(f"Total de registros elegíveis encontrados: {len(eligible_ids)}")

        if limit < len(eligible_ids):
            logger.info(f"Limitando o processamento a {limit} registros.")
            eligible_ids = eligible_ids[:limit]

        if not eligible_ids:
            logger.info("Nenhum registro para expurgar.")
            return

        for i in range(0, len(eligible_ids), batch_size):
            batch_ids = eligible_ids[i:i + batch_size]
            
            stmt = select(DeliveryReceipt).where(DeliveryReceipt.id.in_(batch_ids))
            result = await session.execute(stmt)
            receipts = result.scalars().all()

            if dry_run:
                logger.info(f"[DRY-RUN] Lote {i // batch_size + 1}: {len(receipts)} registros seriam expurgados.")
                for r in receipts:
                    logger.debug(f"[DRY-RUN] Elegível: Receipt ID={r.id}, Pesagem ID={r.pesagem_id}")
                total_purged += len(receipts)
                continue

            try:
                # Transação Atômica por Lote
                async with session.begin_nested():
                    now = datetime.utcnow()
                    for r in receipts:
                        payload_str = json.dumps(r.payload, sort_keys=True)
                        checksum = hashlib.sha256(payload_str.encode("utf-8")).hexdigest()
                        
                        tombstone = DeliveryTombstone(
                            id=uuid.uuid4(),
                            tenant_id=r.tenant_id,
                            conta_id=r.conta_id,
                            pesagem_id=r.pesagem_id,
                            estacao_id=None,  # Pode ser populado através da pesagem se necessário, mas o Tombstone mínimo exige apenas a identidade da pesagem
                            occurred_at=r.created_at,
                            acknowledged_at=r.acknowledged_at,
                            acknowledged_by_api_client_id=r.acknowledged_by_api_client_id,
                            acknowledged_by_credential_id=r.acknowledged_by_credential_id,
                            purged_at=now,
                            payload_checksum=checksum,
                        )
                        session.add(tombstone)

                    # Deletar os receipts deste lote
                    await session.execute(
                        delete(DeliveryReceipt).where(DeliveryReceipt.id.in_(batch_ids))
                    )
                
                await session.commit()
                total_purged += len(receipts)
                logger.info(f"Lote {i // batch_size + 1}: {len(receipts)} registros expurgados e tombstoned com sucesso.")
            except Exception as e:
                await session.rollback()
                logger.error(f"Erro ao processar lote {i // batch_size + 1}: {e}")
                total_skipped += len(receipts)

    logger.info("=" * 60)
    logger.info(f"Processo finalizado. Total Expurgado: {total_purged}, Falhas/Skipped: {total_skipped}")
    logger.info("=" * 60)


async def main() -> None:
    args = parse_args()
    try:
        await purge_delivery_receipts(args.dry_run, args.limit, args.batch_size)
    finally:
        await _engine.dispose()


if __name__ == "__main__":
    asyncio.run(main())
