import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select

from ..config import get_settings
from ..db import get_session
from ..models import ApiClient, Cliente, Conta, Estacao, EstacaoOperador, Operador, Ordem, Outbox, Pesagem, PortalUser
from ..schemas import (
    ApiClientConfigurationOut, ApiClientCredentialOut, ApiClientIn, ApiClientListOut, ApiClientStatusOut, ApiClientSystemOut, ApiClientUpdateIn,
    LoginIn, PortalActionOut, PortalEmailTokenIn, PortalForgotPasswordIn,
    PortalLoginOut, PortalMeOut, PortalResetTokenOut,
    PortalPasswordResetIn, PortalRegisterIn, PortalRegisterOut, PortalAccountUpdateIn, AccountDashboardOut, PlatformSecuritySettingsOut,
    WebhookDestinationIn, WebhookDestinationOut, WebhookStatusIn, WebhookTestOut, OrderOut, WeighingOut, PortalUserOut, PortalUserUpdateIn, PortalOperatorIn, OperatorOut, OperatorStatusUpdateIn, OperatorResetPinIn, StationIn, StationOut, StationInstallationOut, StationRecoveryOut, StationStatusUpdateIn,
)
from ..security import issue_portal_token, require_portal_admin, require_portal
from ..platform_identity import (
    confirm_portal_email, login_portal_user,
    register_portal_user, request_portal_password_reset, reset_portal_password,
    send_api_key_rotation_instructions,
    update_portal_account, load_security_settings,
    verify_portal_password_reset_token,
)
from ..platform_identity import create_api_client, encrypt_platform_secret, revoke_api_client, rotate_api_client, update_api_client
from ..operation import create_operator, create_station, update_operator_status, reset_operator_pin, update_station_status
from ..auth import new_activation_code, new_token, station_token_hash
from ..models import WebhookDestination
from ..delivery import OutboxDelivery
from ..platform_identity import decrypt_platform_secret

router = APIRouter(prefix="/v1/portal", tags=["Portal do Cliente"])


@router.get("/operators", response_model=list[OperatorOut])
async def get_portal_operators(context=Depends(require_portal_admin())):
    tenant_id, session, _user = context
    result = await session.execute(select(Operador).where(Operador.tenant_id == tenant_id).order_by(Operador.nome_exibicao))
    return list(result.scalars())


@router.post("/operators", response_model=OperatorOut, status_code=201)
async def post_portal_operator(data: PortalOperatorIn, context=Depends(require_portal_admin())):
    tenant_id, session, _user = context
    try:
        operator = await create_operator(session, tenant_id, type("Operator", (), {
            "codigo": data.codigo, "identificador_externo": data.identificador_externo,
            "nome_exibicao": data.nome_exibicao, "pessoa_ref": data.pessoa_ref,
            "pin": data.senha_inicial, "pin_hash": None,
        })())
    except ValueError as exc:
        await session.rollback()
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    await session.commit()
    return operator


@router.patch("/operators/{operator_id}/status", response_model=OperatorOut)
async def patch_portal_operator_status(operator_id: uuid.UUID, data: OperatorStatusUpdateIn, context=Depends(require_portal_admin())):
    tenant_id, session, _user = context
    try:
        operator = await update_operator_status(session, tenant_id, operator_id, data.status)
    except ValueError as exc:
        await session.rollback()
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    await session.commit()
    return operator


@router.patch("/operators/{operator_id}/pin", response_model=OperatorOut)
async def patch_portal_operator_pin(operator_id: uuid.UUID, data: OperatorResetPinIn, context=Depends(require_portal_admin())):
    tenant_id, session, _user = context
    try:
        operator = await reset_operator_pin(session, tenant_id, operator_id, data.novo_pin)
    except ValueError as exc:
        await session.rollback()
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    await session.commit()
    return operator


@router.get("/operators/{operator_id}/stations", response_model=list[str])
async def get_portal_operator_stations(operator_id: uuid.UUID, context=Depends(require_portal_admin())):
    tenant_id, session, _user = context
    operator = (await session.execute(select(Operador).where(
        Operador.id == operator_id, Operador.tenant_id == tenant_id,
    ))).scalar_one_or_none()
    if operator is None:
        raise HTTPException(status_code=404, detail="Operador não encontrado")
    result = await session.execute(select(EstacaoOperador.estacao_id).where(
        EstacaoOperador.operador_id == operator_id,
        EstacaoOperador.tenant_id == tenant_id,
        EstacaoOperador.status == "ATIVO",
    ))
    return [str(station_id) for station_id in result.scalars().all()]


