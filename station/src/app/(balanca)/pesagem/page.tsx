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
  etapasFeitasOperacao,
  proximaEtapa,
  getOperadorSessao,
  clearOperadorSessao,
  retryFailedSync,
  acoesMultipla,
  ETAPA_LABEL,
  ETAPAS_POR_TIPO_PESAGEM,
  type OrdemPendenteLocal,
  type Etapa,
  type TipoPesagem,
  type AnimalLocal,
  type OperacaoLocal,
  type FinalidadeCaptura,
  type MetodoMedicao,
  type NaturezaOperacao,
} from "@/lib/db";
import { apiFetch } from "@/lib/api";
import { enqueuePesagem } from "@/lib/sync/push";
import { startSyncLoop, runSyncCycle } from "@/lib/sync/trigger";
import { usePesoAoVivo } from "@/lib/bridge/peso-ao-vivo";
import { OperadorLogin } from "@/components/operador-login";
import { downloadContingencyPackage } from "@/lib/contingency";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { PageHeader } from "@/components/shared/page-header";
import { Activity, Gauge, Search, ArrowLeft, X } from "lucide-react";

const STATUS_LOCAL_DESC: Record<string, string> = {
  PENDENTE_SYNC: "Aguardando sincronização",
  SINCRONIZANDO: "Sincronizando...",
  MAPEADA: "Ordem localizada",
  EM_PESAGEM: "Em pesagem",
  CONCLUIDA: "Concluída",
  PENDENTE_RECONCILIACAO: "Aguardando reconciliação",
  ERRO_SYNC: "Erro na sincronização",
};

