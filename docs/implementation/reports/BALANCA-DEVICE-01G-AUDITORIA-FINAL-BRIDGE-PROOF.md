# BALANCA-DEVICE-01G — Auditoria Final da Prova de Validação da Bridge

Esta auditoria inspecionou as correções aplicadas na fase `01F` para atestar a segurança e o isolamento operacional da Plataforma Balança, com foco na validação de comunicação com a Bridge local (BLOCK-02), no ciclo de vida de instalações `REPLACED` (BLOCK-01) e nos pacotes de contingência V2 (BLOCK-03). A análise foi estritamente investigativa (read-only).

---

## 1. Auditar Station

A funcionalidade "Testar comunicação" está implementada no arquivo:
**Arquivo:** `station/src/app/(balanca)/configuracoes/page.tsx`
**Função:** `testarBridge()`

A Station efetua as seguintes chamadas reais:

1. **GET `/health`**
   - **Headers:** Nenhum.
   - **Tratamento Timeout/Falha:** Aborta se `!health.ok` ou `healthBody.status !== "ok"`.
   - **Payload Esperado:** `{"status": "ok"}`

2. **GET `/peso-atual`**
   - **Headers:** `{"X-Bridge-Token": session.bridge_token}` (se houver token configurado).
   - **Tratamento Timeout/Falha:** Aborta se `!peso.ok` ou erro de rede. 
   - **Payload Esperado:** Avalia se `typeof pesoBody.peso_kg === "number"`.

Se qualquer das duas chamadas falhar, o erro é capturado no bloco `catch` e renderizado na UI (HTTP != 2xx lança exceção ou falha no `.ok`). A validação do payload é efetuada rigidamente (tipo do peso).

---

## 2. X-Bridge-Token

**X-Bridge-Token enviado para `/peso-atual`?**
**SIM**

Evidência em `station/src/app/(balanca)/configuracoes/page.tsx`, linha 37-38:
```javascript
const headers = session?.bridge_token ? { "X-Bridge-Token": session.bridge_token } : {};
const [health, peso] = await Promise.all([fetch(`${base}/health`), fetch(`${base}/peso-atual`, { headers })]);
```
*O endpoint `/health` não recebe nem exige token.*

---

## 3. Bridge

A análise de `bridge/balanca_bridge/main.py` revela:

- **`/health` (GET):** Público. Não exige token. Retorna `{"status": "ok"}`.
- **`/peso-atual` (GET):** Exige token (se configurado). Valida via `_check_token(request)`, que lê o header `X-Bridge-Token`. Retorna o objeto `LeituraState`.
- **`/ws/peso` (WebSocket):** Exige token (se configurado). Lê do header `x-bridge-token` ou da query string `?token=...`. Retorna fluxo de estados.

**Comportamento com token inválido:**
- `/peso-atual`: Levanta exceção `HTTP 401 Unauthorized`.
- `/ws/peso`: Executa `websocket.close(code=4401)`.

**Erro de Equipamento:**
Representado por `conectado: False`, ou `erro` com descrição em string.

---

## 4. Prova criptográfica

**O que exatamente essa prova comprova?**

A prova de validação enviada para a API (campo `bridge_token_proof`) comprova EXCLUSIVAMENTE que:
`"Station conhece determinado segredo/token"`

Ela **NÃO** comprova que `"Station realizou com sucesso uma comunicação real com a Bridge"`. 
O segredo enviado é simplesmente uma cópia em texto plano do próprio token da bridge salvo localmente na Station. Não há qualquer *challenge-response*, nonce assinado pela Bridge ou resposta gerada pela ponte que amarre criptograficamente a existência física da Bridge ao fluxo.

---

## 5. BridgeValidation

A evidência da validação é persistida através de `POST /stations/bridge-validations`.

**Campos persistidos:**
- `id` (UUID), `tenant_id`, `instalacao_id`, `bridge_url`.
- `token_proof_hash`: Hash SHA-256 do `bridge_token_proof` enviado.
- `expires_at`: `datetime.utcnow() + timedelta(minutes=10)`.

**Características da Prova:**
Não existe nonce/challenge (desafio criptográfico dinâmico). O proof não prova comunicação, apenas posse do token de integração com a bridge. 
Existe **Replay**? Como não há nonce atrelado ao tempo por parte da Bridge, a prova é estática. A expiração de 10 minutos protege o registro `BridgeValidation` gerado no banco, mas nada impede a submissão infinita do mesmo `bridge_token_proof` pelo cliente. O vínculo com a configuração candidata é feito no envio de `validation_id` em `POST /stations/device-configurations`.

---

## 6. Ativação

A `DeviceConfiguration` passa para `ACTIVE` no arquivo `service/app/routes/integrations.py`, rota `POST /stations/device-configurations` (linha 413).

**É impossível ativar uma DeviceConfiguration sem uma BridgeValidation válida?**
Na atual implementação, se a `bridge_url` for fornecida, é **tecnicamente exigido** que exista um `validation_id` não expirado. 
No entanto, dado que a validação confia em um self-reporting do cliente (o envio voluntário do texto plano do token), a barreira é logicamente falsa.

---

## 7. Teste negativo obrigatório

Um cliente autenticado (Station ou portador do token da Station) **CONSEGUE** fabricar uma validação aceita pelo backend sem executar comunicação real com a Bridge.

