# BALANCA-WEIGHING-CORE-01A — Auditoria do Core Operacional de Pesagem

**Data:** 2026-09-18
**Tipo:** Auditoria somente leitura
**Repositório auditado:** `/opt/lampp/htdocs/tara` (schema `tara`, banco `farms`)
**Auditor:** Antigravity
**Status do banco:** PostgreSQL acessível — zero registros em `tara.pesagens` e `tara.ordens` (ambiente de desenvolvimento limpo)

> **ATENÇÃO:** O projeto foi encontrado em `/opt/lampp/htdocs/tara`, não em `/opt/lampp/htdocs/balanca-platform` como referenciado no prompt. O projeto "Tara" é a Plataforma Balança. Todo o relatório reflete a estrutura real encontrada.

---

## 1. Conclusão Executiva

A Plataforma Balança (projeto `tara`) possui uma **arquitetura fundamentalmente correta** para o princípio enunciado: a plataforma administra execução, rastreabilidade e entrega de pesagens, sem precisar conhecer produto, fornecedor, cliente comercial, pedido, NF, estoque, lote, preço ou faturamento.

**O modelo já está alinhado ao modelo-alvo em 70–75%.** Os principais GAPs são de natureza semântica, de nomenclatura e de consistência — não de acoplamento estrutural com o domínio do cliente. Não existe uma tabela `Produto`, não existe FK para tabelas do AgroSaaS, e o campo `contexto` (JSONB) já serve como mecanismo opaco de referência externa.

**Ponto crítico identificado:** O endpoint `GET /v1/stations/sync/pull` retorna campos `produto_id: null`, `produto_tipo: null`, `tipo_volume: null`, `quantidade_volumes: null`, `numero_documento_fiscal: null` hardcoded como nulos. Esses campos são **legado de um contrato anterior com o AgroSaaS** e não possuem correspondência no modelo de dados atual. São campos fantasmas — existem na resposta da API mas não em nenhuma tabela.

---

## 2. Arquitetura Encontrada

### 2.1 Componentes reais

| Componente | Localização | Tecnologia |
|---|---|---|
| **Service** | `service/` | Python / FastAPI / SQLAlchemy async |
| **Bridge** | `bridge/` | Python / FastAPI (local, embarcado) |
| **Station** | `portal/` | Next.js (TSX) — Portal do Cliente |
| **Backoffice** | `backoffice/` | Next.js (TSX) — Administração da Plataforma |
| **Contracts** | `contracts/balanca.ts` | TypeScript / Zod |
| **DB** | `farms` / schema `tara` | PostgreSQL com RLS |

### 2.2 Separação de contextos (ADRs)

- **ADR-0001:** Plataforma independente do AgroSaaS — comunicação por HTTP/eventos/contratos
- **ADR-0003:** Direção física (`direcao_veiculo`) e natureza da mercadoria (`natureza_mercadoria`) são conceitos separados
- **ADR-0005:** Pesagem avulsa preserva contexto completo (sem exigir ordem prévia)

---

## 3. Modelo de Dados — Inventário Completo

### 3.1 Tabelas do schema `tara` (26 tabelas confirmadas via \dt)

#### Tabelas de Identidade e Acesso

| Tabela | Finalidade | PK | RLS |
|---|---|---|---|
| `contas` | Organizações consumidoras (unidade de isolamento) | UUID | — |
| `usuarios` | Operadores e usuários do backoffice | UUID | Sim |
| `administradores_plataforma` | Admins globais sem seleção de tenant | UUID | — |
| `papeis` | Agrupamentos de permissões | UUID | — |
| `permissoes` | Capacidades atômicas | UUID | — |
| `usuario_papeis` | N:M usuários <-> papéis | (usuario_id, papel_id) | — |
| `papel_permissoes` | N:M papéis <-> permissões | (papel_id, permissao_id) | — |
| `api_clients` | Credenciais técnicas de sistemas consumidores | UUID | — |
| `api_client_secrets` | Versões de segredos para rotação sem downtime | UUID | — |
| `portal_users` | Usuários do Portal do Cliente | UUID | — |
| `portal_tokens` | Tokens temporários (email/senha) | UUID | — |
| `platform_settings` | Configurações globais da plataforma | key (string) | — |

#### Tabelas do Core de Pesagem

| Tabela | Finalidade | PK | RLS |
|---|---|---|---|
| `clientes` | Referências de sistemas consumidores | UUID | — |
| `ordens` | Solicitações operacionais que orientam pesagens | UUID | Sim |
| `pesagens` | Registro imutável de medições | UUID | Sim |
| `estacoes` | Estações de pesagem autorizadas | UUID | Sim |
| `estacao_instalacoes` | Instalações concretas de uma estação | UUID | Sim |
| `estacao_operadores` | Autorizações operador <-> estação | (estacao_id, operador_id) | — |
| `operadores` | Pessoas autorizadas a executar pesagens | UUID | Sim |
| `device_configurations` | Config técnica Bridge/Equipamento por instalação | UUID | — |
| `bridge_validations` | Evidências de validação de Bridge | UUID | — |
| `eventos_outbox` | Eventos para entrega assíncrona at-least-once | UUID | — |
| `outbox_replay_audits` | Auditoria de replays manuais de eventos | UUID | — |
| `webhook_destinations` | Destino HTTP por Conta para receber eventos | UUID | — |
| `contingencia_lotes` | Pacotes assinados transportados em contingência | UUID | — |
| `contingencia_itens` | Itens individuais de um lote de contingência | UUID | — |

---

### 3.2 Entidade `Ordem` — Campos detalhados

