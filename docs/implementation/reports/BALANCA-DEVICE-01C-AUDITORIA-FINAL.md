# BALANCA-DEVICE-01C — Auditoria Final Pós-Implementação

**Data:** 2026-09-16  
**Escopo:** Implementação BALANCA-DEVICE-01B  
**Resultado geral:** **GO COM RESSALVAS**

---

## Resumo Executivo

A implementação da hierarquia `Station → StationInstallation → DeviceConfiguration → Pesagem` está **estruturalmente correta e funcional**. Dois defeitos foram identificados e corrigidos durante esta auditoria. Quatro GAPs residuais foram classificados para resolução futura.

---

## 1. Defeitos Encontrados e Corrigidos

### DEFEITO 1 — FK violation em `activate_station` (CRÍTICO — CORRIGIDO)

**Arquivo:** `service/app/operation.py`

**Causa:** A função `activate_station` criava `EstacaoInstalacao` e imediatamente a seguir criava `DeviceConfiguration` com `instalacao_id` referenciando a instalação — mas sem chamar `await session.flush()` entre os dois `session.add()`. O ORM/asyncpg não havia emitido o INSERT da instalação antes de tentar inserir a configuração, resultando em `ForeignKeyViolationError`.

**Impacto:** Toda tentativa de ativação de estação falhava com erro 500 no banco de dados.

**Correção aplicada:**
```python
session.add(installation)
await session.flush()  # persists installation.id so DeviceConfiguration FK resolves
session.add(device_config)
```

**Comprovação:** 3 passed → 11 passed nos testes automatizados após a correção.

---

### DEFEITO 2 — Imports ausentes em `integrations.py` + schemas duplicados (MODERADO — CORRIGIDO)

**Arquivos:** `service/app/routes/integrations.py`, `service/app/schemas.py`

**Causa:**
1. `EstacaoInstalacao`, `DeviceConfiguration`, `DeviceConfigurationIn`, `DeviceConfigurationOut` não estavam importados no arquivo de rotas, causando `NameError` na inicialização do módulo.
2. `DeviceConfigurationIn` e `DeviceConfigurationOut` foram declarados duas vezes em `schemas.py`.

**Impacto:** A aplicação não subia e todos os testes falhavam com `NameError`.

**Correção aplicada:** Imports adicionados em `integrations.py`; duplicata removida de `schemas.py`.

---

## 2. Resultados dos Testes

### Service (pytest)
```
11 passed in 8.66s
```

### Station PWA
```
tsc --noEmit   → exit 0
eslint src     → exit 0
next build     → exit 0 — Compiled successfully
```

### git diff --check
Trailing whitespace corrigido em `operation.py`, `integrations.py`, `schemas.py`.

---

## 3. Auditoria por Critério

### 3.1 — Hierarquia e Isolamento por Tenant — APROVADO

- `EstacaoInstalacao` e `DeviceConfiguration` possuem `tenant_id` como coluna própria.
- A rota `POST /stations/device-configurations` valida via `EstacaoInstalacao.tenant_id == tenant_id AND estacao_id == station.id`.
- Impede que uma conta acesse instalações de outra conta.

### 3.2 — Pesagem preserva origem técnica — APROVADO

- `Pesagem.device_configuration_id` é FK nullable para `device_configurations`.
- O sync push envia `pesagem.device_configuration_id ?? session.device_configuration_id`.
- Pesagens capturadas com Device A continuam referenciando Device A após substituição.

### 3.3 — Registros históricos — APROVADO

- Migração 028: `ADD COLUMN device_configuration_id UUID NULL` — pesagens anteriores à 01B ficam com `NULL`.
- Sem reescrita retroativa de dados.

### 3.4 — Idempotência do sync — APROVADO

- `complete_weighing()` faz lookup por `(tenant_id, local_id)` antes de inserir — retorna o existente sem modificar.
- `device_configuration_id` não é reescrito em re-sincronizações.

### 3.5 — Bridge: arquitetura preservada — APROVADO

- Nenhuma lógica de protocolo (Regex, Serial, TCP) foi transferida para PWA ou Service.
- A tela de configurações salva apenas uma URL string.

### 3.6 — IndexedDB versão 6 — upgrade sem perda de dados — APROVADO

