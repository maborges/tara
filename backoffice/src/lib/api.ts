export type Status = "PENDENTE" | "EM_PESAGEM" | "CONCLUIDA" | "ENTREGUE" | "FALHA" | string;

export interface Session { token: string; tenantId: string; login: string; permissions: string[]; expiresAt: number; }
export interface Order { id: string; sistema_cliente: string; referencia_externa: string; subject_type: string; tipo_pesagem: string; status: Status; peso_liquido_kg: string | number | null; created_at: string; concluida_em: string | null; }
export interface Station { id: string; conta_id: string; conta_nome: string | null; external_id: string; nome: string; activation_code: string | null; status: string; }
export interface Account { id: string; nome: string; status: string; }
export interface PlatformAccount extends Account { tenant_id: string; owner_email: string | null; owner_nome: string | null; }
export interface PlatformClientSystem { client_id: string; nome: string; account_name: string; status: string; scopes: string[]; last_used_at: string | null; created_at: string; }
export interface PlatformDashboard { accounts_total: number; accounts_by_status: Record<string, number>; clients_total: number; api_keys_active: number; orders_total: number; orders_open: number; orders_completed: number; weighings_total: number; weighings_pending: number; stations_total: number; stations_active: number; operators_active: number; events_total: number; events_pending: number; client_systems: PlatformClientSystem[]; }
export interface AccountDashboard extends PlatformDashboard { account_id: string; account_name: string; account_status: string; owner_email: string | null; owner_name: string | null; }
export interface Operator { id: string; codigo: string; nome_exibicao: string; pessoa_ref: string | null; status: string; created_at: string; }
export interface Event { id: string; idempotency_key: string; event_type: string; event_version: string; correlation_id: string; status: string; payload: Record<string, unknown>; attempts: number; created_at: string; updated_at: string; next_attempt_at: string | null; delivered_at: string | null; last_error: string | null; }
export interface Weighing { id: string; ordem_id: string | null; local_id: string; etapa: string; peso_aferido_kg: string | number; peso_informado_kg: string | number | null; peso_tara_kg: string | number | null; captured_via: string; captured_at: string; reconciliation_status: string; direcao_veiculo: string | null; natureza_mercadoria: string | null; tipo_operacao: string | null; contexto: Record<string, unknown>; }
export interface ApiClient { client_id: string; nome: string; scopes: string[]; status: string; expires_at: string | null; created_at: string; last_used_at: string | null; }
export interface NewCredential { client_id: string; client_secret: string; nome: string; scopes: string[]; expires_at: string | null; }
export interface PlatformEmailSettings { enabled: boolean; smtp_host: string | null; smtp_port: number; smtp_username: string | null; smtp_password_configured: boolean; smtp_from: string; smtp_starttls: boolean; smtp_ssl: boolean; }

const API_URL = (process.env.NEXT_PUBLIC_TARA_API_URL || "http://localhost:8010").replace(/\/$/, "");

export async function apiFetch<T>(path: string, session: Session, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.token}`, "X-Tenant-ID": session.tenantId, ...(init.headers || {}) },
    cache: "no-store",
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.detail || `Erro ${response.status} ao consultar a API.`);
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export async function login(loginValue: string, password: string) {
  const response = await fetch(`${API_URL}/v1/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ login: loginValue, password }) });
  if (!response.ok) { const body = await response.json().catch(() => ({})); throw new Error(body.detail || "Não foi possível entrar."); }
  return response.json() as Promise<{ access_token: string; tenant_id: string; permissions: string[]; expires_in: number }>;
}

