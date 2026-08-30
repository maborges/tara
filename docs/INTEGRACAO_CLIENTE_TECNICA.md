# Integração técnica com a Plataforma TARA

Este documento é o contrato para uma aplicação cliente integrar-se à TARA. A aplicação cliente não deve acessar o banco, importar módulos internos ou depender da implementação do Portal. Use apenas os endpoints versionados e o contrato JSON descrito aqui.

## 1. Conceitos

- **Conta**: unidade consumidora da TARA. Toda operação pertence a uma Conta.
- **API Client**: credencial técnica usada por um sistema consumidor. O `client_id` identifica a credencial; o `client_secret` é exibido somente na criação ou rotação.
- **Ordem de pesagem**: solicitação criada pelo cliente antes da captura.
- **Pesagem**: fato físico confirmado pela estação. Pode ser vinculada a uma ordem ou avulsa.
- **Capture ID**: identificador estável gerado pelo produtor da captura. Reenvios devem reutilizar o mesmo valor.
- **Outbox**: registro durável usado para entrega assíncrona do evento de conclusão.

## 2. Ambientes e autenticação

Base URL de exemplo: `https://tara.example.com`.

### API Client

Para endpoints de integração, envie sempre:

```http
X-Tenant-ID: <tenant_uuid>
X-Balanca-Client-ID: <client_id>
X-Balanca-Client-Secret: <client_secret>
Content-Type: application/json
```

O segredo não deve ser enviado em query string, logado ou armazenado em frontend público. Permissões são atribuídas por escopo:

| Escopo | Uso |
|---|---|
| `clients:write` | registrar a identificação do sistema cliente |
| `orders:write` | criar Ordens de pesagem |
| `orders:read` | consultar Ordens |
| `weighings:read` | consultar Pesagens |
| `weighings:reconcile` | reconciliar Pesagens avulsas |
| `events:read` | consultar eventos |
| `stations:activate` | ativar estação |
| `webhooks:read` | consultar configuração de webhook |
| `webhooks:manage` | configurar webhook |
| `webhooks:replay` | solicitar replay |

Respostas de autenticação: `400` para tenant malformado, `401` para credencial ausente/inválida/expirada, `403` para escopo insuficiente. Nunca tente contornar um `403` trocando o header de tenant.

## 3. Fluxo recomendado

1. O administrador cria um API Client no Portal.
2. A aplicação cliente armazena o `client_id` e o `client_secret` em um secret manager.
3. A aplicação registra sua identificação em `POST /v1/clients`.
4. A aplicação cria Ordens em `POST /v1/orders` quando houver processo prévio.
5. A estação sincroniza Ordens pendentes por `GET /v1/stations/sync/pull`.
6. A estação envia cada captura por `POST /v1/stations/pesagens` ou em lote por `POST /v1/stations/sync/push`.
7. A aplicação cliente consome o webhook e/ou consulta `GET /v1/weighings` usando cursor.
8. Pesagens avulsas são reconciliadas por `POST /v1/weighings/{weighing_id}/reconcile`.

## 4. Registrar o sistema cliente

```http
POST /v1/clients
X-Tenant-ID: <tenant_uuid>
X-Balanca-Client-ID: <client_id>
X-Balanca-Client-Secret: <client_secret>
```

```json
{
  "sistema_cliente": "agrosaas",
  "tenant_cliente_id": "fazenda-123",
  "nome_exibicao": "AgroSaaS produção"
}
```

O trio `sistema_cliente` + `tenant_cliente_id` identifica o sistema externo dentro da Conta. Repetir o cadastro atualiza o nome, sem criar outro cliente.

## 5. Criar uma Ordem

```http
POST /v1/orders
X-Tenant-ID: <tenant_uuid>
X-Balanca-Client-ID: <client_id>
X-Balanca-Client-Secret: <client_secret>
```

```json
{
  "client_system": "agrosaas",
  "client_tenant_id": "fazenda-123",
  "external_reference": "compra-2026-00042",
  "correlation_id": "nf-35260812345678901234550010000000421000000420",
  "subject_type": "VEICULO",
  "tipo_pesagem": "DUPLA",
  "contexto": {
    "veiculo": {"placa": "ABC1D23"},
    "motorista": {"nome": "Nome do motorista"},
    "produto": {"codigo": "SOJA"},
    "documento_fiscal": {"numero": "42", "chave_acesso": "..."}
  },
  "data_agendada": "2026-08-28T14:00:00Z"
}
```

`external_reference` e `correlation_id` são obrigatórios e devem ser estáveis. A TARA devolve `409` quando a referência já está em conflito com outra Ordem.

## 6. Pesagem vinculada ou avulsa

### Captura individual

`ordem_id` é opcional. Para Pesagem avulsa, omita-o ou envie `null`.

