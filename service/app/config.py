import json
from functools import lru_cache

from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_prefix="TARA_")

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
    outbox_tenant_ids: str | None = None
    outbox_target_url: str | None = None
    outbox_target_api_key: str | None = None
    outbox_account_destinations_json: str | None = None
    outbox_file_path: str | None = None
    outbox_batch_size: int = 50
    outbox_interval_seconds: int = 10
    allow_legacy_api_key: bool = False
    public_url: str = "http://localhost:3005"
    email_token_minutes: int = 30
    delivery_retention_days: int = 30

    @model_validator(mode="after")
    def validate_production_secrets(self):
        if self.environment == "production":
            if self.jwt_secret_secret.startswith("change-me") or len(self.jwt_secret_secret) < 32:
                raise ValueError("TARA_JWT_SECRET_SECRET deve ser trocado em produção")
            if self.allow_legacy_api_key:
                raise ValueError("TARA_ALLOW_LEGACY_API_KEY deve ser false em produção")
        return self

    def outbox_destination(self, account_id: str) -> tuple[str, str] | None:
        """Return the URL and HMAC secret configured for one account."""
        if self.outbox_account_destinations_json:
            try:
                destinations = json.loads(self.outbox_account_destinations_json)
            except json.JSONDecodeError as exc:
                raise ValueError("TARA_OUTBOX_ACCOUNT_DESTINATIONS_JSON inválido") from exc
            destination = destinations.get(account_id)
            if destination:
                if not destination.get("url") or not destination.get("hmac_secret"):
                    raise ValueError(f"Destino de outbox incompleto para a conta {account_id}")
                return destination["url"], destination["hmac_secret"]
        if self.outbox_target_url and self.outbox_target_api_key:
            return self.outbox_target_url, self.outbox_target_api_key
        return None

    def worker_tenant_ids(self) -> list[str]:
        """Return the configured tenants for an outbox worker, without bypassing RLS."""
        values = self.outbox_tenant_ids or self.outbox_tenant_id or ""
        return [value.strip() for value in values.split(",") if value.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
