# Instalação e atualização offline da estação

A estação é uma PWA instalada no navegador da estação de pesagem. A primeira
ativação exige conexão para registrar o dispositivo e receber o token; depois
da ativação, a captura de peso, a troca de operador já sincronizado e a fila
local funcionam sem internet.

## Procedimento operacional

1. Com a rede disponível, abrir a URL publicada da estação e ativar o terminal.
2. Aguardar a primeira sincronização e confirmar que os operadores e ordens
   do terminal aparecem no cache local.
3. Instalar pelo navegador ("Instalar aplicação") e manter a URL nos favoritos
   como contingência.
4. Testar uma pesagem com a rede desligada; o ticket local e a fila devem
   permanecer disponíveis.
5. Ao restabelecer a rede, aguardar a sincronização ou usar "Reprocessar falhas".

Se a rede permanecer indisponível, usar "Exportar contingência" e copiar o
arquivo `.balanca.json` para um pendrive. O arquivo deve ser importado no
backoffice do serviço Balança; não editar o conteúdo nem apagar as pesagens
locais até receber a confirmação da importação.

Quando a estação usar o serviço independente, configure no servidor Next.js
BALANCA_SERVICE_URL, BALANCA_SERVICE_CLIENT_ID, BALANCA_SERVICE_CLIENT_SECRET e
BALANCA_TENANT_ID. O navegador
continua falando somente com o proxy da estação; a chave do serviço não deve
ser publicada em código ou variável NEXT_PUBLIC_*.

## Atualização

Atualizações do PWA são recebidas pelo Service Worker. O cache de navegação é
versionado pelo build; as rotas de API nunca são cacheadas. O operador não deve
limpar dados do site durante uma atualização, pois o IndexedDB contém pesagens
pendentes. A atualização deve ser feita com a estação sem fila pendente, quando
possível, e validada abrindo a tela de pesagem antes de iniciar o turno.

Se a conexão cair durante uma atualização, a versão anterior em cache continua
abrindo; a fila local não é descartada. O pacote Bridge é independente do PWA
e deve ser atualizado separadamente no computador/Raspberry Pi.

O recurso de contingência pertence ao serviço Balança e pode ser utilizado por
qualquer cliente ou estação que implemente o contrato
`balanca.contingency.v1`, não apenas pelo AgroSaaS.

## Critério de contingência

Nunca apagar `balanca_db` para corrigir uma falha de sincronização. Registrar o
erro, preservar a estação e usar o reprocessamento após a rede retornar.
