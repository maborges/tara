# BALANCA-OPERATION-ORIGIN-01A — Auditoria de Operação Local, Carga e Reconciliação

**Escopo:** auditoria do delta para distinguir operações `EXTERNA` e `LOCAL`, incluindo operação local online/offline, contexto logístico e reconciliação posterior.

**Execução:** inspeção dirigida de `OperacaoLocal`, `operation_local_id`, `Ordem`, `Pesagem`, contexto JSONB, Station e sync/reconciliação. Nenhum código, banco ou migration foi alterado.

## 1. Estado atual

### 1.1 Origem da operação

Não existe hoje um campo persistido e formal `EXTERNA | LOCAL`.

- `service/app/models.py:Ordem` possui `sistema_cliente`, `tenant_cliente_id`, `referencia_externa`, `correlation_id` e `operation_local_id`, mas não possui `origem_operacao`.
- `station/src/lib/db.ts:OperacaoLocal` possui identidade, estado, processo e contexto, mas não possui origem.
- `station/src/lib/db.ts:OrdemPendenteLocal` prevê `origem_tipo`, porém o backend retorna `"OUTRO"` fixo em `service/app/routes/integrations.py:/stations/sync/pull`; não é uma origem persistida da Ordem.
- `operation_local_id` identifica uma operação criada/transportada pela Station, mas não substitui uma origem de domínio. É uma chave técnica de idempotência e pode continuar existindo independentemente de conectividade.

Conectividade também não é confundida no banco com origem. Há estados locais de sync (`PENDENTE_SYNC`, `MAPEADA`, `ERRO_SYNC` etc.), mas não há um atributo que diga se a operação veio de sistema externo ou foi iniciada localmente.

**Menor ajuste:** adicionar um campo aditivo nullable/controlado na operação canônica e no contrato local/sync, por exemplo `origem_operacao` (`EXTERNA`/`LOCAL`). Não preencher registros históricos por inferência; valores nulos devem permanecer legíveis como legado até uma regra explícita de compatibilidade.

### 1.2 Operação LOCAL online

A Station consegue iniciar uma operação sem Ordem externa prévia, mas o caminho atual é implicitamente o de pesagem avulsa/offline:

1. `station/src/app/(balanca)/pesagem/page.tsx` abre “Pesagem avulsa (sem ordem)”.
2. Na primeira captura cria `OperacaoLocal` no Dexie, com `operation_local_id`, contexto e `ordem_id = null`.
3. Cada captura é enfileirada com `local_id` próprio.
4. `station/src/lib/sync/push.ts` envia a operação junto com a captura.
5. `service/app/routes/integrations.py:/stations/sync/push` chama `resolve_offline_operation`; se necessário, cria uma Ordem canônica.

Esse fluxo pode sincronizar imediatamente quando a rede está disponível, portanto há um caminho técnico LOCAL + ONLINE. Entretanto, não existe endpoint/fluxo explícito de criação online de operação LOCAL antes da captura. A criação só ocorre quando a primeira captura é registrada localmente e enviada pelo sync.

Além disso, `handleRegistrarPeso` sempre exige uma `OfflineCaptureAuthorization` disponível no Dexie, inclusive quando a Station está online. Assim, LOCAL + ONLINE depende do pool de autorizações previamente provisionado; não há ramo de captura online que elimine essa dependência. A operação local em si é durável no Dexie mesmo sem rede, o que atende LOCAL + OFFLINE quando há autorização válida.

**Gap:** separar conceitualmente origem de conectividade e documentar/contratar a autorização de captura para o caminho online. A criação local não deve ser limitada ao cenário “offline”.

### 1.3 Processo gerador e identificadores

Para uma Ordem externa, o contrato `OrderIn` usa:

- `client_system` → `Ordem.sistema_cliente`;
- `client_tenant_id` → `Ordem.tenant_cliente_id`;
- `external_reference` → `Ordem.referencia_externa`;
- `correlation_id` → `Ordem.correlation_id`.

Para a operação criada pela Station, `OfflineOperationIn` exige `processo.tipo`, `processo.referencia`, `referencia_externa` e `correlation_id`. O caminho de resolução cria a Ordem com `client_system = "station-offline"`, usa a referência do processo como referência externa e preserva o `operation_local_id`.

