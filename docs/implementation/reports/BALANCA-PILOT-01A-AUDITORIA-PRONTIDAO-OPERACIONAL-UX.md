# BALANCA-PILOT-01A — Auditoria de Prontidão Operacional e UX

## 1. Resumo executivo

Esta auditoria avalia a prontidão operacional e a experiência de usuário (UX) da Plataforma Balança/Tara para execução de um piloto controlado. A fundação técnica e arquitetural (Core, Device, Delivery) está consolidada e aprovada. O objetivo atual é determinar se um cliente e um operador conseguem instalar, configurar e utilizar o sistema em uma operação real sem depender diretamente de um desenvolvedor, identificando lacunas operacionais.

## 2. Escopo

Auditoria estritamente de leitura focada em:
- Onboarding de cliente e criação de estações.
- Instalação e configuração no ambiente operacional (Bridge e Station).
- Jornada do operador (captura eletrônica, offline, sincronização).
- Integração e entrega para o sistema cliente.
- Observabilidade e suporte.

## 3. Estado técnico herdado

A regressão técnica está 100% aprovada (0 falhas). A arquitetura técnica foi mantida intacta, sendo a avaliação focada na interface entre o sistema pronto e os usuários finais reais.

## 4. Personas

- **Administrador da Plataforma**: Gerencia tenants, clientes e backoffice.
- **Administrador do Cliente**: Gerencia a própria conta, estações, operadores e integrações (AgroSaaS).
- **Técnico Instalador**: Prepara o hardware (PC/Raspberry Pi), instala PWA, Bridge e conecta o indicador.
- **Operador da Balança**: Executa o processo de pesagem, lida com offline e contigência.
- **Sistema Cliente**: Consome a API e processa as entregas (Delivery).

## 5. Inventário das interfaces

| Interface | Usuário | Finalidade | Estado |
| --------- | ------- | ---------- | ------ |
| Portal Web | Administrador Cliente | Gestão de conta, credenciais | PARCIAL |
| Backoffice | Administrador Plataforma | Gestão global, monitoramento | PARCIAL (API pronta, UI incompleta) |
| Station PWA | Operador | Captura de pesagem, fila, offline | PRONTA |
| Bridge | Técnico Instalador | Conexão com indicador (hardware) | TÉCNICA (scripts, sem UI) |
| CLI | Administrador/Técnico | Comandos de deploy, importação | PARCIAL (scripts Python) |
| APIs | Sistema Cliente / PWA | Integração, Sincronização | PRONTA |

## 6. Jornada de onboarding

Atualmente, o processo de criação de clientes e configuração depende pesadamente de APIs ou scripts (ex: `bootstrap_admin.py`). O Portal do Cliente possui rotas, mas faltam interfaces para onboarding fluido sem desenvolvedor. Existe entrega de credenciais, porém a operação depende de configuração manual e conhecimento técnico.

## 7. Jornada de instalação

A criação da Station e associação a conta exige chamadas de API ou scripts no banco. Um administrador não-técnico não consegue fazer isso sozinho sem uma interface de Backoffice finalizada. 
- **GAP Crítico**: Faltam interfaces de auto-serviço para cadastro de estações.

## 8. Bridge e Device

**O que o técnico baixa?** Um pacote `.tar.gz` e um repositório Python.
**Como instala?** Via terminal: `install.sh`, `python3 -m venv`, `pip install`.
**Configuração:** Edição manual do `config.yaml` (`baud rate`, `porta serial`, `regex`).
**Teste:** Verificado pelos logs do terminal ou consultando a Station.
**Diagnóstico:** Totalmente técnico (logs de serviço systemd). Não há interface gráfica para configuração da porta COM ou testes visuais do equipamento.

## 9. Jornada do operador (Login)

O operador consegue fazer login e a PWA realiza cache local (IndexedDB). A experiência de recuperação de senha via credencial offline funciona, mas a gestão dessas credenciais é técnica. A troca de operador é suportada pela PWA.

## 10. Pesagem única

UX consolidada na Station PWA. A seleção de ordens, captura de peso da Bridge e registro são fluidos, requerendo poucos cliques. Os dados apresentados são limpos e limitados ao contexto essencial.

## 11. Pesagem dupla

A experiência (Entrada/Saída) está mapeada arquiteturalmente, mas a UX depende do PWA conseguir recuperar o estado "pendente" da primeira pesagem e demonstrar claramente a diferença entre Bruto, Tara e Líquido para o operador na segunda passagem do veículo.

## 12. Offline e Sync

