# Checklist Diário de Monitoramento do Piloto

Realize essas verificações diárias utilizando as APIs disponíveis para garantir a continuidade operacional, já que um dashboard administrativo unificado completo não será implementado na Fase 1.

## Inspeções de Sistema (Nível 2)
*(Realizar via Postman/Curl contra o backoffice com token de Admin)*

- [ ] **Station Online**: Fazer requisição GET `/v1/portal/stations`. Todas as estações do piloto estão retornando status regular e o campo `last_seen` ou equivalente está atualizado nas últimas 24h?
- [ ] **Integração Bridge-Station**: Foi recebida alguma falha no monitoramento de logs do servidor reportando validações de challenge/proof falhas nas últimas 24h?
- [ ] **Fila Offline Saudável**: A API de pesagens ou o dashboard local reporta um número razoável ou 0 pendências? (Verificar na PWA).
- [ ] **Delivery Pendente**: Executar a query SQL de diagnóstico (somente leitura) no banco, caso aplicável, para checar a fila de saída do Outbox:
  ```sql
  SELECT count(*) FROM balanca.delivery_receipts WHERE status = 'PENDING' AND created_at < NOW() - INTERVAL '1 hour';
  ```
  *(Deve ser zero ou próximo de zero, indicando que o cliente está puxando ou o Webhook está disparando).*
- [ ] **Delivery Acknowledged**: Verificar se o status transicionou para `ACKNOWLEDGED`.
- [ ] **Incidentes**: Consultar o ITSM (chamados reportados pelos usuários relatando problemas físicos).
