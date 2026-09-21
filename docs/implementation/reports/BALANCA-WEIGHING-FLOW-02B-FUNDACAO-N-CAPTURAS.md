# BALANCA-WEIGHING-FLOW-02B — Fundação do Modelo N Capturas

**Status:** implementação concluída nesta fase. O fluxo completo da Station,
o cálculo comercial PRE/POS e o evento de resultado consolidado permanecem fora
do escopo.

## 1. Arquivos alterados

- `service/migrations/039_weighing_flow_foundation.sql`: migration aditiva para os novos atributos, repetição de estágio em operações `MULTIPLA` e marcos oficiais com RLS.
- `service/app/models.py`: campos aditivos em `Ordem` e `Pesagem` e o modelo `MarcoPesagemOficial`.
- `service/app/schemas.py`: contratos aditivos de natureza/modalidade, dimensões da captura e registro/consulta de marco.
- `service/app/operation.py`: criação compatível de operações novas, validação de estágios `MULTIPLA`, persistência das dimensões e helpers de marco oficial.
- `service/app/routes/integrations.py`: endpoints de consulta/registro de marcos para cliente e Backoffice, sem alterar Device ou Delivery.
- `service/app/contingency_service.py`: preservação das novas dimensões quando um registro é importado por contingência.
- `service/tests/test_weighing_flow_foundation.py`: testes específicos da fundação 02B.

O payload do evento `balanca.pesagem.concluida.v1` não foi reinterpretado nem foi criado evento de resultado consolidado. A Station não recebeu o novo fluxo de captura nesta fase.

## 2. Modelo final da fundação

### Ordem (operação)

`tara.ordens` recebeu, ambos nullable para compatibilidade histórica:

- `natureza_operacao`: `RECEBIMENTO`, `EXPEDICAO`, `TRANSFERENCIA`, `DEVOLUCAO`, `OUTRA`;
- `modalidade`: `UNICA` ou `MULTIPLA`.

`tipo_pesagem` continua preservado. Os quatro valores existentes continuam funcionando sem interpretação nova. Para uma nova operação, `tipo_pesagem` aceita também `MULTIPLA`; quando omitido, é derivado de `modalidade`. Uma operação `MULTIPLA` exige `natureza_operacao` no Core.

### Pesagem (captura física)

`tara.pesagens` continua sendo o fato físico imutável, identificado por `tenant_id + local_id`. Foram adicionados campos nullable:

- `finalidade`: `OPERACIONAL`, `CONFERENCIA`, `AMOSTRAGEM`;
- `metodo_medicao`: `ESTATICA`, `DINAMICA`, `POR_EIXO`.

`etapa` continua armazenando o estágio. Para operações novas `MULTIPLA`, o Core aceita `CHEGADA`, `PRE_OPERACAO`, `INTERMEDIARIA`, `POS_OPERACAO` e `SAIDA`. Ordens legadas continuam usando seus conjuntos atuais (`UNICA`, `CHEGADA`, `SAIDA`, `POS_DESCARGA`). `direcao_veiculo` mantém `ENTRADA`/`SAIDA` e passa a aceitar `INTERNA` no contrato novo; a coluna existente já comporta o valor.

### Marco oficial

Foi criada `tara.pesagem_marcos_oficiais`:

| Campo | Função |
|---|---|
| `tenant_id` | Isolamento do tenant/RLS |
| `ordem_id` | Operação proprietária |
| `pesagem_id` | Captura física apontada |
| `etapa` | Estágio oficial do marco |
| `decidido_em` | Timestamp da decisão |
| `operador_id` | Ator existente, opcional e validado no tenant |

Há uma única linha por `(tenant_id, ordem_id, etapa)`. O trigger garante que a captura apontada pertence ao mesmo tenant, Ordem e etapa. Substituir o marco atualiza somente a linha do marco; nunca altera a `Pesagem`.

Endpoints aditivos:

```text
GET  /v1/orders/{order_id}/official-marks
POST /v1/orders/{order_id}/official-marks
GET  /v1/admin/orders/{order_id}/official-marks
POST /v1/admin/orders/{order_id}/official-marks
```

