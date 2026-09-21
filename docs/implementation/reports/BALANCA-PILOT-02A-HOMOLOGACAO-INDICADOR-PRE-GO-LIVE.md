# BALANCA-PILOT-02A — Homologação Física do Indicador e Pré-Go-Live

## Status

`BALANCA-PILOT-02A STATUS: AGUARDANDO EQUIPAMENTO FÍSICO`

`RESULTADO: PENDENTE`

`PRÉ-GO-LIVE: NÃO AUTORIZADO`

## Escopo e pré-condição

Esta ficha foi preparada conforme os runbooks de PILOT-01B/PILOT-02. A homologação física exige equipamento conectado, local de operação, Station, Bridge, conectividade e um operador responsável para produzir evidências reais.

Nenhum desses elementos está disponível para execução física neste ambiente. Portanto, não foram simuladas leituras, capturas, sincronizações, screenshots ou logs.

| Item obrigatório | Situação |
| --- | --- |
| Fabricante/modelo do indicador | PENDENTE DE INFORMAÇÃO |
| Interface física e protocolo/configuração | PENDENTE DE INFORMAÇÃO |
| Balança e carga de teste | PENDENTE DE DISPONIBILIDADE |
| Station e computador de campo | PENDENTE DE DISPONIBILIDADE |
| Installation e DeviceConfiguration | PENDENTE DE CONFIRMAÇÃO EM CAMPO |
| Operador responsável | PENDENTE DE IDENTIFICAÇÃO |
| Cliente/local da operação | PENDENTE DE IDENTIFICAÇÃO |

## Execuções não realizadas

Os itens abaixo permanecem sem evidência e devem ser executados por operador no local:

- Bridge: `/health`, comunicação com o indicador, `/peso-atual`, leitura sem carga, leitura com carga, estabilidade, repetibilidade e retorno ao zero.
- Contexto operacional: operação de teste com processo/tipo, referência, placas, motorista e documento.
- RECEBIMENTO MULTIPLA: PRE/POS e, se viável, CHEGADA/INTERMEDIARIA/SAIDA.
- Conferência física: nova captura, preservação da original, troca explícita do marco e histórico.
- Offline físico: corte real de conectividade, persistência local, retry, reconexão e sincronização.
- Fluxo legado: smoke test físico de uma operação compatível.
- Device: StationInstallation, DeviceConfiguration, proof/challenge e ausência de troca indevida.

Não há pesos, `local_id`, `operation_local_id`, IDs de Ordem, timestamps, resultado, deltas ou logs reais a registrar nesta execução.

## Documentos de campo

As fichas operacionais permanecem disponíveis para preenchimento durante a execução física, sem dados presumidos:

- `docs/pilot/FICHA-HOMOLOGACAO-INDICADOR.md`
- `docs/pilot/CHECKLIST-GO-LIVE-ESTACAO.md`
- `docs/pilot/PILOT-02-FICHA-ABERTURA-CAMPO.md`
- `docs/pilot/PILOT-02-EVIDENCIAS.md`
- `docs/pilot/PILOT-02-INCIDENTES.md`
- `docs/pilot/PILOT-02-DIARIO-OPERACIONAL.md`

## Achado e decisão

| ID | Classificação | Achado | Impacto |
| --- | --- | --- | --- |
| PILOT-02A-001 | BLOQUEANTE | Equipamento físico, estação de campo e operador não estão disponíveis para homologação | Impede a coleta de evidência real e a autorização do Pré-Go-Live |

O bloqueio é uma pré-condição operacional, não um defeito de software identificado. O PILOT-02 não deve ser iniciado até que a homologação física seja executada e evidenciada.

Nenhum código, banco, migration, configuração de Device/Delivery ou documento de contrato foi alterado nesta fase; somente esta ficha foi atualizada para registrar o gate pendente.

BALANCA-PILOT-02A STATUS: AGUARDANDO EQUIPAMENTO FÍSICO

RESULTADO: PENDENTE
