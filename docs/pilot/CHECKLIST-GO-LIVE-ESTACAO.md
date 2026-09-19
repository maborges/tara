# Checklist Go-Live da Estação

Este checklist assegura que a Estação de Pesagem está operacionalmente validada e liberada para uso em produção no Piloto Controlado.

## Requisitos de Infraestrutura e Cadastro
- [ ] Cliente configurado no Backoffice (Tenant/Conta e API Client).
- [ ] Station criada no Backoffice.
- [ ] Installation ativa (código de ativação preenchido).
- [ ] Bridge instalada e rodando no background.
- [ ] Autostart validado (Bridge sobe automaticamente após reiniciar o PC).

## Hardware e Comunicação
- [ ] Indicador homologado (Regex e protocolos testados).
- [ ] Indicador configurado corretamente no `config.yaml` da Bridge.
- [ ] Peso atual lido com sucesso pela Bridge.
- [ ] DeviceConfiguration está `ACTIVE` no serviço.

## Operação Local (PWA)
- [ ] Operadores cadastrados no Portal e vinculados à Estação.
- [ ] Operadores conseguem realizar login via PIN.
- [ ] Pesagem online realizada (captura eletrônica funciona e registra tara/bruto).
- [ ] Pesagem offline realizada (captura validada sem rede).

## Integração
- [ ] Sincronização (Sync) validada (fila esvazia ao retornar a rede).
- [ ] Delivery validado (dados chegam no sistema Cliente, estado `PENDING`).
- [ ] ACK validado (cliente processou a pesagem e reportou estado `ACKNOWLEDGED`).

## Suporte
- [ ] Pendrive para exportação de contingência `.balanca.json` preparado e disponível localmente.
- [ ] Suporte possui acesso remoto necessário para investigação N2 (se aplicável).
- [ ] **Estação liberada para Operação.**
