# Runbook: Implantação da Estação (Piloto)

Este runbook destina-se à equipe técnica (nível 2/engenharia) para implantação assistida da primeira estação no piloto controlado.

## 1. Pré-requisitos
- PC ou Raspberry Pi na balança com Linux ou Windows.
- **Node.js 20+** e **npm** instalados.
- **Python 3.10+** instalado (para a Bridge).
- Conexão de internet ativa para a primeira ativação.
- Acesso à rede local (porta 8321 TCP) para comunicação PWA <-> Bridge.
- Indicador de balança conectado via porta Serial (RS232/USB) ou TCP.

## 2. Preparação do Cliente e Estação (Via Portal API)
No ambiente da equipe técnica (Backoffice/Terminal), execute a criação da estação via API (requer Token de Admin do Backoffice):

```bash
# 1. Obter token de Admin (usando credenciais padrão do bootstrap)
TOKEN=$(curl -s -X POST $API_URL/v1/auth/login -d '{"login":"admin@tara.local","password":"..."}' -H "Content-Type: application/json" | jq -r .access_token)

# 2. Criar a Estação
STATION=$(curl -s -X POST $API_URL/v1/portal/stations -H "Authorization: Bearer $TOKEN" -H "X-Tenant-ID: $TENANT_ID" -d '{"name": "Balança Piloto 01", "external_id": "ST-001"}' -H "Content-Type: application/json")
STATION_ID=$(echo $STATION | jq -r .id)

# 3. Gerar a Instalação (Código de ativação)
INSTALLATION=$(curl -s -X POST $API_URL/v1/portal/stations/$STATION_ID/installations -H "Authorization: Bearer $TOKEN" -H "X-Tenant-ID: $TENANT_ID" -d '{}' -H "Content-Type: application/json")
ACTIVATION_CODE=$(echo $INSTALLATION | jq -r .activation_code)
RECOVERY_SECRET=$(echo $INSTALLATION | jq -r .recovery_secret)

echo "Código de ativação: $ACTIVATION_CODE"
echo "Guarde o segredo de recuperação: $RECOVERY_SECRET"
```

## 3. Instalação da Station (PWA) no Computador Cliente
1. No PC de empacotamento, rode `pnpm station:package`.
2. Copie o pacote `balanca-estacao-X.X.X.tar.gz` para o computador da balança.
3. Extraia o pacote.
4. Execute o script de instalação (Linux: `sudo ./install.sh`, Windows: descompacte manualmente).
5. Edite o arquivo `.env.local` na pasta de destino (`/opt/balanca-estacao/.env.local`) e preencha:
   ```env
   TARA_SERVICE_URL=https://api.tara.exemplo
   TARA_SERVICE_CLIENT_ID=<API_CLIENT_ID_TECNICO>
   TARA_SERVICE_CLIENT_SECRET=<API_CLIENT_SECRET_TECNICO>
   ```
6. Inicie a Station: `npm run start` (ou configure um serviço local/pm2 para auto-start).
7. Acesse `http://localhost:3003`. 
8. Insira o **Código de Ativação** gerado no passo 2.
9. Clique em **Instalar Aplicação** no ícone do navegador para instalar como PWA.

## 4. Instalação da Bridge
1. Copie o código-fonte da Bridge para o PC da balança (ex: `/opt/balanca-bridge`).
2. Crie o virtual environment: `python3 -m venv .venv` e instale dependências: `./.venv/bin/pip install -r requirements.txt` (use o modo offline/wheelhouse se não houver internet).
3. Configure a Bridge copiando o arquivo de exemplo:
   ```bash
   cp config.yaml.example config.yaml
   # Edite o config.yaml com a porta serial (ex: /dev/ttyUSB0 ou COM1) e a regex do indicador.
   ```
4. Instale como serviço (Linux): `sudo ./install.sh` (a Bridge agora iniciará automaticamente junto com o sistema).
5. Verifique o status: `sudo systemctl status balanca-bridge`.

## 5. Configuração e Homologação do Indicador
1. Edite o `config.yaml` da Bridge.
2. Parâmetros críticos: `weight_regex`, `port` (ex: `/dev/ttyUSB0`), `baudrate`.
3. Verifique se o peso é capturado consultando:
   ```bash
   curl http://127.0.0.1:8321/peso-atual
   ```
4. Se retornar um JSON com `peso_kg` atualizado e `conectado: true`, o indicador está configurado corretamente.

## 6. Configuração no Backoffice (Ativação Final)
A estação validará a Bridge enviando um challenge. Se tudo estiver configurado, a configuração de dispositivo na API transicionará para `ACTIVE`.

## 7. Cadastro de Operadores
No Backoffice/API, associe o operador à estação criada:
```bash
curl -X PUT $API_URL/v1/portal/stations/$STATION_ID/operators/$OPERATOR_ID -H "Authorization: Bearer $TOKEN" -H "X-Tenant-ID: $TENANT_ID"
```
A Estação sincronizará automaticamente.

## 8. Testes Finais (Go-Live)
1. **Teste Online:** Realize uma pesagem (login -> nova ordem -> capturar peso -> confirmar). Confirme que ela sumiu da fila local (foi sincronizada).
2. **Teste Offline:** Desconecte a rede. Faça outra pesagem. Confirme que ela consta como pendente na PWA. Restaure a rede e aguarde o sync automático.
3. **Teste Delivery:** Confirme se o ERP do cliente recebeu as pesagens via Pull ou Webhook.
