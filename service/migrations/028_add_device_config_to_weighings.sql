-- UP
ALTER TABLE tara.pesagens ADD COLUMN device_configuration_id UUID NULL REFERENCES tara.device_configurations(id);
-- Pesagens historicas podem ter esse campo nulo.

-- DOWN
ALTER TABLE tara.pesagens DROP COLUMN IF EXISTS device_configuration_id;
