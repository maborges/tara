import { getSession } from "./db";

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function authHeaders(): Promise<HeadersInit> {
  const session = await getSession();
  if (!session) {
    throw new ApiError(401, "Estação não ativada.");
  }
  return {
    Authorization: `Bearer ${session.device_token}`,
  };
}

export async function apiFetch<T>(path: string, init: RequestInit = {}, authed = true): Promise<T> {
  const headers: HeadersInit = {
    "Content-Type": "application/json",
    ...(authed ? await authHeaders() : {}),
    ...init.headers,
  };

  const response = await fetch(path, { ...init, headers });
  if (!response.ok) {
    const body = await response.json().catch(() => ({ detail: response.statusText }));
    throw new ApiError(response.status, body.detail || "Erro na requisição.");
  }
  return response.json() as Promise<T>;
}

export interface OperadorAtivo {
  id: string;
  nome_exibicao: string;
}

export async function listarOperadoresAtivos(deviceId: string): Promise<OperadorAtivo[]> {
  return apiFetch<OperadorAtivo[]>(`/api/v1/balanca/operadores/ativos?device_id=${deviceId}`);
}

export async function loginOperador(
  deviceId: string,
  operadorId: string,
  pin: string,
): Promise<{ operador_id: string; pessoa_id: string; nome_exibicao: string }> {
  return apiFetch(`/api/v1/balanca/operadores/login?device_id=${deviceId}`, {
    method: "POST",
    body: JSON.stringify({ operador_id: operadorId, pin }),
  });
}

export async function hashLocalCredential(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function ativarDispositivo(params: {
  activation_code: string;
  pin_hash: string;
  device_fingerprint: string;
}) {
  return apiFetch<{
    device_token: string;
    device_id: string;
    tenant_id: string;
    nome: string;
    fazenda_ids: string[];
    expires_at: string;
    recovery_secret?: string;
  }>(
    "/api/v1/balanca/devices/activate",
    { method: "POST", body: JSON.stringify(params) },
    false,
  );
}
