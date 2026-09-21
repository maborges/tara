# BALANCA-OFFLINE-OP-01A — Auditoria da Operação de Pesagem Iniciada Offline

**Data:** 2026-09-20  
**Escopo:** auditoria estática, somente leitura, da árvore de trabalho atual. Nenhum código, migration, contrato, banco, RLS ou configuração foi alterado. A suíte não foi executada: os E2E configurados escrevem no banco e estão fora deste escopo.

## 1. Resumo executivo

**Veredicto: NO-GO** para implementar/operar hoje o cenário completo de operação veicular iniciada offline sem Ordem prévia, com contexto mínimo e segunda passagem posterior.

Há uma fundação reaproveitável e relevante: `PesagemLocal` aceita `ordem_id = null`; Dexie persiste fila, UUID local, evidência e autorização offline; o backend aceita Pesagem avulsa, protege a captura física, possui reconciliação explícita, idempotência por `tenant_id/local_id`, e o ciclo DEVICE/Delivery permanece disponível. Isto permite uma **captura avulsa única** offline.

Porém, o fluxo efetivamente entregue não cria uma operação local completa: a UI avulsa só permite `UNICA`, não coleta processo, motorista ou composição cavalo/carretas, e o `sync/push` não cria nem vincula Ordem. Assim, após voltar a rede, existe apenas uma Pesagem avulsa `NAO_RECONCILIADA`, não uma Ordem `EM_PESAGEM` capaz de continuar a segunda passagem. A criação de “ordem sombra” existe somente no importador de contingência por arquivo e não no push normal; o comentário da Station que afirma o contrário está defasado.

Este parecer é complementar: não modifica os estados consolidados **FUNDAÇÃO TÉCNICA: CONCLUÍDA**, **READINESS TÉCNICO: GO**, **PRECAMPO-02: GO**, **PILOT-02: AGUARDANDO EXECUÇÃO EM CAMPO** e **PILOT-02A: AGUARDANDO EQUIPAMENTO FÍSICO**.

## 2. Arquitetura atual encontrada

| Camada | Implementação encontrada | Papel atual |
| --- | --- | --- |
| Cloud | `Ordem` (`tara.ordens`) | Operação canônica vinculada a um cliente, com referência externa, `correlation_id`, tipo de pesagem, `contexto` JSONB e resultado físico consolidado. |
| Cloud | `Pesagem` (`tara.pesagens`) | Fato físico com `ordem_id` anulável, `local_id`, etapa, peso, operador, instalação, DeviceConfiguration, leitura e `contexto` JSONB. |
| Station | Dexie `ordens` | Projeção das Ordens já canônicas retornadas pelo pull; a chave `id` é UUID da Cloud. Não é uma Ordem local nova. |
| Station | Dexie `pesagens` e `sync_queue` | Captura local e fila de criação, identificadas por UUID `local_id`. |
| Cloud | `OfflineCaptureAuthorization` | Crédito previamente emitido e consumido por `local_id`, vinculado à instalação e DeviceConfiguration. |
| Cloud | reconciliação | `POST /v1/weighings/{id}/reconcile`: vincula Pesagem avulsa a Ordem existente ou cria Ordem mediante solicitação autorizada. |
| Cloud | Delivery | Ao concluir uma Ordem ou aceitar Pesagem avulsa, cria Outbox e `DeliveryReceipt`; pull/ACK/retenção/tombstone são independentes da origem offline. |

Evidências principais: [models.py](/opt/lampp/htdocs/tara/service/app/models.py:461), [models.py](/opt/lampp/htdocs/tara/service/app/models.py:489), [db.ts](/opt/lampp/htdocs/tara/station/src/lib/db.ts:23), [db.ts](/opt/lampp/htdocs/tara/station/src/lib/db.ts:44), [operation.py](/opt/lampp/htdocs/tara/service/app/operation.py:287).

## 3. Fluxo real atual

### Ordem previamente puxada

