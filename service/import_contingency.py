"""Importa um pacote físico da Balança por meio da API do serviço."""

import argparse
import json
import os
from pathlib import Path

import httpx


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Importa pacote .balanca.json")
    parser.add_argument("arquivo", type=Path)
    parser.add_argument("--url", default=os.getenv("BALANCA_SERVICE_URL", "http://127.0.0.1:8010"))
    parser.add_argument("--tenant", required=True)
    parser.add_argument("--token", required=True, help="JWT do backoffice da Balança")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    package = json.loads(args.arquivo.read_text(encoding="utf-8"))
    response = httpx.post(
        f"{args.url.rstrip('/')}/v1/contingency/import",
        headers={"Authorization": f"Bearer {args.token}", "X-Tenant-ID": args.tenant},
        json=package,
        timeout=60,
    )
    print(response.text)
    response.raise_for_status()


if __name__ == "__main__":
    main()
