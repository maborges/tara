from __future__ import annotations

import uuid
from datetime import datetime
from decimal import Decimal

from sqlalchemy import Boolean, DateTime, ForeignKey, Index, Integer, Numeric, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    pass


class Usuario(Base):
    __tablename__ = "usuarios"
    __table_args__ = (
        UniqueConstraint("tenant_id", "login", name="uq_TARA_usuarios_login"),
        {"schema": "tara", "comment": "Usuários internos autenticados da operação e do backoffice, associados a uma Conta."},
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True)
    tenant_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    login: Mapped[str] = mapped_column(String(120), nullable=False)
    nome_exibicao: Mapped[str] = mapped_column(String(160), nullable=False)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="ATIVO")
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    last_login_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)


class AdministradorPlataforma(Base):
    __tablename__ = "administradores_plataforma"
    __table_args__ = (
        UniqueConstraint("login", name="uq_TARA_platform_admin_login"),
        UniqueConstraint("usuario_id", name="uq_TARA_platform_admin_usuario"),
        {"schema": "tara", "comment": "Administradores globais autorizados a operar a plataforma sem seleção prévia de tenant."},
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True)
    usuario_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("tara.usuarios.id", ondelete="CASCADE"), nullable=False
    )
    tenant_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    login: Mapped[str] = mapped_column(String(120), nullable=False)
    nome_exibicao: Mapped[str] = mapped_column(String(160), nullable=False)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="ATIVO")
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    last_login_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)


class Papel(Base):
    __tablename__ = "papeis"
    __table_args__ = (
        UniqueConstraint("tenant_id", "codigo", name="uq_TARA_papeis_codigo"),
        {"schema": "tara", "comment": "Papéis de acesso que agrupam permissões atribuíveis a usuários de uma Conta."},
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True)
    tenant_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    codigo: Mapped[str] = mapped_column(String(80), nullable=False)
    nome: Mapped[str] = mapped_column(String(160), nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="ATIVO")


class Permissao(Base):
    __tablename__ = "permissoes"
    __table_args__ = (
        UniqueConstraint("tenant_id", "codigo", name="uq_TARA_permissoes_codigo"),
        {"schema": "tara", "comment": "Permissões atômicas que representam capacidades autorizáveis na aplicação."},
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True)
    tenant_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    codigo: Mapped[str] = mapped_column(String(120), nullable=False)
    descricao: Mapped[str] = mapped_column(String(240), nullable=False)


class UsuarioPapel(Base):
    __tablename__ = "usuario_papeis"
    __table_args__ = (
        UniqueConstraint("usuario_id", "papel_id", name="uq_TARA_usuario_papel"),
        {"schema": "tara", "comment": "Tabela associativa entre usuários e papéis de acesso."},
    )

    usuario_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("tara.usuarios.id", ondelete="CASCADE"), primary_key=True
    )
    papel_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("tara.papeis.id", ondelete="CASCADE"), primary_key=True
    )


class PapelPermissao(Base):
    __tablename__ = "papel_permissoes"
    __table_args__ = (
        UniqueConstraint("papel_id", "permissao_id", name="uq_TARA_papel_permissao"),
        {"schema": "tara", "comment": "Tabela associativa entre papéis e permissões."},
    )

    papel_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("tara.papeis.id", ondelete="CASCADE"), primary_key=True
    )
    permissao_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("tara.permissoes.id", ondelete="CASCADE"), primary_key=True
    )


class ApiClient(Base):
    __tablename__ = "api_clients"
    __table_args__ = (
        UniqueConstraint("client_id", name="uq_TARA_api_clients_client_id"),
        {"schema": "tara", "comment": "Credenciais técnicas de sistemas consumidores, com escopos e estado de acesso."},
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True)
    tenant_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    client_id: Mapped[str] = mapped_column(String(120), nullable=False)
    nome: Mapped[str] = mapped_column(String(160), nullable=False)
    secret_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    scopes: Mapped[list] = mapped_column(JSONB, nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="ATIVO")
    expires_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    last_used_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)


