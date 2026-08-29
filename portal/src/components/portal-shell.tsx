"use client";

import { useEffect, useState } from "react";
import { Activity, Ban, Check, Copy, KeyRound, LogOut, Mail, Plus, RefreshCw, RotateCcw, ShieldCheck, Sun, Moon } from "lucide-react";
import { authenticate, createApiClient, formatDate, getWebhookDestination, listApiClients, listPortalOrders, listPortalUsers, listPortalWeighings, registerAccount, revokeApiClient, rotateApiClient, saveWebhookDestination, sendApiKeyRecoveryEmail, updatePortalUser, type ApiClient, type NewCredential, type PortalOrder, type PortalUser, type PortalWeighing, type Session, type WebhookDestination } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog } from "@/components/ui/dialog";
import { PageHeader } from "@/components/shared/page-header";
import { SidebarProvider, Sidebar, SidebarContent, SidebarGroup, SidebarGroupLabel, SidebarGroupContent, SidebarMenu, SidebarMenuItem, SidebarMenuButton, SidebarHeader, SidebarFooter, SidebarTrigger } from "@/components/ui/sidebar";
import { UserRound } from "lucide-react";
import { toast } from "sonner";

const SCOPES = [["clients:write", "Registrar clientes consumidores"], ["orders:write", "Criar ordens de pesagem"], ["events:read", "Consultar eventos"], ["stations:activate", "Ativar estações"]] as const;

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
function Field({ label, children }: { label: string; children: React.ReactNode }) { return <div className="space-y-1.5"><Label>{label}</Label>{children}</div>; }

