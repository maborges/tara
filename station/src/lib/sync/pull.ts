import { apiFetch } from "@/lib/api";
import { db, getSession, setSession, type AnimalLocal, type OrdemPendenteLocal, type OperadorLocal, type OfflineAuthLocal } from "@/lib/db";

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

interface ReplenishResponse {
  items: OfflineAuthLocal[];
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
    
    // Purge expired auths
    const nowIso = new Date().toISOString();
    await db.offline_auths.where("expires_at").below(nowIso).delete();
    
    const countAuths = await db.offline_auths.count();
    let newAuths: OfflineAuthLocal[] = [];
    if (countAuths < 50 && session.device_configuration_id) {
        try {
            const replResp = await apiFetch<ReplenishResponse>(
                `/api/v1/balanca/stations/offline-authorizations/replenish`,
                {
                    method: "POST",
                    body: JSON.stringify({ device_configuration_id: session.device_configuration_id, count: 50 })
                }
            );
            newAuths = replResp.items;
        } catch (e) {
            console.warn("Falha ao reabastecer pool offline:", e);
        }
    }

    await db.transaction("rw", db.ordens, db.operacoes, db.animais, db.operadores, db.offline_auths, async () => {
      for (const ordem of data.ordens_pendentes) {
        await db.ordens.put(ordem);
        const mappedOperations = await db.operacoes.where("ordem_id").equals(ordem.id).toArray();
        for (const operacao of mappedOperations) {
          await db.operacoes.update(operacao.operation_local_id, {
            natureza_operacao: ordem.natureza_operacao,
            modalidade: ordem.modalidade,
            peso_bruto_kg: ordem.peso_bruto_kg,
            peso_tara_kg: ordem.peso_tara_kg,
            peso_liquido_kg: ordem.peso_liquido_kg,
            tara_source: ordem.tara_source,
            resultado_status: ordem.resultado_status,
            resultado_motivo: ordem.resultado_motivo,
            delta_pre_operacao_kg: ordem.delta_pre_operacao_kg,
            delta_pos_operacao_kg: ordem.delta_pos_operacao_kg,
            status_local: ordem.status === "CONCLUIDA" ? "CONCLUIDA" : operacao.status_local,
            updated_at: new Date().toISOString(),
          });
        }
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
      if (newAuths.length > 0) await db.offline_auths.bulkPut(newAuths);
    });

    await setSession({ ...session, last_sync_at: data.sync_at,
      recovery_secret_hash: provisioning.recovery_secret_hash,
      recovery_secret_version: provisioning.recovery_secret_version });
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Falha ao sincronizar." };
  }
}