A Station PWA foi construída para resiliência. O operador percebe que está offline, o sistema permite pesagens usando o IndexedDB local e as ordens sincronizadas continuam disponíveis. O retorno da conexão dispara a sincronização ou exige clique em "Reprocessar falhas". O operador sabe quantas pesagens estão pendentes.

## 13. Contingência

O mecanismo de exportação (`.balanca.json`) está presente na PWA. A importação, no entanto, depende da API (`/v1/contingency/import`) ou do script utilitário em Python (`import_contingency.py`). Faltam UIs de importação e auditoria no Backoffice para o Administrador da Plataforma.

## 14. Delivery / Integração

O onboarding do integrador técnico é bom (há documentos como `IMPLANTACAO_CLIENTE.md`). Um desenvolvedor externo consegue implementar webhook ou polling (cursor) apenas lendo a documentação e utilizando as credenciais. A API é madura e aderente aos requisitos.

## 15. Monitoramento

A Plataforma tem métricas (APIs), mas o suporte operacional fica cego sem a interface do Backoffice. Para saber se uma estação não sincroniza, o suporte precisa fazer queries no banco ou acessar a API.

## 16. Suporte

Não existe runbook de suporte nível 1 (atendimento) ou nível 2 (investigação técnica). Se o cliente ligar e disser "não pesa", o suporte terá que pedir para abrir o console do navegador ou conectar via SSH no Linux da Bridge.

## 17. Documentação

- `MANUAL_TARA.md` e `IMPLANTACAO_CLIENTE.md` existem e são úteis para implantação.
- Falta documentação focada no usuário final (Manual do Operador com telas).
- Falta documentação oficial de resolução de problemas da Bridge para o técnico instalador.

## 18. Segurança operacional

A segurança é nativamente forte (tokens separados, PWA no browser, comunicação API criptografada). No entanto, o `config.yaml` da Bridge e o `.env.local` da Station expõem segredos (tokens) no ambiente local em texto plano (risco inerente, mas aceitável para o piloto em hardware controlado).

## 19. Atualização/recuperação

A Station PWA recebe updates via Service Worker. A Bridge depende de um novo `.tar.gz` e comando de terminal (`sudo ./install.sh`). Se a máquina formatar, é necessário apoio de desenvolvedor/suporte técnico para gerar o token e reconfigurar os arquivos locais.

## 20. Matriz de readiness

| Área               | Estado | Bloqueia piloto? | Evidência | GAP |
| ------------------ | ------ | ---------------: | --------- | --- |
| Onboarding cliente | PARCIAL| Sim (sem UI)     | Faltam telas no Portal/Backoffice | Alto |
| Station            | PRONTA | Não              | PWA responsivo e funcional | Nenhum |
| Instalação         | TÉCNICA| Sim (só dev)     | CLI/Scripts, .env manual | Crítico |
| Bridge             | TÉCNICA| Sim (só dev)     | config.yaml manual | Alto |
| Device             | PRONTO | Não              | Arquitetura robusta | Nenhum |
| Operador           | PRONTO | Não              | UX da Station funcional | Baixo |
| Pesagem única      | PRONTO | Não              | Captura estável | Nenhum |
| Pesagem dupla      | PARCIAL| Não              | Fluxo UX pode ser confuso offline | Médio |
| Offline            | PRONTO | Não              | IndexedDB e UI tratam | Nenhum |
| Sync               | PRONTO | Não              | Serviço processa idempotência | Nenhum |
| Contingência       | PARCIAL| Não (só manual)  | UI de Exportação pronta, Import requer CLI | Alto |
| Delivery           | PRONTO | Não              | Webhooks, Cursors funcionam | Nenhum |
| Integração         | PRONTO | Não              | Documentação técnica existe | Nenhum |
| Monitoramento      | NÃO PRONTO| Sim         | Faltam dashboards para suporte | Crítico |
| Suporte            | NÃO PRONTO| Sim         | Falta Runbook operacional | Crítico |
| Documentação       | PARCIAL| Não              | Documentação técnica excelente, operacional fraca | Alto |

## 21. GAPs

Identificados 10 GAPs principais que impedem que a operação ocorra sem a presença diária de um desenvolvedor.

## 22. Top 10 GAPs