@router.get("/stations", response_model=list[StationOut])
async def get_portal_stations(context=Depends(require_portal_admin())):
    tenant_id, session, _user = context
    result = await session.execute(select(Estacao).where(Estacao.tenant_id == tenant_id).order_by(Estacao.nome))
    return list(result.scalars())


@router.post("/stations", response_model=StationOut, status_code=201)
async def post_portal_station(data: StationIn, context=Depends(require_portal_admin())):
    tenant_id, session, _user = context
    try:
        station = await create_station(session, tenant_id, data)
    except ValueError as exc:
        await session.rollback()
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    await session.commit()
    return station


@router.post("/stations/{station_id}/installations", response_model=StationInstallationOut, status_code=201)
async def post_portal_station_installation(station_id: uuid.UUID, context=Depends(require_portal_admin())):
    tenant_id, session, _user = context
    station = (await session.execute(select(Estacao).where(Estacao.id == station_id, Estacao.tenant_id == tenant_id))).scalar_one_or_none()
    if station is None:
        raise HTTPException(status_code=404, detail="Estação não encontrada")
    if station.status != "ATIVA":
        raise HTTPException(status_code=422, detail="Somente uma estação ativa pode ser reinstalada")
    station.activation_code = new_activation_code()
    await session.commit()
    return StationInstallationOut(station_id=station.id, activation_code=station.activation_code)


@router.patch("/stations/{station_id}/status", response_model=StationOut)
async def patch_portal_station_status(station_id: uuid.UUID, data: StationStatusUpdateIn, context=Depends(require_portal_admin())):
    tenant_id, session, _user = context
    try:
        station = await update_station_status(session, tenant_id, station_id, data.status)
    except ValueError as exc:
        await session.rollback()
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    await session.commit()
    return station


@router.put("/stations/{station_id}/operators/{operator_id}")
async def put_portal_station_operator(station_id: uuid.UUID, operator_id: uuid.UUID, context=Depends(require_portal_admin())):
    tenant_id, session, _user = context
    station = (await session.execute(select(Estacao).where(Estacao.id == station_id, Estacao.tenant_id == tenant_id))).scalar_one_or_none()
    operator = (await session.execute(select(Operador).where(Operador.id == operator_id, Operador.tenant_id == tenant_id))).scalar_one_or_none()
    if station is None or operator is None:
        raise HTTPException(status_code=404, detail="Estação ou operador não encontrado")
    if operator.status != "ATIVO":
        raise HTTPException(status_code=422, detail="Ative o operador antes de vinculá-lo a uma estação")
    link = (await session.execute(select(EstacaoOperador).where(EstacaoOperador.estacao_id == station_id, EstacaoOperador.operador_id == operator_id))).scalar_one_or_none()
    if link is None:
        link = EstacaoOperador(estacao_id=station_id, operador_id=operator_id, tenant_id=tenant_id, status="ATIVO", created_at=datetime.utcnow())
        session.add(link)
    else:
        link.status = "ATIVO"
    await session.commit()
    return {"station_id": station_id, "operator_id": operator_id, "status": link.status}


@router.delete("/stations/{station_id}/operators/{operator_id}")
async def delete_portal_station_operator(station_id: uuid.UUID, operator_id: uuid.UUID, context=Depends(require_portal_admin())):
    tenant_id, session, _user = context
    link = (await session.execute(select(EstacaoOperador).where(
        EstacaoOperador.estacao_id == station_id,
        EstacaoOperador.operador_id == operator_id,
        EstacaoOperador.tenant_id == tenant_id,
    ))).scalar_one_or_none()
    if link is None:
        raise HTTPException(status_code=404, detail="Vínculo entre Estação e Operador não encontrado")
    link.status = "REVOGADO"
    await session.commit()
    return {"station_id": station_id, "operator_id": operator_id, "status": link.status}


