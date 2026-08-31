import { useCallback, useEffect, useMemo, useState } from "react";
import { onAuthStateChanged, signOut, type User } from "firebase/auth";
import type { Produto, NovoProdutoInput } from "./types/produto";
import type { PlanoDeProducaoDiario } from "./types/producao";
import type { RegistroPerda, LancamentoPerdaInput } from "./types/perda";
import { RepositorioFirestore } from "./data/repositorioFirestore";
import { auth } from "./lib/firebase";
import { lojaPorEmail, nomeDaLoja } from "./lib/lojas";
import { TelaLogin } from "./components/TelaLogin";
import { ImportarDadosLocais } from "./components/ImportarDadosLocais";
import { AvisoGlobal, type Aviso } from "./components/AvisoGlobal";
import { ehFalhaTemporariaDeRede, mensagemDeFalhaAoSalvar } from "./lib/errosFirestore";
import { dataDeHojeIso, diaDaSemanaDeData, formatarDataBr } from "./lib/data";
import { incluirItemProduzido, planoDeHojeCom } from "./lib/producaoDeHoje";
import { gerarId } from "./lib/id";
import { fraseDaManutencao, lerManutencao, type EstadoDaManutencao } from "./lib/manutencao";
import { TelaCronograma } from "./components/TelaCronograma";
import { TelaCadastroProdutos } from "./components/TelaCadastroProdutos";
import { TelaPerdas } from "./components/TelaPerdas";
import { TelaAnalises } from "./components/TelaAnalises";
import { BannerInstalar } from "./components/BannerInstalar";
import { AvisoPerdaPendente } from "./components/AvisoPerdaPendente";
import { TelaPedidoFilial } from "./components/TelaPedidoFilial";
import {
  decidirReposicao,
  diferencasDoAjuste,
  ehReposicao,
  type PedidoFilial,
} from "./types/pedido";
import { base64DoDataUrl, resumoDaImpressao, type TrabalhoImpressao } from "./types/impressao";
import { codigosComFornadaNoDia, idDaFornada, type FornadaPronta } from "./types/fornada";
import { codigosEncerrados, idDoEncerramento, type AnuncioEncerrado } from "./types/anuncio";
import {
  agruparPorSegmento,
  variedadesDoPedidoSuprimentos,
  type PedidoSuprimentos,
  type Suprimento,
} from "./types/suprimento";
import {
  avisarDesfechoReposicao,
  avisarDesfechoSuprimentos,
  avisarFiliais,
  avisarListaAjustada,
  avisarListaDeSuprimentos,
  avisarListaEnviada,
  avisarMatriz,
  ErroAviso,
  explicarFalhaDeEnvio,
} from "./lib/avisarFiliais";
import { ouvirAvisosEmPrimeiroPlano, registrarAparelhoSePermitido } from "./lib/notificacoes";
import { AtivarAvisos } from "./components/AtivarAvisos";
import { PainelFornoDeHoje } from "./components/PainelFornoDeHoje";
import { PainelFornadasFilial } from "./components/PainelFornadasFilial";
import { PainelPedidosFiliais } from "./components/PainelPedidosFiliais";
import { TelaSuprimentos } from "./components/TelaSuprimentos";
import { ExportarFita } from "./components/ExportarFita";
import { fornadasNaoVistas, marcarFornadasComoVistas } from "./lib/fornadasVistas";
import { abaDaUrl } from "./lib/rota";
import { useDiaCorrente } from "./lib/useDiaCorrente";
import { prepararSom, tocarAvisoSonoro, pararAvisoSonoro } from "./lib/somDeAviso";

type Aba = "cronograma" | "fornada" | "cadastro" | "perdas" | "analises" | "pedido" | "suprimentos";

interface DefinicaoAba {
  chave: Aba;
  rotulo: string;
}

const ABAS_POR_PAPEL: Record<"matriz" | "filial", DefinicaoAba[]> = {
  matriz: [
    { chave: "fornada", rotulo: "Reposição" },
    { chave: "perdas", rotulo: "Perdas" },
    { chave: "cronograma", rotulo: "Lista de Produção" },
    { chave: "cadastro", rotulo: "Produtos" },
  ],
  filial: [
    { chave: "fornada", rotulo: "Reposição" },
    { chave: "suprimentos", rotulo: "Supri\u00ADmentos" },
    { chave: "perdas", rotulo: "Perdas" },
    { chave: "pedido", rotulo: "Lista de Produção" },
  ],
};

const SEGUNDOS_ATE_ASSUMIR_OFFLINE = 6000;
const SEGUNDOS_ATE_DESISTIR_DA_IMPRESSAO = 45_000;