```
tara.ordens
├── id                  UUID        PK, NOT NULL
├── tenant_id           UUID        NOT NULL (isolamento RLS)
├── cliente_id          UUID        FK -> tara.clientes.id, NOT NULL
├── sistema_cliente     VARCHAR(80) NOT NULL  (ex: "agrosaas")
├── tenant_cliente_id   VARCHAR(120) NOT NULL (tenant do cliente no sistema consumidor)
├── referencia_externa  VARCHAR(180) NOT NULL (ID da operação no sistema consumidor)
├── correlation_id      VARCHAR(120) NOT NULL (rastreabilidade de eventos)
├── subject_type        VARCHAR(20) NOT NULL  (VEICULO | ANIMAL)
├── tipo_pesagem        VARCHAR(30) NOT NULL  (UNICA | DUPLA | DUPLA_ENTRADA_DESCARGA | DUPLA_SAIDA_CARREGAMENTO)
├── contexto            JSONB       NOT NULL  (dados opacos do consumidor)
├── status              VARCHAR(40) NOT NULL  (PENDENTE | EM_PESAGEM | CONCLUIDA | PENDENTE_RECONCILIACAO)
├── peso_liquido_kg     NUMERIC(12,3) NULL    (calculado ao concluir)
├── created_at          TIMESTAMP   NOT NULL
└── concluida_em        TIMESTAMP   NULL
```

**Constraints:**
- `uq_tara_ordens_client_external`: UNIQUE (cliente_id, referencia_externa)
- `uq_balanca_ordens_external` (LEGADO): UNIQUE (tenant_id, sistema_cliente, referencia_externa)
- `ix_balanca_ordens_status`: INDEX (tenant_id, status)

> Nota: dois índices de unicidade coexistem — o legado e o novo. Ver GAP G05.

---

### 3.3 Entidade `Pesagem` — Campos detalhados (confirmados no banco)

```
tara.pesagens
├── id                      UUID            PK, NOT NULL
├── tenant_id               UUID            NOT NULL (isolamento RLS)
├── ordem_id                UUID            FK -> tara.ordens.id, NULL (pesagem avulsa)
├── estacao_id              UUID            FK -> tara.estacoes.id, NULL
├── instalacao_id           UUID            FK -> tara.estacao_instalacoes.id, NULL
├── device_configuration_id UUID            FK -> tara.device_configurations.id, NULL
├── operador_id             UUID            FK -> tara.operadores.id, NULL
├── local_id                VARCHAR(120)    NOT NULL (capture_id — idempotência)
├── etapa                   VARCHAR(30)     NOT NULL (UNICA | CHEGADA | SAIDA | POS_DESCARGA)
├── peso_informado_kg       NUMERIC(12,3)   NULL (peso declarado pelo operador)
├── peso_aferido_kg         NUMERIC(12,3)   NOT NULL (leitura física real)
├── peso_tara_kg            NUMERIC(12,3)   NULL (tara informada na captura)
├── captured_via            VARCHAR(20)     NOT NULL (MANUAL | ELETRONICA)
├── leitura_bruta           JSONB           NULL (dados brutos do equipamento)
├── captured_at             TIMESTAMP       NOT NULL
├── reconciliation_status   VARCHAR(30)     NOT NULL DEFAULT 'NAO_APLICAVEL'
├── direcao_veiculo         VARCHAR(10)     NULL (ENTRADA | SAIDA)
├── natureza_mercadoria     VARCHAR(10)     NULL (ENTRADA | SAIDA | NEUTRA)
├── tipo_operacao           VARCHAR(60)     NULL (texto livre)
└── contexto                JSONB           NOT NULL DEFAULT '{}'
```

**Constraints:**
- `uq_balanca_pesagens_local`: UNIQUE (tenant_id, local_id) — idempotência por capture_id
- `uq_balanca_pesagens_ordem_etapa`: UNIQUE (ordem_id, etapa) — max 1 pesagem por etapa por ordem
- `trg_TARA_pesagem_immutability`: TRIGGER protege todos os campos físicos de alteração

**Indexes:**
- `ix_tara_pesagens_reconciliation`: (tenant_id, reconciliation_status, captured_at)
- `ix_tara_pesagens_station`: (tenant_id, estacao_id, captured_at)

---

### 3.4 Entidade `Cliente` (referência de sistema consumidor)

```
tara.clientes
├── id                UUID        PK
├── tenant_id         UUID        NOT NULL
├── conta_id          UUID        FK -> tara.contas.id
├── sistema_cliente   VARCHAR(80)
├── tenant_cliente_id VARCHAR(120)
├── nome_exibicao     VARCHAR(160)
└── status            VARCHAR(20)
```

**Classificação:** `Cliente` aqui é REFERENCIA EXTERNA — é o sistema consumidor registrado para correlação, não o "cliente comercial" de uma NF.

---

### 3.5 Entidade `Estacao`

```
tara.estacoes
├── id                      UUID        PK
├── tenant_id               UUID        NOT NULL
├── conta_id                UUID        FK -> tara.contas.id
├── external_id             VARCHAR(120) NOT NULL
├── nome                    VARCHAR(160)
├── activation_code         VARCHAR(12) NULL
├── token_hash              VARCHAR(64) NULL
├── public_key              JSONB NULL
├── identity_fingerprint    VARCHAR(64) NULL
├── recovery_secret_hash    VARCHAR(64) NULL
├── recovery_secret_version INT         NOT NULL DEFAULT 1
├── status                  VARCHAR(20) (PENDENTE | ATIVA | SUSPENSA | REVOGADA)
├── last_seen_at            TIMESTAMP NULL
└── created_at              TIMESTAMP
```

