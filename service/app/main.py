from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import text

from .config import get_settings
from .db import _engine, dispose_engine
from .routes.integrations import router


@asynccontextmanager
async def lifespan(app: FastAPI):
    yield
    await dispose_engine()


app = FastAPI(
    title="Balança Service",
    version=get_settings().service_version,
    description="Serviço independente de pesagem e conciliação do AgroSaaS.",
    lifespan=lifespan,
)
app.include_router(router)

app.add_middleware(
    CORSMiddleware,
    allow_origins=get_settings().cors_origins,
    allow_credentials=False,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=[
        "Authorization",
        "Content-Type",
        "X-Tenant-ID",
        "X-Balanca-Client-ID",
        "X-Balanca-Client-Secret",
    ],
)


@app.get("/healthz", tags=["Operação"])
async def healthz():
    return {"status": "ok", "service": get_settings().service_name}


@app.get("/readyz", tags=["Operação"])
async def readyz():
    try:
        async with _engine.connect() as connection:
            await connection.execute(text("select 1"))
    except Exception as exc:
        return JSONResponse(status_code=503, content={"status": "not_ready", "detail": str(exc)})
    return {"status": "ready"}
