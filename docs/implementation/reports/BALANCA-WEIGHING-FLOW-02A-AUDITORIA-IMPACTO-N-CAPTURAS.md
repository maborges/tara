# BALANCA-WEIGHING-FLOW-02A — Auditoria de Impacto para Operação com N Capturas

**Escopo:** auditoria somente de leitura do fluxo Ordem/Pesagem, Station,
sync/offline, cálculo de resultado e Delivery. Nenhuma alteração de código,
banco ou migration foi realizada.

## Resumo executivo

O modelo atual já representa uma operação com uma Ordem e várias Pesagens, mas
o contrato efetivo é limitado a uma captura por etapa e a, no máximo, uma ou
duas etapas conhecidas por `tipo_pesagem`. Portanto, há uma base útil para
`OPERAÇÃO → 1..N CAPTURAS`, porém não há suporte estrutural ao modelo alvo sem
alterar o vocabulário, a seleção de marcos oficiais e o cálculo consolidado.

O maior bloqueio é a combinação de:

- `tipo_pesagem` simultaneamente definindo modalidade, conjunto de etapas e
  etapa final;
- `VALID_STAGES_BY_TYPE`/`ETAPAS_POR_TIPO_PESAGEM` fechados em quatro tipos;
- `UNIQUE (ordem_id, etapa)`, que impede duas capturas do mesmo estágio;
- cálculo que conclui a Ordem na etapa final e publica um resultado por captura;
- ausência de finalidade, método de medição, natureza da operação e marcador
  de captura oficial.

O caminho recomendado é aditivo e compatível: preservar os tipos/etapas
legados, introduzir o novo vocabulário para novas operações, manter cada
Pesagem imutável e acrescentar uma camada de seleção de marcos/resultados. O
veredicto técnico é **GO COM RESSALVAS**.

## 1. Mapa do modelo atual

### 1.1 Ordem e `tipo_pesagem`

| Arquivo/componente | Comportamento atual | Dependência UNICA/DUPLA | Alteração necessária | Risco | Compatibilidade |
|---|---|---|---|---|---|
| `service/app/schemas.py` — `OrderIn` | `tipo_pesagem` é obrigatório e limitado a `UNICA`, `DUPLA`, `DUPLA_ENTRADA_DESCARGA`, `DUPLA_SAIDA_CARREGAMENTO`. | Alta: o tipo é o contrato de quantidade/sequência. | Separar modalidade (`UNICA`/`MULTIPLA`) da natureza da operação; manter literal legado para leitura/criação histórica e definir contrato novo para novas operações. | ALTO | Não revalidar registros históricos com o novo enum; compatibilidade explícita na leitura. |
| `service/app/models.py` — `Ordem.tipo_pesagem` | Coluna `VARCHAR(30) NOT NULL`; resultado consolidado fica em `peso_bruto_kg`, `peso_tara_kg`, `peso_liquido_kg`, `tara_source`. | Alta. Não há coluna de modalidade/natureza da operação nem coleção de marcos oficiais. | Acrescentar campos/camada de resultado, sem substituir imediatamente `tipo_pesagem`. | ALTO | Migration aditiva; valores antigos permanecem válidos. |
| `service/app/operation.py` — `FINAL_STAGE_BY_WEIGHING_TYPE` | Define `UNICA`, `SAIDA`, `POS_DESCARGA` como etapa que conclui a Ordem. | Alta. | Conclusão deve depender de operação/marcos oficiais, não de um único estágio fixo. | ALTO | Manter o mapa para tipos legados. |

Os tipos atuais são:

```text
UNICA                    → [UNICA]
DUPLA                    → [CHEGADA, SAIDA]
DUPLA_ENTRADA_DESCARGA   → [CHEGADA, POS_DESCARGA]
DUPLA_SAIDA_CARREGAMENTO → [CHEGADA, SAIDA]
```

### 1.2 Etapas e próxima captura

