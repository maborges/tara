from __future__ import annotations

import uuid
from datetime import datetime
from decimal import Decimal

from sqlalchemy import DateTime, ForeignKey, Index, Integer, Numeric, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    pass


class Usuario(Base):
    __tablename__ = "usuarios"
    __table_args__ = (
        UniqueConstraint("tenant_id", "login", name="uq_balanca_usuarios_login"),
        {"schema": "balanca"},
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
        UniqueConstraint("login", name="uq_balanca_platform_admin_login"),
        UniqueConstraint("usuario_id", name="uq_balanca_platform_admin_usuario"),
        {"schema": "balanca"},
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True)
    usuario_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("balanca.usuarios.id", ondelete="CASCADE"), nullable=False
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
        UniqueConstraint("tenant_id", "codigo", name="uq_balanca_papeis_codigo"),
        {"schema": "balanca"},
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True)
    tenant_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    codigo: Mapped[str] = mapped_column(String(80), nullable=False)
    nome: Mapped[str] = mapped_column(String(160), nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="ATIVO")


class Permissao(Base):
    __tablename__ = "permissoes"
    __table_args__ = (
        UniqueConstraint("tenant_id", "codigo", name="uq_balanca_permissoes_codigo"),
        {"schema": "balanca"},
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True)
    tenant_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    codigo: Mapped[str] = mapped_column(String(120), nullable=False)
    descricao: Mapped[str] = mapped_column(String(240), nullable=False)


class UsuarioPapel(Base):
    __tablename__ = "usuario_papeis"
    __table_args__ = (
        UniqueConstraint("usuario_id", "papel_id", name="uq_balanca_usuario_papel"),
        {"schema": "balanca"},
    )

    usuario_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("balanca.usuarios.id", ondelete="CASCADE"), primary_key=True
    )
    papel_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("balanca.papeis.id", ondelete="CASCADE"), primary_key=True
    )


class PapelPermissao(Base):
    __tablename__ = "papel_permissoes"
    __table_args__ = (
        UniqueConstraint("papel_id", "permissao_id", name="uq_balanca_papel_permissao"),
        {"schema": "balanca"},
    )

    papel_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("balanca.papeis.id", ondelete="CASCADE"), primary_key=True
    )
    permissao_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("balanca.permissoes.id", ondelete="CASCADE"), primary_key=True
    )


class ApiClient(Base):
    __tablename__ = "api_clients"
    __table_args__ = (
        UniqueConstraint("client_id", name="uq_balanca_api_clients_client_id"),
        {"schema": "balanca"},
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


class Conta(Base):
    __tablename__ = "contas"
    __table_args__ = {"schema": "balanca"}

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True)
    tenant_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False, unique=True)
    nome: Mapped[str] = mapped_column(String(160), nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False)


class Cliente(Base):
    __tablename__ = "clientes"
    __table_args__ = (
        UniqueConstraint("tenant_id", "sistema_cliente", "tenant_cliente_id", name="uq_balanca_clientes_external_tenant"),
        {"schema": "balanca"},
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True)
    tenant_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    conta_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("balanca.contas.id"), nullable=False)
    sistema_cliente: Mapped[str] = mapped_column(String(80), nullable=False)
    tenant_cliente_id: Mapped[str] = mapped_column(String(120), nullable=False)
    nome_exibicao: Mapped[str] = mapped_column(String(160), nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False)


class Outbox(Base):
    __tablename__ = "eventos_outbox"
    __table_args__ = {"schema": "balanca"}

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True)
    tenant_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    conta_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("balanca.contas.id"), nullable=False)
    cliente_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("balanca.clientes.id"), nullable=True)
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
        UniqueConstraint("tenant_id", "external_id", name="uq_balanca_estacoes_external"),
        {"schema": "balanca"},
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True)
    tenant_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
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
        UniqueConstraint("tenant_id", "codigo", name="uq_balanca_operadores_codigo"),
        {"schema": "balanca"},
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
        UniqueConstraint("tenant_id", "sistema_cliente", "referencia_externa", name="uq_balanca_ordens_external"),
        Index("ix_balanca_ordens_status", "tenant_id", "status"),
        {"schema": "balanca"},
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True)
    tenant_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    cliente_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("balanca.clientes.id"), nullable=False)
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
        UniqueConstraint("tenant_id", "local_id", name="uq_balanca_pesagens_local"),
        UniqueConstraint("ordem_id", "etapa", name="uq_balanca_pesagens_ordem_etapa"),
        {"schema": "balanca"},
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True)
    tenant_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    ordem_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("balanca.ordens.id"), nullable=False)
    local_id: Mapped[str] = mapped_column(String(120), nullable=False)
    etapa: Mapped[str] = mapped_column(String(30), nullable=False)
    peso_informado_kg: Mapped[Decimal | None] = mapped_column(Numeric(12, 3), nullable=True)
    peso_aferido_kg: Mapped[Decimal] = mapped_column(Numeric(12, 3), nullable=False)
    peso_tara_kg: Mapped[Decimal | None] = mapped_column(Numeric(12, 3), nullable=True)
    captured_via: Mapped[str] = mapped_column(String(20), nullable=False)
    operador_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("balanca.operadores.id"), nullable=True)
    leitura_bruta: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    captured_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)


class ContingenciaLote(Base):
    __tablename__ = "contingencia_lotes"
    __table_args__ = (
        UniqueConstraint("tenant_id", "package_id", name="uq_balanca_contingencia_package"),
        UniqueConstraint("tenant_id", "station_id", "sequence_number", name="uq_balanca_contingencia_sequence"),
        {"schema": "balanca"},
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True)
    tenant_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    station_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("balanca.estacoes.id"), nullable=False)
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
        UniqueConstraint("tenant_id", "local_id", name="uq_balanca_contingencia_local"),
        {"schema": "balanca"},
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True)
    tenant_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    lote_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("balanca.contingencia_lotes.id", ondelete="CASCADE"), nullable=False)
    local_id: Mapped[str] = mapped_column(String(120), nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False)
    pesagem_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("balanca.pesagens.id"), nullable=True)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    payload: Mapped[dict] = mapped_column(JSONB, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
