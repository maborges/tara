"use client";

import { useEffect, useState } from "react";
import { ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { getPlatformSecuritySettings, savePlatformSecuritySettings, type PlatformSecuritySettings, type Session } from "@/lib/api";
import { toast } from "sonner";

const DEFAULTS: PlatformSecuritySettings = { session_minutes: 30, idle_minutes: 120, refresh_enabled: true, warning_minutes: 5 };

export function PlatformSecuritySettingsPanel({ session }: { session: Session }) {
  const [settings, setSettings] = useState(DEFAULTS); const [busy, setBusy] = useState(false); const [error, setError] = useState<string | null>(null);
  useEffect(() => { void getPlatformSecuritySettings(session).then(setSettings).catch((cause) => setError(cause instanceof Error ? cause.message : "Falha ao carregar configuração.")); }, [session]);
  async function save() { setBusy(true); setError(null); try { setSettings(await savePlatformSecuritySettings(session, settings)); toast.success("Política de sessões salva."); } catch (cause) { const detail = cause instanceof Error ? cause.message : "Falha ao salvar configuração."; setError(detail); toast.error(detail); } finally { setBusy(false); } }
  return <Card><CardHeader><CardTitle className="flex items-center gap-2"><ShieldCheck size={18} /> Segurança e sessões</CardTitle><CardDescription>Defina a política aplicada ao Portal e ao Backoffice. Alterações valem para novos tokens e próximas renovações.</CardDescription></CardHeader><CardContent className="grid gap-4 sm:grid-cols-2"><label className="flex items-center gap-2 text-sm sm:col-span-2"><input type="checkbox" checked={settings.refresh_enabled} onChange={(event) => setSettings({ ...settings, refresh_enabled: event.target.checked })} /> Permitir renovação automática enquanto houver atividade</label><Field label="Validade do token (minutos)" help="Tempo de validade de cada token emitido."><Input type="number" min={5} max={480} value={settings.session_minutes} onChange={(event) => setSettings({ ...settings, session_minutes: Number(event.target.value) })} /></Field><Field label="Inatividade máxima (minutos)" help="Período sem atividade após o qual a sessão deverá ser encerrada pelo frontend."><Input type="number" min={15} max={1440} value={settings.idle_minutes} onChange={(event) => setSettings({ ...settings, idle_minutes: Number(event.target.value) })} /></Field><Field label="Aviso antes da expiração (minutos)" help="Antecedência usada para iniciar a renovação preventiva."><Input type="number" min={1} max={60} value={settings.warning_minutes} onChange={(event) => setSettings({ ...settings, warning_minutes: Number(event.target.value) })} /></Field>{error && <p className="text-sm text-destructive sm:col-span-2">{error}</p>}<div className="flex justify-end sm:col-span-2"><Button onClick={() => void save()} disabled={busy}>{busy ? "Salvando…" : "Salvar política"}</Button></div></CardContent></Card>;
}
function Field({ label, help, children }: { label: string; help: string; children: React.ReactNode }) { return <label className="grid gap-1 text-sm font-medium">{label}<span className="text-xs font-normal text-muted-foreground">{help}</span>{children}</label>; }