1. `GET /stations/sync/pull` baixa Ordens `PENDENTE` e `EM_PESAGEM`, incluindo etapas já realizadas.
2. A Station calcula a próxima etapa no Dexie e grava `PesagemLocal` com o `ordem_id` canônico.
3. A fila envia a captura ao `POST /stations/sync/push`.
4. A Cloud valida autorização, instalação e idempotência; marca a Ordem `EM_PESAGEM` ou `CONCLUIDA` e cria Delivery quando aplicável.

Esse fluxo reaproveita o mesmo `ordem_id` e foi o escopo resolvido por PRECAMPO-02. Evidências: [integrations.py](/opt/lampp/htdocs/tara/service/app/routes/integrations.py:862), [db.ts](/opt/lampp/htdocs/tara/station/src/lib/db.ts:246), [operation.py](/opt/lampp/htdocs/tara/service/app/operation.py:329).

### Sem Ordem previamente disponível

1. O operador seleciona “Pesagem avulsa (sem ordem)”.
2. A UI fixa `tipo_pesagem = UNICA`; captura somente peso, placa opcional e o sujeito veículo/animal.
3. Grava `PesagemLocal` com UUID `local_id`, `ordem_id = null`, autorização e fila Dexie.
4. No push normal, a Cloud cria `Pesagem` com `ordem_id = null` e `reconciliation_status = NAO_RECONCILIADA`.
5. Um cliente/backoffice pode posteriormente chamar a reconciliação para vincular a uma Ordem ou criar uma Ordem.

Não há criação automática de Ordem, correspondência por referência, retorno de `ordem_id` para a Station, nem continuação de duas etapas. Evidências: [page.tsx](/opt/lampp/htdocs/tara/station/src/app/(balanca)/pesagem/page.tsx:117), [page.tsx](/opt/lampp/htdocs/tara/station/src/app/(balanca)/pesagem/page.tsx:241), [integrations.py](/opt/lampp/htdocs/tara/service/app/routes/integrations.py:789), [operation.py](/opt/lampp/htdocs/tara/service/app/operation.py:314), [operation.py](/opt/lampp/htdocs/tara/service/app/operation.py:356).

### Contingência por arquivo

O importador de pacote assinado cria Ordem sombra quando `ordem_id` não veio no registro. Essa rota é distinta do push da Station e usa `client_system = balanca-contingencia`, referência igual a ticket/local ID e contexto do registro. Ela não é reconciliação por processo externo e não deve ser tratada como o fluxo normal de retorno de rede. Evidências: [contingency_service.py](/opt/lampp/htdocs/tara/service/app/contingency_service.py:97), [contingency_service.py](/opt/lampp/htdocs/tara/service/app/contingency_service.py:108).

## 4. Modelo de dados e imutabilidade

`Ordem` já é o local apropriado na Cloud para **contexto operacional enriquecível**, referências externas e estado da operação. Tem `sistema_cliente`, `tenant_cliente_id`, `referencia_externa`, `correlation_id` e `contexto` JSONB. Não há necessidade de entidade Cloud para Pedido, Romaneio, veículo, carreta, motorista, produto ou NF.

`Pesagem` é corretamente o fato físico. A migration de imutabilidade bloqueia alteração de peso, etapa, estação, operador, leitura, data/hora e também do `contexto` da Pesagem. A reconciliação somente altera `ordem_id` e `reconciliation_status`; portanto, já preserva a captura. Evidências: [011_pesagem_avulsa.sql](/opt/lampp/htdocs/tara/service/migrations/011_pesagem_avulsa.sql:1), [019_pesagem_immutability.sql](/opt/lampp/htdocs/tara/service/migrations/019_pesagem_immutability.sql:1), [operation.py](/opt/lampp/htdocs/tara/service/app/operation.py:356).

Consequência: contexto que pode chegar depois (produto, observação, referências documentais e correções administrativas) deve residir em `Ordem.contexto`, idealmente com atualização controlada e trilha de auditoria na futura fase; a Pesagem pode carregar apenas o *snapshot* capturado, que jamais deve ser enriquecido/reescrito. Hoje não existe rota de atualização de `Ordem.contexto`.

