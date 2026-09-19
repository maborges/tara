# Runbook: Suporte ao Piloto

## 1. Nível 1 - Atendimento Operacional (Triagem)
O Nível 1 não necessita de acesso a banco de dados ou SSH. As informações são fornecidas pelo próprio operador através da interface visual da Station (PWA).

**Diagnóstico Básico (O que perguntar ao operador):**
- A Station (PWA) abre e a tela de login/pesagem é exibida?
- O indicador no topo da tela mostra "Conectado à Internet" ou "Offline"?
- O indicador de Balança mostra "Conectada" (verde) ou há alguma mensagem de erro de Bridge?
- O "Peso Atual" muda na tela quando um veículo sobe na balança?
- Há pesagens indicadas como pendentes (fila não sincronizada)?

## 2. Nível 2 - Investigação Técnica
O Nível 2 exige acesso aos servidores, APIs de diagnóstico ou SSH à máquina física (para Bridge).

### 2.1 Verificando Saúde da Plataforma
```bash
curl -s http://api.tara.exemplo/healthz
curl -s http://api.tara.exemplo/readyz
```

### 2.2 Verificando Bridge (Local na Estação)
Acessar a máquina cliente (via SSH/AnyDesk):
```bash
# O status do serviço:
sudo systemctl status balanca-bridge

# Os logs recentes para encontrar falhas de parsing ou hardware:
sudo journalctl -u balanca-bridge --tail 50
```

### 2.3 Árvore de Diagnóstico: "NÃO ESTÁ PESANDO"

1. **Station abre?** Se não abre, verificar serviço local (`npm run start` do Next.js).
2. **Bridge responde?** Executar `curl http://127.0.0.1:8321/health` no PC da balança.
3. **Indicador responde?** Executar `curl http://127.0.0.1:8321/peso-atual`. Se `conectado: false`, há problema de cabo, porta COM bloqueada ou indicador desligado.
4. **Peso atual aparece mas nunca estabiliza?** O cabo está ruidoso ou as configurações de tolerância/serialização estão incorretas (ajustar no `config.yaml`).
5. **Device está ACTIVE no Backoffice?** Se não, o challenge/proof da Bridge falhou. Validar as chaves JWT no `.env.local`.
6. **Captura funciona mas sync não?** Rede com firewall bloqueando a API, ou `TARA_SERVICE_URL` com configuração incorreta/token técnico revogado.

## 3. Engenharia (Incidentes Críticos)
A equipe de engenharia deve ser escalada nos seguintes cenários:
- Bug na tela da PWA que impede operação.
- Corrupção de dados IndexedDB impeditiva (Estação travada, sem conseguir exportar contigência).
- Falhas criptográficas (Assinaturas offline inválidas, proof validation failing silenciosamente).
- Indisponibilidade dos Bancos de Dados / Mensageria / Filas do Core da Tara.

### 3.1 Classificação de Incidentes (SLA)
- **P0**: Risco de perda de dados irreparável ou operação de pesagem parada para o cliente e contingência física falhando.
- **P1**: Captura eletrônica indisponível (a balança não informa o peso), mas Station operando para capturas manuais temporárias.
- **P2**: Estação pesando normalmente, porém Sync/Delivery atrasado ou travado (dados preservados no cache local ou no backend, mas pendentes de entrega).
- **P3**: Problema menor na UX (PWA), falhas descritivas ou problemas em manuais e documentações.
