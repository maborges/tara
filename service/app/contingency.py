from __future__ import annotations

import base64
import hashlib
import json
from typing import Any

from jose import jwk


def canonical_payload(package: dict[str, Any]) -> bytes:
    unsigned = {key: value for key, value in package.items() if key != "signature"}
    return json.dumps(unsigned, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode()


def package_hash(package: dict[str, Any]) -> str:
    return hashlib.sha256(canonical_payload(package)).hexdigest()


def verify_package_signature(package: dict[str, Any]) -> str:
    public_key = package.get("station_public_key")
    signature = package.get("signature")
    if not isinstance(public_key, dict) or not isinstance(signature, str):
        raise ValueError("Pacote sem identidade ou assinatura da estação")
    try:
        key = jwk.construct(public_key, algorithm="ES256")
        valid = key.verify(canonical_payload(package), base64.urlsafe_b64decode(signature + "=" * (-len(signature) % 4)))
        if valid is False:
            raise ValueError("assinatura não confere")
    except Exception as exc:
        raise ValueError("Assinatura do pacote inválida") from exc
    thumbprint = hashlib.sha256(json.dumps(public_key, sort_keys=True, separators=(",", ":")).encode()).hexdigest()
    return thumbprint
