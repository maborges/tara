"use client";

import { useEffect, useState } from "react";
import { Activity, Ban, Check, ClipboardList, Copy, Gauge, HelpCircle, KeyRound, LogOut, Mail, Plus, RefreshCw, RotateCcw, RotateCw, Settings2, ShieldCheck, Sun, Moon, Users, Wifi } from "lucide-react";
import { authenticate, createApiClient, createPortalOperator, createPortalStation, formatDate, getApiClientConfiguration, getPortalDashboard, getPortalSessionPolicy, getWebhookDestination, linkPortalOperator, listApiClients, listPortalOperators, listPortalOperatorStations, listPortalOrders, listPortalStations, listPortalUsers, listPortalWeighings, refreshSession, registerAccount, revokeApiClient, rotateApiClient, saveWebhookDestination, sendApiKeyRecoveryEmail, setWebhookStatus, testWebhookDestination, unlinkPortalOperator, updatePortalOperatorStatus, updatePortalStationStatus, updatePortalUser, resetPortalOperatorPin, type AccountDashboard, type ApiClient, type ApiClientConfiguration, type NewCredential, type PlatformSecuritySettings, type PortalOperator, type PortalOrder, type PortalStation, type PortalUser, type PortalWeighing, type Session, type WebhookDestination } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { Dialog } from "@/components/ui/dialog";
import { PageHeader } from "@/components/shared/page-header";
import { SidebarProvider, Sidebar, SidebarContent, SidebarGroup, SidebarGroupLabel, SidebarGroupContent, SidebarMenu, SidebarMenuItem, SidebarMenuButton, SidebarHeader, SidebarFooter, SidebarTrigger } from "@/components/ui/sidebar";
import { UserRound } from "lucide-react";
import { toast } from "sonner";

const SCOPES = [
  ["clients:write", "Registrar clientes consumidores", "Permite que o sistema registre ou atualize sua identificação dentro da Conta."],
  ["orders:write", "Criar ordens de pesagem", "Permite criar Ordens de pesagem antes da operação na Estação."],
  ["orders:read", "Consultar ordens de pesagem", "Permite consultar as Ordens e seus status para acompanhar o processo."],
  ["weighings:read", "Consultar pesagens", "Permite consultar as Pesagens registradas, inclusive por cursor e status."],
  ["events:read", "Consultar eventos", "Permite consultar o histórico de eventos e o estado de entrega da integração."],
  ["stations:activate", "Ativar estações", "Permite usar esta credencial somente para ativar uma Estação com código de ativação."],
  ["webhooks:read", "Consultar webhook", "Permite consultar a configuração do destino de eventos da Conta."],
  ["webhooks:manage", "Gerenciar webhook", "Permite configurar ou atualizar o destino HTTPS e a política de entrega de eventos."],
  ["webhooks:replay", "Reprocessar eventos", "Permite solicitar novo processamento de eventos que falharam na entrega."]
] as const;

export default function PortalShell() {
  const [session, setSession] = useState<Session | null>(null);
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    try { const saved = window.sessionStorage.getItem("balanca-portal-session"); if (saved) { const parsed = JSON.parse(saved) as Session; if (parsed.expiresAt > Date.now()) setSession(parsed); else window.sessionStorage.removeItem("balanca-portal-session"); } }
    catch { window.sessionStorage.removeItem("balanca-portal-session"); } finally { setMounted(true); }
  }, []);
  function onAuthenticated(next: Session) { window.sessionStorage.setItem("balanca-portal-session", JSON.stringify(next)); setSession(next); }
  function signOut() { window.sessionStorage.removeItem("balanca-portal-session"); setSession(null); }
  if (!mounted) return <PortalLoading />;
  return session ? <Dashboard session={session} onSignOut={signOut} /> : <AuthScreen onAuthenticated={onAuthenticated} />;
}

function Brand() { return <div className="flex items-center gap-4"><img src="/logo.png" alt="Tara" className="size-12 shrink-0 dark:hidden" /><img src="/logo-dark.png" alt="Tara" className="size-12 shrink-0 hidden dark:block" /><div><h1 className="text-2xl font-bold tracking-tight text-white">Tara</h1><p className="text-white/90">Portal do cliente</p></div></div>; }
function PortalLoading() { return <div className="flex min-h-screen bg-muted/30"><div className="relative flex-1 flex flex-col justify-center items-center p-12 overflow-hidden"><div className="absolute inset-0 bg-cover bg-center z-0" style={{ backgroundImage: "url('/login-bg.jpg')" }} /><div className="absolute inset-0 bg-primary/80 mix-blend-multiply z-0" /><div className="absolute inset-0 bg-gradient-to-t from-primary/95 via-primary/60 to-transparent z-0" /><div className="relative z-10 max-w-md space-y-6 text-white"><Brand /><div><h2 className="text-4xl font-bold tracking-tight text-white">Preparando seu portal...</h2><p className="mt-4 text-lg text-white/80">Ambiente seguro.</p></div></div></div><div className="flex-1 flex items-center justify-center p-12 bg-background relative z-10 shadow-2xl"><Card className="w-full max-w-sm shadow-xl border-none"><CardContent className="grid gap-3 p-6"><Skeleton className="h-4 w-full" /><Skeleton className="h-4 w-3/5" /><Skeleton className="h-8 w-full" /></CardContent></Card></div></div>; }

