-- Registro definitivo de que uma pesagem foi entregue e seu payload já foi expurgado.

-- UP
CREATE TABLE IF NOT EXISTS tara.delivery_tombstones (
    id UUID PRIMARY KEY,
    tenant_id UUID NOT NULL,
    conta_id UUID NOT NULL REFERENCES tara.contas(id) ON DELETE CASCADE,
    pesagem_id UUID NOT NULL REFERENCES tara.pesagens(id) ON DELETE CASCADE,
    estacao_id UUID REFERENCES tara.estacoes(id),
    occurred_at TIMESTAMP WITHOUT TIME ZONE NOT NULL,
    acknowledged_at TIMESTAMP WITHOUT TIME ZONE NOT NULL,
    acknowledged_by_api_client_id UUID REFERENCES tara.api_clients(id),
    acknowledged_by_credential_id UUID REFERENCES tara.api_client_secrets(id),
    purged_at TIMESTAMP WITHOUT TIME ZONE NOT NULL,
    payload_checksum VARCHAR(64) NOT NULL,
    CONSTRAINT uq_TARA_delivery_tombstone_pesagem UNIQUE (tenant_id, pesagem_id)
);

ALTER TABLE tara.delivery_tombstones ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS delivery_tombstones_tenant_isolation ON tara.delivery_tombstones;
CREATE POLICY delivery_tombstones_tenant_isolation ON tara.delivery_tombstones
    AS RESTRICTIVE FOR ALL
    USING (tenant_id::text = NULLIF(current_setting('app.current_tenant_id', TRUE), ''))
    WITH CHECK (tenant_id::text = NULLIF(current_setting('app.current_tenant_id', TRUE), ''));


