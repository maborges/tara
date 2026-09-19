# Runbook: Contingência (Exportação Local)

Quando uma estação perde permanentemente a comunicação ou a fila não sincroniza após longos períodos, os registros de pesagem gerados localmente podem ser resgatados e entregues ao servidor central através de um pendrive físico.

**Atenção: A contingência não modifica a arquitetura. Trata-se do fluxo suportado pelo contrato `balanca.contingency.v1`.**

## 1. Quando Usar?
- Quando a internet caiu e não tem previsão de retorno até o final do turno operacional.
- Quando o PWA apresenta um erro irreversível de sync e o Nível 2 aconselhou não forçar atualizações.

## 2. Como Exportar (Procedimento do Operador/Suporte)
1. Certifique-se de que todas as pesagens correntes do turno terminaram.
2. Na Station (PWA), navegue até o menu de sincronização.
3. Clique no botão **"Exportar Contingência"**.
4. O navegador fará o download de um arquivo nomeado `<timestamp>.balanca.json`.
5. Copie este arquivo para um pendrive (se a extração ocorreu no computador da balança).
6. Leve/envie (via meio seguro) o arquivo para o suporte de Nível 2 (Administrador da Plataforma).
7. **NÃO limpe o cache do navegador nem desinstale o PWA ainda.**

## 3. Como Importar (Procedimento do Administrador/Engenharia)
No piloto, a importação da contingência será assistida pela engenharia usando os utilitários da plataforma para garantir que os dados entrem corretamente. Não existe uma UI de Backoffice para isso nesta fase.

Execute no servidor ou ambiente técnico (onde o Backoffice e backend da balança estejam rodando e conectados ao banco de dados):

```bash
cd /opt/lampp/htdocs/tara/service
source .venv/bin/activate

# Supondo que você obteve o JWT de administração e o UUID do Tenant
python3 import_contingency.py /caminho/para/o/pacote.balanca.json \
  --tenant <UUID_DO_TENANT> \
  --token <JWT_DO_BACKOFFICE>
```

### Resultados da Importação:
- **IMPORTADO**: 100% dos registros foram aceitos ou reconhecidos como duplicados (idempotência funcionou). Pode apagar a fila da estação.
- **PARCIAL**: Alguns rejeitados, alguns aceitos. **Engenharia deve analisar** os logs.
- **REJEITADO**: Pacote inválido (falha de assinatura criptográfica) ou formatado incorretamente (ex: corrupção via e-mail). 

## 4. Evitando Duplicidade
A arquitetura baseada em `local_id` com assinaturas trata automaticamente duplicidades. Não há risco real de duplicar a mesma pesagem se o arquivo for importado duas vezes. O arquivo é carimbado e protegido. Não tente abrir o arquivo para alterar os pesos.
