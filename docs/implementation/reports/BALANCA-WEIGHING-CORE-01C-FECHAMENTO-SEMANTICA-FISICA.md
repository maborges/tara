# BALANCA-WEIGHING-CORE-01C — Fechamento da Semântica Física

## Status Executivo

```text
BALANCA-WEIGHING-CORE-01
STATUS: CONCLUÍDO
```

Esta fase completou a validação de aderência física às operações de recebimento e expedição vinculadas, proibindo a conclusão com dados inconsistentes entre a chegada e saída.

---

## 1. Problema e Resolução

O cálculo genérico de `max`/`min` de `BALANCA-WEIGHING-CORE-01B` garantia a matemática correta (o maior valor é logicamente o peso com carga, e o menor sem carga), mas silenciava a possível detecção de um erro ou fraude operacional (por exemplo, um veículo registrando um peso vazio na CHEGADA de um Recebimento de Grãos).

Foi implementada uma validação estrita nos agrupamentos semânticos explícitos:
- **Recebimentos (`DUPLA_ENTRADA_DESCARGA`):** É imperativo que `CHEGADA` > `POS_DESCARGA`.
- **Expedições (`DUPLA_SAIDA_CARREGAMENTO`):** É imperativo que `SAIDA` > `CHEGADA`.

Em caso de violação desta física elementar, a Plataforma Balança rejeita imediatamente a captura de fechamento com erro `HTTP 422 (Unprocessable Entity)` reportando "Inconsistência operacional", impedindo a conclusão da Ordem com resultados invertidos.

O papel de "DUPLA genérica", que não tem natureza fiscal inerente, preservou seu comportamento empírico original (max/min).

---

## 2. Matriz Final de Fechamento Operacional

| Tipo de Pesagem | Etapas de Captura | Papel Físico | Bruto da Ordem | Tara da Ordem | Líquido da Ordem | Validação de Consistência |
|---|---|---|---|---|---|---|
| **UNICA** | `UNICA` | Indiferente | Medição (peso aferido) | Informada (se houver) | Bruto − Tara | N/A |
| **DUPLA** | `CHEGADA` e `SAIDA` | Desconhecido/Agnóstico | `max(P1, P2)` | `min(P1, P2)` | Bruto − Tara | Semântica neutra |
| **DUPLA_ENTRADA_DESCARGA** | `CHEGADA` e `POS_DESCARGA` | Recebimento/Descarga | `CHEGADA` | `POS_DESCARGA` | Bruto − Tara | Rejeita se `POS_DESCARGA >= CHEGADA` |
| **DUPLA_SAIDA_CARREGAMENTO** | `CHEGADA` e `SAIDA` | Expedição/Carregamento | `SAIDA` | `CHEGADA` | Bruto − Tara | Rejeita se `CHEGADA >= SAIDA` |

## 3. Cobertura de Testes Validada

Todos os cenários propostos foram validados em ambiente end-to-end simulando as chamadas HTTP dos equipamentos (Stations):

* Recebimento normal (aprovado)
* Recebimento anômalo (rejeitado corretamente - `422 Unprocessable Entity`)
* Expedição normal (aprovado)
* Expedição anômala (rejeitado corretamente - `422 Unprocessable Entity`)
* DUPLA genérica (aprovado com extração robusta)
* UNICA (com ou sem tara fornecida, aprovada)
* Validações de reenvio offline idempotente e consistência de Outbox asseguradas pelos testes pré-existentes.

A base de código core da balança está devidamente coesa.
