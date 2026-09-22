"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useLiveQuery } from "dexie-react-hooks";
import { getSession, setSession, setBridgeConfig } from "@/lib/db";
import { apiFetch, ApiError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/shared/page-header";
import { HeaderBackButton } from "@/components/shared/header-back-button";

export default function ConfiguracoesPage() {
  const router = useRouter();
  const session = useLiveQuery(getSession);

  const [bridgeUrl, setBridgeUrl] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [sucesso, setSucesso] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [bridgeValidada, setBridgeValidada] = useState(false);
  const [resultadoTeste, setResultadoTeste] = useState<string | null>(null);
  const [validationId, setValidationId] = useState<string | null>(null);

  useEffect(() => {
    if (session) {
      setBridgeUrl(session.bridge_url || "");
    }
  }, [session]);

  async function testarBridge() {
    setErro(null); setResultadoTeste(null); setBridgeValidada(false);
    if (!bridgeUrl) { setBridgeValidada(true); setResultadoTeste("Captura manual selecionada."); return; }
    try {
      const base = bridgeUrl.replace(/\/$/, "");
      const headers: Record<string, string> = session?.bridge_token ? { "X-Bridge-Token": session.bridge_token } : {};
      const [health, peso] = await Promise.all([fetch(`${base}/health`), fetch(`${base}/peso-atual`, { headers })]);
      const healthBody = await health.json(); const pesoBody = await peso.json();
      if (!health.ok || healthBody.status !== "ok" || !peso.ok || typeof pesoBody.peso_kg !== "number") throw new Error("A Bridge não retornou um estado de peso válido.");
      
      setBridgeValidada(true);
      setResultadoTeste(`Bridge encontrada. Peso atual: ${pesoBody.peso_kg} kg${pesoBody.stable ? " (estável)" : ""}.`);
    } catch (err) { setErro(err instanceof Error ? err.message : "Não foi possível validar a Bridge."); }
  }

  async function handleSalvar(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    setSucesso(false);
    setSalvando(true);

    try {
      if (!session || !session.installation_id) {
        throw new Error("Instalação não configurada nesta sessão.");
      }
      if (!bridgeValidada) throw new Error("Teste a comunicação com a Bridge antes de salvar.");

      // 1. Cria configuração PENDING
      const devConfig = await apiFetch<{
        id: string;
        installation_id: string;
        bridge_url: string | null;
        status: string;
        bridge_proof_key?: string;
      }>("/api/v1/balanca/stations/device-configurations", {
        method: "POST",
        body: JSON.stringify({
          installation_id: session.installation_id,
          bridge_url: bridgeUrl || null,
        }),
      });

      if (bridgeUrl && devConfig.bridge_proof_key) {
        const base = bridgeUrl.replace(/\/$/, "");
        const headers: Record<string, string> = session?.bridge_token ? { "X-Bridge-Token": session.bridge_token } : {};
        
        // 2. Provisiona a Bridge
        const provReq = await fetch(`${base}/provision`, {
          method: "POST",
          headers: { "Content-Type": "application/json", ...headers },
          body: JSON.stringify({ proof_key: devConfig.bridge_proof_key }),
        });
        if (!provReq.ok) throw new Error("Falha ao enviar chave de prova para a Bridge");

        // 3. Valida a Configuração
        const challengeReq = await apiFetch<{ challenge_id: string; nonce: string }>("/api/v1/balanca/stations/bridge-validations/challenge", { 
          method: "POST",
          body: JSON.stringify({ device_configuration_id: devConfig.id })
        });
        
        const bridgeChallengeReq = await fetch(`${base}/challenge`, {
          method: "POST",
          headers: { "Content-Type": "application/json", ...headers },
          body: JSON.stringify({
            challenge_id: challengeReq.challenge_id,
            nonce: challengeReq.nonce,
            station_id: session.device_id,
            installation_id: session.installation_id,
            expires_at: new Date(Date.now() + 5 * 60000).toISOString(),
          })
        });
        if (!bridgeChallengeReq.ok) throw new Error("Falha ao resolver o desafio criptográfico com a Bridge.");
        const { proof } = await bridgeChallengeReq.json();
        
        await apiFetch<{ validation_id: string }>("/api/v1/balanca/stations/bridge-validations", { 
          method: "POST", 
          body: JSON.stringify({ 
            bridge_url: bridgeUrl, 
            challenge_id: challengeReq.challenge_id,
            bridge_token_proof: proof,
            peso_kg: 0 
          }) 
        });
      }

      // Salva no banco local
      await setSession({
        ...session,
        device_configuration_id: devConfig.id,
      });
      await setBridgeConfig(bridgeUrl || null, session.bridge_token);

      setSucesso(true);
    } catch (err) {
      setErro(err instanceof ApiError ? err.message : err instanceof Error ? err.message : "Falha ao salvar configuração.");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <main className="flex flex-col min-h-screen">
      <HeaderBackButton />
      <PageHeader title="Configurações Locais" />

      <div className="flex-1 p-6 bg-muted/30">
        <Card className="w-full max-w-lg mx-auto">
          <form onSubmit={handleSalvar}>
            <CardHeader>
              <CardTitle>Configuração de Equipamentos</CardTitle>
              <CardDescription>
                Esta configuração afeta apenas este dispositivo (instalação atual).
                A URL informada será usada para comunicar com a Bridge conectada à balança física.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-sm font-medium">URL da Bridge (Ponte de Hardware)</label>
                <Input
                  type="url"
                  placeholder="Ex: http://localhost:8321"
                  value={bridgeUrl}
                  onChange={(e) => { setBridgeUrl(e.target.value); setBridgeValidada(false); setResultadoTeste(null); }}
                />
                <p className="text-xs text-muted-foreground">
                  Se deixado em branco, a captura de peso será feita apenas de forma manual.
                </p>
              </div>

              {erro && <p className="text-sm font-medium text-destructive">{erro}</p>}
              {resultadoTeste && <p className="text-sm font-medium text-green-600">{resultadoTeste}</p>}
              {sucesso && <p className="text-sm font-medium text-green-600">Configuração salva com sucesso!</p>}

              <div className="pt-2 space-y-3">
                <Button type="button" variant="outline" className="w-full h-12 font-bold border-2 hover:border-primary/50 transition-colors" onClick={() => void testarBridge()} disabled={salvando}>Testar comunicação</Button>
                <Button type="submit" className="w-full h-12 text-lg font-bold shadow-xl hover:shadow-primary/40 hover:-translate-y-1 transition-all active:scale-[0.98] bg-gradient-to-r from-primary to-primary/90" disabled={salvando}>
                  {salvando ? "Salvando..." : "Salvar"}
                </Button>
              </div>
            </CardContent>
          </form>
        </Card>
      </div>
    </main>
  );
}
