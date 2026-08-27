"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ArrowRight, KeyRound, Mail } from "lucide-react";
import { confirmEmail, requestPasswordReset, resetPassword, verifyResetToken } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function ForgotPassword() {
  const [email, setEmail] = useState(""); const [busy, setBusy] = useState(false);
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true); try { toast.success((await requestPasswordReset(email.trim())).message); }
    catch (cause) { toast.error(cause instanceof Error ? cause.message : "Não foi possível solicitar a recuperação."); }
    finally { setBusy(false); }
  }
  return (
    <AuthCard title="Recuperar senha" description="Enviaremos um link de recuperação para o seu e-mail cadastrado.">
      <form onSubmit={submit}>
        <CardContent className="space-y-4 pt-6">
          <div className="space-y-1.5">
            <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">E-mail de cadastro</Label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
              <Input required type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="seu@email.com.br" className="pl-9" />
            </div>
          </div>
          <Button className="w-full flex items-center justify-center gap-2" type="submit" disabled={busy}>
            {busy ? "Enviando…" : "ENVIAR LINK DE RECUPERAÇÃO"}
            <ArrowRight className="size-4" />
          </Button>

          <div className="my-6 flex items-center gap-3">
            <div className="h-px flex-1 bg-border"></div>
            <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">OU</span>
            <div className="h-px flex-1 bg-border"></div>
          </div>
          
          <div className="text-center text-sm text-muted-foreground">
            Lembrou a senha? <a href="/" className="text-primary hover:underline font-medium transition-colors">Voltar para o login</a>
          </div>
        </CardContent>
      </form>
    </AuthCard>
  );
}

export function VerifyEmail() {
  const [token, setToken] = useState("");
  useEffect(() => { setToken(new URLSearchParams(window.location.search).get("token") || ""); }, []);
  useEffect(() => { if (token) void confirmEmail(token).then((value) => toast.success(value.message)).catch((cause) => toast.error(cause instanceof Error ? cause.message : "Token inválido.")); }, [token]);
  return (
    <AuthCard title="Confirmação de e-mail" description="Verificação da sua conta na Plataforma Balança">
      <CardContent className="pt-6">
        <p className="text-sm text-muted-foreground">{token ? "Processando a confirmação…" : "Token de confirmação ausente."}</p>
        <div className="mt-8 text-center text-sm text-muted-foreground">
          <a href="/" className="text-primary hover:underline font-medium transition-colors">Voltar para o login</a>
        </div>
      </CardContent>
    </AuthCard>
  );
}

export function ResetPassword() {
  const [token, setToken] = useState(""); const [email, setEmail] = useState(""); const [valid, setValid] = useState<boolean | null>(null); const [password, setPassword] = useState(""); const [confirmation, setConfirmation] = useState(""); const [busy, setBusy] = useState(false);
  useEffect(() => { const value = new URLSearchParams(window.location.search).get("token") || ""; setToken(value); if (!value) { setValid(false); toast.error("Token de recuperação não encontrado."); return; } void verifyResetToken(value).then((result) => { setValid(result.valido); setEmail(result.email || ""); if (!result.valido) toast.error(result.mensagem || "Token inválido ou expirado."); }).catch((cause) => { setValid(false); toast.error(cause instanceof Error ? cause.message : "Não foi possível validar o link."); }); }, []);
  async function submit(event: React.FormEvent) { event.preventDefault(); if (password !== confirmation) { toast.error("As senhas não coincidem."); return; } setBusy(true); try { toast.success((await resetPassword(token, password)).message); setTimeout(() => { window.location.href = "/"; }, 800); } catch (cause) { toast.error(cause instanceof Error ? cause.message : "Não foi possível redefinir a senha."); } finally { setBusy(false); } }
  
  if (valid === null) return (
    <AuthCard title="Verificando link" description="Estamos validando seu link de recuperação.">
      <CardContent className="pt-6">
        <p className="text-sm text-muted-foreground">Aguarde um momento…</p>
      </CardContent>
    </AuthCard>
  );
  
  if (!valid) return (
    <AuthCard title="Link inválido" description="Este link não é mais válido ou já foi utilizado.">
      <CardContent className="pt-6 space-y-4">
        <Button className="w-full" onClick={() => { window.location.href = "/forgot-password"; }}>Solicitar novo link</Button>
        <div className="text-center text-sm text-muted-foreground">
          <a href="/" className="text-primary hover:underline font-medium transition-colors">Voltar para o login</a>
        </div>
      </CardContent>
    </AuthCard>
  );
  
  return (
    <AuthCard title="Redefinir senha" description={`Crie uma nova senha para ${email}.`}>
      <form onSubmit={submit}>
        <CardContent className="space-y-4 pt-6">
          <div className="space-y-1.5">
            <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Nova senha</Label>
            <Input required minLength={8} autoComplete="new-password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Confirmar nova senha</Label>
            <Input required minLength={8} autoComplete="new-password" type="password" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} />
          </div>
          <Button className="w-full flex items-center justify-center gap-2" type="submit" disabled={busy}>
            {busy ? "Salvando…" : "SALVAR NOVA SENHA"}
            <ArrowRight className="size-4" />
          </Button>
          
          <div className="mt-8 text-center text-sm text-muted-foreground">
            Lembrou a senha? <a href="/" className="text-primary hover:underline font-medium transition-colors">Voltar para o login</a>
          </div>
        </CardContent>
      </form>
    </AuthCard>
  );
}

function AuthCard({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen bg-muted/30">
      <div className="relative hidden flex-1 flex-col justify-center items-center p-12 overflow-hidden lg:flex">
        <div className="absolute inset-0 bg-cover bg-center z-0" style={{ backgroundImage: "url('/login-bg.jpg')" }} />
        <div className="absolute inset-0 bg-primary/80 mix-blend-multiply z-0" />
        <div className="absolute inset-0 bg-gradient-to-t from-primary/95 via-primary/60 to-transparent z-0" />
        <div className="relative z-10 max-w-md space-y-6 text-white text-center flex flex-col items-center">
          <div className="size-24 rounded-full bg-white/10 flex items-center justify-center backdrop-blur-sm border border-white/20 mb-4 shadow-lg">
            <KeyRound className="size-12 text-white" strokeWidth={1.5} />
          </div>
          <div>
            <h2 className="text-4xl font-bold tracking-tight text-white">Recuperação de acesso</h2>
            <p className="mt-4 text-lg text-white/80">Siga as instruções com atenção para gerenciar o acesso à sua conta na plataforma.</p>
          </div>
        </div>
      </div>
      <div className="flex-1 flex items-center justify-center p-6 sm:p-12 bg-background relative z-10 shadow-2xl">
        <Card className="w-full max-w-md shadow-xl border-none">
          <CardHeader>
            <CardTitle className="text-2xl">{title}</CardTitle>
            <CardDescription>{description}</CardDescription>
          </CardHeader>
          {children}
        </Card>
      </div>
    </div>
  );
}
