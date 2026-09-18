-- UP
CREATE TABLE tara.estacao_instalacoes (
    id UUID PRIMARY KEY,
    tenant_id UUID NOT NULL,
    estacao_id UUID NOT NULL REFERENCES tara.estacoes(id) ON DELETE CASCADE,
    status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
    created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL,
    revoked_at TIMESTAMP WITHOUT TIME ZONE NULL
);

ALTER TABLE tara.estacao_instalacoes ADD CONSTRAINT uq_TARA_instalacao_tenant UNIQUE (tenant_id, id);
COMMENT ON TABLE tara.estacao_instalacoes IS 'Registro de uma instalacao concreta de uma estacao em um terminal fisico/browser.';

-- DOWN
DROP TABLE IF EXISTS tara.estacao_instalacoes CASCADE;
