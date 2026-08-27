#!/usr/bin/env bash
set -euo pipefail

INSTALL_DIR="${TARA_BRIDGE_INSTALL_DIR:-/opt/balanca-bridge}"
SERVICE_FILE="${TARA_BRIDGE_SERVICE_FILE:-/etc/systemd/system/balanca-bridge.service}"

mkdir -p "${INSTALL_DIR}"
cp -R TARA_bridge requirements.txt simulator.py config.yaml.example README.md "${INSTALL_DIR}/"
python3 -m venv "${INSTALL_DIR}/.venv"
if [ -n "${TARA_BRIDGE_WHEELHOUSE:-}" ]; then
  "${INSTALL_DIR}/.venv/bin/pip" install --no-index --find-links "${TARA_BRIDGE_WHEELHOUSE}" -r "${INSTALL_DIR}/requirements.txt"
else
  "${INSTALL_DIR}/.venv/bin/pip" install -r "${INSTALL_DIR}/requirements.txt"
fi

if [ ! -f "${INSTALL_DIR}/config.yaml" ]; then
  cp "${INSTALL_DIR}/config.yaml.example" "${INSTALL_DIR}/config.yaml"
fi

sed \
  -e "s|__INSTALL_DIR__|${INSTALL_DIR}|g" \
  -e "s|__PYTHON__|${INSTALL_DIR}/.venv/bin/python|g" \
  balanca-bridge.service.example > "${SERVICE_FILE}"
systemctl daemon-reload
systemctl enable --now balanca-bridge.service
echo "Balança Bridge instalado em ${INSTALL_DIR}."
