export interface Session {
  token: string;
  email: string;
  nomeExibicao: string;
  nomeConta: string;
  accountId: string;
  expiresAt: number;
}

export interface ApiClient {
  client_id: string;
  nome: string;
  scopes: string[];
  status: string;
  expires_at: string | null;
  created_at: string;
  last_used_at: string | null;
}

export interface NewCredential {
  client_id: string;
  client_secret: string;
  nome: string;
  scopes: string[];
  expires_at: string | null;
}

export interface ApiClientConfiguration {
  client_id: string;
  account_id: string;
  sistemas_clientes: { sistema_cliente: string; tenant_cliente_id: string; nome_exibicao: string; status: string }[];
}

export interface PortalMe { user_id: string; account_id: string; nome_conta: string; nome_exibicao: string; email: string; role: string; }
export interface WebhookDestination { target_url: string; status: string; event_types: string[]; configured: boolean; updated_at: string; max_attempts: number; retry_base_seconds: number; }
export interface PortalOrder { id: string; sistema_cliente: string; referencia_externa: string; subject_type: string; tipo_pesagem: string; status: string; peso_liquido_kg: string | number | null; created_at: string; concluida_em: string | null; }
export interface PortalWeighing { id: string; ordem_id: string | null; local_id: string; etapa: string; peso_aferido_kg: string | number; captured_at: string; reconciliation_status: string; }
export interface PortalUser { id: string; email: string; nome_exibicao: string; role: string; status: string; created_at: string; }
export interface AccountDashboard { account_id: string; account_name: string; account_status: string; owner_email: string | null; owner_name: string | null; accounts_total: number; accounts_by_status: Record<string, number>; clients_total: number; api_keys_active: number; orders_total: number; orders_open: number; orders_completed: number; weighings_total: number; weighings_pending: number; stations_total: number; stations_active: number; operators_active: number; events_total: number; events_pending: number; client_systems: { client_id: string; nome: string; status: string; last_used_at: string | null }[]; }
export interface PlatformSecuritySettings { session_minutes: number; idle_minutes: number; refresh_enabled: boolean; warning_minutes: number; }

interface AuthResponse {
  access_token: string;
  expires_in: number;
  email: string;
  nome_exibicao: string;
  account_id: string;
  nome_conta: string;
}

const API_URL = (process.env.NEXT_PUBLIC_TARA_API_URL || "http://localhost:8010").replace(/\/$/, "");

async function parseResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const body = await response.json().catch(() => ({} as { detail?: string }));
    throw new Error(body.detail || `Erro ${response.status} na API.`);
  }
  return response.json() as Promise<T>;
}

export async function authenticate(email: string, password: string): Promise<Session> {
  const response = await fetch(`${API_URL}/v1/portal/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ login: email, password }),
  });
  const data = await parseResponse<AuthResponse>(response);
  return toSession(data);
}
export async function refreshSession(session: Session) {
  const data = await apiFetch<AuthResponse>("/v1/portal/auth/refresh", session, { method: "POST" });
  return toSession(data);
}

export async function registerAccount(
  accountName: string,
  name: string,
  email: string,
  password: string,
): Promise<never> {
  const response = await fetch(`${API_URL}/v1/portal/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ nome_conta: accountName, nome_exibicao: name, email, password }),
  });
  const data = await parseResponse<{ message: string; email: string }>(response);
  throw new Error(data.message);
}

export async function requestPasswordReset(email: string) {
  return apiRequest<{ message: string }>("/v1/portal/auth/forgot-password", { email });
}

export async function confirmEmail(token: string) {
  return apiRequest<{ message: string }>("/v1/portal/auth/confirm-email", { token });
}

export async function resetPassword(token: string, password: string) {
  return apiRequest<{ message: string }>("/v1/portal/auth/reset-password", { token, password });
}

export async function verifyResetToken(token: string) {
  return apiRequest<{ valido: boolean; email?: string; expira_em?: string; mensagem?: string }>("/v1/portal/auth/verify-reset-token", { token });
}

async function apiRequest<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  return parseResponse<T>(response);
}