| Arquivo/componente | Comportamento atual | Dependência | Alteração necessária | Risco | Compatibilidade |
|---|---|---|---|---|---|
| `service/app/operation.py` — `VALID_STAGES_BY_TYPE` | Rejeita qualquer etapa fora do conjunto do tipo antes de persistir. | Alta; não aceita `PRE_OPERACAO`, `INTERMEDIARIA`, `POS_OPERACAO` ou `FINALIDADE/MÉTODO`. | Introduzir vocabulário novo versionado por modalidade/natureza; deixar conjuntos antigos ativos para ordens antigas. | ALTO | Não alterar a validação de ordens legadas. |
| `station/src/lib/db.ts` — `ETAPAS_POR_TIPO_PESAGEM` | Arrays ordenados fixos; `proximaEtapa` retorna a primeira etapa não realizada. | Alta; impede N capturas e qualquer repetição de estágio. | Permitir sequência/captura livre no modo `MULTIPLA`, com regras de marco oficial separadas da ordem temporal. | ALTO | Continuar usando arrays atuais para ordens legadas. |
| `station/src/lib/db.ts` — `etapasFeitas`/`etapasFeitasOperacao` | Combina etapas em `Set<Etapa>`, colapsando repetições. | Alta para conferência e intermediárias. | Armazenar/consultar capturas por `local_id`/identidade e não somente por etapa. | ALTO | Dados locais existentes continuam legíveis; nova versão Dexie deve ser aditiva. |
| `service/app/routes/integrations.py` — `GET /stations/sync/pull` | Envia somente `etapas_realizadas: list[str]` por Ordem. | Média/alta; não informa IDs, finalidade ou qual captura é oficial. | Acrescentar metadados de captura/marco sem remover `etapas_realizadas`. | MÉDIO | Clientes antigos continuam consumindo a lista legada. |

### 1.3 Captura física, unicidade e imutabilidade

| Arquivo/componente | Comportamento atual | Dependência | Alteração necessária | Risco | Compatibilidade |
|---|---|---|---|---|---|
| `service/app/models.py` — `Pesagem.__table_args__` | `UNIQUE (tenant_id, local_id)` e `UNIQUE (ordem_id, etapa)`. A primeira preserva idempotência física; a segunda limita uma captura por etapa. | Alta para conferência e N capturas no mesmo estágio. | Não remover a constraint sem mecanismo substituto: introduzir identidade/ordem da captura, categoria/finalidade e um marcador/registro de marco oficial; definir unicidade compatível com o novo contrato. | ALTO | Preservar `local_id`; tratar a constraint antiga para ordens legadas ou migrá-la de forma controlada. |
| `service/migrations/001_service_tables.sql`, `011_pesagem_avulsa.sql` | A tabela nasceu com `ordem_id NOT NULL`; `011` tornou-o anulável para capturas avulsas. | Baixa para N, alta para compatibilidade de avulsas. | Nenhuma transformação necessária para esse ponto; novas colunas devem ser nullable/default para histórico. | MÉDIO | Capturas com `ordem_id NULL` já são válidas; em PostgreSQL a constraint de etapa não impede múltiplas linhas avulsas com `NULL`. |
| `service/migrations/019_pesagem_immutability.sql` | Trigger impede apagar/alterar o fato físico, incluindo etapa, pesos, evidência, direção e contexto. | Baixa: é requisito a preservar. | Manter trigger; atributos de classificação devem ser definidos na criação ou ter registro separado de decisão oficial, sem editar o fato. | ALTO se alterado | Compatibilidade obrigatória: imutabilidade, `local_id`, Station/Installation/Device e evidência permanecem. |

### 1.4 Direção, natureza, finalidade e método

`direcao_veiculo` está em `Pesagem`/`WeighingIn` como `ENTRADA | SAIDA | NULL`,
com `VARCHAR(10)` no banco. Não existe `INTERNA`. `natureza_mercadoria` é um
campo independente `ENTRADA | SAIDA | NEUTRA`. A Station mantém ambos no tipo
`PesagemLocal` e o `sync/push` os encaminha.

Não há hoje campos para:

- natureza da operação (`RECEBIMENTO`, `EXPEDICAO`, `TRANSFERENCIA`,
  `DEVOLUCAO`, `OUTRA`);
- modalidade `MULTIPLA` distinta de `tipo_pesagem`;
- finalidade (`OPERACIONAL`, `CONFERENCIA`, `AMOSTRAGEM`);
- método (`ESTATICA`, `DINAMICA`, `POR_EIXO`);
- indicação de captura oficial de PRE/POS ou vínculo de conferência.

Impacto: **ALTO** no core e **MÉDIO** na Station/Dexie. A direção atual pode ser
preservada como compatibilidade; não deve ser reutilizada para representar
natureza, finalidade ou estágio.

## 2. Cálculo atual versus regra alvo

### 2.1 Implementação atual

`service/app/operation.py::_compute_order_result` faz:

