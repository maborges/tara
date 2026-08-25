"use client";

import { useEffect, useRef, useState } from "react";

export interface LeituraBridge {
  conectado: boolean;
  erro: string | null;
  peso_kg: string | null;
  raw: string | null;
  timestamp: number | null;
  stale: boolean;
  stable: boolean;
}

const LEITURA_VAZIA: LeituraBridge = {
  conectado: false,
  erro: null,
  peso_kg: null,
  raw: null,
  timestamp: null,
  stale: true,
  stable: false,
};

function toWsUrl(bridgeUrl: string, token: string | null): string {
  const wsUrl = bridgeUrl.replace(/^http/, "ws").replace(/\/$/, "") + "/ws/peso";
  if (!token) return wsUrl;
  const url = new URL(wsUrl);
  url.searchParams.set("token", token);
  return url.toString();
}

/**
 * Peso ao vivo da ponte de hardware (balanca-platform/bridge). Prefere WebSocket
 * (push em tempo real); se a conexão cair ou falhar, tenta reconectar sozinho.
 * Sem ponte configurada, retorna sempre "desconectado" — a digitação manual
 * continua sendo o fallback padrão na tela de pesagem.
 */
export function usePesoAoVivo(bridgeUrl: string | null, bridgeToken: string | null): LeituraBridge {
  const [leitura, setLeitura] = useState<LeituraBridge>(LEITURA_VAZIA);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const closedByEffectRef = useRef(false);

  useEffect(() => {
    if (!bridgeUrl) {
      setLeitura(LEITURA_VAZIA);
      return;
    }

    closedByEffectRef.current = false;

    function conectar() {
      if (closedByEffectRef.current || !bridgeUrl) return;
      let ws: WebSocket;
      try {
        ws = new WebSocket(toWsUrl(bridgeUrl, bridgeToken));
      } catch {
        agendarReconexao();
        return;
      }
      wsRef.current = ws;

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data) as LeituraBridge;
          setLeitura(data);
        } catch {
          // frame inválido — ignora, mantém última leitura conhecida
        }
      };
      ws.onclose = () => {
        setLeitura((prev) => ({ ...prev, conectado: false }));
        agendarReconexao();
      };
      ws.onerror = () => {
        ws.close();
      };
    }

    function agendarReconexao() {
      if (closedByEffectRef.current) return;
      reconnectTimerRef.current = setTimeout(conectar, 3000);
    }

    conectar();

    return () => {
      closedByEffectRef.current = true;
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, [bridgeUrl, bridgeToken]);

  return leitura;
}
