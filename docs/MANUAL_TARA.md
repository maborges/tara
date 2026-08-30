# Manual de Operação da Plataforma Balança

## 1. Objetivo

A Plataforma Balança é um serviço independente para registrar, armazenar,
conciliar e distribuir informações de pesagem. Ela pode atender o AgroSaaS ou
qualquer outro sistema integrado por API, eventos ou arquivos físicos.

A operação de pesagem não depende de conexão contínua. A estação pode capturar
pesagens offline e sincronizar os dados posteriormente.

## 2. Componentes

```text
Indicador físico → Bridge → Estação PWA → Serviço Balança → Consumidores
                                      ↘ pendrive → Backoffice Balança
```

- Serviço Balança: API, banco, backoffice, segurança, conciliação e eventos.
- Estação PWA: tela operacional, cache local e fila offline.
- Bridge: comunicação com balança serial, TCP ou simulador.
- Backoffice: usuários, permissões, clientes, estações, operadores e importações.
- Consumidor: AgroSaaS ou qualquer aplicação autorizada.

## 3. Perfis de usuário

### Administrador do serviço

Administra usuários, papéis, permissões, estações, operadores e credenciais de
integração.

### Operador da balança

É cadastrado na própria Plataforma Balança. Não precisa existir no cadastro do
AgroSaaS. Seu vínculo com uma pessoa do cliente é opcional.

### Aplicação consumidora

Não utiliza login humano. Recebe `client_id`, segredo e escopos próprios. O
AgroSaaS é apenas um consumidor da API da Balança.

## 4. Instalação do serviço

No servidor da Balança:

```bash
cd /opt/lampp/htdocs/tara/service
python3 -m venv .venv
./.venv/bin/pip install -r requirements.txt
cp .env.example .env
```

Configure no `.env`:

```env
TARA_DATABASE_URL=postgresql+asyncpg://usuario:senha@servidor/banco
TARA_ENVIRONMENT=production
TARA_JWT_SECRET_SECRET=segredo-aleatorio-com-no-minimo-32-caracteres
TARA_PORT=8010
```

Aplique as migrations na ordem:

```bash
psql --set=ON_ERROR_STOP=1 "$TARA_DATABASE_URL" -f migrations/000_platform_foundation.sql
psql --set=ON_ERROR_STOP=1 "$TARA_DATABASE_URL" -f migrations/001_service_tables.sql
psql --set=ON_ERROR_STOP=1 "$TARA_DATABASE_URL" -f migrations/002_security_identity.sql
psql --set=ON_ERROR_STOP=1 "$TARA_DATABASE_URL" -f migrations/003_contingency.sql
psql --set=ON_ERROR_STOP=1 "$TARA_DATABASE_URL" -f migrations/004_platform_admin.sql
psql --set=ON_ERROR_STOP=1 "$TARA_DATABASE_URL" -f migrations/005_customer_portal.sql
psql --set=ON_ERROR_STOP=1 "$TARA_DATABASE_URL" -f migrations/006_portal_email_security.sql
psql --set=ON_ERROR_STOP=1 "$TARA_DATABASE_URL" -f migrations/007_platform_email_settings.sql
psql --set=ON_ERROR_STOP=1 "$TARA_DATABASE_URL" -f migrations/008_api_client_secret_rotation.sql
psql --set=ON_ERROR_STOP=1 "$TARA_DATABASE_URL" -f migrations/009_rename_balanca_schema.sql
psql --set=ON_ERROR_STOP=1 "$TARA_DATABASE_URL" -f migrations/010_station_account.sql
psql --set=ON_ERROR_STOP=1 "$TARA_DATABASE_URL" -f migrations/011_pesagem_avulsa.sql
psql --set=ON_ERROR_STOP=1 "$TARA_DATABASE_URL" -f migrations/012_platform_admin_rls.sql
psql --set=ON_ERROR_STOP=1 "$TARA_DATABASE_URL" -f migrations/013_webhook_destinations.sql
psql --set=ON_ERROR_STOP=1 "$TARA_DATABASE_URL" -f migrations/014_outbox_replay_audit.sql
psql --set=ON_ERROR_STOP=1 "$TARA_DATABASE_URL" -f migrations/015_webhook_retry_policy.sql
psql --set=ON_ERROR_STOP=1 "$TARA_DATABASE_URL" -f migrations/016_platform_dashboard_rls.sql
psql --set=ON_ERROR_STOP=1 "$TARA_DATABASE_URL" -f migrations/017_pesagem_station.sql
./start_server.sh
```

