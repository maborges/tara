# BALANCA-DEVICE-01E — Validação Final E2E e Encerramento

Data: 2026-09-16  
Escopo: validação do `BALANCA-DEVICE-01` em runtime e por inspeção do banco de desenvolvimento. Nenhuma funcionalidade foi implementada nesta fase e nenhum dado de produção foi alterado.

## Veredicto

```text
BALANCA-DEVICE-01
STATUS: NÃO CONCLUÍDO
```

Há defeitos de rastreabilidade e de sincronização offline diretamente nos critérios de fechamento. Portanto, não é seguro declarar o épico concluído nem "concluído com ressalvas".

## Resultado dos GAPs

| GAP | Resultado | Evidência |
| --- | --- | --- |
| GAP-01 — reinstalação preservando Station | NÃO RESOLVIDO | A rota existe e a ativação cria uma nova instalação, mas a rotação do único `station_token` revoga imediatamente a autenticação da instalação anterior. Pesagens offline dela não conseguem sincronizar após a reinstalação. |
| GAP-02 — Bridge validada antes da substituição | NÃO RESOLVIDO | A validação está apenas na tela da PWA e pode ser contornada pela API. Além disso, a chamada a `/peso-atual` não envia o `X-Bridge-Token`, que a Bridge exige. Não há comprovação válida de troca nem garantia de bloqueio no Service. |
| GAP-03 — contingência rastreável | NÃO RESOLVIDO | O arquivo e o schema ainda são `balanca.contingency.v1`; seus registros não possuem `installation_id` nem `device_configuration_id`. A importação também não os transmite para a pesagem. |
| GAP-04 — unicidade ACTIVE | RESOLVIDO ESTRUTURALMENTE | O PostgreSQL de desenvolvimento possui o índice parcial único por instalação. A invariável está protegida no banco, embora não exista teste de concorrência específico na suíte atual. |

## Banco de desenvolvimento

Consulta realizada somente-leitura no PostgreSQL configurado pelo Service:

```sql
CREATE UNIQUE INDEX uq_tara_device_configuration_active_installation
ON tara.device_configurations USING btree (instalacao_id)
WHERE ((status)::text = 'ACTIVE'::text)
```

FKs encontradas:

```text
device_configurations.estacao_id   -> estacoes.id
device_configurations.instalacao_id -> estacao_instalacoes.id
estacao_instalacoes.estacao_id     -> estacoes.id
pesagens.estacao_id                -> estacoes.id
pesagens.device_configuration_id   -> device_configurations.id
```

O estado de schema impede a comprovação exigida para a cadeia completa da pesagem: `tara.pesagens` contém `estacao_id` e `device_configuration_id`, mas **não contém `installation_id`**. A instalação pode ser inferida indiretamente da configuração, porém não é preservada como identidade imutável da pesagem no banco.

RLS está habilitado para `tara.pesagens`; está desabilitado para `tara.estacao_instalacoes` e `tara.device_configurations`. As rotas filtram `tenant_id`, mas não foi possível atestar nesta execução uma barreira RLS própria para as duas novas tabelas.

## Cenários E2E

### 1 e 2 — troca de balança e Bridge inválida

Não comprovados em runtime por existir falha no fluxo:

* A tela `station/src/app/(balanca)/configuracoes/page.tsx` faz `fetch(${bridgeUrl}/health)` e `fetch(${bridgeUrl}/peso-atual)` sem o cabeçalho `X-Bridge-Token`.
* A Bridge protege `/peso-atual` por `_check_token`; a suíte dela confirma o retorno `401` para token inválido/ausente.
* `POST /v1/balanca/stations/device-configurations` troca as configurações e grava a nova `bridge_url` sem executar `/health` ou `/peso-atual`. Logo, uma chamada direta à API pode ativar configuração sem teste prévio.

Consequentemente, não foi executada uma troca que pudesse provar `Device A -> REPLACED`, `Device B -> ACTIVE` com uma Bridge validada, pois isso reportaria como válido um fluxo que não o é.

### 3 e 4 — offline, sync e idempotência

Não resolvidos. A instalação anterior não pode concluir sincronização depois da reinstalação:

