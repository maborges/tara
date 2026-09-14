# Implantação da integração do cliente com a TARA

Este é o guia operacional para colocar a integração em produção. O cliente
pode escolher entre consumir a API, receber eventos por Webhook ou utilizar os
dois mecanismos simultaneamente. A API é sempre o mecanismo de consulta e
recuperação; o Webhook é opcional e serve para receber notificações em tempo
real.

## 1. Escolha do modelo de integração

### API por consulta

Recomendada para clientes que não possuem uma aplicação pública ou que usam um
ERP fechado. O sistema do cliente consulta periodicamente as Ordens e Pesagens,
usando paginação por cursor.

Use este modelo quando:

- a simplicidade de implantação for prioridade;
- o cliente aceitar alguns minutos de latência;
- a infraestrutura do ERP não puder receber chamadas externas;
- a equipe quiser controlar o momento da sincronização.

### Webhook

Recomendado quando o cliente precisa reagir rapidamente à conclusão de uma
Pesagem. A aplicação do cliente precisa ter um endpoint HTTPS público para
receber os eventos assinados pela TARA.

Use este modelo quando:

- o sistema precisar de atualização quase em tempo real;
- o cliente possuir infraestrutura para receber requisições HTTPS;
- a equipe puder implementar HMAC, idempotência e monitoramento de retries.

### Modelo híbrido

É o modelo recomendado para operações críticas: o Webhook avisa que houve uma
alteração e a API fornece a confirmação e a recuperação. O cliente não deve
considerar o Webhook como a única fonte de dados.

## 2. Preparação comum

1. Crie e confirme o acesso do administrador no Portal do Cliente.
2. Abra **API Keys → Nova API Key**.
3. Dê um nome identificável, como `ERP produção`.
4. Conceda somente os escopos necessários:
   - `clients:write` para registrar o sistema consumidor;
   - `orders:write` para criar Ordens;
   - `orders:read` para consultar Ordens;
   - `weighings:read` para consultar Pesagens;
   - `weighings:reconcile` se o sistema tratar Pesagens avulsas;
   - `events:read` para acompanhar eventos;
   - `stations:activate` se o sistema participar da ativação de Estações.
5. Salve o `client_id` e o `client_secret` em um secret manager. O segredo
   não será exibido novamente.
6. Registre o sistema em `POST /v1/clients` usando identificadores estáveis.
7. Faça uma chamada de teste e confirme que a `account_id` retornada é a
   esperada.

## 3. Implantação usando a API

O sistema consumidor deve:

1. Criar Ordens com `POST /v1/orders` quando houver uma operação planejada.
2. Consultar Ordens com `GET /v1/orders?limit=100`.
3. Persistir o `next_cursor` somente depois de processar a página inteira.
4. Repetir o cursor literalmente na próxima consulta até receber `null`.
5. Consultar Pesagens com `GET /v1/weighings?limit=100` seguindo o mesmo
   procedimento.
6. Usar `event_id`, `capture_id` e `local_id` como chaves idempotentes.
7. Repetir a sincronização periodicamente para recuperar indisponibilidades.

Em caso de falha durante o processamento, o sistema deve repetir a página a
partir do último cursor confirmado. Ele não deve avançar o cursor antes de
gravar os dados com sucesso.

Exemplo de resposta paginada:

```json
{
  "items": [],
  "next_cursor": "cursor-opaco-ou-null"
}
```

## 4. Implantação usando Webhook

Antes de configurar a TARA, o cliente deve criar um endpoint, por exemplo:

```text
POST https://erp.exemplo.com/integracoes/tara/webhook
```

O endpoint deve:

1. Ler o corpo bruto da requisição.
2. Validar `X-TARA-Timestamp` dentro da janela permitida.
3. Validar `X-TARA-Signature` com HMAC-SHA256.
4. Conferir `X-TARA-Account-Id`.
5. Gravar o `event_id` com índice único.
6. Responder `2xx` somente depois da aceitação durável.
7. Processar o negócio de forma assíncrona.
8. Responder `5xx` em falhas temporárias para permitir novo envio.

No Portal:

1. Abra **Webhook**.
2. Informe a URL HTTPS.
3. Informe um segredo HMAC com pelo menos 32 caracteres.
4. Defina o máximo de tentativas e a base do retry.
5. Salve a configuração.
6. Clique em **Enviar teste**.
7. Confirme o recebimento do evento `tara.webhook.test.v1`.
8. Faça uma pesagem de homologação e confirme o evento
   `balanca.pesagem.concluida.v1`.

O teste valida a conectividade, a assinatura e a capacidade de resposta do
endpoint. Ele não cria uma Pesagem.

## 5. Alternar entre API e Webhook

A alternância não exige alteração nas Ordens ou Pesagens já registradas.

### Começar pela API e habilitar Webhook depois

1. Mantenha a sincronização periódica ativa.
2. Configure o endpoint no Portal.
3. Envie o evento de teste.
4. Faça uma pesagem de homologação.
5. Ative o processamento de eventos no cliente.
6. Continue consultando a API como reconciliação e recuperação.

### Usar Webhook e voltar temporariamente para a API

1. Mantenha o último cursor confirmado pelo sincronizador.
2. Detecte a indisponibilidade ou desative o Webhook no fluxo operacional.
3. Execute a consulta incremental de Ordens e Pesagens.
4. Reprocesse somente identificadores ainda não aceitos.
5. Depois que o endpoint voltar, faça novo teste e retome os eventos.

### Alternar o modo de recebimento

No Portal, alterne para **Somente API** para interromper as entregas. O destino
permanece armazenado e pode ser reativado escolhendo **API + Webhook**. O cliente
deve manter a rotina de consulta por cursor em qualquer modo. Os dados continuam
disponíveis pela API; não é necessário recriar a API Key nem as Ordens.

## 6. Homologação e operação

Antes de entrar em produção, confirme:

- API Key armazenada com segurança;
- sistema cliente registrado;
- Ordem criada e localizada pela Estação;
- Pesagem recebida uma única vez;
- sincronização incremental retomada após interrupção;
- Webhook testado, quando utilizado;
- assinatura HMAC validada;
- duplicidade de `event_id` não reaplica o negócio;
- falha `5xx` gera retry;
- payloads e segredos não aparecem nos logs.

Para detalhes de payloads, headers, assinatura e endpoints, consulte o
[contrato técnico da integração](INTEGRACAO_CLIENTE_TECNICA.md).