## 5. Dexie e criação offline

O Dexie suporta a parte “PesagemLocal”: `pesagens` é indexada por `local_id`, `ordem_id` é nulo, a `sync_queue` recupera itens interrompidos e não duplica a entrada do mesmo `local_id`. A autorização é consumida localmente antes do envio. Evidências: [db.ts](/opt/lampp/htdocs/tara/station/src/lib/db.ts:52), [db.ts](/opt/lampp/htdocs/tara/station/src/lib/db.ts:95), [db.ts](/opt/lampp/htdocs/tara/station/src/lib/db.ts:234), [push.ts](/opt/lampp/htdocs/tara/station/src/lib/sync/push.ts:82).

Não suporta `OperacaoLocal + PesagemLocal` como unidade: `ordens` só aceita ID Cloud, não tem `local_id`, `ordem_id` canônico anulável, estado de reconciliação, tipo/referência exigidos ou uma fila de operação. Portanto a Station não tem onde manter a identidade local comum da primeira e segunda passagem antes da Cloud devolver uma Ordem.

## 6. Processo gerador, veículo e motorista

### Processo gerador

Há blocos técnicos reaproveitáveis (`referencia_externa`, `correlation_id`, `sistema_cliente`, `tenant_cliente_id`, `contexto`), mas só no contrato de criação de Ordem e todos os campos-base são obrigatórios. A captura avulsa da UI não os coleta nem o push os preenche. `tipo_operacao` existe na Pesagem, mas é string livre de até 60 caracteres e não representa o par obrigatório `processo.tipo + processo.referencia`. Evidências: [schemas.py](/opt/lampp/htdocs/tara/service/app/schemas.py:337), [schemas.py](/opt/lampp/htdocs/tara/service/app/schemas.py:478), [page.tsx](/opt/lampp/htdocs/tara/station/src/app/(balanca)/pesagem/page.tsx:532).

Para 01B, `processo.tipo` deve ser string controlada/extensível no JSON da Ordem (por exemplo `PEDIDO`, `ROMANEIO`, `OUTRO`), não enum rígido nem tabelas de domínio. `referencia_externa` deve continuar sendo a referência indexável/canônica, preservando `correlation_id` como chave de rastreamento.

### Cavalo e carretas

Há apenas uma `placa` plana na Station e ela é injetada em `Pesagem.contexto`; Ordens já puxadas consultam somente `contexto.placa`. Não há `placa_cavalo`, array de carretas, formulário, validação, indexação ou busca de placa de implemento. Evidências: [db.ts](/opt/lampp/htdocs/tara/station/src/lib/db.ts:70), [push.ts](/opt/lampp/htdocs/tara/station/src/lib/sync/push.ts:45), [page.tsx](/opt/lampp/htdocs/tara/station/src/app/(balanca)/pesagem/page.tsx:64).

O menor formato seguro é `Ordem.contexto.veiculo = { placa_cavalo, carretas: [{ placa }] }`, sem cadastro mestre. Na captura, um snapshot do mesmo conteúdo pode permanecer no contexto imutável da primeira Pesagem.

### Motorista

`PesagemLocal.motorista` é apenas `string | null`; a UI sempre grava `null`. O push o coloca no contexto JSON, e a Cloud não possui coluna ou schema de nome/documento do motorista. O contexto aceita JSON arbitrário, logo o backend não bloqueia um payload externo, mas não há suporte operacional na Station, validação ou busca. Evidências: [db.ts](/opt/lampp/htdocs/tara/station/src/lib/db.ts:71), [page.tsx](/opt/lampp/htdocs/tara/station/src/app/(balanca)/pesagem/page.tsx:260), [schemas.py](/opt/lampp/htdocs/tara/service/app/schemas.py:478).

O formato apropriado é contexto opaco da Ordem, com snapshot na captura: `motorista: { nome, documento: { tipo, numero } }`. `CNH`, `CPF`, `RG`, `OUTRO` devem ser vocabulário validado no contrato operacional, sem criar cadastro de motorista.

