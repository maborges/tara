import { apiFetch } from "@/lib/api";
import { db, getSession, recoverInterruptedSync } from "@/lib/db";

interface SyncPushItemResult {
  local_id: string;
  status: "CREATED" | "ERROR";
  server_id: string | null;
  error_message?: string | null;
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
      return {
        local_id: queueItem.local_id,
        operation: queueItem.operation,
        entity_type: "pesagem" as const,
        server_id: queueItem.server_id,
        payload: pesagem
          ? {
              ordem_id: pesagem.ordem_id,
              subject_type: pesagem.subject_type,
              tipo_pesagem: pesagem.tipo_pesagem,
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
        sincronizados += 1;
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
