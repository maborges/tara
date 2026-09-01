"use client";

import { useEffect, useState } from "react";
import { Activity, AlertTriangle, Ban, Boxes, Check, CheckCircle2, ClipboardList, Copy, Eye, Gauge, KeyRound, LogOut, Mail, Moon, PanelLeft, PanelLeftClose, Pencil, Plus, RefreshCw, RotateCcw, Server, Sun, Timer, TrendingUp, Users, Wifi } from "lucide-react";
import { createApiClient, createOperator, createStation, formatDate, getAccountDashboard, getAdminWeighings, getPlatformAccounts, login, reconcileAdminWeighing, replayEvent, revokeApiClient, revokeOperator, rotateApiClient, statusLabel, updateApiClient, updatePlatformAccount, type Account, type AccountDashboard, type ApiClient, type Event, type NewCredential, type Operator, type Order, type PlatformAccount, type Session, type Station, type Weighing } from "@/lib/api";

import { SidebarProvider, Sidebar, SidebarContent, SidebarGroup, SidebarGroupLabel, SidebarGroupContent, SidebarMenu, SidebarMenuItem, SidebarMenuButton, SidebarHeader, SidebarFooter, SidebarTrigger } from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { toast } from "sonner";
import { DataTable, type ColumnDef } from "@/components/ui/data-table";
import { PageHeader } from "@/components/shared/page-header";
import { PlatformEmailSettingsPanel } from "@/components/platform-email-settings";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useBackofficeSession, type BackofficeData } from "@/lib/use-backoffice-session";

type View = "overview" | "accounts" | "clients" | "orders" | "weighings" | "stations" | "operators" | "events" | "settings";
const SCOPES = [["clients:write", "Registrar clientes consumidores"], ["orders:write", "Criar ordens de pesagem"], ["events:read", "Consultar eventos"], ["stations:activate", "Ativar estações"]] as const;

