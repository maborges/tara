import { apiFetch } from "@/lib/api";
import { db, getSession, setSession, type AnimalLocal, type OrdemPendenteLocal, type OperadorLocal } from "@/lib/db";

interface SyncPullResponse {
  sync_at: string;
  ordens_pendentes: OrdemPendenteLocal[];
  tombstones: { ordens: string[] };
  animais: AnimalLocal[];
}

interface ProvisioningResponse {
  recovery_secret_hash: string | null;
  recovery_secret_version: number;
  operators: OperadorLocal[];
}

export async function pullSync(): Promise<{ ok: boolean; error?: string }> {
  const session = await getSession();
  if (!session) return { ok: false, error: "Estação não ativada." };

  const params = new URLSearchParams({ device_id: session.device_id });
  if (session.last_sync_at) params.set("last_sync_at", session.last_sync_at);

  try {
    const [data, provisioning] = await Promise.all([
      apiFetch<SyncPullResponse>(`/api/v1/balanca/sync/pull?${params.toString()}`),
      apiFetch<ProvisioningResponse>("/api/v1/balanca/provisioning"),
    ]);

    await db.transaction("rw", db.ordens, db.animais, db.operadores, async () => {
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
      await db.operadores.clear();
      if (provisioning.operators.length > 0) await db.operadores.bulkPut(provisioning.operators);
    });

    await setSession({ ...session, last_sync_at: data.sync_at,
      recovery_secret_hash: provisioning.recovery_secret_hash,
      recovery_secret_version: provisioning.recovery_secret_version });
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Falha ao sincronizar." };
  }
}