function toSession(data: AuthResponse): Session {
  return {
    token: data.access_token,
    email: data.email,
    nomeExibicao: data.nome_exibicao,
    nomeConta: data.nome_conta,
    accountId: data.account_id,
    expiresAt: Date.now() + data.expires_in * 1000,
  };
}

export async function apiFetch<T>(path: string, session: Session, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.token}`, ...(init.headers || {}) },
    cache: "no-store",
  });
  return parseResponse<T>(response);
}

export async function listApiClients(session: Session) {
  return apiFetch<ApiClient[]>("/v1/portal/api-clients", session);
}

export async function getApiClientConfiguration(session: Session, clientId: string) {
  return apiFetch<ApiClientConfiguration>(`/v1/portal/api-clients/${encodeURIComponent(clientId)}/configuration`, session);
}

export async function createApiClient(session: Session, payload: { nome: string; scopes: string[]; expires_at: string | null }) {
  return apiFetch<NewCredential>("/v1/portal/api-clients", session, { method: "POST", body: JSON.stringify(payload) });
}

export async function rotateApiClient(session: Session, clientId: string) {
  return apiFetch<NewCredential>(`/v1/portal/api-clients/${encodeURIComponent(clientId)}/rotate`, session, { method: "POST" });
}

export async function revokeApiClient(session: Session, clientId: string) {
  return apiFetch<ApiClient>(`/v1/portal/api-clients/${encodeURIComponent(clientId)}/revoke`, session, { method: "POST" });
}

export async function getPortalMe(session: Session) { return apiFetch<PortalMe>("/v1/portal/me", session); }
export async function getPortalDashboard(session: Session) { return apiFetch<AccountDashboard>("/v1/portal/dashboard", session); }
export async function getPortalSessionPolicy(session: Session) { return apiFetch<PlatformSecuritySettings>("/v1/portal/session-policy", session); }
export async function updatePortalMe(session: Session, payload: { nome_conta: string; nome_exibicao: string }) { return apiFetch<PortalMe>("/v1/portal/me", session, { method: "PUT", body: JSON.stringify(payload) }); }
export async function sendApiKeyRecoveryEmail(session: Session, clientId: string) { return apiFetch<{ message: string }>(`/v1/portal/api-clients/${encodeURIComponent(clientId)}/send-recovery-email`, session, { method: "POST" }); }
export async function getWebhookDestination(session: Session) { return apiFetch<WebhookDestination>("/v1/portal/webhook", session); }
export async function saveWebhookDestination(session: Session, payload: { target_url: string; hmac_secret: string | null; event_types: string[]; max_attempts: number; retry_base_seconds: number }) { return apiFetch<WebhookDestination>("/v1/portal/webhook", session, { method: "PUT", body: JSON.stringify(payload) }); }
export async function testWebhookDestination(session: Session) { return apiFetch<{ accepted: boolean; status_code: number | null; message: string }>("/v1/portal/webhook/test", session, { method: "POST" }); }
export async function disableWebhookDestination(session: Session) { return apiFetch<{ message: string }>("/v1/portal/webhook", session, { method: "DELETE" }); }
export async function setWebhookStatus(session: Session, enabled: boolean) { return apiFetch<WebhookDestination>("/v1/portal/webhook/status", session, { method: "PATCH", body: JSON.stringify({ enabled }) }); }
export async function listPortalOrders(session: Session) { return apiFetch<PortalOrder[]>("/v1/portal/orders", session); }
export async function listPortalWeighings(session: Session) { return apiFetch<PortalWeighing[]>("/v1/portal/weighings", session); }
export async function listPortalUsers(session: Session) { return apiFetch<PortalUser[]>("/v1/portal/users", session); }
export async function updatePortalUser(session: Session, userId: string, payload: { role: string; status: string }) { return apiFetch<PortalUser>(`/v1/portal/users/${encodeURIComponent(userId)}`, session, { method: "PUT", body: JSON.stringify(payload) }); }

export function formatDate(value: string | null): string {
  return value ? new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(value)) : "—";
}
