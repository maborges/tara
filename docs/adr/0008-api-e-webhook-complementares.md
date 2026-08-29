# API e webhook como canais complementares

O `service` expõe uma API autenticada para consulta e reconciliação e entrega eventos por webhook via outbox. O webhook é o caminho principal de baixa latência; a API permite retomada, auditoria e recuperação sem depender da entrega assíncrona.
