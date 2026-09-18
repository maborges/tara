import base64
import hashlib
import hmac
import json
import uuid
from types import SimpleNamespace

from app.delivery import canonical_json, signed_headers
from app.config import Settings


def test_delivery_body_is_canonical_and_signature_covers_exact_request():
    event_id = uuid.uuid4()
    account_id = uuid.uuid4()
    event = SimpleNamespace(id=event_id, conta_id=account_id)
    payload = {"z": "último", "a": {"b": 2, "a": 1}}
    body = canonical_json(payload)
    assert body == b'{"a":{"a":1,"b":2},"z":"\xc3\xbaltimo"}'

    timestamp = "1770000000"
    headers = signed_headers(event, body, "secret", timestamp)
    message = b"\n".join((b"POST", b"/", timestamp.encode(), body))
    expected = hmac.new(b"secret", message, hashlib.sha256).digest()
    assert headers["X-TARA-Event-Id"] == str(event_id)
    assert headers["X-TARA-Account-Id"] == str(account_id)
    assert headers["X-TARA-Timestamp"] == timestamp
    assert headers["X-TARA-Signature"] == "sha256=" + base64.b64encode(expected).decode("ascii")


def test_canonical_json_does_not_depend_on_dictionary_insertion_order():
    assert canonical_json({"b": 1, "a": 2}) == canonical_json({"a": 2, "b": 1})


def test_worker_accepts_multiple_configured_tenants_without_bypassing_rls():
    settings = Settings(outbox_tenant_ids=" tenant-a,tenant-b , ")
    assert settings.worker_tenant_ids() == ["tenant-a", "tenant-b"]