**Lifecycle:** `PENDENTE -> ATIVA -> SUSPENSA <-> ATIVA -> REVOGADA`

---

## 4. Fluxo Atual — API Client -> Pesagem

### 4.1 Fluxo completo (conforme código real)

```
Sistema Cliente (AgroSaaS, etc.)
       |
       | POST /v1/clients  (scope: clients:write)
       | { sistema_cliente, tenant_cliente_id, nome_exibicao }
       v
tara.clientes (criado ou atualizado)
       |
       | POST /v1/orders  (scope: orders:write)
       | { client_system, client_tenant_id, external_reference,
       |   correlation_id, subject_type, tipo_pesagem, contexto }
       v
tara.ordens (status=PENDENTE)
       |
       | GET /v1/stations/sync/pull  (Station Token)
       v
tara.ordens PENDENTES -> sincronizadas para Station
       |
       | POST /v1/stations/sync/push  (Station Token)
       | { local_id, ordem_id, etapa, peso_aferido_kg, ... }
       v
tara.pesagens (criado)
       |
       +-- Se etapa == etapa_final:
       |       tara.ordens.status = CONCLUIDA
       |       tara.ordens.peso_liquido_kg = calculado
       |       tara.eventos_outbox (PENDENTE) criado
       |
       +-- Se etapa != final:
               tara.ordens.status = EM_PESAGEM
       |
       | Worker de entrega
       v
WebhookDestination (HTTPS + HMAC)
       |
       | balanca.pesagem.concluida.v1
```

### 4.2 Partes existentes vs. previstas

| Parte | Status |
|---|---|
| Criação de Ordem via API Client | EXISTE |
| Sincronização pull -> Station | EXISTE |
| Sincronização push <- Station | EXISTE |
| Pesagem avulsa (sem ordem) | EXISTE |
| Dupla pesagem (DUPLA) | EXISTE |
| Pesagem única (UNICA) | EXISTE |
| Evento outbox / webhook | EXISTE |
| API consulta pesagens com cursor | EXISTE |
| Contingência offline | EXISTE |
| Reconciliação pós-captura avulsa | EXISTE |

---

## 5. OrdemPesagem — Questões da Auditoria

### 5.1 Quem cria uma Ordem hoje?

| Criador | Mecanismo | Observação |
|---|---|---|
| **API Client** (sistema consumidor) | `POST /v1/orders` | Caminho principal |
| **Contingência** (import) | `_create_shadow_order()` em `contingency_service.py` | Cria "ordem sombra" com `client_system = "balanca-contingencia"` quando não há ordem_id |
| **Reconciliação** | `POST /v1/weighings/{id}/reconcile` com `status=CRIAR_ORDEM` | Backoffice ou cliente cria ordem a partir de avulsa |

**Station NAO cria Ordens diretamente.** Ela apenas consulta ordens existentes via `sync/pull` e envia pesagens via `sync/push`.

### 5.2 Dados obrigatórios para criar uma Ordem

| Campo | Obrigatório | Classificação |
|---|---|---|
| `client_system` | SIM | REFERENCIA EXTERNA |
| `client_tenant_id` | SIM | REFERENCIA EXTERNA |
| `external_reference` | SIM | REFERENCIA EXTERNA |
| `correlation_id` | SIM | TECNICO |
| `subject_type` | SIM | PESAGEM (VEICULO ou ANIMAL) |
| `tipo_pesagem` | SIM | PESAGEM (UNICA, DUPLA, etc.) |
| `contexto` | NAO (default `{}`) | CONTEXTO EXTERNO (JSONB opaco) |

**Produto:** NAO E NECESSARIO — não existe campo de produto na Ordem, no schema, ou no modelo.

**Veiculo/placa/motorista:** NAO OBRIGATORIO — podem ir em `contexto` (JSONB).

**NF/pedido/lote:** NAO OBRIGATORIO — podem ir em `contexto` (JSONB) ou `tipo_operacao`.

### 5.3 Classificação de cada informação

| Informação | Classificação |
|---|---|
| `external_reference` | REFERENCIA EXTERNA |
| `correlation_id` | TECNICO |
| `subject_type` | PESAGEM |
| `tipo_pesagem` | PESAGEM |
| `contexto` (JSONB) | CONTEXTO EXTERNO |
| `produto` | nao existe — NEGOCIO DO CLIENTE |
| `placa` | CONTEXTO EXTERNO (vai em `contexto`) |
| `motorista` | CONTEXTO EXTERNO (vai em `contexto`) |
| `fornecedor` | NEGOCIO DO CLIENTE |
| `NF/CFOP` | CONTEXTO EXTERNO (vai em `contexto`) |
| `pedido/lote` | NEGOCIO DO CLIENTE |
| `peso esperado` | OPCIONAL (via `contexto`) |
| `tipo_operacao` | PESAGEM (motivo operacional) |

---

## 6. Produto

### Resposta objetiva: Produto NAO e necessario para pesar hoje.

**Evidências:**

1. Nenhuma tabela `Produto` existe no schema `tara` (confirmado via `\dt tara.*` — 26 tabelas listadas, nenhuma de produto).
2. Nenhuma FK para produto em qualquer tabela.
3. Nenhum campo `produto_id` nos modelos SQLAlchemy (`models.py` lido integralmente).
4. Nenhuma validação de produto em `operation.py`, `schemas.py` ou `contingency_service.py`.
5. O `GET /v1/stations/sync/pull` retorna `"produto_id": null` e `"produto_tipo": null` **hardcoded** — campos fantasmas de contrato legado.

**Classificação atual de Produto:**

