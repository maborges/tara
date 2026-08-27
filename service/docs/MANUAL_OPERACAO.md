# Manual de Operação — Serviço Balança

## 1. O que é a Balança

A Plataforma Balança é um serviço independente para operar estações,
registrar pesagens, armazenar eventos e disponibilizar dados para qualquer
aplicação consumidora, incluindo o AgroSaaS.

```text
Indicador → Bridge → Estação PWA → Serviço Balança → Aplicações consumidoras
                                  ↘ pendrive → Backoffice Balança
```

O serviço é a fonte oficial de estações, operadores, ordens, pesagens, tickets,
eventos e conciliação. O consumidor não acessa diretamente o banco da Balança.

## 2. Usuários

- **Administrador:** usuários, permissões, estações, operadores e clientes.
- **Operador:** cadastro próprio da Balança, com PIN. Não precisa existir no
  AgroSaaS; a associação com uma pessoa do cliente é opcional.
- **Aplicação consumidora:** usa `client_id`, segredo e escopos, sem login humano.

## 3. Instalação do serviço

```bash
cd /opt/lampp/htdocs/balanca-platform/service
python3 -m venv .venv
./.venv/bin/pip install -r requirements.txt
cp .env.example .env
```
gera a chave com openssl
openssl rand -hex 32

Configure o `.env`:

```env
BALANCA_DATABASE_URL=postgresql+asyncpg://usuario:senha@servidor/farms
BALANCA_ENVIRONMENT=production
BALANCA_JWT_SECRET_SECRET=segredo-aleatorio-com-no-minimo-32-caracteres
BALANCA_PORT=8010
BALANCA_CORS_ORIGINS=["http://localhost:3004","http://127.0.0.1:3004"]
```

A base usada pela Plataforma é o banco PostgreSQL `farms`; `balanca` é o
schema próprio da Plataforma dentro desse banco. Não crie um banco separado
chamado `balanca`. A URL `postgresql+asyncpg://` do `.env` é usada pela API;
para o comando `psql`, informe host, usuário e banco separadamente:

```bash
cd /opt/lampp/htdocs/balanca-platform/service
psql -h 192.168.0.2 -U borgus -W -d farms -v ON_ERROR_STOP=1 -f migrations/000_platform_foundation.sql
psql -h 192.168.0.2 -U borgus -W -d farms -v ON_ERROR_STOP=1 -f migrations/001_service_tables.sql
psql -h 192.168.0.2 -U borgus -W -d farms -v ON_ERROR_STOP=1 -f migrations/002_security_identity.sql
psql -h 192.168.0.2 -U borgus -W -d farms -v ON_ERROR_STOP=1 -f migrations/003_contingency.sql
psql -h 192.168.0.2 -U borgus -W -d farms -v ON_ERROR_STOP=1 -f migrations/004_platform_admin.sql
psql -h 192.168.0.2 -U borgus -W -d farms -v ON_ERROR_STOP=1 -f migrations/005_customer_portal.sql
```

Então, inicie a API:

```bash
cd /opt/lampp/htdocs/balanca-platform/service
./start_server.sh
```

Valide:

```bash
curl http://127.0.0.1:8010/healthz
curl http://127.0.0.1:8010/readyz
```

## 4. Primeiro acesso e configuração

Crie o primeiro administrador:

```bash
export BALANCA_BOOTSTRAP_TENANT_ID=UUID_DO_TENANT_OPERACIONAL
./.venv/bin/python bootstrap_admin.py
```

Faça login em `POST /v1/auth/login` somente com login e senha, sem informar
`X-Tenant-ID`. Use o JWT nas rotas administrativas.

### 4.1 Frontend do backoffice

Com a API em execução, abra outro terminal e inicie o frontend independente:

```bash
cd /opt/lampp/htdocs/balanca-platform
pnpm install
pnpm backoffice:dev
```

Abra `http://localhost:3004`. Se a API estiver em outra porta, informe a URL
antes de iniciar o frontend:

```bash
cd /opt/lampp/htdocs/balanca-platform
NEXT_PUBLIC_BALANCA_API_URL=http://localhost:8011 pnpm backoffice:dev
```

Na tela inicial, informe o mesmo `UUID_DO_TENANT` usado em
`BALANCA_BOOTSTRAP_TENANT_ID`, além do login e senha criados no passo anterior.
O dashboard consulta ordens, estações, operadores e outbox usando o JWT e o
RBAC da API.

No backoffice:

1. cadastre operadores e PINs;
2. cadastre as estações;
3. crie uma credencial por aplicação consumidora;
4. conceda somente os escopos necessários;
5. ative e teste cada estação.

