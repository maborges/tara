from datetime import datetime
import smtplib
import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select

from ..schemas import AccountDashboardOut, PlatformAccountOut, PlatformAccountUpdateIn, PlatformDashboardOut, PlatformEmailSettingsIn, PlatformEmailSettingsOut, PlatformEmailTestIn, PlatformSecuritySettingsIn, PlatformSecuritySettingsOut
from ..security import require_platform_admin
from ..platform_identity import encrypt_platform_secret, load_email_settings, load_security_settings, send_portal_email
from ..models import ApiClient, Cliente, Conta, Estacao, Operador, Ordem, Outbox, Pesagem, PlatformSetting, PortalUser

router = APIRouter(prefix="/v1/platform", tags=["Administração da Plataforma"])


@router.get("/security", response_model=PlatformSecuritySettingsOut)
async def get_security_settings(context=Depends(require_platform_admin)):
    session, _admin = context
    return await load_security_settings(session)


@router.put("/security", response_model=PlatformSecuritySettingsOut)
async def put_security_settings(data: PlatformSecuritySettingsIn, context=Depends(require_platform_admin)):
    session, admin = context
    for key, value in data.model_dump().items():
        await _upsert_setting(session, f"security.{key}", value, False, admin.usuario_id)
    await session.commit()
    return await load_security_settings(session)


@router.get("/dashboard", response_model=PlatformDashboardOut)
async def get_platform_dashboard(context=Depends(require_platform_admin)):
    session, _admin = context

    async def total(model, *filters):
        return int((await session.execute(select(func.count()).select_from(model).where(*filters))).scalar_one())

    account_status_result = await session.execute(
        select(Conta.status, func.count()).group_by(Conta.status).order_by(Conta.status)
    )
    accounts_by_status = {status: int(total_count) for status, total_count in account_status_result.all()}
    systems_result = await session.execute(
        select(ApiClient, Conta.nome.label("account_name"))
        .join(Conta, Conta.tenant_id == ApiClient.tenant_id)
        .order_by(ApiClient.last_used_at.desc().nullslast(), ApiClient.created_at.desc())
        .limit(50)
    )
    client_systems = [
        {"client_id": client.client_id, "nome": client.nome, "account_name": account_name,
         "status": client.status, "scopes": client.scopes, "last_used_at": client.last_used_at,
         "created_at": client.created_at}
        for client, account_name in systems_result.all()
    ]
    return PlatformDashboardOut(
        accounts_total=await total(Conta), accounts_by_status=accounts_by_status,
        clients_total=await total(Cliente),
        api_keys_active=await total(ApiClient, ApiClient.status == "ATIVO"),
        orders_total=await total(Ordem),
        orders_open=await total(Ordem, Ordem.status != "CONCLUIDA"),
        orders_completed=await total(Ordem, Ordem.status == "CONCLUIDA"),
        weighings_total=await total(Pesagem),
        weighings_pending=await total(Pesagem, Pesagem.reconciliation_status.not_in(["VINCULADA", "NAO_APLICAVEL"])),
        stations_total=await total(Estacao),
        stations_active=await total(Estacao, Estacao.status == "ATIVA"),
        operators_active=await total(Operador, Operador.status == "ATIVO"),
        events_total=await total(Outbox),
        events_pending=await total(Outbox, Outbox.status != "ENTREGUE"),
        client_systems=client_systems,
    )


@router.get("/accounts", response_model=list[PlatformAccountOut])
async def get_platform_accounts(context=Depends(require_platform_admin)):
    session, _admin = context
    result = await session.execute(
        select(Conta, PortalUser.email, PortalUser.nome_exibicao)
        .outerjoin(PortalUser, PortalUser.conta_id == Conta.id)
        .order_by(Conta.nome)
    )
    return [
        PlatformAccountOut(
            id=account.id, tenant_id=account.tenant_id, nome=account.nome,
            status=account.status, owner_email=email, owner_nome=nome,
        )
        for account, email, nome in result.all()
    ]


