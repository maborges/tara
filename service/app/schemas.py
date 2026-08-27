from datetime import datetime
from decimal import Decimal
from typing import Any, Literal
import uuid

from pydantic import BaseModel, ConfigDict, Field


class ClientIn(BaseModel):
    sistema_cliente: str = Field(min_length=1, max_length=80)
    tenant_cliente_id: str = Field(min_length=1, max_length=120)
    nome_exibicao: str = Field(min_length=1, max_length=160)


class ClientOut(ClientIn):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    conta_id: uuid.UUID
    status: str


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
    tenant_id: uuid.UUID
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


class PortalMeOut(BaseModel):
    user_id: uuid.UUID
    account_id: uuid.UUID
    tenant_id: uuid.UUID
    nome_conta: str
    nome_exibicao: str
    email: str
    role: str


class ApiClientIn(BaseModel):
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


class StationIn(BaseModel):
    external_id: str = Field(min_length=1, max_length=120)
    nome: str = Field(min_length=1, max_length=160)


class StationOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
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


class OperatorIn(BaseModel):
    codigo: str = Field(min_length=1, max_length=40)
    nome_exibicao: str = Field(min_length=1, max_length=150)
    pessoa_ref: str | None = Field(default=None, max_length=120)
    pin: str | None = Field(default=None, min_length=4, max_length=32)
    pin_hash: str | None = Field(default=None, max_length=255)


class OperatorOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    codigo: str
    nome_exibicao: str
    pessoa_ref: str | None
    status: str
    created_at: datetime


class WeighingIn(BaseModel):
    ordem_id: uuid.UUID
    local_id: str = Field(min_length=1, max_length=120)
    etapa: str = Field(min_length=1, max_length=30)
    peso_aferido_kg: Decimal = Field(gt=Decimal("0"))
    peso_informado_kg: Decimal | None = None
    peso_tara_kg: Decimal | None = None
    captured_via: Literal["MANUAL", "ELETRONICA"] = "MANUAL"
    operador_id: uuid.UUID | None = None
    leitura_bruta: dict[str, Any] | None = None
    captured_at: datetime | None = None


class WeighingOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    ordem_id: uuid.UUID
    local_id: str
    etapa: str
    peso_aferido_kg: Decimal
    peso_informado_kg: Decimal | None
    peso_tara_kg: Decimal | None
    captured_via: str
    captured_at: datetime


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