Escopos disponíveis: `clients:write`, `orders:write`, `events:read` e
`stations:activate`. O segredo é exibido somente na criação ou rotação.

## 5. Instalação da estação

```bash
cd /opt/lampp/htdocs/balanca-platform/station
cp .env.example .env.local
pnpm install
pnpm run build
pnpm run start
```

Configure no `.env.local`:

```env
BALANCA_SERVICE_URL=http://servidor-balanca:8010
BALANCA_SERVICE_CLIENT_ID=client-id-da-estacao
BALANCA_SERVICE_CLIENT_SECRET=segredo-da-estacao
BALANCA_TENANT_ID=UUID_DO_TENANT
```

Abra a URL no navegador e instale a PWA. A primeira ativação normalmente
precisa de conexão para registrar a estação, validar o tenant e receber o
token. Depois, a captura funciona offline.

## 6. Bridge e indicador

```bash
cd /opt/lampp/htdocs/balanca-platform/bridge
python3 -m venv .venv
./.venv/bin/pip install -r requirements.txt
cp config.yaml.example config.yaml
./.venv/bin/python -m balanca_bridge.main
```

Configure a porta serial ou host/porta TCP do indicador. Antes do turno,
confirme na estação o estado “Balança conectada”.

## 7. Como realizar uma pesagem

1. Faça login com o PIN do operador.
2. Selecione a ordem pendente.
3. Confira veículo, animal, placa, produto e etapa.
4. Aguarde o peso estabilizar.
5. Confira o peso aferido e a tara.
6. Confirme a pesagem.
7. Verifique a sincronização ou a fila local.

O peso aferido é medido pela balança. O peso informado vem de documento ou
declaração e deve permanecer separado do peso aferido.

## 8. Operação sem internet

A estação mantém operadores e ordens já sincronizados, grava pesagens no
IndexedDB e conserva a fila local. Quando a conexão voltar, a sincronização
será automática.

Não apague o IndexedDB ou `balanca_db` enquanto houver pesagens pendentes.

## 9. Contingência por pendrive

Quando não for possível sincronizar pela rede:

1. finalize as pesagens do período;
2. clique em **Exportar contingência**;
3. copie o arquivo `.balanca.json` para um pendrive;
4. não altere o conteúdo do arquivo;
5. leve-o ao computador do backoffice;
6. importe-o no serviço Balança;
7. confira o resultado de cada registro;
8. preserve os dados locais até a confirmação.

O pacote segue `balanca.contingency.v1`, possui identidade da estação,
sequência, assinatura ECDSA e registros locais.

Importação pela API:

```text
POST /v1/contingency/import
Authorization: Bearer JWT_DO_BACKOFFICE
X-Tenant-ID: UUID_DO_TENANT
Content-Type: application/json
```

Ou pelo utilitário:

```bash
./.venv/bin/python import_contingency.py /media/pendrive/pacote.balanca.json \
  --tenant UUID_DO_TENANT \
  --token JWT_DO_BACKOFFICE
```

O serviço valida assinatura, tenant, estação, sequência e duplicidade. Os
resultados são `IMPORTADO`, `PARCIAL` ou `REJEITADO`. Reimportar o mesmo pacote
não duplica pesagens.

## 10. Integração com clientes

O cliente deve usar as APIs para registrar sua identificação em `/v1/clients`,
criar ordens em `/v1/orders` e consumir eventos em `/v1/events`. A conciliação
deve usar `event_id`, `correlation_id` e `external_reference`.

## 11. Atualização da estação

1. Atualize fora do horário de pesagem.
2. Confirme que não há fila pendente, quando possível.
3. Instale o novo build.
4. Não limpe o IndexedDB.
5. Confirme operador, ordens e Bridge.
6. Faça uma pesagem de teste.

Se a conexão cair durante a atualização, preserve a versão em cache e os dados
locais. Não desinstale a PWA para corrigir falhas de sincronização.

## 12. Diagnóstico

| Sintoma | Verificação |
|---|---|
| Serviço indisponível | Consulte `/healthz`, `/readyz` e o banco. |
| Sem ordens | Confira tenant, token e sincronização. |
| Sem leitura | Verifique Bridge, porta serial/TCP e token local. |
| Fila pendente | Retorne a rede e use “Reprocessar falhas”. |
| Pacote rejeitado | Não edite o arquivo; analise o lote no backoffice. |

## 13. Checklist do turno

- [ ] Serviço disponível.
- [ ] Estação ativa e no tenant correto.
- [ ] Bridge conectada.
- [ ] Operador autenticado.
- [ ] Ordens carregadas ou contingência preparada.
- [ ] Pesagem de teste realizada.
- [ ] Pendrive disponível.