@router.get("/accounts/{account_id}/dashboard", response_model=AccountDashboardOut)
async def get_account_dashboard(account_id: uuid.UUID, context=Depends(require_platform_admin)):
    session, _admin = context
    account = await session.get(Conta, account_id)
    if account is None:
        raise HTTPException(status_code=404, detail="Conta não encontrada")

    async def total(model, *filters):
        return int((await session.execute(select(func.count()).select_from(model).where(model.tenant_id == account.tenant_id, *filters))).scalar_one())

    owner = (await session.execute(
        select(PortalUser.email, PortalUser.nome_exibicao)
        .where(PortalUser.conta_id == account.id)
        .order_by(PortalUser.created_at)
        .limit(1)
    )).first()
    systems = (await session.execute(
        select(ApiClient).where(ApiClient.tenant_id == account.tenant_id)
        .order_by(ApiClient.last_used_at.desc().nullslast(), ApiClient.created_at.desc())
    )).scalars().all()
    return AccountDashboardOut(
        account_id=account.id, account_name=account.nome, account_status=account.status,
        owner_email=owner[0] if owner else None, owner_name=owner[1] if owner else None,
        accounts_total=1, accounts_by_status={account.status: 1},
        clients_total=await total(Cliente), api_keys_active=await total(ApiClient, ApiClient.status == "ATIVO"),
        orders_total=await total(Ordem), orders_open=await total(Ordem, Ordem.status != "CONCLUIDA"),
        orders_completed=await total(Ordem, Ordem.status == "CONCLUIDA"), weighings_total=await total(Pesagem),
        weighings_pending=await total(Pesagem, Pesagem.reconciliation_status.not_in(["VINCULADA", "NAO_APLICAVEL"])),
        stations_total=await total(Estacao), stations_active=await total(Estacao, Estacao.status == "ATIVA"),
        operators_active=await total(Operador, Operador.status == "ATIVO"), events_total=await total(Outbox),
        events_pending=await total(Outbox, Outbox.status != "ENTREGUE"),
        client_systems=[{"client_id": item.client_id, "nome": item.nome, "account_name": account.nome,
                         "status": item.status, "scopes": item.scopes, "last_used_at": item.last_used_at,
                         "created_at": item.created_at} for item in systems],
    )


@router.put("/accounts/{account_id}", response_model=PlatformAccountOut)
async def put_platform_account(
    account_id: uuid.UUID,
    data: PlatformAccountUpdateIn,
    context=Depends(require_platform_admin),
):
    session, _admin = context
    account = await session.get(Conta, account_id)
    if account is None:
        raise HTTPException(status_code=404, detail="Cliente da plataforma não encontrado")
    account.nome = data.nome.strip()
    account.status = data.status
    await session.commit()
    result = await session.execute(
        select(Conta, PortalUser.email, PortalUser.nome_exibicao)
        .outerjoin(PortalUser, PortalUser.conta_id == Conta.id)
        .where(Conta.id == account.id)
    )
    updated, email, nome = result.one()
    return PlatformAccountOut(
        id=updated.id, tenant_id=updated.tenant_id, nome=updated.nome,
        status=updated.status, owner_email=email, owner_nome=nome,
    )


@router.get("/email", response_model=PlatformEmailSettingsOut)
async def get_email_settings(context=Depends(require_platform_admin)):
    session, _admin = context
    values = await load_email_settings(session)
    return _email_out(values)


@router.put("/email", response_model=PlatformEmailSettingsOut)
async def put_email_settings(data: PlatformEmailSettingsIn, context=Depends(require_platform_admin)):
    session, admin = context
    if data.enabled and not data.smtp_host:
        raise HTTPException(status_code=422, detail="Informe o host SMTP para ativar o envio")
    values = data.model_dump()
    for key, value in values.items():
        if key == "smtp_password" and value is None:
            continue
        if key == "smtp_password":
            value = encrypt_platform_secret(value)
        await _upsert_setting(session, f"email.{key}", value, key == "smtp_password", admin.usuario_id)
    await session.commit()
    return _email_out(await load_email_settings(session))


@router.post("/email/test", status_code=204)
async def post_email_test(data: PlatformEmailTestIn, context=Depends(require_platform_admin)):
    session, _admin = context
    try:
        await send_portal_email(session, data.recipient, "Teste de e-mail — Plataforma Balança", "O envio de e-mail da Plataforma Balança está funcionando.")
    except RuntimeError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except (smtplib.SMTPException, OSError) as exc:
        raise HTTPException(status_code=502, detail=f"Falha ao conectar ou autenticar no SMTP: {exc}") from exc


async def _upsert_setting(session, key: str, value, is_secret: bool, admin_id):
    setting = await session.get(PlatformSetting, key)
    if setting is None:
        setting = PlatformSetting(key=key, value=None, is_secret=is_secret, updated_at=datetime.utcnow(), updated_by=admin_id)
        session.add(setting)
    setting.value = str(value).lower() if isinstance(value, bool) else str(value)
    setting.is_secret = is_secret
    setting.updated_at = datetime.utcnow()
    setting.updated_by = admin_id


def _email_out(values: dict) -> PlatformEmailSettingsOut:
    return PlatformEmailSettingsOut(
        enabled=values["enabled"], smtp_host=values["smtp_host"], smtp_port=values["smtp_port"],
        smtp_username=values["smtp_username"], smtp_password_configured=bool(values["smtp_password"]),
        smtp_from=values["smtp_from"], smtp_starttls=values["smtp_starttls"], smtp_ssl=values["smtp_ssl"],
    )