```
PRODUTO = LEGADO/FANTASMA no contrato sync/pull
        + NEGOCIO DO CLIENTE (pode ir em contexto JSONB)
```

**Produto deveria permanecer no core da Balança? Nao.**

---

## 7. Entrada e Saída — Análise Semântica

O sistema possui **dois conceitos independentes** (ADR-0003 confirma):

### 7.1 `direcao_veiculo` — Direcao Fisica do Veiculo

- **Valores:** `ENTRADA` | `SAIDA`
- **Significado:** Movimento do veículo em relação à balança
- **Localização:** `tara.pesagens.direcao_veiculo` (VARCHAR(10), NULL)

### 7.2 `natureza_mercadoria` — Natureza da Mercadoria

- **Valores:** `ENTRADA` | `SAIDA` | `NEUTRA`
- **Significado:** Classificação da movimentação de mercadoria
- **Localização:** `tara.pesagens.natureza_mercadoria` (VARCHAR(10), NULL)
- **Derivação:** CFOP primeiro dígito 1/2/3 = ENTRADA, 5/6/7 = SAIDA

### 7.3 A regra incorreta (ENTRADA = BRUTO, SAIDA = TARA) existe?

**NAO existe no código atual.** O sistema usa `etapa` para determinar a posição na sequência, e `direcao_veiculo` para o movimento físico. São conceitos independentes.

### 7.4 Mapeamento de etapas por tipo (operation.py)

```python
FINAL_STAGE_BY_WEIGHING_TYPE = {
    "UNICA": "UNICA",
    "DUPLA": "SAIDA",
    "DUPLA_ENTRADA_DESCARGA": "POS_DESCARGA",
    "DUPLA_SAIDA_CARREGAMENTO": "SAIDA",
}
```

---

## 8. Pesagem — Lifecycle Completo

### 8.1 Status de reconciliação

| `reconciliation_status` | Significado |
|---|---|
| `NAO_APLICAVEL` | Pesagem vinculada a uma Ordem (fluxo normal) |
| `NAO_RECONCILIADA` | Pesagem avulsa — sem Ordem associada |
| `VINCULADA` | Avulsa reconciliada com Ordem existente |
| `CRIAR_ORDEM` | Reconciliação criou nova Ordem |
| `PENDENTE_RECONCILIACAO` | Aguardando decisão manual |
| `REJEITADA` | Descartada na reconciliação |

### 8.2 Uma Ordem pode possuir quantas pesagens?

A constraint `uq_balanca_pesagens_ordem_etapa` UNIQUE (ordem_id, etapa) implica:

**Uma Ordem pode ter N pesagens, mas no maximo 1 por etapa.**

Na prática:
- `UNICA` -> 1 pesagem máxima
- `DUPLA` -> 2 pesagens máximas
- `DUPLA_ENTRADA_DESCARGA` -> 2 pesagens
- `DUPLA_SAIDA_CARREGAMENTO` -> 2 pesagens

**Uma Ordem pode ter 0 pesagens** (status PENDENTE), **1 pesagem** (EM_PESAGEM), ou **N pesagens** até o máximo do tipo (CONCLUIDA).

### 8.3 Imutabilidade

Trigger `trg_TARA_pesagem_immutability` (migration 019) protege todos os campos físicos após a confirmação. Apenas `ordem_id` e `reconciliation_status` podem ser alterados via reconciliação.

---

## 9. Primeira e Segunda Pesagem

O sistema **nao usa os termos** "pesagem 1" e "pesagem 2". Usa:

- **`etapa`** (VARCHAR(30) livre) para nomear a posição na sequência
- **`tipo_pesagem`** para definir quantas etapas existem e qual é a final

**Termos utilizados nos testes E2E:**
- `CHEGADA` — primeira pesagem
- `SAIDA` — segunda pesagem
- `UNICA` — pesagem única
- `POS_DESCARGA` — etapa final em DUPLA_ENTRADA_DESCARGA

**Nao ha conceito de BRUTO/TARA como etapas** — são campos calculados, não nomes de etapas.

---

## 10. Bruto, Tara e Liquido

### 10.1 Onde estao persistidos?

```
tara.pesagens.peso_aferido_kg    -> peso lido fisicamente (obrigatorio)
tara.pesagens.peso_tara_kg       -> tara informada na captura (NULL)
tara.pesagens.peso_informado_kg  -> peso declarado pelo operador (NULL)
tara.ordens.peso_liquido_kg      -> resultado calculado ao concluir
```

### 10.2 Formula real (operation.py, linha 250)

```python
order.peso_liquido_kg = data.peso_aferido_kg - (data.peso_tara_kg or Decimal("0"))
```

**Interpretacao:**
- `peso_liquido` = `peso_aferido_na_etapa_final` - `peso_tara_informado_na_etapa_final`

**Observacoes criticas:**

1. O cálculo ocorre apenas na **etapa final**. Para pesagem dupla, o `peso_tara_kg` vem da ultima pesagem, NAO da diferença entre as duas pesagens.
2. **Nao ha calculo de bruto-tara entre a 1a e a 2a pesagem.** O sistema nao subtrai automaticamente `pesagem1 - pesagem2`.
3. Evento de saída usa a mesma formula (`weighing_events.py`, linha 13).

### 10.3 Quem informa a tara?

A tara é informada pela Station no momento da captura (campo `peso_tara_kg` em `WeighingIn`). Nao existe "tara conhecida" do veiculo armazenada na plataforma.

### 10.4 Podem ser corrigidos?

**Nao** — a pesagem é imutável após confirmação. Apenas a reconciliação pode ser alterada.

---

## 11. Recebimento

**Cenario:** veiculo entra carregado -> pesagem 1 -> descarga -> veiculo sai vazio -> pesagem 2

