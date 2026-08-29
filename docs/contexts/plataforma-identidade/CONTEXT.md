# Plataforma e Identidade

Este contexto define quem utiliza a Plataforma Balança, em nome de qual organização e com quais permissões.

## Organização e isolamento

**Conta**:
Organização consumidora cadastrada na Plataforma Balança.
_Evitar_: tenant, cliente da operação

**Tenant**:
Identificador técnico associado à Conta para isolamento interno dos dados.
_Evitar_: usar como nome visível do produto ou pedir que o consumidor o escolha livremente

## Atores e credenciais

**Administrador global**:
Pessoa autorizada a administrar a Plataforma Balança sem depender de uma seleção de tenant no login.
_Evitar_: usuário de cliente

**Sistema consumidor**:
Aplicação externa que usa a plataforma, como o AgroSaaS.
_Evitar_: cliente quando o significado for a organização Conta

**API Client**:
Credencial técnica pertencente a uma Conta, com escopos, validade e estado próprios.
_Evitar_: API Key como sinônimo do segredo

**Operador**:
Pessoa autorizada a executar operações na estação de pesagem.
_Evitar_: administrador global

**Estação**:
Ponto operacional autorizado a capturar pesagens e associado a uma Conta.
_Evitar_: dispositivo genérico
