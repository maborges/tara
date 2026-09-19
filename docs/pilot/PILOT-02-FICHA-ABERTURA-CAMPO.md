# PILOT-02 — Ficha de Abertura de Campo

## Cliente
```text
Cliente:
Unidade/Local:
Cidade/UF:
Responsável do cliente:
Responsável técnico:
Data prevista do Go-Live:
```

---

## Computador da estação
```text
Fabricante/modelo:
Sistema operacional:
Versão:
Arquitetura:
Memória:
Armazenamento disponível:
Rede:
Navegador:
Node.js:
```

---

## Station
```text
Station ID:
Nome:
Installation ID:
URL/API:
Versão Station:
Status:
```

---

## Bridge
```text
Versão:
Sistema operacional:
Serviço:
Porta local:
Status:
Autostart:
```

---

## Indicador
```text
Fabricante:
Modelo:
Número de série:
Interface:
Protocolo:
Baud rate:
Data bits:
Parity:
Stop bits:
Regex/parser:
```

---

## Operadores
```text
Quantidade:
Operador 1 identificado/cadastrado: SIM/NÃO
Operador 2 identificado/cadastrado: SIM/NÃO
```

---

## Integração consumidora
```text
Sistema:
Modo:
PULL / WEBHOOK

API Client configurado:
SIM/NÃO

Delivery testado:
SIM/NÃO

ACK testado:
SIM/NÃO
```

---

## Gate de Homologação
```text
[ ] Indicador identificado
[ ] Interface identificada
[ ] Comunicação estabelecida
[ ] Leitura bruta recebida
[ ] Parser/regex validado
[ ] Peso zero testado
[ ] Peso conhecido testado
[ ] Estabilidade testada
[ ] Desconexão/reconexão testada
[ ] FICHA-HOMOLOGACAO-INDICADOR preenchida
```
Resultado:
```text
NÃO TESTADO
```

---

## Gate de Go-Live
```text
[ ] Station provisionada
[ ] StationInstallation válida
[ ] Bridge instalada
[ ] Bridge autostart validado
[ ] DeviceConfiguration ACTIVE
[ ] Indicador homologado
[ ] Peso atual recebido
[ ] Operadores cadastrados
[ ] Pesagem online realizada
[ ] OfflineCaptureAuthorization disponível
[ ] Pesagem offline realizada
[ ] Sync realizado
[ ] DeliveryReceipt gerado
[ ] Pull realizado
[ ] ACK realizado
[ ] Reboot/recuperação validado
[ ] Suporte preparado
```
Resultado inicial:
```text
GO-LIVE:
NÃO TESTADO
```

---

## Ordem de execução em campo
```text
1. Identificar cliente/local
2. Identificar computador
3. Identificar indicador
4. Homologar indicador
5. Provisionar Station
6. Instalar Station
7. Instalar Bridge
8. Ativar Device
9. Cadastrar operadores
10. Testar pesagem online
11. Testar Delivery/ACK
12. Testar offline
13. Testar retorno/sync
14. Testar reboot
15. Executar checklist Go-Live
16. Liberar operação assistida
17. Iniciar diário do piloto
```

---

## Documentos que devem ser utilizados em campo
Referenciar:
- `FICHA-HOMOLOGACAO-INDICADOR.md`
- `RUNBOOK-IMPLANTACAO-ESTACAO.md`
- `CHECKLIST-GO-LIVE-ESTACAO.md`
- `MANUAL-TECNICO-INSTALACAO.md`
- `MANUAL-OPERADOR.md`
- `RUNBOOK-SUPORTE-PILOTO.md`
- `RUNBOOK-CONTINGENCIA.md`
- `CHECKLIST-DIARIO-PILOTO.md`
- `PILOT-02-DIARIO-OPERACIONAL.md`
- `PILOT-02-INCIDENTES.md`
- `PILOT-02-EVIDENCIAS.md`
