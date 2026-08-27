import Dexie, { type EntityTable } from "dexie";

export type TipoPesagem = "UNICA" | "DUPLA" | "DUPLA_ENTRADA_DESCARGA" | "DUPLA_SAIDA_CARREGAMENTO";
export type Etapa = "UNICA" | "CHEGADA" | "POS_DESCARGA" | "PRE_CARREGAMENTO" | "SAIDA";

// Etapas esperadas por tipo_pesagem, na ordem em que ocorrem — espelha
// balanca.schemas.ETAPAS_POR_TIPO_PESAGEM no backend.
export const ETAPAS_POR_TIPO_PESAGEM: Record<TipoPesagem, Etapa[]> = {
  UNICA: ["UNICA"],
  DUPLA: ["CHEGADA", "SAIDA"],
  DUPLA_ENTRADA_DESCARGA: ["CHEGADA", "POS_DESCARGA"],
  DUPLA_SAIDA_CARREGAMENTO: ["PRE_CARREGAMENTO", "SAIDA"],
};

export const ETAPA_LABEL: Record<Etapa, string> = {
  UNICA: "Pesagem",
  CHEGADA: "Chegada",
  POS_DESCARGA: "Pós-descarga",
  PRE_CARREGAMENTO: "Pré-carregamento",
  SAIDA: "Saída",
};

export interface OrdemPendenteLocal {
  id: string; // UUID do servidor
  origem_tipo: string;
  origem_id: string | null;
  subject_type: "VEICULO" | "ANIMAL";
  tipo_pesagem: TipoPesagem;
  status: "PENDENTE" | "EM_PESAGEM" | "CONCLUIDA" | "CANCELADA";
  contexto: Record<string, unknown>;
  produto_id: string | null;
  produto_tipo: "COMMODITY" | "ALMOXARIFADO" | null;
  tipo_volume: string | null;
  quantidade_volumes: string | null;
  data_agendada: string | null;
  numero_documento_fiscal: string | null;
  // Etapas já registradas no servidor (vindas do último pull) — usado para
  // não repetir uma etapa já feita quando a ordem for reaberta na lista.
  etapas_realizadas: Etapa[];
  created_at: string;
}

export interface PesagemLocal {
  local_id: string; // UUID gerado no dispositivo — chave de idempotência do sync
  // null = pesagem avulsa (sem ordem prévia do módulo cliente): a estação cria
  // uma ordem "sombra" no servidor durante o sync push, ver lib/sync/push.ts.
  ordem_id: string | null;
  // Obrigatórios quando ordem_id é null — o backend precisa saber o que pesou
  // para montar a ordem sombra (ver PesagemService/SyncService no backend).
  subject_type: "VEICULO" | "ANIMAL" | null;
  tipo_pesagem: TipoPesagem | null;
  etapa: Etapa;
  server_id: string | null;
  numero_ticket: string | null;
  // Peso informado (declarado — ex.: NF/motorista) vs aferido (medido pela
  // balança) — propositalmente separados, ver docs/MODULO_BALANCA.md.
  peso_informado_kg: string | null;
  peso_aferido_kg: string | null;
  peso_tara_kg: string | null;
  captured_via: "MANUAL" | "ELETRONICA";
  leitura_bruta: Record<string, unknown> | null;
  placa: string | null;
  motorista: string | null;
  animal_id: string | null;
  pessoa_id: string | null;
  operador_pessoa_id: string | null;
  data_pesagem: string | null;
  client_created_at: string;
  client_updated_at: string;
  synced: 0 | 1; // Dexie não indexa booleans — usar 0/1
}

/** Animal ATIVO da(s) fazenda(s) vinculada(s) ao dispositivo — cache local
 * para autocomplete de brinco/SISBOV offline, vindo do sync pull. */
export interface AnimalLocal {
  id: string;
  numero_brinco: string | null;
  numero_sisbov: string | null;
  nome: string | null;
  categoria: string;
  lote_id: string | null;
  unidade_produtiva_id: string;
}

export type SyncQueueStatus = "PENDING" | "IN_FLIGHT" | "DONE" | "FAILED";

export interface SyncQueueItem {
  id?: number;
  local_id: string;
  entity_type: "pesagem";
  operation: "CREATE";
  server_id: string | null;
  status: SyncQueueStatus;
  attempts: number;
  created_at: string;
}

