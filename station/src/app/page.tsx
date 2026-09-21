"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useLiveQuery } from "dexie-react-hooks";
import bcrypt from "bcryptjs";
import { getSession, setSession } from "@/lib/db";
import { ativarDispositivo, ApiError, hashLocalCredential } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

function getOrCreateFingerprint(): string {
  const key = "TARA_device_fingerprint";
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
        installation_id: resp.installation_id,
        device_configuration_id: resp.device_configuration_id,
        bridge_url: null,
        bridge_token: null,
        recovery_secret_hash: resp.recovery_secret ? await hashLocalCredential(resp.recovery_secret) : null,
        recovery_secret_version: resp.recovery_secret ? 1 : 0,
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
    <main className="flex min-h-screen items-center justify-center p-6 animated-gradient-bg">
      <Card className="w-full max-w-sm glass-panel-heavy border-0">
        <form onSubmit={handleAtivar}>
          <CardHeader className="text-center pt-8">
            <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-tr from-primary to-primary/80 shadow-[0_0_20px_var(--color-primary)] font-bold text-white text-3xl transition-transform hover:scale-105 duration-300">
              T
            </div>
            <CardTitle className="text-3xl font-bold tracking-tight">Tara Station</CardTitle>
            <CardDescription className="text-base mt-2 text-foreground/70">
              Insira o código de ativação gerado no painel administrativo para configurar este terminal.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5 pb-8">
            <div className="space-y-2">
              <label className="text-sm font-semibold tracking-wide text-foreground/80">Código de ativação</label>
              <Input
                className="h-14 uppercase tracking-[0.25em] text-center font-mono text-lg bg-background/50 focus:bg-background transition-colors focus:ring-primary/50"
                value={activationCode}
                onChange={(e) => setActivationCode(e.target.value)}
                minLength={12}
                maxLength={12}
                required
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-semibold tracking-wide text-foreground/80">PIN da estação</label>
              <Input
                type="password"
                className="h-14 text-center text-lg tracking-[0.5em] bg-background/50 focus:bg-background transition-colors focus:ring-primary/50"
                value={pin}
                onChange={(e) => setPin(e.target.value)}
                minLength={4}
                required
              />
            </div>
            {erro && (
              <div className="rounded-md bg-destructive/10 p-3 text-sm font-medium text-destructive border border-destructive/20 text-center animate-in fade-in slide-in-from-top-2">
                {erro}
              </div>
            )}
            <Button
              type="submit"
              className="w-full h-14 text-lg font-bold shadow-lg hover:shadow-primary/25 transition-all active:scale-[0.98] bg-gradient-to-r from-primary to-primary/80 hover:to-primary mt-4"
              disabled={carregando}
            >
              {carregando ? "Ativando..." : "Ativar Estação"}
            </Button>
          </CardContent>
        </form>
      </Card>
    </main>
  );
}
