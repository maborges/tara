# Balança Bridge

Serviço leve e independente que fica **perto do indicador de balança** (Raspberry
Pi ou PC dedicado), lê o peso via **serial RS232** ou **TCP/Ethernet** e expõe
na rede local para o PWA `../station` consumir — sem depender de internet.

Não assume marca/modelo de indicador: a extração do peso é configurável por
regex em `config.yaml` (ver `config.yaml.example`), cobrindo o formato ASCII
"contínuo" usado pela maioria dos equipamentos.

## Instalação

```bash
cd /opt/lampp/htdocs/balanca-platform/bridge
python3 -m venv .venv
./.venv/bin/pip install -r requirements.txt
cp config.yaml.example config.yaml
# edite config.yaml: porta serial ou host/porta TCP do indicador
```

Em Linux/Raspberry Pi, a instalação automatizada cria o ambiente virtual e o
serviço de inicialização:

```bash
sudo ./install.sh
```

Para atualização, copie o novo pacote e execute o mesmo comando. O `config.yaml`
existente é preservado e o serviço é reiniciado; a configuração do indicador
não fica misturada ao código da aplicação.

Para preparar uma instalação sem internet, gere antes um wheelhouse em uma
máquina conectada:

```bash
./prepare-offline-bundle.sh dist/wheelhouse
sudo TARA_BRIDGE_WHEELHOUSE=/caminho/dist/wheelhouse ./install.sh
```

## Rodar

```bash
./.venv/bin/python -m TARA_bridge.main
```

Por padrão sobe em `http://0.0.0.0:8321`. Endpoints:

| Rota | Descrição |
|---|---|
| `GET /health` | Liveness check |
| `GET /peso-atual` | Última leitura (`peso_kg`, `raw`, `timestamp`, `conectado`, `stale`) |
| `WS /ws/peso` | Stream ao vivo — envia o estado atual na conexão e cada atualização depois |

Se `api_token` estiver definido em `config.yaml`, todo request precisa do
header `X-Bridge-Token` (REST) ou `x-bridge-token` (WebSocket).

Por segurança operacional, a ponte só marca uma leitura como `stable` após
três leituras consecutivas dentro da tolerância configurada (`stable_readings`
e `stable_tolerance_kg`). A estação só habilita "Usar este peso" quando a
leitura está conectada, atualizada e estável.

## Testar sem hardware físico

Ainda sem indicador definido? Use o simulador incluso — ele abre um servidor
TCP que emite peso simulado (com variação aleatória) no mesmo formato ASCII
que a maioria dos indicadores usa:

```bash
# Terminal 1
./.venv/bin/python simulator.py --port 4001 --peso-base 12500

# config.yaml:
#   connection_type: TCP
#   tcp: { host: 127.0.0.1, port: 4001 }

# Terminal 2
./.venv/bin/python -m TARA_bridge.main
curl http://127.0.0.1:8321/peso-atual
```

## Rodar como serviço no boot (Raspberry Pi / Linux)

Crie `/etc/systemd/system/balanca-bridge.service`:

```ini
[Unit]
Description=Balança Bridge
After=network.target

[Service]
Type=simple
WorkingDirectory=/opt/balanca-bridge
ExecStart=/opt/balanca-bridge/.venv/bin/python -m TARA_bridge.main
Restart=always
RestartSec=3
Environment=TARA_BRIDGE_CONFIG=/opt/balanca-bridge/config.yaml

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl enable --now balanca-bridge
```

## Ajustando para um indicador real

Quando souber a marca/modelo:
1. Conecte o indicador e capture algumas linhas brutas (`cat /dev/ttyUSB0` ou
   `nc <ip> <porta>` para TCP) para ver o formato exato do frame.
2. Ajuste em `config.yaml`: `weight_regex` (se o frame tiver mais de um número
   e precisar pegar um específico), `decimal_separator`, `unit`, `scale_factor`.
3. Não precisa reescrever código — `ProtocolAdapter` é genérico por regex.

## Testes

```bash
./.venv/bin/pip install pytest pytest-asyncio httpx
./.venv/bin/python -m pytest tests/ -v
```

Cobre: extração de peso (várias unidades/separadores/erros) e um teste de
ponta a ponta que sobe um indicador TCP fake e confere que a ponte lê e expõe
o peso corretamente.
