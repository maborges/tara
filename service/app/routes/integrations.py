from fastapi import APIRouter, Depends, Header, HTTPException, Query
from datetime import datetime
import uuid
from sqlalchemy import select

from ..auth import get_session, require_station, set_tenant_context
from ..security import require_backoffice, require_client_scope
from ..config import get_settings
from ..models import ApiClient, Cliente, Estacao, Operador, Ordem, Outbox
from ..schemas import (
    ActivationIn, ActivationOut, ClientIn, ClientOut, EventOut, OperatorIn, OperatorOut,
    OrderIn, OrderOut, StationIn, StationOut, WeighingIn, WeighingOut,
    SyncPushIn, SyncPushOut, SyncResultOut, OperatorLoginIn, LoginIn, LoginOut,
    ApiClientIn, ApiClientOut, ApiClientCredentialOut, ApiClientStatusOut, ApiClientListOut,
    ContingencyPackageIn, ContingencyImportOut,
)
from ..contingency_service import import_contingency_package
from ..service import (
    activate_station, complete_weighing, create_operator, create_order, create_station,
    register_client, login_backoffice, login_backoffice_without_tenant,
    create_api_client, rotate_api_client, revoke_api_client,
)

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
    return LoginOut(
        access_token=token,
        expires_in=get_settings().jwt_access_minutes * 60,
        user_id=user.id,
        tenant_id=tenant_id,
        permissions=sorted(permissions),
    )


@router.post("/admin/api-clients", response_model=ApiClientCredentialOut, status_code=201)
async def post_api_client(
    data: ApiClientIn,
    context=Depends(require_backoffice("backoffice:clientes:gerenciar")),
):
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
    order = await create_order(session, tenant_id, data)
    await session.commit()
    return order


@router.get("/orders", response_model=list[OrderOut])
async def get_orders(
    status: str | None = Query(default=None),
    context=Depends(require_backoffice("backoffice:ordens:gerenciar")),
):
    tenant_id, session, _user = context
    stmt = select(Ordem).where(Ordem.tenant_id == tenant_id)
    if status:
        stmt = stmt.where(Ordem.status == status.upper())
    result = await session.execute(stmt.order_by(Ordem.created_at.desc()).limit(500))
    return list(result.scalars())


@router.post("/stations", response_model=StationOut, status_code=201)
async def post_station(
    data: StationIn,
    context=Depends(require_backoffice("backoffice:estacoes:gerenciar")),
):
    tenant_id, session, _user = context
    station = await create_station(session, tenant_id, data)
    await session.commit()
    return station


@router.get("/stations", response_model=list[StationOut])
async def get_stations(context=Depends(require_backoffice("backoffice:estacoes:gerenciar"))):
    tenant_id, session, _user = context
    result = await session.execute(
        select(Estacao).where(Estacao.tenant_id == tenant_id).order_by(Estacao.nome)
    )
    return list(result.scalars())


@router.post("/stations/activate", response_model=ActivationOut)
async def post_station_activation(
    data: ActivationIn,
    context=Depends(require_client_scope("stations:activate")),
):
    tenant_id, session, _client = context
    try:
        station, token = await activate_station(session, tenant_id, data)
    except ValueError as exc:
        await session.rollback()
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    await session.commit()
    return ActivationOut(station_id=station.id, station_token=token)


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


@router.get("/stations/operators", response_model=list[OperatorOut])
async def get_station_operators(context=Depends(require_station)):
    tenant_id, session = context
    result = await session.execute(
        select(Operador).where(Operador.tenant_id == tenant_id, Operador.status == "ATIVO")
    )
    return list(result.scalars())


@router.post("/stations/operators/login")
async def post_station_operator_login(
    data: OperatorLoginIn,
    context=Depends(require_station),
):
    import hashlib
    import hmac

    tenant_id, session = context
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
    tenant_id, session = context
    try:
        weight = await complete_weighing(session, tenant_id, data)
    except ValueError as exc:
        await session.rollback()
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    await session.commit()
    return weight


@router.post("/stations/sync/push", response_model=SyncPushOut)
async def post_sync(data: SyncPushIn, context=Depends(require_station)):
    tenant_id, session = context
    results = []
    for item in data.items:
        payload = item.payload
        try:
            weight = await complete_weighing(
                session,
                tenant_id,
                WeighingIn(
                    ordem_id=payload["ordem_id"],
                    local_id=item.local_id,
                    etapa=payload.get("etapa", "UNICA"),
                    peso_aferido_kg=payload["peso_aferido_kg"],
                    peso_informado_kg=payload.get("peso_informado_kg"),
                    peso_tara_kg=payload.get("peso_tara_kg"),
                    captured_via=payload.get("captured_via", "MANUAL"),
                    leitura_bruta=payload.get("leitura_bruta"),
                    captured_at=payload.get("data_pesagem"),
                ),
            )
            results.append(SyncResultOut(local_id=item.local_id, status="CREATED", server_id=weight.id))
        except (KeyError, ValueError) as exc:
            results.append(SyncResultOut(local_id=item.local_id, status="ERROR", error_message=str(exc)))
    await session.commit()
    return SyncPushOut(processed_at=datetime.utcnow(), results=results)


@router.get("/stations/sync/pull")
async def get_sync(context=Depends(require_station)):
    tenant_id, session = context
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
