# Destino de evento por Conta

O destino, a credencial de assinatura e a política de retry pertencem à Conta consumidora, não a uma configuração global do processo de outbox. Essa decisão isola consumidores, permite políticas independentes e evita que uma única falha ou configuração misture eventos de Contas diferentes.