- `UNICA`: `bruto = peso_aferido` e `tara = peso_tara_kg` informada; líquido é
  `bruto - tara` (ou zero quando tara ausente); `tara_source` é
  `CLIENT_PROVIDED`/`NONE`.
- `DUPLA_ENTRADA_DESCARGA`: usa `CHEGADA` como bruto e `POS_DESCARGA` como
  tara; rejeita `bruto <= tara`.
- `DUPLA_SAIDA_CARREGAMENTO`: usa `CHEGADA` como tara e `SAIDA` como bruto;
  rejeita `bruto <= tara`.
- `DUPLA`: usa `max()` como bruto e `min()` como tara, sem semântica física de
  natureza/marco.

O cálculo ocorre quando chega a etapa final. A Ordem passa a `CONCLUIDA`, os
campos consolidados são gravados, e um evento/outbox e um `DeliveryReceipt` são
criados. Não há `abs()` nos dois tipos direcionais; a inversão é rejeitada.

### 2.2 Lacunas em relação ao alvo

O alvo exige PRE/POS oficiais, cálculo orientado por natureza da operação e
exclusão de CHEGADA/SAIDA do resultado comercial quando PRE/POS existirem. O
código atual não possui `PRE_OPERACAO`/`POS_OPERACAO` oficiais, não distingue
captura oficial de conferência, não calcula métricas CHEGADA→PRE/POS→SAIDA e
não guarda histórico de versões do resultado.

Para `UNICA`, a ideia de tara confiável é parcialmente compatível: o campo
`peso_tara_kg` e `tara_source` já existem no resultado da Ordem. Contudo,
`tara_source` só distingue `CLIENT_PROVIDED`, `MEASURED` e `NONE`; não existe
referência de origem confiável/cadastro, nem vínculo da tara a uma captura ou
fonte externa. Preservá-lo como compatibilidade é possível, mas a futura
modelagem deve ampliar sua semântica sem sobrescrever o histórico.

## 3. Station, Dexie, sync e operação offline

| Área/arquivo | Comportamento atual | Impacto no N capturas | Risco | Compatibilidade necessária |
|---|---|---|---|---|
| `station/src/app/(balanca)/pesagem/page.tsx` | Escolhe a próxima etapa a partir de `tipo_pesagem` e etapas já feitas; grava uma `PesagemLocal` por captura; operação nova cria `OperacaoLocal`. | A UI não oferece capturas repetidas/intermediárias nem finalidade/método/oficialidade. | ALTO | Preservar as capturas já gravadas e o vínculo `operation_local_id`. |
| `station/src/lib/db.ts` versão 9 | `PesagemLocal` possui `local_id`, `operation_local_id`, `tipo_pesagem`, `etapa`, pesos, evidência e contexto; `OperacaoLocal` possui tipo e `etapas_realizadas`. | Estrutura permite muitas linhas, mas índices e helpers tratam etapas como conjunto e a UI limita a sequência fixa. | ALTO | Nova versão Dexie aditiva; nunca reutilizar `local_id` nem perder filas. |
| `station/src/lib/sync/push.ts` | Envia cada captura, `operation_local_id`, `tipo_pesagem`, `etapa`, dados físicos e `operacao`; a resposta mapeia operação local para uma Ordem. | Pode transportar N linhas individualmente, mas não transporta finalidade/método/marco oficial e pressupõe o tipo atual. | MÉDIO/ALTO | Manter autorização por captura, idempotência e mapeamento explícito. |
| `service/app/routes/integrations.py::post_sync` | Valida Installation, DeviceConfiguration, `OfflineCaptureAuthorization`, replay por `local_id`, resolve/cria Ordem e chama `complete_weighing`. | O ponto de entrada suporta várias capturas, mas cada etapa repetida colide na constraint e cada final pode concluir/publicar. | ALTO | Não alterar DEVICE, challenge/proof, autorizações ou replay; ampliar somente o envelope de captura/operação. |
| `docs/implementation/reports/BALANCA-OFFLINE-OP-01B-IMPLEMENTACAO-OPERACAO-PESAGEM-OFFLINE.md` | O fluxo cria uma operação local, cria uma única Ordem canônica e usa segunda passagem para o mesmo `ordem_id`; tipo atual determina a segunda etapa. | É preservável, mas a suposição “primeira/segunda passagem” e o estado `CONCLUIDA` precisam ser mantidos como compatibilidade legada. | ALTO | `operation_local_id → ordem_id`, `local_id`, autorizações e contexto devem continuar invariantes. |
| `station/src/lib/contingency.ts` / `service/app/contingency_service.py` | Pacote v2 transporta registros individuais com tipo, etapa e `operation_local_id`; importador cria Ordem sombra quando necessário. | N capturas podem ser empacotadas, mas o schema não transporta finalidade/método/marco e importação ainda chama a lógica atual. | MÉDIO/ALTO | Manter assinatura, sequência, identidade da Station e importação idempotente; evolução de schema deve ser aditiva. |

