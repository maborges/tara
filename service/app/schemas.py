from datetime import datetime
from decimal import Decimal
from typing import Any, Literal
import uuid

from pydantic import BaseModel, ConfigDict, Field, field_validator


class ClientIn(BaseModel):
    sistema_cliente: str = Field(min_length=1, max_length=80)
    tenant_cliente_id: str = Field(min_length=1, max_length=120)
    nome_exibicao: str = Field(min_length=1, max_length=160)


class ClientOut(ClientIn):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    conta_id: uuid.UUID
    status: str


class AccountOut(BaseModel):
    id: uuid.UUID
    nome: str
    status: str


class PlatformAccountOut(AccountOut):
    tenant_id: uuid.UUID
    owner_email: str | None = None
    owner_nome: str | None = None


class PlatformAccountUpdateIn(BaseModel):
    nome: str = Field(min_length=2, max_length=160)
    status: str = Field(pattern="^(ATIVA|INATIVA)$")


class PlatformDashboardOut(BaseModel):
    accounts_total: int
    accounts_by_status: dict[str, int] = Field(default_factory=dict)
    clients_total: int
    api_keys_active: int
    orders_total: int
    orders_open: int
    orders_completed: int
    weighings_total: int
    weighings_pending: int
    stations_total: int
    stations_active: int
    operators_active: int
    events_total: int
    events_pending: int
    client_systems: list[dict[str, Any]] = Field(default_factory=list)


class AccountDashboardOut(PlatformDashboardOut):
    account_id: uuid.UUID
    account_name: str
    account_status: str
    owner_email: str | None = None
    owner_name: str | None = None


class WebhookDestinationIn(BaseModel):
    target_url: str = Field(min_length=8, max_length=500)
    hmac_secret: str | None = Field(default=None, min_length=32, max_length=255)
    event_types: list[str] = Field(default_factory=lambda: ["balanca.pesagem.concluida.v1"])
    max_attempts: int = Field(default=8, ge=1, le=50)
    retry_base_seconds: int = Field(default=2, ge=1, le=3600)

    @field_validator("target_url")
    @classmethod
    def require_https(cls, value: str) -> str:
        if not value.lower().startswith("https://"):
            raise ValueError("O destino do webhook deve usar HTTPS")
        return value


class WebhookDestinationOut(BaseModel):
    target_url: str
    status: str
    event_types: list[str]
    configured: bool = True
    updated_at: datetime
    max_attempts: int
    retry_base_seconds: int


class WebhookStatusIn(BaseModel):
    enabled: bool


class WebhookTestOut(BaseModel):
    accepted: bool
    status_code: int | None = None
    message: str


class LoginIn(BaseModel):
    login: str = Field(min_length=1, max_length=120)
    password: str = Field(min_length=8, max_length=128)


class LoginOut(BaseModel):
    access_token: str
    token_type: Literal["bearer"] = "bearer"
    expires_in: int
    user_id: uuid.UUID
    tenant_id: uuid.UUID
    permissions: list[str]


class PortalRegisterIn(BaseModel):
    nome_conta: str = Field(min_length=2, max_length=160)
    nome_exibicao: str = Field(min_length=2, max_length=160)
    email: str = Field(min_length=5, max_length=255)
    password: str = Field(min_length=8, max_length=128)


class PortalLoginOut(BaseModel):
    access_token: str
    token_type: Literal["bearer"] = "bearer"
    expires_in: int
    user_id: uuid.UUID
    account_id: uuid.UUID
    nome_conta: str
    nome_exibicao: str
    email: str
    role: str


class PortalRegisterOut(BaseModel):
    message: str
    email: str


class PortalActionOut(BaseModel):
    message: str


class PortalResetTokenOut(BaseModel):
    valido: bool
    email: str | None = None
    expira_em: datetime | None = None
    mensagem: str | None = None


class PortalForgotPasswordIn(BaseModel):
    email: str = Field(min_length=5, max_length=255)


class PortalEmailTokenIn(BaseModel):
    token: str = Field(min_length=32, max_length=256)


class PortalPasswordResetIn(PortalEmailTokenIn):
    password: str = Field(min_length=8, max_length=128)


class PortalAccountUpdateIn(BaseModel):
    nome_conta: str = Field(min_length=2, max_length=160)
    nome_exibicao: str = Field(min_length=2, max_length=160)


class PlatformEmailSettingsIn(BaseModel):
    enabled: bool = False
    smtp_host: str | None = Field(default=None, max_length=255)
    smtp_port: int = Field(default=587, ge=1, le=65535)
    smtp_username: str | None = Field(default=None, max_length=255)
    smtp_password: str | None = Field(default=None, max_length=512)
    smtp_from: str = Field(min_length=3, max_length=255)
    smtp_starttls: bool = True
    smtp_ssl: bool = False


class PlatformEmailSettingsOut(BaseModel):
    enabled: bool
    smtp_host: str | None
    smtp_port: int
    smtp_username: str | None
    smtp_password_configured: bool
    smtp_from: str
    smtp_starttls: bool
    smtp_ssl: bool


class PlatformEmailTestIn(BaseModel):
    recipient: str = Field(min_length=5, max_length=255)