Valide o serviço:

```bash
curl http://127.0.0.1:8010/healthz
curl http://127.0.0.1:8010/readyz
```

## 5. Primeiro acesso ao backoffice

Crie o primeiro administrador:

```bash
export TARA_BOOTSTRAP_TENANT_ID=UUID_DO_TENANT_OPERACIONAL
./.venv/bin/python bootstrap_admin.py
```

O login é feito em:

```text
POST /v1/auth/login
Sem header `X-Tenant-ID` na entrada do Backoffice.
Body: { "login": "...", "password": "..." }
```

A resposta fornece o JWT do backoffice. Nunca compartilhe esse token ou a
senha do administrador.

Inicie o Backoffice em outro terminal:

```bash
cd /opt/lampp/htdocs/tara
pnpm install
pnpm backoffice:dev
```

Acesse o Backoffice em `http://localhost:3004`. Ele utiliza a API em
`http://localhost:8010` por padrão. Para apontar para outra URL:

```bash
NEXT_PUBLIC_TARA_API_URL=http://localhost:8010 pnpm backoffice:dev
```

## 6. Configuração inicial

No backoffice da Balança:

1. Cadastre os operadores e seus PINs.
2. Cadastre cada estação com um `external_id` único.
3. Cadastre uma credencial para cada sistema consumidor.
4. Atribua somente os escopos necessários.
5. Ative a estação usando o código de ativação.
6. Teste uma pesagem antes do início do turno.

Os escopos de integração disponíveis são:

- `clients:write`: registrar o sistema consumidor;
- `orders:write`: criar ordens de pesagem;
- `events:read`: consultar eventos da Balança;
- `stations:activate`: ativar estações.

O segredo de uma credencial é exibido somente na criação ou rotação. Armazene-o
com segurança no servidor consumidor.

## 7. Instalação da estação

Na estação de trabalho:

```bash
cd /opt/lampp/htdocs/tara/station
cp .env.example .env.local
pnpm install
pnpm run build
pnpm run start
```

Configure no `.env.local`:

```env
TARA_SERVICE_URL=http://servidor-balanca:8010
TARA_SERVICE_CLIENT_ID=client-id-da-estacao
TARA_SERVICE_CLIENT_SECRET=segredo-da-estacao
TARA_TENANT_ID=UUID_DO_TENANT
```

As credenciais ficam no proxy Next.js e não devem usar `NEXT_PUBLIC_`.

Abra a URL da estação, ative o terminal e instale a PWA pelo navegador.

### Primeira ativação

A primeira ativação normalmente exige conexão para registrar a estação,
validar o tenant e receber o token exclusivo. Depois disso, a captura local
continua funcionando sem internet.

## 8. Configuração da Bridge

A Bridge conecta o indicador físico à estação.

```bash
cd /opt/lampp/htdocs/tara/bridge
python3 -m venv .venv
./.venv/bin/pip install -r requirements.txt
cp config.yaml.example config.yaml
./.venv/bin/python -m TARA_bridge.main
```

Configure a porta serial ou o host/porta TCP do indicador em `config.yaml`.
Antes do turno, confirme na estação o indicador “Balança conectada”.

## 9. Pesagem normal

1. Faça login do operador usando o PIN da Balança.
2. Selecione a ordem pendente.
3. Confira veículo, animal, placa, produto e etapa.
4. Aguarde o peso estabilizar.
5. Confirme o peso aferido e a tara, quando aplicável.
6. Registre a pesagem.
7. Aguarde a sincronização ou confirme que a fila foi armazenada localmente.

O peso informado e o peso aferido são informações diferentes. O peso aferido
é a medição realizada pela balança; o informado pode vir de nota fiscal,
documento ou declaração do operador.

## 10. Operação sem conexão

Sem internet, a estação:

- mantém operadores e ordens previamente sincronizados;
- registra pesagens no IndexedDB local;
- mantém a fila de sincronização;
- permite reprocessar falhas;
- não deve apagar os dados locais.

