# Mapa de Contextos

## Contextos

- [Plataforma e identidade](./docs/contexts/plataforma-identidade/CONTEXT.md): administra Contas, identidades, credenciais e permissões.
- [Operação de pesagem](./docs/contexts/operacao-pesagem/CONTEXT.md): registra ordens, pesagens, veículos, operadores e movimentações.
- [Captura edge](./docs/contexts/captura-edge/CONTEXT.md): mantém a operação local, offline, a estação, a bridge e a contingência.
- [Integrações](./docs/contexts/integracoes/CONTEXT.md): publica contratos e eventos para sistemas consumidores.

## Relações

- **Plataforma e identidade → Operação de pesagem**: fornece a Conta, o escopo de isolamento e as identidades autorizadas.
- **Operação de pesagem ↔ Captura edge**: disponibiliza ordens e recebe capturas vinculadas ou avulsas, inclusive após períodos offline.
- **Operação de pesagem → Integrações**: publica `balanca.pesagem.concluida.v1` depois de confirmar uma pesagem.
- **Integrações → Sistema consumidor**: entrega eventos por outbox HTTP; o consumidor traduz o evento para seu próprio domínio.
- **Sistema consumidor → Operação de pesagem**: fornece referências externas e, quando aplicável, ordens e dados fiscais/logísticos.
- **Portal do cliente → Plataforma e identidade / Operação de pesagem / Integrações**: administra os recursos da própria Conta, acompanha a operação e configura seus canais de integração.

## Regra de nomenclatura

Os contextos usam os termos definidos nos respectivos glossários. `Conta` é o consumidor da plataforma; `tenant` é apenas um mecanismo técnico de isolamento e não um conceito de produto.