class ApiClientSecret(Base):
    __tablename__ = "api_client_secrets"
    __table_args__ = (
        UniqueConstraint("api_client_id", "version", name="uq_TARA_api_client_secret_version"),
        {"schema": "tara", "comment": "Versões de segredos de API mantidas para rotação de credenciais sem indisponibilidade."},
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True)
    api_client_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("tara.api_clients.id", ondelete="CASCADE"), nullable=False)
    tenant_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    version: Mapped[int] = mapped_column(Integer, nullable=False)
    secret_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="ATIVO")
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    valid_until: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    last_used_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)


class Conta(Base):
    __tablename__ = "contas"
    __table_args__ = {"schema": "tara", "comment": "Organizações consumidoras da plataforma e unidade principal de isolamento dos dados."}

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True)
    tenant_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False, unique=True)
    nome: Mapped[str] = mapped_column(String(160), nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False)


class WebhookDestination(Base):
    __tablename__ = "webhook_destinations"
    __table_args__ = (
        UniqueConstraint("conta_id", name="uq_TARA_webhook_destination_account"),
        {"schema": "tara", "comment": "Destino HTTP configurado por uma Conta para receber eventos publicados pela plataforma."},
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True)
    tenant_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    conta_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("tara.contas.id", ondelete="CASCADE"), nullable=False)
    target_url: Mapped[str] = mapped_column(String(500), nullable=False)
    hmac_secret_encrypted: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="ATIVO")
    event_types: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)
    max_attempts: Mapped[int] = mapped_column(Integer, nullable=False, default=8)
    retry_base_seconds: Mapped[int] = mapped_column(Integer, nullable=False, default=2)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)


class OutboxReplayAudit(Base):
    __tablename__ = "outbox_replay_audits"
    __table_args__ = {"schema": "tara", "comment": "Auditoria das solicitações de replay de eventos já registrados na outbox."}

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True)
    tenant_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    outbox_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("tara.eventos_outbox.id", ondelete="CASCADE"), nullable=False)
    actor_user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    previous_status: Mapped[str] = mapped_column(String(20), nullable=False)
    reason: Mapped[str] = mapped_column(String(240), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)


class PortalUser(Base):
    __tablename__ = "portal_users"
    __table_args__ = (
        UniqueConstraint("email", name="uq_TARA__PORTal_user_email"),
        UniqueConstraint("usuario_id", name="uq_TARA__PORTal_user_usuario"),
        {"schema": "tara", "comment": "Usuários do Portal do Cliente, vinculados a uma Conta e às suas credenciais de acesso."},
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True)
    usuario_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("tara.usuarios.id", ondelete="SET NULL"), nullable=True
    )
    conta_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("tara.contas.id", ondelete="CASCADE"), nullable=False
    )
    tenant_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    email: Mapped[str] = mapped_column(String(255), nullable=False)
    nome_exibicao: Mapped[str] = mapped_column(String(160), nullable=False)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    role: Mapped[str] = mapped_column(String(40), nullable=False, default="OWNER")
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="ATIVO")
    email_verified_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    last_login_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)


class PortalToken(Base):
    __tablename__ = "portal_tokens"
    __table_args__ = (
        UniqueConstraint("token_hash", name="uq_TARA__PORTal_token_hash"),
        {"schema": "tara", "comment": "Tokens temporários do Portal usados para confirmação de e-mail e recuperação de acesso."},
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True)
    portal_user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("tara.portal_users.id", ondelete="CASCADE"), nullable=False
    )
    tenant_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    token_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    purpose: Mapped[str] = mapped_column(String(40), nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    used_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)


class PlatformSetting(Base):
    __tablename__ = "platform_settings"
    __table_args__ = {"schema": "tara", "comment": "Configurações globais da plataforma, incluindo valores protegidos administrados pelo backoffice."}

    key: Mapped[str] = mapped_column(String(120), primary_key=True)
    value: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_secret: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    updated_by: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)


