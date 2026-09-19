# Ficha Operacional: Homologação de Indicador Físico

Esta ficha deve ser preenchida antes da instalação em campo, homologando o hardware em ambiente controlado (Laboratório de TI) para evitar surpresas no piloto com expressões regulares incorretas.

## 1. Identificação do Hardware
- **Fabricante**: 
- **Modelo**: 
- **Data da Homologação**: 
- **Responsável**: 
- **Resultado Final (Aprovado/Reprovado)**: 

## 2. Configurações de Comunicação
- **Interface/Transporte**: [ ] Serial RS232 [ ] Serial USB [ ] Ethernet TCP/IP
- **Baud Rate**: (ex: 9600)
- **Data Bits**: (ex: 8)
- **Parity**: (ex: N)
- **Stop Bits**: (ex: 1)
- **Protocolo de Envio**: [ ] Contínuo (ASCII) [ ] Requisição

## 3. Estrutura do Frame (O que a Bridge recebe)
- **Exemplo de leitura bruta sanitizada**:
  ```text
  (cole aqui a string bruta exata que sai da porta COM usando cat /dev/ttyUSB0, ex: " 012500KG")
  ```

- **Expressão Regular (Regex) adotada (`weight_regex`)**:
  ```text
  (ex: \s*([0-9]{6})KG)
  ```

- **Fator de Escala / Casas Decimais (`scale_factor`)**:
  (ex: Se o peso bruto for 12500 mas representa 12,500 kg, fator é 0.001)

## 4. Resultados de Teste na Bridge
- **Teste com Peso Zero (0kg)**: A Bridge reporta estável sem ruído? (Sim/Não)
- **Teste com Peso Conhecido (ex: peso-padrão de 20kg)**: O valor capturado e as casas decimais na porta local (:8321/peso-atual) conferem com o display físico? (Sim/Não)
- **Desconexão acidental**: Retirar o cabo durante a pesagem gera mensagem correta (`conectado: false`) em no máximo X segundos? (Sim/Não)
- **Estabilidade**: A Bridge está filtrando variações e aguardando a tolerância exigida (`stable_tolerance_kg`)? (Sim/Não)