@router.post("/stations/{station_id}/recovery-credential/rotate", response_model=StationRecoveryOut)
async def rotate_portal_station_recovery(station_id: uuid.UUID, context=Depends(require_portal_admin())):
    tenant_id, session, _user = context
    station = (await session.execute(select(Estacao).where(Estacao.id == station_id, Estacao.tenant_id == tenant_id))).scalar_one_or_none()
    if station is None:
        raise HTTPException(status_code=404, detail="Estação não encontrada")
    secret = new_token()
    station.recovery_secret_hash = station_token_hash(secret)
    station.recovery_secret_version = (station.recovery_secret_version or 0) + 1
    await session.commit()
    return StationRecoveryOut(station_id=station.id, recovery_secret=secret, recovery_secret_version=station.recovery_secret_version)


@router.get("/orders", response_model=list[OrderOut])
async def get_portal_orders(context=Depends(require_portal)):
    tenant_id, session, _user = context
    result = await session.execute(select(Ordem).where(Ordem.tenant_id == tenant_id).order_by(Ordem.created_at.desc()).limit(500))
    return list(result.scalars())


@router.get("/weighings", response_model=list[WeighingOut])
async def get_portal_weighings(context=Depends(require_portal)):
    tenant_id, session, _user = context
    result = await session.execute(select(Pesagem).where(Pesagem.tenant_id == tenant_id).order_by(Pesagem.captured_at.desc()).limit(500))
    return list(result.scalars())


@router.post("/auth/register", response_model=PortalRegisterOut, status_code=202)
async def post_register(data: PortalRegisterIn, session=Depends(get_session)):
    try:
        user, account = await register_portal_user(session, data)
    except ValueError as exc:
        await session.rollback()
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    except RuntimeError as exc:
        await session.rollback()
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    await session.commit()
    return PortalRegisterOut(message="Cadastro criado. Confirme seu e-mail para entrar.", email=user.email)


@router.post("/auth/forgot-password", response_model=PortalActionOut)
async def post_forgot_password(data: PortalForgotPasswordIn, session=Depends(get_session)):
    try:
        await request_portal_password_reset(session, data.email)
    except RuntimeError as exc:
        await session.rollback()
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    await session.commit()
    return PortalActionOut(message="Se o e-mail existir, enviaremos instruções de recuperação.")


@router.post("/auth/confirm-email", response_model=PortalActionOut)
async def post_confirm_email(data: PortalEmailTokenIn, session=Depends(get_session)):
    try:
        await confirm_portal_email(session, data.token)
    except ValueError as exc:
        await session.rollback()
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    await session.commit()
    return PortalActionOut(message="E-mail confirmado. Você já pode entrar no Portal.")


@router.post("/auth/reset-password", response_model=PortalActionOut)
async def post_reset_password(data: PortalPasswordResetIn, session=Depends(get_session)):
    try:
        await reset_portal_password(session, data.token, data.password)
    except ValueError as exc:
        await session.rollback()
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    await session.commit()
    return PortalActionOut(message="Senha redefinida com sucesso.")


@router.post("/auth/verify-reset-token", response_model=PortalResetTokenOut)
async def post_verify_reset_token(data: PortalEmailTokenIn, session=Depends(get_session)):
    result = await verify_portal_password_reset_token(session, data.token)
    if result is None:
        return PortalResetTokenOut(valido=False, mensagem="Token inválido ou expirado")
    token, user = result
    return PortalResetTokenOut(valido=True, email=user.email, expira_em=token.expires_at)


@router.post("/auth/login", response_model=PortalLoginOut)
async def post_login(data: LoginIn, session=Depends(get_session)):
    try:
        user, account, token = await login_portal_user(session, data.login, data.password)
    except ValueError as exc:
        await session.rollback()
        raise HTTPException(status_code=401, detail=str(exc)) from exc
    await session.commit()
    security = await load_security_settings(session)
    return _portal_login_response(user, account, token, security["session_minutes"])


@router.post("/auth/refresh", response_model=PortalLoginOut)
async def post_refresh(context=Depends(require_portal)):
    _tenant_id, session, user = context
    account = (await session.execute(select(Conta).where(Conta.id == user.conta_id))).scalar_one()
    security = await load_security_settings(session)
    if not security["refresh_enabled"]:
        raise HTTPException(status_code=403, detail="Renovação automática de sessão desativada")
    return _portal_login_response(user, account, issue_portal_token(user, security["session_minutes"]))


@router.get("/me", response_model=PortalMeOut)
async def get_me(context=Depends(require_portal)):
    _tenant_id, session, user = context
    account = (await session.execute(select(Conta).where(Conta.id == user.conta_id))).scalar_one()
    return PortalMeOut(
        user_id=user.id, account_id=user.conta_id,
        nome_conta=account.nome, nome_exibicao=user.nome_exibicao,
        email=user.email, role=user.role,
    )


