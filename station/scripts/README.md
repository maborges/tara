# Pacote offline da estação

`create-offline-package.sh` gera um arquivo `.tar.gz` versionado e transferível
para uma estação sem internet. Ele inclui build, dependências e `install.sh`.
A estação de destino precisa ter apenas Node.js 20 ou superior instalado.

```bash
pnpm station:package
# ou: pnpm --dir station package:offline /caminho/para/saida
```

O instalador cria ou preserva `/opt/balanca-estacao/.env.local`; as credenciais
de ativação são preenchidas exclusivamente na máquina da Estação. O kit não
transporta segredos, token da Estação nem dados do IndexedDB.

O pacote não contém dados do IndexedDB nem credenciais reutilizáveis. A
ativação e o primeiro provisionamento exigem conexão uma vez; depois disso, a
PWA autentica operadores provisionados localmente e sincroniza quando a rede
voltar.
