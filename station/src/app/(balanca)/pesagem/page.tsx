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
    return <OperadorLogin deviceId={session.device_id} onLogin={() => {}} />;
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
      const localId = crypto.randomUUID();
      await db.pesagens.add({
        local_id: localId,
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
        leitura_bruta: leituraBrutaUsada,
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
    <main className="min-h-screen p-4">
      <header className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold">{session.nome}</h1>
          <p className="text-xs text-gray-500">
            {operadorSessao.nome_exibicao} · Última sincronização:{" "}
            {session.last_sync_at ? new Date(session.last_sync_at).toLocaleString("pt-BR") : "nunca"}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button className="text-xs text-gray-400 underline" onClick={() => clearOperadorSessao()}>
            Trocar operador
          </button>
          {falhasSync ? (
            <button
              className="text-xs text-amber-700 underline"
              onClick={async () => {
                await retryFailedSync();
                void runSyncCycle();
              }}
            >
              Reprocessar {falhasSync} falha(s)
            </button>
          ) : null}
          <button
            className="text-xs text-amber-700 underline"
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
          </button>
          <span className="flex items-center gap-1.5 text-xs text-gray-500">
            <span
              className={`size-2 rounded-full ${
                session.bridge_url && leituraBalanca.conectado && !leituraBalanca.stale
                  ? "bg-emerald-500"
                  : "bg-gray-300"
              }`}
            />
            {session.bridge_url
              ? leituraBalanca.conectado && !leituraBalanca.stale
                ? "Balança conectada"
                : "Balança offline"
              : "Sem ponte configurada"}
          </span>
          <button
            className="text-xs text-gray-400 underline"
            onClick={() => {
              setBridgeUrlForm(session.bridge_url ?? "");
              setBridgeTokenForm(session.bridge_token ?? "");
              setConfigPonteAberta(true);
            }}
          >
            Configurar ponte
          </button>
          <button
            className="text-xs text-gray-400 underline"
            onClick={async () => {
              await clearSession();
              router.replace("/");
            }}
          >
            Desativar estação
          </button>
        </div>
      </header>

      {configPonteAberta && (
        <form
          onSubmit={handleSalvarConfigPonte}
          className="mb-4 space-y-3 rounded border border-gray-200 bg-white p-4 shadow-sm"
        >
          <h2 className="text-sm font-semibold">Ponte de hardware (leitura eletrônica)</h2>
          <p className="text-xs text-gray-400">
            Endereço do serviço balanca-platform/bridge rodando perto do indicador de peso.
            Deixe em branco para usar só a digitação manual.
          </p>
          <div className="space-y-1">
            <label className="text-xs font-medium">URL da ponte</label>
            <input
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
              placeholder="http://192.168.0.50:8321"
              value={bridgeUrlForm}
              onChange={(e) => setBridgeUrlForm(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium">Token (opcional)</label>
            <input
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
              value={bridgeTokenForm}
              onChange={(e) => setBridgeTokenForm(e.target.value)}
            />
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              className="flex-1 rounded border border-gray-300 py-2 text-sm"
              onClick={() => setConfigPonteAberta(false)}
            >
              Cancelar
            </button>
            <button type="submit" className="flex-1 rounded bg-orange-600 py-2 text-sm text-white">
              Salvar
            </button>
          </div>
        </form>
      )}

      {mensagem && (
        <div className="mb-4 flex items-center justify-between gap-3 rounded bg-green-50 p-2 text-sm text-green-700">
          <p>{mensagem}</p>
          {ticketOrdemId && (
            <button
              type="button"
              className="shrink-0 rounded bg-green-600 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
              disabled={baixandoTicket}
              onClick={() => handleBaixarTicket(ticketOrdemId)}
            >
              {baixandoTicket ? "Gerando..." : "Baixar ticket"}
            </button>
          )}
        </div>
      )}

      {!emCaptura ? (
        <section className="space-y-4">
          <div>
            <h2 className="mb-2 text-sm font-medium text-gray-600">Ordens de pesagem pendentes</h2>
            {ordens.length === 0 && <p className="text-sm text-gray-400">Nenhuma ordem pendente no momento.</p>}
            <ul className="space-y-2">
              {ordens.map((ordem: OrdemPendenteLocal) => (
                <li key={ordem.id}>
                  <button
                    className="w-full rounded border border-gray-200 bg-white p-3 text-left shadow-sm"
                    onClick={() => {
                      setTicketOrdemId(null);
                      setOrdemSelecionadaId(ordem.id);
                    }}
                  >
                    <div className="flex justify-between text-sm font-medium">
                      <span>{ordem.origem_tipo}</span>
                      <span className="text-gray-400">{ordem.subject_type}</span>
                    </div>
                    <div className="text-xs text-gray-500">
                      {ordem.tipo_pesagem === "UNICA"
                        ? "Pesagem única"
                        : `Pesagem dupla (${ETAPAS_POR_TIPO_PESAGEM[ordem.tipo_pesagem].map((e) => ETAPA_LABEL[e]).join(" → ")})`}{" "}
                      · {ordem.status}
                    </div>
                    {typeof ordem.contexto?.placa === "string" && (
                      <div className="text-xs text-gray-400">Placa: {ordem.contexto.placa}</div>
                    )}
                    {typeof ordem.contexto?.numero_brinco === "string" && (
                      <div className="text-xs text-gray-400">Brinco: {ordem.contexto.numero_brinco}</div>
                    )}
                    {ordem.numero_documento_fiscal && (
                      <div className="text-xs text-gray-400">NF: {ordem.numero_documento_fiscal}</div>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          </div>

          <div className="border-t border-gray-200 pt-4">
            <p className="mb-2 text-xs text-gray-400">
              Sem ordem para esse veículo/animal? Pese assim mesmo — fica disponível para associar ao
              processo depois (tela de reconciliação no painel administrativo).
            </p>
            <button
              className="w-full rounded border border-dashed border-gray-300 py-3 text-sm font-medium text-gray-600"
              onClick={() => setAvulsaConfig({ subject_type: "VEICULO" })}
            >
              Pesagem avulsa (sem ordem)
            </button>
          </div>
        </section>
      ) : (
        <>
          {avulsaConfig && (
            <div className="mb-4 space-y-3 rounded border border-gray-200 bg-white p-4 shadow-sm">
              <button type="button" className="text-xs text-gray-400 underline" onClick={voltarParaLista}>
                ← Voltar
              </button>
              <h2 className="text-base font-semibold">Pesagem avulsa</h2>

              <div className="space-y-1">
                <label className="text-sm font-medium">O que está sendo pesado?</label>
                <select
                  className="w-full rounded border border-gray-300 px-3 py-2"
                  value={avulsaConfig.subject_type}
                  onChange={(e) => setAvulsaConfig({ subject_type: e.target.value as SubjectType })}
                >
                  <option value="VEICULO">Veículo / carga</option>
                  <option value="ANIMAL">Animal</option>
                </select>
              </div>
              <p className="text-xs text-gray-400">
                Pesagem avulsa só suporta pesagem única — sem ordem prévia não é possível encadear
                etapas (chegada/saída) offline.
              </p>
            </div>
          )}

          <form onSubmit={handleRegistrarPeso} className="space-y-4 rounded border border-gray-200 bg-white p-4 shadow-sm">
            {!avulsaConfig && (
              <button type="button" className="text-xs text-gray-400 underline" onClick={voltarParaLista}>
                ← Voltar
              </button>
            )}
            <div>
              <h2 className="text-base font-semibold">
                {etapaAtual ? ETAPA_LABEL[etapaAtual] : "Pesagem"} — {origemLabel}
              </h2>
              {ordemSelecionada && (
                <div className="mt-1 flex flex-wrap gap-x-3 text-xs text-gray-400">
                  {ordemSelecionada.numero_documento_fiscal && <span>NF: {ordemSelecionada.numero_documento_fiscal}</span>}
                  {ordemSelecionada.tipo_volume && (
                    <span>
                      {ordemSelecionada.quantidade_volumes ?? "?"} × {ordemSelecionada.tipo_volume}
                    </span>
                  )}
                  {ordemSelecionada.data_agendada && (
                    <span>Agendado: {new Date(ordemSelecionada.data_agendada).toLocaleString("pt-BR")}</span>
                  )}
                </div>
              )}
            </div>

            {session.bridge_url && (
              <div className="rounded border border-dashed border-gray-300 p-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-gray-400">Leitura ao vivo da balança</p>
                    <p className="text-xl font-semibold tabular-nums">
                      {leituraBalanca.peso_kg
                        ? `${Number(leituraBalanca.peso_kg).toLocaleString("pt-BR", { minimumFractionDigits: 3 })} kg`
                        : "—"}
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={!leituraBalanca.peso_kg || leituraBalanca.stale || !leituraBalanca.stable || !leituraBalanca.conectado}
                    onClick={handleUsarPesoDaBalanca}
                    className="rounded bg-emerald-600 px-3 py-2 text-xs font-medium text-white disabled:opacity-40"
                  >
                    Usar este peso
                  </button>
                </div>
                {!leituraBalanca.conectado && (
                  <p className="mt-1 text-xs text-red-500">Ponte offline — digite o peso manualmente.</p>
                )}
                {leituraBalanca.conectado && leituraBalanca.stale && (
                  <p className="mt-1 text-xs text-amber-600">Leitura antiga — aguardando atualização.</p>
                )}
                {leituraBalanca.conectado && !leituraBalanca.stale && !leituraBalanca.stable && (
                  <p className="mt-1 text-xs text-amber-600">Aguardando estabilização da leitura.</p>
                )}
              </div>
            )}

            <div className="space-y-1">
              <label className="text-sm font-medium">Peso aferido (kg)</label>
              <input
                type="text"
                inputMode="decimal"
                className="w-full rounded border border-gray-300 px-3 py-3 text-2xl"
                value={pesoAferido}
                onChange={(e) => handlePesoAferidoDigitado(e.target.value)}
                placeholder="0,000"
                required
                autoFocus
              />
              <p className="text-xs text-gray-400">
                {capturedVia === "ELETRONICA"
                  ? "Preenchido pela leitura da balança — edite para digitar manualmente."
                  : "O que a balança efetivamente mediu."}
              </p>
            </div>

            <div className="space-y-1">
              <label className="text-sm font-medium">Peso informado (kg)</label>
              <input
                type="text"
                inputMode="decimal"
                className="w-full rounded border border-gray-300 px-3 py-2"
                value={pesoInformado}
                onChange={(e) => setPesoInformado(e.target.value)}
                placeholder="0,000"
              />
              <p className="text-xs text-gray-400">
                Valor declarado (nota fiscal/motorista) — só preencha se divergir do peso aferido.
              </p>
            </div>

            {subjectTypeAtivo === "VEICULO" && etapaAtual !== "SAIDA" && etapaAtual !== "POS_DESCARGA" && (
              <div className="space-y-1">
                <label className="text-sm font-medium">Placa</label>
                <input
                  className="w-full rounded border border-gray-300 px-3 py-2 uppercase"
                  value={placa}
                  onChange={(e) => setPlaca(e.target.value)}
                />
              </div>
            )}

            {subjectTypeAtivo === "ANIMAL" && (
              <div className="space-y-1">
                <label className="text-sm font-medium">Animal (brinco/SISBOV) *</label>
                {animalSelecionado ? (
                  <div className="flex items-center justify-between rounded border border-gray-300 bg-gray-50 px-3 py-2">
                    <div>
                      <p className="text-sm font-medium">
                        {animalSelecionado.numero_brinco || animalSelecionado.numero_sisbov || animalSelecionado.nome}
                      </p>
                      <p className="text-xs text-gray-400">{animalSelecionado.categoria}</p>
                    </div>
                    <button
                      type="button"
                      className="text-xs text-gray-400 underline"
                      onClick={() => {
                        setAnimalSelecionado(null);
                        setBuscaAnimal("");
                      }}
                    >
                      Trocar
                    </button>
                  </div>
                ) : (
                  <>
                    <input
                      className="w-full rounded border border-gray-300 px-3 py-2"
                      placeholder="Digite o brinco, SISBOV ou nome..."
                      value={buscaAnimal}
                      onChange={(e) => setBuscaAnimal(e.target.value)}
                    />
                    {buscaAnimal.trim() && (
                      <ul className="divide-y divide-gray-100 rounded border border-gray-200">
                        {(animaisEncontrados ?? []).length === 0 && (
                          <li className="p-2 text-xs text-gray-400">
                            Nenhum animal encontrado no cache local — sincronize a estação ou digite manualmente
                            via pesagem avulsa.
                          </li>
                        )}
                        {(animaisEncontrados ?? []).map((animal) => (
                          <li key={animal.id}>
                            <button
                              type="button"
                              className="w-full p-2 text-left text-sm hover:bg-gray-50"
                              onClick={() => {
                                setAnimalSelecionado(animal);
                                setBuscaAnimal("");
                              }}
                            >
                              <span className="font-medium">
                                {animal.numero_brinco || animal.numero_sisbov || animal.nome}
                              </span>{" "}
                              <span className="text-xs text-gray-400">{animal.categoria}</span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </>
                )}
              </div>
            )}

            <button
              type="submit"
              disabled={salvando}
              className="w-full rounded bg-orange-600 py-3 text-lg font-medium text-white disabled:opacity-50"
            >
              {salvando ? "Salvando..." : "Confirmar pesagem"}
            </button>
          </form>
        </>
      )}
    </main>
  );
}