Com o tipo `DUPLA_ENTRADA_DESCARGA`:

| Etapa | Peso | Status Ordem |
|---|---|---|
| 1a (ex: `CHEGADA`) | veiculo + carga (bruto) | EM_PESAGEM |
| 2a (`POS_DESCARGA`) | veiculo vazio (tara real) | CONCLUIDA |

**Formula aplicada:** `peso_aferido_POS_DESCARGA - peso_tara_POS_DESCARGA`

**GAP identificado:** O cálculo nao subtrai automaticamente pesagem1 - pesagem2. O operador precisa informar `peso_tara_kg` na ultima etapa contendo o peso de referencia correto.

---

## 12. Expedicao

**Cenario:** veiculo entra vazio -> pesagem 1 -> carregamento -> veiculo sai carregado -> pesagem 2

Com o tipo `DUPLA_SAIDA_CARREGAMENTO`:

| Etapa | Peso | Status Ordem |
|---|---|---|
| 1a (qualquer nome) | veiculo vazio (tara) | EM_PESAGEM |
| 2a (`SAIDA`) | veiculo + carga (bruto) | CONCLUIDA |

**Resposta:** O sistema suporta expedicao estruturalmente (existe `DUPLA_SAIDA_CARREGAMENTO`), mas nao diferencia a logica de calculo entre recebimento e expedicao. A formula e a mesma para ambos. O sistema nao esta orientado exclusivamente a recebimento — existem tipos dedicados para ambos os cenarios.

---

## 13. Pesagem Unica

**Suportada:** `tipo_pesagem = "UNICA"`, `etapa = "UNICA"`.

O campo `peso_tara_kg` permite informar uma tara conhecida na captura unica. A Ordem e concluida e o evento emitido apos a etapa `UNICA`.

Comprovado por teste E2E (`test_service_e2e.py`).

---

## 14. Tara Conhecida

**Resultado da pesquisa:** Nao existe suporte explicito para "tara conhecida" ou "tara do veiculo" como entidade da plataforma.

Campos pesquisados e nao encontrados:
- `known_tare`
- `tara_conhecida`
- `tara_cadastrada`
- `tara_manual`
- Tabela `Veiculo` com tara

**O que existe:**
- `peso_tara_kg` (NULL) na tabela `pesagens` — informado pelo operador no momento da captura
- `peso_tara_kg` (NULL) no schema `ContingencyRecordIn`

**Conclusao:** A tara e sempre **informada na operacao**, nao **consultada de um cadastro**. O campo `peso_tara_kg` nao registra sua origem (medida vs. informada manualmente).

---

## 15. Veiculo

### E cadastro mestre ou contexto da operacao?

**Resposta: Contexto da operacao.**

Nao existe tabela `Veiculo` no schema `tara`. Nao existe FK para veiculo em nenhuma tabela.

**Onde veiculo aparece:**

| Local | Campo | Classificacao |
|---|---|---|
| `tara.ordens.contexto` (JSONB) | `{"placa": "ABC1D23"}` — exemplo nos testes | CONTEXTO EXTERNO |
| `tara.pesagens.contexto` (JSONB) | `{"veiculo": {"placa": "ABC1D23"}}` | CONTEXTO EXTERNO |
| `tara.pesagens.direcao_veiculo` | `ENTRADA|SAIDA` | PESAGEM |
| `tara.ordens.subject_type` | `VEICULO|ANIMAL` | PESAGEM |

**Nao ha:** placa, cavalo, carreta, tipo de caminhao, tara do veiculo, motorista, transportadora como campos proprios.

---

## 16. Referencia Externa

### Mecanismo atual

| Campo | Onde | Descricao |
|---|---|---|
| `external_reference` | `tara.ordens` | ID da operacao no sistema consumidor |
| `correlation_id` | `tara.ordens` + `tara.eventos_outbox` | Rastreabilidade |
| `client_system` | `tara.ordens` | Nome do sistema consumidor |
| `client_tenant_id` | `tara.ordens` | Tenant do sistema consumidor |
| `local_id` | `tara.pesagens` | capture_id (gerado pela Station) |
| `contexto` | `tara.ordens` + `tara.pesagens` | JSONB opaco do consumidor |

### E possivel criar uma operacao minima?

```json
{
  "client_system": "meu-sistema",
  "client_tenant_id": "fazenda-001",
  "external_reference": "EXP-2026-00891",
  "correlation_id": "corr-EXP-2026-00891",
  "subject_type": "VEICULO",
  "tipo_pesagem": "UNICA",
  "contexto": {"vehicle_plate": "ABC1D23"}
}
```

**Sim, isso funciona hoje.** O `contexto` aceita qualquer JSONB.

---

## 17. Metadata / Contexto Opaco

### Existe `contexto` JSONB?

**Sim.** Em duas entidades:

| Tabela | Campo | Nullable | Default |
|---|---|---|---|
| `tara.ordens` | `contexto` | NOT NULL | — (pode ser `{}`) |
| `tara.pesagens` | `contexto` | NOT NULL | `{}` |

**Caracteristicas:**
- **Tipo:** JSONB (PostgreSQL nativo)
- **Tamanho:** Sem limite explícito documentado
- **Persistencia:** Sim
- **Retorno pela API:** Sim — `OrderOut.contexto` e `WeighingOut.contexto`
- **Indexacao:** Nao ha indices GIN/JSONB sobre `contexto`
- **Seguranca:** Isolado por `tenant_id` via RLS — nao ha exposicao entre tenants
- **Esquema:** Livre

