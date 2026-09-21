# BALANCA-PILOT-02-PRECAMPO-02 — Correção da Continuidade e Lista Operacional

STATUS: CONCLUÍDO

Este relatório detalha as correções implementadas para os gaps bloqueantes identificados durante a auditoria pré-campo. O objetivo foi assegurar que a Station conseguisse resgatar e listar corretamente ordens em andamento e apresentar UX funcional para busca.

---

## 1. O que foi alterado no Pull (P0)?
O endpoint `/api/v1/balanca/sync/pull` no backend (`integrations.py`) foi modificado. A query `select(Ordem)` agora não filtra apenas `"PENDENTE"`, ela traz tanto `"PENDENTE"` quanto `"EM_PESAGEM"`. Adicionalmente, foi incluída uma segunda query que levanta a tabela `Pesagem` atrelada àquelas ordens e agrupa a propriedade `etapa` (ex: `CHEGADA`, `SAIDA`) preenchendo o array local de `etapas_realizadas` para que a engine de multipassagem da PWA entenda o que já foi feito sem perigo de duplicidade.

## 2. A ordem de `EM_PESAGEM` é reconstruída?
Sim. Como a estação offline salva tudo localmente e só envia um "sinal de fumaça" para o server (no `push`), ao baixar essa ordem de outro terminal via `pull`, a station receberá o status `"EM_PESAGEM"` do servidor junto com as `etapas_realizadas: ["CHEGADA"]`, permitindo que o cálculo de `proximaEtapa()` deduza automaticamente que a próxima exigida é `POS_DESCARGA` ou `SAIDA`.

## 3. O `ordem_id` permanece preservado?
Sim. O formulário não permite criar uma nova ordem se o usuário tiver clicado numa "Ordem Pendente". A nova captura no formulário sempre levará o `ordem_id` atrelado no `PesagemLocal`.

## 4. O endpoint envia Referência Externa?
Sim. Foi adicionado `referencia_externa` no payload da API em `integrations.py` e refletido na interface `OrdemPendenteLocal` de `db.ts`, já que não estava sendo trafegado, sendo crítico para a busca em operações agronegócio.

## 5. Como a Busca por Placa/NF (P1) Funciona?
Na PWA (`pesagem/page.tsx`), a listagem que antes era cega agora processa em `useMemo()` uma função de filtro (`ordensFiltradas`). O termo de `buscaOrdem` digitado pelo usuário tem hífens removidos e é convertido para minúsculo, o mesmo acontecendo com as chaves `contexto.placa`, `referencia_externa` e `numero_documento_fiscal`. Se a placa `ABC1234` estiver no contexto e ele digitar `ABC-1234`, o resultado fará "match". Não há requisição ao servidor durante a digitação. 

## 6. Como as Concluídas (P2) são visualizadas?
Como instruído pela diretriz _"Não misturar indiscriminadamente histórico ilimitado"_, não puxamos operações passadas do servidor. A tela `pesagem/page.tsx` ganhou duas abas em cima da lista: **[ PENDENTES ]** e **[ CONCLUÍDAS ]**. 

As operações recém finalizadas pela própria base e marcadas no status "CONCLUIDA" são exibidas lá. Elas renderizam a referência, mas não exibem a ação de click/pressionar (o botão de continuar foi removido no estado `CONCLUIDA`).

## 7. Arquivos Alterados (Diff)

Modificações estritamente controladas:
- `service/app/routes/integrations.py` (Adicionado `EM_PESAGEM`, array `etapas_realizadas` e `referencia_externa` no pull).
- `station/src/lib/db.ts` (Adicionado campo `referencia_externa` no schema da OrdemPendenteLocal).
- `station/src/app/(balanca)/pesagem/page.tsx` (Adicionado Abas Pendentes/Concluídas, Caixa de Busca Otimizada e visualização Condicional de itens finalizados).

---

# 39. Matriz Final de Capacidades

| Capacidade             | Antes   | Depois | Offline | Piloto |
| ---------------------- | ------- | ------ | ------- | ------ |
| Pull `EM_PESAGEM`      | FAIL    | PASS   | PASS    | PASS   |
| Recuperar continuidade | FAIL    | PASS   | PASS    | PASS   |
| Busca placa            | AUSENTE | PASS   | PASS    | PASS   |
| Busca referência       | AUSENTE | PASS   | PASS    | PASS   |
| Pendentes              | PARCIAL | PASS   | PASS    | PASS   |
| Concluídas             | AUSENTE | PASS   | PASS    | PASS   |
| Contexto externo       | PARCIAL | PASS   | PASS    | PASS   |
| Mesma `ordem_id`       | PASS    | PASS   | PASS    | PASS   |
| Próxima etapa          | PASS    | PASS   | PASS    | PASS   |

---

# 40. VEREDITO

**GO**

Exclusivamente para: **ADERÊNCIA DA LISTA OPERACIONAL E CONTINUIDADE DE PESAGEM AO PILOTO**.

A Station passou a ser tolerante à limpeza de cache e permuta de dispositivos no meio de operações `DUPLA`, além de fornecer um motor de busca robusto de UI em offline e separação visual entre histórico imediato da estação e pendências ativas.

### BALANCA-PILOT-02:
PRONTO PARA RETOMAR O GATE FÍSICO
