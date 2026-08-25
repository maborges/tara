# Contexto de retomada — Plataforma Balança

Atualizado em 2026-08-24.

## Objetivo atual

Extrair a Balança do monólito AgroSaaS e mantê-la como plataforma independente:

- `service/`: API, banco, autenticação, RBAC, ordens, pesagens, contingência e outbox;
- `station/`: PWA offline-first da estação;
- `bridge/`: integração serial/TCP com o indicador físico;
- `contracts/`: contratos compartilhados da integração.

O AgroSaaS deve consumir a Balança apenas via HTTP, usando o adaptador em
`farm/services/api/integracoes/balanca/`. Não deve importar modelos ou services
internos da Balança nem acessar o banco dela.

## O que já foi feito no AgroSaaS

- Remoção do módulo legado `services/api/balanca/` e de suas migrations/testes;
- remoção de `apps/balanca` e `tools/balanca-bridge` do monólito;
- consumidores de pesagem migrados para `BalancaServiceClient` em:
  - Compras;
  - Comercialização;
  - Romaneios de colheita;
  - Pecuária;
- configuração adicionada:
  - `BALANCA_SERVICE_URL`;
  - `BALANCA_SERVICE_CLIENT_ID`;
  - `BALANCA_SERVICE_CLIENT_SECRET`;
- contratos locais em `services/api/integracoes/balanca/`;
- documentação principal em `farm/docs/MANUAL_BALANCA.md` e
  `farm/docs/IMPLANTACAO_BALANCA_CLIENTE.md`.

## Correção mais recente

A Plataforma Balança publica o evento versionado
`balanca.pesagem.concluida.v1`, com `external_reference` e `payload`.
Os consumidores antigos esperavam `origem_tipo`, `origem_id` e o evento sem
versão. Foi criada a normalização em:

`farm/services/api/integracoes/balanca/events.py`

Ela converte referências como:

- `agricola:romaneio:<uuid>` → `COLHEITA`;
- `financeiro:comercializacao:<uuid>` → `VENDA`;
- `operacional:compra:<uuid>` → `COMPRA`;
- `pecuaria:animal:<uuid>` → `PECUARIA`.

Os quatro subscribers aceitam o evento versionado e o legado.

## Validações feitas

No AgroSaaS:

```bash
cd /opt/lampp/htdocs/farm/services/api
PYTHONPATH=. .venv/bin/pytest -q tests/unit/integracoes/test_balanca_contracts.py
```

Resultado atual: 3 testes passando. Também passaram `compileall` dos arquivos
alterados e `git diff --check`.

Os testes do serviço independente não foram executados porque o Python global
da máquina não possui `pytest`; deve-se usar o ambiente virtual do serviço,
quando instalado.

## Lacunas importantes

1. O backoffice visual inicial foi criado em `backoffice/`, com login JWT e
   consultas de ordens, estações, operadores e outbox. Ainda faltam os fluxos
   de criação/edição e importação visual de contingência.
2. `docs/MANUAL_BALANCA.md` explica a operação e deve documentar também o
   acesso ao backoffice visual em `http://localhost:3004`.
3. O manual principal ainda deve ganhar um bloco explícito para iniciar o
   worker Observer/outbox:

   ```bash
   cd /opt/lampp/htdocs/balanca-platform/service
   ./.venv/bin/python run_worker.py
   ```

4. Ainda é necessário implementar/documentar o endpoint de entrada no AgroSaaS
   para receber os envelopes enviados pelo outbox da Plataforma Balança e
   convertê-los em eventos internos. A normalização dos subscribers já está
   preparada, mas a entrega HTTP completa precisa ser validada.
5. O diretório `balanca-platform` possui um `.git` próprio, ainda sem commits.

## Arquivos de referência

- `README.md` — visão geral da plataforma;
- `service/docs/MANUAL_OPERACAO.md` — operação do serviço;
- `docs/MANUAL_BALANCA.md` no AgroSaaS — manual integrado;
- `docs/architecture/adr-balanca-platform.md` no AgroSaaS — decisão arquitetural;
- `service/tests/test_service_e2e.py` — fluxo E2E do serviço;
- `service/tests/test_contingency_import.py` — contingência por pendrive.

## Regra para continuar

Antes de alterar código, verificar os dois repositórios/workspaces:

- AgroSaaS: `/opt/lampp/htdocs/farm`;
- Plataforma Balança: `/opt/lampp/htdocs/balanca-platform`.

Não restaurar automaticamente o módulo legado. A próxima etapa recomendada é
fechar o contrato de entrega de eventos entre o worker da Balança e o endpoint
do AgroSaaS, depois criar testes E2E desse fluxo.
