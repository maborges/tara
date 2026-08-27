from functools import lru_cache

from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_prefix="BALANCA_")

    service_name: str = "balanca-service"
    environment: str = "development"
    database_url: str = "postgresql+asyncpg://postgres:postgres@localhost:5432/farms"
    client_id_header: str = "X-Balanca-Client-ID"
    jwt_secret_secret: str = "change-me-in-production"
    jwt_algorithm: str = "HS256"
    jwt_access_minutes: int = 30
    host: str = "0.0.0.0"
    port: int = 8010
    service_version: str = "1.0.0"
    cors_origins: list[str] = [
        "http://localhost:3004", "http://127.0.0.1:3004",
        "http://localhost:3005", "http://127.0.0.1:3005",
    ]
    outbox_tenant_id: str | None = None
    outbox_target_url: str | None = None
    outbox_target_api_key: str | None = None
    outbox_file_path: str | None = None
    outbox_batch_size: int = 50
    outbox_interval_seconds: int = 10
    allow_legacy_api_key: bool = False
    public_url: str = "http://localhost:3005"
    email_token_minutes: int = 30

    @model_validator(mode="after")
    def validate_production_secrets(self):
        if self.environment == "production":
            if self.jwt_secret_secret.startswith("change-me") or len(self.jwt_secret_secret) < 32:
                raise ValueError("BALANCA_JWT_SECRET_SECRET deve ser trocado em produção")
            if self.allow_legacy_api_key:
                raise ValueError("BALANCA_ALLOW_LEGACY_API_KEY deve ser false em produção")
        return self


@lru_cache
def get_settings() -> Settings:
    return Settings()