function AuthScreen({ onAuthenticated }: { onAuthenticated: (session: Session) => void }) {
  const [mode, setMode] = useState<"login" | "register">("login"); const [accountName, setAccountName] = useState(""); const [name, setName] = useState(""); const [email, setEmail] = useState(""); const [password, setPassword] = useState(""); const [error, setError] = useState<string | null>(null); const [busy, setBusy] = useState(false);
  async function submit(event: React.FormEvent<HTMLFormElement>) { event.preventDefault(); setBusy(true); setError(null); try { const next = mode === "login" ? await authenticate(email.trim(), password) : await registerAccount(accountName.trim(), name.trim(), email.trim(), password); onAuthenticated(next); } catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível continuar."); } finally { setBusy(false); } }
  return <div className="flex min-h-screen bg-muted/30"><div className="relative flex-1 flex flex-col justify-center items-center p-12 overflow-hidden"><div className="absolute inset-0 bg-cover bg-center z-0" style={{ backgroundImage: "url('/login-bg.jpg')" }} /><div className="absolute inset-0 bg-primary/80 mix-blend-multiply z-0" /><div className="absolute inset-0 bg-gradient-to-t from-primary/95 via-primary/60 to-transparent z-0" /><div className="relative z-10 max-w-md space-y-6 text-white"><Brand /><div><h2 className="text-4xl font-bold tracking-tight text-white">Integração sem atrito.</h2><p className="mt-4 text-lg text-white/80">Crie credenciais, conecte seu sistema e acompanhe a integração com clareza e segurança.</p></div></div></div><div className="flex-1 flex items-center justify-center p-12 bg-background relative z-10 shadow-2xl"><Card className="w-full max-w-md shadow-xl border-none"><form onSubmit={submit}><CardHeader><p className="mb-1 text-xs font-medium uppercase tracking-wider text-primary">{mode === "login" ? "Acesso do cliente" : "Comece agora"}</p><CardTitle className="text-2xl">{mode === "login" ? "Entrar no portal" : "Criar sua conta"}</CardTitle><CardDescription>{mode === "login" ? "Acesse as configurações da sua integração." : "Você será o administrador inicial da sua conta."}</CardDescription></CardHeader><CardContent className="space-y-4">{error && <div className="rounded-sm border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive">{error}</div>}{mode === "register" && <><Field label="Nome da conta"><Input required value={accountName} onChange={(event) => setAccountName(event.target.value)} placeholder="Minha empresa" /></Field><Field label="Seu nome"><Input required value={name} onChange={(event) => setName(event.target.value)} placeholder="Nome completo" /></Field></>}<Field label="E-mail"><Input required type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="voce@empresa.com" /></Field>
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <Label>Senha</Label>
        {mode === "login" && (
          <a href="/forgot-password" className="text-sm font-normal text-primary hover:underline">
            Esqueceu a senha?
          </a>
        )}
      </div>
      <Input required minLength={8} type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Mínimo de 8 caracteres" />
    </div>
    <Button type="submit" variant="default" className="h-9 w-full" disabled={busy}>{busy ? "Aguarde…" : mode === "login" ? "Entrar" : "Criar conta"}</Button><Button type="button" variant="link" className="mx-auto flex" onClick={() => { setMode(mode === "login" ? "register" : "login"); setError(null); }}>{mode === "login" ? "Ainda não tenho uma conta" : "Já tenho uma conta"}</Button></CardContent></form></Card></div></div>;
}
function Field({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) { return <div className={`space-y-1.5 ${className || ""}`}><Label>{label}</Label>{children}</div>; }

function WebhookPanel({ session }: { session: Session }) {
  const [destination, setDestination] = useState<WebhookDestination | null>(null);
  const [url, setUrl] = useState(""); const [secret, setSecret] = useState(""); const [maxAttempts, setMaxAttempts] = useState(8); const [retryBase, setRetryBase] = useState(2); const [enabled, setEnabled] = useState(false); const [loading, setLoading] = useState(true); const [busy, setBusy] = useState(false); const [testBusy, setTestBusy] = useState(false); const [error, setError] = useState<string | null>(null);
  async function load() { setLoading(true); try { const value = await getWebhookDestination(session); setDestination(value); setEnabled(value.status === "ATIVO"); setUrl(value.target_url); setMaxAttempts(value.max_attempts); setRetryBase(value.retry_base_seconds); } catch (cause) { if (cause instanceof Error && cause.message.includes("404")) { setDestination(null); setEnabled(false); } else setError(cause instanceof Error ? cause.message : "Falha ao carregar webhook."); } finally { setLoading(false); } }
  useEffect(() => { void load(); }, [session]);
  async function save(event: React.FormEvent<HTMLFormElement>) { event.preventDefault(); setBusy(true); setError(null); try { const value = await saveWebhookDestination(session, { target_url: url.trim(), hmac_secret: secret.trim() || null, event_types: ["balanca.pesagem.concluida.v1"], max_attempts: maxAttempts, retry_base_seconds: retryBase }); setDestination(value); setEnabled(true); setSecret(""); toast.success("Webhook salvo com segurança."); } catch (cause) { setError(cause instanceof Error ? cause.message : "Falha ao salvar webhook."); } finally { setBusy(false); } }
  async function test() { setTestBusy(true); setError(null); try { const result = await testWebhookDestination(session); toast.success(`${result.message} (${result.status_code ?? "sem status"}).`); } catch (cause) { setError(cause instanceof Error ? cause.message : "Falha ao testar webhook."); } finally { setTestBusy(false); } }
  async function toggleStatus() { if (!destination) { toast.info("Configure o Webhook para habilitar o recebimento em tempo real."); return; } const next = !enabled; setBusy(true); setError(null); try { const value = await setWebhookStatus(session, next); setDestination(value); setEnabled(value.status === "ATIVO"); toast.success(next ? "Webhook ativo. A API continua disponível para recuperação." : "Webhook pausado. A API continua disponível para consulta."); } catch (cause) { setError(cause instanceof Error ? cause.message : "Falha ao alterar o modo de recebimento."); } finally { setBusy(false); } }
  return <div className="space-y-6"><PageHeader eyebrow="Portal / Integrações" title="Webhook de pesagens" description="Receba eventos assinados por HMAC no endpoint da sua aplicação." />
    <Card><CardHeader><CardTitle>Modo de recebimento</CardTitle><CardDescription>Escolha como o sistema consumidor será avisado. A API permanece disponível nos dois modos.</CardDescription></CardHeader><CardContent>{loading ? <Skeleton className="h-32 w-full" /> : <form className="space-y-4" onSubmit={save}>{error && <div className="rounded-sm border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive">{error}</div>}<div className="flex items-center justify-between rounded-sm border bg-muted/30 p-3"><div><p className="text-sm font-medium">{enabled ? "API + Webhook" : "Somente API"}</p><p className="text-xs text-muted-foreground">{enabled ? "Receba notificações em tempo real e consulte a API para confirmar." : "Consulte os dados periodicamente pela API."}</p></div><button type="button" role="switch" aria-checked={enabled} aria-label="Alternar recebimento por Webhook" disabled={!destination || busy} onClick={() => void toggleStatus()} className={`relative h-6 w-11 rounded-full transition-colors ${enabled ? "bg-primary" : "bg-muted-foreground/30"}`}><span className={`absolute top-1 size-4 rounded-full bg-white shadow transition-transform ${enabled ? "translate-x-6" : "translate-x-1"}`} /></button></div><Field label="URL HTTPS do consumidor"><Input required type="url" value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://api.exemplo.com/webhooks/tara" /></Field><Field label={destination ? "Novo segredo HMAC (opcional)" : "Segredo HMAC (mínimo de 32 caracteres)"}><Input required={!destination} minLength={destination ? 0 : 32} type="password" value={secret} onChange={(event) => setSecret(event.target.value)} placeholder={destination ? "Deixe vazio para manter o atual" : "segredo compartilhado"} /></Field><div className="grid gap-4 sm:grid-cols-2"><Field label="Máximo de tentativas"><Input required type="number" min={1} max={50} value={maxAttempts} onChange={(event) => setMaxAttempts(Number(event.target.value))} /></Field><Field label="Base do retry (segundos)"><Input required type="number" min={1} max={3600} value={retryBase} onChange={(event) => setRetryBase(Number(event.target.value))} /></Field></div><div className="rounded-md bg-muted p-3 text-sm text-muted-foreground">Evento habilitado: <code>balanca.pesagem.concluida.v1</code>. A assinatura usa HMAC-SHA256 e os headers documentados no guia técnico.</div><div className="flex justify-end gap-2"><Button type="button" variant="outline" disabled={!destination || testBusy || !enabled} onClick={() => void test()}>{testBusy ? "Testando…" : "Enviar teste"}</Button><Button type="submit" disabled={busy || !url.trim()}>{busy ? "Salvando…" : destination ? "Atualizar webhook" : "Configurar webhook"}</Button></div></form>}</CardContent></Card>
  </div>;
}

function PortalProcessesPanel({ session }: { session: Session }) {
  const [orders, setOrders] = useState<PortalOrder[]>([]);
  const [weighings, setWeighings] = useState<PortalWeighing[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState("TODOS");

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const [nextOrders, nextWeighings] = await Promise.all([listPortalOrders(session), listPortalWeighings(session)]);
      setOrders(nextOrders);
      setWeighings(nextWeighings);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Falha ao carregar processos.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, [session]);

  const visibleOrders = orders.filter((order) => status === "TODOS" || order.status === status);
  const orderColumns: DataTableColumn<PortalOrder>[] = [
    { id: "reference", header: "Referência", cell: (order) => <><strong className="block font-medium">{order.referencia_externa}</strong><span className="text-xs text-muted-foreground">{order.sistema_cliente}</span></>, sortValue: (order) => order.referencia_externa },
    { id: "type", header: "Tipo", cell: (order) => order.tipo_pesagem, sortValue: (order) => order.tipo_pesagem },
    { id: "status", header: "Status", cell: (order) => <Badge variant={order.status === "CONCLUIDA" ? "success" : order.status === "EM_PESAGEM" ? "warning" : "secondary"}>{friendlyProcessStatus(order.status)}</Badge>, sortValue: (order) => order.status },
    { id: "created", header: "Criada em", cell: (order) => formatDate(order.created_at), sortValue: (order) => order.created_at },
  ];
  const weighingColumns: DataTableColumn<PortalWeighing>[] = [
    { id: "captured", header: "Capturada em", cell: (item) => formatDate(item.captured_at), sortValue: (item) => item.captured_at },
    { id: "local", header: "ID local", cell: (item) => <code className="text-xs text-muted-foreground">{item.local_id}</code>, sortValue: (item) => item.local_id },
    { id: "weight", header: "Peso", cell: (item) => `${item.peso_aferido_kg} kg`, sortValue: (item) => item.peso_aferido_kg },
    { id: "reconciliation", header: "Reconciliação", cell: (item) => <Badge variant={item.reconciliation_status === "VINCULADA" ? "success" : "secondary"}>{friendlyProcessStatus(item.reconciliation_status)}</Badge>, sortValue: (item) => item.reconciliation_status },
  ];

  if (loading) return <div className="space-y-6"><PageHeader eyebrow="Portal / Operação" title="Processos" description="Filtre e acompanhe as ordens e pesagens da sua Conta." /><div className="grid gap-4 sm:grid-cols-3"><Skeleton className="h-24" /><Skeleton className="h-24" /><Skeleton className="h-24" /></div><Card><CardContent className="space-y-3 p-5"><Skeleton className="h-9 w-full" /><Skeleton className="h-9 w-full" /><Skeleton className="h-9 w-full" /></CardContent></Card></div>;

  return <div className="space-y-6">
    <PageHeader eyebrow="Portal / Operação" title="Processos" description="Filtre e acompanhe as ordens e pesagens da sua Conta." actions={<Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}><RefreshCw className={loading ? "animate-spin" : ""} size={14} /> Atualizar</Button>} />
    {error && <div className="rounded-sm border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive">{error}</div>}
    <div className="grid gap-4 sm:grid-cols-3"><Metric label="Ordens" value={orders.length} icon={<ClipboardList size={16} />} /><Metric label="Em aberto" value={orders.filter((order) => order.status !== "CONCLUIDA").length} icon={<Activity size={16} />} /><Metric label="Pesagens" value={weighings.length} icon={<Gauge size={16} />} /></div>
    <Card><CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-sm font-medium">Filtrar ordens por status</p><p className="text-xs text-muted-foreground">A busca textual está disponível na tabela abaixo.</p></div><select aria-label="Filtrar ordens por status" value={status} onChange={(event) => setStatus(event.target.value)} className="h-9 rounded-sm border border-input bg-background px-3 text-sm sm:w-52"><option value="TODOS">Todos os status</option><option value="PENDENTE">Pendente</option><option value="EM_PESAGEM">Em pesagem</option><option value="CONCLUIDA">Concluída</option></select></CardContent></Card>
    <section className="space-y-3"><div><h2 className="text-base font-medium">Ordens de pesagem</h2><p className="text-sm text-muted-foreground">{visibleOrders.length} ordem(ns) encontradas para o filtro atual.</p></div><DataTable data={visibleOrders} columns={orderColumns} searchPlaceholder="Buscar referência, sistema ou tipo..." searchValue={(order) => `${order.referencia_externa} ${order.sistema_cliente} ${order.tipo_pesagem}`} emptyMessage="Nenhuma ordem encontrada para os filtros atuais." /></section>
    <section className="space-y-3"><div><h2 className="text-base font-medium">Pesagens recentes</h2><p className="text-sm text-muted-foreground">{weighings.length} pesagem(ns) registradas na Conta.</p></div><DataTable data={weighings} columns={weighingColumns} searchPlaceholder="Buscar ID local ou status..." searchValue={(item) => `${item.local_id} ${item.reconciliation_status}`} emptyMessage="Nenhuma pesagem encontrada." /></section>
  </div>;
}

function friendlyProcessStatus(value: string) { return { PENDENTE: "Pendente", EM_PESAGEM: "Em pesagem", CONCLUIDA: "Concluída", VINCULADA: "Vinculada", PENDENTE_RECONCILIACAO: "Aguardando reconciliação" }[value] ?? value; }

function PortalActivity({ session }: { session: Session }) {
  const [orders, setOrders] = useState<PortalOrder[]>([]); const [weighings, setWeighings] = useState<PortalWeighing[]>([]); const [loading, setLoading] = useState(true); const [error, setError] = useState<string | null>(null); const [query, setQuery] = useState(""); const [status, setStatus] = useState("TODOS");
  async function load() { setLoading(true); try { const [nextOrders, nextWeighings] = await Promise.all([listPortalOrders(session), listPortalWeighings(session)]); setOrders(nextOrders); setWeighings(nextWeighings); } catch (cause) { setError(cause instanceof Error ? cause.message : "Falha ao carregar atividade."); } finally { setLoading(false); } }
  useEffect(() => { void load(); }, [session]);
  if (loading) return <div className="space-y-3"><Skeleton className="h-24 w-full" /><Skeleton className="h-40 w-full" /></div>;
  const visibleOrders = orders.filter((order) => (status === "TODOS" || order.status === status) && `${order.referencia_externa} ${order.sistema_cliente} ${order.tipo_pesagem}`.toLowerCase().includes(query.toLowerCase()));
  return <div className="space-y-6">{error && <div className="rounded-sm border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive">{error}</div>}<div className="flex flex-col gap-3 sm:flex-row"><Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar referência, sistema ou tipo..." /><select value={status} onChange={(event) => setStatus(event.target.value)} className="h-9 rounded border bg-background px-3 text-sm sm:w-48"><option value="TODOS">Todos os status</option><option value="PENDENTE">Pendente</option><option value="EM_PESAGEM">Em pesagem</option><option value="CONCLUIDA">Concluída</option></select><Button variant="outline" size="sm" onClick={() => void load()}><RefreshCw size={14} /> Atualizar</Button></div><Card><CardHeader><CardTitle>Ordens de pesagem</CardTitle><CardDescription>{visibleOrders.length} ordem(ns) encontradas para o filtro atual.</CardDescription></CardHeader><CardContent className="p-0"><Table><TableHeader><TableRow><TableHead>Referência</TableHead><TableHead>Tipo</TableHead><TableHead>Status</TableHead><TableHead>Criada em</TableHead></TableRow></TableHeader><TableBody>{visibleOrders.slice(0, 100).map((order) => <TableRow key={order.id}><TableCell><strong>{order.referencia_externa}</strong><span className="block text-xs text-muted-foreground">{order.sistema_cliente}</span></TableCell><TableCell>{order.tipo_pesagem}</TableCell><TableCell><Badge variant={order.status === "CONCLUIDA" ? "success" : "secondary"}>{order.status}</Badge></TableCell><TableCell>{formatDate(order.created_at)}</TableCell></TableRow>)}{!visibleOrders.length && <TableRow><TableCell colSpan={4} className="py-8 text-center text-muted-foreground">Nenhuma ordem encontrada.</TableCell></TableRow>}</TableBody></Table></CardContent></Card><Card><CardHeader><CardTitle>Pesagens recentes</CardTitle><CardDescription>{weighings.length} pesagem(ns) registradas na Conta.</CardDescription></CardHeader><CardContent className="p-0"><Table><TableHeader><TableRow><TableHead>Capturada em</TableHead><TableHead>ID local</TableHead><TableHead>Peso</TableHead><TableHead>Reconciliação</TableHead></TableRow></TableHeader><TableBody>{weighings.slice(0, 100).map((item) => <TableRow key={item.id}><TableCell>{formatDate(item.captured_at)}</TableCell><TableCell><code className="text-xs">{item.local_id}</code></TableCell><TableCell>{item.peso_aferido_kg} kg</TableCell><TableCell><Badge variant={item.reconciliation_status === "VINCULADA" ? "success" : "secondary"}>{item.reconciliation_status}</Badge></TableCell></TableRow>)}</TableBody></Table></CardContent></Card></div>;
}

function PortalUsersPanel({ session }: { session: Session }) {
  const [users, setUsers] = useState<PortalUser[]>([]); const [loading, setLoading] = useState(true); const [error, setError] = useState<string | null>(null);
  async function load() { setLoading(true); try { setUsers(await listPortalUsers(session)); } catch (cause) { setError(cause instanceof Error ? cause.message : "Falha ao carregar usuários."); } finally { setLoading(false); } }
  useEffect(() => { void load(); }, [session]);
  async function update(user: PortalUser, value: string) { try { const next = await updatePortalUser(session, user.id, { role: user.role, status: value }); setUsers((current) => current.map((item) => item.id === next.id ? next : item)); toast.success("Usuário atualizado."); } catch (cause) { toast.error(cause instanceof Error ? cause.message : "Falha ao atualizar usuário."); } }
  return <Card><CardHeader><CardTitle>Usuários da Conta</CardTitle><CardDescription>Gerencie o perfil e o acesso das pessoas vinculadas ao Portal.</CardDescription></CardHeader><CardContent className="p-0">{loading ? <div className="p-5"><Skeleton className="h-32 w-full" /></div> : error ? <div className="p-5 text-sm text-destructive">{error}</div> : <Table><TableHeader><TableRow><TableHead>Usuário</TableHead><TableHead>Perfil</TableHead><TableHead>Status</TableHead><TableHead>Cadastro</TableHead></TableRow></TableHeader><TableBody>{users.map((user) => <TableRow key={user.id}><TableCell><strong>{user.nome_exibicao}</strong><span className="block text-xs text-muted-foreground">{user.email}</span></TableCell><TableCell><Badge variant="secondary">{user.role}</Badge></TableCell><TableCell><select value={user.status} onChange={(event) => void update(user, event.target.value)} className="h-8 rounded border bg-background px-2 text-sm"><option value="ATIVO">Ativo</option><option value="INATIVO">Inativo</option></select></TableCell><TableCell>{formatDate(user.created_at)}</TableCell></TableRow>)}{!users.length && <TableRow><TableCell colSpan={4} className="py-8 text-center text-muted-foreground">Nenhum usuário encontrado.</TableCell></TableRow>}</TableBody></Table>}</CardContent></Card>;
}

function PortalStationsPanel({ session }: { session: Session }) {
  const [stations, setStations] = useState<PortalStation[]>([]);
  const [externalId, setExternalId] = useState("");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true); setError(null);
    try { setStations(await listPortalStations(session)); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Falha ao carregar estações."); }
    finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, [session]);
  async function create(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(null);
    try {
      const station = await createPortalStation(session, { external_id: externalId.trim(), nome: name.trim() });
      setStations((current) => [...current, station].sort((left, right) => left.nome.localeCompare(right.nome)));
      setExternalId(""); setName(""); toast.success("Estação criada. Guarde o código de ativação antes de configurá-la.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Falha ao criar estação."); }
    finally { setBusy(false); }
  }
  async function changeStatus(station: PortalStation, status: "ATIVA" | "SUSPENSA" | "REVOGADA") {
    if (status === "REVOGADA" && !window.confirm(`Revogar definitivamente a estação “${station.nome}”? Os tokens dela deixarão de funcionar.`)) return;
    setBusy(true); setError(null);
    try {
      const updated = await updatePortalStationStatus(session, station.id, status);
      setStations((current) => current.map((item) => item.id === updated.id ? updated : item));
      toast.success(`Estação ${status === "ATIVA" ? "reativada" : status === "SUSPENSA" ? "suspensa" : "revogada"}.`);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Falha ao alterar o status da estação."); }
    finally { setBusy(false); }
  }
  return <div className="space-y-6">
    <PageHeader eyebrow="Portal / Operação" title="Estações" description="Cadastre as Estações que registram Pesagens para esta Conta." actions={<Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}><RefreshCw className={loading ? "animate-spin" : ""} size={14} /> Atualizar</Button>} />
    {error && <div className="rounded-sm border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive">{error}</div>}
    <Card><CardHeader><CardTitle>Nova Estação</CardTitle><CardDescription>O código gerado é usado uma única vez na tela de ativação da PWA da Estação.</CardDescription></CardHeader><CardContent><form className="grid gap-4 sm:grid-cols-3" onSubmit={create}><Field label="Identificador externo"><Input required value={externalId} onChange={(event) => setExternalId(event.target.value)} placeholder="balanca-01" /></Field><Field label="Nome da Estação"><Input required value={name} onChange={(event) => setName(event.target.value)} placeholder="Balança principal" /></Field><div className="flex items-end"><Button className="w-full" type="submit" disabled={busy}>{busy ? "Criando…" : "Criar Estação"}</Button></div></form></CardContent></Card>
    <Card><CardHeader><CardTitle>Estações cadastradas</CardTitle><CardDescription>Uma Estação pendente exibe seu código de ativação até ser ativada. Suspender bloqueia temporariamente a operação; revogar é definitivo.</CardDescription></CardHeader><CardContent className="p-0">{loading ? <div className="p-5"><Skeleton className="h-32 w-full" /></div> : <Table><TableHeader><TableRow><TableHead>Estação</TableHead><TableHead>Identificador</TableHead><TableHead>Status</TableHead><TableHead>Código de ativação</TableHead><TableHead>Ações</TableHead></TableRow></TableHeader><TableBody>{stations.map((station) => <TableRow key={station.id}><TableCell className="font-medium">{station.nome}</TableCell><TableCell><code className="text-xs">{station.external_id}</code></TableCell><TableCell><Badge variant={station.status === "ATIVA" ? "success" : station.status === "REVOGADA" ? "destructive" : "secondary"}>{station.status}</Badge></TableCell><TableCell>{station.activation_code ? <code className="rounded bg-muted px-2 py-1 text-sm font-semibold tracking-wider">{station.activation_code}</code> : <span className="text-sm text-muted-foreground">—</span>}</TableCell><TableCell><div className="flex flex-wrap gap-2">{station.status === "ATIVA" && <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => void changeStatus(station, "SUSPENSA")}>Suspender</Button>}{station.status === "SUSPENSA" && <Button type="button" size="sm" disabled={busy} onClick={() => void changeStatus(station, "ATIVA")}>Reativar</Button>}{station.status !== "REVOGADA" && <Button type="button" variant="destructive" size="sm" disabled={busy} onClick={() => void changeStatus(station, "REVOGADA")}>Revogar</Button>} {station.status === "REVOGADA" && <span className="text-xs text-muted-foreground">Sem ações</span>}</div></TableCell></TableRow>)}{!stations.length && <TableRow><TableCell colSpan={5} className="py-8 text-center text-muted-foreground">Nenhuma Estação cadastrada.</TableCell></TableRow>}</TableBody></Table>}</CardContent></Card>
  </div>;
}