Não há campo separado `id_externo`. A referência externa é o identificador funcional atualmente disponível; `correlation_id` é correlação técnica/negocial, não substitui a chave externa. A identificação forte futura deve usar explicitamente `tenant + sistema_cliente + referencia_externa` (ou um `id_externo` equivalente), sem tratar `operation_local_id` como identidade do sistema cliente.

### 1.4 Contexto da carga

O contexto é transportado como JSONB em `Ordem.contexto` e `Pesagem.contexto`, aceito sem cadastro mestre. O helper `_offline_operation_context` preserva contexto fornecido e acrescenta/processa:

- processo (`tipo`, `referencia`);
- veículo (`placa_cavalo`, `carretas[]`);
- motorista (`nome`, documento tipo/número).

Produto, volumes, carga, lote e documentos não são colunas ou entidades próprias da Tara. Há exemplos de `produto`, `nota_fiscal`, `cfop` e transportadora em testes/contexto, e `OrdemPendenteLocal` ainda possui campos legados (`produto_id`, `produto_tipo`, `tipo_volume`, `quantidade_volumes`, `numero_documento_fiscal`), mas o `sync/pull` atualmente retorna esses campos como `null`.

O contrato mínimo para carga pode ser representado aditivamente dentro de `contexto`, com estrutura documentada/validada, por exemplo:

```json
{
  "carga": {
    "produto": {"codigo_externo": "SOJA", "descricao": "Soja"},
    "volumes": [{"quantidade": 10, "tipo": "SACA", "peso_unitario_declarado_kg": 60}],
    "peso_declarado_kg": 600,
    "lote": "L-01",
    "documentos": [{"tipo": "NF", "numero": "123"}]
  }
}
```

Isso não requer cadastro mestre de Produto, Volume, NF, Lote, Cliente ou Fornecedor.

### 1.5 Contexto de transporte

Há suporte reutilizável para placa principal, carretas, motorista e documento:

- Station coleta cavalo, lista de carretas, nome do motorista e tipo/número do documento no formulário local.
- `VeiculoOperacionalIn` e `MotoristaOperacionalIn` transportam esses dados no sync.
- `_offline_operation_context` normaliza placas e valida tipo/número do documento.
- Capturas preservam contexto JSONB como snapshot; não há colunas mestre de veículo/motorista.

Para Ordens externas esses dados continuam sendo contexto fornecido pelo sistema cliente. A estrutura não é uniforme para todos os produtores, mas é suficiente para o contrato mínimo LOCAL e para comparação técnica.

## 2. Componentes reutilizáveis

| Componente | Estado atual e reaproveitamento |
| --- | --- |
| `OperacaoLocal` / Dexie v9-v10 | Identidade durável da operação, estado local, contexto, etapas e resultado; suporta operação sem Ordem prévia. Evolução deve ser aditiva, sem limpar filas. |
| `operation_local_id` | Chave técnica estável da operação e índice único parcial em `tara.ordens` pela migration 038. Preserva retry e mapeamento para uma Ordem. |
| `local_id` | Idempotência física por `tenant_id + local_id`; deve permanecer independente de origem e de etapa. |
| `resolve_offline_operation` | Resolve primeiro por `operation_local_id`, depois tenta referência externa com comparação de contexto, ou cria Ordem `station-offline`. É a seam para LOCAL, mas precisa ser ampliada para reconciliação posterior. |
| Contexto JSONB | Já transporta processo, transporte e dados opacos de carga/documentos sem criar cadastros na Tara. |
| `OfflineCaptureAuthorization` | Autoriza cada captura e protege replay por `local_id`; deve permanecer igual para online, offline e retries. |
| `StationInstallation` / `DeviceConfiguration` | Identidades e configuração da captura já são enviadas no payload e vinculadas à Pesagem. Não há necessidade de alteração arquitetural. |
| `MarcoPesagemOficial` / histórico de resultado | Referenciam a operação/Pesagem sem editar o fato físico; devem acompanhar a mesma Ordem após reconciliação. |
| `reconcile_weighing` | Permite vínculo manual de uma Pesagem avulsa a Ordem ou criação de Ordem, alterando apenas vínculo/estado permitido. Não resolve ainda uma operação local completa com várias capturas e processo externo posterior. |
| Delivery/outbox | O evento v1 continua por Pesagem e os recibos/ACK permanecem independentes da origem; não devem ser redesenhados. |