## 4. Conferência e capturas intermediárias

Hoje uma segunda captura do mesmo estágio não é representável para uma Ordem:
`UNIQUE (ordem_id, etapa)` rejeita-a, e a Station ainda deduplica etapas em
`Set`. Também não há distinção persistida entre captura original, conferência
e captura oficial.

O mecanismo substituto a avaliar antes de remover a constraint deve separar:

1. identidade física imutável (`local_id`);
2. classificação da captura (finalidade, método, estágio e direção);
3. relação da captura com o marco (por exemplo, uma decisão/ponteiro oficial
   por operação e estágio, com autor e timestamp);
4. regra de unicidade somente para o apontamento oficial, não para o fato
   físico bruto.

Esse desenho permite `INTERMEDIARIA #1..N` e múltiplas conferências sem apagar
capturas. A escolha do marco oficial deve ser explícita; não deve ser deduzida
por `max()`, `min()`, ordem de chegada ou `abs()`.

## 5. Eventos, Delivery, ACK e retenção

`service/app/weighing_events.py` publica `balanca.pesagem.concluida.v1` com um
`capture_id`, `etapa`, peso aferido e resultado (`peso_bruto_kg`,
`peso_tara_kg`, `peso_liquido_kg`, `tara_source`). O evento é construído para
uma Pesagem; no fluxo vinculado, só é gerado na etapa final atual. Para avulsa,
é gerado imediatamente.

`DeliveryReceipt` tem unicidade `(tenant_id, pesagem_id)`; `/delivery/pending`,
ACK, purge e tombstone operam por Pesagem, não por Ordem. Isso permite manter
DEVICE e DELIVERY inalterados na primeira evolução, desde que o novo payload
continue identificando a captura e o resultado consolidado seja versionado ou
publicado por um evento próprio. Alterar o significado do evento v1 para
“resultado final da operação N” seria breaking para consumidores; recomenda-se
preservar v1 para capturas legadas e introduzir contrato/versionamento novo para
resultado consolidado.

## 6. Migrations e dados históricos

Migrations relevantes:

- `001_service_tables.sql`: cria `ordens`, `pesagens` e a constraint
  `(ordem_id, etapa)`;
- `011_pesagem_avulsa.sql`: permite `ordem_id NULL` e adiciona contexto,
  direção, natureza e estado de reconciliação;
- `019_pesagem_immutability.sql`: protege o fato físico;
- `033_ordem_resultado_fisico.sql`: adiciona bruto, tara e `tara_source`;
- `038_offline_operation_identity.sql`: adiciona identidade aditiva da
  operação offline em Ordem.

Não há necessidade de transformar registros históricos em quatro etapas. Eles
podem continuar com `tipo_pesagem` e etapas atuais, desde que:

- as APIs aceitem e devolvam o contrato legado;
- o novo código selecione o modo legado quando a Ordem não tiver os novos
  atributos;
- constraints, eventos e cálculo históricos não sejam reinterpretados;
- qualquer novo campo seja nullable/default ou preenchido somente para novas
  operações.

Classificação: **migration aditiva** para o primeiro corte. Uma mudança
breaking só aparece se o sistema substituir `tipo_pesagem`, renomear etapas,
alterar o significado do evento v1 ou remover a constraint sem compatibilidade.
Não foi identificada necessidade de transformação de dados históricos nesta
auditoria.

## 7. Testes que codificam o modelo atual

Os testes diretamente relevantes são:

- `service/tests/test_service_e2e.py`: Ordem `UNICA`, Ordem `DUPLA`, primeira
  etapa em andamento e conclusão na segunda;
- `service/tests/test_avulsa_e2e.py`: operação offline
  `DUPLA_ENTRADA_DESCARGA`, retry por `local_id`, segunda captura e resultado
  `27000.000`;
- `service/tests/test_weighing_calculation.py`: inversões físicas rejeitadas,
  cálculo de recebimento/expedição e `DUPLA` genérica por max/min;
