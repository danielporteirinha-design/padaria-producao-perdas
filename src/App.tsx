import { useEffect, useMemo, useState } from "react";
import { onAuthStateChanged, signOut, type User } from "firebase/auth";
import type { Produto, NovoProdutoInput } from "./types/produto";
import type { PlanoDeProducaoDiario } from "./types/producao";
import type { RegistroPerda, LancamentoPerdaInput } from "./types/perda";
import { RepositorioFirestore } from "./data/repositorioFirestore";
import { auth } from "./lib/firebase";
import { lojaPorEmail } from "./lib/lojas";
import { TelaLogin } from "./components/TelaLogin";
import { ImportarDadosLocais } from "./components/ImportarDadosLocais";
import { AvisoGlobal, type Aviso } from "./components/AvisoGlobal";
import { ehFalhaTemporariaDeRede, mensagemDeFalhaAoSalvar } from "./lib/errosFirestore";
import { dataDeHojeIso, diaDaSemanaDeData } from "./lib/data";
import { TelaCronograma } from "./components/TelaCronograma";
import { TelaCadastroProdutos } from "./components/TelaCadastroProdutos";
import { TelaPerdas } from "./components/TelaPerdas";
import { TelaAnalises } from "./components/TelaAnalises";
import { BannerInstalar } from "./components/BannerInstalar";
import { AvisoPerdaPendente } from "./components/AvisoPerdaPendente";
import { TelaPedidoFilial } from "./components/TelaPedidoFilial";
import { decidirReposicao, ehReposicao, type PedidoFilial } from "./types/pedido";
import { base64DoDataUrl, type TrabalhoImpressao } from "./types/impressao";
import { idDaFornada, type FornadaPronta } from "./types/fornada";
import {
  avisarDesfechoReposicao,
  avisarFiliais,
  avisarMatriz,
  ErroAviso,
  explicarFalhaDeEnvio,
} from "./lib/avisarFiliais";
import { ouvirAvisosEmPrimeiroPlano } from "./lib/notificacoes";
import { AtivarAvisos } from "./components/AtivarAvisos";

type Aba = "cronograma" | "cadastro" | "perdas" | "analises" | "pedido";

interface DefinicaoAba {
  chave: Aba;
  rotulo: string;
}

/**
 * Quais abas cada perfil enxerga (ago/2026).
 *
 * A filial não produz — ela pede e lança as próprias perdas. Cronograma,
 * Catálogo e Análises são da matriz, e as regras do Firestore já negariam
 * gravação vinda da filial nesses lugares; deixar as abas visíveis só
 * ofereceria caminhos que terminam em "sem permissão".
 *
 * Cronograma também sai da filial pelo mesmo motivo: confirmar produção
 * seria recusado pelo banco. O lugar da filial nesse fluxo é a tela de
 * Pedido, que entra na Parte B — até lá a filial trabalha só em Perdas.
 */
const ABAS_POR_PAPEL: Record<"matriz" | "filial", DefinicaoAba[]> = {
  matriz: [
    { chave: "cronograma", rotulo: "Cronograma" },
    { chave: "cadastro", rotulo: "Produtos" },
    { chave: "perdas", rotulo: "Perdas" },
    { chave: "analises", rotulo: "Análises" },
  ],
  filial: [
    { chave: "pedido", rotulo: "Pedido" },
    { chave: "perdas", rotulo: "Perdas" },
  ],
};

/**
 * Quanto esperar a confirmação do servidor antes de assumir que a
 * gravação está apenas enfileirada offline (ver comRetorno). Generoso o
 * bastante para uma conexão ruim confirmar de verdade, curto o bastante
 * para o operador não achar que o app travou.
 */
const SEGUNDOS_ATE_ASSUMIR_OFFLINE = 6000;