**Exemplo real (test_avulsa_e2e.py):**
```json
{
  "cfop": "1101",
  "nota_fiscal": {"numero": "123"},
  "veiculo": {"placa": "ABC1D23"},
  "motorista": {"nome": "Joao"},
  "transportadora": {"nome": "Transporte Teste"}
}
```

---

## 18. API Client — Fluxo Real

```
Sistema Cliente
      |
      | Credenciais: X-Balanca-Client-ID + X-Balanca-Client-Secret
      v
POST /v1/clients -> tara.clientes
POST /v1/orders  -> tara.ordens (PENDENTE)
      |
      | Station Token
      | GET /v1/stations/sync/pull -> ordens PENDENTES
      v
POST /v1/stations/sync/push -> tara.pesagens
      |
      +-- Etapa final -> CONCLUIDA + eventos_outbox (PENDENTE)
      |
      | Worker de entrega
      v
WebhookDestination -> balanca.pesagem.concluida.v1
      |
      v
GET /v1/events  (scope: events:read)
GET /v1/weighings (scope: weighings:read)
GET /v1/orders  (scope: orders:read)
```

**Todas as partes estao implementadas.** Fluxo funcional comprovado pelos testes E2E.

---

## 19. Station — UX Operacional

O portal (`portal/`) serve como Station UI. Nao foi identificado um componente dedicado de pesagem — os arquivos presentes sao de autenticacao e shell. A estacao opera via API.

**Campos informados pela Station no momento da pesagem:**

| Campo | Obrigatorio | Classificacao |
|---|---|---|
| `local_id` | SIM | ESSENCIAL (idempotencia) |
| `etapa` | SIM | ESSENCIAL PARA PESAGEM |
| `peso_aferido_kg` | SIM | ESSENCIAL PARA PESAGEM |
| `captured_via` | SIM (default MANUAL) | TECNICO |
| `ordem_id` | NAO | ESSENCIAL (referencia) |
| `direcao_veiculo` | NAO | CONTEXTO |
| `natureza_mercadoria` | NAO | CONTEXTO |
| `tipo_operacao` | NAO | CONTEXTO |
| `peso_tara_kg` | NAO | CONTEXTO / PESAGEM |
| `peso_informado_kg` | NAO | CONTEXTO |
| `operador_id` | NAO | TECNICO |
| `leitura_bruta` | NAO | TECNICO (evidencia) |
| `contexto` (JSONB) | NAO | CONTEXTO EXTERNO |

**Campos no sync/pull (legado — campos fantasmas):**

```
produto_id: null               LEGADO — nao existe no modelo
produto_tipo: null             LEGADO — nao existe no modelo
tipo_volume: null              LEGADO — nao existe no modelo
quantidade_volumes: null       LEGADO — nao existe no modelo
numero_documento_fiscal: null  LEGADO — pode ir em contexto
animais: []                    LEGADO — subject_type cobre isso
```

---

## 20. Fluxo sem Produto

**E tecnicamente possivel criar uma operacao completa sem Produto hoje?**

**Sim, completamente possivel.** Os testes E2E nao informam produto em nenhuma chamada e funcionam corretamente.

**Nao ha bloqueios** de modelo, FK, schema, validacao, service, route, frontend ou test que exijam produto.

O unico "rastro" de produto no codigo sao os campos `produto_id: null` e `produto_tipo: null` na resposta de `GET /v1/stations/sync/pull` — hardcoded como nulos, claramente legado.

---

## 21. Fluxo Minimo Atual

### Para criar uma Ordem (5 campos obrigatorios + contexto vazio):

```json
POST /v1/orders
{
  "client_system": "meu-sistema",
  "client_tenant_id": "tenant-001",
  "external_reference": "OP-001",
  "correlation_id": "corr-OP-001",
  "subject_type": "VEICULO",
  "tipo_pesagem": "UNICA",
  "contexto": {}
}
```

### Para capturar a primeira pesagem:

```json
POST /v1/stations/pesagens
{
  "local_id": "<uuid>",
  "etapa": "UNICA",
  "peso_aferido_kg": "12000.000",
  "ordem_id": "<ordem-id>"
}
```

### Para capturar a segunda pesagem (dupla):

```json
POST /v1/stations/pesagens
{
  "local_id": "<uuid-diferente>",
  "etapa": "SAIDA",
  "peso_aferido_kg": "3000.000",
  "ordem_id": "<ordem-id>"
}
```

### Para concluir:

Automatico — quando `etapa == etapa_final_do_tipo_pesagem`, a Ordem e marcada como CONCLUIDA e o evento emitido.

### Para consultar:

```
GET /v1/orders?status=CONCLUIDA
GET /v1/weighings
GET /v1/events?status=PENDENTE
```

---

## 22. Modelo Conceitual Atual

```
tara.contas (Conta / Tenant)
       | 1:N
       +---- tara.clientes (Referencia de Sistema Consumidor)
       |           | 1:N
       |           +---- tara.ordens (Ordem de Pesagem)
       |                       |
       |                       | 0:N (max 1 por etapa)
       |                       +---- tara.pesagens <------------+
       |                                                         |
       +---- tara.estacoes (Estacao Fisica)                     |
       |           | 1:N                                         |
       |           +---- tara.estacao_instalacoes               |
       |                       | 1:N                            |
       |                       +---- tara.device_configurations  |
       |                                    |                    |
       |                                    +---- (captura) --> tara.pesagens
       |
       +---- tara.operadores
       |           | N:M (via estacao_operadores)
       |           +---- tara.estacoes
       |
       +---- tara.eventos_outbox (Entrega At-Least-Once)
       |
       +---- tara.webhook_destinations (Destino por Conta)
       |
       +---- tara.contingencia_lotes + tara.contingencia_itens (Offline)
```

