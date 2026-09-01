-- Comentários de propósito das tabelas do serviço Balança.
-- COMMENT ON TABLE é idempotente: pode ser reaplicado sem alterar os dados.

comment on table tara.usuarios is
    'Usuários internos autenticados da operação e do backoffice, associados a uma Conta.';
comment on table tara.administradores_plataforma is
    'Administradores globais autorizados a operar a plataforma sem seleção prévia de tenant.';
comment on table tara.papeis is
    'Papéis de acesso que agrupam permissões atribuíveis a usuários de uma Conta.';
comment on table tara.permissoes is
    'Permissões atômicas que representam capacidades autorizáveis na aplicação.';
comment on table tara.usuario_papeis is
    'Tabela associativa entre usuários e papéis de acesso.';
comment on table tara.papel_permissoes is
    'Tabela associativa entre papéis e permissões.';
comment on table tara.api_clients is
    'Credenciais técnicas de sistemas consumidores, com escopos e estado de acesso.';
comment on table tara.api_client_secrets is
    'Versões de segredos de API mantidas para rotação de credenciais sem indisponibilidade.';
comment on table tara.contas is
    'Organizações consumidoras da plataforma e unidade principal de isolamento dos dados.';
comment on table tara.webhook_destinations is
    'Destino HTTP configurado por uma Conta para receber eventos publicados pela plataforma.';
comment on table tara.outbox_replay_audits is
    'Auditoria das solicitações de replay de eventos já registrados na outbox.';
comment on table tara.portal_users is
    'Usuários do Portal do Cliente, vinculados a uma Conta e às suas credenciais de acesso.';
comment on table tara.portal_tokens is
    'Tokens temporários do Portal usados para confirmação de e-mail e recuperação de acesso.';
comment on table tara.platform_settings is
    'Configurações globais da plataforma, incluindo valores protegidos administrados pelo backoffice.';
comment on table tara.clientes is
    'Referências de clientes mantidas pela plataforma para correlacionar dados dos sistemas consumidores.';
comment on table tara.eventos_outbox is
    'Eventos de integração persistidos para entrega assíncrona e confiável aos sistemas consumidores.';
comment on table tara.estacoes is
    'Estações de pesagem autorizadas a capturar medições e sincronizar dados com a plataforma.';
comment on table tara.operadores is
    'Pessoas autorizadas a executar e identificar operações na estação de pesagem.';
comment on table tara.ordens is
    'Solicitações operacionais que orientam pesagens e correlacionam a operação com o sistema consumidor.';
comment on table tara.pesagens is
    'Registro imutável de uma medição realizada na balança, vinculada ou avulsa, com suas evidências.';
comment on table tara.contingencia_lotes is
    'Pacotes assinados de capturas transportados em contingência para importação posterior.';
comment on table tara.contingencia_itens is
    'Itens individuais de captura contidos em um lote de contingência e seu resultado de importação.';
