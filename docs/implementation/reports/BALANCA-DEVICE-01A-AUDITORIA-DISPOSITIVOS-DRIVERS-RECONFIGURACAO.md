# Relatório de Auditoria: BALANCA-DEVICE-01A (Dispositivos, Drivers e Reconfiguração)

## 1. Conclusão Executiva

A auditoria confirmou que a **arquitetura atual** separa satisfatoriamente a captura de peso (responsabilidade da `Bridge`) da lógica de negócio e interface (responsabilidade da `Station PWA`). No entanto, **a identidade da Station (`station_id`) e a configuração do dispositivo físico (`bridge_url`) estão fracamente acopladas e persistem apenas localmente (IndexedDB `session`)**.
Atualmente, não há representação de "Instalação" ou "Dispositivo" no backend. Se uma balança quebra e outra é instalada, a Station mantém seu `station_id` (se o computador/browser for mantido) apenas alterando a URL da Bridge (se aplicável), ou exige um novo provisionamento (se o terminal inteiro for trocado).
**Veredicto: GO COM RESSALVAS.** Podemos prosseguir com as propostas de melhoria (Fase B), sendo imperativo criar as entidades para representar "Device Configuration" / "Installation" de forma persistente, preservando a identidade lógica da Station e garantindo a rastreabilidade técnica sem acoplar a Station ao Hardware.

## 2. Arquitetura Atual

A PWA (`Station`) e a balança (`Bridge`) se comunicam via REST/WebSocket, em total isolamento das implementações específicas dos fabricantes.
- O Backend (`service`) conhece a `Estacao` apenas como um ponto lógico (`id`, `tenant_id`, `external_id`, `activation_code`, `status`), sem detalhes físicos.
- A Station mantém a sessão do equipamento no `IndexedDB` (`session` contendo `bridge_url` e `bridge_token`).

## 3. Bridge Atual

A Bridge atua como um micro-serviço local, expondo endpoints uniformes. Ela isola toda a complexidade serial/TCP.
**A Bridge não possui arquitetura de drivers individuais por fabricante**. Em vez disso, adota um `ProtocolAdapter` genérico baseado em Regex. 

## 4. Protocolos/drivers encontrados

| Fabricante | Modelo/protocolo | Driver | Serial | TCP | Estabilidade | Testes | Status |
| ---------- | ---------------- | ------ | ------ | --- | ------------ | ------ | ------ |
| Genérico   | Regex (Contínuo) | Regex  | SIM    | SIM | SIM (Lógica) | SIM    | IMPLEMENTADO |

A configuração é feita inteiramente via arquivo (`config.yaml`), definindo qual a Regex de extração (`weight_regex`) e normalizações.

## 5. Contrato Bridge → Station

A Bridge expõe:
- `GET /health`
- `GET /peso-atual`
- `WS /ws/peso`

**Payload do WebSocket/GET**:
```json
{
  "conectado": true,
  "erro": null,
  "peso_kg": "123.45",
  "raw": "ST,GS,+001234kg\\r\\n",
  "timestamp": 1690000000.0,
  "stale": false,
  "stable": true
}
```
O contrato atual atende aos requisitos mínimos, sendo suficiente. GAPs: Não informa a origem do dispositivo (`device_configuration_id`).

## 6. Configuração atual

As configurações físicas e seriais (COM3, Baud Rate, TCP IP, Protocolo Regex) ficam EXCLUSIVAMENTE na Bridge (`config.yaml` / Instalação Local). 
Classificação: `LOCAL DA INSTALAÇÃO` e `BRIDGE`.

## 7. Persistência

Não existe persistência da configuração física no backend ou sincronizada. Apenas o `bridge_url` (IP da Bridge) é persistido no IndexedDB da Station.

## 8. Identidade da Station

A Station está parcialmente desacoplada do equipamento, mas o processo de provisionamento exige uma associação local manual (`bridge_url`). Se a Station quebrar (PWA desinstalado ou máquina formatada), a Station precisa ser recriada ou usar um fluxo manual de reaproveitamento, pois a instalação e a Station não são conceitos separados no backend.

## 9. Substituição de equipamento

