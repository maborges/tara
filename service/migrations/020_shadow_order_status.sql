-- Ordens sombra permanecem pendentes de reconciliação até decisão do consumidor.
alter table tara.ordens alter column status type varchar(40);