## 7. Dados complementares e limite fiscal

Produto, NF e observações não são requeridos por `WeighingIn`; a captura avulsa pode ocorrer sem eles. A UI trata “peso informado” como algo que pode vir de NF/motorista, mas não obriga NF. O teste de avulsa mostra que JSON contextual pode incluir `nota_fiscal` e CFOP, mas isso é apenas payload opaco; não representa modelo fiscal. Evidências: [schemas.py](/opt/lampp/htdocs/tara/service/app/schemas.py:478), [test_avulsa_e2e.py](/opt/lampp/htdocs/tara/service/tests/test_avulsa_e2e.py:103).

Há campos legados `produto_id`, `produto_tipo`, `numero_documento_fiscal` na projeção local, porém o pull os devolve fixamente nulos. Eles não devem ser usados como base para esta evolução. Evidências: [db.ts](/opt/lampp/htdocs/tara/station/src/lib/db.ts:32), [integrations.py](/opt/lampp/htdocs/tara/service/app/routes/integrations.py:893).

NF deve permanecer referência documental opaca, potencialmente múltipla em `Ordem.contexto.referencias_documentais[]`. Não há indício de dependência obrigatória de NF para captura. Não se recomenda, nesta plataforma, NF mãe/filhas, itens, CFOP, tributos, estoque ou conciliação peso-fiscal.

## 8. Reconciliação técnica e idempotência

### Casos A, B e C

| Caso | Estado atual | Lacuna |
| --- | --- | --- |
| A — Ordem não existe | Reconciliação manual pode usar `CRIAR_ORDEM`; contingência cria sombra. | O push normal não cria Ordem canônica a partir da operação local e não devolve mapeamento para a Station. |
| B — Ordem já existe | Reconciliação manual `VINCULADA` por UUID é possível. | Não existe busca/correlação automática por processo tipo+referência, nem continuidade automatizada da mesma operação. |
| C — conflito | `create_order` detecta conflito na mesma referência por cliente quando campos do pedido divergem. | Não compara composição/motorista e não gera um estado explícito de conflito para a operação local; não pode haver merge automático. |

`create_order` oferece uma base importante: a unicidade é `cliente_id + referencia_externa`, e a mesma solicitação é idempotente somente se correlação, sujeito, tipo e contexto forem idênticos; incompatibilidade gera `CONFLICT`. Evidência: [operation.py](/opt/lampp/htdocs/tara/service/app/operation.py:62).

Para o cenário alvo, a chave de criação deve incluir uma identidade estável da operação local (por exemplo `operation_local_id`/`correlation_id`) além da chave de negócio; `local_id` continua sendo identidade da **captura**, não da operação. O retorno do sync precisa mapear a operação local a um único `ordem_id`. Divergência de placa cavalo, carretas ou motorista deve resultar em `PENDENTE_RECONCILIACAO`/conflito explícito, com os snapshots preservados, nunca sobrescrever a primeira Pesagem.

Atualmente a idempotência da captura é sólida: `uq_TARA_pesagens_local` e `complete_weighing()` retornam a mesma Pesagem para o mesmo `tenant/local_id`; a autorização consumida só aceita repetição com o mesmo `local_id`. Evidências: [models.py](/opt/lampp/htdocs/tara/service/app/models.py:491), [operation.py](/opt/lampp/htdocs/tara/service/app/operation.py:306), [integrations.py](/opt/lampp/htdocs/tara/service/app/routes/integrations.py:805). Ela não resolve idempotência de criação/reconciliação de uma operação ainda inexistente.

## 9. Segunda passagem e mudança de composição

