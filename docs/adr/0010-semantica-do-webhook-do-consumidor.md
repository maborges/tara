# Semântica de resposta do webhook

O consumidor confirma um evento com `2xx`; `409` significa duplicidade já processada quando explicitamente suportado; `4xx` indica erro permanente de contrato ou autenticação; `5xx` e timeout permitem retry com backoff. O processamento pesado ocorre no consumidor após a aceitação, usando `event_id` para idempotência.