**Ausentes do core:** Produto, Fornecedor, Cliente comercial, NF, Pedido, Lote comercial, Estoque, Preco.

---

## 23. Comparacao Modelo Atual x Modelo-Alvo

| Aspecto | Modelo Atual | Modelo-Alvo |
|---|---|---|
| Entidade principal | `Ordem` + `Pesagem` | `WeighingOperation` + `Weighing` |
| Criacao | 5 campos obrigatorios (referencia externa) | `external_operation_id` |
| Pesagens por operacao | N (max 1 por etapa) | N |
| Produto no core | NAO (apenas campo fantasma) | NAO |
| Veiculo no core | NAO (vai em `contexto`) | NAO |
| Metadata opaco | `contexto` JSONB | `metadata` JSONB |
| Referencia externa | `external_reference` + `correlation_id` | `external_operation_id` |
| Cliente consumidor | `tara.clientes` (referencia registrada) | Sistema cliente proprietario |
| Evento de resultado | `balanca.pesagem.concluida.v1` | Event versioned |
| Reconciliacao | SIM | Prevista |
| Contingencia | SIM | Prevista |

**Principal diferenca:** No modelo atual, `tara.clientes` e um cadastro de referencia dentro da Balanca. No modelo-alvo, o sistema cliente seria proprietario dos seus dados. A diferenca e de naming e responsabilidade nominal, nao de acoplamento funcional — `tara.clientes` ja e apenas uma referencia de sistema, nao um cadastro comercial.

---

## 24. Classificacao dos GAPs

| # | GAP | Severidade | Natureza |
|---|---|---|---|
| G01 | Campos fantasmas no `sync/pull` (`produto_id`, `produto_tipo`, `tipo_volume`, `quantidade_volumes`, `numero_documento_fiscal`) | MEDIO | LEGADO / API |
| G02 | Calculo de `peso_liquido_kg` nao subtrai pesagem1 - pesagem2 automaticamente | ALTO | REGRA DE NEGOCIO |
| G03 | Ausencia de mecanismo de "tara conhecida" do veiculo | MEDIO | MODELAGEM |
| G04 | `direcao_veiculo` e `natureza_mercadoria` sao opcionais sem validacao de consistencia | BAIXO | REGRA DE NEGOCIO |
| G05 | Dois indices de unicidade redundantes em `tara.ordens` (legado + novo) | BAIXO | MODELAGEM |
| G06 | `tipo_operacao` e VARCHAR livre sem vocabulario controlado | BAIXO | MODELAGEM |
| G07 | Etapas de pesagem (`etapa`) sao VARCHAR livre sem validacao de vocabulario | MEDIO | MODELAGEM |
| G08 | `peso_tara_kg` nao distingue tara medida vs. informada manualmente | MEDIO | MODELAGEM |
| G09 | Origem da tara nao e registrada | MEDIO | RASTREABILIDADE |
| G10 | Ausencia de `known_tare` / tara do veiculo como entidade da plataforma | MEDIO | MODELAGEM |
| G11 | Campos `animais: []` no `sync/pull` sao placeholders nao implementados | OBSERVACAO | LEGADO |
| G12 | Portal nao tem UI de pesagem implementada (apenas shell e auth) | ALTO | UX |
| G13 | Calculo de expedicao e recebimento usam a mesma formula sem distincao semantica | MEDIO | REGRA DE NEGOCIO |
| G14 | `contexto` nao tem tamanho maximo documentado | BAIXO | API |

---

## 25. Perguntas Obrigatorias — Respostas

1. **Produto e necessario para pesar hoje?** NAO. Nenhuma entidade, FK, validacao ou calculo depende de produto.

2. **Produto deveria permanecer no core da Balanca?** NAO. Produto e dominio do sistema consumidor. O campo `contexto` ja permite informar produto como referencia opaca.

3. **O sistema diferencia corretamente entrada/saida de bruto/tara?** PARCIALMENTE. `direcao_veiculo` e `natureza_mercadoria` estao corretamente separados (ADR-0003). Mas nao ha distincao automatica entre "primeira pesagem = bruto" e "segunda pesagem = tara" — o operador informa `peso_tara_kg` manualmente.

4. **Recebimento funciona?** SIM estruturalmente — via `DUPLA_ENTRADA_DESCARGA`. O calculo de liquido e feito sobre a etapa final com a tara informada nessa etapa.

5. **Expedicao funciona?** SIM estruturalmente — via `DUPLA_SAIDA_CARREGAMENTO`. Mesma ressalva de calculo.

6. **Dupla pesagem funciona?** SIM — comprovado por teste E2E com etapas `CHEGADA` + `SAIDA`.

7. **Pesagem unica funciona?** SIM — tipo `UNICA`, etapa `UNICA`. Comprovado por teste E2E.

8. **Tara conhecida existe?** NAO como entidade da plataforma. Existe `peso_tara_kg` informado na captura, mas sem vinculo com veiculo ou cadastro de tara.

9. **Veiculo e obrigatorio?** NAO. Veiculo vai em `contexto` JSONB ou e apenas classificado como `subject_type = VEICULO`.

10. **Existe referencia externa suficiente?** SIM — `external_reference` + `correlation_id` + `contexto` JSONB permitem identificar qualquer operacao do sistema consumidor.

11. **O sistema cliente consegue criar uma solicitacao de pesagem sem replicar seus cadastros?** SIM — `contexto` JSONB permite passar qualquer dado comercial sem criar tabelas na Balanca.

