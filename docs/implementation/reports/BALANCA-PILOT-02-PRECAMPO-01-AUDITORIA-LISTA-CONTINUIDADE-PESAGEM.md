# BALANCA-PILOT-02-PRECAMPO-01 — Auditoria da Lista Operacional e Continuidade de Pesagem

## 1. O que já existe na Station?
A Station possui uma lista básica de "Ordens de pesagem pendentes" em sua tela principal (`/pesagem`). O operador consegue clicar em uma ordem, visualizar as informações básicas (tipo, referência) e continuar o processo (a interface determina a próxima etapa corretamente). Todo esse processo ocorre localmente no banco IndexedDB (via Dexie).

## 2. O que já existe no backend?
O backend (implementado em Python) gerencia os modelos `Ordem` e `Pesagem`. 
Existem endpoints para listagem de ordens (`GET /orders`, `GET /admin/orders`) e pesagens (`GET /weighings`, `GET /admin/weighings`). 
A sincronização para a estação ocorre via `GET /stations/sync/pull` e envios via `POST /stations/sync/push`.

## 3. Existe lista de pesagens?
Na Station (PWA): **NÃO**. Não há tela que liste o histórico de pesagens avulsas ou pesagens concluídas. As pesagens só são visíveis de forma efêmera na tela principal. No Backend: **SIM** (via API e Backoffice).

## 4. Existe lista de ordens pendentes?
Na Station (PWA): **SIM**. Existe uma listagem em `app/(balanca)/pesagem/page.tsx` que exibe ordens com status `PENDENTE` ou `EM_PESAGEM` baseando-se no cache local (Dexie).

## 5. Existe histórico?
Na Station (PWA): **NÃO**. Ordens concluídas não são exibidas na PWA. Quando uma ordem recebe sua pesagem final, o status muda para `CONCLUIDA` e ela some da lista ativa.

## 6. Como o operador encontra uma segunda pesagem?
O operador procura visualmente a ordem rolando a lista de "Ordens de pesagem pendentes" renderizada na tela. Não existe ferramenta de busca (pesquisa) implementada para a lista de ordens. 

## 7. A mesma `ordem_id` é preservada?
**SIM**. Se a ordem for selecionada na lista, a nova captura (`PesagemLocal`) é criada em banco local apontando estritamente para `ordem_id: ordemSelecionada.id`.

## 8. Quem determina a próxima etapa?
A Station determina a próxima etapa localmente utilizando a função `proximaEtapa(tipoPesagemAtivo, etapasJaFeitas)` (em `lib/db.ts`). O backend também valida as etapas quando processa a fila de sync, utilizando a matriz de compatibilidade (`ETAPAS_POR_TIPO_PESAGEM`). A fonte canônica reside no backend, e a PWA espelha a lógica para funcionar offline.

## 9. Funciona offline?
**SIM, COM GAPS CRÍTICOS (Ressalvas)**.
1. As ordens previamente sincronizadas ficam disponíveis localmente e a continuidade da etapa subsequente funciona offline perfeitamente.
2. A primeira pesagem feita altera o status local da Ordem para `EM_PESAGEM`. Ela continua na lista local para aguardar a segunda passagem.
3. A Station não permite duplicidade acidental na mesma etapa, bloqueando o processo via `etapasJaFeitas`.

**GAP P0**: O endpoint `/stations/sync/pull` no backend (`integrations.py`, linha 869) seleciona ordens usando `Ordem.status == "PENDENTE"`. Isso ignora sumariamente ordens `EM_PESAGEM`. Se uma ordem receber a primeira pesagem e sincronizar, ela **desaparecerá** para os outros tablets da fazenda, e a Estação original perderá acesso a ela caso esvazie o cache. O servidor "esconde" a operação não concluída da sincronização.

## 10. Quais dados ficam no IndexedDB?
A Station armazena nas stores do Dexie: `ordens` (do tipo `OrdemPendenteLocal`), `pesagens` (`PesagemLocal`), `sync_queue`, `animais`, `operadores`, e `offline_auths`.

## 11. Placa está disponível?
Na `Ordem`: Somente dentro do campo `contexto` no Backend. O PWA não recebe placa mapeada.
Na `Pesagem`: A Station coleta a placa usando variável de estado própria e mapeia para `PesagemLocal.placa`. No momento do envio (push sync), ela injeta a `placa` diretamente para dentro do dicionário JSONB de `contexto` da pesagem (`payload: { contexto: { placa: pesagem.placa } }`).

## 12. Carretas estão disponíveis?
**NÃO**. A PWA sequer captura placas de carreta (reboque). Elas só podem trafegar dentro de `contexto` JSONB.

## 13. Motorista está disponível?
Semelhante à placa: existe campo estruturado na Station (`PesagemLocal`), mas o envio acomoda no campo `contexto` (JSONB) da pesagem. O backend não possui coluna nativa `motorista`.

