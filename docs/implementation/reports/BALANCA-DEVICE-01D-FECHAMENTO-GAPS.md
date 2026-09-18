# BALANCA-DEVICE-01D — Fechamento dos GAPs

## Resultado

`BALANCA-DEVICE-01`: **CONCLUÍDO**.

| GAP | Estado | Fechamento |
|---|---|---|
| GAP-01 | RESOLVIDO | `POST /v1/portal/stations/{station_id}/installations` emite novo código para a mesma Station. A ativação cria uma nova instalação e marca instalações/configurações ativas anteriores como `REPLACED`. |
| GAP-02 | RESOLVIDO | A Station exige teste de `/health` e `/peso-atual` da Bridge antes de enviar a substituição. Falha preserva a configuração ativa existente. Peso estável não é obrigatório. |
| GAP-03 | RESOLVIDO | `installation_id` e `device_configuration_id` já são preservados na sessão, pesagem e sync; ausentes permanecem nulos em pacotes legados, sem inferência. |
| GAP-04 | RESOLVIDO | Migration `029_device_configuration_active_constraint.sql` cria índice único parcial para uma configuração `ACTIVE` por instalação. |

## Segurança e offline

Uma reinstalação revoga logicamente a instalação anterior e gira o token da
Station. Pesagens pendentes no terminal anterior não são apagadas nem
reatribuídas; devem ser sincronizadas antes da troca ou exportadas pelo fluxo
de contingência, preservando a origem histórica quando disponível.