```text
activate_station()
  -> station.token_hash = hash(novo token)
require_station()
  -> busca exclusivamente Estacao.token_hash == hash(token apresentado)
```

Assim, depois de criar I2, o token de I1 retorna `401` antes de `sync/push`. O requisito de aceitar P3/P4 vinculadas a Device B (REPLACED) não é atendido. A idempotência por `tenant_id + local_id` existente não corrige a perda de autenticação do terminal antigo.

Também não há `installation_id` em `PesagemLocal`; a PWA guarda `device_configuration_id` por pesagem, mas somente `installation_id` na sessão. Isso não permite comprovar que P3/P4 permanecerão vinculadas à instalação histórica de modo independente.

### 5 e 6 — reinstalação e nova configuração

A rota `POST /v1/portal/stations/{station_id}/installations` existe, é autenticada no Portal e emite novo código. A ativação de uma Station `ATIVA` marca instalações/configurações ativas como `REPLACED` e cria nova instalação/configuração `ACTIVE`, mantendo o `station_id`.

Esse comportamento estrutural não fecha o cenário porque compartilha e rotaciona a credencial da identidade Station, bloqueando a instalação substituída com fila pendente. Não foi declarado como E2E aprovado.

### 7 — unicidade ACTIVE

O índice parcial acima foi confirmado no banco real. Ele impede duas linhas `ACTIVE` com o mesmo `instalacao_id`, inclusive quando tentativas concorrentes ultrapassarem a validação da aplicação. Não foi criada carga concorrente artificial nesta fase para não inserir registros de teste fora de uma fixture isolada.

### 8 — contingência

Não aprovado. O contrato atual é estritamente:

```text
schema_version: balanca.contingency.v1
registro: sem installation_id e sem device_configuration_id
```

`station/src/lib/contingency.ts` não exporta os campos. `ContingencyRecordIn` e `contingency_service._import_item` também não os recebem/repassam. Arquivo legado v1 é aceito, mas isso não equivale à compatibilidade v2 solicitada e não preserva a origem técnica; a importação grava `device_configuration_id = NULL`, sem inferir a configuração ativa.

### 9 — isolamento

Não foi possível aprovar o cenário multi-account solicitado. Há filtro de `tenant_id` nas buscas de instalação/configuração e RLS em `pesagens`, mas `estacao_instalacoes` e `device_configurations` não possuem RLS habilitado no banco. Falta teste de tentativa cruzada entre contas para comprovar o requisito em runtime.

### Regressão da Bridge

Preservada por inspeção e testes: `bridge/balanca_bridge/main.py` instancia `ProtocolAdapter`; leitores Serial e TCP permanecem separados; `ProtocolConfig.weight_regex` continua sendo a configuração de parsing. Não há parser de fabricante na PWA ou no Service.

## Validações executadas

| Comando | Resultado |
| --- | --- |
| `cd service && .venv/bin/pytest -q` | **11 passed** em 9.47s |
| `cd bridge && PYTHONPATH=. ../service/.venv/bin/python -m pytest -q` | **11 passed** em 0.52s |
| `cd station && pnpm run typecheck` | aprovado |
| `cd station && pnpm run lint` | aprovado |
| `cd station && pnpm run build` | aprovado; Next.js 16.3.2 |
| `git diff --check` | falhou: `README.md:328: trailing whitespace.` (preexistente/fora do escopo) |

As suítes atuais não contêm teste específico de reinstalação, substituição com Bridge, fila offline pós-reinstalação, concorrência de DeviceConfiguration, contrato de contingência com as três identidades ou tentativa intertenant dessas entidades. Por isso, seus resultados não suprem os cenários obrigatórios acima.

## Pendências bloqueantes para uma próxima fase corretiva

1. Preservar uma credencial/autorização de sincronização segura para a instalação substituída, limitada a pendências já capturadas, sem reativar sua operação.
2. Transportar e persistir `installation_id` e `device_configuration_id` por pesagem, inclusive IndexedDB, sync e contingência; versionar o contrato e manter v1 como legado sem inferência.
3. Fazer a validação da Bridge ser verificável e obrigatória no fluxo que ativa a configuração, incluindo autenticação da Bridge no teste.
4. Adicionar testes E2E isolados para os cenários 1–9, especialmente concorrência e isolamento.

