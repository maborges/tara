import { z } from "zod";

export const balancaSubjectTypeSchema = z.enum(["VEICULO", "ANIMAL"]);

export const balancaTipoPesagemSchema = z.enum([
  "UNICA",
  "DUPLA",
  "DUPLA_ENTRADA_DESCARGA",
  "DUPLA_SAIDA_CARREGAMENTO",
]);

export const balancaExternalReferenceSchema = z.object({
  client_system: z.string().min(1).max(80),
  client_tenant_id: z.string().min(1).max(120),
  external_reference: z.string().min(1).max(160),
  correlation_id: z.string().min(1).max(160),
});

export const balancaOrderRequestSchema = balancaExternalReferenceSchema.extend({
  subject_type: balancaSubjectTypeSchema,
  tipo_pesagem: balancaTipoPesagemSchema,
  contexto: z.record(z.string(), z.unknown()).default({}),
  data_agendada: z.string().datetime().nullable().optional(),
});

export const balancaEventEnvelopeSchema = z.object({
  event_id: z.string().uuid(),
  idempotency_key: z.string().min(1).max(180),
  event_type: z.string().min(1).max(120),
  event_version: z.literal("v1"),
  occurred_at: z.string().datetime(),
  TARA_account_id: z.string().uuid(),
  client_system: z.string().min(1).max(80),
  client_tenant_id: z.string().min(1).max(120),
  correlation_id: z.string().min(1).max(160),
  external_reference: z.string().min(1).max(160),
  entity_id: z.string().uuid(),
  payload: z.record(z.string(), z.unknown()),
});

export const balancaOperatorLinkSchema = z.object({
  operador_TARA_id: z.string().uuid(),
  pessoa_cliente_id: z.string().uuid().nullable(),
});

export type BalancaOrderRequest = z.infer<typeof balancaOrderRequestSchema>;
export type BalancaEventEnvelope = z.infer<typeof balancaEventEnvelopeSchema>;
export type BalancaOperatorLink = z.infer<typeof balancaOperatorLinkSchema>;
