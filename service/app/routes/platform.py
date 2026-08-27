from datetime import datetime
import smtplib

from fastapi import APIRouter, Depends, HTTPException

from ..schemas import PlatformEmailSettingsIn, PlatformEmailSettingsOut, PlatformEmailTestIn
from ..security import require_platform_admin
from ..service import encrypt_platform_secret, load_email_settings, send_portal_email
from ..models import PlatformSetting

router = APIRouter(prefix="/v1/platform", tags=["Administração da Plataforma"])


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
