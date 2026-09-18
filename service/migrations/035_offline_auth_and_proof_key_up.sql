ALTER TABLE tara.device_configurations
    ADD COLUMN IF NOT EXISTS proof_key_encrypted TEXT NULL,
    ALTER COLUMN status SET DEFAULT 'PENDING';

CREATE TABLE IF NOT EXISTS tara.offline_capture_authorizations (
    id UUID PRIMARY KEY,
    tenant_id UUID NOT NULL,
    estacao_id UUID NOT NULL REFERENCES tara.estacoes(id) ON DELETE CASCADE,
    instalacao_id UUID NOT NULL REFERENCES tara.estacao_instalacoes(id) ON DELETE CASCADE,
    device_configuration_id UUID NOT NULL REFERENCES tara.device_configurations(id) ON DELETE CASCADE,
    status VARCHAR(20) NOT NULL DEFAULT 'AVAILABLE',
    nonce VARCHAR(64) NOT NULL,
    consumed_by_local_id VARCHAR(120) NULL,
    consumed_at TIMESTAMP NULL,
    expires_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP NOT NULL
);

CREATE INDEX IF NOT EXISTS ix_tara_offline_auth_instalacao
    ON tara.offline_capture_authorizations (tenant_id, instalacao_id, status);

COMMENT ON TABLE tara.offline_capture_authorizations IS 'Autorizações prévias emitidas pela Nuvem para capturas offline.';
COMMENT ON COLUMN tara.device_configurations.proof_key_encrypted IS 'Chave HMAC gerada pela Nuvem para provar a autenticidade da Bridge associada a esta configuracao.';
