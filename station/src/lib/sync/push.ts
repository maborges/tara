import { apiFetch } from "@/lib/api";
import { db, getSession, recoverInterruptedSync } from "@/lib/db";

interface SyncPushItemResult {
  local_id: string;
  status: "CREATED" | "ERROR" | "CONFLICT";
  server_id: string | null;
  error_message?: string | null;
  operation_local_id?: string | null;
  ordem_id?: string | null;
}

interface SyncPushResponse {
  processed_at: string;
  results: SyncPushItemResult[];
}

const MAX_BATCH = 50;
const MAX_ATTEMPTS = 5;

export async function pushSync(): Promise<{ ok: boolean; sincronizados: number; error?: string }> {
  const session = await getSession();
  if (!session) return { ok: false, sincronizados: 0, error: "Estação não ativada." };

  await recoverInterruptedSync();
  const pendentes = await db.sync_queue.where("status").equals("PENDING").limit(MAX_BATCH).toArray();
  if (pendentes.length === 0) return { ok: true, sincronizados: 0 };

  await Promise.all(pendentes.map((item) => db.sync_queue.update(item.id!, { status: "IN_FLIGHT" })));

  const items = await Promise.all(
    pendentes.map(async (queueItem) => {
      const pesagem = await db.pesagens.get(queueItem.local_id);
      const operacao = pesagem?.operation_local_id
        ? await db.operacoes.get(pesagem.operation_local_id)
        : undefined;
      return {
        local_id: queueItem.local_id,
        operation: queueItem.operation,
        entity_type: "pesagem" as const,
        server_id: queueItem.server_id,
        payload: pesagem
          ? {
              ordem_id: pesagem.ordem_id,
              authorization_id: pesagem.authorization_id,
              authorization_nonce: pesagem.authorization_nonce,
              installation_id: pesagem.installation_id,
              device_configuration_id: pesagem.device_configuration_id ?? session.device_configuration_id,
              subject_type: pesagem.subject_type,
              tipo_pesagem: pesagem.tipo_pesagem,
              natureza_operacao: pesagem.natureza_operacao ?? operacao?.natureza_operacao,
              modalidade: pesagem.modalidade ?? operacao?.modalidade,
              etapa: pesagem.etapa,
              numero_ticket: pesagem.numero_ticket,
              peso_informado_kg: pesagem.peso_informado_kg,
              peso_aferido_kg: pesagem.peso_aferido_kg,
              peso_tara_kg: pesagem.peso_tara_kg,
              captured_via: pesagem.captured_via,
              leitura_bruta: pesagem.leitura_bruta,
              placa: pesagem.placa,
              motorista: pesagem.motorista,
              animal_id: pesagem.animal_id,
              pessoa_id: pesagem.pessoa_id,
              operador_pessoa_id: pesagem.operador_pessoa_id,
              operador_id: pesagem.operador_id,
              direcao_veiculo: pesagem.direcao_veiculo,
              natureza_mercadoria: pesagem.natureza_mercadoria,
              tipo_operacao: pesagem.tipo_operacao,
              finalidade: pesagem.finalidade,
              metodo_medicao: pesagem.metodo_medicao,
              operacao: operacao
                ? {
                    operation_local_id: operacao.operation_local_id,
                    subject_type: operacao.subject_type,
                    tipo_pesagem: operacao.tipo_pesagem,
                    natureza_operacao: operacao.natureza_operacao,
                    modalidade: operacao.modalidade,
                    processo: operacao.processo,
                    referencia_externa: operacao.referencia_externa,
                    correlation_id: operacao.correlation_id,
                    veiculo: (operacao.contexto.veiculo as Record<string, unknown>) ?? {},
                    motorista: (operacao.contexto.motorista as Record<string, unknown>) ?? {},
                    contexto: operacao.contexto,
                  }
                : undefined,
              contexto: { ...pesagem.contexto, placa: pesagem.placa, motorista: pesagem.motorista,
                animal_id: pesagem.animal_id, numero_ticket: pesagem.numero_ticket },
              data_pesagem: pesagem.data_pesagem,
            }
          : {},
        client_created_at: pesagem?.client_created_at ?? new Date().toISOString(),
        client_updated_at: pesagem?.client_updated_at ?? new Date().toISOString(),
      };
    }),
  );

  try {
    const data = await apiFetch<SyncPushResponse>("/api/v1/balanca/sync/push", {
      method: "POST",
      body: JSON.stringify({ device_id: session.device_id, last_sync_at: session.last_sync_at, items }),
    });

    let sincronizados = 0;
    for (const result of data.results) {
      const queueItem = pendentes.find((p) => p.local_id === result.local_id);
      if (!queueItem) continue;

      if (result.status === "CREATED") {
        await db.sync_queue.update(queueItem.id!, { status: "DONE", server_id: result.server_id });
        await db.pesagens.update(result.local_id, { synced: 1, server_id: result.server_id });
        if (result.operation_local_id && result.ordem_id) {
          const operacao = await db.operacoes.get(result.operation_local_id);
          if (operacao) {
            await db.operacoes.update(result.operation_local_id, {
              ordem_id: result.ordem_id,
              reconciliation_status: "MAPEADA",
              status_local: operacao.tipo_pesagem === "UNICA" ? "CONCLUIDA" : "EM_PESAGEM",
              updated_at: new Date().toISOString(),
            });
            // The captured record retains its original local_id and physical
            // snapshot; only its canonical link is learned after sync.
            await db.pesagens.where("operation_local_id").equals(result.operation_local_id)
              .modify({ ordem_id: result.ordem_id });
          }
        }
        sincronizados += 1;
      } else if (result.status === "CONFLICT") {
        if (result.operation_local_id) {
          await db.operacoes.update(result.operation_local_id, {
            status_local: "PENDENTE_RECONCILIACAO",
            reconciliation_status: "PENDENTE_RECONCILIACAO",
            updated_at: new Date().toISOString(),
          });
        }
        await db.sync_queue.update(queueItem.id!, { status: "FAILED", attempts: MAX_ATTEMPTS });
      } else {
        const attempts = queueItem.attempts + 1;
        await db.sync_queue.update(queueItem.id!, {
          status: attempts >= MAX_ATTEMPTS ? "FAILED" : "PENDING",
          attempts,
        });
      }
    }
    return { ok: true, sincronizados };
  } catch (err) {
    await Promise.all(
      pendentes.map((item) =>
        db.sync_queue.update(item.id!, {
          status: item.attempts + 1 >= MAX_ATTEMPTS ? "FAILED" : "PENDING",
          attempts: item.attempts + 1,
        }),
      ),
    );
    return { ok: false, sincronizados: 0, error: err instanceof Error ? err.message : "Falha ao sincronizar." };
  }
}

export async function enqueuePesagem(localId: string): Promise<void> {
  const existente = await db.sync_queue.where("local_id").equals(localId).first();
  if (existente) return;
  await db.sync_queue.add({
    local_id: localId,
    entity_type: "pesagem",
    operation: "CREATE",
    server_id: null,
    status: "PENDING",
    attempts: 0,
    created_at: new Date().toISOString(),
  });
}