**Fluxo de Bypass:**
1. O cliente forja um request para `POST /stations/bridge-validations` enviando `{"bridge_url": "http://minha-bridge-falsa", "bridge_token_proof": "qualquer_texto", "peso_kg": 100}`.
2. O Backend aceita cegamente, grava o SHA-256 de "qualquer_texto" e retorna o `validation_id`.
3. O cliente chama `POST /stations/device-configurations` e ativa a configuração.
A nuvem jamais tentará validar com a Bridge.

---

## 8. Pergunta central

> Uma Station comprometida ou um cliente que possua sua credencial consegue fazer a Cloud acreditar que uma Bridge foi validada sem realmente conversar com a Bridge?

**SIM.**

**Justificativa:** O backend delegou o teste de integridade HTTP para o cliente sem exigir uma prova criptográfica gerada por uma terceira parte idônea (a própria Bridge). O payload de validação (enviar a URL + token da bridge) é algo que o cliente forjado já possui estaticamente. Logo, é apenas uma declaração de intenção ("eu me conectei"), e não uma prova de acesso ("veja o desafio assinado pela bridge").

---

## 9. Reparo sugerido (NÃO exigir prova impossível)

Não é necessário exigir validações da nuvem contra a LAN (fato já abandonado no BLOCK-02). Tampouco devemos exigir que a Bridge levante uma infraestrutura complexa de PKI/assinatura assimétrica.
Se a estação for comprometida fisicamente, o conceito de "balança segura" já cai. A vulnerabilidade de fabricar ativações falsas é real, mas o esforço necessário para repará-la de forma puramente criptográfica traria uma complexidade indesejada à Bridge. Portanto, do ponto de vista de desenho, esta limitação de "auto-certificação" deve ser reconhecida como um *trade-off* do desacoplamento LAN-Cloud.

*Entretanto, estritamente pela interpretação da segurança lógica, a barreira do BLOCK-02 falha em fornecer uma Prova (Proof) verdadeira.*

---

## 10. Revisar BLOCK-01

**REPLACED consegue apenas drenar backlog comprovadamente anterior ou consegue enviar novas pesagens arbitrárias?**

**REPLACED consegue enviar novas pesagens arbitrárias.**

**Justificativa:** Embora a fase `01F` tenha bloqueado `sync/pull` e `operators/login` via `require_station`, a rota `POST /stations/sync/push` continua acessível para instalações `REPLACED` (já que o objetivo era drenar o backlog).
No entanto, em `integrations.py` (`post_sync`), não existe nenhuma validação checando se `payload.get("data_pesagem")` é cronologicamente ANTERIOR ao instante em que a instalação foi invalidada (`replaced_at` ou `revoked_at`). Como o sistema confia no `data_pesagem` informado pelo cliente no payload, uma instalação REPLACED pode operar eternamente de forma "offline" inventando datas recentes e enviando-as via `push`. O bloqueio do ciclo de vida é, portanto, incompleto.

---

## 11. Revisar BLOCK-03

**Contingency V2:** Os campos `station_id`, `installation_id` e `device_configuration_id` são corretamente mapeados em `records`.

**V1 permanece sem IDs e sem inferências:**
O pydantic de fato padroniza `installation_id: uuid.UUID | None = None`. O backend processa pacotes V1 com campos unset preservando a compatibilidade sem forçar vínculos artificiais, e a correção de `exclude_unset=True` garantiu que a canonização do JSON para checagem da assinatura não injete campos fantasmas, protegendo criptograficamente a V1. A V2 (com os IDs) também é corretamente assinada, impedindo falsificação e amarração cruzada indevida.

---

## 12. Resultado

**BLOCK-01: REPROVADO**
(Instalação REPLACED pode forjar e empurrar novas pesagens no futuro usando a brecha do `sync/push` de backlog irrestrito).

**BLOCK-02: REPROVADO**
(O bypass é nativo; o backend confia no "self-report" estático e aceita qualquer configuração desde que o cliente declare tê-la validado).

**BLOCK-03: APROVADO**
(V2 criptograficamente estanque e V1 retrocompatível).

---

```text
BALANCA-DEVICE-01

STATUS:
NÃO CONCLUÍDO
```

### Reparo Necessário (Fase 01H)

**Para BLOCK-01:**
No endpoint `POST /stations/sync/push` (`integrations.py`), deve ser injetada uma validação comparando o campo `data_pesagem` enviado (do payload) contra a data de substituição da instalação (`installation.replaced_at` ou `revoked_at`). Se a pesagem foi "capturada" no futuro em relação à revogação, deve ser rejeitada sumariamente. O backlog deve ser estritamente passado.

**Para BLOCK-02:**
Decisão de Produto/Arquitetura. Se for aceitável que a Station tenha auto-soberania sobre qual bridge ela usa, o bypass pode ser aceito como *By Design* (pois um invasor na Station já forjaria o peso de qualquer forma). Para fechamento criptográfico real, a Bridge precisaria expor uma rota `/challenge` em que a Station envia um nonce gerado pelo Backend, e a Bridge assina usando um HMAC atrelado ao `bridge_token`. O Backend então validaria esse HMAC (Proof of Bridge Possession).
