-- UP
ALTER TABLE tara.estacao_instalacoes ADD COLUMN IF NOT EXISTS token_hash VARCHAR(64);
ALTER TABLE tara.estacao_instalacoes ADD COLUMN IF NOT EXISTS drain_expires_at TIMESTAMP WITHOUT TIME ZONE;
ALTER TABLE tara.pesagens ADD COLUMN IF NOT EXISTS instalacao_id UUID REFERENCES tara.estacao_instalacoes(id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_tara_installation_token_hash ON tara.estacao_instalacoes(token_hash) WHERE token_hash IS NOT NULL;
-- DOWN
DROP INDEX IF EXISTS tara.uq_tara_installation_token_hash;
ALTER TABLE tara.pesagens DROP COLUMN IF EXISTS instalacao_id;
ALTER TABLE tara.estacao_instalacoes DROP COLUMN IF EXISTS drain_expires_at;
ALTER TABLE tara.estacao_instalacoes DROP COLUMN IF EXISTS token_hash;
