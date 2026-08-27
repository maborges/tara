"use client";

import { useEffect, useState } from "react";
import { Activity, Ban, Boxes, Check, ClipboardList, Copy, Gauge, KeyRound, LogOut, Mail, Moon, PanelLeft, PanelLeftClose, Plus, RefreshCw, RotateCcw, Sun, Users, Wifi } from "lucide-react";
import { apiFetch, createApiClient, createOperator, createStation, formatDate, login, revokeApiClient, revokeOperator, rotateApiClient, statusLabel, type ApiClient, type Event, type NewCredential, type Operator, type Order, type Session, type Station } from "@/lib/api";

import { SidebarProvider, Sidebar, SidebarContent, SidebarGroup, SidebarGroupLabel, SidebarGroupContent, SidebarMenu, SidebarMenuItem, SidebarMenuButton, SidebarHeader, SidebarFooter, SidebarTrigger } from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { toast } from "sonner";
import { DataTable, type ColumnDef } from "@/components/ui/data-table";
import { PageHeader } from "@/components/shared/page-header";
import { PlatformEmailSettingsPanel } from "@/components/platform-email-settings";

type View = "overview" | "clients" | "orders" | "stations" | "operators" | "events" | "settings";
const SCOPES = [["clients:write", "Registrar clientes consumidores"], ["orders:write", "Criar ordens de pesagem"], ["events:read", "Consultar eventos"], ["stations:activate", "Ativar estações"]] as const;

