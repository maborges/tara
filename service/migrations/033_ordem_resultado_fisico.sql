-- Resultado físico completo da operação de pesagem.
-- Para pesagem única: bruto = peso_aferido, tara = peso_tara_informado (ou NULL),
--                     liquido = bruto - (tara or 0), tara_source = CLIENT_PROVIDED | NONE.
-- Para pesagem dupla: bruto = max(pesagens.peso_aferido_kg), tara = min(pesagens.peso_aferido_kg),
--                     liquido = bruto - tara, tara_source = MEASURED.
-- Colunas nullable e sem DEFAULT para compatibilidade retroativa com ordens existentes.

-- UP
ALTER TABLE tara.ordens
    ADD COLUMN IF NOT EXISTS peso_bruto_kg NUMERIC(12,3) NULL,
    ADD COLUMN IF NOT EXISTS peso_tara_kg  NUMERIC(12,3) NULL,
    ADD COLUMN IF NOT EXISTS tara_source   VARCHAR(20)   NULL;

COMMENT ON COLUMN tara.ordens.peso_bruto_kg IS
    'Peso bruto da operação: peso_aferido na única etapa (UNICA) ou max das pesagens (DUPLA).';
COMMENT ON COLUMN tara.ordens.peso_tara_kg IS
    'Peso tara da operação: peso_tara_informado (UNICA/CLIENT_PROVIDED) ou min das pesagens (DUPLA/MEASURED).';
COMMENT ON COLUMN tara.ordens.tara_source IS
    'Origem da tara: MEASURED (medida fisicamente), CLIENT_PROVIDED (informada pelo consumidor), NONE (sem tara).';

-- DOWN
ALTER TABLE tara.ordens
    DROP COLUMN IF EXISTS peso_bruto_kg,
    DROP COLUMN IF EXISTS peso_tara_kg,
    DROP COLUMN IF EXISTS tara_source;
