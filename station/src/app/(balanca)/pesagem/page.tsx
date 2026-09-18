"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useLiveQuery } from "dexie-react-hooks";
import {
  db,
  getSession,
  clearSession,
  setBridgeConfig,
  etapasFeitas,
  proximaEtapa,
  getOperadorSessao,
  clearOperadorSessao,
  retryFailedSync,
  ETAPA_LABEL,
  ETAPAS_POR_TIPO_PESAGEM,
  type OrdemPendenteLocal,
  type Etapa,
  type AnimalLocal,
} from "@/lib/db";
import { enqueuePesagem } from "@/lib/sync/push";
import { startSyncLoop, runSyncCycle } from "@/lib/sync/trigger";
import { usePesoAoVivo } from "@/lib/bridge/peso-ao-vivo";
import { OperadorLogin } from "@/components/operador-login";
import { downloadContingencyPackage } from "@/lib/contingency";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { PageHeader } from "@/components/shared/page-header";
import { Activity, Gauge } from "lucide-react";

type SubjectType = "VEICULO" | "ANIMAL";

function gerarNumeroTicketLocal(): string {
  const hoje = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  return `BAL-${hoje}-${crypto.randomUUID().slice(0, 6).toUpperCase()}`;
}

export default function PesagemPage() {
  const router = useRouter();

  // Mesmo gate de mount usado em "/": evita ler Dexie antes de hidratar.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const session = useLiveQuery(getSession);
  const operadorSessao = useLiveQuery(getOperadorSessao);
  const ordens = useLiveQuery(
    () => db.ordens.where("status").anyOf(["PENDENTE", "EM_PESAGEM"]).toArray(),
    [],
  );
  const falhasSync = useLiveQuery(() => db.sync_queue.where("status").equals("FAILED").count(), []);

  useEffect(() => {
    if (!mounted || session === undefined) return;
    if (!session) router.replace("/");
  }, [mounted, session, router]);

  useEffect(() => {
    const stop = startSyncLoop();
    return stop;
  }, []);

  const [ordemSelecionadaId, setOrdemSelecionadaId] = useState<string | null>(null);
  const ordemSelecionada = useMemo(
    () => ordens?.find((o) => o.id === ordemSelecionadaId) ?? null,
    [ordens, ordemSelecionadaId],
  );

  const etapasJaFeitas = useLiveQuery(
    () => (ordemSelecionada ? etapasFeitas(ordemSelecionada) : Promise.resolve([] as Etapa[])),
    [ordemSelecionada],
  );

  const [animalSelecionado, setAnimalSelecionado] = useState<AnimalLocal | null>(null);
  const [buscaAnimal, setBuscaAnimal] = useState("");

  const animaisEncontrados = useLiveQuery(
    async () => {
      const termo = buscaAnimal.trim().toLowerCase();
      if (!termo) return [] as AnimalLocal[];
      const todos = await db.animais.toArray();
      return todos
        .filter(
          (a) =>
            a.numero_brinco?.toLowerCase().includes(termo) ||
            a.numero_sisbov?.toLowerCase().includes(termo) ||
            a.nome?.toLowerCase().includes(termo),
        )
        .slice(0, 8);
    },
    [buscaAnimal],
    [] as AnimalLocal[],
  );

  // Fluxo avulso: sem ordem prévia (estação rodando sozinha, ou a ordem do
  // processo ainda não chegou). O operador escolhe o tipo antes de pesar; a
  // ordem "sombra" (origem_tipo=OUTRO) é criada no servidor pelo sync push —
  // fica pendente de reconciliação no apps/web até alguém associar ao processo real.
  // Só suporta UNICA: pesagem em múltiplas etapas exige saber o ID da ordem
  // sombra criada no servidor para anexar a segunda etapa — só disponível
  // depois de sincronizar, o que a captura avulsa (offline) não garante.
  const [avulsaConfig, setAvulsaConfig] = useState<{ subject_type: SubjectType } | null>(null);

  const [pesoAferido, setPesoAferido] = useState("");
  const [pesoInformado, setPesoInformado] = useState("");
  const [placa, setPlaca] = useState("");
  const [ticketOrdemId, setTicketOrdemId] = useState<string | null>(null);
  const [baixandoTicket, setBaixandoTicket] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [mensagem, setMensagem] = useState<string | null>(null);
  const [capturedVia, setCapturedVia] = useState<"MANUAL" | "ELETRONICA">("MANUAL");
  const [leituraBrutaUsada, setLeituraBrutaUsada] = useState<Record<string, unknown> | null>(null);

  const [configPonteAberta, setConfigPonteAberta] = useState(false);
  const [bridgeUrlForm, setBridgeUrlForm] = useState("");
  const [bridgeTokenForm, setBridgeTokenForm] = useState("");

  // Hooks precisam rodar sempre na mesma ordem — usePesoAoVivo antes do early
  // return abaixo, mesmo que `session` ainda não tenha carregado.
  const leituraBalanca = usePesoAoVivo(session?.bridge_url ?? null, session?.bridge_token ?? null);

  if (!mounted || !session || ordens === undefined) return null;

  if (!operadorSessao) {
    return <OperadorLogin deviceId={session.device_id} onLogin={() => window.location.reload()} />;
  }

  const emCaptura = !!ordemSelecionada || !!avulsaConfig;
  const tipoPesagemAtivo = ordemSelecionada?.tipo_pesagem ?? "UNICA";
  const etapaAtual: Etapa | null = ordemSelecionada
    ? proximaEtapa(tipoPesagemAtivo, etapasJaFeitas ?? [])
    : avulsaConfig
      ? "UNICA"
      : null;
  const subjectTypeAtivo = ordemSelecionada?.subject_type ?? avulsaConfig?.subject_type ?? null;
  const origemLabel = ordemSelecionada?.origem_tipo ?? "AVULSA";

  function voltarParaLista() {
    setOrdemSelecionadaId(null);
    setAvulsaConfig(null);
    setPesoAferido("");
    setPesoInformado("");
    setPlaca("");
    setAnimalSelecionado(null);
    setBuscaAnimal("");
    setCapturedVia("MANUAL");
    setLeituraBrutaUsada(null);
  }

  function handlePesoAferidoDigitado(valor: string) {
    setPesoAferido(valor);
    setCapturedVia("MANUAL");
    setLeituraBrutaUsada(null);
    // Peso informado acompanha o aferido por padrão — operador só diverge se
    // o documento (NF/motorista) declarar valor diferente do medido.
    if (pesoInformado === "" || pesoInformado === pesoAferido) setPesoInformado(valor);
  }

  function handleUsarPesoDaBalanca() {
    if (!leituraBalanca.peso_kg) return;
    const valor = leituraBalanca.peso_kg.replace(".", ",");
    setPesoAferido(valor);
    if (pesoInformado === "" || pesoInformado === pesoAferido) setPesoInformado(valor);
    setCapturedVia("ELETRONICA");
    setLeituraBrutaUsada({ raw: leituraBalanca.raw, timestamp: leituraBalanca.timestamp });
  }

  async function handleSalvarConfigPonte(e: React.FormEvent) {
    e.preventDefault();
    await setBridgeConfig(bridgeUrlForm.trim() || null, bridgeTokenForm.trim() || null);
    setConfigPonteAberta(false);
  }

  async function handleBaixarTicket(ordemId: string) {
    setBaixandoTicket(true);
    try {
      const resp = await fetch(
        `/api/v1/balanca/sync/ordens/${ordemId}/pdf?device_id=${session!.device_id}`,
        { headers: { Authorization: `Bearer ${session!.device_token}` } },
      );
      if (!resp.ok) {
        throw new Error(
          resp.status === 404
            ? "Pesagem ainda não sincronizada — tente de novo em instantes."
            : "Falha ao gerar o ticket.",
        );
      }
      const blob = await resp.blob();
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank");
    } catch (err) {
      setMensagem(err instanceof Error ? err.message : "Falha ao gerar o ticket.");
    } finally {
      setBaixandoTicket(false);
    }
  }

  async function handleRegistrarPeso(e: React.FormEvent) {
    e.preventDefault();
    if (!etapaAtual || (!ordemSelecionada && !avulsaConfig)) return;
    if (subjectTypeAtivo === "ANIMAL" && !animalSelecionado) {
      setMensagem("Selecione o animal (brinco/SISBOV) antes de confirmar.");
      return;
    }
    setSalvando(true);
    setMensagem(null);
    const agora = new Date().toISOString();
    const aferidoNum = Number(pesoAferido.replace(",", "."));
    const informadoNum = pesoInformado ? Number(pesoInformado.replace(",", ".")) : aferidoNum;

    try {
      const nowIso = new Date().toISOString();
      const auth = await db.offline_auths.where("expires_at").above(nowIso).first();
      if (!auth) {
        setMensagem("Sem autorizações de captura offline disponíveis. Conecte-se à internet para sincronizar e reabastecer a estação.");
        setSalvando(false);
        return;
      }

      const localId = crypto.randomUUID();
      await db.pesagens.add({
        local_id: localId,
        authorization_id: auth.id,
        authorization_nonce: auth.nonce,
        installation_id: session?.installation_id ?? null,
        device_configuration_id: session?.device_configuration_id ?? null,
        ordem_id: ordemSelecionada?.id ?? null,
        subject_type: ordemSelecionada ? null : avulsaConfig!.subject_type,
        tipo_pesagem: ordemSelecionada ? null : "UNICA",
        etapa: etapaAtual,
        server_id: null,
        numero_ticket: gerarNumeroTicketLocal(),
        peso_informado_kg: informadoNum.toFixed(3),
        peso_aferido_kg: aferidoNum.toFixed(3),
        peso_tara_kg: "0.000",
        captured_via: capturedVia,
        operador_id: operadorSessao?.operador_id ?? null,
        leitura_bruta: leituraBrutaUsada,
        contexto: {},
        placa: placa || null,
        motorista: null,
        animal_id: animalSelecionado?.id ?? null,
        pessoa_id: null,
        operador_pessoa_id: operadorSessao?.pessoa_id ?? null,
        data_pesagem: agora,
        client_created_at: agora,
        client_updated_at: agora,
        synced: 0,
      });
      await db.offline_auths.delete(auth.id);
      await enqueuePesagem(localId);

      if (ordemSelecionada) {
        const restantes = ETAPAS_POR_TIPO_PESAGEM[tipoPesagemAtivo].filter(
          (e) => e !== etapaAtual && !(etapasJaFeitas ?? []).includes(e),
        );
        await db.ordens.update(ordemSelecionada.id, {
          status: restantes.length > 0 ? "EM_PESAGEM" : "CONCLUIDA",
        });
        if (restantes.length === 0) {
          // Ordem concluída — o ticket só fica disponível depois que a
          // pesagem sincronizar (o PDF é montado a partir dos dados no servidor).
          setTicketOrdemId(ordemSelecionada.id);
        }
        if (restantes.length > 0) {
          // Mantém a tela na mesma ordem para capturar a próxima etapa.
          setPesoAferido("");
          setPesoInformado("");
          setCapturedVia("MANUAL");
          setLeituraBrutaUsada(null);
          setMensagem(`Etapa "${ETAPA_LABEL[etapaAtual]}" registrada. Falta: ${ETAPA_LABEL[restantes[0]]}.`);
          void runSyncCycle();
          setSalvando(false);
          return;
        }
      }

      voltarParaLista();
      setMensagem("Pesagem registrada. Sincronizando quando houver conexão.");
      void runSyncCycle();
    } finally {
      setSalvando(false);
    }
  }

  return (
    <main className="min-h-screen p-6 max-w-6xl mx-auto space-y-6">
      <PageHeader
        title={session.nome}
        description={`${operadorSessao.nome_exibicao} · Última sincronização: ${session.last_sync_at ? new Date(session.last_sync_at).toLocaleString("pt-BR") : "nunca"}`}
        breadcrumbs={[{ label: "Operação" }]}
        icon={<Activity className="size-6" />}
        actions={
          <>
            <Button variant="ghost" size="sm" onClick={() => clearOperadorSessao()}>
              Trocar operador
            </Button>
            {falhasSync ? (
              <Button
                variant="destructive" size="sm"
                onClick={async () => {
                  await retryFailedSync();
                  void runSyncCycle();
                }}
              >
                Reprocessar {falhasSync} falha(s)
              </Button>
            ) : null}
            <Button
              variant="outline" size="sm"
              onClick={async () => {
                try {
                  await downloadContingencyPackage();
                  setMensagem("Pacote de contingência exportado para o pendrive.");
                } catch (err) {
                  setMensagem(err instanceof Error ? err.message : "Falha ao exportar contingência.");
                }
              }}
            >
              Exportar contingência
            </Button>
            <div className="flex items-center gap-2 px-2 text-sm text-muted-foreground border-l border-r border-border mx-1">
              <span
                className={`size-2.5 rounded-full ${
                  session.bridge_url && leituraBalanca.conectado && !leituraBalanca.stale
                    ? "bg-secondary"
                    : "bg-muted"
                }`}
              />
              {session.bridge_url
                ? leituraBalanca.conectado && !leituraBalanca.stale
                  ? "Balança conectada"
                  : "Balança offline"
                : "Sem ponte configurada"}
            </div>
            <Button
              variant="outline" size="sm"
              onClick={() => {
                setBridgeUrlForm(session.bridge_url ?? "");
                setBridgeTokenForm(session.bridge_token ?? "");
                setConfigPonteAberta(true);
              }}
            >
              Configurar ponte
            </Button>
            <Button
              variant="ghost" size="sm" className="text-destructive hover:text-destructive hover:bg-destructive/10"
              onClick={async () => {
                await clearSession();
                router.replace("/");
              }}
            >
              Desativar estação
            </Button>
          </>
        }
      />

      {configPonteAberta && (
        <Card className="shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Ponte de hardware (leitura eletrônica)</CardTitle>
            <CardDescription>
              Endereço do serviço balanca-platform/bridge rodando perto do indicador de peso.
              Deixe em branco para usar só a digitação manual.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSalvarConfigPonte} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-sm font-medium">URL da ponte</label>
                <Input
                  placeholder="http://192.168.0.50:8321"
                  value={bridgeUrlForm}
                  onChange={(e) => setBridgeUrlForm(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Token (opcional)</label>
                <Input
                  value={bridgeTokenForm}
                  onChange={(e) => setBridgeTokenForm(e.target.value)}
                />
              </div>
              <div className="flex gap-3 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  className="flex-1"
                  onClick={() => setConfigPonteAberta(false)}
                >
                  Cancelar
                </Button>
                <Button type="submit" className="flex-1">
                  Salvar
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {mensagem && (
        <div className="flex items-center justify-between gap-3 rounded-md border border-secondary/30 bg-secondary/10 p-4 text-sm text-secondary-foreground shadow-sm">
          <p className="font-medium">{mensagem}</p>
          {ticketOrdemId && (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={baixandoTicket}
              onClick={() => handleBaixarTicket(ticketOrdemId)}
            >
              {baixandoTicket ? "Gerando..." : "Baixar ticket"}
            </Button>
          )}
        </div>
      )}

      {!emCaptura ? (
        <section className="space-y-6">
          <div>
            <h2 className="mb-3 text-sm font-bold text-foreground/80 uppercase tracking-wider">Ordens de pesagem pendentes</h2>
            {ordens.length === 0 && <p className="text-sm text-muted-foreground">Nenhuma ordem pendente no momento.</p>}
            <ul className="space-y-3">
              {ordens.map((ordem: OrdemPendenteLocal) => (
                <li key={ordem.id}>
                  <button
                    className="w-full rounded-lg border border-border bg-card p-5 text-left shadow-sm hover:border-primary/50 transition-colors"
                    onClick={() => {
                      setTicketOrdemId(null);
                      setOrdemSelecionadaId(ordem.id);
                    }}
                  >
                    <div className="flex justify-between text-base font-semibold text-foreground">
                      <span>{ordem.origem_tipo}</span>
                      <span className="text-muted-foreground text-sm font-normal">{ordem.subject_type}</span>
                    </div>
                    <div className="text-sm text-muted-foreground mt-1 mb-2">
                      {ordem.tipo_pesagem === "UNICA"
                        ? "Pesagem única"
                        : `Pesagem dupla (${ETAPAS_POR_TIPO_PESAGEM[ordem.tipo_pesagem].map((e) => ETAPA_LABEL[e]).join(" → ")})`}{" "}
                      · <span className="text-secondary-foreground font-medium">{ordem.status}</span>
                    </div>
                    <div className="flex gap-4">
                      {typeof ordem.contexto?.placa === "string" && (
                        <div className="text-sm text-muted-foreground">Placa: <strong className="text-foreground">{ordem.contexto.placa}</strong></div>
                      )}
                      {typeof ordem.contexto?.numero_brinco === "string" && (
                        <div className="text-sm text-muted-foreground">Brinco: <strong className="text-foreground">{ordem.contexto.numero_brinco}</strong></div>
                      )}
                      {ordem.numero_documento_fiscal && (
                        <div className="text-sm text-muted-foreground">NF: <strong className="text-foreground">{ordem.numero_documento_fiscal}</strong></div>
                      )}
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          </div>

          <div className="border-t border-border pt-6 mt-6">
            <p className="mb-3 text-sm text-muted-foreground">
              Sem ordem para esse veículo/animal? Pese assim mesmo — fica disponível para associar ao
              processo depois (tela de reconciliação no painel administrativo).
            </p>
            <Button
              variant="outline"
              className="w-full h-14 border-dashed border-2 text-muted-foreground font-semibold hover:text-foreground hover:border-primary/50"
              onClick={() => setAvulsaConfig({ subject_type: "VEICULO" })}
            >
              Pesagem avulsa (sem ordem)
            </Button>
          </div>
        </section>
      ) : (
        <>
          {avulsaConfig && (
            <Card className="mb-6 shadow-sm border-primary/20 bg-primary/5">
              <CardHeader className="pb-3">
                <Button variant="ghost" size="sm" className="-ml-2 w-fit h-8 text-muted-foreground mb-2" onClick={voltarParaLista}>
                  ← Voltar
                </Button>
                <CardTitle className="text-lg">Pesagem avulsa</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-sm font-semibold">O que está sendo pesado?</label>
                  <select
                    className="flex h-11 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                    value={avulsaConfig.subject_type}
                    onChange={(e) => setAvulsaConfig({ subject_type: e.target.value as SubjectType })}
                  >
                    <option value="VEICULO">Veículo / carga</option>
                    <option value="ANIMAL">Animal</option>
                  </select>
                </div>
                <p className="text-xs text-muted-foreground">
                  Pesagem avulsa só suporta pesagem única — sem ordem prévia não é possível encadear
                  etapas (chegada/saída) offline.
                </p>
              </CardContent>
            </Card>
          )}

          <form onSubmit={handleRegistrarPeso} className="space-y-6 rounded-xl border border-border bg-card p-6 shadow-sm relative">
            {!avulsaConfig && (
              <Button type="button" variant="ghost" size="sm" className="absolute top-4 right-4 text-muted-foreground" onClick={voltarParaLista}>
                ✕ Cancelar
              </Button>
            )}
            <div>
              <h2 className="text-2xl font-bold text-foreground">
                {etapaAtual ? ETAPA_LABEL[etapaAtual] : "Pesagem"} — <span className="text-primary">{origemLabel}</span>
              </h2>
              {ordemSelecionada && (
                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-2 text-sm text-muted-foreground">
                  {ordemSelecionada.numero_documento_fiscal && <span>NF: <strong className="text-foreground">{ordemSelecionada.numero_documento_fiscal}</strong></span>}
                  {ordemSelecionada.tipo_volume && (
                    <span>
                      <strong className="text-foreground">{ordemSelecionada.quantidade_volumes ?? "?"}</strong> × {ordemSelecionada.tipo_volume}
                    </span>
                  )}
                  {ordemSelecionada.data_agendada && (
                    <span>Agendado: <strong className="text-foreground">{new Date(ordemSelecionada.data_agendada).toLocaleString("pt-BR")}</strong></span>
                  )}
                </div>
              )}
            </div>

            {session.bridge_url && (
              <div className="rounded-lg border-2 border-dashed border-border p-4 bg-muted/20">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-muted-foreground mb-1">Leitura ao vivo da balança</p>
                    <p className="text-4xl font-bold tabular-nums text-foreground tracking-tight">
                      {leituraBalanca.peso_kg
                        ? `${Number(leituraBalanca.peso_kg).toLocaleString("pt-BR", { minimumFractionDigits: 3 })} kg`
                        : "—"}
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="default"
                    size="lg"
                    disabled={!leituraBalanca.peso_kg || leituraBalanca.stale || !leituraBalanca.stable || !leituraBalanca.conectado}
                    onClick={handleUsarPesoDaBalanca}
                    className="font-bold text-base h-14 px-6 bg-secondary hover:bg-secondary/90 text-secondary-foreground"
                  >
                    Usar este peso
                  </Button>
                </div>
                {!leituraBalanca.conectado && (
                  <p className="mt-2 text-sm font-medium text-destructive">Ponte offline — digite o peso manualmente.</p>
                )}
                {leituraBalanca.conectado && leituraBalanca.stale && (
                  <p className="mt-2 text-sm font-medium text-amber-600">Leitura antiga — aguardando atualização.</p>
                )}
                {leituraBalanca.conectado && !leituraBalanca.stale && !leituraBalanca.stable && (
                  <p className="mt-2 text-sm font-medium text-amber-600">Aguardando estabilização da leitura...</p>
                )}
              </div>
            )}

            <div className="space-y-2">
              <label className="text-sm font-semibold">Peso aferido (kg)</label>
              <Input
                type="text"
                inputMode="decimal"
                className="w-full h-16 text-3xl font-bold text-center tracking-wider bg-background border-2"
                value={pesoAferido}
                onChange={(e) => handlePesoAferidoDigitado(e.target.value)}
                placeholder="0,000"
                required
                autoFocus
              />
              <p className="text-xs text-muted-foreground text-center mt-2">
                {capturedVia === "ELETRONICA"
                  ? "Preenchido pela leitura da balança — edite para digitar manualmente."
                  : "O que a balança efetivamente mediu."}
              </p>
            </div>

            <div className="space-y-2 pt-4 border-t border-border">
              <label className="text-sm font-semibold">Peso informado (kg)</label>
              <Input
                type="text"
                inputMode="decimal"
                className="w-full h-12 text-xl"
                value={pesoInformado}
                onChange={(e) => setPesoInformado(e.target.value)}
                placeholder="0,000"
              />
              <p className="text-xs text-muted-foreground">
                Valor declarado (nota fiscal/motorista) — só preencha se divergir do peso aferido.
              </p>
            </div>

            {subjectTypeAtivo === "VEICULO" && etapaAtual !== "SAIDA" && etapaAtual !== "POS_DESCARGA" && (
              <div className="space-y-2">
                <label className="text-sm font-semibold">Placa</label>
                <Input
                  className="w-full h-12 uppercase text-lg"
                  value={placa}
                  onChange={(e) => setPlaca(e.target.value)}
                />
              </div>
            )}

            {subjectTypeAtivo === "ANIMAL" && (
              <div className="space-y-2">
                <label className="text-sm font-semibold">Animal (brinco/SISBOV) <span className="text-destructive">*</span></label>
                {animalSelecionado ? (
                  <div className="flex items-center justify-between rounded-md border-2 border-primary/20 bg-primary/5 px-4 py-3">
                    <div>
                      <p className="text-lg font-bold text-foreground">
                        {animalSelecionado.numero_brinco || animalSelecionado.numero_sisbov || animalSelecionado.nome}
                      </p>
                      <p className="text-sm text-muted-foreground font-medium">{animalSelecionado.categoria}</p>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="text-muted-foreground"
                      onClick={() => {
                        setAnimalSelecionado(null);
                        setBuscaAnimal("");
                      }}
                    >
                      Trocar
                    </Button>
                  </div>
                ) : (
                  <>
                    <Input
                      className="w-full h-12 text-base"
                      placeholder="Digite o brinco, SISBOV ou nome..."
                      value={buscaAnimal}
                      onChange={(e) => setBuscaAnimal(e.target.value)}
                    />
                    {buscaAnimal.trim() && (
                      <ul className="divide-y divide-border rounded-md border border-border mt-2 shadow-sm max-h-64 overflow-y-auto">
                        {(animaisEncontrados ?? []).length === 0 && (
                          <li className="p-4 text-sm text-muted-foreground text-center">
                            Nenhum animal encontrado no cache local — sincronize a estação ou digite manualmente
                            via pesagem avulsa.
                          </li>
                        )}
                        {(animaisEncontrados ?? []).map((animal) => (
                          <li key={animal.id}>
                            <button
                              type="button"
                              className="w-full p-4 text-left hover:bg-muted/50 transition-colors"
                              onClick={() => {
                                setAnimalSelecionado(animal);
                                setBuscaAnimal("");
                              }}
                            >
                              <span className="font-bold text-base block text-foreground">
                                {animal.numero_brinco || animal.numero_sisbov || animal.nome}
                              </span>{" "}
                              <span className="text-sm text-muted-foreground font-medium block mt-1">{animal.categoria}</span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </>
                )}
              </div>
            )}

            <Button
              type="submit"
              size="lg"
              disabled={salvando}
              className="w-full h-16 text-xl font-bold shadow-md hover:shadow-lg transition-all"
            >
              {salvando ? "Salvando..." : "Confirmar pesagem"}
            </Button>
          </form>
        </>
      )}
    </main>
  );
}