function WebhookPanel({ session }: { session: Session }) {
  const [destination, setDestination] = useState<WebhookDestination | null>(null);
  const [url, setUrl] = useState(""); const [secret, setSecret] = useState(""); const [maxAttempts, setMaxAttempts] = useState(8); const [retryBase, setRetryBase] = useState(2); const [loading, setLoading] = useState(true); const [busy, setBusy] = useState(false); const [error, setError] = useState<string | null>(null);
  async function load() { setLoading(true); try { const value = await getWebhookDestination(session); setDestination(value); setUrl(value.target_url); setMaxAttempts(value.max_attempts); setRetryBase(value.retry_base_seconds); } catch (cause) { if (!(cause instanceof Error && cause.message.includes("404"))) setError(cause instanceof Error ? cause.message : "Falha ao carregar webhook."); } finally { setLoading(false); } }
  useEffect(() => { void load(); }, [session]);
  async function save(event: React.FormEvent<HTMLFormElement>) { event.preventDefault(); setBusy(true); setError(null); try { const value = await saveWebhookDestination(session, { target_url: url.trim(), hmac_secret: secret.trim() || null, event_types: ["balanca.pesagem.concluida.v1"], max_attempts: maxAttempts, retry_base_seconds: retryBase }); setDestination(value); setSecret(""); toast.success("Webhook salvo com segurança."); } catch (cause) { setError(cause instanceof Error ? cause.message : "Falha ao salvar webhook."); } finally { setBusy(false); } }
  return <div className="space-y-6"><PageHeader eyebrow="Portal / Integrações" title="Webhook de pesagens" description="Receba eventos assinados por HMAC no endpoint da sua aplicação." />
    <Card><CardHeader><CardTitle>Destino por Conta</CardTitle><CardDescription>O segredo é armazenado criptografado e nunca é devolvido pela API. Informe-o novamente somente quando quiser substituí-lo.</CardDescription></CardHeader><CardContent>{loading ? <Skeleton className="h-32 w-full" /> : <form className="space-y-4" onSubmit={save}>{error && <div className="rounded-sm border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive">{error}</div>}<Field label="URL HTTPS do consumidor"><Input required type="url" value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://api.exemplo.com/webhooks/tara" /></Field><Field label={destination ? "Novo segredo HMAC (opcional)" : "Segredo HMAC (mínimo de 32 caracteres)"}><Input required={!destination} minLength={destination ? 0 : 32} type="password" value={secret} onChange={(event) => setSecret(event.target.value)} placeholder={destination ? "Deixe vazio para manter o atual" : "segredo compartilhado"} /></Field><div className="grid gap-4 sm:grid-cols-2"><Field label="Máximo de tentativas"><Input required type="number" min={1} max={50} value={maxAttempts} onChange={(event) => setMaxAttempts(Number(event.target.value))} /></Field><Field label="Base do retry (segundos)"><Input required type="number" min={1} max={3600} value={retryBase} onChange={(event) => setRetryBase(Number(event.target.value))} /></Field></div><div className="rounded-md bg-muted p-3 text-sm text-muted-foreground">Evento habilitado: <code>balanca.pesagem.concluida.v1</code>. A assinatura usa HMAC-SHA256 e os headers documentados no guia técnico.</div><div className="flex justify-end"><Button type="submit" disabled={busy || !url.trim()}>{busy ? "Salvando…" : destination ? "Atualizar webhook" : "Configurar webhook"}</Button></div></form>}</CardContent></Card>
  </div>;
}

function PortalActivity({ session }: { session: Session }) {
  const [orders, setOrders] = useState<PortalOrder[]>([]); const [weighings, setWeighings] = useState<PortalWeighing[]>([]); const [loading, setLoading] = useState(true); const [error, setError] = useState<string | null>(null);
  async function load() { setLoading(true); try { const [nextOrders, nextWeighings] = await Promise.all([listPortalOrders(session), listPortalWeighings(session)]); setOrders(nextOrders); setWeighings(nextWeighings); } catch (cause) { setError(cause instanceof Error ? cause.message : "Falha ao carregar atividade."); } finally { setLoading(false); } }
  useEffect(() => { void load(); }, [session]);
  if (loading) return <div className="space-y-3"><Skeleton className="h-24 w-full" /><Skeleton className="h-40 w-full" /></div>;
  return <div className="space-y-6">{error && <div className="rounded-sm border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive">{error}</div>}<div className="flex justify-end"><Button variant="outline" size="sm" onClick={() => void load()}><RefreshCw size={14} /> Atualizar</Button></div><Card><CardHeader><CardTitle>Ordens recentes</CardTitle><CardDescription>{orders.length} ordens encontradas na sua Conta.</CardDescription></CardHeader><CardContent className="p-0"><Table><TableHeader><TableRow><TableHead>Referência</TableHead><TableHead>Tipo</TableHead><TableHead>Status</TableHead><TableHead>Criada em</TableHead></TableRow></TableHeader><TableBody>{orders.slice(0, 50).map((order) => <TableRow key={order.id}><TableCell><strong>{order.referencia_externa}</strong><span className="block text-xs text-muted-foreground">{order.sistema_cliente}</span></TableCell><TableCell>{order.tipo_pesagem}</TableCell><TableCell><Badge variant={order.status === "CONCLUIDA" ? "success" : "secondary"}>{order.status}</Badge></TableCell><TableCell>{formatDate(order.created_at)}</TableCell></TableRow>)}{!orders.length && <TableRow><TableCell colSpan={4} className="py-8 text-center text-muted-foreground">Nenhuma ordem encontrada.</TableCell></TableRow>}</TableBody></Table></CardContent></Card><Card><CardHeader><CardTitle>Pesagens recentes</CardTitle></CardHeader><CardContent className="p-0"><Table><TableHeader><TableRow><TableHead>Capturada em</TableHead><TableHead>ID local</TableHead><TableHead>Peso</TableHead><TableHead>Reconciliação</TableHead></TableRow></TableHeader><TableBody>{weighings.slice(0, 50).map((item) => <TableRow key={item.id}><TableCell>{formatDate(item.captured_at)}</TableCell><TableCell><code className="text-xs">{item.local_id}</code></TableCell><TableCell>{item.peso_aferido_kg} kg</TableCell><TableCell><Badge variant={item.reconciliation_status === "VINCULADA" ? "success" : "secondary"}>{item.reconciliation_status}</Badge></TableCell></TableRow>)}{!weighings.length && <TableRow><TableCell colSpan={4} className="py-8 text-center text-muted-foreground">Nenhuma pesagem encontrada.</TableCell></TableRow>}</TableBody></Table></CardContent></Card></div>;
}

function PortalUsersPanel({ session }: { session: Session }) {
  const [users, setUsers] = useState<PortalUser[]>([]); const [loading, setLoading] = useState(true); const [error, setError] = useState<string | null>(null);
  async function load() { setLoading(true); try { setUsers(await listPortalUsers(session)); } catch (cause) { setError(cause instanceof Error ? cause.message : "Falha ao carregar usuários."); } finally { setLoading(false); } }
  useEffect(() => { void load(); }, [session]);
  async function update(user: PortalUser, value: string) { try { const next = await updatePortalUser(session, user.id, { role: user.role, status: value }); setUsers((current) => current.map((item) => item.id === next.id ? next : item)); toast.success("Usuário atualizado."); } catch (cause) { toast.error(cause instanceof Error ? cause.message : "Falha ao atualizar usuário."); } }
  return <Card><CardHeader><CardTitle>Usuários da Conta</CardTitle><CardDescription>Gerencie o perfil e o acesso das pessoas vinculadas ao Portal.</CardDescription></CardHeader><CardContent className="p-0">{loading ? <div className="p-5"><Skeleton className="h-32 w-full" /></div> : error ? <div className="p-5 text-sm text-destructive">{error}</div> : <Table><TableHeader><TableRow><TableHead>Usuário</TableHead><TableHead>Perfil</TableHead><TableHead>Status</TableHead><TableHead>Cadastro</TableHead></TableRow></TableHeader><TableBody>{users.map((user) => <TableRow key={user.id}><TableCell><strong>{user.nome_exibicao}</strong><span className="block text-xs text-muted-foreground">{user.email}</span></TableCell><TableCell><Badge variant="secondary">{user.role}</Badge></TableCell><TableCell><select value={user.status} onChange={(event) => void update(user, event.target.value)} className="h-8 rounded border bg-background px-2 text-sm"><option value="ATIVO">Ativo</option><option value="INATIVO">Inativo</option></select></TableCell><TableCell>{formatDate(user.created_at)}</TableCell></TableRow>)}{!users.length && <TableRow><TableCell colSpan={4} className="py-8 text-center text-muted-foreground">Nenhum usuário encontrado.</TableCell></TableRow>}</TableBody></Table>}</CardContent></Card>;
}

function Dashboard({ session, onSignOut }: { session: Session; onSignOut: () => void }) {
  const [view, setView] = useState<"api-keys" | "webhook" | "atividade" | "usuarios">("api-keys"); const [clients, setClients] = useState<ApiClient[]>([]); const [credential, setCredential] = useState<NewCredential | null>(null); const [error, setError] = useState<string | null>(null); const [loading, setLoading] = useState(true); const [showForm, setShowForm] = useState(false); const [dark, setDark] = useState(false);
  async function load() { setLoading(true); setError(null); try { setClients(await listApiClients(session)); } catch (cause) { setError(cause instanceof Error ? cause.message : "Falha ao carregar credenciais."); } finally { setLoading(false); } }
  useEffect(() => { void load(); }, []);
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
                    <SidebarMenuButton isActive={view === "webhook"} tooltip="Webhook" onClick={() => setView("webhook")}>
                      <ShieldCheck /> <span>Webhook</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                  <SidebarMenuItem>
                    <SidebarMenuButton isActive={view === "api-keys"} tooltip="API Keys" onClick={() => setView("api-keys")}>
                      <KeyRound /> <span>API Keys</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                  <SidebarMenuItem>
                    <SidebarMenuButton isActive={view === "atividade"} tooltip="Atividade" onClick={() => setView("atividade")}>
                      <Activity /> <span>Atividade</span>
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
            {view === "api-keys" && (
              <div className="space-y-6">
                <PageHeader eyebrow="Portal / Integrações" title="API Keys" description="Administre as credenciais usadas pelos sistemas da sua conta." actions={<Button variant="default" onClick={() => setShowForm(true)}><Plus className="size-4 mr-2" /> Nova API Key</Button>} />
                {error && <div className="rounded-sm border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive">{error}</div>}
                <div className="grid gap-4 sm:grid-cols-3">
                  <Metric label="Credenciais" value={clients.length} icon={<KeyRound size={16} />} />
                  <Metric label="Ativas" value={clients.filter((item) => item.status === "ATIVO").length} icon={<ShieldCheck size={16} />} />
                  <Metric label="Última atividade" value={formatDate(clients[0]?.last_used_at || null)} icon={<Activity size={16} />} />
                </div>
                <Card id="api-keys">
                  <CardHeader className="flex flex-row items-center justify-between border-b border-border">
                    <div><CardTitle>Suas API Keys</CardTitle><CardDescription>O segredo é exibido somente na criação ou rotação.</CardDescription></div>
                    <Button variant="ghost" size="icon-sm" title="Atualizar" onClick={() => void load()} disabled={loading}><RefreshCw className={loading ? "animate-spin" : ""} size={16} /></Button>
                  </CardHeader>
                  <CardContent className="p-0">
                    {loading ? <div className="space-y-2 p-5"><Skeleton className="h-8 w-full" /><Skeleton className="h-8 w-full" /><Skeleton className="h-8 w-full" /></div> : clients.length ? <ClientTable clients={clients} session={session} onRefresh={() => void load()} onCredential={setCredential} onError={setError} /> : <EmptyState onCreate={() => setShowForm(true)} />}
                  </CardContent>
                </Card>
              </div>
            )}
            {view === "atividade" && (
              <div className="space-y-6">
                <PageHeader eyebrow="Portal / Integrações" title="Atividade" description="Acompanhe o histórico de atividades da sua conta." />
                <PortalActivity session={session} />
              </div>
            )}
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
    </SidebarProvider>
  );
}
function Metric({ label, value, icon }: { label: string; value: number | string; icon: React.ReactNode }) { return <Card><CardHeader className="flex flex-row items-center justify-between"><CardTitle className="text-sm text-muted-foreground">{label}</CardTitle><span className="text-primary">{icon}</span></CardHeader><CardContent><strong className="text-2xl font-semibold tracking-tight">{value}</strong><p className="mt-1 text-xs text-muted-foreground">Dados da sua conta</p></CardContent></Card>; }
function EmptyState({ onCreate }: { onCreate: () => void }) { return <div className="grid min-h-64 place-items-center gap-2 p-8 text-center"><KeyRound className="size-8 text-primary/50" /><strong className="text-sm">Nenhuma credencial ainda</strong><p className="text-sm text-muted-foreground">Crie uma API Key para conectar seu sistema.</p><Button variant="outline" onClick={onCreate}>Criar primeira chave</Button></div>; }
function ClientTable({ clients, session, onRefresh, onCredential, onError }: { clients: ApiClient[]; session: Session; onRefresh: () => void; onCredential: (value: NewCredential) => void; onError: (value: string) => void }) { return <Table><TableHeader><TableRow><TableHead>Nome</TableHead><TableHead>Client ID</TableHead><TableHead>Escopos</TableHead><TableHead>Status</TableHead><TableHead>Último uso</TableHead><TableHead className="text-right">Ações</TableHead></TableRow></TableHeader><TableBody>{clients.map((client) => <ClientRow key={client.client_id} client={client} session={session} onRefresh={onRefresh} onCredential={onCredential} onError={onError} />)}</TableBody></Table>; }
function ClientRow({ client, session, onRefresh, onCredential, onError }: { client: ApiClient; session: Session; onRefresh: () => void; onCredential: (value: NewCredential) => void; onError: (value: string) => void }) { const [busy, setBusy] = useState(false); async function rotate() { toast.custom((t) => <div className="flex w-full flex-col gap-3 rounded-xl border bg-background p-4 shadow-lg"><div className="flex items-start gap-3"><RotateCcw className="mt-0.5 size-5 text-amber-500 shrink-0" /><div className="flex-1 space-y-1"><p className="text-sm font-semibold">Rotacionar API Key?</p><p className="text-sm text-muted-foreground">O Client Secret atual entrará em transição por 24h e um novo será gerado.</p></div></div><div className="flex justify-end gap-2 border-t pt-3"><Button variant="outline" size="sm" onClick={() => toast.dismiss(t)}>Cancelar</Button><Button size="sm" className="bg-amber-500 text-white hover:bg-amber-600" onClick={async () => { toast.dismiss(t); setBusy(true); try { onCredential(await rotateApiClient(session, client.client_id)); onRefresh(); } catch (cause) { onError(cause instanceof Error ? cause.message : "Falha ao rotacionar."); } finally { setBusy(false); } }}>Rotacionar</Button></div></div>); } async function revoke() { toast.custom((t) => <div className="flex w-full flex-col gap-3 rounded-xl border bg-background p-4 shadow-lg"><div className="flex items-start gap-3"><Ban className="mt-0.5 size-5 text-destructive shrink-0" /><div className="flex-1 space-y-1"><p className="text-sm font-semibold">Revogar API Key?</p><p className="text-sm text-muted-foreground">Todas as chamadas que usam esta credencial deixarão de funcionar.</p></div></div><div className="flex justify-end gap-2 border-t pt-3"><Button variant="outline" size="sm" onClick={() => toast.dismiss(t)}>Cancelar</Button><Button variant="destructive" size="sm" onClick={async () => { toast.dismiss(t); setBusy(true); try { await revokeApiClient(session, client.client_id); onRefresh(); } catch (cause) { onError(cause instanceof Error ? cause.message : "Falha ao revogar."); } finally { setBusy(false); } }}>Revogar</Button></div></div>); } const variant = client.status === "ATIVO" ? "success" : "destructive"; return <TableRow><TableCell><strong className="block font-medium">{client.nome}</strong><span className="text-xs text-muted-foreground">{formatDate(client.created_at)}</span></TableCell><TableCell><code className="text-xs text-muted-foreground">{client.client_id}</code></TableCell><TableCell><div className="flex max-w-56 flex-wrap gap-1">{client.scopes.map((scope) => <Badge key={scope} variant="secondary">{scope}</Badge>)}</div></TableCell><TableCell><Badge variant={variant}>{client.status}</Badge></TableCell><TableCell className="text-muted-foreground">{formatDate(client.last_used_at)}</TableCell><TableCell><div className="flex justify-end gap-1"><Button variant="ghost" size="icon-sm" disabled={busy} title="Resetar/rotacionar segredo" onClick={() => void rotate()}><RotateCcw /></Button>{client.status === "ATIVO" && <Button variant="ghost" size="icon-sm" disabled={busy} title="Revogar" onClick={() => void revoke()}><span className="text-destructive">×</span></Button>}</div></TableCell></TableRow>; }
function CreateKeyDialog({ session, onClose, onCreated, onError }: { session: Session; onClose: () => void; onCreated: (value: NewCredential) => void; onError: (value: string) => void }) { const [name, setName] = useState(""); const [scopes, setScopes] = useState<string[]>(["orders:write", "events:read"]); const [busy, setBusy] = useState(false); async function submit(event: React.FormEvent<HTMLFormElement>) { event.preventDefault(); setBusy(true); try { onCreated(await createApiClient(session, { nome: name.trim(), scopes, expires_at: null })); } catch (cause) { onError(cause instanceof Error ? cause.message : "Falha ao criar API Key."); } finally { setBusy(false); } } return <Dialog title="Conectar um sistema" onClose={onClose}><form className="mt-5 space-y-4" onSubmit={submit}><p className="text-sm text-muted-foreground">Dê um nome que ajude sua equipe a identificar esta integração.</p><Field label="Nome da integração"><Input required value={name} onChange={(event) => setName(event.target.value)} placeholder="ERP produção" /></Field><div className="space-y-2"><strong className="text-sm font-medium">Permissões</strong>{SCOPES.map(([scope, label]) => <label className="flex items-center gap-2 text-sm" key={scope}><input type="checkbox" checked={scopes.includes(scope)} onChange={(event) => setScopes((current) => event.target.checked ? [...current, scope] : current.filter((item) => item !== scope))} />{label}</label>)}</div><div className="flex justify-end gap-2"><Button variant="outline" onClick={onClose}>Cancelar</Button><Button variant="default" type="submit" disabled={busy || !scopes.length}>{busy ? "Gerando…" : "Gerar API Key"}</Button></div></form></Dialog>; }
function CredentialDialog({ credential, onClose }: { credential: NewCredential; onClose: () => void }) { const [copied, setCopied] = useState(false); async function copy() { await navigator.clipboard.writeText(`TARA_CLIENT_ID=${credential.client_id}\nTARA_CLIENT_SECRET=${credential.client_secret}`); setCopied(true); } return <Dialog title="Credencial pronta" onClose={onClose}><div className="mt-5 space-y-4"><div className="flex items-center gap-2 text-sm text-primary"><Check className="size-4" /> API Key criada com sucesso</div><p className="text-sm text-muted-foreground">Salve o Client Secret. Por segurança, ele não será exibido novamente.</p><div className="grid gap-2 rounded-sm border border-dashed border-primary/30 bg-primary/5 p-3"><span className="text-xs font-medium text-muted-foreground">Client ID</span><code className="break-all text-xs">{credential.client_id}</code><span className="text-xs font-medium text-muted-foreground">Client Secret</span><code className="break-all text-xs">{credential.client_secret}</code></div><div className="flex justify-end gap-2"><Button variant="outline" onClick={onClose}>Fechar</Button><Button variant="default" onClick={() => void copy()}><Copy />{copied ? "Copiado" : "Copiar credenciais"}</Button></div></div></Dialog>; }