- `db.version(6)` adiciona campos a `SessionRow` sem destruir tabelas existentes.
- `sync_queue` e `pesagens` não são afetadas.
- Campos novos são opcionais em `PesagemLocal` — pesagens antigas permanecem válidas.

### 3.7 — Segurança e cadeia de autorização — APROVADO

- Rotas usam `require_station` — tenant extraído do token, não do payload.
- `installation_id` do payload é validado contra o tenant e station autenticados.

---

## 4. GAPs Residuais

### GAP-01 — Reinstalação não cria nova EstacaoInstalacao para Station existente

**Seção:** 7 (Reinstalação)

Não existe fluxo para ativar uma estação já existente com uma nova instalação. A ativação sempre cria uma Estacao nova.

**Impacto:** Impede declarar critério 2 do épico atendido.

**Resolução futura:** Endpoint `POST /stations/{id}/reinstall` que cria nova `EstacaoInstalacao` + `DeviceConfiguration` para `Estacao` existente com revogação da instalação anterior.

---

### GAP-02 — Substituição de Bridge não é transacional com teste de conectividade

**Seção:** 8 (Teste da Bridge antes da substituição)

A nova `bridge_url` é salva imediatamente sem verificar se a Bridge responde ou produz leitura válida. A configuração anterior é invalidada antes de confirmar que a nova funciona.

**Impacto:** Impede declarar critério 10 do épico atendido.

**Resolução futura:** Salvar como `PENDING_VALIDATION` → testar `GET /health` via Bridge → confirmar substituição somente com leitura válida.

---

### GAP-03 — device_configuration_id ausente do contrato de contingência

**Seção:** 11 (Contingência)

`ContingencyRecordIn` não inclui `device_configuration_id`. Pesagens exportadas via contingência pós-01B não carregam a origem técnica.

**Impacto:** Rastreabilidade parcial via contingência.

**Resolução futura:** Adicionar `device_configuration_id: uuid | None = None` ao `ContingencyRecordIn`.

---

### GAP-04 — Ausência de constraint de unicidade para configuração ativa

**Seção:** 4 (Atomicidade)

Não existe índice parcial ou lock que impeça duas configurações `ACTIVE` simultâneas para a mesma instalação em race condition.

**Impacto:** Baixo risco em uso típico local/single-user, mas tecnicamente viola critério 9.

**Resolução futura:**
```sql
CREATE UNIQUE INDEX ON tara.device_configurations(instalacao_id) WHERE status = 'ACTIVE';
```

---

## 5. Classificação por Critério de Encerramento do Épico

| # | Critério | Status |
|---|----------|--------|
| 1 | Station sobrevive à troca de balança | ✅ Aprovado |
| 2 | Station pode sobreviver à reinstalação do terminal | ❌ GAP-01 |
| 3 | Cada nova pesagem registra sua origem técnica | ✅ Aprovado |
| 4 | Backlog offline preserva a origem antiga | ✅ Aprovado |
| 5 | Configuração substituída continua válida historicamente | ✅ Aprovado |
| 6 | Sync permanece idempotente | ✅ Aprovado |
| 7 | Isolamento entre contas está garantido | ✅ Aprovado |
| 8 | Upgrade do IndexedDB não perde dados | ✅ Aprovado |
| 9 | Troca de configuração é transacional | ⚠️ GAP-04 (baixo risco) |
| 10 | Bridge inválida não substitui silenciosamente config operacional | ❌ GAP-02 |
| 11 | Contingência preserva rastreabilidade quando aplicável | ⚠️ GAP-03 (parcial) |
| 12 | Nenhuma lógica de fabricante indevidamente movida | ✅ Aprovado |

---

## 6. Veredito

### BALANCA-DEVICE-01B: GO COM RESSALVAS

A implementação está correta estruturalmente, os defeitos críticos foram corrigidos e os testes passam. A implementação pode ser operada em produção.

### BALANCA-DEVICE-01 (épico): NÃO CONCLUÍDO

Os critérios 2 (reinstalação) e 10 (teste de Bridge antes de substituição) não estão atendidos.

**Correções obrigatórias para fechar o épico:**
1. GAP-01: Endpoint de reinstalação de Station existente
2. GAP-02: Fluxo de validação da Bridge antes de efetivar substituição

**Melhorias futuras (não bloqueantes):**
3. GAP-03: `device_configuration_id` no contrato de contingência
4. GAP-04: Constraint de unicidade de configuração ativa no banco
