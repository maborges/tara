from fastapi import APIRouter, Depends, Header, HTTPException, Query
import base64
import json
from datetime import datetime
import uuid
from sqlalchemy import and_, or_, select

from ..auth import get_session, require_station, set_tenant_context
from ..security import require_backoffice, require_client_scope
from ..config import get_settings
from ..models import ApiClient, Cliente, Conta, Estacao, EstacaoOperador, Operador, Ordem, Outbox, OutboxReplayAudit, Pesagem
from ..schemas import (
    ActivationIn, ActivationOut, AccountOut, ClientIn, ClientOut, EventOut, EventReplayAuditOut, OperatorIn, OperatorOut, ProvisionedOperatorOut, StationProvisioningOut,
    OrderIn, OrderOut, OrderPageOut, StationIn, StationOut, WeighingIn, WeighingOut, WeighingPageOut, WeighingReconciliationIn,
    SyncPushIn, SyncPushOut, SyncResultOut, OperatorLoginIn, LoginIn, LoginOut,
    ApiClientIn, ApiClientUpdateIn, ApiClientOut, ApiClientCredentialOut, ApiClientStatusOut, ApiClientListOut,
    ContingencyPackageIn, ContingencyImportOut,
)
from ..contingency_service import import_contingency_package
from ..operation import (
    activate_station, complete_weighing, create_operator, create_order, create_station,
    register_client, reconcile_weighing,
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
        station, token, recovery_secret = await activate_station(session, tenant_id, data)
    except ValueError as exc:
        await session.rollback()
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    await session.commit()
    return ActivationOut(station_id=station.id, station_token=token, recovery_secret=recovery_secret)


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

    tenant_id, session, _station = context
    operator = (await session.execute(
        select(Operador).where(
            Operador.id == data.operador_id,
            Operador.tenant_id == tenant_id,
            Operador.status == "ATIVO",
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


@router.post("/stations/pesagens", response_model=WeighingOut, status_code=201)
async def post_weighing(data: WeighingIn, context=Depends(require_station)):
    tenant_id, session, station = context
    try:
        capture = data.model_copy(update={"estacao_id": station.id})
        weight = await complete_weighing(session, tenant_id, capture)
    except ValueError as exc:
        await session.rollback()
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    await session.commit()
    return weight


@router.post("/stations/sync/push", response_model=SyncPushOut)
async def post_sync(data: SyncPushIn, context=Depends(require_station)):
    tenant_id, session, station = context
    results = []
    for item in data.items:
        payload = item.payload
        try:
            weight = await complete_weighing(
                session,
                tenant_id,
                WeighingIn(
                    estacao_id=station.id,
                    ordem_id=payload.get("ordem_id"),
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
                    leitura_bruta=payload.get("leitura_bruta"),
                    captured_at=payload.get("data_pesagem"),
                    direcao_veiculo=payload.get("direcao_veiculo"),
                    natureza_mercadoria=payload.get("natureza_mercadoria"),
                    tipo_operacao=payload.get("tipo_operacao"),
                    contexto=payload.get("contexto", {}),
                ),
            )
            results.append(SyncResultOut(local_id=item.local_id, status="CREATED", server_id=weight.id))
        except (KeyError, ValueError) as exc:
            results.append(SyncResultOut(local_id=item.local_id, status="ERROR", error_message=str(exc)))
    await session.commit()
    return SyncPushOut(processed_at=datetime.utcnow(), results=results)


@router.get("/stations/sync/pull")
async def get_sync(context=Depends(require_station)):
    tenant_id, session, _station = context
    result = await session.execute(
        select(Ordem).where(Ordem.tenant_id == tenant_id, Ordem.status == "PENDENTE")
        .order_by(Ordem.created_at)
        .limit(500)
    )
    orders = [
        {
            "id": str(order.id),
            "origem_tipo": "OUTRO",
            "origem_id": None,
            "subject_type": order.subject_type,
            "tipo_pesagem": order.tipo_pesagem,
            "contexto": order.contexto,
            "status": order.status,
            "produto_id": None,
            "produto_tipo": None,
            "tipo_volume": None,
            "quantidade_volumes": None,
            "data_agendada": None,
            "numero_documento_fiscal": None,
            "etapas_realizadas": [],
            "created_at": order.created_at.isoformat(),
        }
        for order in result.scalars()
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
    tenant_id, session, _user = context
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
