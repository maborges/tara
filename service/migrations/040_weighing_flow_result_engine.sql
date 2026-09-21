-- BALANCA-WEIGHING-FLOW-02C
-- Resultado consolidado de operações MULTIPLA por marcos oficiais.
-- Não altera Pesagem, Delivery ou o evento balanca.pesagem.concluida.v1.

ALTER TABLE tara.ordens
    ADD COLUMN IF NOT EXISTS resultado_status VARCHAR(30),
    ADD COLUMN IF NOT EXISTS resultado_motivo TEXT,
    ADD COLUMN IF NOT EXISTS resultado_versao INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS resultado_calculado_em TIMESTAMP WITHOUT TIME ZONE,
    ADD COLUMN IF NOT EXISTS delta_pre_operacao_kg NUMERIC(12,3),
    ADD COLUMN IF NOT EXISTS delta_pos_operacao_kg NUMERIC(12,3);

CREATE TABLE IF NOT EXISTS tara.ordem_resultados_historico (
    id UUID PRIMARY KEY,
    tenant_id UUID NOT NULL,
    ordem_id UUID NOT NULL REFERENCES tara.ordens(id) ON DELETE CASCADE,
    versao INTEGER NOT NULL,
    status VARCHAR(30) NOT NULL,
    motivo TEXT,
    marco_pre_id UUID REFERENCES tara.pesagem_marcos_oficiais(id),
    marco_pos_id UUID REFERENCES tara.pesagem_marcos_oficiais(id),
    peso_bruto_kg NUMERIC(12,3),
    peso_tara_kg NUMERIC(12,3),
    peso_liquido_kg NUMERIC(12,3),
    tara_source VARCHAR(20),
    delta_pre_operacao_kg NUMERIC(12,3),
    delta_pos_operacao_kg NUMERIC(12,3),
    calculado_em TIMESTAMP WITHOUT TIME ZONE NOT NULL,
    CONSTRAINT uq_TARA_ordem_resultado_versao UNIQUE (tenant_id, ordem_id, versao)
);

CREATE INDEX IF NOT EXISTS ix_TARA_ordem_resultado_historico_ordem
    ON tara.ordem_resultados_historico (tenant_id, ordem_id, versao DESC);

ALTER TABLE tara.ordem_resultados_historico ENABLE ROW LEVEL SECURITY;
ALTER TABLE tara.ordem_resultados_historico FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ordem_resultados_historico_tenant_isolation
    ON tara.ordem_resultados_historico;
CREATE POLICY ordem_resultados_historico_tenant_isolation
ON tara.ordem_resultados_historico
USING (tenant_id::text = NULLIF(current_setting('app.current_tenant_id', true), ''))
WITH CHECK (tenant_id::text = NULLIF(current_setting('app.current_tenant_id', true), ''));