/**
 * A partir de ago/2026 o app atende três lojas e os dados vivem no
 * Firestore (ver src/lib/firebase.ts). O componente tem agora três portões
 * antes do conteúdo, nesta ordem:
 *
 *   1. Autenticação — qual LOJA está usando o app (TelaLogin)
 *   2. Migração — só na virada, e só na matriz (ImportarDadosLocais)
 *   3. Identificação — qual PESSOA está digitando (TelaIdentificacao)
 *
 * Loja e pessoa são coisas diferentes de propósito: a loja diz de onde o
 * dado vem e é o que as regras de segurança verificam; o nome diz quem
 * lançou, e serve para rastrear quem preencheu o quê dentro da loja.
 */
export default function App() {
  const [usuario, setUsuario] = useState<User | null>(null);
  const [autenticando, setAutenticando] = useState(true);
  const [migracaoResolvida, setMigracaoResolvida] = useState(false);

  const loja = useMemo(() => lojaPorEmail(usuario?.email), [usuario]);

  // O repositório carrega a loja da sessão para carimbar a origem dos
  // registros — por isso só pode ser criado depois do login.
  const repositorio = useMemo(
    () => (loja ? new RepositorioFirestore(loja.id) : null),
    [loja]
  );

  /**
   * Aviso que chega com o app ABERTO. O service worker não é chamado
   * nesse caso, então sem isto quem está justamente usando o app não
   * veria o aviso de fornada pronta.
   */
  useEffect(() => {
    // Todas as lojas, não só as filiais: desde que o aviso passou a
    // correr nos dois sentidos, é a MATRIZ quem recebe o pedido de
    // reposição — e era justamente ela que não escutava nada aqui.
    if (!loja) return;
    return ouvirAvisosEmPrimeiroPlano((titulo, corpo) =>
      setAviso({ tipo: "sucesso", texto: `${titulo} — ${corpo}` })
    );
  }, [loja]);

  useEffect(() => {
    // onAuthStateChanged dispara também na abertura do app, restaurando a
    // sessão gravada no aparelho — é o que faz o operador não precisar
    // entrar toda vez.
    return onAuthStateChanged(auth, (u) => {
      setUsuario(u);
      setAutenticando(false);
      setMigracaoResolvida(false);
    });
  }, []);

  // O nome fica gravado POR LOJA. Sem isso, entrar como filial num
  // aparelho que já tinha sido usado pela matriz herdava o nome antigo —
  // o app não perguntava nada e os lançamentos da filial saíam assinados
  // por quem usou o celular antes (defeito relatado em produção).
  const [operador, setOperador] = useState("");
  const [aba, setAba] = useState<Aba>("cronograma");
  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [planos, setPlanos] = useState<PlanoDeProducaoDiario[]>([]);
  const [perdas, setPerdas] = useState<RegistroPerda[]>([]);
  const [pedidos, setPedidos] = useState<PedidoFilial[]>([]);
  const [fornadas, setFornadas] = useState<FornadaPronta[]>([]);
  const [carregando, setCarregando] = useState(true);

  const [erroCarregamento, setErroCarregamento] = useState("");
  const [aviso, setAviso] = useState<Aviso | null>(null);

  /**
   * Envelope de TODA gravação do app. Existe para que nenhuma tela
   * precise lembrar de tratar falha de rede ou de permissão: o retorno
   * visual é o mesmo em todo lugar, e é impossível uma tela nova nascer
   * sem ele.
   *
   * O LIMITE DE ESPERA não é detalhe — é o que torna offline utilizável.
   * Com persistência local, uma escrita feita sem rede é enfileirada e a
   * promessa do Firestore fica PENDENTE indefinidamente, até reconectar.
   * Sem o limite, o botão ficaria em "Salvando..." o resto do expediente
   * mesmo com o dado já salvo no aparelho — que é exatamente a
   * experiência que se quer evitar numa cozinha com wifi ruim.
   *
   * Passado o limite, tratamos como sucesso local: o dado ESTÁ gravado
   * (o cache do Firestore já o aplicou) e vai subir sozinho. A promessa
   * original continua viva em segundo plano só para registrar no console
   * se acabar sendo recusada.
   *
   * Relança o erro de propósito. A tela que chamou continua responsável
   * por soltar o próprio "Salvando..." num `finally` — sem o relance,
   * um botão travaria em silêncio, que foi o defeito que motivou isto.
   */
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

  // Carrega o nome gravado para ESTA loja sempre que a loja muda.
  useEffect(() => {
    if (!loja) {
      setOperador("");
      return;
    }
    setOperador(localStorage.getItem(chaveOperador(loja.id)) ?? "");
  }, [loja]);

  useEffect(() => {
    if (!repositorio || !migracaoResolvida) return;
    let cancelado = false;
    setCarregando(true);
    /**
     * Duas camadas de propósito.
     *
     * ESSENCIAL (produtos, planos, perdas): sem isso não há app. Falhou,
     * mostra a tela de erro.
     *
     * COMPLEMENTAR (pedidos, fornadas): o app funciona sem. Falhou, entra
     * vazio e avisa numa faixa, sem bloquear.
     *
     * A separação nasceu de um caso real (ago/2026): uma coleção NOVA foi
     * ao ar antes de as regras do Firestore serem republicadas, a leitura
     * dela foi negada, e como tudo estava num Promise.all a rejeição
     * derrubou o app inteiro — inclusive as telas que não dependiam dela.
     * Cada coleção nova traria o mesmo risco.
     */
    const essencial = Promise.all([
      repositorio.listarProdutos(),
      repositorio.listarPlanos(),
      repositorio.listarPerdas(),
    ]);

    const complementar = Promise.allSettled([
      // A filial só pode ler os próprios pedidos (ver firestore.rules) —
      // sem o filtro, a consulta dela seria recusada inteira.
      repositorio.listarPedidos(loja?.papel === "filial" ? loja.id : undefined),
      // Só as fornadas de HOJE: elas acumulam rápido (um item que sai 6
      // vezes ao dia, vezes dezenas de itens) e a tela só olha o dia.
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
        // Nunca deixar a tela presa em "Carregando..." sem explicação:
        // com o Firestore, uma falha aqui costuma ser regra de segurança
        // não publicada ou primeira abertura sem internet.
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

  /**
   * Escuta ao vivo dos dados que mudam DURANTE o expediente.
   *
   * Defeito que motivou isto (ago/2026): a filial pedia reposição e a
   * matriz só via depois de recarregar a página — num pedido que existe
   * justamente porque é urgente. A carga única da abertura tratava dado
   * vivo como se fosse estático.
   *
   * Só pedidos e fornadas. Catálogo, cronograma e perdas mudam por ação
   * de quem está com a tela na mão, e escutar tudo custaria leitura sem
   * mudar nada na prática.
   */
  useEffect(() => {
    if (!repositorio || !loja || carregando) return;
    const desligarPedidos = repositorio.observarPedidos(
      loja.papel === "filial" ? loja.id : undefined,
      setPedidos
    );
    const desligarFornadas = repositorio.observarFornadas(dataDeHojeIso(), setFornadas);
    return () => {
      desligarPedidos();
      desligarFornadas();
    };
  }, [repositorio, loja, carregando]);

  function chaveOperador(lojaId: string): string {
    return `padaria:operador:${lojaId}`;
  }

  function handleDefinirOperador(nome: string) {
    setOperador(nome);
    if (loja) localStorage.setItem(chaveOperador(loja.id), nome);
  }

  async function handleSalvarPlano(plano: PlanoDeProducaoDiario) {
    await comRetorno(() => repositorio!.salvarPlano(plano), "Cronograma salvo.");
    setPlanos((atual) => [...atual.filter((p) => p.id !== plano.id), plano]);
  }

  /**
   * Registra o que REALMENTE saiu do forno num plano já confirmado.
   * O plano em si não é reescrito — as sessões continuam guardando a
   * intenção, e o resultado entra em `producaoRealizada` (ver
   * src/lib/producaoRealizada.ts).
   */
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

  /**
   * Anula um lançamento de perda errado (só a matriz). O registro
   * continua existindo, marcado — ver RegistroPerda.cancelada.
   */
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

  /**
   * Enfileira as imagens para a impressora térmica do caixa. Uma imagem
   * por documento no Firestore — ver src/types/impressao.ts sobre por que
   * não vai tudo num só, e agente-impressao/ sobre quem imprime do outro
   * lado.
   */
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
  }

  /**
   * Marca que uma fornada do produto acabou de sair do forno. Um toque,
   * sem quantidade — ver src/types/fornada.ts sobre por quê.
   */
  async function handleMarcarFornada(codigoPdv: number) {
    const agora = new Date().toISOString();
    const hoje = dataDeHojeIso();
    const fornada: FornadaPronta = {
      id: idDaFornada(hoje, codigoPdv, agora),
      data: hoje,
      codigoPdv,
      marcadaPor: operador,
      marcadaEm: agora,
    };
    const nome = produtos.find((p) => p.codigoPdv === codigoPdv)?.nome ?? "Produto";
    await comRetorno(() => repositorio!.marcarFornada(fornada), `${nome} saiu do forno.`);
    setFornadas((atual) => [...atual, fornada]);

    /**
     * Avisar as filiais é EFEITO, não a operação. Se o push falhar (chave
     * não configurada, servidor fora do ar, nenhuma filial ativou), a
     * fornada já está gravada e as filiais veem ao abrir o app. Falhar
     * aqui em vermelho faria o operador achar que precisa marcar de novo.
     */
    try {
      const vezesHoje = fornadas.filter((f) => f.data === hoje && f.codigoPdv === codigoPdv).length + 1;
      const resultado = await avisarFiliais(nome, codigoPdv, vezesHoje);
      /**
       * Só fala quando ALGO impediu o aviso de chegar. Envio normal segue
       * calado: confirmar "3 aparelhos avisados" a cada fornada seria seis
       * mensagens por dia só de pão francês, e mensagem que aparece sempre
       * deixa de ser lida.
       */
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

    /**
     * Só REPOSIÇÃO avisa a matriz por push. O pedido diário é planejamento
     * — a matriz o consolida no fim do expediente e não precisa ser
     * interrompida por ele. Reposição é o contrário: existe porque o
     * produto está faltando no balcão AGORA, e um aviso que espera alguém
     * lembrar de abrir a tela perdeu a razão de existir.
     *
     * Como no aviso de fornada, falhar aqui não desfaz o pedido: ele já
     * está gravado e a matriz o vê na tela de qualquer forma.
     */
    if (ehReposicao(pedido)) {
      try {
        const item = pedido.itens[0];
        if (item) {
          const nome = produtos.find((p) => p.codigoPdv === item.codigoPdv)?.nome ?? "Produto";
          await avisarMatriz(nome, item.codigoPdv, item.quantidadeUnidades);
        }
      } catch (erro) {
        console.warn("Reposição gravada, mas o aviso à matriz não saiu:", erro);
      }
    }
  }

  /**
   * A matriz responde a uma reposição: confirmada (vai na próxima
   * entrega) ou cancelada (com motivo). O motivo é obrigatório e a regra
   * vive em decidirReposicao — a tela só a apresenta.
   *
   * A gravação vem primeiro e o aviso depois, na ordem que importa: a
   * decisão precisa ficar registrada mesmo que o push falhe. A filial vê
   * o desfecho na tela de qualquer forma, porque os pedidos agora chegam
   * em tempo real.
   */
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

    try {
      const item = decidido.itens[0];
      if (item) {
        const nome = produtos.find((p) => p.codigoPdv === item.codigoPdv)?.nome ?? "Produto";
        await avisarDesfechoReposicao(decidido.lojaId, nome, item.codigoPdv, desfecho, motivo);
      }
    } catch (erro) {
      console.warn("Decisão gravada, mas o aviso à filial não saiu:", erro);
    }
  }

  async function handleCriarProduto(input: NovoProdutoInput) {
    // A lista é atualizada quando a gravação confirmar — imediatamente se
    // houver rede, ou na reconexão se o app estiver offline. Amarrar o
    // setProdutos ao `then` em vez do retorno de comRetorno é o que
    // permite o limite de espera existir sem perder o produto criado.
    const promessa = repositorio!.salvarNovoProduto(input);
    promessa
      .then((novo) => setProdutos((atual) => [...atual, novo]))
      .catch(() => {
        /* falha já reportada por comRetorno */
      });
    await comRetorno(() => promessa, `"${input.nome}" cadastrado no catálogo.`);
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
      .catch(() => {
        /* falha já reportada por comRetorno */
      });
    await comRetorno(() => promessaPerda, `Perda registrada: ${payload.quantidadeQuilos} kg.`);

    // Decisão operacional (ago/2026): o peso unitário informado no lançamento
    // de perda retroalimenta o cadastro do produto automaticamente — a
    // sugestão pré-preenchida na próxima perda (e no cronograma) fica cada
    // vez mais precisa, sem passo manual extra em Produtos.
    const produto = produtos.find((p) => p.codigoPdv === payload.codigoPdv);
    if (produto && produto.pesoMedioUnitarioGramas !== payload.pesoUnitarioGramasInformado) {
      const atualizado = { ...produto, pesoMedioUnitarioGramas: payload.pesoUnitarioGramasInformado };
      try {
        // Silencioso de propósito: é efeito colateral, não o que o
        // operador pediu. Não passa por comRetorno para não sobrescrever
        // o aviso "Perda registrada" com um segundo aviso sobre cadastro.
        await repositorio!.atualizarProduto(atualizado);
        setProdutos((atual) => atual.map((p) => (p.codigoPdv === atualizado.codigoPdv ? atualizado : p)));
      } catch (erro) {
        // A perda já foi gravada e é o que importa. A filial, por regra,
        // nem tem permissão de escrever no catálogo — falhar aqui é o
        // comportamento esperado nela, e não pode virar erro na tela.
        console.warn("Peso médio do produto não foi atualizado (a perda foi registrada normalmente):", erro);
      }
    }
  }

  // ---------------------------------------------------------- portões

  if (autenticando) {
    return <div className="carregando">Abrindo...</div>;
  }

  if (!usuario) {
    return <TelaLogin />;
  }

  if (!loja || !repositorio) {
    // Conta autenticada que não corresponde a nenhuma das três lojas.
    // As regras do Firestore já negariam tudo; aqui a mensagem explica o
    // porquê em vez de deixar a tela quebrada.
    return (
      <div className="tela-identificacao">
        <h1>Acesso não reconhecido</h1>
        <p>
          A conta <strong>{usuario.email}</strong> não está ligada a nenhuma loja. Entre com uma das
          contas de loja.
        </p>
        <button type="button" className="primario" onClick={() => signOut(auth)}>
          Sair
        </button>
      </div>
    );
  }

  if (!migracaoResolvida) {
    return (
      <ImportarDadosLocais
        repositorio={repositorio}
        onConcluido={() => setMigracaoResolvida(true)}
      />
    );
  }

  if (carregando) {
    return <div className="carregando">Carregando...</div>;
  }

  if (erroCarregamento) {
    return (
      <div className="tela-identificacao">
        <h1>Não foi possível carregar</h1>
        <p className="erro-conversao">{erroCarregamento}</p>
        <button type="button" className="primario" onClick={() => window.location.reload()}>
          Tentar de novo
        </button>
        <button type="button" className="link" onClick={() => signOut(auth)}>
          sair desta loja
        </button>
      </div>
    );
  }

  if (!operador) {
    return <TelaIdentificacao onConfirmar={handleDefinirOperador} nomeDaLoja={loja.nome} />;
  }

  const abasVisiveis = ABAS_POR_PAPEL[loja.papel];
  // A aba guardada no estado pode não existir neste perfil (ex.: sair da
  // matriz e entrar como filial no mesmo aparelho). Cai na primeira
  // disponível em vez de renderizar tela em branco.
  const abaAtual = abasVisiveis.some((a) => a.chave === aba) ? aba : abasVisiveis[0].chave;

  return (
    <div className="app">
      <header className="cabecalho-app">
        <div>
          <strong>Padaria Pão de Mel</strong>
          <span className="subtitulo-app">{loja.nome}</span>
        </div>
        <div className="operador-atual">
          {operador}
          <button type="button" className="link" onClick={() => handleDefinirOperador("")}>
            trocar
          </button>
          <button
            type="button"
            className="link"
            onClick={() => {
              handleDefinirOperador("");
              signOut(auth);
            }}
          >
            sair
          </button>
        </div>
      </header>

      <AvisoGlobal aviso={aviso} onFechar={() => setAviso(null)} />

      <BannerInstalar />

      <AvisoPerdaPendente
        produtos={produtos}
        planos={planos}
        perdas={perdas}
        visivel={aba !== "perdas"}
        onIrParaPerdas={() => setAba("perdas")}
      />

      {/* A matriz também precisa registrar o aparelho: é ela quem recebe o
          aviso de reposição das filiais. Ficava só na tela da filial, e por
          isso o PC do caixa nunca chegou a ser registrado — a matriz não
          recebia nada e não havia como perceber por quê. */}
      {loja.papel === "matriz" && <AtivarAvisos loja={loja} operador={operador} />}

      <nav className="abas-principais">
        {abasVisiveis.map((a) => (
          <button
            key={a.chave}
            type="button"
            className={abaAtual === a.chave ? "ativa" : ""}
            onClick={() => setAba(a.chave)}
          >
            {a.rotulo}
          </button>
        ))}
      </nav>

      <main className="conteudo-app">
        {abaAtual === "cronograma" && (
          <TelaCronograma
            produtos={produtos}
            pedidos={pedidos}
            onConfirmarProducao={handleConfirmarProducao}
            onImprimirNoCaixa={handleImprimirNoCaixa}
            fornadas={fornadas}
            onMarcarFornada={handleMarcarFornada}
            onDecidirReposicao={loja.papel === "matriz" ? handleDecidirReposicao : undefined}
            planos={planos}
            perdas={perdas}
            operador={operador}
            onSalvarPlano={handleSalvarPlano}
          />
        )}
        {abaAtual === "pedido" && (
          <TelaPedidoFilial
            loja={loja}
            produtos={produtos}
            pedidos={pedidos}
            operador={operador}
            fornadas={fornadas}
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
            onAnularPerda={handleAnularPerda}
            onRegistrarPerda={handleRegistrarPerda}
          />
        )}
        {abaAtual === "analises" && <TelaAnalises produtos={produtos} planos={planos} perdas={perdas} />}
      </main>

      {/* Carimbo de versão (ver vite.config.ts). Existe para dar resposta
          a duas perguntas que apareceram no uso real: "a atualização já
          entrou neste celular?" e, quando um defeito é relatado, "qual
          código está rodando aí?". Discreto de propósito — é informação
          de suporte, não de operação. */}
      <footer className="rodape-versao">
        {loja.nome} · versão de {__VERSAO_APP__}
      </footer>
    </div>
  );
}

function TelaIdentificacao({
  onConfirmar,
  nomeDaLoja,
}: {
  onConfirmar: (nome: string) => void;
  nomeDaLoja: string;
}) {
  const [nome, setNome] = useState("");
  return (
    <div className="tela-identificacao">
      <h1>Padaria Pão de Mel</h1>
      <p className="subtitulo">{nomeDaLoja}</p>
      <p>Quem está lançando os dados hoje?</p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (nome.trim()) onConfirmar(nome.trim());
        }}
      >
        <input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Seu nome" autoFocus />
        <button type="submit" className="primario">Entrar</button>
      </form>
      <p className="nota-rodape">
        Identificação simples para rastrear quem lançou cada registro — não é um login com senha.
        Ver "Decisões pendentes" no documento de arquitetura para o plano de autenticação real.
      </p>
    </div>
  );
}