export async function getPlatformEmailSettings(session: Session) { return apiFetch<PlatformEmailSettings>("/v1/platform/email", session); }
export async function getPlatformAccounts(session: Session) { return apiFetch<PlatformAccount[]>("/v1/platform/accounts", session); }
export async function getPlatformDashboard(session: Session) { return apiFetch<PlatformDashboard>("/v1/platform/dashboard", session); }
export async function getAccountDashboard(session: Session, accountId: string) { return apiFetch<AccountDashboard>(`/v1/platform/accounts/${encodeURIComponent(accountId)}/dashboard`, session); }
export async function updatePlatformAccount(session: Session, accountId: string, payload: { nome: string; status: string }) { return apiFetch<PlatformAccount>(`/v1/platform/accounts/${encodeURIComponent(accountId)}`, session, { method: "PUT", body: JSON.stringify(payload) }); }
export async function savePlatformEmailSettings(session: Session, payload: { enabled: boolean; smtp_host: string | null; smtp_port: number; smtp_username: string | null; smtp_password: string | null; smtp_from: string; smtp_starttls: boolean; smtp_ssl: boolean }) { return apiFetch<PlatformEmailSettings>("/v1/platform/email", session, { method: "PUT", body: JSON.stringify(payload) }); }
export async function testPlatformEmail(session: Session, recipient: string) { return apiFetch<void>("/v1/platform/email/test", session, { method: "POST", body: JSON.stringify({ recipient }) }); }

export async function createApiClient(session: Session, payload: { nome: string; scopes: string[]; expires_at: string | null }) {
  return apiFetch<NewCredential>("/v1/admin/api-clients", session, { method: "POST", body: JSON.stringify(payload) });
}

export async function updateApiClient(session: Session, clientId: string, payload: { nome: string; scopes: string[]; expires_at: string | null }) {
  return apiFetch<ApiClient>(`/v1/admin/api-clients/${encodeURIComponent(clientId)}`, session, { method: "PUT", body: JSON.stringify(payload) });
}

export async function rotateApiClient(session: Session, clientId: string) {
  return apiFetch<NewCredential>(`/v1/admin/api-clients/${encodeURIComponent(clientId)}/rotate`, session, { method: "POST" });
}

export async function revokeApiClient(session: Session, clientId: string) {
  return apiFetch<ApiClient>(`/v1/admin/api-clients/${encodeURIComponent(clientId)}/revoke`, session, { method: "POST" });
}

export async function createStation(session: Session, payload: { external_id: string; nome: string; conta_id: string }) {
  return apiFetch<Station>("/v1/stations", session, { method: "POST", body: JSON.stringify(payload) });
}

export async function getAccounts(session: Session) {
  return apiFetch<Account[]>("/v1/admin/accounts", session);
}

export async function createOperator(session: Session, payload: { codigo: string; nome_exibicao: string; pessoa_ref?: string; pin?: string }) {
  return apiFetch<Operator>("/v1/operators", session, { method: "POST", body: JSON.stringify(payload) });
}

export async function revokeOperator(session: Session, operatorId: string) {
  return apiFetch<Operator>(`/v1/operators/${encodeURIComponent(operatorId)}/revoke`, session, { method: "POST" });
}

export async function getAdminWeighings(session: Session, status?: string) {
  const query = status ? `?status=${encodeURIComponent(status)}` : "";
  return apiFetch<{ items: Weighing[]; next_cursor: string | null }>(`/v1/admin/weighings${query}`, session);
}

export async function reconcileAdminWeighing(session: Session, weighingId: string, payload: { status: string; ordem_id?: string | null }) {
  return apiFetch<Weighing>(`/v1/admin/weighings/${encodeURIComponent(weighingId)}/reconcile`, session, { method: "POST", body: JSON.stringify(payload) });
}

export async function replayEvent(session: Session, eventId: string) {
  return apiFetch<Event>(`/v1/admin/events/${encodeURIComponent(eventId)}/replay`, session, { method: "POST" });
}

export const formatDate = (value: string | null) => value ? new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(value)) : "—";
export const statusLabel = (value: string) => ({ PENDENTE: "Pendente", EM_PESAGEM: "Em pesagem", CONCLUIDA: "Concluída", ENTREGUE: "Entregue", FALHA: "Falha" }[value] || value);
