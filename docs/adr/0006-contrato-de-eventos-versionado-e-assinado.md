# Contrato de eventos versionado e assinado por Conta

O evento `balanca.pesagem.concluida.v1` usa campos públicos em `snake_case`, preserva `occurred_at` e `received_at`, e evolui por versões quando houver mudança incompatível. Cada entrega é assinada por HMAC com credencial da Conta, aceita somente após resposta `2xx` (ou `409` idempotente explicitamente definido), e inclui dados suficientes para consumidores processarem pesagens vinculadas e avulsas.
