# Inventário funcional — Portal e Backoffice

Atualizado em 2026-08-28. Este inventário distingue contrato/backend de experiência entregue na interface.

## Resumo

| Área | Backend | Portal | Backoffice | Situação |
|---|---|---|---|---|
| Cadastro, login e sessão | Implementado | Implementado | Implementado | Entregue |
| Confirmação e recuperação de e-mail | Implementado | Implementado | N/A | Entregue |
| Perfil e Conta | Implementado | Implementado | Edição de Conta | Parcial |
| API Clients e rotação de segredo | Implementado | Implementado | Implementado | Entregue |
| Clientes consumidores | Implementado | Ausente | Implementado | Parcial |
| Ordens de pesagem | Implementado | Ausente | Consulta Portal/Backoffice | Parcial |
| Pesagens vinculadas | Implementado | Implementado | Consulta Portal/Backoffice | Consulta tenant-scoped |
| Pesagens avulsas | Implementado | Implementado | Consulta Portal/Backoffice | Identificação de pendências |
| Reconciliação de Pesagens avulsas | Implementado | Implementado | Ausente | Ação de vínculo, pendência ou rejeição no Backoffice |
| Estações | Implementado | Ausente | Cadastro/ativação/listagem | Parcial |
| Operadores | Implementado | Ausente | Cadastro/revogação/listagem | Parcial |
| Eventos e Outbox | Implementado | Ausente | Consulta e replay | Parcial |
| Saúde, tentativas e falhas de entrega | Implementado | Ausente | Tentativas, erros e próximo retry | Parcial |
| Replay explícito | Implementado | Ausente | Replay + histórico auditável | Parcial |
| Webhook por Conta | Implementado no TARA e consumidor | Configuração | Ausente | Portal configurável |
| Credencial HMAC por Conta | Implementado no TARA e consumidor | Configuração | Ausente | Segredo criptografado |
| Eventos habilitados por Conta | Implementado | Configuração do evento ativo | Ausente | Worker respeita `event_types` |
| Política de retry por Conta | Implementado | Configuração de limite/base | Ausente | Worker marca `FALHA` ao exceder limite |
| SMTP da plataforma | Implementado | N/A | Implementado | Entregue |

## Inventário detalhado

### Portal do cliente

Entregue: autenticação, cadastro, confirmação de e-mail, recuperação de senha, perfil da Conta e API Clients (criação, listagem, rotação, revogação e recuperação por e-mail).

Entregue: configuração do endpoint, segredo HMAC, evento habilitado e política de retry por Conta. O Portal atualmente expõe o evento de pesagem concluída como opção suportada.

### Backoffice

Entregue: autenticação administrativa, visão geral, Contas, API Clients, ordens, pesagens/reconciliação, estações, operadores, eventos/replay e SMTP.

Replay, histórico auditável e detalhe operacional de cada entrega estão disponíveis no Backoffice/API.

### Backend TARA

Existem rotas para clientes, ordens, consulta de Pesagens com cursor, reconciliação, estações, operadores, sincronização e eventos. A cobertura de UI não acompanha esses contratos.

### Backend AgroSaaS

O consumidor possui ingestão de evento TARA, persistência idempotente, RLS, resolução de HMAC persistido por Conta e endpoints administrativos de credencial. Ainda não há experiência de Portal/Backoffice do AgroSaaS para operar essa configuração.

## Ordem de entrega

1. Gestão de credencial HMAC e webhook por Conta no Portal.
2. Monitoramento de Outbox, tentativas, falhas e replay no Backoffice.
3. Consulta e reconciliação de Pesagens avulsas no Backoffice. (entregue nesta etapa)
4. Consulta operacional de ordens/Pesagens no Portal. (entregue nesta etapa)
5. Eventos habilitados e política de retry por Conta.

Cada item só deve ser marcado como entregue quando possuir contrato protegido, autorização/RLS, tela funcional, estado vazio/loading/erro e teste de fluxo.