Atualmente, se a balança física falha e é trocada:
- A Station PWA continua funcionando com o mesmo `station_id`. 
- Caso o IP/Porta ou tipo de conexão (Serial->TCP) da nova balança mude, basta editar o `config.yaml` da Bridge e reiniciar. 
- Do ponto de vista lógico, a Station "engole" a mudança; **mas não há rastro sistêmico dessa substituição**.

## 10. Nova instalação da Station

Hoje, reinstalar a PWA significa pedir um novo Código de Ativação, gerando uma nova Station no backend. **Falta a separação entre `Station` (Entidade Lógica) e `StationInstallation` (Entidade Física/Terminal)**.

## 11. Offline e IndexedDB

As `Pesagens` no IndexedDB guardam apenas a `ordem_id`, e `leitura_bruta`. Se o equipamento mudar no meio, a PWA subirá as pesagens antigas com a nova Bridge apontada na sessão. Como a rastreabilidade do equipamento não existe, o IndexedDB preserva a origem apenas associando ao `station_id`.

## 12. Contingência

Na geração de pacotes `.balanca.json`, a identidade técnica da balança não está isolada, apenas o `station_id`. Se a balança física mudar, o pacote `.json` subirá as pesagens associando-as à Station, perdendo o rastro de qual dispositivo gerou o dado.

## 13. Rastreabilidade técnica

Se implementada, exigirá adicionar `device_configuration_id` nas pesagens locais (`IndexedDB`) e remotas (`Backend`). Isso garante que uma substituição crie uma nova fronteira. A Station passaria a guardar e sincronizar `device_configuration_id`.

## 14. Segurança/RBAC

Trocar a Bridge ou o equipamento hoje requer apenas alterar o arquivo local da Bridge. Idealmente, a "Ativação" de uma configuração de Hardware deveria demandar aprovação de um `TÉCNICO` ou `ADMINISTRADOR DA CONTA`.

## 15. GAPs

- Backend não possui modelo `DeviceConfiguration` ou `Installation`.
- Station e Terminal são o mesmo conceito prático no momento da ativação.
- Pesagens não rastreiam falhas ou substituições de hardware (`device_configuration_id` ausente).
- A PWA não oferece interface nativa para "Testar hardware / Nova instalação física".

## 16. Riscos

Se adotarmos rastreabilidade técnica sem cuidado, corremos o risco de travar pesagens offline antigas ao associá-las a um equipamento "Revogado". É essencial manter o hardware inativo no banco para consistência histórica. 

## 17. Modelo mínimo recomendado

```text
Station (Lógica, ex: "Recebimento 01")
 └── StationInstallation (Instalação em um Browser/PC físico)
      └── DeviceConfiguration (Apontamento para a Bridge X com Equipamento Y)
```
- Criar `StationInstallation` e `DeviceConfiguration` no backend.
- Adicionar `device_configuration_id` na pesagem (opcional para manter retrocompatibilidade no AgroSaaS, mas exigido internamente).

## 18. Arquivos candidatos a alteração

- `service/app/models.py` (Novas tabelas)
- `station/src/lib/db.ts` (Novos campos em `SessionRow` e `PesagemLocal`)
- `station/src/app/(balanca)/configuracoes/` (Nova tela de teste)

## 19. Migrations potencialmente necessárias

- `026_station_installations.sql`
- `027_device_configurations.sql`
- `028_add_device_config_to_weighings.sql`

## 20. Testes necessários

- Substituir Bridge com pesagens em `IN_FLIGHT`.
- Validar se pesagens criadas sob uma `DeviceConfiguration` antiga chegam ao servidor vinculadas a ela após sincronismo.
- Teste de comunicação (Mock -> Bridge -> PWA).

## 21. Sequência de implementação

1. Models e Migrations Backend.
2. Atualização dos Endpoints de Ativação (para gerar Installation + Configuration).
3. Atualização do IndexedDB da Station (acomodando o `device_configuration_id`).
4. Tela de Configuração Local e testes (PWA).

## 22. Veredicto

**GO COM RESSALVAS.** A arquitetura suporta bem o desacoplamento, mas a rastreabilidade técnica é o elo fraco. O modelo `Regex` genérico da Bridge é brilhante e deve ser mantido, isolando complexidade de fabricante do backend. As alterações requeridas são estruturais no backend, sem impacto ao fluxo do usuário comum.
