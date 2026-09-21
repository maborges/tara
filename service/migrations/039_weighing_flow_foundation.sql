-- BALANCA-WEIGHING-FLOW-02B
-- Fundação aditiva para operações com N capturas.
-- Não transforma registros históricos nem altera o significado dos eventos v1.

ALTER TABLE tara.ordens
    ADD COLUMN IF NOT EXISTS natureza_operacao VARCHAR(30),
    ADD COLUMN IF NOT EXISTS modalidade VARCHAR(15);

ALTER TABLE tara.pesagens
    ADD COLUMN IF NOT EXISTS finalidade VARCHAR(20),
    ADD COLUMN IF NOT EXISTS metodo_medicao VARCHAR(20);

-- Estende a proteção imutável para as novas dimensões da captura. A função
-- original é recriada aqui para não editar uma migration histórica.
CREATE OR REPLACE FUNCTION tara.proteger_pesagem_confirmada()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'Pesagem confirmada é imutável e não pode ser removida';
    END IF;
    IF NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
       OR NEW.estacao_id IS DISTINCT FROM OLD.estacao_id
       OR NEW.local_id IS DISTINCT FROM OLD.local_id
       OR NEW.etapa IS DISTINCT FROM OLD.etapa
       OR NEW.peso_informado_kg IS DISTINCT FROM OLD.peso_informado_kg
       OR NEW.peso_aferido_kg IS DISTINCT FROM OLD.peso_aferido_kg
       OR NEW.peso_tara_kg IS DISTINCT FROM OLD.peso_tara_kg
       OR NEW.captured_via IS DISTINCT FROM OLD.captured_via
       OR NEW.operador_id IS DISTINCT FROM OLD.operador_id
       OR NEW.leitura_bruta IS DISTINCT FROM OLD.leitura_bruta
       OR NEW.captured_at IS DISTINCT FROM OLD.captured_at
       OR NEW.direcao_veiculo IS DISTINCT FROM OLD.direcao_veiculo
       OR NEW.natureza_mercadoria IS DISTINCT FROM OLD.natureza_mercadoria
       OR NEW.tipo_operacao IS DISTINCT FROM OLD.tipo_operacao
       OR NEW.finalidade IS DISTINCT FROM OLD.finalidade
       OR NEW.metodo_medicao IS DISTINCT FROM OLD.metodo_medicao
       OR NEW.contexto IS DISTINCT FROM OLD.contexto THEN
        RAISE EXCEPTION 'Captura física da pesagem é imutável';
    END IF;
    RETURN NEW;
END;
$$;

-- A direção histórica ENTRADA/SAIDA continua válida; INTERNA é aceita para
-- novas capturas. A validação de domínio fica no contrato Pydantic/Core para
-- preservar valores históricos sem reinterpretação.

-- A constraint antiga permitia apenas uma captura por etapa para todas as
-- ordens. Ela é substituída por um trigger que conserva essa regra para
-- ordens legadas e permite repetição somente quando a Ordem declara
-- modalidade MULTIPLA.
ALTER TABLE tara.pesagens
    DROP CONSTRAINT IF EXISTS uq_TARA_pesagens_ordem_etapa;
ALTER TABLE tara.pesagens
    DROP CONSTRAINT IF EXISTS uq_balanca_pesagens_ordem_etapa;

CREATE INDEX IF NOT EXISTS ix_TARA_pesagens_ordem_etapa
    ON tara.pesagens (tenant_id, ordem_id, etapa);

CREATE OR REPLACE FUNCTION tara.validar_repeticao_etapa_pesagem()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
    ordem_modalidade varchar(15);
BEGIN
    IF NEW.ordem_id IS NULL THEN
        RETURN NEW;
    END IF;

    SELECT modalidade INTO ordem_modalidade
      FROM tara.ordens
     WHERE id = NEW.ordem_id
       AND tenant_id = NEW.tenant_id;

    IF ordem_modalidade = 'MULTIPLA' THEN
        RETURN NEW;
    END IF;

    IF EXISTS (
        SELECT 1
          FROM tara.pesagens p
         WHERE p.tenant_id = NEW.tenant_id
           AND p.ordem_id = NEW.ordem_id
           AND p.etapa = NEW.etapa
           AND p.id <> NEW.id
    ) THEN
        RAISE EXCEPTION 'Já existe captura para a etapa % nesta Ordem legada', NEW.etapa
            USING ERRCODE = 'unique_violation';
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_TARA_pesagem_unique_legacy_stage ON tara.pesagens;
CREATE TRIGGER trg_TARA_pesagem_unique_legacy_stage
BEFORE INSERT OR UPDATE OF ordem_id, etapa ON tara.pesagens
FOR EACH ROW EXECUTE FUNCTION tara.validar_repeticao_etapa_pesagem();

CREATE TABLE IF NOT EXISTS tara.pesagem_marcos_oficiais (
    id UUID PRIMARY KEY,
    tenant_id UUID NOT NULL,
    ordem_id UUID NOT NULL REFERENCES tara.ordens(id) ON DELETE CASCADE,
    pesagem_id UUID NOT NULL REFERENCES tara.pesagens(id) ON DELETE CASCADE,
    etapa VARCHAR(30) NOT NULL,
    decidido_em TIMESTAMP WITHOUT TIME ZONE NOT NULL,
    operador_id UUID REFERENCES tara.operadores(id),
    CONSTRAINT uq_TARA_marco_oficial_ordem_etapa UNIQUE (tenant_id, ordem_id, etapa)
);

CREATE INDEX IF NOT EXISTS ix_TARA_marcos_oficiais_pesagem
    ON tara.pesagem_marcos_oficiais (tenant_id, pesagem_id);

CREATE OR REPLACE FUNCTION tara.validar_marco_pesagem_mesma_operacao()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
    captura_tenant uuid;
    captura_ordem uuid;
    captura_etapa varchar(30);
BEGIN
    SELECT tenant_id, ordem_id, etapa
      INTO captura_tenant, captura_ordem, captura_etapa
      FROM tara.pesagens
     WHERE id = NEW.pesagem_id;

    IF captura_tenant IS NULL
       OR captura_tenant IS DISTINCT FROM NEW.tenant_id
       OR captura_ordem IS DISTINCT FROM NEW.ordem_id
       OR captura_etapa IS DISTINCT FROM NEW.etapa THEN
        RAISE EXCEPTION 'Marco oficial deve referenciar captura da mesma operação, tenant e etapa';
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_TARA_marco_pesagem_same_operation ON tara.pesagem_marcos_oficiais;
CREATE TRIGGER trg_TARA_marco_pesagem_same_operation
BEFORE INSERT OR UPDATE OF tenant_id, ordem_id, pesagem_id, etapa
ON tara.pesagem_marcos_oficiais
FOR EACH ROW EXECUTE FUNCTION tara.validar_marco_pesagem_mesma_operacao();

ALTER TABLE tara.pesagem_marcos_oficiais ENABLE ROW LEVEL SECURITY;
ALTER TABLE tara.pesagem_marcos_oficiais FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS pesagem_marcos_oficiais_tenant_isolation ON tara.pesagem_marcos_oficiais;
CREATE POLICY pesagem_marcos_oficiais_tenant_isolation
ON tara.pesagem_marcos_oficiais
USING (tenant_id::text = NULLIF(current_setting('app.current_tenant_id', true), ''))
WITH CHECK (tenant_id::text = NULLIF(current_setting('app.current_tenant_id', true), ''));