```json
{
  "ordem_id": null,
  "local_id": "station-01:20260828:000042",
  "etapa": "UNICA",
  "peso_aferido_kg": "38450.000",
  "peso_informado_kg": null,
  "peso_tara_kg": "12000.000",
  "captured_via": "ELETRONICA",
  "operador_id": "00000000-0000-0000-0000-000000000001",
  "leitura_bruta": {"indicador": "stable", "raw": "..."},
  "data_pesagem": "2026-08-28T14:03:12Z",
  "direcao_veiculo": "ENTRADA",
  "natureza_mercadoria": "ENTRADA",
  "tipo_operacao": "COMPRA",
  "contexto": {
    "veiculo": {"placa": "ABC1D23"},
    "produto": {"codigo": "SOJA"},
    "origem": {"descricao": "Talhão 4"},
    "destino": {"descricao": "Armazém"}
  }
}
```

Regras:

- `local_id` é obrigatório e idempotente por Conta.
- `estacao_id` é atribuído pelo serviço a partir do token da estação; a aplicação cliente não deve enviá-lo nem tentar substituí-lo.
- `peso_aferido_kg` deve ser decimal estritamente positivo.
- `data_pesagem` preserva o momento físico; não o substitua durante retry.
- `direcao_veiculo` é `ENTRADA` ou `SAIDA`.
- `natureza_mercadoria` é `ENTRADA`, `SAIDA` ou `NEUTRA` e não deve ser deduzida somente da direção física.
- O registro confirmado não deve ser editado; reconciliação altera apenas vínculo e estado.

### Sincronização em lote

```json
{
  "items": [
    {
      "local_id": "station-01:20260828:000042",
      "payload": { "local_id": "station-01:20260828:000042", "ordem_id": null, "estacao_id": "uuid-da-estacao", "etapa": "UNICA", "peso_aferido_kg": "38450.000", "peso_tara_kg": "12000.000", "captured_via": "ELETRONICA", "data_pesagem": "2026-08-28T14:03:12Z", "direcao_veiculo": "ENTRADA", "natureza_mercadoria": "ENTRADA", "tipo_operacao": "COMPRA", "contexto": {} }
    }
  ]
}
```

O resultado é por item. Um item com erro não deve apagar o sucesso dos demais; armazene os itens `ERROR` para novo envio com o mesmo `local_id`.

## 7. Consulta com cursor

```http
GET /v1/weighings?limit=100&status=NAO_RECONCILIADA
```

Resposta:

```json
{
  "items": [
    {
      "id": "uuid",
      "ordem_id": null,
      "local_id": "station-01:20260828:000042",
      "etapa": "UNICA",
      "peso_aferido_kg": "38450.000",
      "peso_tara_kg": "12000.000",
      "captured_at": "2026-08-28T14:03:12Z",
      "reconciliation_status": "NAO_RECONCILIADA",
      "contexto": {}
    }
  ],
  "next_cursor": "opaque-token"
}
```

Nunca fabrique ou interprete o cursor. Repita-o literalmente na próxima requisição. Ao receber `next_cursor: null`, a página foi concluída. Para sincronização durável, persista o cursor somente depois de processar e confirmar a página.

O Backoffice dispõe de uma consulta operacional tenant-scoped para conferência
humana:

```http
GET /v1/admin/weighings?status=PENDENTE_RECONCILIACAO
Authorization: Bearer <JWT_DO_BACKOFFICE>
X-Tenant-ID: <TENANT_ID>
```

A reconciliação manual usa `POST
/v1/admin/weighings/{weighing_id}/reconcile` com o mesmo corpo de
reconciliação descrito acima e exige `backoffice:pesagens:importar`. O peso
capturado é imutável; somente o status de reconciliação e o vínculo com a
ordem são atualizados.

Para uma falha de entrega, um administrador pode reenfileirar o mesmo evento:

```http
POST /v1/admin/events/{event_id}/replay
Authorization: Bearer <JWT_DO_BACKOFFICE>
X-Tenant-ID: <TENANT_ID>
```

O replay não cria outro evento e não altera seu payload ou sua chave de
idempotência. Ele apenas retorna o estado para `PENDENTE`, remove o horário
agendado e libera uma nova tentativa imediata pelo worker.
Cada operação é registrada em `GET /v1/admin/events/{event_id}/replays`, com
usuário, horário, estado anterior e motivo.

No Backoffice, o Outbox exibe também `attempts`, `last_error`,
`next_attempt_at` e `delivered_at`. Esses campos permitem distinguir uma
entrega concluída, uma falha aguardando retry e uma falha reenfileirada
manualmente.
Quando um tipo não estiver na lista `event_types` ativa da Conta, o worker não
faz a chamada HTTP e marca o Outbox como `DESABILITADO`, sem consumir novas
tentativas.

Administradores do Portal podem consultar e atualizar usuários da própria
Conta por `GET /v1/portal/users` e `PUT /v1/portal/users/{user_id}`. O corpo do
PUT aceita `role` (`OWNER`, `ADMIN` ou `MEMBER`) e `status` (`ATIVO` ou
`INATIVO`). O próprio usuário não pode desativar o próprio acesso.