@router.get("/dashboard", response_model=AccountDashboardOut)
async def get_portal_dashboard(context=Depends(require_portal)):
    tenant_id, session, user = context
    account = (await session.execute(select(Conta).where(Conta.id == user.conta_id))).scalar_one()

    async def total(model, *filters):
        return int((await session.execute(select(func.count()).select_from(model).where(model.tenant_id == tenant_id, *filters))).scalar_one())

    owner = (await session.execute(select(PortalUser.email, PortalUser.nome_exibicao).where(PortalUser.conta_id == account.id).order_by(PortalUser.created_at).limit(1))).first()
    systems = (await session.execute(select(ApiClient).where(ApiClient.tenant_id == tenant_id).order_by(ApiClient.last_used_at.desc().nullslast(), ApiClient.created_at.desc()))).scalars().all()
    return AccountDashboardOut(
        account_id=account.id, account_name=account.nome, account_status=account.status,
        owner_email=owner[0] if owner else None, owner_name=owner[1] if owner else None,
        accounts_total=1, accounts_by_status={account.status: 1}, clients_total=await total(Cliente),
        api_keys_active=await total(ApiClient, ApiClient.status == "ATIVO"), orders_total=await total(Ordem),
        orders_open=await total(Ordem, Ordem.status != "CONCLUIDA"), orders_completed=await total(Ordem, Ordem.status == "CONCLUIDA"),
        weighings_total=await total(Pesagem), weighings_pending=await total(Pesagem, Pesagem.reconciliation_status.not_in(["VINCULADA", "NAO_APLICAVEL"])),
        stations_total=await total(Estacao), stations_active=await total(Estacao, Estacao.status == "ATIVA"),
        operators_active=await total(Operador, Operador.status == "ATIVO"), events_total=await total(Outbox),
        events_pending=await total(Outbox, Outbox.status != "ENTREGUE"),
        client_systems=[{"client_id": item.client_id, "nome": item.nome, "account_name": account.nome,
                         "status": item.status, "scopes": item.scopes, "last_used_at": item.last_used_at,
                         "created_at": item.created_at} for item in systems],
    )


@router.get("/session-policy", response_model=PlatformSecuritySettingsOut)
async def get_portal_session_policy(context=Depends(require_portal)):
    _tenant_id, session, _user = context
    return await load_security_settings(session)


@router.put("/me", response_model=PortalMeOut)
async def put_me(data: PortalAccountUpdateIn, context=Depends(require_portal_admin())):
    tenant_id, session, user = context
    try:
        account, user = await update_portal_account(session, user, data.nome_conta, data.nome_exibicao)
    except ValueError as exc:
        await session.rollback()
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    await session.commit()
    return PortalMeOut(user_id=user.id, account_id=account.id, nome_conta=account.nome, nome_exibicao=user.nome_exibicao, email=user.email, role=user.role)


@router.get("/webhook", response_model=WebhookDestinationOut)
async def get_webhook_destination(context=Depends(require_portal_admin())):
    _tenant_id, session, user = context
    destination = (await session.execute(select(WebhookDestination).where(WebhookDestination.conta_id == user.conta_id))).scalar_one_or_none()
    if destination is None:
        raise HTTPException(status_code=404, detail="Webhook ainda não configurado")
    return WebhookDestinationOut(target_url=destination.target_url, status=destination.status, event_types=destination.event_types, updated_at=destination.updated_at, max_attempts=destination.max_attempts, retry_base_seconds=destination.retry_base_seconds)


@router.get("/users", response_model=list[PortalUserOut])
async def get_portal_users(context=Depends(require_portal_admin())):
    tenant_id, session, _user = context
    result = await session.execute(select(PortalUser).where(PortalUser.tenant_id == tenant_id).order_by(PortalUser.created_at))
    return list(result.scalars())


@router.put("/users/{user_id}", response_model=PortalUserOut)
async def put_portal_user(user_id: uuid.UUID, data: PortalUserUpdateIn, context=Depends(require_portal_admin())):
    tenant_id, session, actor = context
    target = (await session.execute(select(PortalUser).where(PortalUser.id == user_id, PortalUser.tenant_id == tenant_id))).scalar_one_or_none()
    if target is None:
        raise HTTPException(status_code=404, detail="Usuário do Portal não encontrado")
    if target.id == actor.id and data.status == "INATIVO":
        raise HTTPException(status_code=422, detail="Você não pode desativar o próprio acesso")
    target.role, target.status = data.role, data.status
    await session.commit()
    return target


