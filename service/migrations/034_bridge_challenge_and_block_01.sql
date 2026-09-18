-- Create BridgeChallenge table for BLOCK-02
CREATE TABLE tara.bridge_challenges (
    id UUID PRIMARY KEY,
    tenant_id UUID NOT NULL,
    instalacao_id UUID NOT NULL REFERENCES tara.estacao_instalacoes(id) ON DELETE CASCADE,
    nonce VARCHAR(64) NOT NULL,
    expires_at TIMESTAMP WITHOUT TIME ZONE NOT NULL,
    used_at TIMESTAMP WITHOUT TIME ZONE
);

CREATE INDEX ix_tara_bridge_challenges_instalacao ON tara.bridge_challenges (instalacao_id);

COMMENT ON TABLE tara.bridge_challenges IS 'Desafios criptográficos para validação real da Bridge.';