export interface SessionRow {
  id: 1;
  device_id: string;
  device_token: string;
  tenant_id: string;
  nome: string;
  fazenda_ids: string[];
  expires_at: string;
  last_sync_at: string | null;
  // Ponte de hardware (balanca-platform/bridge) — configurada localmente por
  // estação, não vem do backend. Ex.: "http://192.168.0.50:8321".
  bridge_url: string | null;
  bridge_token: string | null;
}

/** Operador logado na estação (PIN pessoal) — separado de SessionRow porque
 * troca de turno em turno, diferente da ativação da estação em si. */
export interface OperadorSessaoRow {
  id: 1;
  operador_id: string;
  pessoa_id: string | null;
  nome_exibicao: string;
  logged_at: string;
}

export interface ContingencyStateRow {
  id: 1;
  sequence_number: number;
  public_jwk: JsonWebKey;
  private_jwk: JsonWebKey;
  created_at: string;
}

class BalancaDB extends Dexie {
  ordens!: EntityTable<OrdemPendenteLocal, "id">;
  pesagens!: EntityTable<PesagemLocal, "local_id">;
  sync_queue!: EntityTable<SyncQueueItem, "id">;
  session!: EntityTable<SessionRow, "id">;
  operador_sessao!: EntityTable<OperadorSessaoRow, "id">;
  animais!: EntityTable<AnimalLocal, "id">;
  contingency_state!: EntityTable<ContingencyStateRow, "id">;

  constructor() {
    super("TARA_db");
    this.version(1).stores({
      ordens: "id, status, origem_tipo, subject_type",
      pesagens: "local_id, ordem_id, server_id, synced",
      sync_queue: "++id, local_id, status",
      session: "id",
    });
    this.version(2).stores({
      operador_sessao: "id",
    });
    this.version(3).stores({
      animais: "id, numero_brinco, numero_sisbov, lote_id",
    });
    this.version(4).stores({
      contingency_state: "id",
    });
  }
}

export const db = new BalancaDB();

export async function getSession(): Promise<SessionRow | undefined> {
  return db.session.get(1);
}

export async function setSession(row: Omit<SessionRow, "id">): Promise<void> {
  await db.session.put({ id: 1, ...row });
}

export async function clearSession(): Promise<void> {
  await db.session.delete(1);
  await db.operador_sessao.delete(1);
}

export async function setBridgeConfig(bridgeUrl: string | null, bridgeToken: string | null): Promise<void> {
  await db.session.update(1, { bridge_url: bridgeUrl, bridge_token: bridgeToken });
}

export async function getOperadorSessao(): Promise<OperadorSessaoRow | undefined> {
  return db.operador_sessao.get(1);
}

export async function setOperadorSessao(row: Omit<OperadorSessaoRow, "id">): Promise<void> {
  await db.operador_sessao.put({ id: 1, ...row });
}

export async function clearOperadorSessao(): Promise<void> {
  await db.operador_sessao.delete(1);
}

/** Recupera filas interrompidas por fechamento/queda de energia da estação. */
export async function recoverInterruptedSync(): Promise<void> {
  await db.sync_queue.where("status").equals("IN_FLIGHT").modify({ status: "PENDING" });
}

/** Falhas nunca são descartadas: ficam disponíveis para reprocessamento manual. */
export async function retryFailedSync(): Promise<number> {
  return db.sync_queue.where("status").equals("FAILED").modify({ status: "PENDING", attempts: 0 });
}

/** Etapas já feitas para uma ordem, combinando o que veio do servidor
 * (etapas_realizadas) com o que já foi pesado localmente e ainda não sincronizou. */
export async function etapasFeitas(ordem: OrdemPendenteLocal): Promise<Etapa[]> {
  const locais = await db.pesagens.where("ordem_id").equals(ordem.id).toArray();
  const set = new Set<Etapa>([...ordem.etapas_realizadas, ...locais.map((p) => p.etapa)]);
  return Array.from(set);
}

export function proximaEtapa(tipoPesagem: TipoPesagem, feitas: Etapa[]): Etapa | null {
  const esperadas = ETAPAS_POR_TIPO_PESAGEM[tipoPesagem];
  return esperadas.find((e) => !feitas.includes(e)) ?? null;
}