function PortalOperatorsPanel({ session }: { session: Session }) {
  const [operators, setOperators] = useState<PortalOperator[]>([]);
  const [stations, setStations] = useState<PortalStation[]>([]);
  const [links, setLinks] = useState<Record<string, string[]>>({});
  const [code, setCode] = useState(""); const [externalId, setExternalId] = useState(""); const [name, setName] = useState(""); const [pin, setPin] = useState(""); const [stationIds, setStationIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true); const [busy, setBusy] = useState(false); const [error, setError] = useState<string | null>(null);
  const [operatorToReset, setOperatorToReset] = useState<PortalOperator | null>(null);
  const [resetPinValue, setResetPinValue] = useState("");
  async function load() {
    setLoading(true); setError(null);
    try {
      const [nextOperators, nextStations] = await Promise.all([listPortalOperators(session), listPortalStations(session)]);
      setOperators(nextOperators); setStations(nextStations);
      const values = await Promise.all(nextOperators.map(async (operator) => [operator.id, await listPortalOperatorStations(session, operator.id)] as const));
      setLinks(Object.fromEntries(values));
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Falha ao carregar operadores."); }
    finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, [session]);
  async function create(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(null);
    try {
      const operator = await createPortalOperator(session, { codigo: code.trim(), identificador_externo: externalId.trim(), nome_exibicao: name.trim(), pessoa_ref: null, senha_inicial: pin });
      await Promise.all(stationIds.map((stationId) => linkPortalOperator(session, stationId, operator.id)));
      setCode(""); setExternalId(""); setName(""); setPin(""); setStationIds([]);
      toast.success("Operador cadastrado e pronto para ser usado na Estação."); await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Falha ao cadastrar operador."); }
    finally { setBusy(false); }
  }
  async function link(operatorId: string, targetStationId: string) {
    if (!targetStationId) return;
    try { await linkPortalOperator(session, targetStationId, operatorId); setLinks((current) => ({ ...current, [operatorId]: Array.from(new Set([...(current[operatorId] || []), targetStationId])) })); toast.success("Operador vinculado à Estação."); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Falha ao vincular operador."); }
  }
  async function unlink(operatorId: string, targetStationId: string) {
    try { await unlinkPortalOperator(session, targetStationId, operatorId); setLinks((current) => ({ ...current, [operatorId]: (current[operatorId] || []).filter((id) => id !== targetStationId) })); toast.success("Vínculo removido."); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Falha ao remover vínculo."); }
  }
  async function changeStatus(operator: PortalOperator, status: "ATIVO" | "INATIVO") {
    setBusy(true); setError(null);
    try {
      const updated = await updatePortalOperatorStatus(session, operator.id, status);
      setOperators((current) => current.map((item) => item.id === updated.id ? updated : item));
      toast.success(`Operador ${status === "ATIVO" ? "reativado" : "inativado"}.`);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Falha ao alterar o status do operador."); }
    finally { setBusy(false); }
  }
  async function submitResetPin(e: React.FormEvent) {
    e.preventDefault();
    if (!operatorToReset) return;
    if (resetPinValue.length < 4) {
      toast.error("O PIN deve ter pelo menos 4 dígitos.");
      return;
    }
    setBusy(true); setError(null);
    try {
      await resetPortalOperatorPin(session, operatorToReset.id, resetPinValue);
      toast.success(`PIN redefinido com sucesso para ${operatorToReset.nome_exibicao}.`);
      setOperatorToReset(null);
      setResetPinValue("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Falha ao redefinir o PIN.");
    } finally {
      setBusy(false);
    }
  }
  const stationName = (id: string) => stations.find((station) => station.id === id)?.nome || id;
  return <div className="space-y-6">
    <PageHeader eyebrow="Portal / Operação" title="Operadores" description="Cadastre as pessoas que realizam Pesagens e autorize cada uma nas Estações adequadas." actions={<Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}><RefreshCw className={loading ? "animate-spin" : ""} size={14} /> Atualizar</Button>} />
    {error && <div className="rounded-sm border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive">{error}</div>}
    <Card><CardHeader><CardTitle>Novo Operador</CardTitle><CardDescription>O PIN é pessoal e será solicitado na Estação antes de registrar uma Pesagem. O identificador externo é normalizado em maiúsculas e deve ser único na Conta.</CardDescription></CardHeader><CardContent><form className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4" onSubmit={create}><Field label="Código"><Input required value={code} onChange={(event) => setCode(event.target.value)} placeholder="OP-001" /></Field><Field label="Identificador externo"><Input required value={externalId} onChange={(event) => setExternalId(event.target.value)} placeholder="MATRICULA-001" /></Field><Field label="Nome"><Input required value={name} onChange={(event) => setName(event.target.value)} placeholder="Nome do operador" /></Field><Field label="PIN inicial"><Input required minLength={4} type="password" inputMode="numeric" value={pin} onChange={(event) => setPin(event.target.value)} placeholder="••••" /></Field><Field label="Estações autorizadas" className="sm:col-span-2 lg:col-span-4"><div className="max-h-28 space-y-1 overflow-auto rounded-sm border p-2">{stations.length ? stations.map((station) => <label key={station.id} className="flex cursor-pointer items-center gap-2 text-sm"><input type="checkbox" checked={stationIds.includes(station.id)} onChange={(event) => setStationIds((current) => event.target.checked ? [...current, station.id] : current.filter((id) => id !== station.id))} />{station.nome}</label>) : <span className="text-sm text-muted-foreground">Cadastre uma Estação primeiro ou faça o vínculo depois.</span>}</div></Field><div className="sm:col-span-2 lg:col-span-4"><Button type="submit" disabled={busy}>{busy ? "Cadastrando…" : "Cadastrar Operador"}</Button></div></form></CardContent></Card>
    <Card><CardHeader><CardTitle>Operadores cadastrados</CardTitle><CardDescription>Inativar bloqueia o login imediatamente, preservando os vínculos e o histórico para uma futura reativação.</CardDescription></CardHeader><CardContent className="p-0">{loading ? <div className="p-5"><Skeleton className="h-32 w-full" /></div> : <Table><TableHeader><TableRow><TableHead>Operador</TableHead><TableHead>Identificadores</TableHead><TableHead>Estações autorizadas</TableHead><TableHead>Vincular Estação</TableHead><TableHead>Ações</TableHead></TableRow></TableHeader><TableBody>{operators.map((operator) => <TableRow key={operator.id}><TableCell><strong className="block">{operator.nome_exibicao}</strong><Badge variant={operator.status === "ATIVO" ? "success" : operator.status === "REVOGADO" ? "destructive" : "secondary"}>{operator.status}</Badge></TableCell><TableCell><code className="block text-xs">{operator.codigo}</code><span className="text-xs text-muted-foreground">{operator.identificador_externo || "—"}</span></TableCell><TableCell><div className="flex flex-wrap gap-1">{(links[operator.id] || []).map((id) => <span className="inline-flex items-center gap-1 rounded bg-muted px-2 py-1 text-xs" key={id}>{stationName(id)}<button type="button" className="font-bold text-muted-foreground hover:text-destructive" title="Remover vínculo" onClick={() => void unlink(operator.id, id)}>×</button></span>)}{!(links[operator.id] || []).length && <span className="text-xs text-muted-foreground">Sem Estação</span>}</div></TableCell><TableCell><select aria-label={`Vincular ${operator.nome_exibicao} a uma Estação`} defaultValue="" disabled={operator.status !== "ATIVO"} onChange={(event) => { void link(operator.id, event.target.value); event.currentTarget.value = ""; }} className="h-8 max-w-48 rounded border bg-background px-2 text-sm"><option value="">Selecionar Estação</option>{stations.filter((station) => !(links[operator.id] || []).includes(station.id)).map((station) => <option key={station.id} value={station.id}>{station.nome}</option>)}</select></TableCell><TableCell><div className="flex gap-2">{operator.status === "ATIVO" && <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => setOperatorToReset(operator)}>Reset PIN</Button>}{operator.status === "ATIVO" && <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => void changeStatus(operator, "INATIVO")}>Inativar</Button>}{operator.status === "INATIVO" && <Button type="button" size="sm" disabled={busy} onClick={() => void changeStatus(operator, "ATIVO")}>Reativar</Button>}{operator.status === "REVOGADO" && <span className="text-xs text-muted-foreground">Revogado</span>}</div></TableCell></TableRow>)}{!operators.length && <TableRow><TableCell colSpan={5} className="py-8 text-center text-muted-foreground">Nenhum Operador cadastrado.</TableCell></TableRow>}</TableBody></Table>}</CardContent></Card>
    {operatorToReset && (
      <Dialog title={`Reset PIN - ${operatorToReset.nome_exibicao}`} onClose={() => { setOperatorToReset(null); setResetPinValue(""); }}>
        <form onSubmit={submitResetPin} className="mt-4 space-y-4">
          <div className="space-y-1">
            <Label htmlFor="new-pin">Novo PIN numérico</Label>
            <Input id="new-pin" type="password" inputMode="numeric" minLength={4} required value={resetPinValue} onChange={(e) => setResetPinValue(e.target.value)} placeholder="••••" />
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" disabled={busy} onClick={() => { setOperatorToReset(null); setResetPinValue(""); }}>Cancelar</Button>
            <Button type="submit" disabled={busy}>{busy ? "Salvando..." : "Salvar PIN"}</Button>
          </div>
        </form>
      </Dialog>
    )}
  </div>;
}

function Dashboard({ session, onSignOut }: { session: Session; onSignOut: () => void }) {
  const [view, setView] = useState<"overview" | "api-keys" | "webhook" | "atividade" | "estacoes" | "operadores" | "usuarios">("overview"); const [clients, setClients] = useState<ApiClient[]>([]); const [dashboard, setDashboard] = useState<AccountDashboard | null>(null); const [policy, setPolicy] = useState<PlatformSecuritySettings>({ session_minutes: 30, idle_minutes: 120, refresh_enabled: true, warning_minutes: 5 }); const [credential, setCredential] = useState<NewCredential | null>(null); const [configurationClient, setConfigurationClient] = useState<ApiClient | null>(null); const [error, setError] = useState<string | null>(null); const [loading, setLoading] = useState(true); const [showForm, setShowForm] = useState(false); const [dark, setDark] = useState(false);
  async function load() { setLoading(true); setError(null); try { const [nextClients, nextDashboard] = await Promise.all([listApiClients(session), getPortalDashboard(session)]); setClients(nextClients); setDashboard(nextDashboard); } catch (cause) { setError(cause instanceof Error ? cause.message : "Falha ao carregar o resumo da Conta."); } finally { setLoading(false); } }
  useEffect(() => { void load(); }, []);
  useEffect(() => { void getPortalSessionPolicy(session).then(setPolicy).catch(() => undefined); }, [session]);
  useEffect(() => {
    let refreshing = false;
    let lastActivity = Date.now();
    const renew = async () => {
      if (refreshing || !policy.refresh_enabled || session.expiresAt - Date.now() > policy.warning_minutes * 60 * 1000) return;
      refreshing = true;
      try {
        const next = await refreshSession(session);
        Object.assign(session, next);
        window.sessionStorage.setItem("balanca-portal-session", JSON.stringify(session));
      } catch { onSignOut(); }
      finally { refreshing = false; }
    };
    const timer = window.setInterval(() => { if (Date.now() - lastActivity > policy.idle_minutes * 60 * 1000) { onSignOut(); return; } void renew(); }, 60 * 1000);
    const onActivity = () => { lastActivity = Date.now(); void renew(); };
    window.addEventListener("click", onActivity); window.addEventListener("keydown", onActivity);
    return () => { window.clearInterval(timer); window.removeEventListener("click", onActivity); window.removeEventListener("keydown", onActivity); };
  }, [session, onSignOut, policy]);
  return (
    <SidebarProvider>
      <div className={`flex min-h-screen w-full bg-background text-foreground ${dark ? "dark" : ""}`}>
        <Sidebar collapsible="icon">
          <SidebarHeader>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton size="lg" className="hover:bg-transparent cursor-default">
                  <div className="flex aspect-square size-8 items-center justify-center">
                    <img src="/logo.png" alt="Tara" className="size-full shrink-0 dark:hidden" />
                    <img src="/logo-dark.png" alt="Tara" className="size-full shrink-0 hidden dark:block" />
                  </div>
                  <div className="grid flex-1 text-left text-sm leading-tight">
                    <span className="truncate font-bold">Tara</span>
                    <span className="truncate text-xs text-muted-foreground">Portal do cliente</span>
                  </div>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarHeader>
          <SidebarContent>
            <SidebarGroup>
              <SidebarGroupLabel>Sua conta</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  <SidebarMenuItem>
                    <SidebarMenuButton isActive={view === "overview"} tooltip="Visão geral" onClick={() => setView("overview")}>
                      <Gauge /> <span>Visão geral</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                  <SidebarMenuItem>
                    <SidebarMenuButton isActive={view === "api-keys"} tooltip="API Keys" onClick={() => setView("api-keys")}>
                      <KeyRound /> <span>API Keys</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                  <SidebarMenuItem>
                    <SidebarMenuButton isActive={view === "webhook"} tooltip="Webhook" onClick={() => setView("webhook")}>
                      <ShieldCheck /> <span>Webhook</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                  <SidebarMenuItem>
                    <SidebarMenuButton isActive={view === "atividade"} tooltip="Atividade" onClick={() => setView("atividade")}>
                      <ClipboardList /> <span>Processos</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                  <SidebarMenuItem>
                    <SidebarMenuButton isActive={view === "estacoes"} tooltip="Estações" onClick={() => setView("estacoes")}>
                      <Wifi /> <span>Estações</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                  <SidebarMenuItem>
                    <SidebarMenuButton isActive={view === "operadores"} tooltip="Operadores" onClick={() => setView("operadores")}>
                      <Users /> <span>Operadores</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                  <SidebarMenuItem>
                    <SidebarMenuButton isActive={view === "usuarios"} tooltip="Usuários" onClick={() => setView("usuarios")}>
                      <UserRound /> <span>Usuários</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          </SidebarContent>
          <SidebarFooter className="group-data-[collapsible=icon]:hidden p-4">
            <Button variant="ghost" className="w-full justify-start" onClick={onSignOut}><LogOut className="size-4 mr-2" /> Sair</Button>
          </SidebarFooter>
        </Sidebar>
        <main className="flex w-full flex-col min-w-0">
          <header className="flex h-14 shrink-0 items-center gap-4 border-b bg-background px-4">
            <SidebarTrigger />
            <div className="ml-auto flex items-center gap-4">
              <Button variant="ghost" size="icon" onClick={() => setDark((value) => !value)}>
                {dark ? <Sun size={16} /> : <Moon size={16} />}
              </Button>
              <div className="flex items-center gap-2">
                <div className="flex flex-col items-end">
                  <strong className="text-sm leading-tight">{session.nomeExibicao}</strong>
                  <span className="text-xs text-muted-foreground">{session.email}</span>
                </div>
                <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted font-medium">
                  {session.nomeExibicao.slice(0, 1).toUpperCase()}
                </div>
              </div>
              <Button variant="ghost" size="icon" title="Sair" onClick={onSignOut}>
                <LogOut size={16} />
              </Button>
            </div>
          </header>
          <div className="flex-1 p-6 overflow-auto">
            {view === "overview" && <PortalOverview dashboard={dashboard} loading={loading} onRefresh={() => void load()} onProcesses={() => setView("atividade")} />}
            {view === "api-keys" && (
              <div className="space-y-6">
                <PageHeader eyebrow="Portal / Integrações" title="API Keys" description="Administre as credenciais usadas pelos sistemas da sua conta." actions={<Button variant="default" onClick={() => setShowForm(true)}><Plus className="size-4 mr-2" /> Nova API Key</Button>} />
                {error && <div className="rounded-sm border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive">{error}</div>}
                <div className="grid gap-4 sm:grid-cols-3">
                  <Metric label="Credenciais" value={clients.length} icon={<KeyRound size={16} />} />
                  <Metric label="Ativas" value={clients.filter((item) => item.status === "ATIVO").length} icon={<ShieldCheck size={16} />} />
                  <Metric label="Última atividade" value={formatDate(clients[0]?.last_used_at || null)} icon={<Activity size={16} />} />
                </div>
                <div className="flex items-center justify-between gap-4 border-b border-border pb-4" id="api-keys"><div><h2 className="text-base font-medium">Suas API Keys</h2><p className="text-sm text-muted-foreground">O segredo é exibido somente na criação ou rotação.</p></div><Button variant="ghost" size="icon-sm" title="Atualizar" onClick={() => void load()} disabled={loading}><RefreshCw className={loading ? "animate-spin" : ""} size={16} /></Button></div>
                {loading ? <Card><CardContent className="space-y-2 p-5"><Skeleton className="h-8 w-full" /><Skeleton className="h-8 w-full" /><Skeleton className="h-8 w-full" /></CardContent></Card> : clients.length ? <ClientTable clients={clients} session={session} onRefresh={() => void load()} onCredential={setCredential} onConfiguration={setConfigurationClient} onError={setError} /> : <Card><EmptyState onCreate={() => setShowForm(true)} /></Card>}
              </div>
            )}
            {view === "atividade" && <PortalProcessesPanel session={session} />}
            {view === "estacoes" && <PortalStationsPanel session={session} />}
            {view === "operadores" && <PortalOperatorsPanel session={session} />}
            {view === "webhook" && <WebhookPanel session={session} />}
            {view === "usuarios" && (
              <div className="space-y-6">
                <PageHeader eyebrow="Portal / Configurações" title="Usuários" description="Gerencie as pessoas que têm acesso ao portal." />
                <PortalUsersPanel session={session} />
              </div>
            )}
          </div>
        </main>
      </div>
      {showForm && <CreateKeyDialog session={session} onClose={() => setShowForm(false)} onCreated={(value) => { setCredential(value); setShowForm(false); void load(); }} onError={setError} />}
      {credential && <CredentialDialog credential={credential} onClose={() => setCredential(null)} />}
      {configurationClient && <ConfigurationDialog client={configurationClient} session={session} credential={credential} onClose={() => setConfigurationClient(null)} onError={setError} />}
    </SidebarProvider>
  );
}
function PortalOverview({ dashboard, loading, onRefresh, onProcesses }: { dashboard: AccountDashboard | null; loading: boolean; onRefresh: () => void; onProcesses: () => void }) {
  if (loading || !dashboard) return <div className="space-y-6"><PageHeader eyebrow="Portal / Operação" title="Visão geral" description="Indicadores gerenciais da sua Conta." actions={<Button variant="outline" size="sm" onClick={onRefresh}><RefreshCw size={14} /> Atualizar</Button>} /><div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{[1, 2, 3, 4].map((item) => <Skeleton className="h-28" key={item} />)}</div></div>;
  const completion = dashboard.orders_total ? Math.round((dashboard.orders_completed / dashboard.orders_total) * 100) : 0;
  return <div className="space-y-6"><PageHeader eyebrow="Portal / Operação" title="Visão geral" description={`Acompanhe os processos e a saúde operacional de ${dashboard.account_name}.`} actions={<Button variant="outline" size="sm" onClick={onRefresh}><RefreshCw size={14} /> Atualizar</Button>} /><div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"><Metric label="Ordens" value={dashboard.orders_total} icon={<ClipboardList size={16} />} /><Metric label="Taxa de conclusão" value={`${completion}%`} icon={<Activity size={16} />} /><Metric label="Pesagens" value={dashboard.weighings_total} icon={<Gauge size={16} />} /><Metric label="API Keys ativas" value={dashboard.api_keys_active} icon={<KeyRound size={16} />} /></div><div className="grid gap-6 lg:grid-cols-2"><Card><CardHeader><CardTitle>Saúde operacional</CardTitle><CardDescription>Itens que merecem atenção da sua equipe.</CardDescription></CardHeader><CardContent className="space-y-4"><div className="flex items-center gap-3"><Wifi className="size-4 text-primary" /><span className="flex-1 text-sm">Estações ativas</span><strong>{dashboard.stations_active}/{dashboard.stations_total}</strong></div><div className="flex items-center gap-3"><Users className="size-4 text-primary" /><span className="flex-1 text-sm">Operadores ativos</span><strong>{dashboard.operators_active}</strong></div><div className="flex items-center gap-3"><Activity className="size-4 text-primary" /><span className="flex-1 text-sm">Eventos pendentes</span><strong className={dashboard.events_pending ? "text-amber-600" : "text-emerald-600"}>{dashboard.events_pending}</strong></div><div className="flex items-center gap-3"><RotateCw size={16} className="text-primary" /><span className="flex-1 text-sm">Reconciliações pendentes</span><strong className={dashboard.weighings_pending ? "text-amber-600" : "text-emerald-600"}>{dashboard.weighings_pending}</strong></div></CardContent></Card><Card><CardHeader><CardTitle>Identificador técnico</CardTitle><CardDescription>Use este valor para identificar a Conta na configuração da aplicação cliente.</CardDescription></CardHeader><CardContent className="space-y-3"><TechnicalIdentifier label="account_id" value={dashboard.account_id} /></CardContent></Card></div><Card><CardHeader><CardTitle>Gestão de processos</CardTitle><CardDescription>Consulte os registros operacionais da sua Conta.</CardDescription></CardHeader><CardContent className="space-y-4"><p className="text-sm text-muted-foreground">Há {dashboard.orders_open} ordem(ns) em aberto e {dashboard.weighings_total} pesagem(ns) registradas.</p><Button onClick={onProcesses}><ClipboardList size={16} /> Abrir processos</Button></CardContent></Card></div>;
}
function TechnicalIdentifier({ label, value }: { label: string; value?: string }) { const [copied, setCopied] = useState(false); async function copy() { if (!value) return; await navigator.clipboard.writeText(value); setCopied(true); window.setTimeout(() => setCopied(false), 1500); } return <div className="flex items-center gap-2 rounded-sm border bg-muted/30 p-2"><div className="min-w-0 flex-1"><span className="block text-xs text-muted-foreground">{label}</span><code className="block truncate text-xs">{value || "Indisponível — entre novamente no Portal"}</code></div><Button variant="ghost" size="icon-sm" title={`Copiar ${label}`} disabled={!value} onClick={() => void copy()}><Copy className="size-4" />{copied && <span className="sr-only">Copiado</span>}</Button></div>; }
function Metric({ label, value, icon }: { label: string; value: number | string; icon: React.ReactNode }) { return <Card><CardHeader className="flex flex-row items-center justify-between"><CardTitle className="text-sm text-muted-foreground">{label}</CardTitle><span className="text-primary">{icon}</span></CardHeader><CardContent><strong className="text-2xl font-semibold tracking-tight">{value}</strong><p className="mt-1 text-xs text-muted-foreground">Dados da sua conta</p></CardContent></Card>; }
function EmptyState({ onCreate }: { onCreate: () => void }) { return <div className="grid min-h-64 place-items-center gap-2 p-8 text-center"><KeyRound className="size-8 text-primary/50" /><strong className="text-sm">Nenhuma credencial ainda</strong><p className="text-sm text-muted-foreground">Crie uma API Key para conectar seu sistema.</p><Button variant="outline" onClick={onCreate}>Criar primeira chave</Button></div>; }
const scopeLabels: Record<string, string> = { "clients:write": "Conectar sistemas", "orders:write": "Criar ordens", "orders:read": "Consultar ordens", "weighings:read": "Consultar pesagens", "weighings:reconcile": "Reconciliar pesagens", "events:read": "Consultar eventos", "stations:activate": "Ativar estações", "webhooks:read": "Consultar webhook", "webhooks:manage": "Gerenciar webhook", "webhooks:replay": "Reprocessar eventos" };
function friendlyScope(scope: string) { return scopeLabels[scope] || scope; }
function ClientTable({ clients, session, onRefresh, onCredential, onConfiguration, onError }: { clients: ApiClient[]; session: Session; onRefresh: () => void; onCredential: (value: NewCredential) => void; onConfiguration: (client: ApiClient) => void; onError: (value: string) => void }) { return <DataTable data={clients} searchPlaceholder="Buscar por nome, Client ID ou permissão..." searchValue={(client) => `${client.nome} ${client.client_id} ${client.scopes.map(friendlyScope).join(" ")}`} columns={[{ id: "nome", header: "Nome", sortValue: (client) => client.nome, cell: (client) => <><strong className="block font-medium">{client.nome}</strong><span className="text-xs text-muted-foreground">{formatDate(client.created_at)}</span></> }, { id: "client_id", header: "Client ID", sortValue: (client) => client.client_id, cell: (client) => <code className="text-xs text-muted-foreground">{client.client_id}</code> }, { id: "scopes", header: "Permissões", cell: (client) => <div className="flex max-w-64 flex-wrap gap-1">{client.scopes.map((scope) => <Badge key={scope} variant="secondary" title={scope}>{friendlyScope(scope)}</Badge>)}</div> }, { id: "status", header: "Status", sortValue: (client) => client.status, cell: (client) => <Badge variant={client.status === "ATIVO" ? "success" : "destructive"}>{client.status}</Badge> }, { id: "last_used_at", header: "Último uso", sortValue: (client) => client.last_used_at || "", cell: (client) => <span className="text-muted-foreground">{formatDate(client.last_used_at)}</span> }, { id: "actions", header: "Ações", cell: (client) => <ClientActions client={client} session={session} onRefresh={onRefresh} onCredential={onCredential} onConfiguration={onConfiguration} onError={onError} /> }]} />; }
function ClientActions({ client, session, onRefresh, onCredential, onConfiguration, onError }: { client: ApiClient; session: Session; onRefresh: () => void; onCredential: (value: NewCredential) => void; onConfiguration: (client: ApiClient) => void; onError: (value: string) => void }) {
  const [busy, setBusy] = useState(false);
  async function rotate() { setBusy(true); try { onCredential(await rotateApiClient(session, client.client_id)); onRefresh(); } catch (cause) { onError(cause instanceof Error ? cause.message : "Falha ao rotacionar."); } finally { setBusy(false); } }
  async function revoke() { setBusy(true); try { await revokeApiClient(session, client.client_id); onRefresh(); } catch (cause) { onError(cause instanceof Error ? cause.message : "Falha ao revogar."); } finally { setBusy(false); } }
  return <div className="flex justify-end gap-1"><Button variant="ghost" size="icon-sm" disabled={busy} title="Ver configuração da aplicação cliente" onClick={() => onConfiguration(client)}><Settings2 /></Button><Button variant="ghost" size="icon-sm" disabled={busy} title="Resetar/rotacionar segredo" onClick={() => void rotate()}><RotateCcw /></Button>{client.status === "ATIVO" && <Button variant="ghost" size="icon-sm" disabled={busy} title="Revogar" onClick={() => void revoke()}><span className="text-destructive">×</span></Button>}</div>;
}

function ConfigurationDialog({ client, session, credential, onClose, onError }: { client: ApiClient; session: Session; credential: NewCredential | null; onClose: () => void; onError: (value: string) => void }) {
  const [configuration, setConfiguration] = useState<ApiClientConfiguration | null>(null);
  const [loading, setLoading] = useState(true);
  const visibleSecret = credential?.client_id === client.client_id ? credential.client_secret : null;
  useEffect(() => { let active = true; void getApiClientConfiguration(session, client.client_id).then((value) => { if (active) setConfiguration(value); }).catch((cause) => { if (active) onError(cause instanceof Error ? cause.message : "Falha ao carregar a configuração."); }).finally(() => { if (active) setLoading(false); }); return () => { active = false; }; }, [client.client_id, session, onError]);
  return <Dialog title={`Configuração — ${client.nome}`} onClose={onClose}><div className="mt-5 space-y-4"><p className="text-sm text-muted-foreground">Use os valores abaixo para configurar a aplicação cliente. Cada botão copia apenas o campo correspondente.</p><TechnicalIdentifier label="Client ID da API Key" value={client.client_id} /><div className="space-y-2"><span className="block text-xs font-medium text-muted-foreground">Sistema cliente</span>{loading ? <Skeleton className="h-10 w-full" /> : configuration?.sistemas_clientes.length ? configuration.sistemas_clientes.map((item) => <div className="grid gap-2 rounded-sm border bg-muted/30 p-2 sm:grid-cols-2" key={`${item.sistema_cliente}-${item.tenant_cliente_id}`}><TechnicalIdentifier label="Sistema cliente" value={item.sistema_cliente} /><TechnicalIdentifier label="Identificador do Cliente TARA" value={item.tenant_cliente_id} /></div>) : <p className="rounded-sm border border-dashed p-3 text-sm text-muted-foreground">Nenhum sistema cliente cadastrado para esta Conta.</p>}</div><div className="space-y-2"><span className="block text-xs font-medium text-muted-foreground">Client Secret</span>{visibleSecret ? <TechnicalIdentifier label="Client Secret" value={visibleSecret} /> : <div className="rounded-sm border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">Indisponível por segurança. O segredo só é exibido na criação ou rotação. Use “Rotacionar” para gerar um novo.</div>}</div><div className="flex justify-end"><Button variant="outline" onClick={onClose}>Fechar</Button></div></div></Dialog>;
}

function ClientRow({ client, session, onRefresh, onCredential, onError }: { client: ApiClient; session: Session; onRefresh: () => void; onCredential: (value: NewCredential) => void; onError: (value: string) => void }) { const [busy, setBusy] = useState(false); async function rotate() { toast.custom((t) => <div className="flex w-full flex-col gap-3 rounded-xl border bg-background p-4 shadow-lg"><div className="flex items-start gap-3"><RotateCcw className="mt-0.5 size-5 text-amber-500 shrink-0" /><div className="flex-1 space-y-1"><p className="text-sm font-semibold">Rotacionar API Key?</p><p className="text-sm text-muted-foreground">O Client Secret atual entrará em transição por 24h e um novo será gerado.</p></div></div><div className="flex justify-end gap-2 border-t pt-3"><Button variant="outline" size="sm" onClick={() => toast.dismiss(t)}>Cancelar</Button><Button size="sm" className="bg-amber-500 text-white hover:bg-amber-600" onClick={async () => { toast.dismiss(t); setBusy(true); try { onCredential(await rotateApiClient(session, client.client_id)); onRefresh(); } catch (cause) { onError(cause instanceof Error ? cause.message : "Falha ao rotacionar."); } finally { setBusy(false); } }}>Rotacionar</Button></div></div>); } async function revoke() { toast.custom((t) => <div className="flex w-full flex-col gap-3 rounded-xl border bg-background p-4 shadow-lg"><div className="flex items-start gap-3"><Ban className="mt-0.5 size-5 text-destructive shrink-0" /><div className="flex-1 space-y-1"><p className="text-sm font-semibold">Revogar API Key?</p><p className="text-sm text-muted-foreground">Todas as chamadas que usam esta credencial deixarão de funcionar.</p></div></div><div className="flex justify-end gap-2 border-t pt-3"><Button variant="outline" size="sm" onClick={() => toast.dismiss(t)}>Cancelar</Button><Button variant="destructive" size="sm" onClick={async () => { toast.dismiss(t); setBusy(true); try { await revokeApiClient(session, client.client_id); onRefresh(); } catch (cause) { onError(cause instanceof Error ? cause.message : "Falha ao revogar."); } finally { setBusy(false); } }}>Revogar</Button></div></div>); } const variant = client.status === "ATIVO" ? "success" : "destructive"; return <TableRow><TableCell><strong className="block font-medium">{client.nome}</strong><span className="text-xs text-muted-foreground">{formatDate(client.created_at)}</span></TableCell><TableCell><code className="text-xs text-muted-foreground">{client.client_id}</code></TableCell><TableCell><div className="flex max-w-56 flex-wrap gap-1">{client.scopes.map((scope) => <Badge key={scope} variant="secondary">{scope}</Badge>)}</div></TableCell><TableCell><Badge variant={variant}>{client.status}</Badge></TableCell><TableCell className="text-muted-foreground">{formatDate(client.last_used_at)}</TableCell><TableCell><div className="flex justify-end gap-1"><Button variant="ghost" size="icon-sm" disabled={busy} title="Resetar/rotacionar segredo" onClick={() => void rotate()}><RotateCcw /></Button>{client.status === "ATIVO" && <Button variant="ghost" size="icon-sm" disabled={busy} title="Revogar" onClick={() => void revoke()}><span className="text-destructive">×</span></Button>}</div></TableCell></TableRow>; }
function CreateKeyDialog({ session, onClose, onCreated, onError }: { session: Session; onClose: () => void; onCreated: (value: NewCredential) => void; onError: (value: string) => void }) { const [name, setName] = useState(""); const [scopes, setScopes] = useState<string[]>(["orders:write", "events:read"]); const [busy, setBusy] = useState(false); async function submit(event: React.FormEvent<HTMLFormElement>) { event.preventDefault(); setBusy(true); try { onCreated(await createApiClient(session, { nome: name.trim(), scopes, expires_at: null })); } catch (cause) { onError(cause instanceof Error ? cause.message : "Falha ao criar API Key."); } finally { setBusy(false); } } return <Dialog title="Conectar um sistema" onClose={onClose}><form className="mt-5 space-y-4" onSubmit={submit}><p className="text-sm text-muted-foreground">Dê um nome que ajude sua equipe a identificar esta integração.</p><Field label="Nome da integração"><Input required value={name} onChange={(event) => setName(event.target.value)} placeholder="ERP produção" /></Field><div className="space-y-2"><strong className="text-sm font-medium">Permissões</strong><p className="text-xs text-muted-foreground">Passe o cursor ou foque no ícone de ajuda para entender cada permissão. Conceda somente o necessário.</p>{SCOPES.map(([scope, label, help]) => <label className="flex items-center gap-2 text-sm" key={scope}><input type="checkbox" checked={scopes.includes(scope)} onChange={(event) => setScopes((current) => event.target.checked ? [...current, scope] : current.filter((item) => item !== scope))} /><span className="flex-1">{label}</span><span title={help} aria-label={`Ajuda: ${help}`} role="img" className="inline-flex cursor-help text-muted-foreground hover:text-primary"><HelpCircle className="size-4" /></span></label>)}</div><div className="flex justify-end gap-2"><Button variant="outline" onClick={onClose}>Cancelar</Button><Button variant="default" type="submit" disabled={busy || !scopes.length}>{busy ? "Gerando…" : "Gerar API Key"}</Button></div></form></Dialog>; }
function CredentialDialog({ credential, onClose }: { credential: NewCredential; onClose: () => void }) { const [copied, setCopied] = useState(false); async function copy() { await navigator.clipboard.writeText(`TARA_CLIENT_ID=${credential.client_id}\nTARA_CLIENT_SECRET=${credential.client_secret}`); setCopied(true); } return <Dialog title="Credencial pronta" onClose={onClose}><div className="mt-5 space-y-4"><div className="flex items-center gap-2 text-sm text-primary"><Check className="size-4" /> API Key criada com sucesso</div><p className="text-sm text-muted-foreground">Salve o Client Secret. Por segurança, ele não será exibido novamente.</p><div className="grid gap-2 rounded-sm border border-dashed border-primary/30 bg-primary/5 p-3"><span className="text-xs font-medium text-muted-foreground">Client ID</span><code className="break-all text-xs">{credential.client_id}</code><span className="text-xs font-medium text-muted-foreground">Client Secret</span><code className="break-all text-xs">{credential.client_secret}</code></div><div className="flex justify-end gap-2"><Button variant="outline" onClick={onClose}>Fechar</Button><Button variant="default" onClick={() => void copy()}><Copy />{copied ? "Copiado" : "Copiar credenciais"}</Button></div></div></Dialog>; }
