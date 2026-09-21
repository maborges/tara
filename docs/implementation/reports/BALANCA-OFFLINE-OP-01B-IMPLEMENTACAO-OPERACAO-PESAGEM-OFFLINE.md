# BALANCA-OFFLINE-OP-01B — Implementação da Operação de Pesagem Iniciada Offline

**Data:** 2026-09-20  
**Veredicto:** **GO COM RESSALVAS**

## 1. Resumo executivo

Foi implementado o caminho normal de operação veicular criada pela Station sem Ordem previamente recebida: a Station cria uma `OperacaoLocal` durável, captura com `local_id` próprio e autorização offline existente, e o push cria ou vincula uma única `Ordem` canônica. A resposta mapeia deterministicamente `operation_local_id → ordem_id`; a próxima captura usa a mesma Ordem e um novo `local_id`.

Não foram criados cadastros de veículo, carreta, motorista, produto, NF, Pedido ou Romaneio. A Ordem permanece a única operação canônica Cloud. Não houve alteração da imutabilidade da Pesagem, do fluxo DEVICE nem da semântica Delivery.

## 2. Decisão arquitetural e identidades

`OperacaoLocal` é uma store Dexie, não uma entidade Cloud. Ela contém `operation_local_id`, `ordem_id` anulável, estado, tipo de pesagem, processo, contexto e etapas. Cada `PesagemLocal` recebe também `operation_local_id`, mantendo `local_id` exclusivo por captura. A Ordem Cloud ganhou apenas a coluna aditiva e índice único parcial `operation_local_id`, indispensáveis para tornar retries de criação determinísticos.

Estados locais implementados: `PENDENTE_SYNC`, `SINCRONIZANDO`, `MAPEADA`, `EM_PESAGEM`, `CONCLUIDA`, `PENDENTE_RECONCILIACAO` e `ERRO_SYNC`. O fluxo atualmente usa `PENDENTE_SYNC`, `EM_PESAGEM`, `CONCLUIDA` e `PENDENTE_RECONCILIACAO`; os demais permanecem reservados para evolução de UI/telemetria sem ambiguidade de contrato.

## 3. Arquivos alterados

- `station/src/lib/db.ts`: store Dexie `operacoes` (versão 9), vínculo `operation_local_id` na Pesagem e etapas por operação; corrigida a Station para `DUPLA_SAIDA_CARREGAMENTO: CHEGADA → SAIDA`.
- `station/src/app/(balanca)/pesagem/page.tsx`: formulário de nova operação com processo, tipo, cavalo, carretas e motorista/documento; persistência antes da primeira captura; lista/busca de operações locais; contexto bloqueado após a captura para evitar mudança silenciosa.
- `station/src/lib/sync/push.ts`: envelope `operacao`, retorno de mapeamento, atualização local de `ordem_id` e tratamento de conflito explícito.
- `station/src/lib/contingency.ts`: pacote preserva `operation_local_id` e contexto da operação.
- `service/migrations/038_offline_operation_identity.sql`: coluna aditiva e índice único parcial em `tara.ordens`.
- `service/app/models.py`, `schemas.py`, `operation.py`, `routes/integrations.py`, `contingency_service.py`: contrato, validação, resolução transacional/idempotente e preservação na contingência.
- `service/tests/test_avulsa_e2e.py`: E2E de operação offline, retry, segunda passagem e conflito.

## 4. Contrato de sync, idempotência e reconciliação

O payload de uma captura de operação contém `operacao` com `operation_local_id`, processo, `referencia_externa`, `correlation_id`, tipo, cavalo/carretas, motorista/documento e contexto. A Cloud:

1. procura Ordem por `(tenant_id, operation_local_id)`;
2. se não encontrar, procura uma única Ordem pela referência externa no tenant;
3. só vincula Ordem existente se tipo, sujeito e contexto mínimo (processo, veículo completo e motorista) forem equivalentes;
4. em divergência devolve `CONFLICT`, sem consumir/mesclar contexto e sem alterar Pesagem;
5. se não há equivalente, cria uma Ordem canônica e registra `operation_local_id`;
6. cria a Pesagem usando o contexto da Ordem como snapshot imutável e devolve `ordem_id`.

`tenant_id/local_id` continua sendo a idempotência de cada fato físico; `tenant_id/operation_local_id` é a idempotência da operação. A constraint de referência já existente continua protegendo criação por cliente. A Station não infere IDs por busca textual: grava o retorno explícito do push.

## 5. Contexto operacional, snapshots e conflitos