Para Ordem conhecida, a continuidade está implementada: o pull inclui `EM_PESAGEM` e etapas realizadas, Dexie calcula a próxima etapa, e a captura mantém o `ordem_id`. Isso atende `CHEGADA → POS_DESCARGA` para `DUPLA_ENTRADA_DESCARGA`. Contudo há uma incompatibilidade crítica para `DUPLA_SAIDA_CARREGAMENTO`: Station usa `PRE_CARREGAMENTO → SAIDA`, enquanto o backend aceita e calcula `CHEGADA → SAIDA`. A primeira captura enviada pela Station será rejeitada. Evidências: [db.ts](/opt/lampp/htdocs/tara/station/src/lib/db.ts:8), [operation.py](/opt/lampp/htdocs/tara/service/app/operation.py:24), [operation.py](/opt/lampp/htdocs/tara/service/app/operation.py:250).

Para operação criada avulsa, a própria UI bloqueia duas passagens, porque não possui `ordem_id` Cloud. Logo o cenário “primeira offline → sync → mesma Ordem EM_PESAGEM → segunda passagem” falha hoje.

Em Ordens existentes, placa só pode ser digitada nas primeiras etapas e vira contexto da Pesagem; não há edição da Ordem pela Station. Isso evita sobrescrita silenciosa na UI, mas não oferece comparação nem trilha de divergência entre passagens. O mecanismo mínimo seguro é comparar o snapshot da primeira captura com o contexto proposto na segunda; persistir a nova declaração como snapshot da segunda e abrir conflito/reconciliação, sem alterar o snapshot original ou a Pesagem.

## 10. Busca operacional (PRECAMPO-02)

PRECAMPO-02 corrigiu pull de `EM_PESAGEM`, etapas realizadas e busca local por `contexto.placa`, referência e campo NF legado. Isso continua válido para Ordens previamente baixadas. Evidências: [integrations.py](/opt/lampp/htdocs/tara/service/app/routes/integrations.py:862), [page.tsx](/opt/lampp/htdocs/tara/station/src/app/(balanca)/pesagem/page.tsx:55).

Gaps para este cenário: a busca não considera `veiculo.placa_cavalo`, qualquer item de `veiculo.carretas[]`, processo aninhado ou referências documentais múltiplas. Como é busca Dexie local, a adaptação pode ser local inicialmente; a projeção/pull deve carregar o contexto de Ordem suficiente.

## 11. Compatibilidade DEVICE-01, WEIGHING-CORE-01 e DELIVERY-01

Nada neste diagnóstico recomenda alterar os contratos consolidados:

- **DEVICE-01:** o fluxo atual exige `OfflineCaptureAuthorization`, instalação e DeviceConfiguration no push. Autorizações são emitidas somente para instalação/configuração ativas, e a autenticação bloqueia pull/reabastecimento em instalação substituída. O push admite drenagem com autorização já emitida e valida reaproveitamento por `local_id`; a futura operação local deve obrigatoriamente reutilizar esse mesmo caminho, sem gerar ou dispensar autorizações. Evidências: [integrations.py](/opt/lampp/htdocs/tara/service/app/routes/integrations.py:709), [integrations.py](/opt/lampp/htdocs/tara/service/app/routes/integrations.py:789), [test_block_01k.py](/opt/lampp/htdocs/tara/service/tests/test_block_01k.py:136).
- **WEIGHING-CORE-01:** a Pesagem permanece o fato imutável; o cálculo e as etapas canônicas continuam no serviço. A correção de divergência de vocabulário de etapas deve alinhar a Station à regra canônica, não reabrir sua semântica.
- **DELIVERY-01:** Ordem concluída cria `DeliveryReceipt`; Pesagem avulsa também já cria receipt. Pull/ACK e retenção/tombstone usam `pesagem_id`, portanto são preserváveis sem alteração semântica. Evidências: [operation.py](/opt/lampp/htdocs/tara/service/app/operation.py:342), [integrations.py](/opt/lampp/htdocs/tara/service/app/routes/integrations.py:982), [test_delivery_purge_e2e.py](/opt/lampp/htdocs/tara/service/tests/test_delivery_purge_e2e.py:69).

## 12. Matriz de aderência

