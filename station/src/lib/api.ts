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
    "X-Tenant-ID": session.tenant_id,
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
  }>(
    "/api/v1/balanca/devices/activate",
    { method: "POST", body: JSON.stringify(params) },
    false,
  );
}
