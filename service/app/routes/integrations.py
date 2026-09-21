from fastapi import APIRouter, Depends, Header, HTTPException, Query
import httpx
import base64
import json
from datetime import datetime, timedelta
import uuid
from sqlalchemy import and_, or_, select, update, func

from ..auth import get_session, require_station, set_tenant_context
from ..security import require_backoffice, require_client_scope
from ..config import get_settings
from ..models import ApiClient, Cliente, Conta, DeliveryReceipt, Estacao, EstacaoInstalacao, EstacaoOperador, DeviceConfiguration, BridgeValidation, Operador, Ordem, Outbox, OutboxReplayAudit, Pesagem
from ..schemas import (
    ActivationIn, ActivationOut, AccountOut, ClientIn, ClientOut, EventOut, EventReplayAuditOut, OperatorIn, OperatorOut, ProvisionedOperatorOut, StationProvisioningOut,
    OrderIn, OrderOut, OrderPageOut, StationIn, StationOut, WeighingIn, WeighingOut, WeighingPageOut, WeighingReconciliationIn, OfficialMarkIn, OfficialMarkOut, OrderResultHistoryOut,
    SyncPushIn, SyncPushOut, SyncResultOut, OperatorLoginIn, LoginIn, LoginOut,
    ApiClientIn, ApiClientUpdateIn, ApiClientOut, ApiClientCredentialOut, ApiClientStatusOut, ApiClientListOut,
    ContingencyPackageIn, ContingencyImportOut,
    DeviceConfigurationIn, DeviceConfigurationOut, BridgeValidationIn, BridgeValidationOut,
    DeliveryReceiptOut, DeliveryPullPageOut, DeliveryAckIn, DeliveryAckResult, DeliveryAckOut,
)
from .. import schemas
from .. import models
from ..contingency_service import import_contingency_package
from ..operation import (
    activate_station, complete_weighing, create_operator, create_order, create_station,
    register_client, reconcile_weighing, resolve_offline_operation, set_official_mark, list_official_marks, list_result_history,
)
from ..platform_identity import (
    create_api_client, get_account, login_backoffice, login_backoffice_without_tenant,
    rotate_api_client, revoke_api_client, update_api_client, load_security_settings,
)
from ..security import _permission_set, issue_backoffice_token

router = APIRouter(prefix="/v1", tags=["Balança"])


@router.post("/auth/login", response_model=LoginOut)
async def post_login(
    data: LoginIn,
    x_tenant_id: str | None = Header(None, alias="X-Tenant-ID"),
    session=Depends(get_session),
):
    try:
        if x_tenant_id:
            try:
                tenant_id = uuid.UUID(x_tenant_id)
            except ValueError as exc:
                raise HTTPException(status_code=400, detail="X-Tenant-ID inválido") from exc
            await set_tenant_context(session, str(tenant_id))
            user, permissions, token = await login_backoffice(
                session, tenant_id, data.login, data.password
            )
        else:
            user, permissions, token = await login_backoffice_without_tenant(
                session, data.login, data.password
            )
            tenant_id = user.tenant_id
            await set_tenant_context(session, str(tenant_id))
    except ValueError as exc:
        await session.rollback()
        raise HTTPException(status_code=401, detail=str(exc)) from exc
    await session.commit()
    security = await load_security_settings(session)
    return LoginOut(
        access_token=token,
        expires_in=security["session_minutes"] * 60,
        user_id=user.id,
        tenant_id=tenant_id,
        permissions=sorted(permissions),
    )


@router.post("/auth/refresh", response_model=LoginOut)
async def post_refresh(context=Depends(require_backoffice())):
    tenant_id, session, user = context
    permissions = await _permission_set(session, user.id, tenant_id)
    security = await load_security_settings(session)
    if not security["refresh_enabled"]:
        raise HTTPException(status_code=403, detail="Renovação automática de sessão desativada")
    token = issue_backoffice_token(user, permissions, security["session_minutes"])
    return LoginOut(access_token=token, user_id=user.id, tenant_id=tenant_id, permissions=sorted(permissions), expires_in=security["session_minutes"] * 60)


@router.post("/admin/api-clients", response_model=ApiClientCredentialOut, status_code=201)
async def post_api_client(
    data: ApiClientIn,
    context=Depends(require_backoffice("backoffice:clientes:gerenciar")),
):
    tenant_id, session, user = context
    try:
        client, secret = await create_api_client(
            session, tenant_id, data.nome, data.scopes, data.expires_at
        )
    except ValueError as exc:
        await session.rollback()
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    await session.commit()
    return ApiClientCredentialOut(
        client_id=client.client_id,
        client_secret=secret,
        nome=client.nome,
        scopes=client.scopes,
        expires_at=client.expires_at,
    )


@router.get("/admin/api-clients", response_model=list[ApiClientListOut])
async def get_api_clients(
    context=Depends(require_backoffice("backoffice:clientes:gerenciar")),
):
    tenant_id, session, _user = context
    result = await session.execute(
        select(ApiClient).where(ApiClient.tenant_id == tenant_id).order_by(ApiClient.created_at.desc())
    )
    return [
        ApiClientListOut(
            client_id=client.client_id,
            nome=client.nome,
            scopes=client.scopes,
            status=client.status,
            expires_at=client.expires_at,
            created_at=client.created_at,
            last_used_at=client.last_used_at,
        )
        for client in result.scalars()
    ]


@router.put("/admin/api-clients/{client_id}", response_model=ApiClientStatusOut)
async def put_api_client(
    client_id: str,
    data: ApiClientUpdateIn,
    context=Depends(require_backoffice("backoffice:clientes:gerenciar")),
):
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


@router.post("/admin/api-clients/{client_id}/rotate", response_model=ApiClientCredentialOut)
async def post_rotate_api_client(
    client_id: str,
    context=Depends(require_backoffice("backoffice:clientes:gerenciar")),
):
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