class Cliente(Base):
    __tablename__ = "clientes"
    __table_args__ = (
        UniqueConstraint("tenant_id", "sistema_cliente", "tenant_cliente_id", name="uq_TARA_clientes_external_tenant"),
        {"schema": "tara", "comment": "Referências de clientes mantidas pela plataforma para correlacionar dados dos sistemas consumidores."},
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True)
    tenant_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    conta_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("tara.contas.id"), nullable=False)
    sistema_cliente: Mapped[str] = mapped_column(String(80), nullable=False)
    tenant_cliente_id: Mapped[str] = mapped_column(String(120), nullable=False)
    nome_exibicao: Mapped[str] = mapped_column(String(160), nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False)


class Outbox(Base):
    __tablename__ = "eventos_outbox"
    __table_args__ = {"schema": "tara", "comment": "Eventos de integração persistidos para entrega assíncrona e confiável aos sistemas consumidores."}

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True)
    tenant_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    conta_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("tara.contas.id"), nullable=False)
    cliente_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("tara.clientes.id"), nullable=True)
    idempotency_key: Mapped[str] = mapped_column(String(180), nullable=False)
    event_type: Mapped[str] = mapped_column(String(120), nullable=False)
    event_version: Mapped[str] = mapped_column(String(20), nullable=False)
    aggregate_type: Mapped[str] = mapped_column(String(80), nullable=False)
    aggregate_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    correlation_id: Mapped[str] = mapped_column(String(120), nullable=False)
    payload: Mapped[dict] = mapped_column(JSONB, nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False)
    attempts: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    next_attempt_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    last_error: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)


class Estacao(Base):
    __tablename__ = "estacoes"
    __table_args__ = (
        UniqueConstraint("tenant_id", "external_id", name="uq_TARA_estacoes_external"),
        {"schema": "tara", "comment": "Estações de pesagem autorizadas a capturar medições e sincronizar dados com a plataforma."},
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True)
    tenant_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    conta_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("tara.contas.id", ondelete="CASCADE"), nullable=False)
    external_id: Mapped[str] = mapped_column(String(120), nullable=False)
    nome: Mapped[str] = mapped_column(String(160), nullable=False)
    activation_code: Mapped[str | None] = mapped_column(String(12), nullable=True)
    token_hash: Mapped[str | None] = mapped_column(String(64), nullable=True)
    public_key: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    identity_fingerprint: Mapped[str | None] = mapped_column(String(64), nullable=True)
    status: Mapped[str] = mapped_column(String(20), nullable=False)
    last_seen_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)


class Operador(Base):
    __tablename__ = "operadores"
    __table_args__ = (
        UniqueConstraint("tenant_id", "codigo", name="uq_TARA_operadores_codigo"),
        {"schema": "tara", "comment": "Pessoas autorizadas a executar e identificar operações na estação de pesagem."},
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True)
    tenant_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    codigo: Mapped[str] = mapped_column(String(40), nullable=False)
    nome_exibicao: Mapped[str] = mapped_column(String(150), nullable=False)
    pessoa_ref: Mapped[str | None] = mapped_column(String(120), nullable=True)
    pin_hash: Mapped[str | None] = mapped_column(String(64), nullable=True)
    status: Mapped[str] = mapped_column(String(20), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)


class Ordem(Base):
    __tablename__ = "ordens"
    __table_args__ = (
        UniqueConstraint("tenant_id", "sistema_cliente", "referencia_externa", name="uq_TARA_ordens_external"),
        Index("ix_TARA_ordens_status", "tenant_id", "status"),
        {"schema": "tara", "comment": "Solicitações operacionais que orientam pesagens e correlacionam a operação com o sistema consumidor."},
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True)
    tenant_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    cliente_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("tara.clientes.id"), nullable=False)
    sistema_cliente: Mapped[str] = mapped_column(String(80), nullable=False)
    tenant_cliente_id: Mapped[str] = mapped_column(String(120), nullable=False)
    referencia_externa: Mapped[str] = mapped_column(String(180), nullable=False)
    correlation_id: Mapped[str] = mapped_column(String(120), nullable=False)
    subject_type: Mapped[str] = mapped_column(String(20), nullable=False)
    tipo_pesagem: Mapped[str] = mapped_column(String(30), nullable=False)
    contexto: Mapped[dict] = mapped_column(JSONB, nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False)
    peso_liquido_kg: Mapped[Decimal | None] = mapped_column(Numeric(12, 3), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    concluida_em: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)


