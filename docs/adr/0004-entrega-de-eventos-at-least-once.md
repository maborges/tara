# Entrega de eventos at-least-once

Eventos de pesagem são publicados por outbox com entrega at-least-once, identificador único, retries, dead-letter e replay explícito; consumidores devem processar por `event_id` de forma idempotente e tolerar chegada fora de ordem. Essa escolha evita prometer exatamente-uma-vez em uma integração HTTP distribuída.
