from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select

from ..config import get_settings
from ..db import get_session
from ..models import ApiClient, Conta
from ..schemas import (
    ApiClientCredentialOut, ApiClientIn, ApiClientListOut, ApiClientStatusOut,
    LoginIn, PortalActionOut, PortalEmailTokenIn, PortalForgotPasswordIn,
    PortalLoginOut, PortalMeOut, PortalResetTokenOut,
    PortalPasswordResetIn, PortalRegisterIn, PortalRegisterOut, PortalAccountUpdateIn,
)
from ..security import require_portal_admin, require_portal
from ..service import (
    confirm_portal_email, create_api_client, login_portal_user,
    register_portal_user, request_portal_password_reset, reset_portal_password,
    revoke_api_client, rotate_api_client, send_api_key_rotation_instructions,
    update_portal_account,
    verify_portal_password_reset_token,
)

router = APIRouter(prefix="/v1/portal", tags=["Portal do Cliente"])


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
    return _portal_login_response(user, account, token)


@router.get("/me", response_model=PortalMeOut)
async def get_me(context=Depends(require_portal)):
    _tenant_id, session, user = context
    account = (await session.execute(select(Conta).where(Conta.id == user.conta_id))).scalar_one()
    return PortalMeOut(
        user_id=user.id, account_id=user.conta_id, tenant_id=user.tenant_id,
        nome_conta=account.nome, nome_exibicao=user.nome_exibicao,
        email=user.email, role=user.role,
    )


@router.put("/me", response_model=PortalMeOut)
async def put_me(data: PortalAccountUpdateIn, context=Depends(require_portal_admin())):
    tenant_id, session, user = context
    try:
        account, user = await update_portal_account(session, user, data.nome_conta, data.nome_exibicao)
    except ValueError as exc:
        await session.rollback()
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    await session.commit()
    return PortalMeOut(user_id=user.id, account_id=account.id, tenant_id=tenant_id, nome_conta=account.nome, nome_exibicao=user.nome_exibicao, email=user.email, role=user.role)


@router.get("/api-clients", response_model=list[ApiClientListOut])
async def get_api_clients(context=Depends(require_portal_admin())):
    tenant_id, session, _user = context
    result = await session.execute(
        select(ApiClient).where(ApiClient.tenant_id == tenant_id)
        .order_by(ApiClient.created_at.desc())
    )
    return [ApiClientListOut.model_validate(client) for client in result.scalars()]


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


def _portal_login_response(user, account, token: str) -> PortalLoginOut:
    return PortalLoginOut(
        access_token=token, expires_in=get_settings().jwt_access_minutes * 60,
        user_id=user.id, account_id=account.id, tenant_id=user.tenant_id,
        nome_conta=account.nome, nome_exibicao=user.nome_exibicao,
        email=user.email, role=user.role,
    )
