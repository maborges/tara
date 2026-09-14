#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUTPUT_DIR="${1:-${ROOT_DIR}/dist}"
VERSION="$(node -p "require('${ROOT_DIR}/package.json').version")"
PACKAGE_DIR="${OUTPUT_DIR}/balanca-estacao-${VERSION}"

mkdir -p "${PACKAGE_DIR}"
(cd "${ROOT_DIR}" && npm run build)

cp -R "${ROOT_DIR}/.next" "${PACKAGE_DIR}/.next"
cp -R "${ROOT_DIR}/public" "${PACKAGE_DIR}/public"
cp "${ROOT_DIR}/package.json" "${PACKAGE_DIR}/package.json"
cp "${ROOT_DIR}/next.config.ts" "${PACKAGE_DIR}/next.config.ts"
if [[ -d "${ROOT_DIR}/node_modules" ]]; then
  cp -R "${ROOT_DIR}/node_modules" "${PACKAGE_DIR}/node_modules"
fi
cat > "${PACKAGE_DIR}/INSTALL.txt" <<EOF
Estacao Balanca ${VERSION}

Este pacote contem o build e as dependencias da PWA para instalacao offline.
Requer Node.js previamente instalado na maquina. Execute:

  # Se node_modules nao estiver incluido, use o cache local de dependencias.
  npm run start

A ativacao/provisionamento da estacao deve usar o manifesto e a credencial
entregues pelo administrador. Nao remova os dados do site durante uma
atualizacao: o IndexedDB contem a fila de pesagens offline.
EOF

echo "Pacote criado em: ${PACKAGE_DIR}"