## 3. Gaps reais

### G1 — Origem não é domínio explícito (MÉDIO)

`origem_tipo` na Station é projeção/hardcode e `operation_local_id` é identidade técnica. Não há como consultar ou auditar formalmente `EXTERNA` versus `LOCAL` na Ordem. O novo campo deve ser nullable para preservar históricos e obrigatório apenas para novas operações pelo contrato de criação.

### G2 — LOCAL + ONLINE não possui contrato próprio (MÉDIO)

O caminho atual é “avulsa + sync”; não há criação explícita online nem distinção de autorização online/offline. Funciona quando há autorização pré-carregada, mas a semântica não é visível para a operação nem para a API.

### G3 — Referência externa é obrigatória para LOCAL (ALTO para o objetivo)

`OfflineOperationIn.referencia_externa` e `OrderIn.external_reference` são obrigatórios. Uma operação LOCAL sem solicitação externa precisa fabricar uma referência ou não consegue usar o contrato atual. Isso conflita com “referência externa não obrigatória” e também dificulta identificar que a referência `station-offline` não veio do cliente.

### G4 — Processo externo posterior pode duplicar Ordem (ALTO)

O push local cria uma Ordem com `sistema_cliente = station-offline`. Uma solicitação externa posterior normalmente chega por `create_order` com outro `sistema_cliente`/cliente. `create_order` verifica a referência apenas dentro do cliente e não procura uma Ordem LOCAL pendente para anexar a identidade externa. Como resultado, pode criar uma segunda Ordem, enquanto a captura e o `operation_local_id` continuam ligados à primeira.

O caminho inverso (operação local encontrando uma Ordem externa já existente) possui uma proteção parcial: `resolve_offline_operation` procura uma referência igual no tenant e só adota a Ordem com contexto operacional equivalente; divergências retornam conflito. Esse matching não é ainda a reconciliação bidirecional de uma operação local já pesada.

### G5 — Matching forte e candidato não estão separados (MÉDIO)

O resolver procura `Ordem.referencia_externa` no tenant sem incluir `sistema_cliente` na consulta. A comparação de processo, veículo e motorista é usada como guarda de equivalência, mas pode produzir associação cross-system quando referências coincidem. Não há campo separado `id_externo`, tabela de candidatos, estado de conflito de operação ou UX humana para aceitar/rejeitar candidatos por placa, produto, motorista, volumes, natureza ou janela temporal.

### G6 — Estados misturam mapeamento técnico e reconciliação de negócio (MÉDIO)

`OperacaoLocal.reconciliation_status` usa `PENDENTE`, `MAPEADA` e `PENDENTE_RECONCILIACAO`; `MAPEADA` significa que a operação foi associada a uma Ordem Cloud, não que foi conciliada com um processo externo. No Cloud, `Pesagem.reconciliation_status` usa `NAO_APLICAVEL`, `NAO_RECONCILIADA`, `VINCULADA` e outros estados de captura.

Falta um estado de reconciliação da operação com semântica equivalente a:

- `NAO_APLICAVEL` — operação EXTERNA ou LOCAL encerrada legitimamente sem processo externo;
- `PENDENTE` — LOCAL pesada aguardando processo/decisão;
- `CONCILIADA` — processo externo vinculado explicitamente à mesma operação;
- `CONFLITO` — candidatos/chaves/contexto incompatíveis.

`MAPEADA` pode continuar como estado técnico separado. Para LOCAL que nunca terá processo externo, é necessária ação explícita de encerramento/declaração; não se deve inferir encerramento pela ausência de uma solicitação.

### G7 — Contexto de carga está disponível, mas sem contrato consistente (MÉDIO)

JSONB atende ao requisito de não criar cadastros mestres, porém os campos de carga não são tipados nem retornados de forma consistente no `sync/pull`. O delta deve ser um contrato aditivo de contexto e round-trip Station/Cloud, sem transformar dados em entidades Tara.

### G8 — Reconciliação de operação precisa de auditoria própria (MÉDIO)

