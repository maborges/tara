import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.main import app
from app.schemas import PortalRegisterIn


def test_portal_routes_are_versioned_and_isolated_from_backoffice():
    paths = app.openapi()["paths"]
    assert "/v1/portal/auth/register" in paths
    assert "/v1/portal/auth/login" in paths
    assert "/v1/portal/api-clients" in paths
    assert "/v1/admin/api-clients" in paths
    assert "/v1/portal/auth/login" != "/v1/auth/login"


def test_portal_registration_requires_account_owner_credentials():
    data = PortalRegisterIn(
        nome_conta="Conta teste",
        nome_exibicao="Administrador",
        email="admin@example.com",
        password="senha-segura-123",
    )
    assert data.email == "admin@example.com"
    assert len(data.password) >= 8