function Badge({ value }: { value: string }) {
  const tone = ["CONCLUIDA", "ENTREGUE", "ATIVA"].includes(value) ? "bg-green-100 text-green-800 border-green-200" : ["PENDENTE", "EM_PESAGEM"].includes(value) ? "bg-orange-100 text-orange-800 border-orange-200" : "bg-gray-100 text-gray-800 border-gray-200";
  return <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${tone}`}>{statusLabel(value)}</span>;
}

export default function BackofficePage() {
  const { session, hydrated, data, loading, error, setError, startSession, signOut, loadData } = useBackofficeSession();
  const [view, setView] = useState<View>("overview");
  const [dark, setDark] = useState(false);
  useEffect(() => { const savedView = window.sessionStorage.getItem("balanca-backoffice-view"); if (savedView && ["overview", "accounts", "clients", "orders", "weighings", "stations", "operators", "events", "settings"].includes(savedView)) setView(savedView as View); }, []);
  function can(permission: string) { return Boolean(session?.permissions.includes(permission)); }

  if (!hydrated) return <BackofficeLoading />;
  if (!session) return <LoginScreen onLogin={startSession} />;

  const titles: Record<View, string> = { overview: "Visão geral", accounts: "Clientes da plataforma", clients: "Clientes e credenciais", orders: "Ordens de pesagem", weighings: "Pesagens e reconciliação", stations: "Estações", operators: "Operadores", events: "Outbox de eventos", settings: "Configurações da plataforma" }; const pending = data.orders.filter((item) => item.status !== "CONCLUIDA").length;
  const nav: [View, typeof Gauge, string, string | null][] = [["overview", Gauge, "Visão geral", null], ["accounts", Boxes, "Clientes da plataforma", null], ["clients", KeyRound, "Clientes e API Keys", "backoffice:clientes:gerenciar"], ["orders", ClipboardList, "Ordens", "backoffice:ordens:gerenciar"], ["weighings", Gauge, "Pesagens", "backoffice:pesagens:consultar"], ["stations", Wifi, "Estações", "backoffice:estacoes:gerenciar"], ["operators", Users, "Operadores", "backoffice:operadores:gerenciar"], ["events", Activity, "Outbox de eventos", "backoffice:eventos:consultar"], ["settings", Mail, "Configurações", null]];

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
  return <div className="grid min-h-screen place-items-center bg-background"><div className="space-y-3 text-center"><div className="mx-auto flex size-12 items-center justify-center"><img src="/logo.png" alt="Tara" className="size-full dark:hidden" /><img src="/logo-dark.png" alt="Tara" className="size-full hidden dark:block" /></div><p className="text-sm text-muted-foreground">Restaurando sua sessão…</p></div></div>;
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

function Overview({ data, pending, loading, onRefresh }: { data: BackofficeData; pending: number; loading: boolean; onRefresh: () => void }) {
  const global = data.platformDashboard;
  const completed = global?.orders_completed ?? data.orders.filter((item) => item.status === "CONCLUIDA").length;
  const orderTotal = global?.orders_total ?? data.orders.length;
  const completionRate = orderTotal ? Math.round((completed / orderTotal) * 100) : 0;
  const delivered = global ? global.events_total - global.events_pending : data.events.filter((item) => item.status === "ENTREGUE").length;
  const eventTotal = global?.events_total ?? data.events.length;
  const deliveryRate = eventTotal ? Math.round((delivered / eventTotal) * 100) : 0;
  const pendingReconciliation = global?.weighings_pending ?? data.weighings.filter((item) => !["VINCULADA", "NAO_APLICAVEL"].includes(item.reconciliation_status)).length;
  const statusGroups = ["PENDENTE", "EM_PESAGEM", "CONCLUIDA", "ENTREGUE"].map((status) => ({ status, total: data.orders.filter((item) => item.status === status).length }));
  const maxStatus = Math.max(1, ...statusGroups.map((item) => item.total));
  const recentEvents = data.events.slice(0, 5);
  const clientSystems = global?.client_systems ?? data.clients.map((client) => ({ client_id: client.client_id, nome: client.nome, account_name: "Tenant atual", status: client.status, scopes: client.scopes, last_used_at: client.last_used_at, created_at: client.created_at }));
  const accountStatuses = Object.entries(global?.accounts_by_status ?? {}).filter(([, total]) => total > 0);
  return (
    <div className="space-y-6">
      <PageHeader
        title="Dashboard gerencial"
        description={global ? "Indicadores consolidados de toda a plataforma." : "Indicadores de operação, pesagem e saúde das integrações."}
        breadcrumbs={[{ label: "Operação hoje" }]}
        icon={<Gauge className="size-6" />}
        actions={<Button variant="outline" size="sm" onClick={onRefresh} disabled={loading}><RefreshCw className={loading ? "animate-spin" : ""} size={14} /> Atualizar</Button>}
      />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
        <ManagementMetric label={global ? "Ordens em toda a plataforma" : "Ordens no período carregado"} value={global?.orders_total ?? data.orders.length} detail={`${global?.orders_open ?? pending} em aberto`} icon={<ClipboardList size={18} />} tone="blue" />
        <ManagementMetric label="Taxa de conclusão" value={`${completionRate}%`} detail={`${completed} concluídas`} icon={<TrendingUp size={18} />} tone="green" />
        <ManagementMetric label="Pesagens registradas" value={global?.weighings_total ?? data.weighings.length} detail={`${pendingReconciliation} aguardando reconciliação`} icon={<Gauge size={18} />} tone={pendingReconciliation ? "amber" : "green"} />
        <ManagementMetric label="Entrega de eventos" value={`${deliveryRate}%`} detail={`${global?.events_pending ?? data.events.filter((item) => item.status !== "ENTREGUE").length} pendentes/falhos`} icon={<Server size={18} />} tone={deliveryRate < 90 && eventTotal ? "red" : "green"} />
        <ManagementMetric label="Clientes consumidores" value={global?.clients_total ?? data.clients.length} detail="Integrações cadastradas" icon={<Boxes size={18} />} tone="blue" />
        <ManagementMetric label="API Keys ativas" value={global?.api_keys_active ?? data.clients.filter((item) => item.status === "ATIVO").length} detail={global ? "Em toda a plataforma" : `${data.clients.filter((item) => item.status !== "ATIVO").length} inativas/revogadas`} icon={<KeyRound size={18} />} tone="green" />
      </div>
      {global && <Card><CardHeader><CardTitle>Contas por situação</CardTitle><CardDescription>{global.accounts_total} conta(s) cadastrada(s) em toda a plataforma.</CardDescription></CardHeader><CardContent className="flex flex-wrap gap-3">{accountStatuses.map(([status, total]) => <div className="flex min-w-36 items-center justify-between gap-4 rounded-md border bg-muted/30 px-4 py-3" key={status}><span className="text-sm">{statusLabel(status)}</span><strong className="text-lg">{total}</strong></div>)}</CardContent></Card>}
      <div className="grid gap-6 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <CardHeader><CardTitle>Funil de ordens</CardTitle><CardDescription>Distribuição dos registros carregados por status.</CardDescription></CardHeader>
          <CardContent className="space-y-5">{statusGroups.map((item) => <div className="space-y-2" key={item.status}><div className="flex items-center justify-between text-sm"><span>{statusLabel(item.status)}</span><strong>{item.total}</strong></div><div className="h-2 overflow-hidden rounded-full bg-muted"><div className={`h-full rounded-full ${item.status === "CONCLUIDA" ? "bg-emerald-500" : item.status === "PENDENTE" ? "bg-amber-500" : "bg-primary"}`} style={{ width: `${Math.max(item.total ? 8 : 0, (item.total / maxStatus) * 100)}%` }} /></div></div>)}{!data.orders.length && <p className="text-sm text-muted-foreground">Ainda não há ordens para compor os indicadores.</p>}</CardContent>
        </Card>
        <Card className="lg:col-span-2">
          <CardHeader><CardTitle>Saúde operacional</CardTitle><CardDescription>Itens que merecem atenção da gestão.</CardDescription></CardHeader>
          <CardContent className="space-y-4"><ManagementHealth icon={<Wifi size={16} />} label="Estações ativas" value={`${global?.stations_active ?? data.stations.filter((item) => item.status === "ATIVA").length}/${global?.stations_total ?? data.stations.length}`} warning={global ? global.stations_active < global.stations_total : data.stations.some((item) => item.status !== "ATIVA")} /><ManagementHealth icon={<Timer size={16} />} label="Reconciliações pendentes" value={pendingReconciliation} warning={pendingReconciliation > 0} /><ManagementHealth icon={<AlertTriangle size={16} />} label="Eventos com atenção" value={global?.events_pending ?? data.events.filter((item) => item.status !== "ENTREGUE").length} warning={global ? global.events_pending > 0 : data.events.some((item) => item.status !== "ENTREGUE")} /><ManagementHealth icon={<CheckCircle2 size={16} />} label="Operadores ativos" value={global?.operators_active ?? data.operators.filter((item) => item.status === "ATIVO").length} warning={false} /></CardContent>
        </Card>
      </div>
      <div className="grid gap-6 lg:grid-cols-5"><Card className="lg:col-span-3"><CardHeader><CardTitle>Ordens recentes</CardTitle><CardDescription>Últimos registros recebidos pelo serviço.</CardDescription></CardHeader><CardContent><OrderTable orders={data.orders.slice(0, 6)} hideExport /></CardContent></Card><Card className="lg:col-span-2"><CardHeader><CardTitle>Sistemas clientes e API Keys</CardTitle><CardDescription>{global ? "Integrações consolidadas de toda a plataforma." : "Resumo das credenciais consumidoras."}</CardDescription></CardHeader><CardContent className="space-y-4"><ManagementHealth icon={<Boxes size={16} />} label="Sistemas clientes" value={global?.clients_total ?? data.clients.length} warning={false} /><ManagementHealth icon={<KeyRound size={16} />} label="API Keys ativas" value={global?.api_keys_active ?? data.clients.filter((item) => item.status === "ATIVO").length} warning={false} /><div className="border-t pt-3">{clientSystems.slice(0, 5).map((client) => <div className="flex items-center gap-3 py-2" key={client.client_id}><div className="rounded-md bg-muted p-2"><KeyRound size={14} /></div><div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{client.nome}</p><p className="truncate text-xs text-muted-foreground">{client.account_name} · {client.client_id}</p><p className="text-xs text-muted-foreground">Último uso: {formatDate(client.last_used_at)}</p></div><Badge value={client.status} /></div>)}{!clientSystems.length && <p className="text-sm text-muted-foreground">Nenhum sistema cliente cadastrado.</p>}</div></CardContent></Card></div>
    </div>
  );
}
function ManagementMetric({ label, value, detail, icon, tone }: { label: string; value: number | string; detail: string; icon: React.ReactNode; tone: "blue" | "green" | "amber" | "red" }) {
  const colors = { blue: "bg-blue-50 text-blue-700", green: "bg-emerald-50 text-emerald-700", amber: "bg-amber-50 text-amber-700", red: "bg-red-50 text-red-700" };
  return <Card><CardContent className="p-5"><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-medium text-muted-foreground">{label}</p><p className="mt-2 text-3xl font-semibold tracking-tight">{value}</p><p className="mt-1 text-xs text-muted-foreground">{detail}</p></div><div className={`rounded-lg p-2.5 ${colors[tone]}`}>{icon}</div></div></CardContent></Card>;
}
function ManagementHealth({ icon, label, value, warning }: { icon: React.ReactNode; label: string; value: number | string; warning: boolean }) { return <div className="flex items-center gap-3"><div className={`rounded-md p-2 ${warning ? "bg-amber-100 text-amber-700" : "bg-emerald-100 text-emerald-700"}`}>{icon}</div><span className="flex-1 text-sm">{label}</span><strong className={warning ? "text-amber-700" : "text-emerald-700"}>{value}</strong></div>; }
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

function DataView({ view, data, session, loading, onRefresh, onError }: { view: View; data: BackofficeData; session: Session; loading: boolean; onRefresh: () => void; onError: (value: string | null) => void }) {
  if (view === "accounts") return <PlatformAccountsPanel session={session} />;
  if (view === "settings") return <div className="space-y-6"><PageHeader title="Configurações da plataforma" description="Gerencie os serviços e parâmetros globais da Plataforma Balança." breadcrumbs={[{ label: "Administração" }]} icon={<Mail className="size-6" />} /><PlatformEmailSettingsPanel session={session} /></div>;
  if (view === "weighings") return <WeighingPanel session={session} />;
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
      {view === "clients" && <ClientPanel clients={data.clients} session={session} onRefresh={onRefresh} />}
      {view === "orders" && <OrderTable orders={data.orders} />}
      {view === "stations" && <StationPanel stations={data.stations} accounts={data.accounts} session={session} onRefresh={onRefresh} onError={onError} />}
      {view === "operators" && <OperatorPanel operators={data.operators} session={session} onRefresh={onRefresh} onError={onError} />}
      {view === "events" && <EventTable events={data.events} session={session} onRefresh={onRefresh} />}
    </div>
  );
}

function PlatformAccountsPanel({ session }: { session: Session }) {
  const [accounts, setAccounts] = useState<PlatformAccount[]>([]); const [selected, setSelected] = useState<PlatformAccount | null>(null); const [editing, setEditing] = useState<PlatformAccount | null>(null); const [name, setName] = useState(""); const [status, setStatus] = useState("ATIVA"); const [loading, setLoading] = useState(true); const [busy, setBusy] = useState(false);
  async function load() { setLoading(true); try { setAccounts(await getPlatformAccounts(session)); } catch (cause) { toast.error(cause instanceof Error ? cause.message : "Falha ao carregar clientes da plataforma."); } finally { setLoading(false); } }
  useEffect(() => { void load(); }, [session]);
  function edit(account: PlatformAccount) { setEditing(account); setName(account.nome); setStatus(account.status); }
  async function save(event: React.FormEvent) { event.preventDefault(); if (!editing) return; setBusy(true); try { const updated = await updatePlatformAccount(session, editing.id, { nome: name.trim(), status }); setAccounts((current) => current.map((item) => item.id === updated.id ? updated : item)); setEditing(null); toast.success("Cliente atualizado com sucesso."); } catch (cause) { toast.error(cause instanceof Error ? cause.message : "Falha ao atualizar cliente."); } finally { setBusy(false); } }
  const columns: ColumnDef<PlatformAccount>[] = [{ id: "nome", header: "Conta", accessorKey: "nome" }, { id: "owner_email", header: "Administrador", cell: (_value, row) => <span>{row.owner_email || "—"}</span> }, { id: "owner_nome", header: "Responsável", cell: (_value, row) => <span>{row.owner_nome || "—"}</span> }, { id: "status", header: "Status", cell: (_value, row) => <Badge value={row.status} /> }, { id: "acoes", header: "Ações", cell: (_value, row) => <div className="flex items-center gap-1"><Button variant="ghost" size="icon-sm" title="Ver gestão da conta" onClick={() => setSelected(row)}><Eye size={14} /></Button><Button variant="ghost" size="icon-sm" title="Editar conta" onClick={() => edit(row)}><Pencil size={14} /></Button></div> }];
  return <div className="space-y-6"><PageHeader title="Contas da plataforma" description="Filtre uma Conta e acompanhe seus indicadores, integrações e operação." breadcrumbs={[{ label: "Administração" }]} icon={<Boxes className="size-6" />} actions={<Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}><RefreshCw className={loading ? "animate-spin" : ""} size={14} /> Atualizar</Button>} /><DataTable columns={columns} data={accounts} searchable searchPlaceholder="Buscar contas..." exportFileName="contas-plataforma" /><Dialog open={Boolean(selected)} onOpenChange={(open) => { if (!open) setSelected(null); }}><DialogContent className="max-w-5xl"><AccountManagementPanel account={selected!} session={session} /></DialogContent></Dialog><Dialog open={Boolean(editing)} onOpenChange={(open) => { if (!open) setEditing(null); }}><DialogContent><DialogHeader><DialogTitle>Editar conta da plataforma</DialogTitle><DialogDescription>Altere o nome da Conta e o status de acesso ao Portal.</DialogDescription></DialogHeader><DialogBody><form id="platform-account-form" onSubmit={save} className="space-y-4"><div className="space-y-1.5"><label className="text-xs font-medium">Nome da conta</label><Input required value={name} onChange={(event) => setName(event.target.value)} /></div><div className="space-y-1.5"><label className="text-xs font-medium">Status</label><select value={status} onChange={(event) => setStatus(event.target.value)} className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm"><option value="ATIVA">Ativa</option><option value="INATIVA">Inativa</option></select></div></form></DialogBody><DialogFooter><Button variant="outline" type="button" onClick={() => setEditing(null)}>Cancelar</Button><Button type="submit" form="platform-account-form" disabled={busy}>{busy ? "Salvando…" : "Salvar alterações"}</Button></DialogFooter></DialogContent></Dialog></div>;
}

function AccountManagementPanel({ account, session }: { account: PlatformAccount; session: Session }) {
  const [dashboard, setDashboard] = useState<AccountDashboard | null>(null); const [loading, setLoading] = useState(true); const [error, setError] = useState<string | null>(null);
  useEffect(() => { setLoading(true); void getAccountDashboard(session, account.id).then(setDashboard).catch((cause) => setError(cause instanceof Error ? cause.message : "Falha ao carregar a Conta.")).finally(() => setLoading(false)); }, [account.id, session]);
  return <Card className="border-primary/30"><CardHeader><CardTitle>Gestão da Conta: {account.nome}</CardTitle><CardDescription>{account.owner_email || "Sem administrador informado"} · {account.tenant_id}</CardDescription></CardHeader><CardContent>{loading ? <div className="grid gap-3 md:grid-cols-4">{[1, 2, 3, 4].map((item) => <div className="h-24 animate-pulse rounded-md bg-muted" key={item} />)}</div> : error ? <p className="text-sm text-destructive">{error}</p> : dashboard && <><div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"><ManagementMetric label="Ordens" value={dashboard.orders_total} detail={`${dashboard.orders_open} em aberto`} icon={<ClipboardList size={18} />} tone="blue" /><ManagementMetric label="Pesagens" value={dashboard.weighings_total} detail={`${dashboard.weighings_pending} aguardando reconciliação`} icon={<Gauge size={18} />} tone={dashboard.weighings_pending ? "amber" : "green"} /><ManagementMetric label="Estações" value={`${dashboard.stations_active}/${dashboard.stations_total}`} detail="ativas" icon={<Wifi size={18} />} tone={dashboard.stations_active === dashboard.stations_total ? "green" : "amber"} /><ManagementMetric label="Integrações" value={dashboard.clients_total} detail={`${dashboard.api_keys_active} API Keys ativas`} icon={<KeyRound size={18} />} tone="blue" /></div><div className="mt-4 grid gap-4 md:grid-cols-3"><ManagementHealth icon={<Users size={16} />} label="Operadores ativos" value={dashboard.operators_active} warning={false} /><ManagementHealth icon={<Server size={16} />} label="Eventos pendentes" value={dashboard.events_pending} warning={dashboard.events_pending > 0} /><ManagementHealth icon={<Activity size={16} />} label="Sistemas consumidores" value={dashboard.client_systems.length} warning={false} /></div></>}</CardContent></Card>;
}

function ClientPanel({ clients, session, onRefresh }: { clients: ApiClient[]; session: Session; onRefresh: () => void }) {
  const [name, setName] = useState(""); const [scopes, setScopes] = useState<string[]>(["orders:write", "events:read"]); const [expires, setExpires] = useState(""); const [createOpen, setCreateOpen] = useState(false); const [credential, setCredential] = useState<NewCredential | null>(null); const [editing, setEditing] = useState<ApiClient | null>(null); const [editName, setEditName] = useState(""); const [editScopes, setEditScopes] = useState<string[]>([]); const [editExpires, setEditExpires] = useState(""); const [busy, setBusy] = useState(false);
  async function submit(event: React.FormEvent) { event.preventDefault(); setBusy(true); try { const created = await createApiClient(session, { nome: name.trim(), scopes, expires_at: expires ? new Date(`${expires}T23:59:59`).toISOString() : null }); setCredential(created); setName(""); setExpires(""); setCreateOpen(false); onRefresh(); toast.success("Credencial criada com sucesso."); } catch (cause) { toast.error(cause instanceof Error ? cause.message : "Falha ao criar credencial."); } finally { setBusy(false); } }
  async function rotate(clientId: string) { toast.custom((t) => <div className="flex w-full flex-col gap-3 rounded-xl border bg-background p-4 shadow-lg"><div className="flex items-start gap-3"><RotateCcw className="mt-0.5 size-5 text-amber-500 shrink-0" /><div className="flex-1 space-y-1"><p className="text-sm font-semibold">Rotacionar credencial?</p><p className="text-sm text-muted-foreground">O Client Secret atual entrará em transição por 24h e um novo será gerado.</p></div></div><div className="flex justify-end gap-2 border-t pt-3"><Button variant="outline" size="sm" onClick={() => toast.dismiss(t)}>Cancelar</Button><Button size="sm" className="bg-amber-500 text-white hover:bg-amber-600" onClick={async () => { toast.dismiss(t); try { setCredential(await rotateApiClient(session, clientId)); onRefresh(); toast.success("Credencial rotacionada com sucesso."); } catch (cause) { toast.error(cause instanceof Error ? cause.message : "Falha ao rotacionar credencial."); } }}>Rotacionar</Button></div></div>); }
  async function revoke(clientId: string) { toast.custom((t) => <div className="flex w-full flex-col gap-3 rounded-xl border bg-background p-4 shadow-lg"><div className="flex items-start gap-3"><Ban className="mt-0.5 size-5 text-destructive shrink-0" /><div className="flex-1 space-y-1"><p className="text-sm font-semibold">Revogar credencial?</p><p className="text-sm text-muted-foreground">Todas as chamadas que usam esta credencial deixarão de funcionar.</p></div></div><div className="flex justify-end gap-2 border-t pt-3"><Button variant="outline" size="sm" onClick={() => toast.dismiss(t)}>Cancelar</Button><Button variant="destructive" size="sm" onClick={async () => { toast.dismiss(t); try { await revokeApiClient(session, clientId); onRefresh(); toast.success("Credencial revogada."); } catch (cause) { toast.error(cause instanceof Error ? cause.message : "Falha ao revogar credencial."); } }}>Revogar</Button></div></div>); }
  function startEdit(client: ApiClient) { setEditing(client); setEditName(client.nome); setEditScopes(client.scopes); setEditExpires(client.expires_at ? client.expires_at.slice(0, 10) : ""); }
  async function saveEdit(event: React.FormEvent) { event.preventDefault(); if (!editing) return; setBusy(true); try { await updateApiClient(session, editing.client_id, { nome: editName.trim(), scopes: editScopes, expires_at: editExpires ? new Date(`${editExpires}T23:59:59`).toISOString() : null }); setEditing(null); onRefresh(); toast.success("Credencial atualizada com sucesso."); } catch (cause) { toast.error(cause instanceof Error ? cause.message : "Falha ao atualizar credencial."); } finally { setBusy(false); } }

  const columns: ColumnDef<ApiClient>[] = [
    { id: "nome", header: "Nome", accessorKey: "nome" },
    { id: "client_id", header: "Client ID", accessorKey: "client_id" },
    { id: "status", header: "Status", cell: (val, row) => <Badge value={row.status} /> },
    { id: "last_used_at", header: "Último uso", cell: (val, row) => <span className="text-muted-foreground">{formatDate(row.last_used_at)}</span> },
    {
      id: "acoes", header: "Ações", cell: (val, row) => (
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon-sm" onClick={() => startEdit(row)} title="Editar dados permitidos"><Pencil size={14} /></Button>
          <Button variant="ghost" size="icon-sm" onClick={() => void rotate(row.client_id)} title="Resetar/rotacionar segredo"><RotateCcw size={14} /></Button>
          {row.status === "ATIVO" && <Button variant="ghost" size="icon-sm" className="text-destructive hover:bg-destructive hover:text-white" onClick={() => void revoke(row.client_id)} title="Revogar"><Ban size={14} /></Button>}
        </div>
      )
    }
  ];

  return (
    <div className="space-y-8">
      <div><Button onClick={() => setCreateOpen(true)}><Plus size={14} className="mr-2" />Nova credencial API</Button></div>
      <Dialog open={createOpen} onOpenChange={setCreateOpen}><DialogContent className="max-w-2xl p-0"><DialogHeader><DialogTitle>Nova credencial API</DialogTitle><DialogDescription>Defina o nome, os escopos e a expiração da credencial.</DialogDescription></DialogHeader><DialogBody><form id="create-api-client-form" onSubmit={submit} className="space-y-4">
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
        </form></DialogBody><DialogFooter><Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>Cancelar</Button><Button type="submit" form="create-api-client-form" disabled={busy || !scopes.length}>{busy ? "Gerando…" : "Gerar credencial"}</Button></DialogFooter></DialogContent></Dialog>
      <Dialog open={Boolean(editing)} onOpenChange={(open) => { if (!open) setEditing(null); }}>
        <DialogContent className="max-w-2xl p-0">
          <DialogHeader>
            <DialogTitle>Editar credencial</DialogTitle>
            <DialogDescription>Altere somente nome, escopos e data de expiração. Client ID, segredo, status e auditoria não podem ser alterados aqui.</DialogDescription>
          </DialogHeader>
          <DialogBody>
            <form id="edit-api-client-form" onSubmit={saveEdit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5"><label className="text-xs font-medium">Nome</label><Input required value={editName} onChange={(event) => setEditName(event.target.value)} /></div>
                <div className="space-y-1.5"><label className="text-xs font-medium">Expiração opcional</label><Input type="date" value={editExpires} onChange={(event) => setEditExpires(event.target.value)} /></div>
              </div>
              <div className="space-y-1.5"><label className="text-xs font-medium">Escopos</label><div className="flex flex-wrap gap-4">{SCOPES.map(([scope, label]) => <label key={scope} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={editScopes.includes(scope)} onChange={(event) => setEditScopes((current) => event.target.checked ? [...current, scope] : current.filter((item) => item !== scope))} />{label}</label>)}</div></div>
            </form>
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setEditing(null)}>Cancelar</Button>
            <Button type="submit" form="edit-api-client-form" disabled={busy || !editScopes.length}>{busy ? "Salvando…" : "Salvar alterações"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
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

function StationPanel({ stations, accounts, session, onRefresh, onError }: { stations: Station[]; accounts: Account[]; session: Session; onRefresh: () => void; onError: (value: string | null) => void }) {
  const [externalId, setExternalId] = useState(""); const [name, setName] = useState(""); const [accountId, setAccountId] = useState(""); const [createOpen, setCreateOpen] = useState(false); const [busy, setBusy] = useState(false);
  async function submit(event: React.FormEvent) { event.preventDefault(); setBusy(true); try { await createStation(session, { external_id: externalId.trim(), nome: name.trim(), conta_id: accountId }); setExternalId(""); setName(""); setAccountId(""); setCreateOpen(false); onRefresh(); toast.success("Estação criada com sucesso."); } catch (cause) { toast.error(cause instanceof Error ? cause.message : "Falha ao criar estação."); } finally { setBusy(false); } }

  const columns: ColumnDef<Station>[] = [
    { id: "nome", header: "Nome", accessorKey: "nome" },
    { id: "conta_nome", header: "Cliente", cell: (val, row) => <span title={row.conta_id}>{row.conta_nome || "—"}</span> },
    { id: "external_id", header: "Identificador", accessorKey: "external_id", cell: (val, row) => <span className="text-muted-foreground">{row.external_id}</span> },
    { id: "status", header: "Status", cell: (val, row) => <Badge value={row.status} /> },
    { id: "activation_code", header: "Código de ativação", cell: (val, row) => <span className="font-mono text-sm">{row.activation_code || "—"}</span> }
  ];

  return (
    <div className="space-y-8">
      <div><Button onClick={() => setCreateOpen(true)} disabled={!accounts.length}><Plus size={14} className="mr-2" />Nova estação</Button>{!accounts.length && <p className="mt-2 text-xs text-muted-foreground">Nenhum cliente disponível para associação.</p>}</div>
      <Dialog open={createOpen} onOpenChange={setCreateOpen}><DialogContent className="max-w-2xl p-0"><DialogHeader><DialogTitle>Nova estação</DialogTitle><DialogDescription>Associe a estação a um cliente e informe seus dados operacionais.</DialogDescription></DialogHeader><DialogBody><form id="create-station-form" onSubmit={submit} className="space-y-4">
        <div className="space-y-1.5"><label className="text-xs font-medium">Cliente</label><select required value={accountId} onChange={(event) => setAccountId(event.target.value)} className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm"><option value="">Selecione o cliente</option>{accounts.map((account) => <option key={account.id} value={account.id}>{account.nome}</option>)}</select></div>
        <div className="grid grid-cols-2 gap-4"><div className="space-y-1.5"><label className="text-xs font-medium">Identificador externo</label><Input required value={externalId} onChange={(event) => setExternalId(event.target.value)} placeholder="balanca-01" /></div><div className="space-y-1.5"><label className="text-xs font-medium">Nome</label><Input required value={name} onChange={(event) => setName(event.target.value)} placeholder="Balança principal" /></div></div>
      </form></DialogBody><DialogFooter><Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>Cancelar</Button><Button type="submit" form="create-station-form" disabled={busy || !accountId}>{busy ? "Salvando…" : "Cadastrar estação"}</Button></DialogFooter></DialogContent></Dialog>
      <DataTable columns={columns} data={stations} searchable searchPlaceholder="Buscar estações..." exportFileName="estacoes" />
    </div>
  );
}

function OperatorPanel({ operators, session, onRefresh, onError }: { operators: Operator[]; session: Session; onRefresh: () => void; onError: (value: string | null) => void }) {
  const [code, setCode] = useState(""); const [name, setName] = useState(""); const [pin, setPin] = useState(""); const [createOpen, setCreateOpen] = useState(false); const [busy, setBusy] = useState(false);
  async function submit(event: React.FormEvent) { event.preventDefault(); setBusy(true); try { await createOperator(session, { codigo: code.trim(), nome_exibicao: name.trim(), pin }); setCode(""); setName(""); setPin(""); setCreateOpen(false); onRefresh(); toast.success("Operador criado com sucesso."); } catch (cause) { toast.error(cause instanceof Error ? cause.message : "Falha ao criar operador."); } finally { setBusy(false); } }
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
      <div><Button onClick={() => setCreateOpen(true)}><Plus size={14} className="mr-2" />Novo operador</Button></div>
      <Dialog open={createOpen} onOpenChange={setCreateOpen}><DialogContent className="max-w-2xl p-0"><DialogHeader><DialogTitle>Novo operador</DialogTitle><DialogDescription>Cadastre o operador que poderá acessar as estações.</DialogDescription></DialogHeader><DialogBody><form id="create-operator-form" onSubmit={submit} className="space-y-4">
        <div className="space-y-1.5 flex-1 min-w-[150px]"><label className="text-xs font-medium">Código</label><Input required value={code} onChange={(event) => setCode(event.target.value)} placeholder="OP-001" /></div>
        <div className="space-y-1.5 flex-1 min-w-[200px]"><label className="text-xs font-medium">Nome</label><Input required value={name} onChange={(event) => setName(event.target.value)} placeholder="Nome do operador" /></div>
        <div className="space-y-1.5 flex-1 min-w-[150px]"><label className="text-xs font-medium">PIN</label><Input required minLength={4} value={pin} onChange={(event) => setPin(event.target.value)} placeholder="••••" /></div>
        </form></DialogBody><DialogFooter><Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>Cancelar</Button><Button type="submit" form="create-operator-form" disabled={busy}>{busy ? "Salvando…" : "Cadastrar operador"}</Button></DialogFooter></DialogContent></Dialog>
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

function EventTable({ events, session, onRefresh }: { events: Event[]; session: Session; onRefresh: () => void }) {
  const columns: ColumnDef<Event>[] = [
    { id: "event_type", header: "Evento", cell: (val, row) => <div><strong>{row.event_type}</strong><br /><small className="text-muted-foreground">{row.event_version}</small></div> },
    { id: "idempotency_key", header: "Chave", accessorKey: "idempotency_key", cell: (val, row) => <span className="text-muted-foreground font-mono text-xs">{row.idempotency_key}</span> },
    { id: "status", header: "Status", cell: (val, row) => <Badge value={row.status} /> },
    { id: "attempts", header: "Tentativas", accessorKey: "attempts" },
    { id: "next_attempt_at", header: "Próximo retry", cell: (_value, row) => <span className="text-muted-foreground">{row.next_attempt_at ? formatDate(row.next_attempt_at) : row.delivered_at ? `Entregue ${formatDate(row.delivered_at)}` : "Imediato"}</span> },
    { id: "last_error", header: "Último erro", cell: (_value, row) => <span className="max-w-64 truncate text-destructive" title={row.last_error || undefined}>{row.last_error || "—"}</span> },
    { id: "created_at", header: "Criado em", cell: (val, row) => <span className="text-muted-foreground">{formatDate(row.created_at)}</span> },
    { id: "acoes", header: "Ações", cell: (_value, row) => <Button variant="outline" size="sm" onClick={async () => { try { await replayEvent(session, row.id); onRefresh(); toast.success("Evento reenfileirado."); } catch (cause) { toast.error(cause instanceof Error ? cause.message : "Falha ao reenfileirar evento."); } }}>Replay</Button> }
  ];
  return <DataTable columns={columns} data={events} searchable searchPlaceholder="Buscar eventos..." exportFileName="eventos" />;
}

function WeighingPanel({ session }: { session: Session }) {
  const [items, setItems] = useState<Weighing[]>([]);
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Weighing | null>(null);
  const [targetOrder, setTargetOrder] = useState("");
  const [busy, setBusy] = useState(false);

  async function load() {
    setLoading(true);
    try { setItems((await getAdminWeighings(session, status || undefined)).items); }
    catch (cause) { toast.error(cause instanceof Error ? cause.message : "Falha ao carregar pesagens."); }
    finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, [session, status]);

  async function reconcile(nextStatus: string) {
    if (!selected) return;
    setBusy(true);
    try {
      await reconcileAdminWeighing(session, selected.id, { status: nextStatus, ordem_id: targetOrder.trim() || null });
      setSelected(null); setTargetOrder(""); await load();
      toast.success("Reconciliação atualizada.");
    } catch (cause) { toast.error(cause instanceof Error ? cause.message : "Falha ao reconciliar pesagem."); }
    finally { setBusy(false); }
  }

  const columns: ColumnDef<Weighing>[] = [
    { id: "captured_at", header: "Capturada em", cell: (_value, row) => <span className="text-muted-foreground">{formatDate(row.captured_at)}</span> },
    { id: "local_id", header: "ID local", accessorKey: "local_id" },
    { id: "etapa", header: "Etapa", accessorKey: "etapa" },
    { id: "peso_aferido_kg", header: "Peso aferido", cell: (_value, row) => <span>{row.peso_aferido_kg} kg</span> },
    { id: "ordem_id", header: "Ordem", cell: (_value, row) => <span className="font-mono text-xs">{row.ordem_id || "Sem ordem"}</span> },
    { id: "reconciliation_status", header: "Reconciliação", cell: (_value, row) => <Badge value={row.reconciliation_status} /> },
    { id: "acoes", header: "Ações", cell: (_value, row) => <Button variant="outline" size="sm" onClick={() => { setSelected(row); setTargetOrder(row.ordem_id || ""); }}>Reconciliar</Button> },
  ];

  return <div className="space-y-6">
    <div className="flex items-center gap-3">
      <select value={status} onChange={(event) => setStatus(event.target.value)} className="h-9 rounded-md border border-input bg-background px-3 text-sm">
        <option value="">Todas as pesagens</option><option value="NAO_RECONCILIADA">Não reconciliadas</option><option value="PENDENTE_RECONCILIACAO">Pendentes</option><option value="VINCULADA">Vinculadas</option><option value="REJEITADA">Rejeitadas</option>
      </select>
      <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}><RefreshCw className={loading ? "animate-spin" : ""} size={14} /> Atualizar</Button>
    </div>
    <DataTable columns={columns} data={items} searchable searchPlaceholder="Buscar pesagens..." exportFileName="pesagens" />
    <Dialog open={Boolean(selected)} onOpenChange={(open) => { if (!open) setSelected(null); }}>
      <DialogContent>
        <DialogHeader><DialogTitle>Reconciliar pesagem</DialogTitle><DialogDescription>Pesagem {selected?.local_id}. A captura física permanece imutável; altere somente o vínculo operacional.</DialogDescription></DialogHeader>
        <DialogBody className="space-y-4">
          <div className="rounded-md bg-muted p-3 text-sm"><strong>{selected?.peso_aferido_kg} kg</strong> · {selected?.etapa} · {formatDate(selected?.captured_at || null)}</div>
          <div className="space-y-1.5"><label className="text-xs font-medium">ID da ordem existente (opcional)</label><Input value={targetOrder} onChange={(event) => setTargetOrder(event.target.value)} placeholder="UUID da ordem" /></div>
        </DialogBody>
        <DialogFooter className="flex-wrap"><Button variant="outline" onClick={() => setSelected(null)}>Cancelar</Button><Button variant="destructive" disabled={busy} onClick={() => void reconcile("REJEITADA")}>Rejeitar</Button><Button variant="outline" disabled={busy} onClick={() => void reconcile("PENDENTE_RECONCILIACAO")}>Manter pendente</Button><Button disabled={busy || !targetOrder.trim()} onClick={() => void reconcile("VINCULADA")}>Vincular</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  </div>;
}