A troca de vínculo de uma Pesagem avulsa é possível, mas não há registro específico de decisão para “operação LOCAL já pesada + solicitação externa posterior”. A implementação futura precisa guardar ator/timestamp, chave externa vinculada, estado anterior e motivo, sem apagar o `operation_local_id`, os marcos, o histórico do resultado ou as capturas.

### G9 — Guardas de imutabilidade devem ser comprovadas (MÉDIO)

`Pesagem.contexto`, peso, etapa, horário, estação, operador e evidência física são protegidos pelo trigger de imutabilidade das migrations 019/039. A reconciliação altera apenas vínculo/estado permitido e não deve mudar a captura.

Contudo, o trigger atual não lista explicitamente `ordem_id`, `reconciliation_status`, `instalacao_id` ou `device_configuration_id` entre os campos proibidos. `ordem_id` precisa continuar alterável somente pela reconciliação controlada; StationInstallation e DeviceConfiguration são evidências da captura e devem receber testes específicos de não alteração. Este é um ponto de segurança/contrato a fechar em 01B, sem editar Pesagem física.

## 4. Impacto por área

| Área | Comportamento atual | Alteração mínima necessária | Risco | Compatibilidade |
| --- | --- | --- | --- | --- |
| Banco/ORM | Ordem não tem origem nem estado de reconciliação da operação; `operation_local_id` já é único por tenant; contexto é JSONB. | Adicionar origem nullable, estado de reconciliação e mecanismo auditável de vínculo externo. Manter índices/chaves existentes e RLS. | ALTO | Nenhuma transformação histórica; migration aditiva. |
| Core | Resolver local cria Ordem `station-offline`; matching atual é referência + contexto; não reconcilia local já criada quando cliente chega depois. | Separar origem, chave externa forte, candidate/conflict e comando transacional de reconciliação; manter `operation_local_id → ordem_id`. | ALTO | Não editar Pesagem, marcos ou resultado; preservar regras 02B/02C. |
| Station | “Pesagem avulsa” cria OperacaoLocal; exige processo, cavalo e motorista; suporta sync online se houver autorização. | Expor origem de forma operacional, permitir referência externa ausente, manter contexto mínimo e estado de reconciliação; não depender de conectividade para criar. | MÉDIO | Fluxos legados e MULTIPLA permanecem iguais. |
| Dexie | `OperacaoLocal` não tem origem; contexto é livre; filas e capturas têm identidades corretas. | Campos opcionais aditivos, sem reset/clear; preservar filas, `operation_local_id`, `local_id`, contexto e resultado. | MÉDIO | Versões existentes e registros antigos continuam legíveis. |
| Sync | Envelope envia operação, processo, referência, correlação e contexto; conflitos viram `PENDENTE_RECONCILIACAO`. | Transportar origem, chave externa opcional/qualificada e estado/resultado da reconciliação; retries idempotentes. | MÉDIO | Não alterar autorização, challenge/proof, replay ou envelope v1 de Delivery. |
| Contexto/carga | JSONB aceita dados opacos; pull devolve produto/volume/NF como nulos. | Definir schema aditivo de `carga` e round-trip sem cadastros mestres. | MÉDIO | Preservar JSON legado e snapshots de Pesagem. |
| Reconciliação | `reconcile_weighing` atua por captura; não há comando para fundir uma operação local inteira a solicitação posterior. | Reconciliação operação-a-operação, com uma única Ordem, decisão explícita e auditoria. | ALTO | Fato físico, marcos e histórico permanecem intactos. |
| Device | Installation, configuração e autorizações são carregadas/enviadas pela Station. | Nenhuma mudança de desenho; apenas testes de preservação durante reconciliação. | BAIXO | Device/Bridge/replay inalterados. |
| Delivery/Eventos | Evento `balanca.pesagem.concluida.v1` e recibos são por Pesagem/Ordem. | Nenhuma alteração; origem pode ser contexto/contrato futuro sem reinterpretar v1. | BAIXO | DeliveryReceipt, ACK, purge e tombstone inalterados. |
| RLS | Ordens, Pesagens, marcos e histórico têm isolamento por tenant. | Qualquer tabela/coluna nova deve seguir o mesmo tenant/RLS; matching nunca cruza tenant. | MÉDIO | Isolamento e chaves `tenant_id + local_id` preservados. |

