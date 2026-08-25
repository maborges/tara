#!/usr/bin/env bash
set -euo pipefail

SERVICE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PYTHON_BIN="${SERVICE_DIR}/.venv/bin/python"

if [[ ! -x "${PYTHON_BIN}" ]]; then
  echo "Ambiente virtual não encontrado. Execute:" >&2
  echo "  cd ${SERVICE_DIR} && python3 -m venv .venv && ./.venv/bin/pip install -r requirements.txt" >&2
  exit 1
fi

cd "${SERVICE_DIR}"
exec "${PYTHON_BIN}" -m uvicorn app.main:app \
  --host "${BALANCA_HOST:-0.0.0.0}" \
  --port "${BALANCA_PORT:-8010}"