export default function App() {
  const diaCorrente = useDiaCorrente();
  const [usuario, setUsuario] = useState<User | null>(null);
  const [autenticando, setAutenticando] = useState(true);
  const [migracaoResolvida, setMigracaoResolvida] = useState(false);
  
  const [notificacoesAtivas, setNotificacoesAtivas] = useState<boolean>(
    typeof window !== "undefined" && "Notification" in window ? Notification.permission === "granted" : false
  );

  const loja = useMemo(() => lojaPorEmail(usuario?.email), [usuario]);
  const repositorio = useMemo(
    () => (loja ? new RepositorioFirestore(loja.id) : null),
    [loja]
  );

  useEffect(() => {
    if (!loja) return;
    return ouvirAvisosEmPrimeiroPlano((titulo, corpo) => {
      setAviso({ tipo: "sucesso", texto: `${titulo} — ${corpo}` });
      tocarAvisoSonoro();
    });
  }, [loja]);

  useEffect(() => {
    const destravar = () => prepararSom();
    window.addEventListener("pointerdown", destravar);
    window.addEventListener("keydown", destravar);
    return () => {
      window.removeEventListener("pointerdown", destravar);
      window.removeEventListener("keydown", destravar);
    };
  }, []);

  useEffect(() => {
    return onAuthStateChanged(auth, (u) => {
      setUsuario(u);
      setAutenticando(false);
      setMigracaoResolvida(false);
      if (typeof window !== "undefined" && "Notification" in window) {
        setNotificacoesAtivas(Notification.permission === "granted");
      }
    });
  }, []);

  const [operador, setOperador] = useState("");
  /**
   * Modo de manutenção — ver api/manutencao.ts e src/lib/manutencao.ts.
   *
   * Lido uma vez na abertura. A chave mora numa variável de ambiente e só
   * muda com um deploy novo, então não há o que ficar consultando: um
   * deploy recarrega o app de qualquer jeito.
   */
  const [manutencao, setManutencao] = useState<EstadoDaManutencao>({
    ativa: false,
    aparelhosDeTeste: [],
  });
  useEffect(() => {
    void lerManutencao().then(setManutencao);
  }, []);
  const [nomeSugerido, setNomeSugerido] = useState("");
  const [aba, setAba] = useState<Aba>("cronograma");
  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [suprimentos, setSuprimentos] = useState<Suprimento[]>([]);
  const [pedidosSuprimentos, setPedidosSuprimentos] = useState<PedidoSuprimentos[]>([]);
  const [suprimentosParaImprimir, setSuprimentosParaImprimir] = useState<PedidoSuprimentos | null>(null);
  const [reposicaoParaImprimir, setReposicaoParaImprimir] = useState<PedidoFilial | null>(null);
  const [planos, setPlanos] = useState<PlanoDeProducaoDiario[]>([]);
  const [perdas, setPerdas] = useState<RegistroPerda[]>([]);
  const [pedidos, setPedidos] = useState<PedidoFilial[]>([]);
  const [fornadas, setFornadas] = useState<FornadaPronta[]>([]);
  const [anunciosEncerrados, setAnunciosEncerrados] = useState<AnuncioEncerrado[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erroCarregamento, setErroCarregamento] = useState("");
  const [aviso, setAviso] = useState<Aviso | null>(null);

  async function comRetorno<T>(
    acao: () => Promise<T>,
    mensagemSucesso: string
  ): Promise<T | undefined> {
    const promessa = acao();
    let expirou = false;
    const limite = new Promise<undefined>((resolve) =>
      setTimeout(() => {
        expirou = true;
        resolve(undefined);
      }, SEGUNDOS_ATE_ASSUMIR_OFFLINE)
    );

    try {
      const resultado = await Promise.race([promessa, limite]);
      if (expirou) {
        promessa.catch((erro) =>
          console.warn("Gravação enfileirada acabou recusada pelo servidor:", erro)
        );
        setAviso({
          tipo: "sucesso",
          texto: "Salvo neste aparelho. Vai para a nuvem assim que a internet voltar.",
        });
        return undefined;
      }
      setAviso({ tipo: "sucesso", texto: mensagemSucesso });
      return resultado;
    } catch (erro) {
      console.error("Falha ao gravar:", erro);
      setAviso({
        tipo: ehFalhaTemporariaDeRede(erro) ? "sucesso" : "erro",
        texto: mensagemDeFalhaAoSalvar(erro),
      });
      throw erro;
    }
  }

  useEffect(() => {
    if (!loja) {
      setOperador("");
      setNomeSugerido("");
      return;
    }
    setOperador("");
    setNomeSugerido(localStorage.getItem(chaveOperador(loja.id)) ?? "");
  }, [loja]);

  useEffect(() => {
    if (!repositorio || !migracaoResolvida) return;
    let cancelado = false;
    setCarregando(true);
    const essencial = Promise.all([
      repositorio.listarProdutos(),
      repositorio.listarPlanos(),
      repositorio.listarPerdas(),
    ]);

    const complementar = Promise.allSettled([
      repositorio.listarPedidos(loja?.papel === "filial" ? loja.id : undefined),
      repositorio.listarFornadas(dataDeHojeIso()),
    ]);

    Promise.all([essencial, complementar])
      .then(([[p, pl, pe], [resPedidos, resFornadas]]) => {
        if (cancelado) return;
        setProdutos(p);
        setPlanos(pl);
        setPerdas(pe);

        const faltando: string[] = [];
        if (resPedidos.status === "fulfilled") {
          setPedidos(resPedidos.value);
        } else {
          console.error("Pedidos indisponíveis:", resPedidos.reason);
          faltando.push("pedidos das filiais");
        }
        if (resFornadas.status === "fulfilled") {
          setFornadas(resFornadas.value);
        } else {
          console.error("Fornadas indisponíveis:", resFornadas.reason);
          faltando.push("fornadas de hoje");
        }
        if (faltando.length > 0) {
          setAviso({
            tipo: "erro",
            texto: `Não foi possível carregar ${faltando.join(" e ")}. Normalmente é regra de segurança do Firestore não publicada — o resto do app funciona.`,
          });
        }
        setCarregando(false);
      })
      .catch((erro) => {
        console.error("Falha ao carregar os dados da nuvem:", erro);
        if (cancelado) return;
        setErroCarregamento(
          "Não foi possível carregar os dados. Verifique a conexão — e, se este é o primeiro acesso, confirme que as regras de segurança do Firestore foram publicadas."
        );
        setCarregando(false);
      });
    return () => {
      cancelado = true;
    };
  }, [repositorio, migracaoResolvida]);

  useEffect(() => {
    if (!repositorio || !loja || carregando) return;
    const desligarPedidos = repositorio.observarPedidos(
      loja.papel === "filial" ? loja.id : undefined,
      setPedidos
    );
    const desligarFornadas = repositorio.observarFornadas(diaCorrente, setFornadas);
    const desligarAnuncios = repositorio.observarAnunciosEncerrados(
      diaCorrente,
      setAnunciosEncerrados
    );
    const desligarSuprimentos = repositorio.observarSuprimentos(setSuprimentos);
    const desligarPedidosSuprimentos = repositorio.observarPedidosSuprimentos(
      loja.papel === "filial" ? loja.id : undefined,
      setPedidosSuprimentos
    );
    return () => {
      desligarPedidos();
      desligarFornadas();
      desligarAnuncios();
      desligarSuprimentos();
      desligarPedidosSuprimentos();
    };
  }, [repositorio, loja, carregando, diaCorrente]);

  useEffect(() => {
    if (!loja || !operador) return;
    void registrarAparelhoSePermitido(loja.id, operador);
  }, [loja, operador]);

  useEffect(() => {
    const inicial = abaDaUrl(window.location.search);
    if (inicial) {
      setAba(inicial);
      window.history.replaceState(null, "", window.location.pathname);
    }

    const aoReceberRecado = (evento: MessageEvent) => {
      if (evento.data?.tipo === "tocar-aviso") {
        tocarAvisoSonoro();
        return;
      }
      if (evento.data?.tipo !== "abrir-rota" || typeof evento.data.url !== "string") return;
      const destino = abaDaUrl(evento.data.url);
      if (destino) setAba(destino);
    };
    navigator.serviceWorker?.addEventListener("message", aoReceberRecado);
    return () => navigator.serviceWorker?.removeEventListener("message", aoReceberRecado);
  }, []);

  const [fornadasNovas, setFornadasNovas] = useState(0);
  useEffect(() => {
    if (!loja) return;
    setFornadasNovas(fornadasNaoVistas(loja.id, diaCorrente, fornadas));
  }, [fornadas, loja, diaCorrente]);

  function irParaAba(destino: Aba) {
    if (destino === "fornada" && loja) {
      marcarFornadasComoVistas(loja.id, diaCorrente, fornadas);
      setFornadasNovas(0);
    }
    setAba(destino);
  }

  function chaveOperador(lojaId: string): string {
    return `padaria:operador:${lojaId}`;
  }

  function handleDefinirOperador(nome: string) {
    setOperador(nome);
    setNomeSugerido(nome);
    if (loja) localStorage.setItem(chaveOperador(loja.id), nome);
  }

  async function handleSalvarPlano(plano: PlanoDeProducaoDiario) {
    await comRetorno(() => repositorio!.salvarPlano(plano), "Cronograma salvo.");
    setPlanos((atual) => [...atual.filter((p) => p.id !== plano.id), plano]);
  }

  async function handleConfirmarProducao(planoId: string, codigosNaoProduzidos: number[]) {
    const plano = planos.find((p) => p.id === planoId);
    if (!plano) return;
    const atualizado: PlanoDeProducaoDiario = {
      ...plano,
      producaoRealizada: {
        confirmadoPor: operador,
        confirmadoEm: new Date().toISOString(),
        codigosNaoProduzidos,
      },
    };
    await comRetorno(() => repositorio!.salvarPlano(atualizado), "Produção do dia confirmada.");
    setPlanos((atual) => atual.map((p) => (p.id === planoId ? atualizado : p)));
  }

  async function handleAnularPerda(perdaId: string, motivo: string) {
    await comRetorno(
      () => repositorio!.cancelarPerda(perdaId, operador, motivo),
      "Lançamento anulado. Não conta mais nas análises."
    );
    setPerdas((atual) =>
      atual.map((p) =>
        p.id === perdaId
          ? {
              ...p,
              cancelada: true,
              canceladaPor: operador,
              canceladaEm: new Date().toISOString(),
              motivoCancelamento: motivo,
            }
          : p
      )
    );
  }

  async function handleImprimirNoCaixa(
    canvases: HTMLCanvasElement[],
    documento: string,
    nomeBase: string
  ) {
    const agora = new Date().toISOString();
    const trabalhos: TrabalhoImpressao[] = canvases.map((canvas, indice) => ({
      id: `${nomeBase}-${indice + 1}-${Date.now()}`,
      lojaId: loja!.id,
      documento,
      nomeArquivo: canvases.length > 1 ? `${nomeBase}-parte${indice + 1}.png` : `${nomeBase}.png`,
      parte: indice + 1,
      totalPartes: canvases.length,
      imagemBase64: base64DoDataUrl(canvas.toDataURL("image/png"), nomeBase),
      status: "pendente",
      criadoPor: operador,
      criadoEm: agora,
    }));

    await comRetorno(
      () => repositorio!.enviarParaImpressao(trabalhos),
      canvases.length > 1
        ? `Enviado para a impressora do caixa — ${canvases.length} partes.`
        : "Enviado para a impressora do caixa."
    );

    acompanharImpressao(trabalhos.map((t) => t.id));
  }

  function acompanharImpressao(ids: string[]) {
    if (!repositorio) return;

    let encerrado = false;
    const finalizar = () => {
      if (encerrado) return;
      encerrado = true;
      clearTimeout(relogio);
      desligar();
    };

    const desligar = repositorio.observarImpressao(ids, (estados) => {
      const resumo = resumoDaImpressao(estados, ids.length);
      if (!resumo.pronto) return;
      setAviso({ tipo: resumo.sucesso ? "sucesso" : "erro", texto: resumo.texto });
      finalizar();
    });

    const relogio = setTimeout(() => {
      setAviso({
        tipo: "erro",
        texto:
          "O caixa não respondeu. Confira se o programa de impressão está aberto no computador do caixa — a lista fica guardada e sai assim que ele abrir.",
      });
      finalizar();
    }, SEGUNDOS_ATE_DESISTIR_DA_IMPRESSAO);
  }

  async function handleEncerrarAnuncio(codigoPdv: number) {
    const hoje = dataDeHojeIso();
    const anuncio: AnuncioEncerrado = {
      id: idDoEncerramento(hoje, codigoPdv),
      data: hoje,
      codigoPdv,
      encerradoPor: operador,
      encerradoEm: new Date().toISOString(),
    };
    const nome = produtos.find((p) => p.codigoPdv === codigoPdv)?.nome ?? "Produto";
    await comRetorno(() => repositorio!.encerrarAnuncio(anuncio), `${nome} fora da lista.`);
    setAnunciosEncerrados((atual) => [...atual.filter((a) => a.id !== anuncio.id), anuncio]);
  }

  async function reabrirUmAnuncio(codigoPdv: number, hoje: string) {
    const id = idDoEncerramento(hoje, codigoPdv);
    await repositorio!.reabrirAnuncio(id);
    setAnunciosEncerrados((atual) => atual.filter((a) => a.id !== id));
  }

  async function handleReabrirTudo() {
    const hoje = dataDeHojeIso();
    const doDia = anunciosEncerrados.filter((a) => a.data === hoje);
    if (doDia.length === 0) return;
    await comRetorno(async () => {
      for (const anuncio of doDia) await repositorio!.reabrirAnuncio(anuncio.id);
    }, "Itens de volta na lista.");
    setAnunciosEncerrados((atual) => atual.filter((a) => a.data !== hoje));
  }

  const carregarFornadasDoPeriodo = useCallback(
    (dataInicio: string, dataFim: string): Promise<FornadaPronta[]> =>
      repositorio ? repositorio.listarFornadasNoPeriodo(dataInicio, dataFim) : Promise.resolve([]),
    [repositorio]
  );

  async function handleMarcarFornada(
    codigoPdv: number,
    nomeConhecido?: string,
    quantidade?: number
  ) {
    const agora = new Date().toISOString();
    const hoje = dataDeHojeIso();
    const fornada: FornadaPronta = {
      id: idDaFornada(hoje, codigoPdv, agora),
      data: hoje,
      codigoPdv,
      marcadaPor: operador,
      marcadaEm: agora,
      ...(quantidade && quantidade > 0 ? { quantidade } : {}),
    };
    const nome = nomeConhecido ?? produtos.find((p) => p.codigoPdv === codigoPdv)?.nome ?? "Produto";
    await comRetorno(() => repositorio!.marcarFornada(fornada), `${nome} saiu do forno.`);
    setFornadas((atual) => [...atual, fornada]);

    if (codigosEncerrados(anunciosEncerrados, hoje).has(codigoPdv)) {
      try {
        await reabrirUmAnuncio(codigoPdv, hoje);
      } catch (erro) {
        console.warn("Fornada marcada, mas o anúncio não reabriu:", erro);
      }
    }

    try {
      const vezesHoje = fornadas.filter((f) => f.data === hoje && f.codigoPdv === codigoPdv).length + 1;
      const resultado = await avisarFiliais(nome, codigoPdv, vezesHoje, quantidade);
      if (resultado.enviados === 0) {
        const causa = (resultado.motivos ?? []).map(explicarFalhaDeEnvio).join("; ");
        setAviso({
          tipo: "sucesso",
          texto: resultado.registrados
            ? `${nome} saiu do forno. O aviso não chegou às filiais${causa ? `: ${causa}` : "."}`
            : `${nome} saiu do forno. Nenhum aparelho de filial está recebendo avisos ainda — cada filial precisa tocar em "Ativar" uma vez, no celular dela.`,
        });
      }
    } catch (erro) {
      console.warn("Fornada marcada, mas o aviso às filiais não saiu:", erro);
      setAviso({
        tipo: "sucesso",
        texto: `${nome} saiu do forno. O aviso não saiu: ${
          erro instanceof ErroAviso ? erro.message : "servidor indisponível"
        }`,
      });
    }
  }

  async function handleSalvarPedido(pedido: PedidoFilial) {
    await comRetorno(
      () => repositorio!.salvarPedido(pedido),
      "Pedido enviado para a matriz."
    );
    setPedidos((atual) => [...atual.filter((p) => p.id !== pedido.id), pedido]);
    await avisarMatrizDoPedido(pedido);
  }

  async function avisarMatrizDoPedido(pedido: PedidoFilial) {
    try {
      if (ehReposicao(pedido)) {
        const item = pedido.itens[0];
        if (item) {
          const nome = produtos.find((p) => p.codigoPdv === item.codigoPdv)?.nome ?? "Produto";
          await avisarMatriz(
            nome,
            item.codigoPdv,
            item.quantidadeUnidades,
            pedido.itens.length
          );
        }
      } else if (pedido.status === "enviado") {
        await avisarListaEnviada(pedido.itens.length);
      }
    } catch (erro) {
      console.warn("Pedido gravado, mas o aviso à matriz não saiu:", erro);
    }
  }

  async function handleCadastrarSuprimento(suprimento: Suprimento) {
    await comRetorno(
      () => repositorio!.salvarSuprimento(suprimento),
      `"${suprimento.nome}" entrou na lista de suprimentos.`
    );
    setSuprimentos((atual) => [
      ...atual.filter((s) => s.id !== suprimento.id),
      suprimento,
    ]);
  }

  async function handleEnviarSuprimentos(pedido: PedidoSuprimentos) {
    await comRetorno(
      () => repositorio!.salvarPedidoSuprimentos(pedido),
      "Lista de suprimentos enviada para a matriz."
    );
    setPedidosSuprimentos((atual) => [...atual.filter((p) => p.id !== pedido.id), pedido]);

    try {
      await avisarListaDeSuprimentos(variedadesDoPedidoSuprimentos(pedido));
    } catch (erro) {
      console.warn("Lista de suprimentos gravada, mas o aviso à matriz não saiu:", erro);
    }
  }

  async function handleAjustarPedido(pedido: PedidoFilial) {
    await comRetorno(
      () => repositorio!.salvarPedido(pedido),
      `Lista de ${nomeDaLoja(pedido.lojaId)} confirmada.`
    );
    setPedidos((atual) => [...atual.filter((p) => p.id !== pedido.id), pedido]);

    const diferencas = diferencasDoAjuste(pedido);
    if (diferencas.length === 0) return;
    try {
      await avisarListaAjustada(pedido.lojaId, diferencas.length);
    } catch (erro) {
      console.warn("Lista ajustada, mas o aviso à filial não saiu:", erro);
    }
  }

  async function registrarNaProducaoDeHoje(pedido: PedidoFilial) {
    const hoje = dataDeHojeIso();
    const agora = new Date().toISOString();
    let plano = planos.find((p) => p.data === hoje && p.status === "confirmado");

    for (const item of pedido.itens) {
      const categoria = produtos.find((p) => p.codigoPdv === item.codigoPdv)?.categoria;
      if (!categoria) continue;
      const atualizado = plano
        ? incluirItemProduzido(plano, item, categoria, gerarId)
        : planoDeHojeCom(hoje, diaDaSemanaDeData(hoje), item, categoria, operador, agora, gerarId);

      if (!atualizado) continue;
      await repositorio!.salvarPlano(atualizado);
      plano = atualizado;
      setPlanos((atual) => [...atual.filter((p) => p.id !== atualizado.id), atualizado]);
    }
  }

  async function handleDecidirReposicao(
    pedido: PedidoFilial,
    desfecho: "confirmado" | "cancelado",
    motivo?: string
  ) {
    const decidido = decidirReposicao(pedido, desfecho, operador, motivo);
    await comRetorno(
      () => repositorio!.salvarPedido(decidido),
      desfecho === "confirmado" ? "Reposição confirmada." : "Reposição cancelada."
    );
    setPedidos((atual) => [...atual.filter((p) => p.id !== decidido.id), decidido]);

    await Promise.allSettled([
      registrarReposicaoNaProducao(decidido, desfecho),
      avisarFilialDoDesfecho(decidido, desfecho, motivo),
    ]);
  }

  async function handleDecidirSuprimentos(
    pedido: PedidoSuprimentos,
    desfecho: "confirmado" | "cancelado",
    motivo?: string
  ) {
    const agora = new Date().toISOString();
    const atualizado: PedidoSuprimentos = {
      ...pedido,
      atendimento: {
        desfecho,
        por: operador,
        em: agora,
        ...(motivo ? { motivo } : {}),
      },
    };
    await comRetorno(
      () => repositorio!.salvarPedidoSuprimentos(atualizado),
      desfecho === "confirmado" ? "Suprimentos confirmados." : "Suprimentos cancelados."
    );
    setPedidosSuprimentos((atual) => [...atual.filter((p) => p.id !== atualizado.id), atualizado]);

    try {
      await avisarDesfechoSuprimentos(pedido.lojaId, desfecho, motivo);
    } catch (erro) {
      console.warn("Decisão de suprimentos gravada, mas o aviso à filial não saiu:", erro);
    }
  }

  async function registrarReposicaoNaProducao(
    pedido: PedidoFilial,
    desfecho: "confirmado" | "cancelado"
  ) {
    if (desfecho !== "confirmado") return;
    try {
      await registrarNaProducaoDeHoje(pedido);
    } catch (erro) {
      console.warn("Reposição confirmada, mas o item não entrou na produção de hoje:", erro);
    }
  }

  async function avisarFilialDoDesfecho(
    pedido: PedidoFilial,
    desfecho: "confirmado" | "cancelado",
    motivo?: string
  ) {
    try {
      const item = pedido.itens[0];
      if (!item) return;
      const nome = produtos.find((p) => p.codigoPdv === item.codigoPdv)?.nome ?? "Produto";
      await avisarDesfechoReposicao(pedido.lojaId, nome, item.codigoPdv, desfecho, motivo);
    } catch (erro) {
      console.warn("Decisão gravada, mas o aviso à filial não saiu:", erro);
    }
  }

  async function handleCriarProduto(input: NovoProdutoInput) {
    const promessa = repositorio!.salvarNovoProduto(input);
    promessa
      .then((novo) => setProdutos((atual) => [...atual, novo]))
      .catch(() => {});
    await comRetorno(() => promessa, `"${input.nome}" cadastrado no catálogo.`);
  }

  async function handleCadastroRelampago(input: NovoProdutoInput): Promise<Produto | undefined> {
    const promessa = repositorio!.salvarNovoProduto(input);
    promessa
      .then((novo) => setProdutos((atual) => [...atual, novo]))
      .catch(() => {});
    return await comRetorno(() => promessa, `"${input.nome}" cadastrado no catálogo.`);
  }

  async function handleAtualizarProduto(produto: Produto) {
    await comRetorno(() => repositorio!.atualizarProduto(produto), `"${produto.nome}" atualizado.`);
    setProdutos((atual) => atual.map((p) => (p.codigoPdv === produto.codigoPdv ? produto : p)));
  }

  async function handleExcluirProdutos(codigosPdv: number[]) {
    await comRetorno(
      () => repositorio!.excluirProdutos(codigosPdv),
      `${codigosPdv.length} ${codigosPdv.length === 1 ? "produto excluído" : "produtos excluídos"} do catálogo.`
    );
    const remover = new Set(codigosPdv);
    setProdutos((atual) => atual.filter((p) => !remover.has(p.codigoPdv)));
  }

  async function handleRegistrarPerda(payload: {
    codigoPdv: number;
    planoDeProducaoId: string;
    quantidadeQuilos: number;
    pesoUnitarioGramasInformado: number;
    quantidadeUnidadesEstimada: number;
    motivo: RegistroPerda["motivo"];
    observacao?: string;
    registradoPor: string;
  }) {
    const hoje = dataDeHojeIso();
    const input: LancamentoPerdaInput = {
      codigoPdv: payload.codigoPdv,
      planoDeProducaoId: payload.planoDeProducaoId,
      quantidadeQuilos: payload.quantidadeQuilos,
      pesoUnitarioGramasInformado: payload.pesoUnitarioGramasInformado,
      motivo: payload.motivo,
      observacao: payload.observacao,
      registradoPor: payload.registradoPor,
    };
    const promessaPerda = repositorio!.registrarPerda({
      ...input,
      quantidadeUnidadesEstimada: payload.quantidadeUnidadesEstimada,
      diaDaSemana: diaDaSemanaDeData(hoje),
      data: hoje,
    });
    promessaPerda
      .then((registro) => setPerdas((atual) => [...atual, registro]))
      .catch(() => {});
    await comRetorno(() => promessaPerda, `Perda registrada: ${payload.quantidadeQuilos} kg.`);

    const produto = produtos.find((p) => p.codigoPdv === payload.codigoPdv);
    if (produto && produto.pesoMedioUnitarioGramas !== payload.pesoUnitarioGramasInformado) {
      const atualizado = { ...produto, pesoMedioUnitarioGramas: payload.pesoUnitarioGramasInformado };
      try {
        await repositorio!.atualizarProduto(atualizado);
        setProdutos((atual) => atual.map((p) => (p.codigoPdv === atualizado.codigoPdv ? atualizado : p)));
      } catch (erro) {
        console.warn("Peso médio do produto não foi atualizado (a perda foi registrada normalmente):", erro);
      }
    }
  }

  if (autenticando) return <div className="carregando">Abrindo...</div>;
  if (!usuario) return <TelaLogin />;

  if (!loja || !repositorio) {
    return (
      <div className="tela-identificacao">
        <h1>Acesso não reconhecido</h1>
        <p>A conta <strong>{usuario.email}</strong> não está ligada a nenhuma loja. Entre com uma das contas de loja.</p>
        <button type="button" className="primario" onClick={() => signOut(auth)}>Sair</button>
      </div>
    );
  }

  if (!notificacoesAtivas) {
    return (
      <div className="tela-identificacao">
        <h1>Notificações Desativadas</h1>
        <p>
          Este aplicativo exige que as <strong>notificações do navegador</strong> estejam ativadas para garantir que os avisos urgentes de fornada e reposição não se percam.
        </p>
        <p className="nota-rodape" style={{ marginBottom: "20px" }}>
          Por favor, clique no ícone de cadeado ou configurações na barra de endereços do seu navegador, permita as notificações e recarregue a página.
        </p>
        <button
          type="button"
          className="primario"
          onClick={async () => {
            if (typeof window !== "undefined" && "Notification" in window) {
              const permissao = await Notification.requestPermission();
              if (permissao === "granted") {
                setNotificacoesAtivas(true);
              } else {
                alert("As notificações continuam bloqueadas nas configurações do navegador.");
              }
            }
          }}
        >
          Permitir notificações agora
        </button>
      </div>
    );
  }

  if (!migracaoResolvida) {
    return <ImportarDadosLocais repositorio={repositorio} onConcluido={() => setMigracaoResolvida(true)} />;
  }

  if (carregando) return <div className="carregando">Carregando...</div>;

  if (erroCarregamento) {
    return (
      <div className="tela-identificacao">
        <h1>Não foi possível carregar</h1>
        <p className="erro-conversao">{erroCarregamento}</p>
        <button type="button" className="primario" onClick={() => window.location.reload()}>Tentar de novo</button>
        <button type="button" className="link" onClick={() => signOut(auth)}>sair desta loja</button>
      </div>
    );
  }

  if (!operador) {
    return <TelaIdentificacao onConfirmar={handleDefinirOperador} nomeDaLoja={loja.nome} nomeSugerido={nomeSugerido} />;
  }

  const abasVisiveis = ABAS_POR_PAPEL[loja.papel];
  const abaAtual = abasVisiveis.some((a) => a.chave === aba) ? aba : abasVisiveis[0].chave;

  return (
    <div className="app">
      {/* A FAIXA DA MANUTENÇÃO VEM ANTES DE TUDO (ago/2026).

          A chave mora fora do app, na Vercel — e é justamente por isso
          que ela precisa aparecer aqui: sem a faixa, os avisos param de
          chegar e ninguém liga uma coisa à outra. Passa um dia, passa uma
          semana, e a padaria conclui que o recurso quebrou. */}
      {manutencao.ativa && (
        <div className="faixa-manutencao" role="status">
          {fraseDaManutencao(manutencao)}
        </div>
      )}
      <header className="cabecalho-app">
        <div><strong className="loja-atual">{loja.nome}</strong></div>
        <div className="operador-atual">
          {operador}
          <button type="button" className="link" onClick={() => handleDefinirOperador("")}>trocar</button>
          <button type="button" className="link" onClick={() => { handleDefinirOperador(""); signOut(auth); }}>sair</button>
        </div>
      </header>

      <AvisoGlobal 
        aviso={aviso} 
        onFechar={() => {
          setAviso(null);
          pararAvisoSonoro();
        }} 
      />

      <BannerInstalar />

      <AvisoPerdaPendente
        produtos={produtos}
        planos={planos}
        perdas={perdas}
        visivel={aba !== "perdas"}
        onIrParaPerdas={() => irParaAba("perdas")}
      />

      {loja.papel === "matriz" && <AtivarAvisos loja={loja} operador={operador} />}

      <nav className="abas-principais">
        {abasVisiveis.map((a) => (
          <button
            key={a.chave}
            type="button"
            className={abaAtual === a.chave ? "ativa" : ""}
            onClick={() => irParaAba(a.chave)}
          >
            {a.rotulo}
            {a.chave === "fornada" && fornadasNovas > 0 && (
              <span className="selo-aba" aria-label={`${fornadasNovas} fornadas novas`}>{fornadasNovas}</span>
            )}
          </button>
        ))}
      </nav>

      <main className="conteudo-app">
        {suprimentosParaImprimir && (
          <div className="tela">
            <h2>Suprimentos — {nomeDaLoja(suprimentosParaImprimir.lojaId)}</h2>
            <ExportarFita
              blocos={agruparPorSegmento(suprimentosParaImprimir.itens, suprimentos).map((grupo) => ({
                rotuloSessao: grupo.rotulo,
                itens: [],
                linhasProntas: grupo.itens.map((i) => ({ nome: i.nome, unidades: i.quantidade })),
              }))}
              titulo={nomeDaLoja(suprimentosParaImprimir.lojaId)}
              instrucao="Embalagens e material de limpeza pedidos por esta loja. Um papel só, do começo ao fim — leve para a compra."
              dataFormatada={formatarDataBr(suprimentosParaImprimir.data)}
              produtos={produtos}
              montadoPor={operador}
              formato="continuo"
              nomeArquivoBase={`suprimentos-${suprimentosParaImprimir.lojaId.toLowerCase()}-${suprimentosParaImprimir.data}`}
              onImprimirNoCaixa={(canvases, titulo) =>
                handleImprimirNoCaixa(canvases, `Suprimentos — ${titulo}`, `suprimentos-${suprimentosParaImprimir.lojaId.toLowerCase()}-${suprimentosParaImprimir.data}`)
              }
            />
            <div className="acoes">
              <button type="button" className="secundario" onClick={() => setSuprimentosParaImprimir(null)}>Voltar</button>
            </div>
          </div>
        )}

        {reposicaoParaImprimir && (
          <div className="tela">
            <h2>Reposição — {nomeDaLoja(reposicaoParaImprimir.lojaId)}</h2>
            <ExportarFita
              blocos={[{ rotuloSessao: "Reposição", itens: reposicaoParaImprimir.itens }]}
              titulo={nomeDaLoja(reposicaoParaImprimir.lojaId)}
              instrucao="O que esta loja pediu agora. Separe e mande na próxima entrega."
              dataFormatada={formatarDataBr(reposicaoParaImprimir.data)}
              produtos={produtos}
              montadoPor={operador}
              formato="continuo"
              nomeArquivoBase={`reposicao-${reposicaoParaImprimir.lojaId.toLowerCase()}-${reposicaoParaImprimir.data}`}
              onImprimirNoCaixa={(canvases, titulo) =>
                handleImprimirNoCaixa(canvases, `Reposição — ${titulo}`, `reposicao-${reposicaoParaImprimir.lojaId.toLowerCase()}-${reposicaoParaImprimir.data}`)
              }
            />
            <div className="acoes">
              <button type="button" className="secundario" onClick={() => setReposicaoParaImprimir(null)}>Voltar</button>
            </div>
          </div>
        )}

        {!suprimentosParaImprimir && !reposicaoParaImprimir && (
        <>
        {abaAtual === "cronograma" && (
          <TelaCronograma
            produtos={produtos}
            pedidos={pedidos}
            onConfirmarProducao={handleConfirmarProducao}
            onImprimirNoCaixa={handleImprimirNoCaixa}
            fornadas={fornadas}
            planos={planos}
            perdas={perdas}
            operador={operador}
            hoje={diaCorrente}
            onSalvarPlano={handleSalvarPlano}
            onAjustarPedido={handleAjustarPedido}
          />
        )}
        {abaAtual === "fornada" &&
          (loja.papel === "matriz" ? (
            <>
              <PainelPedidosFiliais
                pedidos={pedidos}
                data={diaCorrente}
                somenteReposicoes
                reposicoesDeHoje={pedidos.filter((p) => p.data === diaCorrente && p.tipo === "reposicao")}
                onDecidirReposicao={handleDecidirReposicao}
                pedidosSuprimentos={pedidosSuprimentos}
                catalogoSuprimentos={suprimentos}
                onDecidirSuprimentos={handleDecidirSuprimentos}
                onImprimirReposicao={setReposicaoParaImprimir}
                nomeDoProduto={(codigo) => produtos.find((p) => p.codigoPdv === codigo)?.nome ?? `#${codigo}`}
                saiuDoForno={(codigo) => codigosComFornadaNoDia(fornadas, diaCorrente).has(codigo)}
                onImprimirSuprimentos={setSuprimentosParaImprimir}
              />
              <PainelFornoDeHoje
                produtos={produtos}
                fornadas={fornadas}
                pedidos={pedidos}
                dataHoje={diaCorrente}
                encerrados={codigosEncerrados(anunciosEncerrados, diaCorrente)}
                onEncerrarAnuncio={handleEncerrarAnuncio}
                onReabrirTudo={handleReabrirTudo}
                onMarcarFornada={handleMarcarFornada}
                onCadastrarProduto={handleCadastroRelampago}
              />
            </>
          ) : (
            <PainelFornadasFilial
              loja={loja}
              produtos={produtos}
              fornadas={fornadas}
              pedidos={pedidos}
              pedidosSuprimentos={pedidosSuprimentos}
              catalogoSuprimentos={suprimentos}
              operador={operador}
              encerrados={codigosEncerrados(anunciosEncerrados, diaCorrente)}
              onSalvarPedido={handleSalvarPedido}
            />
          ))}

        {abaAtual === "suprimentos" && (
          <TelaSuprimentos
            loja={loja}
            catalogo={suprimentos}
            pedidos={pedidosSuprimentos}
            operador={operador}
            hoje={diaCorrente}
            onCadastrarSuprimento={handleCadastrarSuprimento}
            onEnviarLista={handleEnviarSuprimentos}
          />
        )}

        {abaAtual === "pedido" && (
          <TelaPedidoFilial
            loja={loja}
            produtos={produtos}
            pedidos={pedidos}
            perdas={perdas}
            operador={operador}
            hoje={diaCorrente}
            onSalvarPedido={handleSalvarPedido}
          />
        )}
        {abaAtual === "cadastro" && (
          <TelaCadastroProdutos
            produtos={produtos}
            onCriarProduto={handleCriarProduto}
            onAtualizarProduto={handleAtualizarProduto}
            onExcluirProdutos={handleExcluirProdutos}
          />
        )}
        {abaAtual === "perdas" && (
          <TelaPerdas
            produtos={produtos}
            planos={planos}
            perdas={perdas}
            loja={loja}
            operador={operador}
            ehMatriz={loja.papel === "matriz"}
            hoje={diaCorrente}
            onAnularPerda={handleAnularPerda}
            onRegistrarPerda={handleRegistrarPerda}
          />
        )}
        {abaAtual === "analises" && (
          <TelaAnalises
            produtos={produtos}
            planos={planos}
            perdas={perdas}
            pedidos={pedidos}
            loja={loja}
            ehMatriz={loja.papel === "matriz"}
            carregarFornadas={carregarFornadasDoPeriodo}
          />
        )}
        </>
        )}
      </main>

      <footer className="rodape-versao">
        {loja.nome} · versão de {__VERSAO_APP__}
      </footer>
    </div>
  );
}

