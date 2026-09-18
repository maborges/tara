#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUTPUT_DIR="${1:-${ROOT_DIR}/dist}"
VERSION="$(node -p "require('${ROOT_DIR}/package.json').version")"
PACKAGE_NAME="balanca-estacao-${VERSION}"
ARCHIVE_PATH="${OUTPUT_DIR}/${PACKAGE_NAME}.tar.gz"
WORK_DIR="$(mktemp -d)"
PACKAGE_DIR="${WORK_DIR}/${PACKAGE_NAME}"
BUILD_DIR=".next-package-$$"

cleanup() { rm -rf "${WORK_DIR}" "${ROOT_DIR}/${BUILD_DIR}"; }
trap cleanup EXIT

if [[ ! -d "${ROOT_DIR}/node_modules" ]]; then
  echo "node_modules não encontrado. Execute 'pnpm install' na máquina de empacotamento." >&2
  exit 1
fi
if [[ -e "${ARCHIVE_PATH}" ]]; then
  echo "O pacote ${ARCHIVE_PATH} já existe. Informe outro diretório de saída para não sobrescrevê-lo." >&2
  exit 1
fi

mkdir -p "${OUTPUT_DIR}" "${PACKAGE_DIR}/app"
(cd "${ROOT_DIR}" && pnpm run typecheck && TARA_STATION_DIST_DIR="${BUILD_DIR}" pnpm run build)
cp -R "${ROOT_DIR}/${BUILD_DIR}" "${PACKAGE_DIR}/app/.next"
cp -R "${ROOT_DIR}/public" "${PACKAGE_DIR}/app/public"
cp -R "${ROOT_DIR}/node_modules" "${PACKAGE_DIR}/app/node_modules"
# O node_modules da Estação contém links relativos para o store pnpm raiz.
# Preserve-o no mesmo nível esperado para que o kit funcione sem reinstalação.
cp -R "${ROOT_DIR}/../node_modules" "${PACKAGE_DIR}/node_modules"
cp "${ROOT_DIR}/package.json" "${ROOT_DIR}/next.config.ts" "${PACKAGE_DIR}/app/"
[[ -f "${ROOT_DIR}/package-lock.json" ]] && cp "${ROOT_DIR}/package-lock.json" "${PACKAGE_DIR}/app/"

cat > "${PACKAGE_DIR}/.env.local.example" <<'EOF'
# Preencha somente na máquina da Estação e mantenha este arquivo protegido.
# A chave técnica precisa ter exclusivamente o escopo stations:activate.
TARA_SERVICE_URL=https://servidor-balanca.exemplo:8010
TARA_SERVICE_CLIENT_ID=
TARA_SERVICE_CLIENT_SECRET=
EOF

cat > "${PACKAGE_DIR}/install.sh" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
SOURCE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INSTALL_DIR="${1:-/opt/balanca-estacao}"
if ! command -v node >/dev/null 2>&1; then echo "Node.js 20 ou superior é obrigatório na Estação." >&2; exit 1; fi
NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
if (( NODE_MAJOR < 20 )); then echo "Node.js 20 ou superior é obrigatório; encontrado: $(node --version)." >&2; exit 1; fi
mkdir -p "${INSTALL_DIR}"
cp -a "${SOURCE_DIR}/app/." "${INSTALL_DIR}/"
if [[ ! -f "${INSTALL_DIR}/.env.local" ]]; then
  cp "${SOURCE_DIR}/.env.local.example" "${INSTALL_DIR}/.env.local"
  chmod 600 "${INSTALL_DIR}/.env.local"
fi
cat <<MESSAGE
Aplicação instalada em: ${INSTALL_DIR}
1. Edite ${INSTALL_DIR}/.env.local com a URL e a credencial temporária de ativação.
2. Inicie com: cd ${INSTALL_DIR} && npm run start
3. Abra http://localhost:3003, informe o código de ativação exibido no Portal e instale a PWA.
Atualizações preservam .env.local. Nunca limpe os dados do navegador: eles contêm a fila offline.
MESSAGE
EOF
chmod 755 "${PACKAGE_DIR}/install.sh"

cat > "${PACKAGE_DIR}/INSTALL.md" <<EOF
# Kit de instalação da Estação ${VERSION}

Este arquivo contém o build e as dependências Node.js; não contém PINs, tokens,
credenciais de integração ou dados de pesagem.

## Pré-requisitos

- Node.js 20 ou superior;
- rede para a primeira ativação;
- credencial técnica com o escopo exclusivo \`stations:activate\`;
- Estação \`PENDENTE\` e código de ativação obtidos no Portal.

## Instalação

\`\`\`bash
tar -xzf ${PACKAGE_NAME}.tar.gz
cd ${PACKAGE_NAME}
sudo ./install.sh
sudo nano /opt/balanca-estacao/.env.local
cd /opt/balanca-estacao && npm run start
\`\`\`

Abra \`http://localhost:3003\`, informe o código de ativação e use **Instalar
aplicação** no navegador. Confirme Estação ativa, operadores provisionados e
Bridge conectada antes do turno.

## Atualização

Execute o novo \`install.sh\` sobre o mesmo diretório. \`.env.local\` é
preservado. Não limpe os dados do site nem o IndexedDB.
EOF

tar -C "${WORK_DIR}" -czf "${ARCHIVE_PATH}" "${PACKAGE_NAME}"
echo "Kit de instalação criado em: ${ARCHIVE_PATH}"
