"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useLiveQuery } from "dexie-react-hooks";
import bcrypt from "bcryptjs";
import { getSession, setSession } from "@/lib/db";
import { ativarDispositivo, ApiError } from "@/lib/api";

function getOrCreateFingerprint(): string {
  const key = "balanca_device_fingerprint";
  let fp = localStorage.getItem(key);
  if (!fp) {
    fp = crypto.randomUUID();
    localStorage.setItem(key, fp);
  }
  return fp;
}

export default function HomePage() {
  const router = useRouter();

  // Gate de montagem: o servidor não tem IndexedDB, então o primeiro paint no
  // cliente precisa ser idêntico ao HTML do servidor. Só depois do mount é
  // seguro consultar o Dexie (useLiveQuery) e decidir o que renderizar —
  // evita divergência de hydration entre servidor e cliente.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const session = useLiveQuery(getSession);

  useEffect(() => {
    if (mounted && session) router.replace("/pesagem");
  }, [mounted, session, router]);

  const [activationCode, setActivationCode] = useState("");
  const [pin, setPin] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(false);

  async function handleAtivar(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    setCarregando(true);
    try {
      const pinHash = bcrypt.hashSync(pin, 10);
      const fingerprint = getOrCreateFingerprint();
      const resp = await ativarDispositivo({
        activation_code: activationCode.trim().toUpperCase(),
        pin_hash: pinHash,
        device_fingerprint: fingerprint,
      });
      await setSession({
        device_id: resp.device_id,
        device_token: resp.device_token,
        tenant_id: resp.tenant_id,
        nome: resp.nome,
        fazenda_ids: resp.fazenda_ids,
        expires_at: resp.expires_at,
        last_sync_at: null,
        bridge_url: null,
        bridge_token: null,
      });
      router.replace("/pesagem");
    } catch (err) {
      setErro(err instanceof ApiError ? err.message : "Falha ao ativar a estação.");
    } finally {
      setCarregando(false);
    }
  }

  if (!mounted || session) return null;

  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <form onSubmit={handleAtivar} className="w-full max-w-sm space-y-4 rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
        <h1 className="text-xl font-semibold">Ativar Estação de Balança</h1>
        <p className="text-sm text-gray-500">
          Peça ao administrador do tenant o código de ativação gerado em Configurações → Balança.
        </p>

        <div className="space-y-1">
          <label className="text-sm font-medium">Código de ativação</label>
          <input
            className="w-full rounded border border-gray-300 px-3 py-2 uppercase tracking-widest"
            value={activationCode}
            onChange={(e) => setActivationCode(e.target.value)}
            maxLength={8}
            required
          />
        </div>

        <div className="space-y-1">
          <label className="text-sm font-medium">PIN da estação</label>
          <input
            type="password"
            className="w-full rounded border border-gray-300 px-3 py-2"
            value={pin}
            onChange={(e) => setPin(e.target.value)}
            minLength={4}
            required
          />
        </div>

        {erro && <p className="text-sm text-red-600">{erro}</p>}

        <button
          type="submit"
          disabled={carregando}
          className="w-full rounded bg-orange-600 py-2 font-medium text-white disabled:opacity-50"
        >
          {carregando ? "Ativando..." : "Ativar"}
        </button>
      </form>
    </main>
  );
}
