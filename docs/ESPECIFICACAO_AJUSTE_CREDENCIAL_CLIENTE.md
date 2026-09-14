# Especificação para ajuste da aplicação cliente

## Objetivo

Adequar a aplicação cliente à nova autenticação de integrações da TARA.

A aplicação continuará usando uma credencial formada por:

- `client_id`: identificador público da aplicação;
- `client_secret`: segredo privado usado para autenticação.

O `tenant_id` deixará de ser enviado pelo sistema consumidor. A TARA passará a
resolver a Conta e o tenant a partir do `client_id` e do `client_secret`.

## Mudança principal

### Contrato atual

As requisições de integração enviam três informações nos headers:

```http
X-Tenant-ID: <tenant_uuid>
X-Balanca-Client-ID: <client_id>
X-Balanca-Client-Secret: <client_secret>
```

### Novo contrato

Depois da mudança no TARA, as requisições de integração deverão enviar apenas:

```http
X-Balanca-Client-ID: <client_id>
X-Balanca-Client-Secret: <client_secret>
```

O cliente não deverá substituir esses headers por uma API Key adicional, JWT,
Basic Auth ou outro formato sem que isso seja definido em uma nova versão do
contrato.

## Alterações obrigatórias na aplicação cliente

### 1. Centralizar a montagem da autenticação

Localizar o cliente HTTP da TARA e garantir que todos os endpoints de
integração utilizem uma única função ou middleware para inserir:

```http
X-Balanca-Client-ID
X-Balanca-Client-Secret
```

Remover a inclusão automática de `X-Tenant-ID` nas chamadas autenticadas pelo
API Client.

Não remover o `tenant_id` dos modelos de negócio da aplicação cliente quando
ele for necessário para o próprio domínio. A mudança é somente no transporte
da autenticação para a TARA.

### 2. Manter o armazenamento da credencial

Continuar armazenando o par `client_id` e `client_secret` em um secret manager
ou mecanismo equivalente protegido.

Regras obrigatórias:

- nunca armazenar o `client_secret` em código-fonte, banco de dados público,
  frontend ou arquivo de configuração versionado;
- nunca registrar o segredo em logs, traces, métricas ou mensagens de erro;
- não enviar o segredo em query string ou no corpo JSON;
- não exibir o segredo em telas ou respostas de negócio;
- tratar o `client_id` como identificador, não como segredo suficiente.

### 3. Não usar `tenant_id` para autenticar

O cliente não deverá:

- tentar descobrir ou testar tenants diferentes com a mesma credencial;
- escolher o tenant da TARA com base em configuração enviada pelo usuário;
- considerar o `tenant_id` retornado pela API como prova de autenticação;
- repetir uma chamada alterando tenant após receber `401` ou `403`.

O `tenant_id` não faz parte do contrato público do Portal. Se aparecer em
alguma resposta legada durante a transição, deve ser ignorado e não armazenado
na sessão do cliente.

### 4. Preservar os escopos

Os escopos continuam sendo a forma de autorização da aplicação. A aplicação
deve solicitar e usar somente os escopos necessários:

- `clients:write` para registrar o sistema consumidor;
- `orders:write` para criar ordens;
- `orders:read` para consultar ordens;
- `weighings:read` para consultar pesagens;
- `weighings:reconcile` para reconciliar pesagens avulsas;
- `events:read` para consultar eventos;
- `stations:activate` para participar da ativação de estações;
- `webhooks:read` e `webhooks:manage` para administrar webhook;
- `webhooks:replay` para solicitar replay.

Um erro `403` por escopo insuficiente não deve ser tratado como falha de
senha, nem resolvido trocando headers de tenant.

### 5. Tratar respostas de autenticação

Implementar o seguinte comportamento:

- `401`: interromper a operação, registrar apenas o endpoint e o código de
  erro, e acionar o fluxo operacional de credencial inválida, expirada,
  revogada ou rotacionada;
- `403`: informar falta de autorização/escopo e não tentar novas credenciais
  automaticamente;
- `5xx` ou timeout: aplicar retry com backoff, sem alterar a credencial;
- não fazer retry automático infinito para `401` ou `403`.

Após uma rotação no Portal, o novo `client_secret` deverá substituir o antigo
no secret manager. Durante a janela de transição configurada pelo TARA, o
cliente pode continuar usando o segredo antigo enquanto a atualização segura
do secret manager não estiver concluída, mas deve migrar para o novo segredo o
quanto antes.

## O que não muda

As seguintes regras permanecem válidas:

- `client_id` e `client_secret` continuam sendo emitidos pelo Portal;
- o segredo é exibido somente na criação ou rotação;
- criação, rotação e revogação continuam sendo operações administrativas;
- escopos continuam controlando as ações permitidas;
- expiração e revogação continuam inválidando a credencial;
- idempotência de ordens, pesagens e eventos continua sendo responsabilidade
  do cliente;
- webhook continua usando seu próprio segredo HMAC;
- token da estação continua sendo uma credencial distinta, quando a aplicação
  também operar uma estação física;
- JWT de usuário continua sendo usado somente para Portal/Backoffice, não para
  autenticar o sistema consumidor.

## Compatibilidade durante a implantação

A alteração deverá ser implantada em duas fases.

### Fase 1 — preparação do cliente

Antes da alteração definitiva no TARA:

1. centralizar a montagem dos headers;
2. tornar o envio de `X-Tenant-ID` configurável e removível;
3. adicionar testes que comprovem que o cliente consegue executar as chamadas
   usando somente `client_id` e `client_secret`;
4. manter, temporariamente, uma opção de compatibilidade para o header antigo;
5. não ativar a remoção definitiva até o endpoint sem `X-Tenant-ID` estar
   disponível no ambiente de homologação do TARA.

### Fase 2 — ativação do novo contrato

Depois que o TARA aceitar o novo contrato:

1. desativar o envio de `X-Tenant-ID` por padrão;
2. executar os testes de homologação;
3. monitorar respostas `401`, `403` e `5xx`;
4. remover a opção de compatibilidade após o período acordado;
5. atualizar a documentação operacional e os exemplos de integração.

Durante a transição, o cliente não deve enviar dois tenants nem escolher um
tenant diferente em tentativas sucessivas. A compatibilidade deve existir
somente para permitir a troca controlada do contrato.

## Cenários de aceite

A IA da aplicação cliente deverá criar ou atualizar testes para comprovar que:

1. uma chamada válida sem `X-Tenant-ID` é aceita pelo TARA;
2. a Conta retornada pertence ao `client_id` autenticado;
3. uma chamada com `client_id` válido e `client_secret` inválido retorna `401`;
4. uma credencial revogada retorna `401`;
5. uma credencial expirada retorna `401`;
6. uma chamada sem o escopo necessário retorna `403`;
7. a aplicação não tenta trocar tenant depois de `401` ou `403`;
8. timeout e `5xx` podem ser repetidos sem recriar a credencial;
9. rotação do segredo permite atualizar o secret manager sem duplicar ordens,
   pesagens ou eventos;
10. nenhum segredo aparece nos logs ou mensagens de erro;
11. webhook continua validando HMAC independentemente da credencial usada para
    consultar a API;
12. operações de estação continuam usando o fluxo próprio de token da estação.

## Resultado esperado

Ao final, a aplicação cliente deverá considerar a credencial da TARA como um
par `client_id` + `client_secret`, sem depender de `X-Tenant-ID` para
autenticação ou seleção da Conta. O tenant poderá continuar existindo no
domínio interno do cliente, mas não será mais uma informação de segurança
enviada ao TARA.
