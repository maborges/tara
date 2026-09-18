# BALANCA-DEVICE-01I — Auditoria Final de Segurança do 01H

## Objetivo

Auditoria de segurança das implementações do `BALANCA-DEVICE-01H` para verificação dos bypasses identificados no `01G`.

---

## 1. BLOCK-01 — Tentativa Real de Retrodatação

### Cenário E2E
- Instalação `I1` (Device A) torna-se `REPLACED` em `T`.
- Cliente fabrica uma nova pesagem `P3` após `T`, informando artificialmente `data_pesagem = T - 1 hora`.
- Submete P3 via `POST /stations/sync/push`.

### Resultado
**ACEITO** (Vulnerabilidade mantida)

### Evidência Server-Side
O código implementado em `integrations.py` (`post_sync`):
```python
if installation.revoked_at and data_pesagem > installation.revoked_at:
    raise ValueError("Pesagem capturada após substituição da instalação")
```
Como a verificação baseia-se EXCLUSIVAMENTE em `data_pesagem` (que é controlável pelo cliente) e verifica se a data é *maior* que a revogação, ao retrodatar a captura para um período anterior à revogação (`T - 1 hora`), a condição falha em barrar a requisição.
Não existe nenhuma evidência criptográfica (assinatura) sendo exigida neste fluxo de sincronização online para impedir a fraude. O timestamp manipulado é aceito sem validação de procedência.

---

## 2. BLOCK-02 — Auditar Protocolo Criptográfico

### Fluxo Documentado
1. **Cloud → challenge**: Station chama `POST /stations/bridge-validations/challenge`. A Nuvem gera um `challenge_id` e um `nonce` aleatório.
2. **Station → Bridge**: Station envia `challenge_id` e `nonce` via `POST /challenge`.
3. **Bridge → proof**: Bridge calcula o hash de sua credencial (`token_hash = SHA256(bridge_token)`) e usa esse hash como chave para calcular o `proof = HMAC(token_hash, canonical_challenge)`. A Bridge devolve `proof` e `token_hash` para a Station.
4. **Station → Cloud**: Station envia o `proof` e o `token_hash` recém-obtidos na chamada `POST /stations/bridge-validations`.
5. **Cloud → verify**: Cloud utiliza o `token_hash` recebido da Station como a chave do HMAC, recalcula o hash e o compara com o `proof`.

---

## 3. Pergunta Crítica — Origem da Chave

> De onde a Cloud obtém a chave usada para verificar o HMAC?

**B — valor enviado pela Station junto com o proof**

**Evidência de código (`integrations.py`):**
```python
expected_hmac = hmac.new(
    key=data.bridge_token_hash.encode(), # <-- Valor originado do client request
    msg=canonical_challenge.encode(),
    digestmod=hashlib.sha256
).hexdigest()
```

---

## 4. Ataque Obrigatório — Chave Escolhida pela Station

### Cenário
1. A Station solicita um challenge legítimo.
2. A Station **NÃO** chama a Bridge.
3. A Station gera localmente um `fake_token_hash` arbitrário.
4. A Station calcula o `fake_proof = HMAC(fake_token_hash, canonical_challenge)`.
5. A Station envia ambos para a Nuvem.

### Resultado
**ACEITO** (Vulnerabilidade Crítica)

Como a Nuvem confia inteiramente no `data.bridge_token_hash` fornecido na requisição para gerar o HMAC esperado, qualquer par (chave inventada + HMAC resultante) enviado por um cliente malicioso será considerado perfeitamente válido pela Cloud. Não existe "Proof of Bridge Possession". O cliente escolhe a chave e a assinatura simultaneamente.

---

## 5. Ataque — Conhecimento Apenas da Credencial da Station

Um cliente que conhece apenas o JWT da Station consegue produzir um proof válido. Como demonstrado no item anterior, basta inventar um `token_hash`, assinar o challenge e enviá-lo para o endpoint. O cliente não precisa saber o `bridge_token` para passar na verificação.

