export type Status = "PENDENTE" | "EM_PESAGEM" | "CONCLUIDA" | "ENTREGUE" | "FALHA" | string;

export interface Session { token: string; tenantId: string; login: string; permissions: string[]; expiresAt: number; }
export interface Order { id: string; sistema_cliente: string; referencia_externa: string; subject_type: string; tipo_pesagem: string; status: Status; peso_liquido_kg: string | number | null; created_at: string; concluida_em: string | null; }
export interface Station { id: string; external_id: string; nome: string; activation_code: string | null; status: string; }
export interface Operator { id: string; codigo: string; nome_exibicao: string; pessoa_ref: string | null; status: string; created_at: string; }
export interface Event { id: string; idempotency_key: string; event_type: string; event_version: string; correlation_id: string; status: string; payload: Record<string, unknown>; attempts: number; created_at: string; }
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
export async function savePlatformEmailSettings(session: Session, payload: { enabled: boolean; smtp_host: string | null; smtp_port: number; smtp_username: string | null; smtp_password: string | null; smtp_from: string; smtp_starttls: boolean; smtp_ssl: boolean }) { return apiFetch<PlatformEmailSettings>("/v1/platform/email", session, { method: "PUT", body: JSON.stringify(payload) }); }
export async function testPlatformEmail(session: Session, recipient: string) { return apiFetch<void>("/v1/platform/email/test", session, { method: "POST", body: JSON.stringify({ recipient }) }); }

export async function createApiClient(session: Session, payload: { nome: string; scopes: string[]; expires_at: string | null }) {
  return apiFetch<NewCredential>("/v1/admin/api-clients", session, { method: "POST", body: JSON.stringify(payload) });
}

export async function rotateApiClient(session: Session, clientId: string) {
  return apiFetch<NewCredential>(`/v1/admin/api-clients/${encodeURIComponent(clientId)}/rotate`, session, { method: "POST" });
}

export async function revokeApiClient(session: Session, clientId: string) {
  return apiFetch<ApiClient>(`/v1/admin/api-clients/${encodeURIComponent(clientId)}/revoke`, session, { method: "POST" });
}

export async function createStation(session: Session, payload: { external_id: string; nome: string }) {
  return apiFetch<Station>("/v1/stations", session, { method: "POST", body: JSON.stringify(payload) });
}

export async function createOperator(session: Session, payload: { codigo: string; nome_exibicao: string; pessoa_ref?: string; pin?: string }) {
  return apiFetch<Operator>("/v1/operators", session, { method: "POST", body: JSON.stringify(payload) });
}

export async function revokeOperator(session: Session, operatorId: string) {
  return apiFetch<Operator>(`/v1/operators/${encodeURIComponent(operatorId)}/revoke`, session, { method: "POST" });
}

export const formatDate = (value: string | null) => value ? new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(value)) : "—";
export const statusLabel = (value: string) => ({ PENDENTE: "Pendente", EM_PESAGEM: "Em pesagem", CONCLUIDA: "Concluída", ENTREGUE: "Entregue", FALHA: "Falha" }[value] || value);