@router.post("/admin/api-clients/{client_id}/revoke", response_model=ApiClientStatusOut)
async def post_revoke_api_client(
    client_id: str,
    context=Depends(require_backoffice("backoffice:clientes:gerenciar")),
):
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


@router.post("/clients", response_model=ClientOut, status_code=201)
async def post_client(data: ClientIn, context=Depends(require_client_scope("clients:write"))):
    tenant_id, session, _client = context
    client = await register_client(session, tenant_id, data)
    await session.commit()
    return client


@router.post("/contingency/import", response_model=ContingencyImportOut)
async def post_contingency_import(
    package: ContingencyPackageIn,
    context=Depends(require_backoffice("backoffice:pesagens:importar")),
):
    tenant_id, session, _user = context
    try:
        result = await import_contingency_package(session, tenant_id, package)
    except ValueError as exc:
        await session.rollback()
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    await session.commit()
    return result


@router.post("/orders", response_model=OrderOut, status_code=201)
async def post_order(data: OrderIn, context=Depends(require_client_scope("orders:write"))):
    tenant_id, session, _client = context
    try:
        order = await create_order(session, tenant_id, data)
    except ValueError as exc:
        await session.rollback()
        if str(exc).startswith("CONFLICT:"):
            raise HTTPException(status_code=409, detail=str(exc)[len("CONFLICT: "):]) from exc
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    await session.commit()
    return order


@router.get("/orders", response_model=OrderPageOut)
async def get_orders(
    status: str | None = Query(default=None),
    cursor: str | None = Query(default=None),
    limit: int = Query(default=100, ge=1, le=500),
    context=Depends(require_client_scope("orders:read")),
):
    tenant_id, session, _user = context
    stmt = select(Ordem).where(Ordem.tenant_id == tenant_id)
    if status:
        stmt = stmt.where(Ordem.status == status.upper())
    if cursor:
        try:
            decoded = json.loads(base64.urlsafe_b64decode(cursor.encode()).decode())
            created_at = datetime.fromisoformat(decoded["created_at"])
            order_id = uuid.UUID(decoded["id"])
        except (ValueError, KeyError, TypeError, json.JSONDecodeError) as exc:
            raise HTTPException(status_code=400, detail="Cursor inválido") from exc
        stmt = stmt.where(or_(Ordem.created_at < created_at, and_(Ordem.created_at == created_at, Ordem.id < order_id)))
    result = await session.execute(stmt.order_by(Ordem.created_at.desc(), Ordem.id.desc()).limit(limit + 1))
    items = list(result.scalars())
    next_cursor = None
    if len(items) > limit:
        last = items[limit - 1]
        next_cursor = base64.urlsafe_b64encode(json.dumps({"created_at": last.created_at.isoformat(), "id": str(last.id)}, separators=(",", ":")).encode()).decode()
        items = items[:limit]
    return OrderPageOut(items=items, next_cursor=next_cursor)


@router.get("/admin/orders", response_model=list[OrderOut])
async def get_admin_orders(
    status: str | None = Query(default=None),
    context=Depends(require_backoffice("backoffice:ordens:gerenciar")),
):
    tenant_id, session, _user = context
    stmt = select(Ordem).where(Ordem.tenant_id == tenant_id)
    if status:
        stmt = stmt.where(Ordem.status == status.upper())
    result = await session.execute(stmt.order_by(Ordem.created_at.desc()).limit(500))
    return list(result.scalars())


@router.get("/admin/orders/{order_id}/official-marks", response_model=list[OfficialMarkOut])
async def get_admin_official_marks(
    order_id: uuid.UUID,
    context=Depends(require_backoffice("backoffice:pesagens:consultar")),
):
    tenant_id, session, _user = context
    return await list_official_marks(session, tenant_id, order_id)


@router.get("/orders/{order_id}/official-marks", response_model=list[OfficialMarkOut])
async def get_official_marks(
    order_id: uuid.UUID,
    context=Depends(require_client_scope("weighings:read")),
):
    tenant_id, session, _client = context
    return await list_official_marks(session, tenant_id, order_id)


@router.post("/admin/orders/{order_id}/official-marks", response_model=OfficialMarkOut)
async def post_admin_official_mark(
    order_id: uuid.UUID,
    data: OfficialMarkIn,
    context=Depends(require_backoffice("backoffice:pesagens:importar")),
):
    tenant_id, session, _user = context
    try:
        mark = await set_official_mark(session, tenant_id, order_id, data)
    except ValueError as exc:
        await session.rollback()
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    await session.commit()
    return mark


@router.post("/orders/{order_id}/official-marks", response_model=OfficialMarkOut)
async def post_official_mark(
    order_id: uuid.UUID,
    data: OfficialMarkIn,
    context=Depends(require_client_scope("weighings:reconcile")),
):
    tenant_id, session, _client = context
    try:
        mark = await set_official_mark(session, tenant_id, order_id, data)
    except ValueError as exc:
        await session.rollback()
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    await session.commit()
    return mark


@router.get("/orders/{order_id}/result-history", response_model=list[OrderResultHistoryOut])
async def get_result_history(
    order_id: uuid.UUID,
    context=Depends(require_client_scope("weighings:read")),
):
    tenant_id, session, _client = context
    return await list_result_history(session, tenant_id, order_id)


@router.get("/admin/orders/{order_id}/result-history", response_model=list[OrderResultHistoryOut])
async def get_admin_result_history(
    order_id: uuid.UUID,
    context=Depends(require_backoffice("backoffice:pesagens:consultar")),
):
    tenant_id, session, _user = context
    return await list_result_history(session, tenant_id, order_id)


