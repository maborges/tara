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
cat > "${PACKAGE_DIR}/INSTALL.txt" <<EOF
Estacao Balanca ${VERSION}

Este pacote contem o build da PWA para instalacao em uma estacao previamente
preparada com Node.js e as dependencias do workspace. Execute:

  npm install --omit=dev
  npm run start

A instalacao da PWA no navegador deve ser feita com a rede local disponivel.
Nao remova os dados do site durante uma atualizacao: o IndexedDB contem a fila
de pesagens offline.
EOF

echo "Pacote criado em: ${PACKAGE_DIR}"