class PlatformSecuritySettingsIn(BaseModel):
    session_minutes: int = Field(default=30, ge=5, le=480)
    idle_minutes: int = Field(default=120, ge=15, le=1440)
    refresh_enabled: bool = True
    warning_minutes: int = Field(default=5, ge=1, le=60)


class PlatformSecuritySettingsOut(PlatformSecuritySettingsIn):
    pass


class PortalMeOut(BaseModel):
    user_id: uuid.UUID
    account_id: uuid.UUID
    nome_conta: str
    nome_exibicao: str
    email: str
    role: str


class PortalUserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    email: str
    nome_exibicao: str
    role: str
    status: str
    created_at: datetime


class PortalUserUpdateIn(BaseModel):
    role: Literal["OWNER", "ADMIN", "MEMBER"]
    status: Literal["ATIVO", "INATIVO"]


class ApiClientIn(BaseModel):
    nome: str = Field(min_length=1, max_length=160)
    scopes: list[str] = Field(min_length=1, max_length=30)
    expires_at: datetime | None = None


class ApiClientUpdateIn(BaseModel):
    nome: str = Field(min_length=1, max_length=160)
    scopes: list[str] = Field(min_length=1, max_length=30)
    expires_at: datetime | None = None


class ApiClientOut(BaseModel):
    client_id: str
    client_secret: str
    nome: str
    scopes: list[str]
    expires_at: datetime | None


class ApiClientCredentialOut(ApiClientOut):
    """Credential returned only at creation or rotation time."""


class ApiClientStatusOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    client_id: str
    nome: str
    scopes: list[str]
    status: str
    expires_at: datetime | None
    created_at: datetime
    last_used_at: datetime | None


class ApiClientListOut(ApiClientStatusOut):
    """Credencial administrativa sem segredo reversível."""


class ApiClientSystemOut(BaseModel):
    sistema_cliente: str
    tenant_cliente_id: str
    nome_exibicao: str
    status: str


class ApiClientConfigurationOut(BaseModel):
    client_id: str
    account_id: uuid.UUID
    sistemas_clientes: list[ApiClientSystemOut] = Field(default_factory=list)


class ContingencyRecordIn(BaseModel):
    local_id: str = Field(min_length=1, max_length=120)
    ordem_id: uuid.UUID | None = None
    subject_type: Literal["VEICULO", "ANIMAL"] | None = None
    tipo_pesagem: str | None = Field(default=None, max_length=30)
    etapa: str = Field(min_length=1, max_length=30)
    numero_ticket: str | None = Field(default=None, max_length=120)
    peso_informado_kg: str | None = None
    peso_aferido_kg: str = Field(min_length=1, max_length=30)
    peso_tara_kg: str | None = None
    captured_via: Literal["MANUAL", "ELETRONICA"] = "MANUAL"
    leitura_bruta: dict[str, Any] | None = None
    data_pesagem: datetime | None = None
    contexto: dict[str, Any] = Field(default_factory=dict)


class ContingencyPackageIn(BaseModel):
    schema_version: Literal["balanca.contingency.v1"]
    package_id: str = Field(min_length=1, max_length=120)
    sequence_number: int = Field(gt=0)
    tenant_id: uuid.UUID
    station_id: uuid.UUID
    device_id: str = Field(min_length=1, max_length=120)
    exported_at: datetime
    station_public_key: dict[str, Any]
    records: list[ContingencyRecordIn] = Field(max_length=500)
    signature: str = Field(min_length=20, max_length=2048)


class ContingencyImportOut(BaseModel):
    lot_id: uuid.UUID
    package_id: str
    status: Literal["IMPORTADO", "PARCIAL", "REJEITADO", "RECEBIDO"]
    message: str | None = None
    results: list[dict[str, Any]] = Field(default_factory=list)


class UserBootstrapIn(BaseModel):
    login: str = Field(min_length=1, max_length=120)
    nome_exibicao: str = Field(min_length=1, max_length=160)
    password: str = Field(min_length=8, max_length=128)


class OrderIn(BaseModel):
    client_system: str = Field(min_length=1, max_length=80)
    client_tenant_id: str = Field(min_length=1, max_length=120)
    external_reference: str = Field(min_length=1, max_length=180)
    correlation_id: str = Field(min_length=1, max_length=120)
    subject_type: Literal["VEICULO", "ANIMAL"]
    tipo_pesagem: str = Field(min_length=1, max_length=30)
    contexto: dict[str, Any] = Field(default_factory=dict)


class OrderOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    sistema_cliente: str
    tenant_cliente_id: str
    referencia_externa: str
    correlation_id: str
    subject_type: str
    tipo_pesagem: str
    contexto: dict[str, Any]
    status: str
    peso_liquido_kg: Decimal | None
    created_at: datetime
    concluida_em: datetime | None


class OrderPageOut(BaseModel):
    items: list[OrderOut]
    next_cursor: str | None = None


class StationIn(BaseModel):
    external_id: str = Field(min_length=1, max_length=120)
    nome: str = Field(min_length=1, max_length=160)
    conta_id: uuid.UUID | None = None


class StationOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    conta_id: uuid.UUID
    conta_nome: str | None = None
    external_id: str
    nome: str
    activation_code: str | None
    status: str


class ActivationIn(BaseModel):
    activation_code: str = Field(min_length=8, max_length=12)


class ActivationOut(BaseModel):
    station_id: uuid.UUID
    station_token: str
    expires_at: datetime | None = None
    recovery_secret: str | None = None


class OperatorIn(BaseModel):
    codigo: str = Field(min_length=1, max_length=40)
    nome_exibicao: str = Field(min_length=1, max_length=150)
    pessoa_ref: str | None = Field(default=None, max_length=120)
    identificador_externo: str | None = Field(default=None, max_length=120)
    pin: str | None = Field(default=None, min_length=4, max_length=32)
    pin_hash: str | None = Field(default=None, max_length=255)


class OperatorOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    codigo: str
    nome_exibicao: str
    pessoa_ref: str | None
    identificador_externo: str | None
    status: str
    created_at: datetime


class PortalOperatorIn(BaseModel):
    codigo: str = Field(min_length=1, max_length=40)
    identificador_externo: str = Field(min_length=1, max_length=120)
    nome_exibicao: str = Field(min_length=1, max_length=150)
    pessoa_ref: str | None = Field(default=None, max_length=120)
    senha_inicial: str = Field(min_length=4, max_length=128)


class StationRecoveryOut(BaseModel):
    station_id: uuid.UUID
    recovery_secret: str
    recovery_secret_version: int


class ProvisionedOperatorOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    codigo: str
    identificador_externo: str | None
    nome_exibicao: str
    pin_hash: str | None
    status: str


class StationProvisioningOut(BaseModel):
    station_id: uuid.UUID
    station_external_id: str
    provisioning_version: int
    recovery_secret_hash: str | None
    recovery_secret_version: int
    operators: list[ProvisionedOperatorOut]


class WeighingIn(BaseModel):
    estacao_id: uuid.UUID | None = None
    ordem_id: uuid.UUID | None = None
    client_system: str | None = Field(default=None, min_length=1, max_length=80)
    client_tenant_id: str | None = Field(default=None, min_length=1, max_length=120)
    subject_type: Literal["VEICULO", "ANIMAL"] | None = None
    tipo_pesagem: str | None = Field(default=None, min_length=1, max_length=30)
    local_id: str = Field(min_length=1, max_length=120)
    etapa: str = Field(min_length=1, max_length=30)
    peso_aferido_kg: Decimal = Field(gt=Decimal("0"))
    peso_informado_kg: Decimal | None = None
    peso_tara_kg: Decimal | None = None
    captured_via: Literal["MANUAL", "ELETRONICA"] = "MANUAL"
    operador_id: uuid.UUID | None = None
    leitura_bruta: dict[str, Any] | None = None
    captured_at: datetime | None = None
    direcao_veiculo: Literal["ENTRADA", "SAIDA"] | None = None
    natureza_mercadoria: Literal["ENTRADA", "SAIDA", "NEUTRA"] | None = None
    tipo_operacao: str | None = Field(default=None, max_length=60)
    contexto: dict[str, Any] = Field(default_factory=dict)


class WeighingOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    estacao_id: uuid.UUID | None
    ordem_id: uuid.UUID | None
    local_id: str
    etapa: str
    peso_aferido_kg: Decimal
    peso_informado_kg: Decimal | None
    peso_tara_kg: Decimal | None
    captured_via: str
    captured_at: datetime
    reconciliation_status: str
    direcao_veiculo: str | None
    natureza_mercadoria: str | None
    tipo_operacao: str | None
    contexto: dict[str, Any]


class WeighingReconciliationIn(BaseModel):
    ordem_id: uuid.UUID | None = None
    status: Literal["VINCULADA", "CRIAR_ORDEM", "PENDENTE_RECONCILIACAO", "REJEITADA"]
    ordem: OrderIn | None = None


class WeighingPageOut(BaseModel):
    items: list[WeighingOut]
    next_cursor: str | None = None


class EventOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    idempotency_key: str
    event_type: str
    event_version: str
    correlation_id: str
    status: str
    payload: dict[str, Any]
    attempts: int
    created_at: datetime
    updated_at: datetime
    next_attempt_at: datetime | None = None
    delivered_at: datetime | None = None
    last_error: str | None = None


class EventReplayAuditOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    actor_user_id: uuid.UUID
    previous_status: str
    reason: str
    created_at: datetime


class SyncItemIn(BaseModel):
    local_id: str
    payload: dict[str, Any] = Field(default_factory=dict)


class SyncPushIn(BaseModel):
    items: list[SyncItemIn] = Field(default_factory=list, max_length=50)


class SyncResultOut(BaseModel):
    local_id: str
    status: Literal["CREATED", "ERROR"]
    server_id: uuid.UUID | None = None
    error_message: str | None = None


class SyncPushOut(BaseModel):
    processed_at: datetime
    results: list[SyncResultOut]


class OperatorLoginIn(BaseModel):
    operador_id: uuid.UUID
    pin: str = Field(min_length=4, max_length=32)
