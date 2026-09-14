"use client";

import { useEffect, useState } from "react";
import { listarOperadoresAtivos, loginOperador, hashLocalCredential, type OperadorAtivo, ApiError } from "@/lib/api";
import { db, getSession, setOperadorSessao, changeOperatorPassword } from "@/lib/db";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  const [recuperando, setRecuperando] = useState(false);
  const [recoverySecret, setRecoverySecret] = useState("");
  const [newPin, setNewPin] = useState("");

  useEffect(() => {
    db.operadores.toArray().then((local) => {
      if (local.length) setOperadores(local.map((item) => ({ id: item.id, nome_exibicao: item.nome_exibicao })));
      else return listarOperadoresAtivos(deviceId).then(setOperadores);
    }).catch((err) => setErroLista(err instanceof ApiError ? err.message : "Sem conexão para carregar operadores."));
  }, [deviceId]);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    if (!operadorId) return;
    setEntrando(true);
    setErroLogin(null);
    try {
      const local = await db.operadores.get(operadorId);
      let resultado: { operador_id: string; pessoa_id: string | null; nome_exibicao: string };
      if (local?.pin_hash && local.status === "ATIVO" && (await hashLocalCredential(pin)) === local.pin_hash) {
        resultado = { operador_id: local.id, pessoa_id: null, nome_exibicao: local.nome_exibicao };
      } else {
        resultado = await loginOperador(deviceId, operadorId, pin);
      }
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

  async function handleRecovery(e: React.FormEvent) {
    e.preventDefault();
    const session = await getSession();
    const local = await db.operadores.get(operadorId!);
    if (!session?.recovery_secret_hash || !local || !newPin) {
      setErroLogin("Recuperação offline indisponível para esta estação.");
      return;
    }
    if ((await hashLocalCredential(recoverySecret)) !== session.recovery_secret_hash) {
      setErroLogin("Credencial de recuperação inválida.");
      return;
    }
    await changeOperatorPassword(local.id, await hashLocalCredential(newPin));
    setPin(newPin);
    setRecuperando(false);
    setRecoverySecret("");
    setNewPin("");
    setErroLogin("Senha redefinida. Entre novamente com a nova senha.");
  }

  if (operadorId) {
    const operador = operadores?.find((o) => o.id === operadorId);
    return (
      <main className="flex min-h-screen items-center justify-center p-6 bg-muted/30">
        <Card className="w-full max-w-sm">
          <form onSubmit={handleLogin}>
            <CardHeader>
              <div className="mb-4">
                <Button variant="ghost" size="sm" className="h-auto p-0 text-muted-foreground hover:text-foreground" onClick={() => setOperadorId(null)}>
                  &larr; Trocar operador
                </Button>
              </div>
              <CardTitle>Olá, {operador?.nome_exibicao}</CardTitle>
              <CardDescription>Digite seu PIN pessoal para começar a pesar.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Input
                type="password"
                inputMode="numeric"
                autoFocus
                className="text-center text-2xl tracking-widest py-6"
                value={pin}
                onChange={(e) => setPin(e.target.value)}
                placeholder="••••"
                required
              />
              {erroLogin && <p className="text-sm font-medium text-destructive">{erroLogin}</p>}
              <Button
                type="submit"
                className="w-full py-6 text-lg"
                disabled={entrando || pin.length < 4}
              >
                {entrando ? "Entrando..." : "Entrar"}
              </Button>
              <button type="button" className="w-full text-sm text-muted-foreground underline" onClick={() => { setRecuperando(true); setErroLogin(null); }}>
                Usar credencial de recuperação da estação
              </button>
              {recuperando && <form onSubmit={handleRecovery} className="space-y-2 border-t pt-3">
                <Input type="password" value={recoverySecret} onChange={(e) => setRecoverySecret(e.target.value)} placeholder="Credencial da estação" required />
                <Input type="password" value={newPin} onChange={(e) => setNewPin(e.target.value)} placeholder="Nova senha pessoal" minLength={4} required />
                <Button type="submit" variant="outline" className="w-full">Redefinir offline</Button>
              </form>}
            </CardContent>
          </form>
        </Card>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center p-6 bg-muted/30">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Quem está pesando?</CardTitle>
          <CardDescription>
            Selecione seu nome. Se você não aparecer na lista, peça ao administrador para cadastrá-lo.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {erroLista && <p className="text-sm font-medium text-destructive">{erroLista}</p>}
          {operadores === null && !erroLista && <p className="text-sm text-muted-foreground">Carregando...</p>}
          {operadores?.length === 0 && (
            <p className="text-sm text-muted-foreground">Nenhum operador cadastrado para esta fazenda ainda.</p>
          )}

          <ul className="space-y-2">
            {operadores?.map((op) => (
              <li key={op.id}>
                <Button
                  variant="outline"
                  className="w-full justify-start font-normal h-12"
                  onClick={() => setOperadorId(op.id)}
                >
                  {op.nome_exibicao}
                </Button>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </main>
  );
}
