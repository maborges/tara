# Captura Edge

Este contexto mantém a captura de pesagens funcionando no local da balança, mesmo quando a conexão com a Plataforma Balança está indisponível.

**Estação**:
Aplicação local que autentica o operador, captura pesagens e sincroniza registros posteriormente.
_Evitar_: tratar a estação como banco mestre

**Bridge**:
Componente local que conecta o indicador físico à estação e normaliza suas leituras.
_Evitar_: colocar regra de negócio do consumidor na bridge

**Captura offline**:
Registro feito sem conexão disponível, com identificador local único e evidências de estação (preservada como `estacao_id`), operador, horário, leitura e estabilidade.
_Evitar_: registro descartável

**Sincronização**:
Envio posterior de capturas e resultados entre a estação e a Plataforma Balança, podendo ocorrer mais de uma vez sem duplicar o fato.
_Evitar_: presumir exatamente-uma-vez

**Contingência**:
Meio alternativo para transportar e importar capturas quando a sincronização normal não está disponível.
_Evitar_: ignorar assinatura, origem ou idempotência