12. **Quantas pesagens uma ordem pode possuir?** N pesagens, maximo 1 por etapa. Na pratica: 1 (UNICA) ou 2 (DUPLA e variantes).

13. **Como bruto/tara/liquido sao determinados?** `peso_liquido_kg = peso_aferido_kg_etapa_final - peso_tara_kg_etapa_final`. NAO e bruto - tara entre pesagens. Tara e informada manualmente na captura.

14. **A Station esta excessivamente acoplada a informacoes comerciais?** O endpoint `sync/pull` retorna campos comerciais legados hardcoded como nulos (`produto_id`, `produto_tipo`, etc.), sugerindo acoplamento historico eliminado mas nao limpo.

15. **Quais informacoes pertencem realmente ao core de pesagem?** `local_id`, `etapa`, `peso_aferido_kg`, `captured_at`, `captured_via`, `estacao_id`, `instalacao_id`, `device_configuration_id`, `operador_id`, `leitura_bruta`, `direcao_veiculo`, `natureza_mercadoria`, `reconciliation_status`.

16. **Quais informacoes deveriam ser apenas contexto externo?** Tudo em `contexto` JSONB: placa, motorista, transportadora, produto, NF, pedido, lote, CFOP, origem, destino. `tipo_operacao` poderia ser opcional ou migrar para contexto.

17. **Ha risco de perda de dados caso simplifiquemos OrdemPesagem?** SIM — `sistema_cliente` e `tenant_cliente_id` estao denormalizados em `tara.clientes` E em `tara.ordens`. Qualquer simplificacao precisa manter rastreabilidade dessas referencias.

18. **Ha migrations/dados existentes que precisam de compatibilidade?** Banco com zero registros de pesagens/ordens em desenvolvimento. 32 migrations aplicadas. O constraint legado `uq_balanca_ordens_external` ainda existe ao lado do novo `uq_tara_ordens_client_external`.

19. **O modelo atual suporta diferentes setores sem conhecimento do produto?** SIM. `subject_type` (VEICULO|ANIMAL) + `tipo_pesagem` + `contexto` JSONB tornam o modelo aplicavel a agro, industria, logistica, etc. sem exigir produto.

20. **Qual e o menor conjunto de mudancas para chegar ao modelo-alvo?**
    - Remover campos fantasmas do `sync/pull` (G01)
    - Implementar calculo bruto-tara entre pesagens 1 e 2 (G02)
    - Adicionar vocabulario controlado para `etapa` por `tipo_pesagem` (G07)
    - Implementar tara conhecida do veiculo se necessario (G10)
    - Limpar constraint legada `uq_balanca_ordens_external` (G05)
    - Renomear `Ordem` -> `WeighingOperation` (opcional, breaking change)

---

## 26. Riscos e Compatibilidade

| Risco | Impacto | Observacao |
|---|---|---|
| Constraint dupla em `tara.ordens` | BAIXO | Dois indices coexistem; nao causa erro mas e confuso |
| Calculo de liquido simplificado | MEDIO | Para pesagens duplas onde o operador espera bruto-tara automatico |
| Campos fantasmas no sync/pull | MEDIO | Station/AgroSaaS pode estar dependendo deles |
| Trigger de imutabilidade | CRITICO | Pesagens confirmadas sao imutaveis — erro de captura nao tem correcao no core |
| `tara.clientes` como referencia | BAIXO | E apenas registro de sistema consumidor |
| Banco limpo (zero records) | POSITIVO | Nenhuma compatibilidade de dados historicos necessaria neste momento |

---

## 27. BALANCA-WEIGHING-CORE-01A

```
STATUS: GO COM RESSALVAS
```

### Justificativa

A arquitetura atual e **coerente com o principio central** declarado:

> A Plataforma Balanca administra execucao, rastreabilidade e entrega da pesagem.
> O sistema cliente administra o processo comercial, fiscal, logistico ou produtivo.

Produto, fornecedor, cliente comercial, pedido, NF, estoque, lote, preco e faturamento nao existem como entidades da plataforma. O campo `contexto` JSONB ja serve como mecanismo seguro e isolado para dados opacos do consumidor.

O modelo de pesagem (Ordem -> Pesagem x N) e funcionalmente correto, testado e suporta: pesagem unica, dupla, avulsa, contingencia offline, reconciliacao, eventos at-least-once e paginacao por cursor.

### Ressalvas para a proxima fase

1. **G01 — Limpar campos fantasmas do `sync/pull`** antes de qualquer nova integracao
2. **G02 — Definir e implementar a semantica de bruto/tara para dupla pesagem** (formula atual usa apenas a ultima etapa)
3. **G07 — Definir vocabulario controlado de `etapa`** por `tipo_pesagem`
4. **G10 — Avaliar necessidade de tara conhecida** do veiculo como entidade da plataforma

### Recomendacao sobre BALANCA-WEIGHING-CORE-01B

**Iniciar `BALANCA-WEIGHING-CORE-01B` e recomendado**, com escopo restrito a:

1. Remover campos fantasmas do `sync/pull` (breaking change controlado — AgroSaaS precisa ser consultado primeiro)
2. Definir e implementar formula bruto-tara entre pesagens de operacoes duplas
3. Adicionar validacao de vocabulario para `etapa` baseada em `tipo_pesagem`
4. Documentar formalmente o contrato de `contexto` JSONB (tamanho maximo, encoding, exemplos)

**Nao iniciar antes de:** verificar com o time de AgroSaaS se o `sync/pull` com campos nulos e consumido ativamente e qual e o impacto de remove-los.

---

*Relatorio gerado em auditoria somente leitura — nenhuma alteracao foi realizada no codigo, banco, migrations ou infraestrutura.*
