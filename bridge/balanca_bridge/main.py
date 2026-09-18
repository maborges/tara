from __future__ import annotations

import asyncio
import logging
import os
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Request, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from balanca_bridge.config import BridgeConfig, load_config
from balanca_bridge.protocol_adapter import ProtocolAdapter
from balanca_bridge.serial_reader import run_serial_reader
from balanca_bridge.tcp_reader import run_tcp_reader
from balanca_bridge.state import LeituraState

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s %(levelname)s %(message)s")
logger = logging.getLogger("balanca_bridge")

CONFIG_PATH = os.environ.get("TARA_BRIDGE_CONFIG", "config.yaml")


def _check_token(request: Request, config: BridgeConfig) -> None:
    if not config.api_token:
        return
    if request.headers.get("X-Bridge-Token") != config.api_token:
        raise HTTPException(status_code=401, detail="Token da ponte inválido ou ausente.")


@asynccontextmanager
async def lifespan(app: FastAPI):
    config = load_config(CONFIG_PATH)
    app.state.config = config
    app.state.leitura_state = LeituraState(
        stale_after_seconds=config.stale_after_seconds,
        stable_readings=config.stable_readings,
        stable_tolerance_kg=config.stable_tolerance_kg,
    )
    adapter = ProtocolAdapter(config.protocol)

    if config.connection_type == "SERIAL":
        task = asyncio.create_task(run_serial_reader(config.serial, adapter, app.state.leitura_state))
    else:
        task = asyncio.create_task(
            run_tcp_reader(config.tcp, config.protocol, adapter, app.state.leitura_state)
        )

    logger.info("Ponte de balança iniciada — modo %s.", config.connection_type)
    yield

    task.cancel()
    try:
        await task
    except asyncio.CancelledError:
        pass


app = FastAPI(title="Balança Bridge", version="0.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # rede local/confiável — PWA pode rodar em qualquer host da LAN
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
)


def _get_proof_key_path() -> str:
    config_dir = os.path.dirname(CONFIG_PATH) or "."
    return os.path.join(config_dir, ".proof_key.txt")


class ProvisionIn(BaseModel):
    proof_key: str

@app.post("/provision")
async def provision_bridge(payload: ProvisionIn, request: Request):
    _check_token(request, request.app.state.config)
    try:
        with open(_get_proof_key_path(), "w", encoding="utf-8") as f:
            f.write(payload.proof_key.strip())
    except IOError as e:
        logger.error(f"Failed to save proof key: {e}")
        raise HTTPException(status_code=500, detail="Erro ao gravar chave de prova na Bridge")
    return {"status": "ok"}



class ChallengeIn(BaseModel):
    challenge_id: str
    nonce: str
    station_id: str
    installation_id: str
    expires_at: str

@app.post("/challenge")
async def answer_challenge(payload: ChallengeIn, request: Request):
    # A Bridge proof no longer relies on api_token hash. 
    # It must use the secure proof_key provisioned by the Station.
    
    proof_key_path = _get_proof_key_path()
    if not os.path.exists(proof_key_path):
        raise HTTPException(status_code=400, detail="Bridge proof_key não configurada (Bridge não provisionada)")
        
    try:
        with open(proof_key_path, "r", encoding="utf-8") as f:
            proof_key = f.read().strip()
    except IOError:
        raise HTTPException(status_code=500, detail="Erro ao ler a proof_key")
        
    if not proof_key:
        raise HTTPException(status_code=400, detail="proof_key vazia")
    
    import hmac
    import hashlib
    
    # 2. Reconstruir a string canônica
    canonical_challenge = f"{payload.challenge_id}|{payload.nonce}|{payload.station_id}|{payload.installation_id}|{payload.expires_at}"
    
    # 3. Assinar usando HMAC(key=proof_key, msg=canonical_challenge)
    proof = hmac.new(
        key=proof_key.encode(),
        msg=canonical_challenge.encode(),
        digestmod=hashlib.sha256
    ).hexdigest()
    
    # Não retornamos mais token_hash, apenas proof
    return {"proof": proof}


@app.get("/health")
async def health():
    return {"status": "ok"}


@app.get("/peso-atual")
async def peso_atual(request: Request):
    _check_token(request, request.app.state.config)
    return await request.app.state.leitura_state.obter()


@app.websocket("/ws/peso")
async def ws_peso(websocket: WebSocket):
    config: BridgeConfig = websocket.app.state.config
    if config.api_token:
        # Navegadores não permitem header customizado no handshake do WebSocket —
        # aceita também via query string (?token=...) além do header (útil para
        # outros clientes, ex.: scripts de teste).
        token = websocket.headers.get("x-bridge-token") or websocket.query_params.get("token")
        if token != config.api_token:
            await websocket.close(code=4401)
            return

    await websocket.accept()
    state: LeituraState = websocket.app.state.leitura_state
    queue = state.subscribe()
    try:
        # Envia o estado atual imediatamente, depois só atualizações.
        await websocket.send_json(await state.obter())
        while True:
            leitura = await queue.get()
            await websocket.send_json(
                {
                    "conectado": True,
                    "erro": None,
                    "peso_kg": str(leitura.peso_kg),
                    "raw": leitura.raw,
                    "timestamp": leitura.timestamp,
                    "stale": False,
                    "stable": leitura.stable,
                }
            )
    except WebSocketDisconnect:
        pass
    finally:
        state.unsubscribe(queue)


def run() -> None:
    import uvicorn

    config = load_config(CONFIG_PATH)
    uvicorn.run("balanca_bridge.main:app", host=config.http_host, port=config.http_port)


if __name__ == "__main__":
    run()
