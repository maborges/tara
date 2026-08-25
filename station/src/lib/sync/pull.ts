import { apiFetch } from "@/lib/api";
import { db, getSession, setSession, type AnimalLocal, type OrdemPendenteLocal } from "@/lib/db";

interface SyncPullResponse {
  sync_at: string;
  ordens_pendentes: OrdemPendenteLocal[];
  tombstones: { ordens: string[] };
  animais: AnimalLocal[];
}

export async function pullSync(): Promise<{ ok: boolean; error?: string }> {
  const session = await getSession();
  if (!session) return { ok: false, error: "Estação não ativada." };

  const params = new URLSearchParams({ device_id: session.device_id });
  if (session.last_sync_at) params.set("last_sync_at", session.last_sync_at);

  try {
    const data = await apiFetch<SyncPullResponse>(`/api/v1/balanca/sync/pull?${params.toString()}`);

    await db.transaction("rw", db.ordens, db.animais, async () => {
      for (const ordem of data.ordens_pendentes) {
        await db.ordens.put(ordem);
      }
      for (const id of data.tombstones.ordens) {
        await db.ordens.delete(id);
      }
      // Snapshot completo (o backend não faz pull incremental de animais) —
      // substitui o cache local a cada sync.
      await db.animais.clear();
      if (data.animais.length > 0) {
        await db.animais.bulkPut(data.animais);
      }
    });

    await setSession({ ...session, last_sync_at: data.sync_at });
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Falha ao sincronizar." };
  }
}
