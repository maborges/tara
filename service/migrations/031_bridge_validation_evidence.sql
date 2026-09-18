-- UP
CREATE TABLE tara.bridge_validations (
 id UUID PRIMARY KEY, tenant_id UUID NOT NULL,
 instalacao_id UUID NOT NULL REFERENCES tara.estacao_instalacoes(id) ON DELETE CASCADE,
 bridge_url VARCHAR(255) NOT NULL, token_proof_hash VARCHAR(64) NOT NULL,
 expires_at TIMESTAMP WITHOUT TIME ZONE NOT NULL, used_at TIMESTAMP WITHOUT TIME ZONE NULL
);
-- DOWN
DROP TABLE IF EXISTS tara.bridge_validations;