Quando a conexão retornar, a estação enviará a fila automaticamente. O serviço
usa `local_id` e chaves de idempotência para impedir duplicidade.

## 11. Contingência por pendrive

Use este procedimento quando a estação estiver sem conexão e for necessário
entregar os dados ao backoffice:

1. Finalize as pesagens do período.
2. Na estação, clique em **Exportar contingência**.
3. Salve o arquivo `.balanca.json` no pendrive.
4. Não edite, renomeie internamente ou abra o conteúdo para alteração.
5. Leve o pendrive ao computador do backoffice.
6. Importe o arquivo pela API ou pelo utilitário operacional.
7. Confirme o resultado de cada registro.
8. Preserve a estação e o arquivo até a conferência operacional.

Importação pela API:

```text
POST /v1/contingency/import
Authorization: Bearer JWT_DO_BACKOFFICE
X-Tenant-ID: UUID_DO_TENANT
Content-Type: application/json
```

Importação pelo utilitário:

```bash
cd /opt/lampp/htdocs/tara/service
./.venv/bin/python import_contingency.py /media/pendrive/pacote.balanca.json \
  --tenant UUID_DO_TENANT \
  --token JWT_DO_BACKOFFICE
```

Resultados possíveis:

- `IMPORTADO`: todos os registros foram processados ou já eram duplicados;
- `PARCIAL`: parte dos registros foi importada e parte precisa de análise;
- `REJEITADO`: nenhum registro foi aceito.

O arquivo é assinado pela estação. O serviço valida identidade, assinatura,
tenant, sequência e duplicidade. Reimportar o mesmo pacote não duplica as
pesagens.

## 12. Integração com o AgroSaaS ou outro cliente

O consumidor deve:

1. receber uma credencial própria do backoffice;
2. criar ou atualizar seu cadastro em `/v1/clients`;
3. criar ordens em `/v1/orders`;
4. consumir eventos em `/v1/events` ou pelo mecanismo Observer configurado;
5. conciliar os eventos usando `event_id`, `correlation_id` e
   `external_reference`.

O consumidor não acessa o banco da Balança e não grava diretamente nas tabelas
do serviço.

## 13. Segurança operacional

- Use HTTPS fora da rede local confiável.
- Mantenha o segredo JWT fora do repositório.
- Use uma credencial por sistema ou ambiente.
- Conceda apenas os escopos necessários.
- Rotacione credenciais em caso de suspeita ou troca de responsável.
- Revogue estações e operadores desligados.
- Nunca compartilhe o PIN de operador.
- Não apague o IndexedDB enquanto houver pesagens pendentes.
- Preserve os arquivos de contingência até a conciliação.

## 14. Atualização da estação

1. Faça a atualização fora do horário de pesagem.
2. Confirme que não há fila pendente, quando possível.
3. Instale o novo pacote PWA.
4. Não limpe os dados do site nem o IndexedDB.
5. Abra a tela de pesagem e confirme o operador, ordens e Bridge.
6. Faça uma pesagem de teste.

Se a conexão cair durante a atualização, a versão anterior em cache deve
continuar disponível. Não desinstale a PWA nem apague `TARA_db` como
tentativa de correção.

## 15. Diagnóstico rápido

### Serviço indisponível

Verifique `/healthz`, `/readyz`, a URL configurada e a conectividade com o
banco.

### Estação sem ordens

Confirme o tenant, o token da estação e execute uma sincronização após o
retorno da rede.

### Peso não chega da balança

Verifique a Bridge, a porta serial/TCP, o token local e o indicador físico.

### Pesagem presa na fila

Mantenha os dados locais, use **Reprocessar falhas** e consulte o status da
API. Se não houver conexão, exporte a contingência por pendrive.

### Pacote rejeitado

Não edite o arquivo. Consulte a mensagem do lote no backoffice, corrija a causa
na origem e gere um novo pacote com a estação.

## 16. Checklist de início do turno

- [ ] Serviço Balança disponível.
- [ ] Estação ativa e com tenant correto.
- [ ] Bridge conectada ao indicador.
- [ ] Operador autenticado.
- [ ] Ordens disponíveis ou procedimento offline confirmado.
- [ ] Hora e impressora/ticket conferidos.
- [ ] Uma pesagem de teste realizada.
- [ ] Pendrive de contingência disponível.