## 8. Reconciliação

Vincular a uma Ordem existente:

```json
{"status": "VINCULADA", "ordem_id": "uuid-da-ordem"}
```

Criar uma Ordem a partir da Pesagem:

```json
{
  "status": "CRIAR_ORDEM",
  "ordem": {
    "client_system": "agrosaas",
    "client_tenant_id": "fazenda-123",
    "external_reference": "avulsa-2026-00042",
    "correlation_id": "avulsa-2026-00042",
    "subject_type": "VEICULO",
    "tipo_pesagem": "UNICA",
    "contexto": {}
  }
}
```

Para encaminhar a revisão, use `status: "PENDENTE_RECONCILIACAO"`. Para rejeitar o registro, use `status: "REJEITADA"`. A captura física permanece imutável.

## 9. Webhook e HMAC

O evento `balanca.pesagem.concluida.v1` é entregue pelo Outbox por Conta quando o destino estiver configurado. A aplicação receptora deve aceitar rapidamente, persistir o `event_id` e processar o negócio depois. A configuração administrativa de destino por Conta ainda é uma lacuna do Portal TARA; até ela ser entregue, o destino é configurado operacionalmente no ambiente do worker.

Headers:

```http
X-TARA-Event-Id: <event_id>
X-TARA-Account-Id: <account_id>
X-TARA-Timestamp: <unix_seconds>
X-TARA-Signature: sha256=<base64_digest>
```

Assinatura:

```text
message = POST + "\n" + request_path + "\n" + timestamp + "\n" + raw_body
digest = Base64(HMAC-SHA256(hmac_secret, message))
```

O corpo deve ser os bytes recebidos, antes de reserializar JSON. Rejeite timestamp fora da janela configurada, assinatura inválida, `event_id` divergente ou `account_id` divergente. Compare o digest em tempo constante.

Exemplo Python:

```python
import base64, hashlib, hmac, time

def verify_tara(headers: dict[str, str], path: str, body: bytes, secret: str) -> None:
    timestamp = headers["X-TARA-Timestamp"]
    received = headers["X-TARA-Signature"].removeprefix("sha256=")
    if abs(time.time() - int(timestamp)) > 300:
        raise ValueError("timestamp expirado")
    message = b"\n".join((b"POST", path.encode(), timestamp.encode(), body))
    expected = base64.b64encode(hmac.new(secret.encode(), message, hashlib.sha256).digest()).decode()
    if not hmac.compare_digest(expected, received):
        raise ValueError("assinatura inválida")
```

O segredo deve ser recebido pelo canal administrativo seguro e armazenado em secret manager. Não coloque HMAC em código, frontend, URL ou logs.

## 10. Idempotência, respostas e retry

No webhook:

| Resposta | Significado |
|---|---|
| `2xx` | evento aceito e persistido |
| `409` | duplicidade já processada, somente se a aplicação suportar essa convenção |
| `400`/`401`/`422` | erro permanente de contrato ou autenticação |
| `5xx` | falha temporária; TARA poderá tentar novamente |
| timeout | trate como resultado desconhecido e consulte o `event_id` antes de reaplicar |

O consumidor deve ter uma tabela de eventos recebidos com índice único em `event_id`. O processamento deve ser transacional: registre a chegada, aplique o efeito de negócio e marque o evento processado. Se falhar, devolva `5xx` ou repita internamente conforme sua política.

## 11. Exemplo mínimo de receptor FastAPI

```python
@app.post("/integrations/tara/events", status_code=204)
async def receive(request: Request):
    body = await request.body()
    verify_tara(dict(request.headers), request.url.path, body, secret_from_vault())
    envelope = json.loads(body)
    if await event_store.exists(envelope["event_id"]):
        return Response(status_code=204)
    await event_store.accept(envelope)
    return Response(status_code=204)
```

Responda somente depois que a aceitação durável estiver concluída. Não faça chamadas lentas ao ERP antes da resposta.

## 12. Checklist de homologação

- [ ] API Client criado e segredo guardado fora do código.
- [ ] Sistema cliente registrado com identificadores estáveis.
- [ ] Ordem criada e localizada na estação.
- [ ] Pesagem vinculada processada uma vez.
- [ ] Pesagem avulsa capturada e reconciliada.
- [ ] Reenvio do mesmo `local_id` não duplica a Pesagem.
- [ ] Consulta por cursor retomada após interrupção.
- [ ] Webhook validado com corpo bruto e HMAC correto.
- [ ] Timestamp expirado rejeitado.
- [ ] `event_id` duplicado não reaplica negócio.
- [ ] `5xx` e timeout exercitados com retry.
- [ ] Tenant/Conta de outro cliente rejeitado.
- [ ] Segredos e payloads sensíveis ausentes dos logs.