## 14. NF está disponível?
A interface `OrdemPendenteLocal` da PWA prevê `numero_documento_fiscal`, mas o script do backend (`pull.ts` / `integrations.py`) empurra valores nulos estáticos (`"numero_documento_fiscal": None`). No banco, a NF vive em `referencia_externa` ou `contexto`.

## 15. Produto/carga está disponível?
Semelhante à NF: a interface da PWA espera `produto_id` e `produto_tipo`, mas o backend força o retorno como `None` no sync pull. O Backend guarda carga apenas em `contexto`.

## 16. Esses dados são estruturados ou contexto?
No **Backend**, são **CONTEXTO EXTERNO** nativos (`JSONB`). Na **Station (PWA)** houve uma tentativa incompleta de tornar esses campos estruturados nas interfaces locais, o que resulta em perda de dado ou mapeamento nulo forçado no sincronismo.

## 17. Existe busca por placa?
**NÃO**. A Station só implementa busca na caixa de digitação de Animais (`buscaAnimal`). O input visual não filtra a lista de ordens.

## 18. Existe busca por referência?
**NÃO**. O operador é forçado a procurar a ordem rolando o painel.

## 19. A UX suporta futuras múltiplas passagens?
**PARCIAL**. A engine subjacente (`etapasJaFeitas`) já cruza o que falta no enum `ETAPAS_POR_TIPO_PESAGEM`. Entretanto, o componente visual é montado rigidamente aguardando "Entrada" e "Saída". Suportar N capturas ($1...N$) necessitaria refatorar a inferência fixa para permitir passos dinâmicos.

## 20. Quais são os gaps bloqueantes para o piloto?
- **P0**: O endpoint `/stations/sync/pull` filtra exclusivamente `Ordem.status == 'PENDENTE'`, omitindo ordens em `EM_PESAGEM`. Nenhuma ordem multipassagem pode transitar entre dispositivos ou sobreviver a um descarte de cache.
- **P1**: Inexistência total de mecanismo de busca (por placa ou referência). Uma planta movimentada terá a UX completamente paralisada.
- **P2**: Não há tela de "Histórico de Concluídas". Se o operador errar um registro ou quiser checar se um caminhão já pesou saída, não tem onde conferir.

---

# Matriz de Aderência

| Capacidade         | Backend | Station | Offline | Situação | Gap |
| ------------------ | ------- | ------- | ------- | -------- | --- |
| Listar pendentes   | Sim     | Sim     | Sim     | PARCIAL  | Pull não envia ordens com status `EM_PESAGEM` (P0). |
| Histórico          | Sim     | Não     | Não     | AUSENTE  | Station não exibe operações que foram concluídas (P2). |
| Busca placa        | Não     | Não     | Não     | AUSENTE  | Faltam campos de texto para filtagem da lista de ordens. |
| Busca referência   | Sim     | Não     | Não     | AUSENTE  | Idem acima (P1). |
| Continuar ordem    | Sim     | Sim     | Sim     | PARCIAL  | O fluxo funciona localmente, mas não persiste a ordem em outros dispositivos devido à exclusão no pull. |
| Próxima etapa      | Sim     | Sim     | Sim     | JÁ EXISTE| Lógica centralizada entre `etapas_realizadas` e Enum de compatibilidade. |
| Histórico da ordem | Não     | Não     | Não     | AUSENTE  | Não é possível auditar capturas anteriores da mesma ordem via UI. |
| Sync status        | Sim     | Sim     | Sim     | JÁ EXISTE| |
| Contexto externo   | Sim     | Sim     | Sim     | JÁ EXISTE| JSONB acomodado com segurança no BD principal. |

---

# 30. DECISÃO PRÉ-CAMPO

> A Station atual permite que um operador localize uma operação que já possui a primeira pesagem e execute corretamente a próxima pesagem da mesma ordem sem assistência da engenharia?

**SIM COM RESSALVAS.**

**Evidência de Código**: Na Station (via `station/src/app/(balanca)/pesagem/page.tsx`), a lógica de continuidade `proximaEtapa()` está implementada e funciona de maneira autônoma com IndexedDB (`lib/db.ts`). Contudo, o endpoint de backend `/api/v1/balanca/sync/pull` (`integrations.py:869`) exclui deliberadamente ordens em status `EM_PESAGEM` (`select(Ordem).where(Ordem.tenant_id == tenant_id, Ordem.status == "PENDENTE")`). Ou seja, a continuidade tem êxito apenas localmente; mas falha completamente em manter coesão num ambiente distribuído ou se o cache da station for limpo no meio da operação.

---

# 33. VEREDITO

**NO-GO** 

exclusivamente para: **ADERÊNCIA DA LISTA OPERACIONAL E CONTINUIDADE DE PESAGEM AO PILOTO**

Apesar da UX local suportar a jornada, o bloqueio arquitetural no backend (P0 - ignorar ordens em `EM_PESAGEM` no sincronismo) e a ausência absoluta de filtros de busca por placa/referência (P1) tornam a operação assistida inviável para alto fluxo e causam alto risco de perda/descasamento em ordens multipassagem sob transições de estado do dispositivo offline.