**BLOCK-02 = REPROVADO**

---

## 6. Replay

- **Primeiro uso:** Aceito. O challenge é marcado com `used_at = datetime.utcnow()`.
- **Segundo uso:** Rejeitado. A query na tabela de challenges exige `used_at.is_(None)`.

---

## 7. Cross-installation

Um challenge gerado para uma `Installation` ou `DeviceConfiguration` não pode ser reutilizado em outra. A validação falha tanto na query (a instalação autenticada deve corresponder à instalação do challenge) quanto na validação da string `canonical_challenge` (que contém o `station_id` e o `installation_id`).

**Resultado:** Rejeitado.

---

## 8. Expiração

A query de validação de challenge inclui a cláusula `expires_at > datetime.utcnow()`.

**Resultado:** Rejeitado.

---

## 9. Não Confundir Hash com Segredo

> O `token_hash = SHA256(bridge_token)` passou a funcionar como segredo HMAC?

**SIM.** Se a Nuvem estivesse armazenando esse valor. Na atual implementação vulnerável, o valor enviado na requisição atua temporariamente como chave secreta durante a validação.

> Quem obtiver `token_hash` consegue produzir proofs válidos?

**SIM.** Como o HMAC usa esse hash como sua chave criptográfica (`key`), a obtenção desse hash equivale à posse da senha real em termos de protocolo de validação. Devido à falha 4, a Nuvem aceita qualquer chave transmitida em claro pelo próprio usuário não confiável.

---

## 10. DeviceConfiguration

A `DeviceConfiguration` **pode** ser ativada utilizando um **proof fabricado**, burlando totalmente a proteção imaginada pela arquitetura. Ela está protegida contra replay, expiração e cross-installation, mas desprotegida contra forja de origem (fabricação de proof sem consultar a Bridge).

---

## 11. BLOCK-03

**Status:** APROVADO.
Não houveram modificações, e o mecanismo `Contingency V2` (assim como a retrocompatibilidade V1) continua operando de forma íntegra.

---

## 12. Relatório Correto

Foi registrada a ausência do relatório `docs/implementation/reports/BALANCA-DEVICE-01H-FECHAMENTO-DEFINITIVO.md`. Não existe artefato ou documentação consolidando as alterações anteriores a este respeito.

---

## 13. Veredicto

**BLOCK-01: REPROVADO**
**BLOCK-02: REPROVADO**
**BLOCK-03: APROVADO**

### BALANCA-DEVICE-01
**STATUS: NÃO CONCLUÍDO**

### Análise de Causa Raiz e Reparo Necessário
- **BLOCK-01 (Falha):** Confia inteiramente na data enviada pela própria Station, permitindo evasão cronológica mediante falsificação client-side.
- **BLOCK-01 (Reparo):** O payload online para instalações `REPLACED` exige evidência criptográfica vinculada àquela instância (`station_public_key`), devendo o `sync/push` on-line ser bloqueado nestas condições e orientar o escoamento via lote de Contingência V2.
- **BLOCK-02 (Falha):** A Cloud aceita a chave HMAC fornecida pela própria requisitante sem verificação de estado preexistente, caracterizando delegação de autenticidade (cliente escolhe chave + assina com a própria chave).
- **BLOCK-02 (Reparo):**
  Como a Cloud só guarda hash(bridge_token), a Cloud *poderia* pedir que a Station envie o hash; em seguida, a Cloud verifica se o `hash` enviado corresponde a um hash *previamente guardado na nuvem para aquele device*. Todavia, como a validação da Bridge é justamente o momento onde a Cloud CONHECE o hash pela primeira vez, a Cloud não tem como verificar o HMAC sem confiar no payload! Se a Station é a fonte da verdade daquela configuração, e a Station é quem passa a credencial para a Nuvem, a arquitetura com Bridge Token compartilhado não garante Proof de Bridge. Para validar efetivamente, a Bridge deve usar uma chave que a Station desconheça (PKI) ou que já foi pré-provisionada de modo trust-anchor na Cloud.