@router.put("/webhook", response_model=WebhookDestinationOut)
async def put_webhook_destination(data: WebhookDestinationIn, context=Depends(require_portal_admin())):
    tenant_id, session, user = context
    destination = (await session.execute(select(WebhookDestination).where(WebhookDestination.conta_id == user.conta_id))).scalar_one_or_none()
    if destination is None:
        if not data.hmac_secret:
            raise HTTPException(status_code=422, detail="O segredo HMAC é obrigatório na primeira configuração")
        destination = WebhookDestination(id=uuid.uuid4(), tenant_id=tenant_id, conta_id=user.conta_id, target_url=str(data.target_url), hmac_secret_encrypted=encrypt_platform_secret(data.hmac_secret), status="ATIVO", event_types=data.event_types, max_attempts=data.max_attempts, retry_base_seconds=data.retry_base_seconds, created_at=datetime.utcnow(), updated_at=datetime.utcnow())
        session.add(destination)
    else:
        destination.target_url, destination.event_types, destination.max_attempts, destination.retry_base_seconds, destination.status, destination.updated_at = str(data.target_url), data.event_types, data.max_attempts, data.retry_base_seconds, "ATIVO", datetime.utcnow()
        if data.hmac_secret:
            destination.hmac_secret_encrypted = encrypt_platform_secret(data.hmac_secret)
    await session.commit()
    return WebhookDestinationOut(target_url=destination.target_url, status=destination.status, event_types=destination.event_types, updated_at=destination.updated_at, max_attempts=destination.max_attempts, retry_base_seconds=destination.retry_base_seconds)


@router.post("/webhook/test", response_model=WebhookTestOut)
async def post_webhook_test(context=Depends(require_portal_admin())):
    _tenant_id, session, user = context
    destination = (await session.execute(select(WebhookDestination).where(WebhookDestination.conta_id == user.conta_id))).scalar_one_or_none()
    if destination is None or destination.status != "ATIVO":
        raise HTTPException(status_code=404, detail="Configure um webhook ativo antes de testar")
    secret = decrypt_platform_secret(destination.hmac_secret_encrypted)
    if not secret:
        raise HTTPException(status_code=422, detail="O segredo HMAC do webhook não está disponível")
    try:
        status_code = await OutboxDelivery().deliver_test(user.conta_id, destination.target_url, secret)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Falha ao entregar evento de teste: {str(exc)[:240]}") from exc
    return WebhookTestOut(accepted=True, status_code=status_code, message="Evento de teste aceito pelo endpoint")


@router.delete("/webhook", response_model=PortalActionOut)
async def delete_webhook_destination(context=Depends(require_portal_admin())):
    _tenant_id, session, user = context
    destination = (await session.execute(select(WebhookDestination).where(WebhookDestination.conta_id == user.conta_id))).scalar_one_or_none()
    if destination is None:
        raise HTTPException(status_code=404, detail="Webhook ainda não configurado")
    destination.status = "INATIVO"
    destination.updated_at = datetime.utcnow()
    await session.commit()
    return PortalActionOut(message="Webhook desativado. A sincronização pela API continua disponível.")


@router.patch("/webhook/status", response_model=WebhookDestinationOut)
async def patch_webhook_status(data: WebhookStatusIn, context=Depends(require_portal_admin())):
    _tenant_id, session, user = context
    destination = (await session.execute(select(WebhookDestination).where(WebhookDestination.conta_id == user.conta_id))).scalar_one_or_none()
    if destination is None:
        raise HTTPException(status_code=404, detail="Configure o Webhook antes de alternar o modo")
    destination.status = "ATIVO" if data.enabled else "INATIVO"
    destination.updated_at = datetime.utcnow()
    await session.commit()
    return WebhookDestinationOut(target_url=destination.target_url, status=destination.status, event_types=destination.event_types, updated_at=destination.updated_at, max_attempts=destination.max_attempts, retry_base_seconds=destination.retry_base_seconds)


