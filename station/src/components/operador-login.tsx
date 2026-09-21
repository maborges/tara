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
      <main className="flex min-h-screen items-center justify-center p-6 animated-gradient-bg">
        <Card className="w-full max-w-sm glass-panel-heavy border-0">
          <form onSubmit={handleLogin}>
            <CardHeader className="pt-8">
              <div className="mb-4">
                <Button variant="ghost" size="sm" className="h-auto p-0 text-muted-foreground hover:text-foreground hover:bg-transparent" onClick={() => setOperadorId(null)}>
                  &larr; Voltar
                </Button>
              </div>
              <CardTitle className="text-3xl font-bold tracking-tight">Olá, {operador?.nome_exibicao}</CardTitle>
              <CardDescription className="text-base text-foreground/70">Digite seu PIN pessoal para começar a operar.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6 pb-8">
              <Input
                type="password"
                inputMode="numeric"
                autoFocus
                className="text-center text-3xl tracking-[0.5em] h-16 bg-background/50 focus:bg-background transition-colors focus:ring-primary/50"
                value={pin}
                onChange={(e) => setPin(e.target.value)}
                placeholder="••••"
                required
              />
              {erroLogin && (
                <div className="rounded-md bg-destructive/10 p-3 text-sm font-medium text-destructive border border-destructive/20 text-center animate-in fade-in slide-in-from-top-2">
                  {erroLogin}
                </div>
              )}
              <Button
                type="submit"
                className="w-full h-14 text-lg font-bold shadow-lg hover:shadow-primary/25 transition-all active:scale-[0.98] bg-gradient-to-r from-primary to-primary/80 hover:to-primary"
                disabled={entrando || pin.length < 4}
              >
                {entrando ? "Entrando..." : "Entrar na Estação"}
              </Button>
              <button type="button" className="w-full text-sm text-muted-foreground hover:text-foreground transition-colors" onClick={() => { setRecuperando(true); setErroLogin(null); }}>
                Usar credencial de recuperação da estação
              </button>
              {recuperando && <form onSubmit={handleRecovery} className="space-y-3 border-t border-border pt-4 animate-in fade-in slide-in-from-top-2">
                <Input type="password" value={recoverySecret} onChange={(e) => setRecoverySecret(e.target.value)} placeholder="Credencial da estação" required className="h-12 bg-background/50" />
                <Input type="password" value={newPin} onChange={(e) => setNewPin(e.target.value)} placeholder="Nova senha pessoal" minLength={4} required className="h-12 bg-background/50" />
                <Button type="submit" variant="outline" className="w-full h-12 bg-background/50">Redefinir offline</Button>
              </form>}
            </CardContent>
          </form>
        </Card>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center p-6 animated-gradient-bg">
      <Card className="w-full max-w-sm glass-panel-heavy border-0">
        <CardHeader className="pt-8">
          <CardTitle className="text-3xl font-bold tracking-tight">Quem está pesando?</CardTitle>
          <CardDescription className="text-base text-foreground/70">
            Selecione seu nome para iniciar o turno de operação.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5 pb-8">
          {erroLista && (
             <div className="rounded-md bg-destructive/10 p-3 text-sm font-medium text-destructive border border-destructive/20 text-center animate-in fade-in">
               {erroLista}
             </div>
          )}
          {operadores === null && !erroLista && (
            <div className="flex justify-center py-6">
              <div className="animate-pulse-ring size-8 rounded-full border-2 border-primary"></div>
            </div>
          )}
          {operadores?.length === 0 && (
            <p className="text-sm text-muted-foreground text-center bg-background/50 p-4 rounded-lg border border-border">Nenhum operador cadastrado para esta unidade ainda.</p>
          )}

          <ul className="space-y-3">
            {operadores?.map((op) => (
              <li key={op.id}>
                <button
                  className="w-full h-16 px-5 text-left font-semibold text-lg bg-background/50 border border-border/50 rounded-xl hover:bg-card hover:shadow-lg hover:-translate-y-0.5 hover:border-primary/30 transition-all active:scale-[0.98]"
                  onClick={() => setOperadorId(op.id)}
                >
                  {op.nome_exibicao}
                </button>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </main>
  );
}