@router.get("/weighings", response_model=WeighingPageOut)
async def get_weighings(
    status: str | None = Query(default=None),
    cursor: str | None = Query(default=None),
    limit: int = Query(default=100, ge=1, le=500),
    context=Depends(require_client_scope("weighings:read")),
):
    tenant_id, session, _client = context
    stmt = select(Pesagem).where(Pesagem.tenant_id == tenant_id)
    if status:
        stmt = stmt.where(Pesagem.reconciliation_status == status.upper())
    if cursor:
        try:
            decoded = json.loads(base64.urlsafe_b64decode(cursor.encode()).decode())
            captured_at = datetime.fromisoformat(decoded["captured_at"])
            weighing_id = uuid.UUID(decoded["id"])
        except (ValueError, KeyError, TypeError, json.JSONDecodeError) as exc:
            raise HTTPException(status_code=400, detail="Cursor inválido") from exc
        stmt = stmt.where(or_(
            Pesagem.captured_at < captured_at,
            and_(Pesagem.captured_at == captured_at, Pesagem.id < weighing_id),
        ))
    result = await session.execute(stmt.order_by(
        Pesagem.captured_at.desc(), Pesagem.id.desc()
    ).limit(limit + 1))
    items = list(result.scalars())
    next_cursor = None
    if len(items) > limit:
        last = items[limit - 1]
        next_cursor = base64.urlsafe_b64encode(json.dumps({
            "captured_at": last.captured_at.isoformat(), "id": str(last.id),
        }, separators=(",", ":")).encode()).decode()
        items = items[:limit]
    return WeighingPageOut(items=items, next_cursor=next_cursor)


@router.get("/admin/weighings", response_model=WeighingPageOut)
async def get_admin_weighings(
    status: str | None = Query(default=None),
    limit: int = Query(default=500, ge=1, le=500),
    context=Depends(require_backoffice("backoffice:pesagens:consultar")),
):
    """Consulta operacional para o Backoffice, sempre limitada ao tenant atual."""
    tenant_id, session, _user = context
    stmt = select(Pesagem).where(Pesagem.tenant_id == tenant_id)
    if status:
        stmt = stmt.where(Pesagem.reconciliation_status == status.upper())
    result = await session.execute(stmt.order_by(Pesagem.captured_at.desc(), Pesagem.id.desc()).limit(limit))
    return WeighingPageOut(items=list(result.scalars()), next_cursor=None)


@router.post("/weighings/{weighing_id}/reconcile", response_model=WeighingOut)
async def post_reconcile_weighing(
    weighing_id: uuid.UUID,
    data: WeighingReconciliationIn,
    context=Depends(require_client_scope("weighings:reconcile")),
):
    tenant_id, session, _client = context
    try:
        weight = await reconcile_weighing(session, tenant_id, weighing_id, data)
    except ValueError as exc:
        await session.rollback()
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    await session.commit()
    return weight


@router.post("/admin/weighings/{weighing_id}/reconcile", response_model=WeighingOut)
async def post_admin_reconcile_weighing(
    weighing_id: uuid.UUID,
    data: WeighingReconciliationIn,
    context=Depends(require_backoffice("backoffice:pesagens:importar")),
):
    tenant_id, session, _user = context
    try:
        weight = await reconcile_weighing(session, tenant_id, weighing_id, data)
    except ValueError as exc:
        await session.rollback()
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    await session.commit()
    return weight


@router.post("/stations", response_model=StationOut, status_code=201)
async def post_station(
    data: StationIn,
    context=Depends(require_backoffice("backoffice:estacoes:gerenciar")),
):
    tenant_id, session, _user = context
    station = await create_station(session, tenant_id, data)
    await session.commit()
    return station


@router.get("/admin/accounts", response_model=list[AccountOut])
async def get_admin_accounts(context=Depends(require_backoffice("backoffice:estacoes:gerenciar"))):
    tenant_id, session, _user = context
    account = await get_account(session, tenant_id)
    await session.commit()
    return [AccountOut(id=account.id, nome=account.nome, status=account.status)]


@router.get("/stations", response_model=list[StationOut])
async def get_stations(context=Depends(require_backoffice("backoffice:estacoes:gerenciar"))):
    tenant_id, session, _user = context
    result = await session.execute(
        select(Estacao, Conta.nome.label("conta_nome"))
        .join(Conta, Conta.id == Estacao.conta_id)
        .where(Estacao.tenant_id == tenant_id)
        .order_by(Estacao.nome)
    )
    return [
        StationOut(
            id=station.id,
            conta_id=station.conta_id,
            conta_nome=conta_nome,
            external_id=station.external_id,
            nome=station.nome,
            activation_code=station.activation_code,
            status=station.status,
        )
        for station, conta_nome in result.all()
    ]


@router.post("/stations/activate", response_model=ActivationOut)
async def post_station_activation(
    data: ActivationIn,
    context=Depends(require_client_scope("stations:activate")),
):
    tenant_id, session, _client = context
    try:
        station, token, recovery_secret, installation_id, device_configuration_id = await activate_station(session, tenant_id, data)
    except ValueError as exc:
        await session.rollback()
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    await session.commit()
    return ActivationOut(
        station_id=station.id,
        station_token=token,
        tenant_id=tenant_id,
        nome=station.nome,
        recovery_secret=recovery_secret,
        installation_id=installation_id,
        device_configuration_id=device_configuration_id,
    )