| Requisito | Estado atual | Evidência | GAP | Severidade | Reuso possível |
| --- | --- | --- | --- | --- | --- |
| criar operação sem Ordem | PARCIAL | avulsa grava PesagemLocal nula | não há OperacaoLocal/Ordem local | P0 | PesagemLocal + queue |
| processo tipo+referência | FAIL | Ordem tem referência; UI avulsa não coleta | contrato/contexto operacional ausente | P0 | referencia_externa, correlation_id, contexto |
| placa cavalo | PARCIAL | `placa` plana opcional | sem semântica de cavalo/obrigatoriedade | P1 | contexto JSONB |
| múltiplas carretas | FAIL | nenhuma estrutura/UI/busca | array de implementos ausente | P1 | contexto JSONB |
| motorista nome | FAIL | campo string, UI envia null | sem captura estruturada | P1 | contexto JSONB |
| motorista tipo documento | FAIL | inexistente | contrato/UI ausentes | P1 | contexto JSONB |
| motorista nº documento | FAIL | inexistente | contrato/UI ausentes | P1 | contexto JSONB |
| produto opcional | PARCIAL | contexto aceita; pull legado é nulo | não há UX/enriquecimento Ordem | P2 | Ordem.contexto |
| NF opcional | PARCIAL | JSONB opcional; UI não captura | referência opaca não normalizada | P2 | Ordem.contexto |
| múltiplas referências documentais | FAIL | somente JSON arbitrário | sem formato/UI/busca | P2 | array no contexto |
| persistência Dexie | PASS | stores pesagens/fila/UUID | não persiste operação local | P0 para operação dupla | Dexie atual |
| primeira captura offline | PASS | grava local com auth antes do push | limitada à avulsa UNICA | P0 no cenário completo | fluxo atual |
| OfflineCaptureAuthorization | PASS | pool, consumo e validação Cloud | deve ser mantida para nova operação | — | integral |
| sync operação local | FAIL | push só cria Pesagem | não envia/cria operação/Ordem local | P0 | SyncQueue e push batch |
| criação Ordem Cloud | PARCIAL | API/reconciliação e contingência criam | não no retorno normal da Station | P0 | create_order |
| reconciliação com Ordem existente | PARCIAL | vínculo manual por UUID | sem matching/conflito operacional | P0 | reconcile_weighing |
| idempotência | PARCIAL | local_id captura; referência Ordem | falta chave de operação local | P0 | constraints existentes |
| continuidade segunda passagem | PARCIAL | funciona para Ordem puxada | avulsa é só UNICA | P0 | etapasFeitas/proximaEtapa |
| preservação mesma ordem_id | PARCIAL | Ordem conhecida preserva | operação criada offline não recebe/mapeia ID | P0 | ordem_id atual |
| mudança cavalo/carreta/motorista | FAIL | sem comparação/rastreio contextual | risco de inconsistência não sinalizada | P1 | snapshots de contexto |
| enriquecimento posterior | PARCIAL | Pesagem é imutável e reconcilia | não há update auditado de contexto Ordem | P1 | Ordem.contexto |
| busca placa cavalo | PARCIAL | busca `contexto.placa` | precisa chave canônica | P2 | filtro PRECAMPO-02 |
| busca placa carreta | FAIL | não percorre carretas | adaptar projeção/filtro | P2 | filtro Dexie |
| busca referência processo | PARCIAL | busca referencia_externa | tipo/referência local inexistentes | P1 | PRECAMPO-02 |
| Delivery após conclusão | PASS | Receipt/ACK/tombstone existentes | assegurar emissão apenas em conclusão canônica | — | Delivery atual |

## 13. GAPs priorizados

### P0 — impedem pesagem offline segura no cenário alvo

1. Ausência de `OperacaoLocal`/Ordem local durável que reúna contexto, `operation_local_id`, status e `ordem_id` Cloud anulável.
2. Avulsa limitada a `UNICA`; não pode conservar identidade e seguir para segunda passagem depois do sync.
3. Push normal não cria/reconcilia Ordem e não retorna mapeamento operação-local → `ordem_id`.
4. Processo tipo+referência obrigatório não é coletado/persistido no fluxo offline.
5. Idempotência cobre captura, mas não criação/retry da operação Cloud.

