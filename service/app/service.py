"""Compatibility facade for the split platform and operation modules."""

from .operation import (
    activate_station, complete_weighing, create_operator, create_order,
    create_station, reconcile_weighing, register_client, update_operator_status, update_station_status,
)
from .platform_identity import (
    bootstrap_admin, confirm_portal_email, create_api_client, create_portal_token,
    decrypt_platform_secret, encrypt_platform_secret, get_account,
    get_valid_portal_token, load_email_settings, login_backoffice,
    login_backoffice_without_tenant, login_portal_user, request_portal_password_reset,
    reset_portal_password, revoke_api_client, rotate_api_client, register_portal_user,
    send_api_key_rotation_instructions, send_portal_email, update_api_client,
    update_portal_account, verify_portal_password_reset_token,
)

__all__ = [name for name in globals() if not name.startswith("_")]