@router.post("/stations/device-configurations", response_model=DeviceConfigurationOut, status_code=201)
async def post_device_configuration(
    data: DeviceConfigurationIn,
    context=Depends(require_station),
):
    tenant_id, session, station = context
    installation = (await session.execute(select(EstacaoInstalacao).where(
        EstacaoInstalacao.id == data.installation_id,
        EstacaoInstalacao.tenant_id == tenant_id,
        EstacaoInstalacao.estacao_id == station.id,
    ))).scalar_one_or_none()
    if installation is None:
        raise HTTPException(status_code=404, detail="Instalação não encontrada")
    if installation.status != "ACTIVE":
        raise HTTPException(status_code=403, detail="Instalação substituída não pode alterar configuração")
        
    import secrets
    from ..platform_identity import encrypt_platform_secret
    
    proof_key = secrets.token_hex(32)

    device_config = DeviceConfiguration(
        id=uuid.uuid4(),
        tenant_id=tenant_id,
        estacao_id=station.id,
        instalacao_id=installation.id,
        bridge_url=data.bridge_url,
        status="PENDING",
        proof_key_encrypted=encrypt_platform_secret(proof_key),
        created_at=datetime.utcnow(),
    )
    session.add(device_config)
    await session.commit()

    return DeviceConfigurationOut(
        id=device_config.id,
        installation_id=device_config.instalacao_id,
        bridge_url=device_config.bridge_url,
        status=device_config.status,
        bridge_proof_key=proof_key
    )


@router.post("/stations/bridge-validations/challenge", response_model=schemas.BridgeChallengeOut, status_code=201)
async def post_bridge_validation_challenge(data: schemas.BridgeChallengeIn, context=Depends(require_station)):
    tenant_id, session, station = context
    installation = station.authenticated_installation
    if installation.status != "ACTIVE":
        raise HTTPException(status_code=403, detail="Instalação substituída não pode validar Bridge")
    
    dev_config = (await session.execute(
        select(DeviceConfiguration).where(
            DeviceConfiguration.id == data.device_configuration_id,
            DeviceConfiguration.tenant_id == tenant_id,
            DeviceConfiguration.instalacao_id == installation.id
        )
    )).scalar_one_or_none()
    
    if not dev_config or dev_config.status != "PENDING":
        raise HTTPException(status_code=422, detail="Configuração de dispositivo inválida ou já ativada")
        
    import secrets
    challenge_id = uuid.uuid4()
    nonce = secrets.token_hex(32)
    challenge = models.BridgeChallenge(
        id=challenge_id,
        tenant_id=tenant_id,
        instalacao_id=installation.id,
        nonce=nonce,
        expires_at=datetime.utcnow() + timedelta(minutes=5),
    )
    session.add(challenge)
    await session.commit()
    return schemas.BridgeChallengeOut(challenge_id=challenge_id, nonce=nonce)


@router.post("/stations/bridge-validations", response_model=BridgeValidationOut, status_code=201)
async def post_bridge_validation(data: BridgeValidationIn, context=Depends(require_station)):
    tenant_id, session, station = context
    installation = station.authenticated_installation
    if installation.status != "ACTIVE":
        raise HTTPException(status_code=403, detail="Instalação substituída não pode validar Bridge")
    
    challenge = (await session.execute(
        select(models.BridgeChallenge).where(
            models.BridgeChallenge.id == data.challenge_id,
            models.BridgeChallenge.tenant_id == tenant_id,
            models.BridgeChallenge.instalacao_id == installation.id,
            models.BridgeChallenge.used_at.is_(None),
            models.BridgeChallenge.expires_at > datetime.utcnow()
        )
    )).scalar_one_or_none()
    
    if challenge is None:
        raise HTTPException(status_code=422, detail="Desafio inválido ou expirado")
        
    # Precisamos da config pendente
    dev_config = (await session.execute(
        select(DeviceConfiguration).where(
            DeviceConfiguration.instalacao_id == installation.id,
            DeviceConfiguration.status == "PENDING"
        )
    )).scalar_one_or_none()
    
    if not dev_config or not dev_config.proof_key_encrypted:
        raise HTTPException(status_code=422, detail="Nenhuma configuração pendente ou chave de prova encontrada")
        
    # Verificar o HMAC (Challenge-Response) usando a chave previamente salva pela Nuvem
    import hmac
    import hashlib
    from ..platform_identity import decrypt_platform_secret
    
    canonical_challenge = f"{challenge.id}|{challenge.nonce}|{station.id}|{installation.id}|{challenge.expires_at.isoformat()}"
    proof_key = decrypt_platform_secret(dev_config.proof_key_encrypted)
    
    expected_hmac = hmac.new(
        key=proof_key.encode(),
        msg=canonical_challenge.encode(),
        digestmod=hashlib.sha256
    ).hexdigest()
    
    if not hmac.compare_digest(expected_hmac, data.bridge_token_proof):
        raise HTTPException(status_code=403, detail="Falha na prova criptográfica da Bridge")
        
    challenge.used_at = datetime.utcnow()
    
    # Ativa a nova config e inativa as antigas
    await session.execute(
        update(DeviceConfiguration)
        .where(DeviceConfiguration.instalacao_id == installation.id, DeviceConfiguration.status == "ACTIVE")
        .values(status="INACTIVE", replaced_at=datetime.utcnow())
    )
    dev_config.status = "ACTIVE"
    
    evidence = BridgeValidation(
        id=uuid.uuid4(),
        tenant_id=tenant_id,
        instalacao_id=installation.id,
        bridge_url=data.bridge_url,
        token_proof_hash="VERIFIED",
        expires_at=datetime.utcnow() + timedelta(minutes=10)
    )
    session.add(evidence)
    await session.commit()
    return BridgeValidationOut(validation_id=evidence.id)


@router.post("/operators", response_model=OperatorOut, status_code=201)
async def post_operator(
    data: OperatorIn,
    context=Depends(require_backoffice("backoffice:operadores:gerenciar")),
):
    tenant_id, session, _user = context
    try:
        operator = await create_operator(session, tenant_id, data)
    except ValueError as exc:
        await session.rollback()
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    await session.commit()
    return operator


