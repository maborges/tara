# Operação de Pesagem

Este contexto representa a movimentação medida pela balança e preserva a autoridade da Plataforma Balança sobre o fato físico registrado.

## Pesagem e operação

**Pesagem**:
Registro imutável de uma medição realizada por uma estação, com seu contexto operacional e evidências disponíveis.
_Evitar_: transação

**Pesagem vinculada**:
Pesagem associada a uma ordem conhecida pela estação no momento da captura.
_Evitar_: pesagem online, pois pode ser capturada offline

**Pesagem avulsa**:
Pesagem capturada sem uma ordem previamente sincronizada, para manter a operação ativa durante indisponibilidade de conexão ou quando não há operação fiscal prévia.
_Evitar_: pesagem sem contexto

**Ordem de pesagem**:
Solicitação operacional que orienta uma pesagem e pode ser criada ou associada antes ou depois da captura.
_Evitar_: nota fiscal

**Tipo/motivo da operação**:
Classificação do motivo da pesagem, como compra, venda, recebimento, expedição, transferência, devolução, remessa, retorno, pesagem avulsa ou conferência.
_Evitar_: natureza da mercadoria

## Direção e natureza

**Direção física do veículo**:
Movimento do veículo em relação à balança: `ENTRADA` ou `SAIDA`.
_Evitar_: tratar como direção da mercadoria

**Natureza da mercadoria**:
Classificação da movimentação da mercadoria: `ENTRADA`, `SAIDA` ou `NEUTRA`.
_Evitar_: derivar da direção física do veículo

**CFOP**:
Código fiscal que, quando presente e aplicável, determina a natureza da mercadoria pelo primeiro dígito: `1`, `2`, `3` indicam `ENTRADA`; `5`, `6`, `7` indicam `SAIDA`.
_Evitar_: tornar o CFOP obrigatório para toda pesagem

**Reconciliação**:
Processo posterior que vincula uma pesagem avulsa a uma ordem, cria uma ordem ou encaminha o registro para revisão, sem alterar a captura original.
_Evitar_: editar a pesagem histórica

## Dados logísticos

**Contexto fiscal e logístico**:
Conjunto de dados pertinentes à movimentação, incluindo nota fiscal, chave de acesso, veículo, motorista, transportadora, produto, origem, destino, quantidade prevista e observações.
_Evitar_: reduzir a pesagem ao valor em quilogramas

**Capture ID**:
Identificador imutável gerado para cada captura, usado para reconhecer a mesma pesagem durante sincronizações e reconciliações repetidas.
_Evitar_: gerar um novo identificador a cada tentativa de sincronização