class Pesagem(Base):
    __tablename__ = "pesagens"
    __table_args__ = (
        UniqueConstraint("tenant_id", "local_id", name="uq_TARA_pesagens_local"),
        UniqueConstraint("ordem_id", "etapa", name="uq_TARA_pesagens_ordem_etapa"),
        {"schema": "tara", "comment": "Registro imutável de uma medição realizada na balança, vinculada ou avulsa, com suas evidências."},
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True)
    tenant_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    estacao_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("tara.estacoes.id"), nullable=True)
    ordem_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("tara.ordens.id"), nullable=True)
    local_id: Mapped[str] = mapped_column(String(120), nullable=False)
    etapa: Mapped[str] = mapped_column(String(30), nullable=False)
    peso_informado_kg: Mapped[Decimal | None] = mapped_column(Numeric(12, 3), nullable=True)
    peso_aferido_kg: Mapped[Decimal] = mapped_column(Numeric(12, 3), nullable=False)
    peso_tara_kg: Mapped[Decimal | None] = mapped_column(Numeric(12, 3), nullable=True)
    captured_via: Mapped[str] = mapped_column(String(20), nullable=False)
    operador_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("tara.operadores.id"), nullable=True)
    leitura_bruta: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    captured_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    reconciliation_status: Mapped[str] = mapped_column(String(30), nullable=False, default="NAO_APLICAVEL")
    direcao_veiculo: Mapped[str | None] = mapped_column(String(10), nullable=True)
    natureza_mercadoria: Mapped[str | None] = mapped_column(String(10), nullable=True)
    tipo_operacao: Mapped[str | None] = mapped_column(String(60), nullable=True)
    contexto: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)


class ContingenciaLote(Base):
    __tablename__ = "contingencia_lotes"
    __table_args__ = (
        UniqueConstraint("tenant_id", "package_id", name="uq_TARA_contingencia_package"),
        UniqueConstraint("tenant_id", "station_id", "sequence_number", name="uq_TARA_contingencia_sequence"),
        {"schema": "tara", "comment": "Pacotes assinados de capturas transportados em contingência para importação posterior."},
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True)
    tenant_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    station_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("tara.estacoes.id"), nullable=False)
    package_id: Mapped[str] = mapped_column(String(120), nullable=False)
    sequence_number: Mapped[int] = mapped_column(Integer, nullable=False)
    schema_version: Mapped[str] = mapped_column(String(30), nullable=False)
    package_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    identity_fingerprint: Mapped[str] = mapped_column(String(64), nullable=False)
    record_count: Mapped[int] = mapped_column(Integer, nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False)
    raw_package: Mapped[dict] = mapped_column(JSONB, nullable=False)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    imported_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)


class ContingenciaItem(Base):
    __tablename__ = "contingencia_itens"
    __table_args__ = (
        UniqueConstraint("tenant_id", "local_id", name="uq_TARA_contingencia_local"),
        {"schema": "tara", "comment": "Itens individuais de captura contidos em um lote de contingência e seu resultado de importação."},
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True)
    tenant_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    lote_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("tara.contingencia_lotes.id", ondelete="CASCADE"), nullable=False)
    local_id: Mapped[str] = mapped_column(String(120), nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False)
    pesagem_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("tara.pesagens.id"), nullable=True)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    payload: Mapped[dict] = mapped_column(JSONB, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