@router.get("/api-clients", response_model=list[ApiClientListOut])
async def get_api_clients(context=Depends(require_portal_admin())):
    tenant_id, session, _user = context
    result = await session.execute(
        select(ApiClient).where(ApiClient.tenant_id == tenant_id)
        .order_by(ApiClient.created_at.desc())
    )
    return [ApiClientListOut.model_validate(client) for client in result.scalars()]


@router.get("/api-clients/{client_id}/configuration", response_model=ApiClientConfigurationOut)
async def get_api_client_configuration(client_id: str, context=Depends(require_portal_admin())):
    tenant_id, session, user = context
    client = (await session.execute(
        select(ApiClient).where(ApiClient.client_id == client_id, ApiClient.tenant_id == tenant_id)
    )).scalar_one_or_none()
    if client is None:
        raise HTTPException(status_code=404, detail="API Key não encontrada")

    systems = (await session.execute(
        select(Cliente).where(Cliente.conta_id == user.conta_id).order_by(Cliente.sistema_cliente, Cliente.tenant_cliente_id)
    )).scalars()
    return ApiClientConfigurationOut(
        client_id=client.client_id,
        account_id=user.conta_id,
        sistemas_clientes=[ApiClientSystemOut.model_validate(item) for item in systems],
    )


@router.post("/api-clients", response_model=ApiClientCredentialOut, status_code=201)
async def post_api_client(data: ApiClientIn, context=Depends(require_portal_admin())):
    tenant_id, session, _user = context
    try:
        client, secret = await create_api_client(
            session, tenant_id, data.nome, data.scopes, data.expires_at
        )
    except ValueError as exc:
        await session.rollback()
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    await session.commit()
    return ApiClientCredentialOut(
        client_id=client.client_id, client_secret=secret, nome=client.nome,
        scopes=client.scopes, expires_at=client.expires_at,
    )


@router.post("/api-clients/{client_id}/rotate", response_model=ApiClientCredentialOut)
async def post_rotate(client_id: str, context=Depends(require_portal_admin())):
    tenant_id, session, _user = context
    try:
        client, secret = await rotate_api_client(session, tenant_id, client_id)
    except ValueError as exc:
        await session.rollback()
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    await session.commit()
    return ApiClientCredentialOut(
        client_id=client.client_id, client_secret=secret, nome=client.nome,
        scopes=client.scopes, expires_at=client.expires_at,
    )


@router.put("/api-clients/{client_id}", response_model=ApiClientStatusOut)
async def put_api_client(client_id: str, data: ApiClientUpdateIn, context=Depends(require_portal_admin())):
    tenant_id, session, _user = context
    try:
        client = await update_api_client(
            session, tenant_id, client_id, data.nome, data.scopes, data.expires_at
        )
    except ValueError as exc:
        await session.rollback()
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    await session.commit()
    return ApiClientStatusOut(
        client_id=client.client_id, nome=client.nome, scopes=client.scopes,
        status=client.status, expires_at=client.expires_at,
        created_at=client.created_at, last_used_at=client.last_used_at,
    )


@router.post("/api-clients/{client_id}/revoke", response_model=ApiClientStatusOut)
async def post_revoke(client_id: str, context=Depends(require_portal_admin())):
    tenant_id, session, _user = context
    try:
        client = await revoke_api_client(session, tenant_id, client_id)
    except ValueError as exc:
        await session.rollback()
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    await session.commit()
    return ApiClientStatusOut(
        client_id=client.client_id, nome=client.nome, scopes=client.scopes,
        status=client.status, expires_at=client.expires_at,
        created_at=client.created_at, last_used_at=client.last_used_at,
    )


@router.post("/api-clients/{client_id}/send-recovery-email", response_model=PortalActionOut, status_code=202)
async def post_send_recovery_email(client_id: str, context=Depends(require_portal_admin())):
    tenant_id, session, _user = context
    try:
        email = await send_api_key_rotation_instructions(session, tenant_id, client_id)
    except (ValueError, RuntimeError) as exc:
        await session.rollback()
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    await session.commit()
    return PortalActionOut(message=f"Instruções enviadas para {email}.")


def _portal_login_response(user, account, token: str, session_minutes: int | None = None) -> PortalLoginOut:
    return PortalLoginOut(
        access_token=token, expires_in=(session_minutes or get_settings().jwt_access_minutes) * 60,
        user_id=user.id, account_id=account.id,
        nome_conta=account.nome, nome_exibicao=user.nome_exibicao,
        email=user.email, role=user.role,
    )