1. **GAP-01**: Inexistência de UI para criação e ativação autônoma de estações (Admin). *Severidade: Crítica. Categoria: UX.* (Bloqueia) - Solução: Criar tela no Backoffice ou aprovar uso manual por dev no piloto.
2. **GAP-02**: Bridge exige configuração técnica (Terminal, venv, YAML). *Severidade: Crítica. Categoria: Instalação.* (Bloqueia) - Solução: Runbook detalhado para instalação assistida pelo desenvolvedor no piloto.
3. **GAP-03**: Falta de visão de monitoramento para o Suporte (Estações offline, filas paradas). *Severidade: Crítica. Categoria: Observabilidade.* (Bloqueia) - Solução: Dashboard mínimo ou scripts prontos para o Nível 2.
4. **GAP-04**: Importação de contingência (.balanca.json) depende de script Python. *Severidade: Alta. Categoria: Operação.* (Não bloqueia, mas onera) - Solução: Operar contingência pelo dev no piloto.
5. **GAP-05**: Ausência de Runbook para resolução de falha (Nível 1 e 2). *Severidade: Crítica. Categoria: Suporte.* (Bloqueia) - Solução: Escrever Runbook.
6. **GAP-06**: Diagnóstico remoto de hardware inexistente. *Severidade: Alta. Categoria: Suporte.* - Solução: Treinar operador para ver log de falha na PWA.
7. **GAP-07**: Instalação da PWA requer Node/pnpm no ambiente. *Severidade: Alta. Categoria: Instalação.* - Solução: Distribuir PWA via Vercel/Web genérica, sem build local, se aplicável, ou container Docker pré-buildado.
8. **GAP-08**: Mensagens de erro da Bridge não são visíveis para o operador de forma amigável. *Severidade: Média. Categoria: UX.* - Solução: Melhorar UI de status da Bridge na Station.
9. **GAP-09**: Troca de indicador físico exige acesso terminal e edição de regex em YAML. *Severidade: Alta. Categoria: Instalação.* - Solução: Suporte faz remoto no piloto.
10. **GAP-10**: Falta de manual do usuário com prints da tela da PWA. *Severidade: Média. Categoria: Documentação.* - Solução: Gerar PDF rápido com telas.

## 23. MUST / SHOULD / POST-PILOT

- **MUST HAVE**:
  - Runbook de operação e suporte (GAP-05).
  - Procedimento manual documentado para cadastro de tenant/station via API para o piloto (substituto do GAP-01).
  - Ambiente pré-buildado ou instalador Dockerizado/Binário para evitar compilação via `pnpm` no cliente (mitigação do GAP-07).

- **SHOULD HAVE**:
  - Dashboard de status das estações (GAP-03).
  - UI de importação de contingência no Backoffice (GAP-04).

- **POST-PILOT**:
  - Configurador Visual da Bridge (UI local para setup de porta COM e Regex).
  - Gestão autônoma de estações e operadores via Backoffice Cliente.

## 24. Escopo recomendado do piloto

- **1 Cliente** (parceiro próximo, alta tolerância).
- **1 Estação física**, rodando PWA e Bridge no mesmo PC.
- **1 Indicador** homologado no laboratório previamente (evitar descoberta de Regex em campo).
- **2 Operadores** treinados diretamente.
- **Integração**: AgroSaaS consumindo via Pull/Cursor (Webhook apenas se cliente exigir).

## 25. Métricas

- % de pesagens capturadas automaticamente vs. pesagens manuais.
- Número de eventos de "offline" experimentados (Downtime reportado).
- Tempo médio de sincronização após retorno da internet.
- Quantidade de acionamentos ao Suporte de Nível 2 (Desenvolvedor).

## 26. Critérios de sucesso

- **GO**: A estação operou 5 dias úteis sem chamados de nível 2 referentes à arquitetura base ou duplicação de dados. Entrega 100% conciliada no ERP.
- **GO COM RESSALVAS**: Operação fluiu, mas houve uso da contingência (.balanca.json) ou ajustes manuais esporádicos na Bridge por parte da engenharia remota.
- **NO-GO**: Perda de dados, trancamento constante da fila offline que exigiu limpeza local, falha recorrente de captura do indicador.

## 27. Veredicto

**GO COM RESSALVAS**

**Justificativa:** A plataforma está excepcionalmente bem desenhada e robusta do ponto de vista arquitetural e de engenharia (resiliência, idempotência, segurança). No entanto, as interfaces operacionais de instalação, configuração e monitoramento ainda exigem conhecimento de desenvolvedor (Terminal, Python, YAML, Scripts SQL/API). 
Para um piloto **controlado**, isso é perfeitamente viável: a equipe técnica atua como "concierge" (instalando e configurando remotamente), e o operador usará a interface da PWA, que está pronta e madura. O piloto pode seguir, desde que o escopo seja isolado e haja um Runbook operacional formalizado.