const ESTADO_RECONCILIACAO_DESC: Record<string, string> = {
  NAO_APLICAVEL: "S/ reconciliação",
  PENDENTE: "Reconciliação pendente",
  CONCILIADA: "Conciliada com sucesso",
  CONFLITO: "Conflito na reconciliação",
};

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
  const [tabAtual, setTabAtual] = useState<"PENDENTES" | "CONCLUIDAS">("PENDENTES");
  const [buscaOrdem, setBuscaOrdem] = useState("");

  const ordens = useLiveQuery(
    () => {
      const statusArray = tabAtual === "PENDENTES" ? ["PENDENTE", "EM_PESAGEM"] : ["CONCLUIDA"];
      return db.ordens.where("status").anyOf(statusArray).reverse().toArray();
    },
    [tabAtual],
  );
  const operacoesLocais = useLiveQuery(
    () => db.operacoes.where("status_local").anyOf(["PENDENTE_SYNC", "MAPEADA", "EM_PESAGEM", "CONCLUIDA"]).reverse().toArray(),
    [],
    [] as OperacaoLocal[],
  );

  const ordensFiltradas = useMemo(() => {
    if (!ordens) return [];
    const termo = buscaOrdem.trim().toLowerCase().replace(/-/g, "");
    if (!termo) return ordens;
    return ordens.filter(o => {
      const veiculo = o.contexto?.veiculo as { placa_cavalo?: string; carretas?: { placa?: string }[] } | undefined;
      const placa = (typeof o.contexto?.placa === "string" ? o.contexto.placa : veiculo?.placa_cavalo ?? "").toLowerCase().replace(/-/g, "");
      const carretas = veiculo?.carretas?.some((carreta) => (carreta.placa ?? "").toLowerCase().replace(/-/g, "").includes(termo)) ?? false;
      const ref = (o.referencia_externa || "").toLowerCase().replace(/-/g, "");
      const nf = (o.numero_documento_fiscal || "").toLowerCase().replace(/-/g, "");
      return placa.includes(termo) || carretas || ref.includes(termo) || nf.includes(termo);
    });
  }, [ordens, buscaOrdem]);
  const operacoesFiltradas = useMemo(() => {
    const termo = buscaOrdem.trim().toLowerCase().replace(/-/g, "");
    if (!termo) return operacoesLocais;
    return operacoesLocais.filter((operacao) => {
      const veiculo = operacao.contexto.veiculo as { placa_cavalo?: string; carretas?: { placa?: string }[] } | undefined;
      const cavalo = (veiculo?.placa_cavalo ?? "").toLowerCase().replace(/-/g, "");
      const carreta = veiculo?.carretas?.some((item) => (item.placa ?? "").toLowerCase().replace(/-/g, "").includes(termo)) ?? false;
      return (operacao.processo.referencia || "").toLowerCase().replace(/-/g, "").includes(termo)
        || (operacao.referencia_externa || "").toLowerCase().replace(/-/g, "").includes(termo)
        || cavalo.includes(termo) || carreta;
    });
  }, [operacoesLocais, buscaOrdem]);

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
  const [operacaoSelecionadaId, setOperacaoSelecionadaId] = useState<string | null>(null);
  const ordemSelecionada = useMemo(
    () => ordens?.find((o) => o.id === ordemSelecionadaId) ?? null,
    [ordens, ordemSelecionadaId],
  );

  const etapasJaFeitas = useLiveQuery(
    () => (ordemSelecionada ? etapasFeitas(ordemSelecionada) : Promise.resolve([] as Etapa[])),
    [ordemSelecionada],
  );
  const operacaoSelecionada = useMemo(
    () => operacoesLocais.find((operacao) => operacao.operation_local_id === operacaoSelecionadaId) ?? null,
    [operacoesLocais, operacaoSelecionadaId],
  );
  const etapasOperacao = useLiveQuery(
    () => operacaoSelecionada ? etapasFeitasOperacao(operacaoSelecionada) : Promise.resolve([] as Etapa[]),
    [operacaoSelecionada],
  );
  const capturasSelecionadas = useLiveQuery(
    async () => {
      if (ordemSelecionada) return db.pesagens.where("ordem_id").equals(ordemSelecionada.id).sortBy("client_created_at");
      if (operacaoSelecionada) return db.pesagens.where("operation_local_id").equals(operacaoSelecionada.operation_local_id).sortBy("client_created_at");
      return [];
    },
    [ordemSelecionada, operacaoSelecionada],
    [],
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

  // Operação LOCAL: criada na Station com ou sem conectividade. A origem é
  // distinta do estado de sincronização e a autorização pré-carregada segue
  // obrigatória mesmo quando a rede está disponível.
  const [avulsaConfig, setAvulsaConfig] = useState<{ subject_type: SubjectType } | null>(null);
  const [processoTipo, setProcessoTipo] = useState("ROMANEIO");
  const [processoReferencia, setProcessoReferencia] = useState("");
  const [tipoPesagemNova, setTipoPesagemNova] = useState<TipoPesagem>("UNICA");
  const [naturezaOperacaoNova, setNaturezaOperacaoNova] = useState<NaturezaOperacao>("RECEBIMENTO");
  const [etapaMultiplaSelecionada, setEtapaMultiplaSelecionada] = useState<Etapa | null>(null);
  const [finalidadeCaptura, setFinalidadeCaptura] = useState<FinalidadeCaptura>("OPERACIONAL");
  const [metodoMedicao, setMetodoMedicao] = useState<MetodoMedicao>("ESTATICA");
  const [placasCarretas, setPlacasCarretas] = useState<string[]>([]);
  const [motoristaNome, setMotoristaNome] = useState("");
  const [motoristaDocumentoTipo, setMotoristaDocumentoTipo] = useState("CNH");
  const [motoristaDocumentoNumero, setMotoristaDocumentoNumero] = useState("");
  const [produtoCodigo, setProdutoCodigo] = useState("");
  const [produtoDescricao, setProdutoDescricao] = useState("");
  const [pesoDeclarado, setPesoDeclarado] = useState("");
  const [loteCarga, setLoteCarga] = useState("");
  const [documentoCarga, setDocumentoCarga] = useState("");

  const [pesoAferido, setPesoAferido] = useState("");
  const [pesoInformado, setPesoInformado] = useState("");
  const [direcaoVeiculo, setDirecaoVeiculo] = useState<"ENTRADA" | "INTERNA" | "SAIDA">("ENTRADA");
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

  const emCaptura = !!ordemSelecionada || !!operacaoSelecionada || !!avulsaConfig;
  const tipoPesagemAtivo = ordemSelecionada?.tipo_pesagem ?? operacaoSelecionada?.tipo_pesagem ?? tipoPesagemNova;
  const capturasParaFluxo = capturasSelecionadas ?? [];
  const acoesAtuais = tipoPesagemAtivo === "MULTIPLA" ? acoesMultipla(capturasParaFluxo) : [];
  const etapaAtual: Etapa | null = ordemSelecionada
    ? tipoPesagemAtivo === "MULTIPLA"
      ? (etapaMultiplaSelecionada && acoesAtuais.includes(etapaMultiplaSelecionada) ? etapaMultiplaSelecionada : acoesAtuais[0] ?? null)
      : proximaEtapa(tipoPesagemAtivo, etapasJaFeitas ?? [])
    : operacaoSelecionada
      ? tipoPesagemAtivo === "MULTIPLA"
        ? (etapaMultiplaSelecionada && acoesAtuais.includes(etapaMultiplaSelecionada) ? etapaMultiplaSelecionada : acoesAtuais[0] ?? null)
        : proximaEtapa(tipoPesagemAtivo, etapasOperacao ?? [])
      : avulsaConfig
        ? tipoPesagemNova === "MULTIPLA"
          ? (etapaMultiplaSelecionada && acoesAtuais.includes(etapaMultiplaSelecionada) ? etapaMultiplaSelecionada : acoesAtuais[0] ?? null)
          : proximaEtapa(tipoPesagemNova, [])
      : null;
  const subjectTypeAtivo = ordemSelecionada?.subject_type ?? operacaoSelecionada?.subject_type ?? avulsaConfig?.subject_type ?? null;
  const origemLabel = ordemSelecionada?.origem_operacao ?? (operacaoSelecionada?.origem_operacao ?? ordemSelecionada?.origem_tipo ?? "AVULSA");
  const naturezaAtiva = ordemSelecionada?.natureza_operacao ?? operacaoSelecionada?.natureza_operacao ?? (avulsaConfig ? naturezaOperacaoNova : null);
  const finalidadeEfetiva: FinalidadeCaptura = tipoPesagemAtivo === "MULTIPLA" && etapaAtual && capturasParaFluxo.some((captura) => captura.etapa === etapaAtual)
    ? (finalidadeCaptura === "OPERACIONAL" ? "CONFERENCIA" : finalidadeCaptura)
    : finalidadeCaptura;

  function voltarParaLista() {
    setOrdemSelecionadaId(null);
    setOperacaoSelecionadaId(null);
    setAvulsaConfig(null);
    setPesoAferido("");
    setPesoInformado("");
    setDirecaoVeiculo("ENTRADA");
    setEtapaMultiplaSelecionada(null);
    setFinalidadeCaptura("OPERACIONAL");
    setMetodoMedicao("ESTATICA");
    setPlaca("");
    setProcessoReferencia("");
    setProdutoCodigo("");
    setProdutoDescricao("");
    setPesoDeclarado("");
    setLoteCarga("");
    setDocumentoCarga("");
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

  async function handleUsarCapturaComoOficial(captura: (typeof capturasParaFluxo)[number]) {
    const ordemId = ordemSelecionada?.id ?? operacaoSelecionada?.ordem_id;
    if (!ordemId || !captura.server_id || !["PRE_OPERACAO", "POS_OPERACAO"].includes(captura.etapa)) {
      setMensagem("A captura precisa estar sincronizada e pertencer a PRE/POS para ser oficializada.");
      return;
    }
    try {
      await apiFetch(`/api/v1/balanca/stations/orders/${ordemId}/official-marks`, {
        method: "POST",
        body: JSON.stringify({
          pesagem_id: captura.server_id,
          etapa: captura.etapa,
          operador_id: operadorSessao?.operador_id ?? null,
        }),
      });
      setMensagem("Marco oficial atualizado. O resultado será recalculado pelo Core.");
      void runSyncCycle();
    } catch (err) {
      setMensagem(err instanceof Error ? err.message : "Não foi possível atualizar o marco oficial.");
    }
  }

  async function handleRegistrarPeso(e: React.FormEvent) {
    e.preventDefault();
    if (!etapaAtual || (!ordemSelecionada && !operacaoSelecionada && !avulsaConfig)) return;
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

      let operacaoAtiva = operacaoSelecionada;
      if (avulsaConfig) {
        if (!processoTipo.trim() || !placa.trim() || !motoristaNome.trim() || !motoristaDocumentoNumero.trim()) {
          setMensagem("Informe o tipo de processo, placa do cavalo e identificação do motorista antes de capturar.");
          setSalvando(false);
          return;
        }
        const agoraOperacao = new Date().toISOString();
        const placasNormalizadas = placasCarretas
          .map((placaCarreta) => placaCarreta.replace(/[^a-zA-Z0-9]/g, "").toUpperCase())
          .filter(Boolean)
          .map((placaCarreta) => ({ placa: placaCarreta }));
        const carga = (produtoCodigo.trim() || produtoDescricao.trim() || pesoDeclarado.trim() || loteCarga.trim() || documentoCarga.trim())
          ? {
              produto: (produtoCodigo.trim() || produtoDescricao.trim()) ? {
                ...(produtoCodigo.trim() ? { codigo_externo: produtoCodigo.trim().toUpperCase() } : {}),
                ...(produtoDescricao.trim() ? { descricao: produtoDescricao.trim() } : {}),
              } : undefined,
              ...(pesoDeclarado.trim() ? { peso_declarado_kg: Number(pesoDeclarado.replace(",", ".")) } : {}),
              ...(loteCarga.trim() ? { lote: loteCarga.trim() } : {}),
              ...(documentoCarga.trim() ? { documentos: [{ tipo: "NF", numero: documentoCarga.trim() }] } : {}),
            }
          : undefined;
        const contexto = {
          processo: { tipo: processoTipo.trim().toUpperCase(), referencia: processoReferencia.trim() ? processoReferencia.trim().toUpperCase() : null },
          veiculo: { placa_cavalo: placa.replace(/[^a-zA-Z0-9]/g, "").toUpperCase(), carretas: placasNormalizadas },
          motorista: { nome: motoristaNome.trim(), documento: { tipo: motoristaDocumentoTipo, numero: motoristaDocumentoNumero.trim() } },
          ...(carga ? { carga } : {}),
        };
        operacaoAtiva = {
          operation_local_id: crypto.randomUUID(),
          ordem_id: null,
          status_local: "PENDENTE_SYNC",
          reconciliation_status: "PENDENTE",
          origem_operacao: "LOCAL",
          estado_reconciliacao: "PENDENTE",
          subject_type: "VEICULO",
          tipo_pesagem: tipoPesagemNova,
          natureza_operacao: tipoPesagemNova === "MULTIPLA" ? naturezaOperacaoNova : null,
          modalidade: tipoPesagemNova === "MULTIPLA" ? "MULTIPLA" : "UNICA",
          processo: contexto.processo,
          referencia_externa: null,
          correlation_id: crypto.randomUUID(),
          contexto,
          etapas_realizadas: [],
          created_at: agoraOperacao,
          updated_at: agoraOperacao,
        };
        await db.operacoes.add(operacaoAtiva);
        if (tipoPesagemNova === "MULTIPLA") {
          setOperacaoSelecionadaId(operacaoAtiva.operation_local_id);
          setAvulsaConfig(null);
        }
      }

      if (operacaoAtiva && operacaoAtiva.ordem_id === null && operacaoSelecionada && operacaoAtiva.tipo_pesagem !== "MULTIPLA" && etapaAtual !== "UNICA") {
        setMensagem("A primeira captura ainda aguarda sincronização e mapeamento para uma Ordem Cloud.");
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
        operation_local_id: operacaoAtiva?.operation_local_id ?? null,
        ordem_id: ordemSelecionada?.id ?? operacaoAtiva?.ordem_id ?? null,
        subject_type: ordemSelecionada || operacaoAtiva?.ordem_id ? null : avulsaConfig?.subject_type ?? null,
        tipo_pesagem: ordemSelecionada || operacaoAtiva?.ordem_id ? null : operacaoAtiva?.tipo_pesagem ?? null,
        natureza_operacao: ordemSelecionada?.natureza_operacao ?? operacaoAtiva?.natureza_operacao ?? null,
        modalidade: ordemSelecionada?.modalidade ?? operacaoAtiva?.modalidade ?? null,
        etapa: etapaAtual,
        finalidade: tipoPesagemAtivo === "MULTIPLA" ? finalidadeEfetiva : null,
        metodo_medicao: tipoPesagemAtivo === "MULTIPLA" ? metodoMedicao : null,
        server_id: null,
        numero_ticket: gerarNumeroTicketLocal(),
        peso_informado_kg: informadoNum.toFixed(3),
        peso_aferido_kg: aferidoNum.toFixed(3),
        peso_tara_kg: "0.000",
        captured_via: capturedVia,
        operador_id: operadorSessao?.operador_id ?? null,
        direcao_veiculo: subjectTypeAtivo === "ANIMAL" ? null : direcaoVeiculo,
        leitura_bruta: leituraBrutaUsada,
        contexto: operacaoAtiva?.contexto ?? {},
        placa: ((operacaoAtiva?.contexto.veiculo as { placa_cavalo?: string } | undefined)?.placa_cavalo ?? placa) || null,
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

      if (tipoPesagemAtivo === "MULTIPLA") {
        if (operacaoAtiva) await db.operacoes.update(operacaoAtiva.operation_local_id, {
          status_local: "EM_PESAGEM",
          etapas_realizadas: [...new Set([...(operacaoAtiva.etapas_realizadas ?? []), etapaAtual])],
          updated_at: new Date().toISOString(),
        });
        if (ordemSelecionada) await db.ordens.update(ordemSelecionada.id, { status: "EM_PESAGEM" });
        setPesoAferido("");
        setPesoInformado("");
        setEtapaMultiplaSelecionada(null);
        setCapturedVia("MANUAL");
        setLeituraBrutaUsada(null);
        setMensagem(`Etapa "${ETAPA_LABEL[etapaAtual]}" registrada. Escolha a próxima ação.`);
        window.scrollTo({ top: 0, behavior: "smooth" });
        void runSyncCycle();
        setSalvando(false);
        return;
      }

      if (ordemSelecionada || operacaoAtiva?.ordem_id) {
        const ordemIdAtiva = ordemSelecionada?.id ?? operacaoAtiva!.ordem_id!;
        const restantes = ETAPAS_POR_TIPO_PESAGEM[tipoPesagemAtivo].filter(
          (e) => e !== etapaAtual && !(ordemSelecionada ? etapasJaFeitas ?? [] : etapasOperacao ?? []).includes(e),
        );
        if (ordemSelecionada) await db.ordens.update(ordemIdAtiva, { status: restantes.length > 0 ? "EM_PESAGEM" : "CONCLUIDA" });
        if (operacaoAtiva) await db.operacoes.update(operacaoAtiva.operation_local_id, {
          status_local: restantes.length > 0 ? "EM_PESAGEM" : "CONCLUIDA",
          etapas_realizadas: [...new Set([...(operacaoAtiva.etapas_realizadas ?? []), etapaAtual])],
          updated_at: new Date().toISOString(),
        });
        if (restantes.length === 0) {
          // Ordem concluída — o ticket só fica disponível depois que a
          // pesagem sincronizar (o PDF é montado a partir dos dados no servidor).
          setTicketOrdemId(ordemIdAtiva);
        }
        if (restantes.length > 0) {
          // Mantém a tela na mesma ordem para capturar a próxima etapa.
          setPesoAferido("");
          setPesoInformado("");
          setCapturedVia("MANUAL");
          setLeituraBrutaUsada(null);
          setMensagem(`Etapa "${ETAPA_LABEL[etapaAtual]}" registrada. Falta: ${ETAPA_LABEL[restantes[0]]}.`);
          window.scrollTo({ top: 0, behavior: "smooth" });
          void runSyncCycle();
          setSalvando(false);
          return;
        }
      }

      voltarParaLista();
      setMensagem("Pesagem registrada. Sincronizando quando houver conexão.");
      window.scrollTo({ top: 0, behavior: "smooth" });
      void runSyncCycle();
    } finally {
      setSalvando(false);
    }
  }

  return (
    <main className="min-h-[100dvh] p-4 max-w-6xl mx-auto space-y-4 animate-in fade-in duration-500 flex flex-col">
      <PageHeader
        title={session.nome}
        description={`${operadorSessao.nome_exibicao} · Última sincronização: ${session.last_sync_at ? new Date(session.last_sync_at).toLocaleString("pt-BR") : "nunca"}`}
        breadcrumbs={[{ label: "Operação" }]}
        icon={<Activity className="size-6" />}
        actions={
          <>
            <Button variant="outline" size="sm" onClick={() => clearOperadorSessao()}>
              Trocar operador
            </Button>
            {falhasSync ? (
              <Button
                variant="outline" size="sm"
                className="border-destructive text-destructive hover:bg-destructive/10"
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
            <div className="flex items-center gap-2 px-2 text-sm text-muted-foreground border-l border-r border-border mx-1 h-8">
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
                : "Balança não configurada"}
            </div>
            <Button
              variant="outline" size="sm"
              onClick={() => {
                setBridgeUrlForm(session.bridge_url ?? "");
                setBridgeTokenForm(session.bridge_token ?? "");
                setConfigPonteAberta(true);
              }}
            >
              Conectar Balança
            </Button>
            <Button
              variant="outline" size="sm" className="border-destructive text-destructive hover:bg-destructive/10"
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
            <CardTitle className="text-base">Conexão Automática da Balança</CardTitle>
            <CardDescription>
              Endereço do equipamento na rede local que envia o peso diretamente.
              Deixe em branco para usar apenas a digitação manual.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSalvarConfigPonte} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Endereço de rede (IP ou URL)</label>
                <Input
                  placeholder="http://192.168.0.50:8321"
                  value={bridgeUrlForm}
                  onChange={(e) => setBridgeUrlForm(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Código de segurança (opcional)</label>
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
        <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-card p-4 text-sm font-medium text-foreground shadow-sm">
          <p className="font-semibold text-base">{mensagem}</p>
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
          <div className="flex gap-6 border-b border-border/40 pb-0">
            <button
              onClick={() => setTabAtual("PENDENTES")}
              className={`pb-3 text-sm font-bold uppercase tracking-wider transition-colors border-b-2 ${tabAtual === "PENDENTES" ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}
            >
              Pendentes
            </button>
            <button
              onClick={() => setTabAtual("CONCLUIDAS")}
              className={`pb-3 text-sm font-bold uppercase tracking-wider transition-colors border-b-2 ${tabAtual === "CONCLUIDAS" ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}
            >
              Concluídas
            </button>
          </div>

          <div className="relative mt-4 mb-4">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground size-4" />
            <Input
              type="text"
              placeholder="Buscar por placa, referência ou NF..."
              value={buscaOrdem}
              onChange={(e) => setBuscaOrdem(e.target.value)}
              className="pl-10 h-12"
            />
          </div>

          <div>
            {ordensFiltradas.length === 0 && <p className="text-sm text-muted-foreground">Nenhuma ordem encontrada no momento.</p>}
            <ul className="space-y-4">
              {ordensFiltradas.map((ordem: OrdemPendenteLocal) => {
                const isConcluida = ordem.status === "CONCLUIDA";
                const ItemTag = isConcluida ? "div" : "button";

                return (
                <li key={ordem.id}>
                  <ItemTag
                    className={`w-full rounded-xl border border-border/50 bg-card/60 backdrop-blur-sm p-5 text-left shadow-sm transition-all duration-300 ${!isConcluida ? "hover:shadow-md hover:-translate-y-1 hover:border-primary/50 group cursor-pointer" : "opacity-80"}`}
                    onClick={() => {
                      if (!isConcluida || ordem.tipo_pesagem === "MULTIPLA") {
                        setTicketOrdemId(null);
                        setEtapaMultiplaSelecionada(null);
                        setOrdemSelecionadaId(ordem.id);
                      }
                    }}
                  >
                    <div className="flex justify-between text-base font-semibold text-foreground">
                      <span className={!isConcluida ? "group-hover:text-primary transition-colors" : ""}>
                        {ordem.referencia_externa || ordem.origem_tipo}
                      </span>
                      <span className="text-muted-foreground text-sm font-normal">{ordem.subject_type}</span>
                    </div>
                    <div className="text-sm text-muted-foreground mt-1 mb-2">
                      {ordem.tipo_pesagem === "MULTIPLA"
                        ? `Múltiplas capturas · ${ordem.natureza_operacao ?? "natureza pendente"}`
                        : ordem.tipo_pesagem === "UNICA"
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
                  </ItemTag>
                </li>
              )})}
            </ul>
          </div>

          {operacoesFiltradas.length > 0 && (
            <div className="space-y-3 border-t border-border pt-5">
              <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">Operações criadas neste terminal</h2>
              {operacoesFiltradas.map((operacao) => {
                const veiculo = operacao.contexto.veiculo as { placa_cavalo?: string } | undefined;
                return <button key={operacao.operation_local_id} className="w-full rounded-xl border border-primary/20 bg-primary/5 p-4 text-left hover:border-primary/50" onClick={() => {
                  setOrdemSelecionadaId(null); setEtapaMultiplaSelecionada(null); setOperacaoSelecionadaId(operacao.operation_local_id); setPlaca(veiculo?.placa_cavalo ?? "");
                }}>
                  <div className="flex justify-between gap-3"><strong>{operacao.processo.referencia || "Operação local"}</strong><span className="text-xs text-muted-foreground">{STATUS_LOCAL_DESC[operacao.status_local] || operacao.status_local} · {ESTADO_RECONCILIACAO_DESC[operacao.estado_reconciliacao] || operacao.estado_reconciliacao}</span></div>
                  <p className="mt-1 text-sm text-muted-foreground">{operacao.processo.tipo} · cavalo {veiculo?.placa_cavalo ?? "—"} · {operacao.tipo_pesagem}{operacao.natureza_operacao ? ` · ${operacao.natureza_operacao}` : ""}</p>
                </button>;
              })}
            </div>
          )}

          <div className="border-t border-border pt-6 mt-6">
            <p className="mb-3 text-sm text-muted-foreground">
              Sem ordem para esse veículo/animal? Pese assim mesmo — fica disponível para associar ao
              processo depois (tela de reconciliação no painel administrativo).
            </p>
            <Button
              variant="outline"
              className="w-full h-12 border-dashed border-2 text-muted-foreground font-bold hover:text-foreground hover:border-primary/50 transition-colors"
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
              <CardHeader className="pb-3 flex flex-row items-center gap-3 space-y-0">
                <Button variant="outline" size="icon" className="h-8 w-8 shrink-0 rounded-full bg-background" onClick={voltarParaLista}>
                  <ArrowLeft className="size-4" />
                </Button>
                <CardTitle className="text-lg">Nova operação de pesagem</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="space-y-1.5">
                    <label className="text-sm font-semibold">Processo — tipo</label>
                    <select
                      className="flex h-11 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                      value={processoTipo}
                      onChange={(e) => setProcessoTipo(e.target.value)}
                    >
                      <option value="PEDIDO">Pedido</option><option value="ROMANEIO">Romaneio</option><option value="ORDEM_CARGA">Ordem de carga</option>
                      <option value="RECEBIMENTO">Recebimento</option><option value="EXPEDICAO">Expedição</option><option value="TRANSFERENCIA">Transferência</option><option value="OUTRO">Outro</option>
                    </select>
                  </div>
                  <div className="space-y-1.5"><label className="text-sm font-semibold">Referência informada</label><Input className="h-11" value={processoReferencia} onChange={(e) => setProcessoReferencia(e.target.value)} placeholder="Opcional — ROM-84721" /></div>
                  <div className="space-y-1.5"><label className="text-sm font-semibold">Modalidade</label><select className="flex h-11 w-full rounded-md border border-input bg-background px-3 text-sm" value={tipoPesagemNova} onChange={(e) => setTipoPesagemNova(e.target.value as TipoPesagem)}><option value="UNICA">Única</option><option value="DUPLA">Dupla</option><option value="DUPLA_ENTRADA_DESCARGA">Dupla entrada/descarga</option><option value="DUPLA_SAIDA_CARREGAMENTO">Dupla saída/carregamento</option><option value="MULTIPLA">Múltiplas capturas</option></select></div>
                </div>
                {tipoPesagemNova === "MULTIPLA" && (
                  <div className="space-y-1.5"><label className="text-sm font-semibold">Natureza da operação</label><select className="flex h-11 w-full rounded-md border border-input bg-background px-3 text-sm" value={naturezaOperacaoNova} onChange={(e) => setNaturezaOperacaoNova(e.target.value as NaturezaOperacao)}><option value="RECEBIMENTO">Recebimento</option><option value="EXPEDICAO">Expedição</option><option value="TRANSFERENCIA">Transferência</option><option value="DEVOLUCAO">Devolução</option><option value="OUTRA">Outra</option></select></div>
                )}
                <div className="space-y-1.5"><label className="text-sm font-semibold">Placa do cavalo <span className="text-destructive">*</span></label><Input value={placa} onChange={(e) => setPlaca(e.target.value.toUpperCase())} placeholder="ABC1D23" /></div>
                <div className="space-y-2"><label className="text-sm font-semibold">Carretas</label>{placasCarretas.map((placaCarreta, index) => <div className="flex gap-2" key={index}><Input value={placaCarreta} onChange={(e) => setPlacasCarretas(placasCarretas.map((value, position) => position === index ? e.target.value.toUpperCase() : value))} placeholder="DEF4G56" /><Button type="button" variant="outline" onClick={() => setPlacasCarretas(placasCarretas.filter((_, position) => position !== index))}>Remover</Button></div>)}<Button type="button" variant="outline" onClick={() => setPlacasCarretas([...placasCarretas, ""])}>+ Adicionar carreta</Button></div>
                <div className="grid gap-3 sm:grid-cols-4"><div className="space-y-1.5 sm:col-span-2"><label className="text-sm font-semibold">Motorista <span className="text-destructive">*</span></label><Input className="h-11" value={motoristaNome} onChange={(e) => setMotoristaNome(e.target.value)} /></div><div className="space-y-1.5"><label className="text-sm font-semibold">Documento</label><select className="flex h-11 w-full rounded-md border border-input bg-background px-3 text-sm" value={motoristaDocumentoTipo} onChange={(e) => setMotoristaDocumentoTipo(e.target.value)}><option>CNH</option><option>CPF</option><option>RG</option><option>OUTRO</option></select></div><div className="space-y-1.5"><label className="text-sm font-semibold">Número <span className="text-destructive">*</span></label><Input className="h-11" value={motoristaDocumentoNumero} onChange={(e) => setMotoristaDocumentoNumero(e.target.value)} /></div></div>
                <div className="grid gap-3 sm:grid-cols-2"><div className="space-y-1.5"><label className="text-sm font-semibold">Produto — código externo</label><Input value={produtoCodigo} onChange={(e) => setProdutoCodigo(e.target.value)} placeholder="CAF-001" /></div><div className="space-y-1.5"><label className="text-sm font-semibold">Produto — descrição</label><Input value={produtoDescricao} onChange={(e) => setProdutoDescricao(e.target.value)} placeholder="Café Arábica" /></div><div className="space-y-1.5"><label className="text-sm font-semibold">Peso declarado (kg)</label><Input inputMode="decimal" value={pesoDeclarado} onChange={(e) => setPesoDeclarado(e.target.value)} placeholder="30000" /></div><div className="space-y-1.5"><label className="text-sm font-semibold">Lote</label><Input value={loteCarga} onChange={(e) => setLoteCarga(e.target.value)} placeholder="LT-001" /></div><div className="space-y-1.5"><label className="text-sm font-semibold">Documento da carga</label><Input value={documentoCarga} onChange={(e) => setDocumentoCarga(e.target.value)} placeholder="NF 123456" /></div></div>
                <p className="text-xs text-muted-foreground">Carga, documentos, carretas e referência são contexto complementar; não é necessário informar NF para pesar.</p>
              </CardContent>
            </Card>
          )}

          <form onSubmit={handleRegistrarPeso} className="space-y-3 rounded-xl border border-border bg-card p-4 shadow-sm relative flex-1 flex flex-col justify-center">
            {!avulsaConfig && (
              <Button type="button" variant="outline" size="sm" className="absolute top-3 right-3 text-muted-foreground h-8" onClick={voltarParaLista}>
                <X className="size-4 mr-1.5" /> Cancelar
              </Button>
            )}
            <div>
              <h2 className="text-xl font-bold text-foreground">
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

            {tipoPesagemAtivo === "MULTIPLA" && (
              <div className="space-y-3 rounded-lg border border-primary/20 bg-primary/5 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold">{naturezaAtiva ?? "Natureza pendente"}</p>
                    <p className="text-xs text-muted-foreground">Ações disponíveis para esta operação</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {acoesAtuais.map((etapa) => (
                      <Button
                        key={etapa}
                        type="button"
                        size="sm"
                        variant={etapaAtual === etapa ? "default" : "outline"}
                        onClick={() => setEtapaMultiplaSelecionada(etapa)}
                      >
                        {ETAPA_LABEL[etapa]}{capturasParaFluxo.some((captura) => captura.etapa === etapa) ? " · repetir" : ""}
                      </Button>
                    ))}
                  </div>
                </div>
                {capturasParaFluxo.length > 0 && (
                  <div className="space-y-2 border-t border-primary/15 pt-2">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Capturas desta operação</p>
                    {capturasParaFluxo.map((captura, index) => {
                      const oficial = capturasParaFluxo.find((item) => item.etapa === captura.etapa && item.finalidade === "OPERACIONAL");
                      const peso = Number(captura.peso_aferido_kg ?? 0);
                      const pesoOficial = Number(oficial?.peso_aferido_kg ?? 0);
                      const diferenca = oficial && oficial.local_id !== captura.local_id ? Math.abs(peso - pesoOficial) : null;
                      const percentual = diferenca !== null && pesoOficial !== 0 ? (diferenca / Math.abs(pesoOficial)) * 100 : null;
                      return (
                        <div key={captura.local_id} className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-background/70 p-2 text-sm">
                          <span><strong>#{index + 1} {ETAPA_LABEL[captura.etapa]}</strong> · {peso.toLocaleString("pt-BR", { minimumFractionDigits: 3 })} kg · {captura.finalidade ?? "OPERACIONAL"}</span>
                          <span className="flex items-center gap-2">
                            {diferenca !== null && <span className="text-xs text-muted-foreground">diferença {diferenca.toLocaleString("pt-BR", { minimumFractionDigits: 3 })} kg{percentual !== null ? ` (${percentual.toFixed(2)}%)` : ""}</span>}
                            {captura.finalidade === "CONFERENCIA" && (
                              <Button type="button" size="sm" variant="outline" onClick={() => handleUsarCapturaComoOficial(captura)}>
                                Usar como oficial
                              </Button>
                            )}
                            <span className="text-xs text-muted-foreground">{captura.synced ? "sincronizada" : "pendente"}</span>
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
                {(ordemSelecionada?.resultado_status ?? operacaoSelecionada?.resultado_status) && (
                  <div className="rounded-md border border-secondary/30 bg-secondary/10 p-3 text-sm">
                    <p className="font-semibold">Resultado: {ordemSelecionada?.resultado_status ?? operacaoSelecionada?.resultado_status}</p>
                    {(ordemSelecionada?.resultado_motivo ?? operacaoSelecionada?.resultado_motivo) && <p className="text-muted-foreground">{ordemSelecionada?.resultado_motivo ?? operacaoSelecionada?.resultado_motivo}</p>}
                    {(ordemSelecionada?.peso_liquido_kg ?? operacaoSelecionada?.peso_liquido_kg) && <p className="mt-1">Bruto {ordemSelecionada?.peso_bruto_kg ?? operacaoSelecionada?.peso_bruto_kg} kg · Tara {ordemSelecionada?.peso_tara_kg ?? operacaoSelecionada?.peso_tara_kg} kg · Líquido {ordemSelecionada?.peso_liquido_kg ?? operacaoSelecionada?.peso_liquido_kg} kg</p>}
                    {(ordemSelecionada?.delta_pre_operacao_kg ?? operacaoSelecionada?.delta_pre_operacao_kg) && <p className="text-xs text-muted-foreground">Delta pré-operação: {ordemSelecionada?.delta_pre_operacao_kg ?? operacaoSelecionada?.delta_pre_operacao_kg} kg</p>}
                    {(ordemSelecionada?.delta_pos_operacao_kg ?? operacaoSelecionada?.delta_pos_operacao_kg) && <p className="text-xs text-muted-foreground">Delta pós-operação: {ordemSelecionada?.delta_pos_operacao_kg ?? operacaoSelecionada?.delta_pos_operacao_kg} kg</p>}
                  </div>
                )}
              </div>
            )}

            {subjectTypeAtivo !== "ANIMAL" && (
              <div className="space-y-1.5">
                <label htmlFor="direcao-veiculo" className="text-sm font-semibold">Direção do veículo</label>
                <select
                  id="direcao-veiculo"
                  className="flex h-11 w-full rounded-md border border-input bg-background px-3 text-sm"
                  value={direcaoVeiculo}
                  onChange={(e) => setDirecaoVeiculo(e.target.value as "ENTRADA" | "SAIDA")}
                >
                  <option value="ENTRADA">Entrada</option>
                  <option value="INTERNA">Interna</option>
                  <option value="SAIDA">Saída</option>
                </select>
              </div>
            )}

            {tipoPesagemAtivo === "MULTIPLA" && (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <label className="text-sm font-semibold">Finalidade</label>
                  <select className="flex h-11 w-full rounded-md border border-input bg-background px-3 text-sm" value={finalidadeEfetiva} onChange={(e) => setFinalidadeCaptura(e.target.value as FinalidadeCaptura)}>
                    <option value="OPERACIONAL">Operacional</option>
                    <option value="CONFERENCIA">Conferência</option>
                    <option value="AMOSTRAGEM">Amostragem</option>
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-semibold">Método de medição</label>
                  <select className="flex h-11 w-full rounded-md border border-input bg-background px-3 text-sm" value={metodoMedicao} onChange={(e) => setMetodoMedicao(e.target.value as MetodoMedicao)}>
                    <option value="ESTATICA">Estática</option>
                    <option value="DINAMICA">Dinâmica</option>
                    <option value="POR_EIXO">Por eixo</option>
                  </select>
                </div>
              </div>
            )}

            {session.bridge_url && (
              <div className={`rounded-xl border-2 p-3 transition-all duration-500 relative overflow-hidden ${leituraBalanca.conectado ? "border-primary/50 bg-[#061118] shadow-[0_0_30px_rgba(var(--color-primary),0.1)]" : "border-dashed border-border bg-muted/20"}`}>
                <div className="flex items-center justify-between relative z-10">
                  <div>
                    <p className={`text-xs font-semibold mb-0.5 flex items-center gap-2 ${leituraBalanca.conectado ? "text-primary/80" : "text-muted-foreground"}`}>
                      {leituraBalanca.conectado && <span className="size-2.5 rounded-full bg-primary animate-pulse shadow-[0_0_10px_rgba(var(--color-primary),0.8)]"></span>}
                      LEITURA DA BALANÇA
                    </p>
                    <p className={`text-4xl font-mono font-bold tracking-tight ${leituraBalanca.conectado ? (leituraBalanca.stable ? "text-secondary text-glow-secondary" : "text-primary text-glow") : "text-foreground"}`}>
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
                    className="font-bold text-sm h-10 px-5 bg-secondary hover:bg-secondary/90 text-secondary-foreground"
                  >
                    Usar peso
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

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-3 border-t border-border">
              <div className="space-y-1">
                <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Peso aferido (kg)</label>
                <Input
                  type="text"
                  inputMode="decimal"
                  className="w-full h-14 text-3xl font-mono font-black text-center tracking-wider bg-background border-2 shadow-inner"
                  value={pesoAferido}
                  onChange={(e) => handlePesoAferidoDigitado(e.target.value)}
                  placeholder="0,000"
                  required
                  autoFocus
                />
                <p className="text-[10px] text-muted-foreground text-center">
                  {capturedVia === "ELETRONICA"
                    ? "Preenchido pela balança."
                    : "O que a balança efetivamente mediu."}
                </p>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Peso informado (kg)</label>
                <Input
                  type="text"
                  inputMode="decimal"
                  className="w-full h-14 text-3xl font-mono font-black text-center tracking-wider bg-background border-2 shadow-inner"
                  value={pesoInformado}
                  onChange={(e) => setPesoInformado(e.target.value)}
                  placeholder="0,000"
                />
                <p className="text-[10px] text-muted-foreground text-center">
                  Nota fiscal/motorista (só se divergir).
                </p>
              </div>
            </div>

            {subjectTypeAtivo === "VEICULO" && !avulsaConfig && !operacaoSelecionada && etapaAtual !== "SAIDA" && etapaAtual !== "POS_DESCARGA" && (
              <div className="space-y-1">
                <label className="text-xs font-semibold">Placa do veículo</label>
                <Input
                  className="w-full h-10 uppercase text-base"
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

            <div className="pt-2 mt-auto">
              <Button
                type="submit"
                size="lg"
                disabled={salvando}
                className="w-full h-12 text-lg font-bold shadow-xl hover:shadow-primary/40 hover:-translate-y-1 transition-all active:scale-[0.98] bg-gradient-to-r from-primary to-primary/90"
              >
                {salvando ? "Salvando..." : "CONFIRMAR PESAGEM"}
              </Button>
            </div>
          </form>
        </>
      )}
    </main>
  );
}
