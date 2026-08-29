"use client";

import { useEffect, useState } from "react";
import { apiFetch, getAccounts, getAdminWeighings, getPlatformDashboard, type Account, type ApiClient, type Event, type Operator, type Order, type PlatformDashboard, type Session, type Station, type Weighing } from "@/lib/api";

export type BackofficeData = {
  orders: Order[];
  stations: Station[];
  operators: Operator[];
  events: Event[];
  clients: ApiClient[];
  accounts: Account[];
  weighings: Weighing[];
  platformDashboard: PlatformDashboard | null;
};

const emptyData: BackofficeData = { orders: [], stations: [], operators: [], events: [], clients: [], accounts: [], weighings: [], platformDashboard: null };

export function useBackofficeSession() {
  const [session, setSession] = useState<Session | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [data, setData] = useState<BackofficeData>(emptyData);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    try {
      const saved = window.sessionStorage.getItem("balanca-backoffice-session");
      if (saved) {
        const parsed = JSON.parse(saved) as Session;
        if (parsed.expiresAt && parsed.expiresAt > Date.now()) setSession(parsed);
        else window.sessionStorage.removeItem("balanca-backoffice-session");
      }
    } catch {
      window.sessionStorage.removeItem("balanca-backoffice-session");
    } finally {
      setHydrated(true);
    }
  }, []);

  async function loadData(active: Session) {
    setLoading(true); setError(null);
    try {
      const [orders, stations, operators, events, weighingPage] = await Promise.all([
        active.permissions.includes("backoffice:ordens:gerenciar") ? apiFetch<Order[]>("/v1/orders", active) : Promise.resolve([]),
        active.permissions.includes("backoffice:estacoes:gerenciar") ? apiFetch<Station[]>("/v1/stations", active) : Promise.resolve([]),
        active.permissions.includes("backoffice:operadores:gerenciar") ? apiFetch<Operator[]>("/v1/operators", active) : Promise.resolve([]),
        active.permissions.includes("backoffice:eventos:consultar") ? apiFetch<Event[]>("/v1/admin/events", active) : Promise.resolve([]),
        active.permissions.includes("backoffice:pesagens:consultar") ? getAdminWeighings(active) : Promise.resolve({ items: [], next_cursor: null }),
      ]);
      const clients = active.permissions.includes("backoffice:clientes:gerenciar") ? await apiFetch<ApiClient[]>("/v1/admin/api-clients", active) : [];
      const accounts = active.permissions.includes("backoffice:estacoes:gerenciar") ? await getAccounts(active) : [];
      let platformDashboard: PlatformDashboard | null = null;
      try { platformDashboard = await getPlatformDashboard(active); } catch { /* Usuários tenant-scoped não possuem esse agregado. */ }
      setData({ orders, stations, operators, events, clients, accounts, weighings: weighingPage.items, platformDashboard });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Falha ao carregar dados.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { if (session) void loadData(session); }, [session]);

  function startSession(next: Session) {
    window.sessionStorage.setItem("balanca-backoffice-session", JSON.stringify(next));
    setSession(next);
  }

  function signOut() {
    window.sessionStorage.removeItem("balanca-backoffice-session");
    setSession(null); setData(emptyData);
  }

  return { session, hydrated, data, loading, error, setError, startSession, signOut, loadData };
}