O formulário exige processo tipo/referência, placa do cavalo, nome do motorista, tipo e número de documento. Carretas são opcionais e repetíveis. Placas são normalizadas para comparação e busca sem hífens; a estrutura continua contexto JSONB, sem cadastro mestre.

Cada captura enviada recebe o contexto da Ordem como snapshot em `Pesagem.contexto`. A trigger existente mantém esse JSON, peso, etapa, horário, Station, Installation, DeviceConfiguration, operador e leitura física imutáveis. Depois da primeira captura, a Station bloqueia edição do contexto: mudança de cavalo, carreta ou motorista exige reconciliação explícita, prevenindo sobrescrita silenciosa. Não foi criada resolução comercial automática de divergência.

Produto, NF, observações e referências documentais permanecem complementares e opcionais. Nenhuma modelagem fiscal, de NF mãe/filha, CFOP, estoque ou conciliação fiscal foi introduzida.

## 6. Segunda passagem, busca e etapas

Após o mapeamento, `OperacaoLocal.ordem_id` é persistido. A segunda passagem cria novo `local_id`, preserva a primeira captura e usa o mesmo UUID da Ordem. `DUPLA_ENTRADA_DESCARGA` usa `CHEGADA → POS_DESCARGA`; a Station foi corrigida para refletir o Core em `DUPLA_SAIDA_CARREGAMENTO: CHEGADA → SAIDA`, removendo o uso operacional de `PRE_CARREGAMENTO`.

A busca local agora considera referência de processo, referência externa, placa do cavalo e qualquer carreta para operações locais, preservando a busca PRECAMPO-02 de Ordens já puxadas e a compatibilidade temporária com `contexto.placa` legado.

## 7. Segurança, contingência e Delivery

Criar `OperacaoLocal` não cria nem libera autorização. A primeira e segunda capturas continuam consumindo `OfflineCaptureAuthorization`; o push continua validando instalação, configuração e replay por `local_id`. Instalação `REPLACED` não recebe novas autorizações, e o comportamento de drenagem previamente autorizado não foi modificado.

A contingência não é o caminho principal: apenas preserva a nova identidade/contexto quando exportada. O importador segue assinado e validado. Ao concluir a Ordem, o fluxo existente cria `DeliveryReceipt`; GET, ACK, retenção e tombstone permanecem inalterados.

## 8. Migration aplicada

Foi aplicada no banco de desenvolvimento configurado pelo projeto:

```text
psql ... -f migrations/038_offline_operation_identity.sql
ALTER TABLE
CREATE INDEX
```

É aditiva e não destrutiva.

## 9. Testes executados e resultados reais

| Comando | Resultado |
| --- | --- |
| `pnpm --dir station run typecheck` | PASS |
| `pnpm --dir station run lint` | PASS |
| `pnpm --dir station run build` | PASS |
| `.venv/bin/python -m py_compile ...` (módulos alterados) | PASS |
| `.venv/bin/python -m pytest tests/test_avulsa_e2e.py -q` | PASS — 1 passed |
| `.venv/bin/python -m pytest tests/test_block_01k.py tests/test_block_01f.py tests/test_weighing_calculation.py tests/test_delivery_receipt_e2e.py tests/test_delivery_purge_e2e.py -q` | PASS — 7 passed |

O E2E novo cobre: operação `ROMANEIO`, duas carretas, motorista CNH, primeira captura de dupla entrada/descarga, criação de uma única Ordem, retry da resposta perdida, segunda captura com o mesmo `ordem_id`, resultado físico, vínculo a Ordem equivalente pré-existente e conflito por cavalo divergente.

## 10. GAPs e riscos remanescentes

1. A UI bloqueia alteração contextual entre passagens e encaminha o caso para reconciliação; ainda não há tela de resolução humana de conflito. Isso é seguro, mas é uma evolução operacional posterior.
2. Produto, NF múltipla, observações e enriquecimento controlado de `Ordem.contexto` não foram implementados porque não bloqueiam o fluxo e não devem ampliar este escopo.
3. A validação E2E de busca Dexie é coberta por typecheck/lint e implementação de filtro; não há uma suíte de browser da Station no repositório.
4. `git diff --check` continua apontando whitespace pré-existente em `station/src/app/globals.css`, fora deste escopo.

## 11. Estados do programa

Esta implementação não altera automaticamente os estados consolidados: FUNDAÇÃO TÉCNICA continua CONCLUÍDA, READINESS TÉCNICO continua GO, PRECAMPO-02 continua GO, PILOT-02 segue AGUARDANDO EXECUÇÃO EM CAMPO e PILOT-02A segue AGUARDANDO EQUIPAMENTO FÍSICO. Não foi iniciado piloto físico.