- `service/tests/test_contingency_import.py`: pacote v1/v2 com `UNICA`/`UNICA`
  e idempotência do pacote;
- `service/tests/test_delivery_receipt_e2e.py` e testes de purge: Delivery por
  `pesagem_id`, ACK e retenção.

Não foram encontrados testes de browser da Station para N capturas. Os testes
existentes codificam explicitamente a sequência e os tipos atuais, portanto
precisarão de uma camada de casos de compatibilidade e de novos casos para
repetição, intermediárias, conferência e marcos oficiais.

## 8. Matriz final

| Área | Impacto | Risco | Breaking? |
|---|---|---|---|
| Banco/ORM | Novos atributos de operação/captura/marco e revisão controlada da unicidade por etapa. | ALTO | Não, se aditivo e compatível. |
| Core | Separar modalidade/natureza, validar novos estágios e consolidar PRE/POS sem `abs()`. | ALTO | Não para legados; contrato novo necessário. |
| Station | UI e sequência deixam de depender de uma lista fixa; permitir N capturas. | ALTO | Não, preservando o modo legado. |
| Dexie | Novos campos/índices e helpers que não colapsem capturas por estágio. | ALTO | Não, com nova versão Dexie. |
| Sync | Transportar finalidade, método, marco e identidade sem alterar autorizações/retry. | MÉDIO/ALTO | Não, com envelope aditivo. |
| Offline Operation | Preservar `operation_local_id → Ordem` e múltiplos `local_id` por operação. | ALTO | Não, mantendo OFFLINE-OP-01B como modo legado. |
| Device | Nenhuma alteração necessária ao fluxo de Installation, DeviceConfiguration ou Bridge proof/challenge. | BAIXO | Não. |
| Delivery | Pode permanecer por captura; resultado consolidado exige payload/evento versionado. | MÉDIO | Não se v1 for preservado. |
| Eventos/API | Novos campos e contrato de resultado/marcos; não reutilizar v1 com semântica incompatível. | ALTO | Sim apenas se alterar v1; evitável. |
| Dados históricos | Permanecem com tipos/etapas atuais e cálculo já persistido. | BAIXO/MÉDIO | Não. |
| Testes | Adicionar compatibilidade e casos N, conferência, intermediárias e inversão. | MÉDIO | Não. |

## 9. Decisão obrigatória

1. **O modelo atual suporta N capturas sem mudança estrutural?** Não. A tabela
   aceita várias Pesagens em termos gerais, mas a unicidade por etapa, a lista
   fixa de etapas e o cálculo/conclusão por tipo limitam o comportamento a uma
   ou duas capturas sem repetição.
2. **O que impede isso hoje?** `tipo_pesagem` sobrecarregado, vocabulário
   fechado, `UNIQUE (ordem_id, etapa)`, `Set`/`proximaEtapa` na Station, ausência
   de finalidade/método/marco oficial e cálculo final orientado por etapa.
3. **É possível fazer evolução aditiva preservando operações históricas?** Sim.
   Manter os quatro tipos legados e introduzir um modo novo para novas Ordens é
   tecnicamente viável.
4. **Menores passos seguros:** (a) especificar contrato de operação/marcos e
   compatibilidade; (b) adicionar vocabulário e campos sem remover legados;
   (c) registrar N capturas imutáveis sem colapsar estágio; (d) criar seleção
   explícita de marco oficial; (e) implementar cálculo PRE/POS e métricas
   auxiliares; (f) evoluir Station/sync; (g) versionar evento/resultado e
   adicionar testes de compatibilidade antes de alterar Delivery.
5. **DEVICE e DELIVERY podem permanecer inalterados?** Sim, no primeiro corte.
   DEVICE não participa do domínio de cálculo. DELIVERY pode continuar por
   captura, desde que novos resultados não mudem silenciosamente o significado
   do evento v1.
6. **OFFLINE-OP-01B pode ser preservado sem regressão?** Sim, como caminho
   legado/compatível: `operation_local_id`, `local_id`, autorizações,
   reconciliação e contexto permanecem. A implementação nova deve aceitar o
   fluxo atual de primeira/segunda passagem até que a nova modalidade esteja
   disponível.

**Próximo passo:** **GO COM RESSALVAS** — viável tecnicamente, condicionado à
definição do mecanismo de marcos oficiais e da substituição segura da unicidade
por `(ordem_id, etapa)`; não iniciar removendo a constraint nem alterando o
evento v1.
