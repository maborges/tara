# Pacote offline da estação

`create-offline-package.sh` gera um diretório transferível para uma estação sem
internet, incluindo `node_modules` quando disponível na máquina de build. A
estação de destino precisa ter apenas Node.js instalado.

O pacote não contém dados do IndexedDB nem credenciais reutilizáveis. A
ativação e o primeiro provisionamento exigem conexão uma vez; depois disso, a
PWA autentica operadores provisionados localmente e sincroniza quando a rede
voltar.
