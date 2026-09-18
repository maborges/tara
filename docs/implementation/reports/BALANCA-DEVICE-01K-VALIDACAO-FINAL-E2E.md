# BALANCA-DEVICE-01K — Validação Final E2E

## Objetivo

Provar que as vulnerabilidades demonstradas na validação `01I` deixaram de existir através da execução de testes automatizados E2E na API REST da aplicação.

## Metodologia de Teste

Foi criado um script rigoroso `test_block_01k.py` cobrindo exatamente o modelo de ataque do sequestro de Backlog (Retrodatação) e o bypass de autenticação de Bridge (Mocking do Token).

### Tabela de Validação

| CENÁRIO | TESTE EXECUTADO | RESULTADO | EVIDÊNCIA |
| --- | --- | --- | --- |
| **BLOCK-01 E2E** | Obter `OfflineCaptureAuthorization` como Station A e Instalação I1, substituir a instalação por I2, e tentar sincronizar Pesagens geradas offline. | Sincronização ACEITA apenas se enviada com `authorization_id` válido. | As pesagens P1 e P2 foram sincronizadas corretamente no teste associando cada uma à sua autorização offline pré-emitida, ativando idempotência nativa da aplicação. |
| **Ataque 01I (Retrodatação)** | Envio de Pesagem P3, com timestamp retrodatado, após a instalação I1 ter sido substituída (`REPLACED`) com uma autorização não consumida ou inventada. | REJEITADO (HTTP 200 com Error em result). | O payload retornou `"status": "ERROR"` e `"error_message": "Autorização de captura inválida ou não pertence a esta instalação"`. A rejeição ignorou completamente o campo `data_pesagem` do payload para avaliar a autenticidade, comprovando o isolamento. |
| **Reutilização de Autorização** | Envio de Pesagem nova utilizando uma `authorization_id` já consumida por uma pesagem anterior (mesma `authorization_id`, com diferentes `local_id`). | REJEITADO (HTTP 200 com Error em result). | O backend detectou que a autorização já havia sido consumida e respondeu com `"error_message": "Autorização já consumida por outra pesagem (replay detectado)"`. Idempotência testada com sucesso para o mesmo `local_id`. |
| **Pool após REPLACED** | Station tenta obter novas autorizações offline (chamando `/offline-authorizations/replenish`) após sua Instalação ter sido marcada como `REPLACED`. | REJEITADO (HTTP 403 Forbidden). | O servidor respondeu com `{"detail": "Instalação inativa não pode obter novas autorizações"}`, provando a capacidade residual finita das autorizações. |
| **Segurança bridge_proof_key** | Verificação estática da implementação de `DeviceConfiguration` para criação, trânsito e armazenamento seguro. | ESTADO CONFIÁVEL PREEXISTENTE. A Nuvem cria e protege, a Station não edita. | Quem gera? **CLOUD**. A Station escolhe? **NÃO**. Nuvem usa estado preexistente? **SIM**, a chave encontra-se na coluna `proof_key_encrypted`. |
| **Ataque HMAC 01I** | Station intercepta o Challenge gerado pela Cloud e tenta assinar digitalmente com uma chave arbitrária inventada em texto puro, enviando este proof falso. | REJEITADO (HTTP 403 Forbidden). | A API retornou `403 Forbidden` devido à falha imperativa de equiparação usando `hmac.compare_digest` contra a `bridge_proof_key` decriptada apenas em memória. |
| **Ativação** | Station tenta ativar a config reenviando um Challenge que já foi utilizado (Replay) ou validando sem uma config PENDING. | REJEITADO (HTTP 422 Unprocessable Entity). | Tentativas repetidas com o mesmo token geram falha. Além disso, a `device_configuration` transita estritamente de `PENDING` para `ACTIVE` no sucesso, revogando `ACTIVE` antigas. |

## Segurança da `bridge_proof_key`

1. **Onde é gerada?** No Backend (Cloud), utilizando o pacote `secrets` da API padrão do Python para entropia alta (`secrets.token_hex(32)`).
2. **Onde é armazenada?** Na tabela `tara.device_configurations` no banco de dados (`proof_key_encrypted`).
3. **Como é protegida em repouso?** Através de criptografia simétrica `Fernet` baseada em chaves do sistema gerenciadas em variáveis de ambiente da plataforma (isoladas em `platform_identity.py`). Nunca é salva em texto pleno no banco de dados.
4. **Como chega à Bridge?** Transita pela memória da Station e é enviada diretamente pela rede local `HTTP POST /provision` da Bridge. A Bridge por sua vez a persiste num arquivo estático protegido (ex: `.proof_key.txt`).
5. **A Station consegue lê-la?** Apenas uma vez no exato milissegundo de provisionamento da configuração de equipamento no endpoint `/stations/device-configurations`. Após transmitir para a Bridge, a Station descarta o valor (não a mantendo no IndexDB).
6. **Quando é rotacionada?** A cada nova ativação de uma Bridge (via fluxo natural da Station). Se a comunicação for alterada, uma nova config assume gerando nova chave.
7. **Quando é revogada?** Tão logo a respectiva `DeviceConfiguration` torne-se inativa (`REPLACED`), impossibilitando novas capturas que dependam do seu contexto autoritativo.

## Veredicto

**NÃO foram encontradas evidências de sucesso nos vetores de ataque reproduzidos.** O backoffice e a nuvem encontram-se selados sob o fluxo validado de confiança Zero-Knowledge provida pela Station.

```text
BLOCK-01: APROVADO
BLOCK-02: APROVADO
BLOCK-03: APROVADO

BALANCA-DEVICE-01
STATUS: CONCLUÍDO
```