### P1 — impedem uso prático do piloto veicular

1. Sem composição cavalo + múltiplas carretas e motorista com documento.
2. Sem detecção/reconciliação explícita de mudança de veículo, implementos ou motorista entre passagens.
3. Sem mecanismo de enriquecimento posterior do contexto da Ordem.
4. Incompatibilidade Station/Cloud de etapa para `DUPLA_SAIDA_CARREGAMENTO`.
5. Busca por referência de processo só funciona para Ordem já canônica; não para operação local pendente.

### P2 — importantes, contornáveis no piloto assistido

1. Produto, NF e múltiplas referências documentais sem UX/formato canônico, embora possam ser JSON opaco.
2. Busca por placas de carreta e referências documentais.
3. Campos legados de produto/NF no pull retornados como `null` e potencialmente confusos.

### P3 — posterior

1. Revisão/auditoria de versões do contexto enriquecível da Ordem.
2. Índices especializados de JSONB, se a busca deixar de ser somente cache local/volume exigir.

## 14. Menor pacote seguro para uma eventual 01B

Sem criar entidades de negócio do ERP nem tocar DEVICE/Core/Delivery:

1. **Station/Dexie:** introduzir uma representação local de operação (pode estender a projeção local, mas deve ter `operation_local_id`, `ordem_id` anulável, `reconciliation_status`, processo, contexto e etapas). Não é nova entidade Cloud nem cadastro mestre. `PesagemLocal` referencia essa operação local e conserva seu próprio `local_id`.
2. **Contrato de operação offline:** adicionar ao fluxo de sync um envelope de operação com processo tipo/referência, `sistema_cliente`, `tenant_cliente_id`, `correlation_id`, tipo de pesagem e contexto opaco padronizado para cavalo/carretas, motorista e referências documentais. Usar vocabulários controlados extensíveis, não enums de domínio.
3. **Cloud:** reaproveitar `Ordem` como operação canônica; criar/reconciliar por identidade local + referência externa, retornando o `ordem_id` e gravando o mapeamento local. Se Ordem externa equivalente já existir, vincular somente sob equivalência segura; se contexto divergir, retornar conflito explícito sem merge.
4. **Continuidade:** após mapear a Ordem, atualizar somente a operação local e usar o mesmo `ordem_id` para segunda passagem. Preservar a primeira Pesagem e delegar etapa/cálculo ao vocabulário canônico já existente.
5. **Imutabilidade/enriquecimento:** manter snapshots nas Pesagens; colocar complementos posteriores em `Ordem.contexto` por rota auditável. Não editar Pesagem.
6. **Segurança e Delivery:** toda Pesagem continua exigindo a autorização pré-emitida de sua instalação/configuração; não criar um caminho de push alternativo. Delivery permanece disparado pela conclusão da Ordem.

## 15. Arquivos candidatos a alteração na fase 01B

Esta lista é prospectiva; nenhum arquivo foi modificado nesta auditoria.

- `station/src/lib/db.ts` — operação local, versões Dexie, índices e relação captura/operação.
- `station/src/app/(balanca)/pesagem/page.tsx` — formulário obrigatório mínimo, operação iniciada offline, continuidade e busca de contexto veicular.
- `station/src/lib/sync/push.ts` e `station/src/lib/sync/pull.ts` — envelope, retorno/mapeamento e reidratação.
- `station/src/lib/contingency.ts` — incluir a identidade/contexto da operação, mantendo assinatura.
- `service/app/schemas.py` — contratos explícitos e validação de vocabulário operacional.
- `service/app/routes/integrations.py` — sync de operação, resposta idempotente/conflito e pull.
- `service/app/operation.py` — criação/reconciliação transacional da Ordem sem alterar Pesagem física.
- `service/app/models.py` e migration nova, se for indispensável persistir a chave de operação local/reconciliação no servidor; decidir apenas no desenho 01B.
- `service/app/weighing_events.py` — somente se o envelope precisa expor contexto de Ordem consolidado, preservando o contrato Delivery vigente.
- `service/tests/test_avulsa_e2e.py`, novos testes Station e testes de sync/Device/Delivery.

