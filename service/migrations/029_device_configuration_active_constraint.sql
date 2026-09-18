CREATE UNIQUE INDEX IF NOT EXISTS uq_TARA_device_configuration_active_installation
    ON tara.device_configurations (instalacao_id)
    WHERE status = 'ACTIVE';