@router.get("/operators", response_model=list[OperatorOut])
async def get_operators(context=Depends(require_backoffice("backoffice:operadores:gerenciar"))):
    tenant_id, session, _user = context
    result = await session.execute(
        select(Operador).where(Operador.tenant_id == tenant_id, Operador.status == "ATIVO")
    )
    return list(result.scalars())


@router.post("/operators/{operator_id}/revoke", response_model=OperatorOut)
async def post_revoke_operator(
    operator_id: uuid.UUID,
    context=Depends(require_backoffice("backoffice:operadores:gerenciar")),
):
    tenant_id, session, _user = context
    operator = (await session.execute(
        select(Operador).where(Operador.id == operator_id, Operador.tenant_id == tenant_id)
    )).scalar_one_or_none()
    if operator is None:
        raise HTTPException(status_code=404, detail="Operador não encontrado")
    operator.status = "REVOGADO"
    await session.commit()
    return operator


@router.put("/stations/{station_id}/operators/{operator_id}")
async def put_station_operator(
    station_id: uuid.UUID, operator_id: uuid.UUID,
    context=Depends(require_backoffice("backoffice:operadores:gerenciar")),
):
    tenant_id, session, _user = context
    station = (await session.execute(select(Estacao).where(Estacao.id == station_id, Estacao.tenant_id == tenant_id))).scalar_one_or_none()
    operator = (await session.execute(select(Operador).where(Operador.id == operator_id, Operador.tenant_id == tenant_id))).scalar_one_or_none()
    if station is None or operator is None:
        raise HTTPException(status_code=404, detail="Estação ou operador não encontrado")
    if operator.status != "ATIVO":
        raise HTTPException(status_code=422, detail="Ative o operador antes de vinculá-lo a uma estação")
    link = (await session.execute(select(EstacaoOperador).where(
        EstacaoOperador.estacao_id == station_id, EstacaoOperador.operador_id == operator_id
    ))).scalar_one_or_none()
    if link is None:
        link = EstacaoOperador(estacao_id=station_id, operador_id=operator_id, tenant_id=tenant_id, status="ATIVO", created_at=datetime.utcnow())
        session.add(link)
    else:
        link.status = "ATIVO"
    await session.commit()
    return {"station_id": station_id, "operator_id": operator_id, "status": link.status}


@router.delete("/stations/{station_id}/operators/{operator_id}")
async def delete_station_operator(
    station_id: uuid.UUID, operator_id: uuid.UUID,
    context=Depends(require_backoffice("backoffice:operadores:gerenciar")),
):
    tenant_id, session, _user = context
    link = (await session.execute(select(EstacaoOperador).where(
        EstacaoOperador.estacao_id == station_id, EstacaoOperador.operador_id == operator_id,
        EstacaoOperador.tenant_id == tenant_id
    ))).scalar_one_or_none()
    if link is None:
        raise HTTPException(status_code=404, detail="Autorização não encontrada")
    link.status = "REVOGADO"
    await session.commit()
    return {"station_id": station_id, "operator_id": operator_id, "status": link.status}


@router.get("/stations/operators", response_model=list[OperatorOut])
async def get_station_operators(context=Depends(require_station)):
    tenant_id, session, station = context
    result = await session.execute(
        select(Operador).join(EstacaoOperador, EstacaoOperador.operador_id == Operador.id).where(
            Operador.tenant_id == tenant_id, Operador.status == "ATIVO",
            EstacaoOperador.estacao_id == station.id, EstacaoOperador.status == "ATIVO"
        )
    )
    return list(result.scalars())


@router.get("/stations/provisioning", response_model=StationProvisioningOut)
async def get_station_provisioning(context=Depends(require_station)):
    tenant_id, session, station = context
    result = await session.execute(
        select(Operador).join(EstacaoOperador, EstacaoOperador.operador_id == Operador.id).where(
            Operador.tenant_id == tenant_id, Operador.status == "ATIVO",
            EstacaoOperador.estacao_id == station.id, EstacaoOperador.status == "ATIVO"
        ).order_by(Operador.nome_exibicao)
    )
    return StationProvisioningOut(
        station_id=station.id, station_external_id=station.external_id,
        provisioning_version=station.recovery_secret_version,
        recovery_secret_hash=station.recovery_secret_hash,
        recovery_secret_version=station.recovery_secret_version,
        operators=[ProvisionedOperatorOut.model_validate(item) for item in result.scalars()],
    )


@router.post("/stations/operators/login")
async def post_station_operator_login(
    data: OperatorLoginIn,
    context=Depends(require_station),
):
    import hashlib
    import hmac

    tenant_id, session, station = context
    installation = station.authenticated_installation
    if installation.status != "ACTIVE":
        raise HTTPException(status_code=403, detail="Instalação substituída não pode operar")
    operator = (await session.execute(
        select(Operador).join(EstacaoOperador, EstacaoOperador.operador_id == Operador.id).where(
            Operador.id == data.operador_id,
            Operador.tenant_id == tenant_id,
            Operador.status == "ATIVO",
            EstacaoOperador.estacao_id == station.id,
            EstacaoOperador.status == "ATIVO",
        )
    )).scalar_one_or_none()
    expected = hashlib.sha256(data.pin.encode()).hexdigest()
    valid_pin = bool(operator and operator.pin_hash and hmac.compare_digest(operator.pin_hash, expected))
    if operator and operator.pin_hash and operator.pin_hash.startswith("$2"):
        import bcrypt
        valid_pin = bcrypt.checkpw(data.pin.encode(), operator.pin_hash.encode())
    if not valid_pin:
        raise HTTPException(status_code=401, detail="PIN de operador inválido")
    return {
        "operador_id": str(operator.id),
        "pessoa_id": operator.pessoa_ref,
        "nome_exibicao": operator.nome_exibicao,
    }