Os endpoints usam os escopos/permissões existentes; não foi criada identidade paralela de usuário.

## 3. Migration e unicidade

`039_weighing_flow_foundation.sql` é aditiva/controlada:

1. adiciona colunas nullable em `ordens` e `pesagens`;
2. remove a constraint antiga de `(ordem_id, etapa)` — incluindo o nome legado encontrado no banco de desenvolvimento (`uq_balanca_pesagens_ordem_etapa`);
3. mantém índice de consulta por `(tenant_id, ordem_id, etapa)`;
4. instala trigger que conserva uma captura por etapa para ordens legadas e permite repetição somente quando `ordens.modalidade = 'MULTIPLA'`;
5. cria a tabela de marcos e sua unicidade por operação/etapa;
6. instala trigger de consistência da referência Pesagem → Ordem/tenant/etapa;
7. habilita/força RLS e política de tenant nos marcos.

A unicidade física `tenant_id + local_id` não foi removida. Registros históricos não são transformados, renomeados ou preenchidos com valores novos. A função de imutabilidade da Pesagem foi recriada na migration 039 para incluir as duas novas dimensões, sem editar a migration histórica 019.

## 4. Core e compatibilidade

- `UNICA`, `DUPLA`, `DUPLA_ENTRADA_DESCARGA` e `DUPLA_SAIDA_CARREGAMENTO` continuam com a validação, conclusão e cálculo existentes.
- Operações `MULTIPLA` aceitam mais de duas capturas e estágio repetido, mas ficam em `EM_PESAGEM`; não há conclusão automática nem cálculo PRE/POS nesta fase.
- `local_id`, `operation_local_id`, autorizações offline, StationInstallation, DeviceConfiguration, challenge/proof do Bridge e reconciliação da operação local não foram redesenhados.
- A contingência preserva as novas dimensões quando presentes; assinatura, sequência, identidade da Station e idempotência permanecem iguais.
- DeliveryReceipt, ACK, purge, tombstone e RLS existentes não foram alterados.

## 5. Testes executados

Migration aplicada no banco de desenvolvimento `farms` com sucesso.

Suíte diretamente relacionada:

```text
PYTHONPATH=. .venv/bin/pytest -q \
  tests/test_weighing_events.py \
  tests/test_weighing_calculation.py \
  tests/test_avulsa_e2e.py \
  tests/test_service_e2e.py \
  tests/test_delivery_receipt_e2e.py \
  tests/test_delivery_purge_e2e.py \
  tests/test_weighing_flow_foundation.py
```

Resultado: **8 passed**.

`test_weighing_flow_foundation.py` prova:

1. operação `MULTIPLA` com três capturas;
2. duas capturas no mesmo estágio;
3. idempotência por `local_id`;
4. imutabilidade da Pesagem;
5. um único marco por operação/estágio e substituição sem mutar captura;
6. rejeição de marco de outra Ordem ou tenant;
7. legados com unicidade de etapa e campos novos nulos continuam legíveis.

As suítes existentes cobrem os fluxos legados, OFFLINE-OP-01B, cálculo, Delivery/ACK/purge e retenção sem regressão.

## 6. Riscos e pendências para 02C

- A Station ainda calcula a próxima etapa com arrays fixos; o fluxo N-capturas da UI/sync ficará para fase posterior.
- O Core ainda não seleciona marcos automaticamente nem calcula resultado PRE/POS, variações auxiliares ou regra comercial por natureza da operação.
- Não há UX de escolha/troca humana de marco; os endpoints são apenas a base segura para a próxima fase.
- O evento v1 continua por captura/fluxo legado; o resultado consolidado deverá receber contrato/versionamento próprio no 02C.
- A troca da constraint por trigger é segura para o contrato atual, mas deve ser coberta por observabilidade antes de habilitar produção para novas operações.

## 7. Veredicto

**BALANCA-WEIGHING-FLOW-02B STATUS: CONCLUÍDO**

**GO COM RESSALVAS** para iniciar o 02C. A fundação está pronta e compatível, mas o cálculo PRE/POS, a seleção operacional de marcos e a evolução da Station continuam obrigatoriamente pendentes.