function TelaIdentificacao({ onConfirmar, nomeDaLoja, nomeSugerido }: { onConfirmar: (nome: string) => void; nomeDaLoja: string; nomeSugerido: string; }) {
  const [nome, setNome] = useState("");
  const [digitando, setDigitando] = useState(!nomeSugerido);

  return (
    <div className="tela-identificacao">
      <img className="marca-login" src="/logo-pao-de-mel.png" alt="Padaria Pão de Mel" width="320" height="115" />
      <p className="subtitulo">{nomeDaLoja}</p>
      {!digitando ? (
        <>
          <p className="pergunta-entrada">Continuar como</p>
          <button type="button" className="botao-continuar" onClick={() => onConfirmar(nomeSugerido)}>{nomeSugerido}</button>
          <button type="button" className="link" onClick={() => setDigitando(true)}>é outra pessoa</button>
        </>
      ) : (
        <>
          <p className="pergunta-entrada">Quem está lançando os dados hoje?</p>
          <form onSubmit={(e) => { e.preventDefault(); if (nome.trim()) onConfirmar(nome.trim()); }}>
            <input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Seu nome" autoFocus />
            <button type="submit" className="primario" disabled={nome.trim() === ""}>Entrar</button>
          </form>
          {nomeSugerido && <button type="button" className="link" onClick={() => setDigitando(false)}>voltar</button>}
        </>
      )}
      <p className="nota-rodape">O nome fica junto de cada lançamento, para saber quem registrou o quê.</p>
    </div>
  );
}