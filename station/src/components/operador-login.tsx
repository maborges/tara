"use client";

import { useEffect, useState } from "react";
import { listarOperadoresAtivos, loginOperador, type OperadorAtivo, ApiError } from "@/lib/api";
import { setOperadorSessao } from "@/lib/db";

interface OperadorLoginProps {
  deviceId: string;
  onLogin: () => void;
}

/** Login por PIN pessoal antes de pesar — exige rede (a verificação do PIN é
 * sempre no servidor). Depois de logado, o operador continua pesando
 * normalmente offline até trocar de operador ou desativar a estação. */
export function OperadorLogin({ deviceId, onLogin }: OperadorLoginProps) {
  const [operadores, setOperadores] = useState<OperadorAtivo[] | null>(null);
  const [erroLista, setErroLista] = useState<string | null>(null);
  const [operadorId, setOperadorId] = useState<string | null>(null);
  const [pin, setPin] = useState("");
  const [erroLogin, setErroLogin] = useState<string | null>(null);
  const [entrando, setEntrando] = useState(false);

  useEffect(() => {
    listarOperadoresAtivos(deviceId)
      .then(setOperadores)
      .catch((err) => setErroLista(err instanceof ApiError ? err.message : "Sem conexão para carregar operadores."));
  }, [deviceId]);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    if (!operadorId) return;
    setEntrando(true);
    setErroLogin(null);
    try {
      const resultado = await loginOperador(deviceId, operadorId, pin);
      await setOperadorSessao({
        operador_id: resultado.operador_id,
        pessoa_id: resultado.pessoa_id,
        nome_exibicao: resultado.nome_exibicao,
        logged_at: new Date().toISOString(),
      });
      onLogin();
    } catch (err) {
      setErroLogin(err instanceof ApiError ? err.message : "Falha ao entrar. Verifique a conexão.");
    } finally {
      setEntrando(false);
    }
  }

  if (operadorId) {
    const operador = operadores?.find((o) => o.id === operadorId);
    return (
      <main className="flex min-h-screen items-center justify-center p-6">
        <form onSubmit={handleLogin} className="w-full max-w-sm space-y-4 rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
          <button type="button" className="text-xs text-gray-400 underline" onClick={() => setOperadorId(null)}>
            ← Trocar operador
          </button>
          <h1 className="text-xl font-semibold">Olá, {operador?.nome_exibicao}</h1>
          <p className="text-sm text-gray-500">Digite seu PIN pessoal para começar a pesar.</p>
          <input
            type="password"
            inputMode="numeric"
            autoFocus
            className="w-full rounded border border-gray-300 px-3 py-3 text-2xl tracking-widest text-center"
            value={pin}
            onChange={(e) => setPin(e.target.value)}
            placeholder="••••"
            required
          />
          {erroLogin && <p className="text-sm text-red-600">{erroLogin}</p>}
          <button
            type="submit"
            disabled={entrando || pin.length < 4}
            className="w-full rounded bg-orange-600 py-3 text-lg font-medium text-white disabled:opacity-50"
          >
            {entrando ? "Entrando..." : "Entrar"}
          </button>
        </form>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <div className="w-full max-w-sm space-y-4 rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
        <h1 className="text-xl font-semibold">Quem está pesando?</h1>
        <p className="text-sm text-gray-500">
          Selecione seu nome. Se você não aparecer na lista, peça ao administrador para
          cadastrá-lo em Balança → Operadores.
        </p>

        {erroLista && <p className="text-sm text-red-600">{erroLista}</p>}
        {operadores === null && !erroLista && <p className="text-sm text-gray-400">Carregando...</p>}
        {operadores?.length === 0 && (
          <p className="text-sm text-gray-400">Nenhum operador cadastrado para esta fazenda ainda.</p>
        )}

        <ul className="space-y-2">
          {operadores?.map((op) => (
            <li key={op.id}>
              <button
                className="w-full rounded border border-gray-200 p-3 text-left text-sm font-medium hover:bg-gray-50"
                onClick={() => setOperadorId(op.id)}
              >
                {op.nome_exibicao}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </main>
  );
}