## 16. Testes E2E necessários antes de GO

1. Offline sem Ordem: criar operação local de duas etapas, com processo, cavalo, duas carretas, motorista documentado e primeira captura autorizada.
2. Retry antes/depois de resposta perdida: uma Ordem Cloud e uma Pesagem por `local_id`.
3. Retorno de rede sem Ordem equivalente: criação canônica, mapeamento local e segunda passagem no mesmo `ordem_id`.
4. Retorno de rede com Ordem equivalente: vínculo sem duplicação e continuidade.
5. Conflitos de referência com cavalo/carreta/motorista divergentes: resposta explícita, sem merge e sem alteração da primeira captura.
6. `DUPLA_ENTRADA_DESCARGA` e `DUPLA_SAIDA_CARREGAMENTO` com as etapas canônicas exatamente alinhadas entre Station e Cloud.
7. Enriquecimento posterior com produto e duas referências NF: Pesagem, data, evidência, estação, instalação, configuração e operador inalterados.
8. Busca offline por cavalo, cada carreta e referência de processo.
9. DEVICE-01J/01K: auth ausente/expirada/reutilizada, instalação `REPLACED`, e drenagem autorizada sem permitir nova captura após substituição.
10. Delivery: conclusão → receipt `PENDENTE` → GET → ACK → `ACKNOWLEDGED` → retenção/purge/tombstone, para operação nascida offline.

## 17. Respostas objetivas

1. **Consegue iniciar pesagem offline sem Ordem?** Sim, mas somente Pesagem avulsa única, não a operação completa pedida.
2. **Qual fluxo real?** Botão avulsa → `PesagemLocal(ordem_id=null)` + autorização + fila → `sync/push` → Pesagem Cloud `NAO_RECONCILIADA` → reconciliação manual posterior.
3. **Menor GAP arquitetural?** Falta uma operação local idempotente, com contexto e mapeamento posterior para a Ordem Cloud; não apenas uma Pesagem local.
4. **Nova entidade?** Não é necessária nova entidade de domínio Cloud: `Ordem` pode ser a operação canônica. É necessária uma representação local persistente de operação (ou extensão inequívoca da store atual) antes da sincronização.
5. **Como preservar `ordem_id`?** Manter `operation_local_id` estável, receber e salvar uma única vez o `ordem_id` Cloud na operação local; as duas Pesagens referenciam essa mesma Ordem.
6. **Como evitar duplicidade se Ordem externa existe?** Chave de operação local para retry + unicidade existente cliente/referência; comparar contexto mínimo e vincular apenas se compatível, senão conflito explícito.
7. **Onde residem processo, veículo e motorista?** Contexto da Ordem; snapshots imutáveis na Pesagem de cada captura.
8. **Cavalo + múltiplas carretas?** Não hoje.
9. **Documento do motorista?** Não hoje.
10. **Produto/NF posteriores sem alterar Pesagem?** Arquiteturalmente sim em `Ordem.contexto`; falta rota/UX controlada.
11. **Há dependência indevida de NF?** Não; é opcional e o campo de pull é legado/nulo.
12. **PRECAMPO-02 precisa adaptar busca de carreta?** Sim.
13. **Alguma mudança necessária ameaça DEVICE/Core/Delivery?** Não se o pacote reutilizar autorização, imutabilidade, etapas canônicas e gatilho de Delivery; caminhos paralelos de captura seriam inaceitáveis.
14. **Menor pacote seguro?** O descrito na seção 14, priorizando operação local + sync/reconciliação idempotente antes de qualquer enriquecimento de UX.

## 18. Veredicto

**NO-GO**, exclusivamente para a prontidão arquitetural atual da implementação da operação iniciada offline. A base técnica permite uma implementação incremental e segura, mas os P0 impedem declarar o cenário obrigatório pronto sem a fase 01B devidamente desenhada, implementada e validada.
