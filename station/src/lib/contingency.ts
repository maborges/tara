import { db, getSession, type PesagemLocal } from "@/lib/db";

const SCHEMA_VERSION = "balanca.contingency.v2" as const;

interface ContingencyRecord {
  installation_id: string | null;
  device_configuration_id: string | null;
  local_id: string;
  ordem_id: string | null;
  subject_type: "VEICULO" | "ANIMAL" | null;
  tipo_pesagem: string | null;
  etapa: string;
  numero_ticket: string | null;
  peso_informado_kg: string | null;
  peso_aferido_kg: string;
  peso_tara_kg: string | null;
  captured_via: "MANUAL" | "ELETRONICA";
  leitura_bruta: Record<string, unknown> | null;
  data_pesagem: string | null;
  contexto: Record<string, unknown>;
}

interface ContingencyPackage {
  schema_version: typeof SCHEMA_VERSION;
  package_id: string;
  sequence_number: number;
  tenant_id: string;
  station_id: string;
  device_id: string;
  exported_at: string;
  station_public_key: JsonWebKey;
  records: ContingencyRecord[];
  signature: string;
}

function canonicalize(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([key]) => key !== "signature")
      .sort(([left], [right]) => left.localeCompare(right));
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${canonicalize(item)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function base64Url(bytes: ArrayBuffer): string {
  const binary = String.fromCharCode(...new Uint8Array(bytes));
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function getIdentity() {
  const existing = await db.contingency_state.get(1);
  if (existing) return existing;
  const pair = (await crypto.subtle.generateKey(
    { name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"],
  )) as CryptoKeyPair;
  const row = {
    id: 1 as const,
    sequence_number: 0,
    public_jwk: await crypto.subtle.exportKey("jwk", pair.publicKey),
    private_jwk: await crypto.subtle.exportKey("jwk", pair.privateKey),
    created_at: new Date().toISOString(),
  };
  await db.contingency_state.put(row);
  return row;
}

function toRecord(item: PesagemLocal): ContingencyRecord {
  return {
    installation_id: item.installation_id ?? null,
    device_configuration_id: item.device_configuration_id ?? null,
    local_id: item.local_id, ordem_id: item.ordem_id, subject_type: item.subject_type,
    tipo_pesagem: item.tipo_pesagem, etapa: item.etapa, numero_ticket: item.numero_ticket,
    peso_informado_kg: item.peso_informado_kg, peso_aferido_kg: item.peso_aferido_kg ?? "0",
    peso_tara_kg: item.peso_tara_kg, captured_via: item.captured_via,
    leitura_bruta: item.leitura_bruta, data_pesagem: item.data_pesagem,
    contexto: { placa: item.placa, motorista: item.motorista, animal_id: item.animal_id, pessoa_id: item.pessoa_id, operador_pessoa_id: item.operador_pessoa_id },
  };
}

export async function buildContingencyPackage(): Promise<Blob> {
  const session = await getSession();
  if (!session) throw new Error("Estação não ativada.");
  const identity = await getIdentity();
  const records = (await db.pesagens.where("synced").equals(0).toArray()).map(toRecord);
  if (records.length === 0) throw new Error("Não há pesagens pendentes para exportar.");
  const sequence = identity.sequence_number + 1;
  const packageData: Omit<ContingencyPackage, "signature"> = {
    schema_version: SCHEMA_VERSION, package_id: crypto.randomUUID(), sequence_number: sequence,
    tenant_id: session.tenant_id, station_id: session.device_id, device_id: session.device_id,
    exported_at: new Date().toISOString(), station_public_key: identity.public_jwk, records,
  };
  const key = await crypto.subtle.importKey("jwk", identity.private_jwk, { name: "ECDSA", namedCurve: "P-256" }, true, ["sign"]);
  const signature = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, new TextEncoder().encode(canonicalize(packageData)));
  await db.contingency_state.update(1, { sequence_number: sequence });
  return new Blob([JSON.stringify({ ...packageData, signature: base64Url(signature) }, null, 2)], { type: "application/json" });
}

export async function downloadContingencyPackage(): Promise<void> {
  const blob = await buildContingencyPackage();
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `balanca-contingencia-${new Date().toISOString().slice(0, 10)}.balanca.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}
