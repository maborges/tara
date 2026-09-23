import os
import sys
import uuid
from pathlib import Path

import httpx
import pytest
from sqlalchemy.ext.asyncio import async_sessionmaker

os.environ.setdefault("TARA_DATABASE_URL", "postgresql+asyncpg://borgus:numsey01@192.168.0.2/farms")
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.db import _engine, set_tenant_context
from app.main import app
from app.service import bootstrap_admin, create_api_client


@pytest.mark.asyncio
async def test_avulsa_sync_query_and_reconciliation_flow():
    tenant_id = uuid.uuid4()
    login = f"avulsa-{uuid.uuid4().hex[:8]}"
    password = "Senha-Avulsa-123"
    async with async_sessionmaker(_engine, expire_on_commit=False)() as session:
        await set_tenant_context(session, str(tenant_id))
        await bootstrap_admin(session, tenant_id, login, "Admin Avulsa", password)
        client, secret = await create_api_client(
            session, tenant_id, "Cliente Avulsa",
            ["orders:write", "orders:read", "weighings:read", "weighings:reconcile", "stations:activate"], None,
        )
        await session.commit()

    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://balanca.test") as api:
        credentials = {
            "X-Balanca-Client-ID": client.client_id,
            "X-Balanca-Client-Secret": secret,
        }
        admin_login = await api.post("/v1/auth/login", json={"login": login, "password": password})
        assert admin_login.status_code == 200
        admin_headers = {
            "X-Tenant-ID": str(tenant_id),
            "Authorization": f"Bearer {admin_login.json()['access_token']}",
        }
        station = await api.post(
            "/v1/stations", headers=admin_headers,
            json={"external_id": f"station-{uuid.uuid4()}", "nome": "Estação Avulsa"},
        )
        assert station.status_code == 201, station.text
        activation = await api.post(
            "/v1/stations/activate", headers=credentials,
            json={"activation_code": station.json()["activation_code"]},
        )
        assert activation.status_code == 200, activation.text
        installation_id = activation.json()["installation_id"]
        device_configuration_id = activation.json()["device_configuration_id"]
        station_id = activation.json()["station_id"]
        station_headers = {
            "Authorization": f"Bearer {activation.json()['station_token']}",
        }

        # Activate device configuration
        response = await api.post("/v1/stations/device-configurations", headers=station_headers, json={
            "installation_id": installation_id,
            "bridge_url": "http://127.0.0.1:8321",
        })
        assert response.status_code == 201
        device_configuration_id = response.json()["id"]
        bridge_proof_key = response.json()["bridge_proof_key"]
        
        response = await api.post("/v1/stations/bridge-validations/challenge", headers=station_headers, json={
            "device_configuration_id": device_configuration_id
        })
        challenge_id = response.json()["challenge_id"]
        nonce = response.json()["nonce"]

        async with async_sessionmaker(_engine, expire_on_commit=False)() as s:
            from app.models import BridgeChallenge
            from sqlalchemy import select
            ch = (await s.execute(select(BridgeChallenge).where(BridgeChallenge.id == uuid.UUID(challenge_id)))).scalar_one()
            expires_at = ch.expires_at.isoformat()

        canonical_challenge = f"{challenge_id}|{nonce}|{station_id}|{installation_id}|{expires_at}"
        import hmac, hashlib
        proof = hmac.new(bridge_proof_key.encode(), canonical_challenge.encode(), hashlib.sha256).hexdigest()

        response = await api.post("/v1/stations/bridge-validations", headers=station_headers, json={
            "bridge_url": "http://127.0.0.1:8321",
            "challenge_id": challenge_id,
            "bridge_token_proof": proof,
            "peso_kg": 100.0
        })
        assert response.status_code == 201

        # Replenish offline authorizations
        response = await api.post("/v1/stations/offline-authorizations/replenish", headers=station_headers, json={
            "device_configuration_id": device_configuration_id,
            "count": 10
        })
        assert response.status_code == 201
        auth_id_1 = response.json()["items"][0]["id"]
        auth_id_2 = response.json()["items"][1]["id"]
        auth_id_3 = response.json()["items"][2]["id"]
        auth_id_4 = response.json()["items"][3]["id"]
        auth_id_5 = response.json()["items"][4]["id"]
        auth_id_6 = response.json()["items"][5]["id"]
        auth_id_7 = response.json()["items"][6]["id"]
        auth_id_8 = response.json()["items"][7]["id"]
        auth_id_9 = response.json()["items"][8]["id"]
        auth_id_10 = response.json()["items"][9]["id"]

        capture_id = str(uuid.uuid4())
        pushed = await api.post(
            "/v1/stations/sync/push", headers=station_headers,
            json={"items": [{"local_id": capture_id, "authorization_id": auth_id_1, "payload": {
                "ordem_id": None,
                "installation_id": installation_id,
                "device_configuration_id": device_configuration_id,
                "etapa": "UNICA",
                "peso_aferido_kg": "12000.000",
                "peso_tara_kg": "1000.000",
                "captured_via": "ELETRONICA",
                "direcao_veiculo": "ENTRADA",
                "natureza_mercadoria": "ENTRADA",
                "tipo_operacao": "RECEBIMENTO",
                "authorization_id": auth_id_1,
                "contexto": {
                    "cfop": "1101", "nota_fiscal": {"numero": "123"},
                    "veiculo": {"placa": "ABC1D23"}, "motorista": {"nome": "João"},
                    "transportadora": {"nome": "Transporte Teste"},
                },
            }}]},
        )
        assert pushed.status_code == 200, pushed.text
        assert pushed.json()["results"][0]["status"] == "CREATED"

        second_capture = await api.post(
            "/v1/stations/sync/push", headers=station_headers,
            json={"items": [{"local_id": str(uuid.uuid4()), "authorization_id": auth_id_2, "payload": {
                "ordem_id": None, "etapa": "UNICA", "peso_aferido_kg": "8000.000",
                "installation_id": installation_id,
                "device_configuration_id": device_configuration_id,
                "authorization_id": auth_id_2,
                "peso_tara_kg": "500.000", "captured_via": "MANUAL",
                "direcao_veiculo": "SAIDA", "natureza_mercadoria": "SAIDA",
                "tipo_operacao": "EXPEDICAO", "contexto": {"cfop": "5101"},
            }}]},
        )
        assert second_capture.status_code == 200, second_capture.text

        listed = await api.get("/v1/weighings?status=NAO_RECONCILIADA&limit=1", headers=credentials)
        assert listed.status_code == 200, listed.text
        assert listed.json()["next_cursor"]
        weighing = listed.json()["items"][0]
        assert weighing["ordem_id"] is None
        assert weighing["contexto"]["cfop"] == "5101"
        next_page = await api.get(
            f"/v1/weighings?status=NAO_RECONCILIADA&limit=1&cursor={listed.json()['next_cursor']}",
            headers=credentials,
        )
        assert next_page.status_code == 200, next_page.text
        assert len(next_page.json()["items"]) == 1
        first_weighing = next_page.json()["items"][0]
        assert first_weighing["contexto"]["nota_fiscal"]["numero"] == "123"

        order = await api.post(
            "/v1/orders", headers=credentials,
            json={"client_system": "agrosaas", "client_tenant_id": "fazenda-avulsa",
                  "external_reference": f"ordem-{uuid.uuid4()}", "correlation_id": f"corr-{uuid.uuid4()}",
                  "subject_type": "VEICULO", "tipo_pesagem": "UNICA", "contexto": {}},
        )
        assert order.status_code == 201, order.text
        reconciled = await api.post(
            f"/v1/weighings/{first_weighing['id']}/reconcile", headers=credentials,
            json={"status": "VINCULADA", "ordem_id": order.json()["id"]},
        )
        assert reconciled.status_code == 200, reconciled.text
        assert reconciled.json()["ordem_id"] == order.json()["id"]

        # OFFLINE-OP-01B: one local operation has a distinct identity from
        # each capture. First push creates exactly one canonical Order and
        # second passage reuses it after a retry/mapping response.
        operation_local_id = str(uuid.uuid4())
        reference = f"ROM-{uuid.uuid4().hex[:10]}"
        operation = {
            "operation_local_id": operation_local_id,
            "subject_type": "VEICULO",
            "tipo_pesagem": "DUPLA_ENTRADA_DESCARGA",
            "processo": {"tipo": "ROMANEIO", "referencia": reference},
            "referencia_externa": reference,
            "correlation_id": str(uuid.uuid4()),
            "veiculo": {"placa_cavalo": "ABC1D23", "carretas": [{"placa": "DEF4G56"}, {"placa": "HIJ7K89"}]},
            "motorista": {"nome": "João da Silva", "documento": {"tipo": "CNH", "numero": "12345678900"}},
            "contexto": {},
        }
        first_local_id = str(uuid.uuid4())
        first_push = await api.post("/v1/stations/sync/push", headers=station_headers, json={"items": [{
            "local_id": first_local_id, "authorization_id": auth_id_3, "payload": {
                "installation_id": installation_id, "device_configuration_id": device_configuration_id,
                "authorization_id": auth_id_3, "ordem_id": None, "etapa": "CHEGADA",
                "peso_aferido_kg": "42000.000", "captured_via": "ELETRONICA", "operacao": operation,
            },
        }]})
        assert first_push.status_code == 200, first_push.text
        first_result = first_push.json()["results"][0]
        assert first_result["status"] == "CREATED"
        assert first_result["operation_local_id"] == operation_local_id
        ordem_id = first_result["ordem_id"]
        assert ordem_id

        # Lost response/retry must reuse the same Order and same physical fact.
        retry = await api.post("/v1/stations/sync/push", headers=station_headers, json={"items": [{
            "local_id": first_local_id, "authorization_id": auth_id_3, "payload": {
                "installation_id": installation_id, "device_configuration_id": device_configuration_id,
                "authorization_id": auth_id_3, "etapa": "CHEGADA", "peso_aferido_kg": "42000.000",
                "captured_via": "ELETRONICA", "operacao": operation,
            },
        }]})
        assert retry.status_code == 200
        assert retry.json()["results"][0]["ordem_id"] == ordem_id

        second_local_id = str(uuid.uuid4())
        second_push = await api.post("/v1/stations/sync/push", headers=station_headers, json={"items": [{
            "local_id": second_local_id, "authorization_id": auth_id_4, "payload": {
                "installation_id": installation_id, "device_configuration_id": device_configuration_id,
                "authorization_id": auth_id_4, "etapa": "POS_DESCARGA", "peso_aferido_kg": "15000.000",
                "captured_via": "ELETRONICA", "operacao": operation,
            },
        }]})
        assert second_push.status_code == 200, second_push.text
        assert second_push.json()["results"][0]["ordem_id"] == ordem_id

        # 02D: the same offline operation supports PRE, an arbitrary
        # intermediate capture, POS and a repeated PRE conference without
        # creating another Order or silently replacing the official PRE mark.
        multiple_operation = {
            "operation_local_id": str(uuid.uuid4()),
            "subject_type": "VEICULO",
            "tipo_pesagem": "MULTIPLA",
            "natureza_operacao": "RECEBIMENTO",
            "modalidade": "MULTIPLA",
            "processo": {"tipo": "ROMANEIO", "referencia": f"MULTI-{uuid.uuid4().hex[:10]}"},
            "referencia_externa": f"MULTI-{uuid.uuid4().hex[:10]}",
            "correlation_id": str(uuid.uuid4()),
            "veiculo": {"placa_cavalo": "KLM1N23", "carretas": []},
            "motorista": {"nome": "Operador Multi", "documento": {"tipo": "CNH", "numero": "98765432100"}},
            "contexto": {},
        }
        multi_pre_local = str(uuid.uuid4())
        multi_pre = await api.post("/v1/stations/sync/push", headers=station_headers, json={"items": [{
            "local_id": multi_pre_local, "authorization_id": auth_id_7, "payload": {
                "installation_id": installation_id, "device_configuration_id": device_configuration_id,
                "authorization_id": auth_id_7, "etapa": "PRE_OPERACAO", "peso_aferido_kg": "42000.000",
                "captured_via": "ELETRONICA", "finalidade": "OPERACIONAL", "metodo_medicao": "ESTATICA",
                "operacao": multiple_operation,
            },
        }]})
        assert multi_pre.status_code == 200
        multi_order_id = multi_pre.json()["results"][0]["ordem_id"]
        assert multi_order_id

        multi_retry = await api.post("/v1/stations/sync/push", headers=station_headers, json={"items": [{
            "local_id": multi_pre_local, "authorization_id": auth_id_7, "payload": {
                "installation_id": installation_id, "device_configuration_id": device_configuration_id,
                "authorization_id": auth_id_7, "etapa": "PRE_OPERACAO", "peso_aferido_kg": "42000.000",
                "captured_via": "ELETRONICA", "finalidade": "OPERACIONAL", "metodo_medicao": "ESTATICA",
                "operacao": multiple_operation,
            },
        }]})
        assert multi_retry.status_code == 200
        assert multi_retry.json()["results"][0]["ordem_id"] == multi_order_id

        multi_intermediate = await api.post("/v1/stations/sync/push", headers=station_headers, json={"items": [{
            "local_id": str(uuid.uuid4()), "authorization_id": auth_id_8, "payload": {
                "installation_id": installation_id, "device_configuration_id": device_configuration_id,
                "authorization_id": auth_id_8, "ordem_id": multi_order_id, "etapa": "INTERMEDIARIA",
                "peso_aferido_kg": "25000.000", "captured_via": "ELETRONICA",
                "finalidade": "OPERACIONAL", "metodo_medicao": "ESTATICA", "operacao": multiple_operation,
            },
        }]})
        assert multi_intermediate.status_code == 200

        multi_pos = await api.post("/v1/stations/sync/push", headers=station_headers, json={"items": [{
            "local_id": str(uuid.uuid4()), "authorization_id": auth_id_9, "payload": {
                "installation_id": installation_id, "device_configuration_id": device_configuration_id,
                "authorization_id": auth_id_9, "ordem_id": multi_order_id, "etapa": "POS_OPERACAO",
                "peso_aferido_kg": "15000.000", "captured_via": "ELETRONICA",
                "finalidade": "OPERACIONAL", "metodo_medicao": "ESTATICA", "operacao": multiple_operation,
            },
        }]})
        assert multi_pos.status_code == 200

        multi_conference = await api.post("/v1/stations/sync/push", headers=station_headers, json={"items": [{
            "local_id": str(uuid.uuid4()), "authorization_id": auth_id_10, "payload": {
                "installation_id": installation_id, "device_configuration_id": device_configuration_id,
                "authorization_id": auth_id_10, "ordem_id": multi_order_id, "etapa": "PRE_OPERACAO",
                "peso_aferido_kg": "41950.000", "captured_via": "ELETRONICA",
                "finalidade": "CONFERENCIA", "metodo_medicao": "ESTATICA", "operacao": multiple_operation,
            },
        }]})
        assert multi_conference.status_code == 200
        assert multi_conference.json()["results"][0]["ordem_id"] == multi_order_id
        conference_server_id = multi_conference.json()["results"][0]["server_id"]

        canonical_multi = await api.get("/v1/orders", headers=credentials)
        multi_order = next(item for item in canonical_multi.json()["items"] if item["id"] == multi_order_id)
        assert multi_order["status"] == "CONCLUIDA"
        assert multi_order["peso_liquido_kg"] == "27000.000"

        from app.models import Pesagem
        from sqlalchemy import select
        async with async_sessionmaker(_engine, expire_on_commit=False)() as verify_session:
            await set_tenant_context(verify_session, str(tenant_id))
            captures = (await verify_session.execute(select(Pesagem).where(Pesagem.ordem_id == uuid.UUID(multi_order_id)))).scalars().all()
            assert len(captures) == 4
            assert sorted(c.etapa for c in captures) == ["INTERMEDIARIA", "POS_OPERACAO", "PRE_OPERACAO", "PRE_OPERACAO"]

        officialized = await api.post(
            f"/v1/stations/orders/{multi_order_id}/official-marks",
            headers=station_headers,
            json={"pesagem_id": conference_server_id, "etapa": "PRE_OPERACAO"},
        )
        assert officialized.status_code == 200, officialized.text
        updated_multi = await api.get("/v1/orders", headers=credentials)
        updated_order = next(item for item in updated_multi.json()["items"] if item["id"] == multi_order_id)
        assert updated_order["peso_liquido_kg"] == "26950.000"

        pulled = await api.get("/v1/stations/sync/pull", headers=station_headers)
        assert pulled.status_code == 200
        pulled_multi = next(item for item in pulled.json()["ordens_pendentes"] if item["id"] == multi_order_id)
        assert pulled_multi["resultado_status"] == "VALIDO"
        assert pulled_multi["peso_liquido_kg"] == "26950.000"

        canonical = await api.get("/v1/orders", headers=credentials)
        created = next(item for item in canonical.json()["items"] if item["id"] == ordem_id)
        assert created["status"] == "CONCLUIDA"
        assert created["peso_liquido_kg"] == "27000.000"

        # A pre-existing equivalent Order is adopted, not duplicated.
        existing_reference = f"ROM-{uuid.uuid4().hex[:10]}"
        equivalent_context = {
            "processo": {"tipo": "ROMANEIO", "referencia": existing_reference},
            "veiculo": {"placa_cavalo": "AAA1A11", "carretas": [{"placa": "BBB2B22"}]},
            "motorista": {"nome": "Maria", "documento": {"tipo": "CPF", "numero": "123"}},
        }
        existing = await api.post("/v1/orders", headers=credentials, json={
            "client_system": "agrosaas", "client_tenant_id": "fazenda-avulsa",
            "external_reference": existing_reference, "correlation_id": str(uuid.uuid4()),
            "subject_type": "VEICULO", "tipo_pesagem": "UNICA", "contexto": equivalent_context,
        })
        assert existing.status_code == 201, existing.text
        assert existing.json()["contexto"] == equivalent_context
        equivalent_operation = {
            "operation_local_id": str(uuid.uuid4()), "subject_type": "VEICULO", "tipo_pesagem": "UNICA",
            "processo": equivalent_context["processo"], "referencia_externa": existing_reference,
            "correlation_id": str(uuid.uuid4()), "veiculo": equivalent_context["veiculo"],
            "motorista": equivalent_context["motorista"], "contexto": {},
        }
        equivalent = await api.post("/v1/stations/sync/push", headers=station_headers, json={"items": [{
            "local_id": str(uuid.uuid4()), "authorization_id": auth_id_6, "payload": {
                "installation_id": installation_id, "device_configuration_id": device_configuration_id,
                "authorization_id": auth_id_6, "etapa": "UNICA", "peso_aferido_kg": "1000.000",
                "captured_via": "MANUAL", "operacao": equivalent_operation,
            },
        }]})
        assert equivalent.status_code == 200, equivalent.text
        assert equivalent.json()["results"][0]["status"] == "CREATED", equivalent.json()
        assert equivalent.json()["results"][0]["ordem_id"] == existing.json()["id"]

        # Same external reference with a materially different horse is an
        # explicit reconciliation conflict, never a silent merge.
        conflict_operation = {**operation, "operation_local_id": str(uuid.uuid4()), "correlation_id": str(uuid.uuid4()),
                              "veiculo": {"placa_cavalo": "XYZ9Z99", "carretas": [{"placa": "DEF4G56"}]}}
        conflict = await api.post("/v1/stations/sync/push", headers=station_headers, json={"items": [{
            "local_id": str(uuid.uuid4()), "authorization_id": auth_id_5, "payload": {
                "installation_id": installation_id, "device_configuration_id": device_configuration_id,
                "authorization_id": auth_id_5, "etapa": "CHEGADA", "peso_aferido_kg": "42000.000",
                "captured_via": "MANUAL", "operacao": conflict_operation,
            },
        }]})
        assert conflict.status_code == 200
        assert conflict.json()["results"][0]["status"] == "CONFLICT"
