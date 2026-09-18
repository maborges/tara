-- UP
CREATE TABLE tara.device_configurations (
    id UUID PRIMARY KEY,
    tenant_id UUID NOT NULL,
    estacao_id UUID NOT NULL REFERENCES tara.estacoes(id) ON DELETE CASCADE,
    instalacao_id UUID NOT NULL REFERENCES tara.estacao_instalacoes(id) ON DELETE CASCADE,
    bridge_url VARCHAR(255) NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
    created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL,
    replaced_at TIMESTAMP WITHOUT TIME ZONE NULL
);

ALTER TABLE tara.device_configurations ADD CONSTRAINT uq_TARA_device_config_tenant UNIQUE (tenant_id, id);
COMMENT ON TABLE tara.device_configurations IS 'Registro historico da configuracao tecnica (Bridge/Equipamento) usada por uma instalacao.';

-- DOWN
DROP TABLE IF EXISTS tara.device_configurations CASCADE;