@router.post("/stations/offline-authorizations/replenish", response_model=schemas.OfflineCaptureAuthorizationReplenishOut, status_code=201)
async def post_offline_authorizations_replenish(data: schemas.OfflineCaptureAuthorizationReplenishIn, context=Depends(require_station)):
    tenant_id, session, station = context
    installation = station.authenticated_installation
    if installation.status != "ACTIVE":
        raise HTTPException(status_code=403, detail="Instalação inativa não pode obter novas autorizações")
        
    dev_config = (await session.execute(
        select(DeviceConfiguration).where(
            DeviceConfiguration.id == data.device_configuration_id,
            DeviceConfiguration.tenant_id == tenant_id,
            DeviceConfiguration.instalacao_id == installation.id
        )
    )).scalar_one_or_none()
    
    if not dev_config or dev_config.status != "ACTIVE":
        raise HTTPException(status_code=422, detail="Configuração inválida ou inativa")
        
    # Verifica quantas disponíveis ainda existem
    count_existing = (await session.execute(
        select(func.count(models.OfflineCaptureAuthorization.id)).where(
            models.OfflineCaptureAuthorization.instalacao_id == installation.id,
            models.OfflineCaptureAuthorization.device_configuration_id == dev_config.id,
            models.OfflineCaptureAuthorization.status == "AVAILABLE",
            models.OfflineCaptureAuthorization.expires_at > datetime.utcnow()
        )
    )).scalar() or 0
    
    needed = max(0, data.count - count_existing)
    new_auths = []
    
    import secrets
    now = datetime.utcnow()
    expires_at = now + timedelta(days=7) # 7 dias de limite para operação offline sem rede
    
    for _ in range(needed):
        auth = models.OfflineCaptureAuthorization(
            id=uuid.uuid4(),
            tenant_id=tenant_id,
            estacao_id=station.id,
            instalacao_id=installation.id,
            device_configuration_id=dev_config.id,
            status="AVAILABLE",
            nonce=secrets.token_hex(16),
            expires_at=expires_at,
            created_at=now
        )
        session.add(auth)
        new_auths.append(auth)
        
    if new_auths:
        await session.commit()
        
    # Retorna as geradas
    return schemas.OfflineCaptureAuthorizationReplenishOut(
        items=[
            schemas.OfflineCaptureAuthorizationOut(
                id=a.id,
                nonce=a.nonce,
                expires_at=a.expires_at
            ) for a in new_auths
        ]
    )

@router.post("/stations/pesagens", response_model=WeighingOut, status_code=201)
async def post_weighing(data: WeighingIn, context=Depends(require_station)):
    tenant_id, session, station = context
    installation = station.authenticated_installation
    if installation.status != "ACTIVE":
        raise HTTPException(status_code=403, detail="Instalação substituída não pode criar novas pesagens")
    try:
        capture = data.model_copy(update={"estacao_id": station.id, "installation_id": installation.id})
        weight = await complete_weighing(session, tenant_id, capture)
    except ValueError as exc:
        await session.rollback()
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    await session.commit()
    return weight


@router.post("/stations/orders/{order_id}/official-marks", response_model=OfficialMarkOut)
async def post_station_official_mark(
    order_id: uuid.UUID,
    data: OfficialMarkIn,
    context=Depends(require_station),
):
    """Station-scoped explicit replacement of an official capture mark."""
    tenant_id, session, _station = context
    try:
        mark = await set_official_mark(session, tenant_id, order_id, data)
    except ValueError as exc:
        await session.rollback()
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    await session.commit()
    return mark


@router.post("/stations/sync/push", response_model=SyncPushOut)
async def post_sync(data: SyncPushIn, context=Depends(require_station)):
    tenant_id, session, station = context
    installation = station.authenticated_installation
    results = []
    
    for item in data.items:
        payload = item.payload
        try:
            if payload.get("installation_id") != str(installation.id):
                raise ValueError("A pesagem não pertence à instalação autenticada")
            
            # Validação da Autorização de Captura
            auth_id_str = payload.get("authorization_id") or (item.authorization_id if hasattr(item, 'authorization_id') else None)
            if not auth_id_str:
                raise ValueError("Pesagem não autorizada: ausência de authorization_id")
            
            auth = (await session.execute(
                select(models.OfflineCaptureAuthorization).where(
                    models.OfflineCaptureAuthorization.id == auth_id_str,
                    models.OfflineCaptureAuthorization.tenant_id == tenant_id,
                    models.OfflineCaptureAuthorization.instalacao_id == installation.id
                )
            )).scalar_one_or_none()
            
            if not auth:
                raise ValueError("Autorização de captura inválida ou não pertence a esta instalação")
            # Reject invalid/replayed credits before resolving or creating an
            # Order. This keeps an invalid capture from leaving an orphan
            # canonical operation in the transaction.
            if auth.status == "CONSUMED" and auth.consumed_by_local_id != item.local_id:
                raise ValueError("Autorização já consumida por outra pesagem (replay detectado)")
            if auth.status != "CONSUMED" and auth.expires_at < datetime.utcnow():
                raise ValueError("Autorização expirada")

            offline_operation = None
            resolved_order = None
            operation_local_id = None
            if payload.get("operacao") is not None:
                offline_operation = schemas.OfflineOperationIn.model_validate(payload["operacao"])
                operation_local_id = offline_operation.operation_local_id
                resolved_order, conflict = await resolve_offline_operation(session, tenant_id, offline_operation)
                if conflict:
                    results.append(SyncResultOut(
                        local_id=item.local_id, status="CONFLICT", error_message=conflict,
                        operation_local_id=operation_local_id,
                    ))
                    continue
                
            if auth.status == "CONSUMED":
                # Idempotência: já consumida pelo MESMO local_id é aceita
                pass
            else:
                auth.status = "CONSUMED"
                auth.consumed_by_local_id = item.local_id
                auth.consumed_at = datetime.utcnow()
            
            weight = await complete_weighing(
                session,
                tenant_id,
                WeighingIn(
                    estacao_id=station.id,
                    installation_id=payload.get("installation_id"),
                    device_configuration_id=payload.get("device_configuration_id"),
                    ordem_id=str(resolved_order.id) if resolved_order else payload.get("ordem_id"),
                    client_system=payload.get("client_system"),
                    client_tenant_id=payload.get("client_tenant_id"),
                    subject_type=payload.get("subject_type"),
                    tipo_pesagem=payload.get("tipo_pesagem"),
                    local_id=item.local_id,
                    etapa=payload.get("etapa", "UNICA"),
                    peso_aferido_kg=payload["peso_aferido_kg"],
                    peso_informado_kg=payload.get("peso_informado_kg"),
                    peso_tara_kg=payload.get("peso_tara_kg"),
                    captured_via=payload.get("captured_via", "MANUAL"),
                    operador_id=payload.get("operador_id"),
                    leitura_bruta=payload.get("leitura_bruta"),
                    captured_at=payload.get("data_pesagem"),
                    direcao_veiculo=payload.get("direcao_veiculo"),
                    natureza_mercadoria=payload.get("natureza_mercadoria"),
                    tipo_operacao=payload.get("tipo_operacao"),
                    finalidade=payload.get("finalidade"),
                    metodo_medicao=payload.get("metodo_medicao"),
                    # Snapshot imutável da captura. Para operação local a
                    # Ordem já contém o contexto validado/canônico.
                    contexto=dict(resolved_order.contexto) if resolved_order else payload.get("contexto", {}),
                ),
            )
            results.append(SyncResultOut(
                local_id=item.local_id, status="CREATED", server_id=weight.id,
                operation_local_id=operation_local_id,
                ordem_id=resolved_order.id if resolved_order else weight.ordem_id,
            ))
        except (KeyError, ValueError) as exc:
            results.append(SyncResultOut(local_id=item.local_id, status="ERROR", error_message=str(exc)))
    await session.commit()
    return SyncPushOut(processed_at=datetime.utcnow(), results=results)


