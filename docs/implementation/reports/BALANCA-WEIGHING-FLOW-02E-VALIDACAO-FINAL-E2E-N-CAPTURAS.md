# BALANCA-WEIGHING-FLOW-02E — Validação Final E2E N Capturas

## Escopo

Validação final do fluxo entregue em 02B, 02C e 02D:

`OPERAÇÃO → N CAPTURAS → MARCOS → RESULTADO → OFFLINE/SYNC → HISTÓRICO`.

Não houve alteração de código, migration, banco estrutural, Device, Delivery ou
UX nesta fase.

## Cenários E2E A–G

Foi executado um script isolado contra o banco de desenvolvimento, usando tenant
e IDs novos, sem seleção automática por última captura, maior/menor peso ou
`abs()` no motor.

| Cenário | Evidência | Resultado |
|---|---|---|
| A — Recebimento mínimo | PRE `42.250`, POS `15.200`; dois `local_id` distintos; marcos PRE/POS automáticos; histórico presente | PASS — bruto `42.250`, tara `15.200`, líquido `27.050`, `MEASURED`, `VALIDO`, Ordem `CONCLUIDA` |
| B — Recebimento completo | CHEGADA `42.300`, PRE `42.250`, INTERMEDIARIA `30.000`, POS `15.200`, SAIDA `15.150`; marcos auxiliares explícitos | PASS — líquido `27.050`, delta pré `-50`, delta pós `-50`, cinco Pesagens preservadas |
| C — Expedição | PRE `15.200`, POS `42.250` | PASS — tara `15.200`, bruto `42.250`, líquido `27.050` |
| D — N capturas | PRE, três INTERMEDIARIAS e POS | PASS — cinco Pesagens persistidas, cinco `local_id` únicos, três etapas INTERMEDIARIA, resultado derivado somente de PRE/POS |
| E — Conferência | PRE #1 operacional, PRE #2 conferência, depois troca explícita do marco | PASS — #1 e #2 imutáveis, resultado recalculado, versão incrementada, histórico anterior preservado |
| F — Offline completo | Operação local MULTIPLA, PRE, INTERMEDIARIA, POS, retry e sincronização posterior | PASS — coberto pelo E2E `test_avulsa_e2e.py`, com uma Ordem, `operation_local_id` estável, `local_id` por captura, autorizações e resultado no pull |
| G — Falhas físicas | RECEBIMENTO PRE ≤ POS e EXPEDICAO POS ≤ PRE | PASS — inversões rejeitadas, projeção válida anterior preservada e evidência física não alterada |

O cenário de conferência comprovou que a captura repetida não substitui
automaticamente o marco: a substituição somente ocorreu pela chamada explícita
de troca de marco.

## Cenários H–J e regressão

Suítes direcionadas executadas:

```text
PYTHONPATH=. .venv/bin/pytest -q \
  tests/test_weighing_result_engine.py \
  tests/test_weighing_flow_foundation.py \
  tests/test_avulsa_e2e.py \
  tests/test_weighing_events.py \
  tests/test_weighing_calculation.py \
  tests/test_service_e2e.py \
  tests/test_delivery_receipt_e2e.py \
  tests/test_delivery_purge_e2e.py
```

Resultado: **12 passed**.

- H — `UNICA`, `DUPLA`, `DUPLA_ENTRADA_DESCARGA`, `DUPLA_SAIDA_CARREGAMENTO`, operação avulsa e OFFLINE-OP-01B: PASS.
- I — StationInstallation, DeviceConfiguration, OfflineCaptureAuthorization, challenge/proof e replay protection: PASS nos fluxos direcionados de `test_service_e2e.py` e `test_avulsa_e2e.py`.
- J — DeliveryReceipt pending, ACK, ACK idempotente, retenção, purge e tombstone: PASS em `test_delivery_receipt_e2e.py` e `test_delivery_purge_e2e.py`.
- Evento `balanca.pesagem.concluida.v1`: PASS em `test_weighing_events.py`; sua semântica não foi alterada.

## Station

```text
pnpm run typecheck   # PASS
pnpm run lint        # PASS
pnpm run build       # PASS
```

O build produziu as rotas esperadas da Station, incluindo `/pesagem` e o proxy
dinâmico da API.

## Banco e migrations

Foi feita somente inspeção, sem aplicar nova migration. O banco confirmou:

- `tara.pesagem_marcos_oficiais` e `tara.ordem_resultados_historico` existentes;
- colunas aditivas de natureza/modalidade, dimensões da Pesagem e projeção do resultado;
- RLS e `FORCE ROW LEVEL SECURITY` ativos em `pesagens`, marcos oficiais e histórico;
- política de tenant em todas essas tabelas;
- unicidade física `tenant_id + local_id`;
- unicidade de marco `(tenant_id, ordem_id, etapa)`;
- unicidade de histórico `(tenant_id, ordem_id, versao)`;
- índices de consulta por ordem/etapa e histórico versionado;
- trigger de imutabilidade da Pesagem;
- trigger de repetição de etapa somente para `MULTIPLA`;
- trigger de consistência do marco com mesma Ordem/tenant/etapa;
- índice parcial de `operation_local_id` por tenant.

As migrations 039 e 040 estão refletidas nos objetos acima. Não foi removida a
unicidade `tenant_id + local_id`, nem foram transformados registros históricos.
A compatibilidade histórica foi comprovada pelos testes de fundação e legado
com os campos novos opcionais.

## Classificação de achados

Não foram encontrados achados **BLOQUEANTE** ou **ALTO**.

### Observações não bloqueantes

- **OBSERVAÇÃO:** a validação offline foi feita pelo E2E de sync/backend e pelo
  contrato Dexie/Station; não foi executado browser automation com corte físico
  de rede.
- **OBSERVAÇÃO:** `TRANSFERENCIA`, `DEVOLUCAO` e `OUTRA` continuam pendentes de
  regra comercial, conforme decisão do 02C/02D.
- **OBSERVAÇÃO:** o evento consolidado permanece fora do escopo; o evento v1
  continua preservado.
- **OBSERVAÇÃO:** a Station não baixa o conjunto completo de marcos oficiais;
  troca explícita exige captura sincronizada e usa o endpoint seguro do Core.

Nenhuma observação impede o fechamento técnico do modelo N-capturas.

## Veredicto

**BALANCA-WEIGHING-FLOW-02E STATUS: CONCLUÍDO**

**VALIDAÇÃO FINAL: GO COM RESSALVAS**

**MODELO N-CAPTURAS: TECNICAMENTE ENCERRADO**