function Badge({ value }: { value: string }) {
  const tone = ["CONCLUIDA", "ENTREGUE", "ATIVA"].includes(value) ? "bg-green-100 text-green-800 border-green-200" : ["PENDENTE", "EM_PESAGEM"].includes(value) ? "bg-orange-100 text-orange-800 border-orange-200" : "bg-gray-100 text-gray-800 border-gray-200";
  return <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${tone}`}>{statusLabel(value)}</span>;
}

export default function BackofficePage() {
  const [session, setSession] = useState<Session | null>(null); const [hydrated, setHydrated] = useState(false); const [view, setView] = useState<View>("overview"); const [dark, setDark] = useState(false); const [loading, setLoading] = useState(false); const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState({ orders: [] as Order[], stations: [] as Station[], operators: [] as Operator[], events: [] as Event[], clients: [] as ApiClient[] });

  useEffect(() => { try { const saved = window.sessionStorage.getItem("balanca-backoffice-session"); const savedView = window.sessionStorage.getItem("balanca-backoffice-view"); if (savedView && ["overview", "clients", "orders", "stations", "operators", "events", "settings"].includes(savedView)) setView(savedView as View); if (!saved) return; const parsed = JSON.parse(saved) as Session; if (parsed.expiresAt && parsed.expiresAt > Date.now()) setSession(parsed); else window.sessionStorage.removeItem("balanca-backoffice-session"); } catch { window.sessionStorage.removeItem("balanca-backoffice-session"); } finally { setHydrated(true); } }, []);
  useEffect(() => { if (session) void loadData(session); }, [session]);

  async function loadData(active: Session) {
    setLoading(true); setError(null);
    try {
      const [orders, stations, operators, events] = await Promise.all([active.permissions.includes("backoffice:ordens:gerenciar") ? apiFetch<Order[]>("/v1/orders", active) : Promise.resolve([]), active.permissions.includes("backoffice:estacoes:gerenciar") ? apiFetch<Station[]>("/v1/stations", active) : Promise.resolve([]), active.permissions.includes("backoffice:operadores:gerenciar") ? apiFetch<Operator[]>("/v1/operators", active) : Promise.resolve([]), active.permissions.includes("backoffice:eventos:consultar") ? apiFetch<Event[]>("/v1/admin/events", active) : Promise.resolve([])]);
      const clients = active.permissions.includes("backoffice:clientes:gerenciar") ? await apiFetch<ApiClient[]>("/v1/admin/api-clients", active) : [];
      setData({ orders, stations, operators, events, clients });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Falha ao carregar dados.");
    } finally {
      setLoading(false);
    }
  }

  function signOut() { window.sessionStorage.removeItem("balanca-backoffice-session"); setSession(null); }
  function can(permission: string) { return Boolean(session?.permissions.includes(permission)); }

  if (!hydrated) return <BackofficeLoading />;
  if (!session) return <LoginScreen onLogin={(next) => { window.sessionStorage.setItem("balanca-backoffice-session", JSON.stringify(next)); setSession(next); }} />;

  const titles: Record<View, string> = { overview: "Visão geral", clients: "Clientes e credenciais", orders: "Ordens de pesagem", stations: "Estações", operators: "Operadores", events: "Outbox de eventos", settings: "Configurações da plataforma" }; const pending = data.orders.filter((item) => item.status !== "CONCLUIDA").length;
  const nav: [View, typeof Gauge, string, string | null][] = [["overview", Gauge, "Visão geral", null], ["clients", KeyRound, "Clientes e API Keys", "backoffice:clientes:gerenciar"], ["orders", ClipboardList, "Ordens", "backoffice:ordens:gerenciar"], ["stations", Wifi, "Estações", "backoffice:estacoes:gerenciar"], ["operators", Users, "Operadores", "backoffice:operadores:gerenciar"], ["events", Activity, "Outbox de eventos", "backoffice:eventos:consultar"], ["settings", Mail, "Configurações", null]];

  return (
    <SidebarProvider>
      <div className={`flex min-h-screen w-full bg-background ${dark ? "dark" : ""}`}>
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
                    <span className="truncate text-xs text-muted-foreground">Plataforma operacional</span>
                  </div>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarHeader>
          <SidebarContent>
            <SidebarGroup>
              <SidebarGroupLabel>Operação</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {nav.map(([key, Icon, label, permission]) => permission && !can(permission) ? null : (
                    <SidebarMenuItem key={key}>
                      <SidebarMenuButton isActive={view === key} onClick={() => { setView(key); window.sessionStorage.setItem("balanca-backoffice-view", key); }} tooltip={label}>
                        <Icon /> <span>{label}</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          </SidebarContent>
          <SidebarFooter className="group-data-[collapsible=icon]:hidden p-4">
            <span className="text-xs text-muted-foreground">Ambiente conectado</span>
            <strong className="text-sm">Serviço Tara</strong>
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
                  <strong className="text-sm leading-tight">{session.login}</strong>
                  <span className="text-xs text-muted-foreground">Administrador</span>
                </div>
                <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted font-medium">
                  {session.login.slice(0, 1).toUpperCase()}
                </div>
              </div>
              <Button variant="ghost" size="icon" onClick={signOut} title="Sair">
                <LogOut size={16} />
              </Button>
            </div>
          </header>
          <div className="flex-1 p-6 overflow-auto">
            {error && <div className="mb-4 rounded-md border-l-4 border-destructive bg-destructive/10 p-4 text-sm text-destructive">{error}</div>}
            {view === "overview" ? <Overview data={data} pending={pending} loading={loading} onRefresh={() => void loadData(session)} /> : <DataView view={view} data={data} session={session} loading={loading} onRefresh={() => void loadData(session)} onError={setError} />}
          </div>
        </main>
      </div>
    </SidebarProvider>
  );
}

function BackofficeLoading() {
  return <div className="grid min-h-screen place-items-center bg-background"><div className="space-y-3 text-center"><div className="mx-auto flex size-10 items-center justify-center rounded-sm bg-primary text-lg font-bold text-primary-foreground">B</div><p className="text-sm text-muted-foreground">Restaurando sua sessão…</p></div></div>;
}

function LoginScreen({ onLogin }: { onLogin: (session: Session) => void }) {
  const [loginValue, setLoginValue] = useState(""); const [password, setPassword] = useState(""); const [error, setError] = useState<string | null>(null); const [loading, setLoading] = useState(false);
  async function submit(event: React.FormEvent) {
    event.preventDefault(); setLoading(true); setError(null);
    try {
      const response = await login(loginValue.trim(), password);
      onLogin({ token: response.access_token, tenantId: response.tenant_id, login: loginValue, permissions: response.permissions, expiresAt: Date.now() + response.expires_in * 1000 });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível entrar.");
    } finally {
      setLoading(false);
    }
  }
  return (
    <div className="flex min-h-screen bg-muted/30">
      <div className="relative flex-1 flex flex-col justify-center items-center p-12 overflow-hidden">
        {/* Background Layer */}
        <div
          className="absolute inset-0 bg-cover bg-center z-0"
          style={{ backgroundImage: "url('/login-bg.jpg')" }}
        />
        <div className="absolute inset-0 bg-primary/80 mix-blend-multiply z-0" />
        <div className="absolute inset-0 bg-gradient-to-t from-primary/95 via-primary/60 to-transparent z-0" />

        {/* Content Layer */}
        <div className="relative z-10 max-w-md space-y-6 text-white">
          <div className="flex items-center gap-4">
            <img src="/logo.png" alt="Tara" className="size-12 shrink-0 dark:hidden" />
            <img src="/logo-dark.png" alt="Tara" className="size-12 shrink-0 hidden dark:block" />
            <div><h1 className="text-2xl font-bold tracking-tight text-white">Tara</h1><p className="text-white/90">Plataforma operacional</p></div>
          </div>
          <div><h2 className="text-4xl font-bold tracking-tight text-white">Pesagens confiáveis. Integrações seguras.</h2><p className="mt-4 text-lg text-white/80">Administre clientes, credenciais, estações, operadores e eventos em um único lugar.</p></div>
        </div>
      </div>
      <div className="flex-1 flex items-center justify-center p-12 bg-background relative z-10 shadow-2xl">
        <Card className="w-full max-w-md shadow-xl border-none">
          <form onSubmit={submit}>
            <CardHeader>
              <CardDescription className="uppercase tracking-wider font-medium text-xs">Acesso seguro</CardDescription>
              <CardTitle className="text-2xl">Entrar no backoffice</CardTitle>
              <CardDescription>Use as credenciais administrativas da plataforma.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {error && <div className="rounded border-l-4 border-destructive bg-destructive/10 p-3 text-sm font-medium text-destructive">{error}</div>}
              <div className="space-y-1.5"><label className="text-sm font-medium">Usuário</label><Input required value={loginValue} onChange={(event) => setLoginValue(event.target.value)} placeholder="seu.login" /></div>
              <div className="space-y-1.5"><label className="text-sm font-medium">Senha</label><Input required type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="••••••••" /></div>
              <Button type="submit" className="w-full" disabled={loading}>{loading ? "Entrando…" : "Entrar"}</Button>
            </CardContent>
          </form>
        </Card>
      </div>
    </div>
  );
}

function Overview({ data, pending, loading, onRefresh }: { data: { orders: Order[]; stations: Station[]; operators: Operator[]; events: Event[]; clients: ApiClient[] }; pending: number; loading: boolean; onRefresh: () => void }) {
  return (
    <div className="space-y-6">
      <PageHeader
        title="O que está acontecendo"
        description="Uma leitura rápida da operação da sua balança."
        breadcrumbs={[{ label: "Operação hoje" }]}
        icon={<Gauge className="size-6" />}
        actions={<Button variant="outline" size="sm" onClick={onRefresh} disabled={loading}><RefreshCw className={loading ? "animate-spin" : ""} size={14} /> Atualizar</Button>}
      />
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Metric label="Ordens abertas" value={pending} icon={<ClipboardList size={16} />} />
        <Metric label="Ordens concluídas" value={data.orders.filter((item) => item.status === "CONCLUIDA").length} icon={<Boxes size={16} />} />
        <Metric label="Estações ativas" value={data.stations.filter((item) => item.status === "ATIVA").length} icon={<Wifi size={16} />} />
        <Metric label="Eventos pendentes" value={data.events.filter((item) => item.status !== "ENTREGUE").length} icon={<Activity size={16} />} />
      </div>
      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="col-span-2">
          <CardHeader><CardTitle>Ordens recentes</CardTitle></CardHeader>
          <CardContent><OrderTable orders={data.orders.slice(0, 6)} hideExport /></CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Estações</CardTitle>
            <CardDescription>{data.stations.length} cadastradas</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {data.stations.slice(0, 5).map((station) => (
                <div className="flex items-center gap-3" key={station.id}>
                  <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground"><Gauge size={16} /></div>
                  <div className="flex-1 min-w-0"><p className="text-sm font-medium truncate">{station.nome}</p><p className="text-xs text-muted-foreground truncate">{station.external_id}</p></div>
                  <div><Badge value={station.status} /></div>
                </div>
              ))}
              {!data.stations.length && <p className="text-sm text-muted-foreground">Nenhuma estação cadastrada.</p>}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
function Metric({ label, value, icon }: { label: string; value: number; icon: React.ReactNode }) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
        <CardTitle className="text-sm font-medium">{label}</CardTitle>
        <div className="text-muted-foreground">{icon}</div>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
        <p className="text-xs text-muted-foreground mt-1">Dados em tempo real</p>
      </CardContent>
    </Card>
  );
}

function DataView({ view, data, session, loading, onRefresh, onError }: { view: View; data: { orders: Order[]; stations: Station[]; operators: Operator[]; events: Event[]; clients: ApiClient[] }; session: Session; loading: boolean; onRefresh: () => void; onError: (value: string | null) => void }) {
  if (view === "settings") return <div className="space-y-6"><PageHeader title="Configurações da plataforma" description="Gerencie os serviços e parâmetros globais da Plataforma Balança." breadcrumbs={[{ label: "Administração" }]} icon={<Mail className="size-6" />} /><PlatformEmailSettingsPanel session={session} /></div>;
  const subtitle = view === "clients" ? "Gerencie os sistemas consumidores e suas credenciais de integração." : "Consulte e administre os registros do tenant com isolamento e RBAC.";

  const Icon = view === "clients" ? KeyRound : view === "orders" ? ClipboardList : view === "stations" ? Wifi : view === "operators" ? Users : Activity;

  return (
    <div className="space-y-6">
      <PageHeader
        title={view === "clients" ? "Clientes e API Keys" : view === "orders" ? "Ordens de pesagem" : view === "stations" ? "Estações" : view === "operators" ? "Operadores" : "Outbox de eventos"}
        description={subtitle}
        breadcrumbs={[{ label: "Administração" }]}
        icon={<Icon className="size-6" />}
        actions={<Button variant="outline" size="sm" onClick={onRefresh} disabled={loading}><RefreshCw className={loading ? "animate-spin" : ""} size={14} /> Atualizar</Button>}
      />
      <Card>
        <CardContent className="p-6">
          {view === "clients" && <ClientPanel clients={data.clients} session={session} onRefresh={onRefresh} onError={onError} />}
          {view === "orders" && <OrderTable orders={data.orders} />}
          {view === "stations" && <StationPanel stations={data.stations} session={session} onRefresh={onRefresh} onError={onError} />}
          {view === "operators" && <OperatorPanel operators={data.operators} session={session} onRefresh={onRefresh} onError={onError} />}
          {view === "events" && <EventTable events={data.events} />}
        </CardContent>
      </Card>
    </div>
  );
}

function ClientPanel({ clients, session, onRefresh, onError }: { clients: ApiClient[]; session: Session; onRefresh: () => void; onError: (value: string | null) => void }) {
  const [name, setName] = useState(""); const [scopes, setScopes] = useState<string[]>(["orders:write", "events:read"]); const [expires, setExpires] = useState(""); const [credential, setCredential] = useState<NewCredential | null>(null); const [busy, setBusy] = useState(false);
  async function submit(event: React.FormEvent) { event.preventDefault(); setBusy(true); onError(null); try { const created = await createApiClient(session, { nome: name.trim(), scopes, expires_at: expires ? new Date(`${expires}T23:59:59`).toISOString() : null }); setCredential(created); setName(""); setExpires(""); onRefresh(); } catch (cause) { onError(cause instanceof Error ? cause.message : "Falha ao criar credencial."); } finally { setBusy(false); } }
  async function rotate(clientId: string) { toast.custom((t) => <div className="flex w-full flex-col gap-3 rounded-xl border bg-background p-4 shadow-lg"><div className="flex items-start gap-3"><RotateCcw className="mt-0.5 size-5 text-amber-500 shrink-0" /><div className="flex-1 space-y-1"><p className="text-sm font-semibold">Rotacionar credencial?</p><p className="text-sm text-muted-foreground">O Client Secret atual entrará em transição por 24h e um novo será gerado.</p></div></div><div className="flex justify-end gap-2 border-t pt-3"><Button variant="outline" size="sm" onClick={() => toast.dismiss(t)}>Cancelar</Button><Button size="sm" className="bg-amber-500 text-white hover:bg-amber-600" onClick={async () => { toast.dismiss(t); try { setCredential(await rotateApiClient(session, clientId)); onRefresh(); } catch (cause) { onError(cause instanceof Error ? cause.message : "Falha ao rotacionar credencial."); } }}>Rotacionar</Button></div></div>); }
  async function revoke(clientId: string) { toast.custom((t) => <div className="flex w-full flex-col gap-3 rounded-xl border bg-background p-4 shadow-lg"><div className="flex items-start gap-3"><Ban className="mt-0.5 size-5 text-destructive shrink-0" /><div className="flex-1 space-y-1"><p className="text-sm font-semibold">Revogar credencial?</p><p className="text-sm text-muted-foreground">Todas as chamadas que usam esta credencial deixarão de funcionar.</p></div></div><div className="flex justify-end gap-2 border-t pt-3"><Button variant="outline" size="sm" onClick={() => toast.dismiss(t)}>Cancelar</Button><Button variant="destructive" size="sm" onClick={async () => { toast.dismiss(t); try { await revokeApiClient(session, clientId); onRefresh(); } catch (cause) { onError(cause instanceof Error ? cause.message : "Falha ao revogar credencial."); } }}>Revogar</Button></div></div>); }

  const columns: ColumnDef<ApiClient>[] = [
    { id: "nome", header: "Nome", accessorKey: "nome" },
    { id: "client_id", header: "Client ID", accessorKey: "client_id" },
    { id: "status", header: "Status", cell: (val, row) => <Badge value={row.status} /> },
    { id: "last_used_at", header: "Último uso", cell: (val, row) => <span className="text-muted-foreground">{formatDate(row.last_used_at)}</span> },
    {
      id: "acoes", header: "Ações", cell: (val, row) => (
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon-sm" onClick={() => void rotate(row.client_id)} title="Resetar/rotacionar segredo"><RotateCcw size={14} /></Button>
          {row.status === "ATIVO" && <Button variant="ghost" size="icon-sm" className="text-destructive hover:bg-destructive hover:text-white" onClick={() => void revoke(row.client_id)} title="Revogar"><Ban size={14} /></Button>}
        </div>
      )
    }
  ];

  return (
    <div className="space-y-8">
      <form onSubmit={submit} className="flex flex-col gap-4 max-w-2xl bg-muted/30 p-4 rounded-lg border">
        <h3 className="text-sm font-medium">Nova credencial API</h3>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5"><label className="text-xs font-medium">Nome do sistema consumidor</label><Input required value={name} onChange={(event) => setName(event.target.value)} placeholder="AgroSaaS produção" /></div>
          <div className="space-y-1.5"><label className="text-xs font-medium">Expiração opcional</label><Input type="date" value={expires} onChange={(event) => setExpires(event.target.value)} /></div>
        </div>
        <div className="space-y-1.5">
          <label className="text-xs font-medium">Escopos</label>
          <div className="flex flex-wrap gap-4">
            {SCOPES.map(([scope, label]) => <label key={scope} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={scopes.includes(scope)} onChange={(event) => setScopes((current) => event.target.checked ? [...current, scope] : current.filter((item) => item !== scope))} />{label}</label>)}
          </div>
        </div>
        <Button type="submit" disabled={busy || !scopes.length} className="w-fit"><Plus size={14} className="mr-2" />{busy ? "Gerando…" : "Gerar credencial"}</Button>
      </form>
      {credential && <CredentialNotice credential={credential} onClose={() => setCredential(null)} />}
      <DataTable columns={columns} data={clients} searchable searchPlaceholder="Buscar clientes..." exportFileName="clientes" />
    </div>
  );
}
function CredentialNotice({ credential, onClose }: { credential: NewCredential; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  async function copy() { await navigator.clipboard.writeText(`Client ID: ${credential.client_id}\nClient Secret: ${credential.client_secret}`); setCopied(true); }
  return (
    <div className="flex items-center justify-between p-4 rounded-lg border border-primary/20 bg-primary/5">
      <div className="space-y-1">
        <strong className="text-sm">Credencial gerada — salve o segredo agora</strong>
        <p className="text-xs text-muted-foreground">O Client Secret não será exibido novamente.</p>
        <div className="flex gap-4 mt-2">
          <code className="text-xs bg-background p-1.5 rounded border">{credential.client_id}</code>
          <code className="text-xs bg-background p-1.5 rounded border">{credential.client_secret}</code>
        </div>
      </div>
      <div className="flex gap-2">
        <Button variant="outline" size="sm" onClick={() => void copy()}>{copied ? <Check size={14} className="mr-2" /> : <Copy size={14} className="mr-2" />} {copied ? "Copiado" : "Copiar"}</Button>
        <Button variant="ghost" size="sm" onClick={onClose}>Fechar</Button>
      </div>
    </div>
  );
}

function StationPanel({ stations, session, onRefresh, onError }: { stations: Station[]; session: Session; onRefresh: () => void; onError: (value: string | null) => void }) {
  const [externalId, setExternalId] = useState(""); const [name, setName] = useState(""); const [busy, setBusy] = useState(false);
  async function submit(event: React.FormEvent) { event.preventDefault(); setBusy(true); try { await createStation(session, { external_id: externalId.trim(), nome: name.trim() }); setExternalId(""); setName(""); onRefresh(); } catch (cause) { onError(cause instanceof Error ? cause.message : "Falha ao criar estação."); } finally { setBusy(false); } }

  const columns: ColumnDef<Station>[] = [
    { id: "nome", header: "Nome", accessorKey: "nome" },
    { id: "external_id", header: "Identificador", accessorKey: "external_id", cell: (val, row) => <span className="text-muted-foreground">{row.external_id}</span> },
    { id: "status", header: "Status", cell: (val, row) => <Badge value={row.status} /> },
    { id: "activation_code", header: "Código de ativação", cell: (val, row) => <span className="font-mono text-sm">{row.activation_code || "—"}</span> }
  ];

  return (
    <div className="space-y-8">
      <form onSubmit={submit} className="flex items-end gap-4 bg-muted/30 p-4 rounded-lg border flex-wrap">
        <div className="space-y-1.5 flex-1 min-w-[200px]"><label className="text-xs font-medium">Identificador externo</label><Input required value={externalId} onChange={(event) => setExternalId(event.target.value)} placeholder="balanca-01" /></div>
        <div className="space-y-1.5 flex-1 min-w-[200px]"><label className="text-xs font-medium">Nome</label><Input required value={name} onChange={(event) => setName(event.target.value)} placeholder="Balança principal" /></div>
        <Button type="submit" disabled={busy}><Plus size={14} className="mr-2" />{busy ? "Salvando…" : "Cadastrar estação"}</Button>
      </form>
      <DataTable columns={columns} data={stations} searchable searchPlaceholder="Buscar estações..." exportFileName="estacoes" />
    </div>
  );
}

function OperatorPanel({ operators, session, onRefresh, onError }: { operators: Operator[]; session: Session; onRefresh: () => void; onError: (value: string | null) => void }) {
  const [code, setCode] = useState(""); const [name, setName] = useState(""); const [pin, setPin] = useState(""); const [busy, setBusy] = useState(false);
  async function submit(event: React.FormEvent) { event.preventDefault(); setBusy(true); try { await createOperator(session, { codigo: code.trim(), nome_exibicao: name.trim(), pin }); setCode(""); setName(""); setPin(""); onRefresh(); } catch (cause) { onError(cause instanceof Error ? cause.message : "Falha ao criar operador."); } finally { setBusy(false); } }
  async function revoke(id: string) { toast.custom((t) => <div className="flex w-full flex-col gap-3 rounded-xl border bg-background p-4 shadow-lg"><div className="flex items-start gap-3"><Ban className="mt-0.5 size-5 text-destructive shrink-0" /><div className="flex-1 space-y-1"><p className="text-sm font-semibold">Revogar operador?</p><p className="text-sm text-muted-foreground">Este operador não poderá mais acessar o sistema.</p></div></div><div className="flex justify-end gap-2 border-t pt-3"><Button variant="outline" size="sm" onClick={() => toast.dismiss(t)}>Cancelar</Button><Button variant="destructive" size="sm" onClick={async () => { toast.dismiss(t); try { await revokeOperator(session, id); onRefresh(); } catch (cause) { onError(cause instanceof Error ? cause.message : "Falha ao revogar operador."); } }}>Revogar</Button></div></div>); }

  const columns: ColumnDef<Operator>[] = [
    { id: "nome_exibicao", header: "Operador", accessorKey: "nome_exibicao" },
    { id: "codigo", header: "Código", accessorKey: "codigo", cell: (val, row) => <span className="text-muted-foreground">{row.codigo}</span> },
    { id: "status", header: "Status", cell: (val, row) => <Badge value={row.status} /> },
    { id: "created_at", header: "Cadastro", cell: (val, row) => <span className="text-muted-foreground">{formatDate(row.created_at)}</span> },
    { id: "acoes", header: "Ações", cell: (val, row) => row.status === "ATIVO" ? <Button variant="ghost" size="sm" className="text-destructive hover:bg-destructive hover:text-white" onClick={() => void revoke(row.id)}><Ban size={14} className="mr-2" /> Revogar</Button> : null }
  ];

  return (
    <div className="space-y-8">
      <form onSubmit={submit} className="flex items-end gap-4 bg-muted/30 p-4 rounded-lg border flex-wrap">
        <div className="space-y-1.5 flex-1 min-w-[150px]"><label className="text-xs font-medium">Código</label><Input required value={code} onChange={(event) => setCode(event.target.value)} placeholder="OP-001" /></div>
        <div className="space-y-1.5 flex-1 min-w-[200px]"><label className="text-xs font-medium">Nome</label><Input required value={name} onChange={(event) => setName(event.target.value)} placeholder="Nome do operador" /></div>
        <div className="space-y-1.5 flex-1 min-w-[150px]"><label className="text-xs font-medium">PIN</label><Input required minLength={4} value={pin} onChange={(event) => setPin(event.target.value)} placeholder="••••" /></div>
        <Button type="submit" disabled={busy}><Plus size={14} className="mr-2" />{busy ? "Salvando…" : "Cadastrar operador"}</Button>
      </form>
      <DataTable columns={columns} data={operators} searchable searchPlaceholder="Buscar operadores..." exportFileName="operadores" />
    </div>
  );
}

function OrderTable({ orders, hideExport }: { orders: Order[], hideExport?: boolean }) {
  const columns: ColumnDef<Order>[] = [
    { id: "referencia_externa", header: "Referência", accessorKey: "referencia_externa" },
    { id: "sistema_cliente", header: "Cliente", accessorKey: "sistema_cliente", cell: (val, row) => <span className="text-muted-foreground">{row.sistema_cliente}</span> },
    { id: "subject_type", header: "Tipo", accessorKey: "subject_type" },
    { id: "status", header: "Status", cell: (val, row) => <Badge value={row.status} /> },
    { id: "created_at", header: "Criada em", cell: (val, row) => <span className="text-muted-foreground">{formatDate(row.created_at)}</span> }
  ];
  return <DataTable columns={columns} data={orders} searchable={!hideExport} exportFileName={hideExport ? undefined : "ordens"} />;
}

function EventTable({ events }: { events: Event[] }) {
  const columns: ColumnDef<Event>[] = [
    { id: "event_type", header: "Evento", cell: (val, row) => <div><strong>{row.event_type}</strong><br /><small className="text-muted-foreground">{row.event_version}</small></div> },
    { id: "idempotency_key", header: "Chave", accessorKey: "idempotency_key", cell: (val, row) => <span className="text-muted-foreground font-mono text-xs">{row.idempotency_key}</span> },
    { id: "status", header: "Status", cell: (val, row) => <Badge value={row.status} /> },
    { id: "attempts", header: "Tentativas", accessorKey: "attempts" },
    { id: "created_at", header: "Criado em", cell: (val, row) => <span className="text-muted-foreground">{formatDate(row.created_at)}</span> }
  ];
  return <DataTable columns={columns} data={events} searchable searchPlaceholder="Buscar eventos..." exportFileName="eventos" />;
}
