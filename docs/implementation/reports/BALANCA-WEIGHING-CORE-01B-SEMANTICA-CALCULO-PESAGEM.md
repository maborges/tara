# BALANCA-WEIGHING-CORE-01B — Semântica e Cálculo da Operação de Pesagem

## Status Executivo

```text
STATUS: CONCLUÍDO
```

Todas as metas estabelecidas na fase `01B` foram alcançadas preservando estritamente os princípios arquiteturais: imutabilidade, isolamento via RLS, eventos de outbox e ausência de domínios externos (Produto, NF, Estoque) no core de pesagem.

---

## 1. GAPs Tratados e Resolvidos

### G02 — Cálculo correto do resultado da dupla pesagem
**Status: RESOLVIDO**

A plataforma não subtrai mais cegamente `peso_aferido - peso_tara_informado` da última etapa para todos os cenários. Foi implementada uma semântica correta que varre todas as capturas físicas vinculadas à Ordem.
- **Pesagem Única:** Líquido = peso bruto aferido − tara informada (ou zero se não informada).
- **Pesagem Dupla (todas as variantes):** O sistema agora agrupa as capturas.
  - O maior peso aferido é extraído automaticamente como **peso bruto da operação**.
  - O menor peso aferido é extraído automaticamente como **peso tara da operação**.
  - O líquido é sempre a diferença natural entre bruto e tara medidos.
- **Resiliência a inversões:** Independentemente da operação ser de Recebimento ou Expedição, a extração de `max/min` atende perfeitamente ao comportamento físico real de pesagem de veículos carregados/vazios sem amarrar a plataforma a conceitos comerciais. 

### G07 — Vocabulário Controlado de Etapas
**Status: RESOLVIDO**

A coluna `etapa` deixou de aceitar strings arbitrárias. Agora há uma matriz de verificação rígida no momento da captura:
- `UNICA` → aceita apenas a etapa `UNICA`.
- `DUPLA` → aceita apenas `CHEGADA` ou `SAIDA`.
- `DUPLA_ENTRADA_DESCARGA` → aceita apenas `CHEGADA` ou `POS_DESCARGA`.
- `DUPLA_SAIDA_CARREGAMENTO` → aceita apenas `CHEGADA` ou `SAIDA`.

Qualquer tentativa de captura com etapa incompatível ao `tipo_pesagem` da Ordem resultará em rejeição imediata (`HTTP 422 Unprocessable Entity`), evitando inconsistências nos cálculos e nos eventos.

### G08 e G09 — Persistência e Origem da Tara
**Status: RESOLVIDO**

A tabela `tara.ordens` recebeu três novas colunas de negócio (sem quebrar retrocompatibilidade):
- `peso_bruto_kg`
- `peso_tara_kg`
- `tara_source`

O campo `tara_source` resolve o rastreio da informação de tara:
- `MEASURED`: Tara foi medida fisicamente na balança durante a operação (ex: peso 2 de uma pesagem dupla).
- `CLIENT_PROVIDED`: Tara informada manualmente ou enviada pelo sistema consumidor na pesagem única.
- `NONE`: Tara não existe/não foi fornecida (o líquido é igual ao bruto).

### G13 — Contrato de Evento
**Status: RESOLVIDO**

O payload do evento de integração `balanca.pesagem.concluida.v1` foi devidamente atualizado.
Ele agora transporta com clareza a diferença entre os dados da captura física e os dados consolidados da operação:
```json
{
  ...
  "etapa": "SAIDA",
  "peso_aferido_kg": "14300.000",
  "peso_bruto_kg": "42800.000",
  "peso_tara_kg": "14300.000",
  "peso_liquido_kg": "28500.000",
  "tara_source": "MEASURED"
}
```

---

## 2. GAPs Adiados Estrategicamente

### G01 — Remoção de Campos Fantasmas no Sync
**Status: PRESERVADO POR COMPATIBILIDADE**

Decidiu-se pela **não remoção** dos campos fantasmas legados (`produto_id`, `produto_tipo`, `tipo_volume`, etc.) no endpoint `sync/pull` neste ciclo. Esses campos continuarão sendo retornados como nulos no dicionário base, garantindo que integrações que dependam de *destructuring* ou validações estritas de schema não sejam quebradas antes de um inventário completo no AgroSaaS. 

### G10 — Criação da Entidade de Tara Conhecida/Veículos
**Status: NÃO IMPLEMENTADO POR DECISÃO ARQUITETURAL**

O princípio da Plataforma Balança foi mantido: ela **não é proprietária de dados cadastrais mestre**. Se houver tara conhecida do veículo (ex: placa), ela deve ser informada pelo sistema solicitante e será simplesmente documentada com `tara_source = CLIENT_PROVIDED`. A plataforma não terá banco de veículos.

---

## 3. Matriz Final de Semântica e Cálculo

| `tipo_pesagem` | Etapas Aceitas | Bruto | Tara | Líquido | Origem da Tara |
|---|---|---|---|---|---|
| **UNICA** | `UNICA` | Medição | Informada | Bruto − Tara Informada | `CLIENT_PROVIDED` ou `NONE` |
| **DUPLA** | `CHEGADA`, `SAIDA` | `max(p1, p2)` | `min(p1, p2)` | Bruto − Tara Medida | `MEASURED` |
| **DUPLA_ENTRADA_DESCARGA** | `CHEGADA`, `POS_DESCARGA` | `max(p1, p2)` | `min(p1, p2)` | Bruto − Tara Medida | `MEASURED` |
| **DUPLA_SAIDA_CARREGAMENTO** | `CHEGADA`, `SAIDA` | `max(p1, p2)` | `min(p1, p2)` | Bruto − Tara Medida | `MEASURED` |

---

## 4. Validações e Testes Executados

- **Schema:** Aplicação da migration `033_ordem_resultado_fisico.sql` bem sucedida (`peso_bruto_kg`, `peso_tara_kg`, `tara_source` inseridos).
- **Core Operations:** Função assíncrona robusta coletando as aferições passadas na Ordem, protegendo contra corrupção mesmo que a ordem dos pacotes offline seja flutuante.
- **E2E Completo:** Todos os fluxos de ponta-a-ponta testados (Pesagem online Avulsa/Vinculada e Sincronização Assíncrona Outbox/Offline), com os testes refletindo imediatamente a adequação após atualização das instâncias e mock payload.

O sistema está apto para o prosseguimento da evolução da malha e dos processos do ecossistema DeepFarms.
