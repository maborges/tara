-- DeliveryReceipt: Rastreamento do consumo (ACK) da pesagem pelo sistema consumidor.

-- UP
CREATE TABLE tara.delivery_receipts (
    id UUID PRIMARY KEY,
    tenant_id UUID NOT NULL,
    conta_id UUID NOT NULL REFERENCES tara.contas(id),
    pesagem_id UUID NOT NULL REFERENCES tara.pesagens(id) ON DELETE CASCADE,
    payload JSONB NOT NULL,
    status VARCHAR(30) NOT NULL DEFAULT 'PENDENTE',
    created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL,
    acknowledged_at TIMESTAMP WITHOUT TIME ZONE,
    acknowledged_by_api_client_id UUID REFERENCES tara.api_clients(id),
    acknowledged_by_credential_id UUID REFERENCES tara.api_client_secrets(id),

    CONSTRAINT uq_TARA_delivery_pesagem UNIQUE (tenant_id, pesagem_id)
);

COMMENT ON TABLE tara.delivery_receipts IS 'Controle de entrega de pesagens para os sistemas consumidores.';
COMMENT ON COLUMN tara.delivery_receipts.payload IS 'Cópia isolada do payload canônico da pesagem no momento da conclusão.';

CREATE INDEX ix_tara_delivery_receipt_status_created ON tara.delivery_receipts (tenant_id, status, created_at);

ALTER TABLE tara.delivery_receipts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "delivery_receipts_tenant_isolation" ON tara.delivery_receipts
    AS RESTRICTIVE FOR ALL
    USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', TRUE), '')::uuid);

