# Manual Técnico de Instalação (Hardware)

Manual prático focado em instalação da comunicação entre o Indicador Físico (Hardware da balança) e a Bridge.

## 1. Conexão Física
- **Porta Serial DB9/RS232**: Conecte o cabo entre o indicador de pesagem e a porta serial (ou conversor USB/Serial) do PC.
- No Linux, descubra a porta rodando: `dmesg | grep tty`. Geralmente será `/dev/ttyUSB0` ou `/dev/ttyS0`.
- No Windows, abra o Gerenciador de Dispositivos e veja em Portas (COM e LPT).

## 2. Configurando a Bridge
A Bridge (que lê o peso via Python) é configurada via arquivo `config.yaml`:
1. Vá até a pasta: `/opt/balanca-bridge`
2. Edite `config.yaml` (`nano config.yaml` ou `notepad config.yaml`)

```yaml
# Exemplo para balança na ttyUSB0
device:
  protocol: serial
  port: /dev/ttyUSB0
  baudrate: 9600
  weight_regex: '\s*([0-9]{6})KG'
```
*Se for um indicador TCP/IP, altere o protocol para `tcp`, remova `baudrate` e adicione `host: 192.168.0.x`.*

## 3. Teste do Serviço (Health Check)
Após salvar o arquivo, inicie o serviço:
```bash
sudo systemctl restart balanca-bridge
```

Consulte se a leitura da balança está chegando:
```bash
curl http://127.0.0.1:8321/peso-atual
```

**Resultado Esperado:**
```json
{
  "conectado": true,
  "peso_kg": 14500.0,
  "timestamp": "2026-09-19T..."
}
```
Se `peso_kg` estiver incorreto ou não numérico, a regex no `config.yaml` deve ser corrigida (volte ao passo 2).

## 4. Reinstalação ou Troca de Indicador
Se o hardware queimar, e um novo for colocado:
1. Se o novo for de mesma marca/modelo, apenas conecte e reinicie o PC.
2. Se for modelo diferente, refaça o passo 2 ajustando a **regex**, o **baud rate** e reinicie a bridge. A Estação não precisará ser reinstalada.

## 5. Visualizando Logs Locais
Se o indicador enviar lixo (caracteres incompreensíveis), a configuração da velocidade do baud rate está errada na porta serial. Veja os logs de erro da Bridge:
```bash
sudo journalctl -u balanca-bridge -f
```
