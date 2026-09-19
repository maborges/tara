# BALANCA-PILOT-01B — Kit Operacional e Runbook do Piloto Controlado

## 1. GAP-07 era real?
Sim. A infraestrutura construída entrega a Station como um aplicativo Next.js servidor rodando localmente (proxy). O GAP-07 é arquiteturalmente justificado pela intenção de isolamento, mantendo o frontend seguro e fornecendo um backend local que intercepta chamadas (Service Worker, IndexedDB proxy, ocultação do App Secret).

## 2. PWA precisa Node/pnpm no cliente?
O computador da balança, onde o navegador abrirá a PWA, **precisa do Node.js** (versão 20+) para executar o processo servidor `.next` via `npm run start`. O *pnpm* é necessário apenas na máquina de origem (build server) que cria o pacote `.tar.gz`. A arquitetura requer o Node em campo, e a mitigação foi documentar isso como pré-requisito explícito no checklist de implantação, aceitável para um piloto assistido.

## 3. Como a Station é instalada de fato?
No cenário de empacotamento, roda-se `pnpm station:package`, gerando o arquivo `.tar.gz`. O técnico o leva ao cliente e o extrai. Configura-se o `.env.local` informando o Token de Integração e URL do Backoffice. Inicia-se através de `npm run start`. O operador ativa através de um código no navegador (`localhost:3003`).

## 4. Como a Bridge é instalada?
É distribuída em código-fonte, configurada em um Virtual Environment do Python 3 (`.venv`). O técnico edita manualmente o `config.yaml` e roda o script `install.sh` que registra um daemon systemd (Linux) para mantê-la operante no boot (autostart). 

## 5. Como uma Station é provisionada?
Para provisionar a Station, é feita uma chamada REST POST à API Portal do Cliente para registrar os dados e gerar um Challenge e Activation Code (sem necessidade de SQL puro no banco de dados).

## 6. Como o indicador é homologado?
Através da **Ficha de Homologação de Indicador**, que registra as configurações seriais (baudrate) e a regex (ex: `\s*([0-9]{6})KG`) testadas no laboratório, para evitar surpresas durante o Go-Live físico.

## 7. Como testar online?
O operador abre a aplicação, a Bridge reporta "Estável e Conectada", o operador gera uma nova ordem e captura eletronicamente o peso. Os dados desaparecem da fila local, o que atesta a correta gravação e push da API.

## 8. Como testar offline?
O técnico remove o acesso à rede do PC. O operador realiza uma captura, que deve salvar com sucesso usando a "Autorização Offline" alocada (OfflineCaptureAuthorization). O status fica retido nas listas "Pendentes" localizadas no PWA (IndexedDB).

## 9. Como validar Delivery?
No backend, o registro recém persistido deverá gerar um `DeliveryReceipt` com `status = PENDING`. Através do Endpoint de API, o Cliente Consumer faz um Pull/Webhook e, em seguida, dispara um ACK (Acknowledged), retirando-o da fila de saída.

## 10. Como o suporte diagnostica falhas?
Usando a **Árvore de Diagnóstico** do Runbook: verificação em etapas iniciando na tela do PWA, avançando para o `/healthz`, chegando às requisições do indicador `curl http://127.0.0.1:8321/peso-atual` e, se necessário, log `journalctl` da Bridge.

## 11. Quais documentos foram criados?
1. `RUNBOOK-IMPLANTACAO-ESTACAO.md`
2. `CHECKLIST-GO-LIVE-ESTACAO.md`
3. `RUNBOOK-SUPORTE-PILOTO.md`
4. `RUNBOOK-CONTINGENCIA.md`
5. `FICHA-HOMOLOGACAO-INDICADOR.md`
6. `CHECKLIST-DIARIO-PILOTO.md`
7. `MANUAL-OPERADOR.md`
8. `MANUAL-TECNICO-INSTALACAO.md`
9. O presente relatório (BALANCA-PILOT-01B).

## 12. Algum código produtivo foi alterado?
Nenhum código produtivo base foi alterado.

## 13. Algum utilitário operacional foi criado?
Não foi necessário, pois o uso documentado da API através de ferramentas HTTP regulares e Curl, combinados aos scripts PWA e Bridge já presentes na arquitetura, foi considerado totalmente aderente à Fase de Piloto "Concierge", mantendo a integridade sem invenções paralelelas.

## 14. Quais dependências de engenharia permanecem?
- Cadastro inicial do tenant e credenciais do Integrador.
- Obtenção do código de ativação da Station (sem UI).
- Exportação e, especialmente, Importação de pacote `.balanca.json` (Contingência) requer acesso à máquina de retaguarda (API).
- Configuração de Regex de serial (para dispositivos ainda não homologados).

## 15. Elas são aceitáveis no piloto concierge?
**Sim.** Um piloto "concierge" admite a alta assistência da equipe técnica instalando e homologando as pontas soltas. O operador final (pesador) conseguirá operar 100% de forma autônoma sem saber como as peças se conversam e se beneficiando amplamente do poder do funcionamento offline.

---

## Matriz Final

| Item                  | Antes      | Depois | Piloto |
| --------------------- | ---------- | ------ | ------ |
| Provisionamento       | Técnico    | Técnico| Assistido (API doc) |
| Instalação Station    | Técnico    | Técnico| Runbook / Assistido |
| Instalação Bridge     | Técnico    | Técnico| Runbook / Assistido |
| Homologação indicador | Não formal | Formal | Ficha Adotada |
| Go-live               | Não formal | Formal | Checklist pronto |
| Operação diária       | Pronta     | Pronta | Autônomo |
| Offline               | Pronto     | Pronto | Autônomo |
| Contingência          | Manual     | Manual | Runbook / Assistido |
| Monitoramento         | Técnico    | Técnico| Checklist diário API |
| Suporte               | Não formal | Formal | Árvore N1/N2/Eng. |
| Documentação operador | Parcial    | Pronta | Manual Simples |

---

## Veredito

```text
BALANCA-PILOT-01B
STATUS: CONCLUÍDO

READINESS OPERACIONAL:
GO

PILOTO CONTROLADO:
AUTORIZADO
```
A arquitetura se mostrou plenamente capaz de sustentar as garantias locais (Bridge) e remotas (Delivery/Idempotência). O suporte de Manuais/Runbooks complementam a UX faltante, permitindo a liberação operacional. O desenvolvimento do Backoffice visual (configurador) seguirá conforme priorização Pós-Piloto.