## 5. Estratégia mínima para 01B

1. Adicionar `origem_operacao` (`EXTERNA`/`LOCAL`) nullable na Ordem e nos contratos `OrderIn`, `OfflineOperationIn`, `OperacaoLocal`, pull e push. Não inferir nem preencher históricos.
2. Tornar `referencia_externa` opcional para LOCAL. Gerar apenas uma chave técnica interna para a operação local; não apresentá-la como referência do sistema cliente. Manter referência obrigatória para `EXTERNA`.
3. Introduzir estado de reconciliação da operação separado de `Ordem.status` e de `MAPEADA`: `NAO_APLICAVEL`, `PENDENTE`, `CONCILIADA`, `CONFLITO`. `Ordem.status` continua representando andamento/conclusão física.
4. Criar o menor mecanismo transacional para anexar uma solicitação externa a uma Ordem LOCAL existente, preservando a mesma Ordem, seus `operation_local_id`, Pesagens, marcos e histórico. A decisão deve registrar ator/timestamp/motivo.
5. Definir matching forte como `tenant + sistema_cliente + referencia_externa` (ou `id_externo` explicitamente qualificado). Matching por placa/produto/motorista/volume/natureza/janela deve apenas produzir candidatos; aceitação/rejeição deve ser explícita.
6. Reutilizar `contexto` JSONB para `carga`, transporte e documentos, com validação mínima e retorno íntegro no sync. Não criar entidades mestre.
7. Manter criação local no Dexie antes da captura e no offline; quando online, o mesmo contrato deve funcionar sem depender de uma solicitação externa. A política de `OfflineCaptureAuthorization` precisa ser declarada, não contornada.
8. Reforçar testes de imutabilidade/identidade para garantir que reconciliação não altera peso, `captured_at`, etapa, estação, instalação, configuração, evidência, `local_id`, marcos ou histórico.

## 6. Testes necessários para 01B

- criação de operação `EXTERNA` e `LOCAL`, online e offline, com round-trip da origem;
- LOCAL sem solicitação externa e sem `referencia_externa`, incluindo operação `MULTIPLA`;
- retry do mesmo `operation_local_id` e de cada `local_id`, sem duplicar Ordem ou Pesagem;
- operação LOCAL já pesada seguida da chegada de solicitação externa: uma única Ordem, estado `CONCILIADA`, sem nova Pesagem;
- mesma chave forte em tenants/sistemas diferentes não cruza nem associa operações;
- divergência de chave/contexto produz `CONFLITO` e não vincula automaticamente;
- candidatos por placa/produto/motorista/volume/janela não são associados sem decisão humana;
- encerramento explícito de LOCAL sem processo externo produz `NAO_APLICAVEL` e fica auditado;
- preservação round-trip de produto, descrição, volumes, peso declarado, lote e documentos no JSONB;
- cada captura preserva `local_id`, `captured_at`, peso, Station, StationInstallation, DeviceConfiguration, leitura/evidência e `operation_local_id`;
- troca/reconciliação não altera Pesagem, marcos oficiais, versões do resultado ou Delivery;
- regressão direcionada de UNICA, DUPLA, MULTIPLA, OFFLINE-OP-01B, autorizações offline, challenge/proof, replay, RLS e Delivery/ACK/purge;
- upgrade Dexie aditivo com filas e registros anteriores intactos.

## 7. Veredicto

O código atual fornece uma base reutilizável para operação LOCAL online e offline, mas a origem ainda é implícita, a referência externa é obrigatória no caminho local e não existe reconciliação segura de uma operação LOCAL já pesada quando o processo externo chega posteriormente. O principal risco é duplicar a Ordem ou confundir `MAPEADA` com conciliação de negócio.

É tecnicamente viável evoluir de forma aditiva, preservando operações históricas, N-capturas, Device, Delivery, RLS, idempotência e imutabilidade do fato físico. A 01B deve, porém, fechar explicitamente os gaps G1–G6 antes de considerar o contrato de origem pronto.

**BALANCA-OPERATION-ORIGIN-01A STATUS: CONCLUÍDO**

**GO COM RESSALVAS** para iniciar a 01B. Não implementar a 01B automaticamente.
