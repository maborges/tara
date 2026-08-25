# Pacote offline da estação

`create-offline-package.sh` gera um diretório transferível para uma estação sem
internet. A máquina de empacotamento precisa ter as dependências instaladas;
a estação de destino deve receber também o cache/artefatos de dependências do
runtime Node conforme a política de distribuição da fazenda.

O pacote não contém credenciais nem dados do IndexedDB. A ativação do terminal
e a primeira sincronização continuam exigindo conexão; depois disso, a PWA
opera localmente e sincroniza quando a rede voltar.
