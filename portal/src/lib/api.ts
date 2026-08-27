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

export interface PortalMe { user_id: string; account_id: string; tenant_id: string; nome_conta: string; nome_exibicao: string; email: string; role: string; }

interface AuthResponse {
  access_token: string;
  expires_in: number;
  email: string;
  nome_exibicao: string;
  account_id: string;
  nome_conta: string;
}

const API_URL = (process.env.NEXT_PUBLIC_BALANCA_API_URL || "http://localhost:8010").replace(/\/$/, "");

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
export async function updatePortalMe(session: Session, payload: { nome_conta: string; nome_exibicao: string }) { return apiFetch<PortalMe>("/v1/portal/me", session, { method: "PUT", body: JSON.stringify(payload) }); }
export async function sendApiKeyRecoveryEmail(session: Session, clientId: string) { return apiFetch<{ message: string }>(`/v1/portal/api-clients/${encodeURIComponent(clientId)}/send-recovery-email`, session, { method: "POST" }); }

export function formatDate(value: string | null): string {
  return value ? new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(value)) : "—";
}
