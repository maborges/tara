# Integrações

Este contexto define a fronteira contratual entre a Plataforma Balança e os sistemas consumidores.

**Referência externa**:
Identificador fornecido pelo sistema consumidor para correlacionar uma ordem ou pesagem com seu próprio domínio.
_Evitar_: usar como identificador interno da Balança

**Evento de pesagem concluída**:
Notificação versionada de que a Plataforma Balança confirmou uma pesagem.
_Evitar_: evento sem versão

**Envelope**:
Estrutura transportada para o consumidor, contendo identidade do evento, tipo, ocorrência, correlação, referência externa e payload.
_Evitar_: expor modelos internos do banco

**Evento de pesagem concluída v1**:
Contrato versionado cujo envelope usa campos públicos em `snake_case`, incluindo `event_id`, `event_type`, `event_version`, `occurred_at`, `received_at`, `account_id`, `entity_id` e `payload`.
_Evitar_: prefixar campos públicos com `TARA_`

**Outbox**:
Registro durável de evento que aguarda entrega ao sistema consumidor.
_Evitar_: considerar uma chamada HTTP síncrona como garantia de publicação

**Entrega at-least-once**:
Garantia de que um evento pode ser entregue uma ou mais vezes até ser aceito, exigindo idempotência no consumidor.
_Evitar_: exatamente-uma-vez

**Replay**:
Reenvio explícito e auditável de um evento já registrado.
_Evitar_: reenviar silenciosamente

**Assinatura HMAC**:
Prova de autenticidade da entrega calculada por Conta sobre método, caminho, timestamp e corpo bruto da requisição.
_Evitar_: tratar um Bearer token global como assinatura do evento

**Entrega aceita**:
Resposta `2xx` do consumidor; um `409` só é aceito como sucesso quando o contrato o identifica explicitamente como evento já processado.
_Evitar_: considerar qualquer resposta HTTP como confirmação

**Recebido em**:
Momento em que a Plataforma Balança recebe e confirma uma captura, distinto do momento em que a estação realizou o fato físico.
_Evitar_: sobrescrever `occurred_at` durante retry ou reconciliação

**Sistema consumidor**:
Aplicação que recebe o contrato da Balança e traduz o evento para seu domínio, sem acessar o banco da Balança.
_Evitar_: acoplamento por importação de código interno

**API de consulta**:
Canal autenticado pelo qual o sistema consumidor consulta ordens, pesagens e eventos da própria Conta para integração e reconciliação.
_Evitar_: tratar o Portal como API de integração

**Webhook**:
Entrega HTTP assíncrona de um evento ao endpoint configurado pelo sistema consumidor.
_Evitar_: depender somente de polling

**Cursor**:
Marcador opaco usado para continuar uma consulta de forma estável após falha, sem depender de páginas numéricas.
_Evitar_: paginação por offset para sincronização durável

**Escopo de API**:
Permissão independente concedida a um API Client para uma capacidade específica, como ler pesagens, criar ordens ou repetir webhooks.
_Evitar_: uma credencial com acesso implícito a tudo

**Evento habilitado**:
Tipo de evento que a Conta autorizou para entrega em um de seus webhooks.
_Evitar_: enviar todos os eventos por padrão