@router.get("/stations/sync/pull")
async def get_sync(context=Depends(require_station)):
    tenant_id, session, station = context
    installation = station.authenticated_installation
    if installation.status != "ACTIVE":
        raise HTTPException(status_code=403, detail="Instalação substituída não pode receber novas ordens")
    result = await session.execute(
        select(Ordem).where(
            Ordem.tenant_id == tenant_id,
            or_(
                Ordem.status.in_(["PENDENTE", "EM_PESAGEM"]),
                and_(Ordem.modalidade == "MULTIPLA", Ordem.status == "CONCLUIDA"),
            ),
        ).order_by(Ordem.created_at).limit(500)
    )
    order_objects = list(result.scalars())

    etapas_por_ordem = {}
    if order_objects:
        pesagens_result = await session.execute(
            select(Pesagem.ordem_id, Pesagem.etapa)
            .where(Pesagem.ordem_id.in_([o.id for o in order_objects]))
        )
        for ordem_id, etapa in pesagens_result:
            etapas_por_ordem.setdefault(ordem_id, []).append(etapa)

    orders = [
        {
            "id": str(order.id),
            "origem_tipo": "OUTRO",
            "origem_id": None,
            "referencia_externa": order.referencia_externa,
            "subject_type": order.subject_type,
            "tipo_pesagem": order.tipo_pesagem,
            "natureza_operacao": order.natureza_operacao,
            "modalidade": order.modalidade,
            "contexto": order.contexto,
            "status": order.status,
            "peso_bruto_kg": str(order.peso_bruto_kg) if order.peso_bruto_kg is not None else None,
            "peso_tara_kg": str(order.peso_tara_kg) if order.peso_tara_kg is not None else None,
            "peso_liquido_kg": str(order.peso_liquido_kg) if order.peso_liquido_kg is not None else None,
            "tara_source": order.tara_source,
            "resultado_status": order.resultado_status,
            "resultado_motivo": order.resultado_motivo,
            "delta_pre_operacao_kg": str(order.delta_pre_operacao_kg) if order.delta_pre_operacao_kg is not None else None,
            "delta_pos_operacao_kg": str(order.delta_pos_operacao_kg) if order.delta_pos_operacao_kg is not None else None,
            "produto_id": None,
            "produto_tipo": None,
            "tipo_volume": None,
            "quantidade_volumes": None,
            "data_agendada": None,
            "numero_documento_fiscal": None,
            "etapas_realizadas": etapas_por_ordem.get(order.id, []),
            "created_at": order.created_at.isoformat(),
        }
        for order in order_objects
    ]
    return {
        "sync_at": datetime.utcnow().isoformat(),
        "ordens_pendentes": orders,
        "tombstones": {"ordens": []},
        "animais": [],
    }


@router.get("/events", response_model=list[EventOut])
async def get_events(
    status: str | None = Query(default=None),
    context=Depends(require_client_scope("events:read")),
):
    tenant_id, session, _client = context
    stmt = select(Outbox).where(Outbox.tenant_id == tenant_id)
    if status:
        stmt = stmt.where(Outbox.status == status.upper())
    result = await session.execute(stmt.order_by(Outbox.created_at.desc()).limit(500))
    return list(result.scalars())


@router.get("/admin/events", response_model=list[EventOut])
async def get_admin_events(
    status: str | None = Query(default=None),
    context=Depends(require_backoffice("backoffice:eventos:consultar")),
):
    tenant_id, session, _user = context
    stmt = select(Outbox).where(Outbox.tenant_id == tenant_id)
    if status:
        stmt = stmt.where(Outbox.status == status.upper())
    result = await session.execute(stmt.order_by(Outbox.created_at.desc()).limit(500))
    return list(result.scalars())


@router.post("/admin/events/{event_id}/replay", response_model=EventOut)
async def replay_admin_event(
    event_id: uuid.UUID,
    context=Depends(require_backoffice("backoffice:eventos:consultar")),
):
    """Reenfileira um evento sem duplicar o registro nem alterar seu payload."""
    tenant_id, session, user = context
    event = (await session.execute(select(Outbox).where(
        Outbox.id == event_id, Outbox.tenant_id == tenant_id,
    ))).scalar_one_or_none()
    if event is None:
        raise HTTPException(status_code=404, detail="Evento não encontrado")
    previous_status = event.status
    event.status = "PENDENTE"
    event.next_attempt_at = None
    event.last_error = "Reenfileirado manualmente pelo Backoffice"
    event.updated_at = datetime.utcnow()
    session.add(OutboxReplayAudit(
        id=uuid.uuid4(), tenant_id=tenant_id, outbox_id=event.id,
        actor_user_id=user.id, previous_status=previous_status,
        reason="Reenfileirado manualmente pelo Backoffice", created_at=datetime.utcnow(),
    ))
    await session.commit()
    return event


@router.get("/admin/events/{event_id}/replays", response_model=list[EventReplayAuditOut])
async def get_admin_event_replays(
    event_id: uuid.UUID,
    context=Depends(require_backoffice("backoffice:eventos:consultar")),
):
    tenant_id, session, _user = context
    event = (await session.execute(select(Outbox).where(Outbox.id == event_id, Outbox.tenant_id == tenant_id))).scalar_one_or_none()
    if event is None:
        raise HTTPException(status_code=404, detail="Evento não encontrado")
    result = await session.execute(select(OutboxReplayAudit).where(
        OutboxReplayAudit.outbox_id == event_id, OutboxReplayAudit.tenant_id == tenant_id,
    ).order_by(OutboxReplayAudit.created_at.desc()))
    return list(result.scalars())


@router.get("/delivery/pending", response_model=DeliveryPullPageOut)
async def get_delivery_pending(
    limit: int = Query(100, ge=1, le=500),
    cursor: str | None = Query(None, description="Cursor opaque string (created_at,id)"),
    context=Depends(require_client_scope("delivery:read")),
):
    tenant_id, session, client = context

    stmt = select(DeliveryReceipt).where(
        DeliveryReceipt.tenant_id == tenant_id,
        DeliveryReceipt.status == "PENDENTE",
    )
    
    if cursor:
        try:
            # Decode cursor
            cursor_data = json.loads(base64.urlsafe_b64decode(cursor).decode('utf-8'))
            cursor_created_at = datetime.fromisoformat(cursor_data[0])
            cursor_id = uuid.UUID(cursor_data[1])
            stmt = stmt.where(
                or_(
                    DeliveryReceipt.created_at > cursor_created_at,
                    (DeliveryReceipt.created_at == cursor_created_at) & (DeliveryReceipt.id > cursor_id)
                )
            )
        except Exception:
            raise HTTPException(status_code=400, detail="Invalid cursor")
            
    stmt = stmt.order_by(DeliveryReceipt.created_at.asc(), DeliveryReceipt.id.asc()).limit(limit)
    result = await session.execute(stmt)
    receipts = list(result.scalars())
    
    next_cursor = None
    if len(receipts) == limit:
        last = receipts[-1]
        cursor_data = [last.created_at.isoformat(), str(last.id)]
        next_cursor = base64.urlsafe_b64encode(json.dumps(cursor_data).encode('utf-8')).decode('utf-8')
        
    items = [
        DeliveryReceiptOut(
            id=r.id,
            weighing_id=r.pesagem_id,
            payload=r.payload,
            status=r.status,
            created_at=r.created_at,
            acknowledged_at=r.acknowledged_at
        ) for r in receipts
    ]
    
    return DeliveryPullPageOut(items=items, next_cursor=next_cursor)


@router.post("/delivery/ack", response_model=DeliveryAckOut)
async def post_delivery_ack(
    data: DeliveryAckIn,
    context=Depends(require_client_scope("delivery:write")),
):
    tenant_id, session, client = context
    
    stmt = select(DeliveryReceipt).where(
        DeliveryReceipt.tenant_id == tenant_id,
        DeliveryReceipt.pesagem_id.in_(data.weighing_ids)
    )
    result = await session.execute(stmt)
    receipts = {r.pesagem_id: r for r in result.scalars()}
    
    missing_wids = [wid for wid in data.weighing_ids if wid not in receipts]
    tombstones = {}
    if missing_wids:
        from app.models import DeliveryTombstone
        stmt_t = select(DeliveryTombstone.pesagem_id).where(
            DeliveryTombstone.tenant_id == tenant_id,
            DeliveryTombstone.pesagem_id.in_(missing_wids)
        )
        result_t = await session.execute(stmt_t)
        tombstones = set(result_t.scalars())
        
    ack_results = []
    now = datetime.utcnow()
    
    for wid in data.weighing_ids:
        r = receipts.get(wid)
        if r:
            if r.status == "ACKNOWLEDGED":
                ack_results.append(DeliveryAckResult(weighing_id=wid, status="ALREADY_ACKNOWLEDGED"))
            else:
                r.status = "ACKNOWLEDGED"
                r.acknowledged_at = now
                r.acknowledged_by_api_client_id = client.id
                ack_results.append(DeliveryAckResult(weighing_id=wid, status="ACKNOWLEDGED"))
        elif wid in tombstones:
            ack_results.append(DeliveryAckResult(weighing_id=wid, status="ALREADY_PURGED"))
        else:
            ack_results.append(DeliveryAckResult(weighing_id=wid, status="NOT_FOUND"))
            
    await session.commit()
    
    return DeliveryAckOut(results=ack_results)
