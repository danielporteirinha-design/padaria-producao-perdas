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
import { dataDeHojeIso, diaDaSemanaDeData, formatarDataBr, rotuloDoDia } from "./lib/data";
import { agruparPorCategoria } from "./lib/blocosDeImpressao";
import { gerarCanvasesFita } from "./lib/gerarImagemLista";
import { incluirItemProduzido, planoDeHojeCom } from "./lib/producaoDeHoje";
import { gerarId } from "./lib/id";
import { TelaCronograma } from "./components/TelaCronograma";
import { TelaCadastroProdutos } from "./components/TelaCadastroProdutos";
import { TelaPerdas } from "./components/TelaPerdas";
import { TelaAnalises } from "./components/TelaAnalises";
import { BannerInstalar } from "./components/BannerInstalar";
import { AvisoPerdaPendente } from "./components/AvisoPerdaPendente";
import { TelaPedidoFilial } from "./components/TelaPedidoFilial";
import { decidirReposicao, ehReposicao, type PedidoFilial } from "./types/pedido";
import { base64DoDataUrl, resumoDaImpressao, type TrabalhoImpressao } from "./types/impressao";
import { codigosComFornadaNoDia, idDaFornada, type FornadaPronta } from "./types/fornada";
import {
  avisarDesfechoReposicao,
  avisarFiliais,
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
import { fornadasNaoVistas, marcarFornadasComoVistas } from "./lib/fornadasVistas";
import { abaDaUrl } from "./lib/rota";
import { useDiaCorrente } from "./lib/useDiaCorrente";
import { prepararSom, tocarAvisoSonoro } from "./lib/somDeAviso";

type Aba = "cronograma" | "fornada" | "cadastro" | "perdas" | "analises" | "pedido";

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
/**
 * "Nova fornada" virou ABA, e não mais um painel dentro de outra tela
 * (ago/2026). Como painel ele disputava espaço com o cronograma na
 * matriz e com o pedido na filial, e a tela ficava com dois assuntos
 * competindo. Como aba, o assunto aparece quando é o assunto — e o
 * contador no próprio nome do botão avisa que há novidade sem precisar
 * de nada aberto na tela.
 *
 * REPOSIÇÃO E PROGRAMAÇÃO (ago/2026, decisão do dono do negócio)
 * ---------------------------------------------------------------
 * Os rótulos passaram por "Nova fornada"/"Pedido", depois "Hoje"/"Amanhã",
 * e pararam em "Reposição" e "Programação". O problema sempre foi o
 * mesmo: as duas abas recebem PEDIDO, e o nome tinha que dizer qual era
 * qual sem ninguém precisar ler duas vezes.
 *
 * Agora cada aba leva o nome do DOCUMENTO que sai dela, que é como a
 * padaria já fala: reposição é o pedido de hoje, feito enquanto o forno
 * trabalha; programação é a lista do próximo dia útil, montada no fim do
 * expediente. "Programação" é a mesma palavra do card "Programação geral"
 * no Cronograma — o mesmo assunto com o mesmo nome nas duas pontas.
 *
 * Uma palavra cada, de propósito: "Programar produção" descreve melhor,
 * mas na barra de abas do celular ele empurraria "Perdas" e "Análises"
 * para fora da tela.
 *
 * As CHAVES internas continuam "fornada" e "pedido": elas aparecem nos
 * links dos avisos (`/?aba=fornada`, ver src/lib/rota.ts) e renomeá-las
 * quebraria o toque em qualquer notificação já entregue.
 *
 * Na matriz "Reposição" fica logo depois de Cronograma; na filial, antes
 * de "Programação" — é o que é perecível.
 */
const ABAS_POR_PAPEL: Record<"matriz" | "filial", DefinicaoAba[]> = {
  matriz: [
    { chave: "cronograma", rotulo: "Cronograma" },
    { chave: "fornada", rotulo: "Reposição" },
    { chave: "cadastro", rotulo: "Produtos" },
    { chave: "perdas", rotulo: "Perdas" },
    { chave: "analises", rotulo: "Análises" },
  ],
  filial: [
    { chave: "fornada", rotulo: "Reposição" },
    { chave: "pedido", rotulo: "Programação" },
    { chave: "perdas", rotulo: "Perdas" },
    // Análises entrou para a filial em ago/2026, travada na própria loja:
    // quem decide o que pedir amanhã é quem está no balcão, e até aqui
    // ela pedia sem enxergar o próprio desperdício. Ver TelaAnalises.
    { chave: "analises", rotulo: "Análises" },
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
 * Quanto esperar o agente do caixa antes de assumir que ele está fechado.
 *
 * O agente consulta a fila a cada 15 segundos e leva 1 a 2 para imprimir.
 * 45 segundos cobrem um ciclo perdido e a impressão com folga — e são
 * pouco o bastante para o operador ainda estar perto da impressora quando
 * a mensagem chegar, que é quando ela serve para alguma coisa.
 */
const SEGUNDOS_ATE_DESISTIR_DA_IMPRESSAO = 45_000;

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
  /**
   * A data de HOJE que nota a virada da meia-noite (ago/2026).
   *
   * `dataDeHojeIso()` sempre respondeu certo; o problema é que ela só era
   * chamada quando algo fazia o React renderizar. No PC do caixa o app
   * fica aberto a noite inteira, parado na mesma aba — e na quinta de
   * manhã a tela de Perdas ainda era a de quarta, com as perdas de ontem
   * aparecendo como "lançadas hoje".
   *
   * Este valor muda sozinho quando o dia vira, e é ele que as telas e a
   * escuta de fornadas usam. Os HANDLERS continuam chamando
   * `dataDeHojeIso()` na hora da ação: o que vale para carimbar um
   * registro é o instante da gravação, não o que a tela achava.
   */
  const diaCorrente = useDiaCorrente();

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
    return ouvirAvisosEmPrimeiroPlano((titulo, corpo) => {
      setAviso({ tipo: "sucesso", texto: `${titulo} — ${corpo}` });
      // A notificação do sistema costuma sair MUDA com o app em primeiro
      // plano — o sistema assume que a pessoa está olhando a tela. No
      // balcão ela não está: a janela fica atrás do PDV. Ver
      // src/lib/somDeAviso.ts.
      tocarAvisoSonoro();
    });
  }, [loja]);

  /**
   * Destrava o áudio no primeiro gesto. Navegador não deixa tocar som
   * antes de a pessoa interagir com a página — sem isto, o primeiro aviso
   * do dia sairia mudo.
   */
  useEffect(() => {
    // Sem `once` (ago/2026): o navegador pode suspender o áudio de novo
    // depois de horas com a janela em segundo plano — o caso do PC do
    // balcão. `prepararSom` é barato e idempotente: criar uma vez,
    // destravar sempre que houver oportunidade é mais seguro que
    // destravar uma vez e torcer.
    const destravar = () => prepararSom();
    window.addEventListener("pointerdown", destravar);
    window.addEventListener("keydown", destravar);
    return () => {
      window.removeEventListener("pointerdown", destravar);
      window.removeEventListener("keydown", destravar);
    };
  }, []);


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
  /**
   * Último nome usado nesta loja, neste aparelho.
   *
   * Fica separado de `operador` de propósito (ago/2026): antes o nome
   * salvo entrava sozinho e o app abria direto na tela de trabalho.
   * Agora ele é apenas uma SUGESTÃO — o app sempre abre na tela de
   * entrada, e quem chega confirma quem é com um toque.
   *
   * Parece um passo a mais, mas evita o erro que ninguém percebe: numa
   * padaria o mesmo celular passa de mão em mão, e o lançamento de perda
   * do turno da tarde acabava assinado com o nome de quem trabalhou de
   * manhã. O registro de quem lançou é o que dá sentido ao histórico.
   */
  const [nomeSugerido, setNomeSugerido] = useState("");
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
    // Reassina quando o dia vira: sem isto a escuta ficaria presa na data
    // de ontem para sempre, e as fornadas de hoje nunca chegariam à tela
    // de um app que não foi fechado.
    const desligarFornadas = repositorio.observarFornadas(diaCorrente, setFornadas);
    return () => {
      desligarPedidos();
      desligarFornadas();
    };
  }, [repositorio, loja, carregando, diaCorrente]);

  /**
   * Fornadas que chegaram desde a última vez que esta pessoa abriu a aba.
   * Fica aqui no App, e não dentro do painel, porque quem mostra o número
   * agora é a ABA — o painel pode nem estar montado quando a fornada sai.
   */
  /**
   * REGISTRO SILENCIOSO DO APARELHO (ago/2026)
   *
   * O app tratava "permissão do navegador concedida" como "aparelho
   * registrado". São coisas diferentes: o documento em `dispositivos` —
   * que é o que diz PARA ONDE o push vai — só nascia no toque do botão
   * "Ativar", e esse botão some assim que a permissão está concedida.
   * Num aparelho que já tinha permissão de antes, o cartão nunca
   * aparecia, nenhum token era gravado e o aviso não tinha destino, em
   * silêncio absoluto.
   *
   * E na troca de conta era pior: o celular registrado uma vez como
   * filial continuava com `lojaId` de filial, recebia os avisos de
   * fornada e nunca os de reposição, mesmo logado como matriz.
   *
   * Roda a cada troca de loja/operador. Com a permissão já concedida não
   * abre prompt nenhum; sem permissão nem chega a tentar — quem pede
   * permissão continua sendo o toque no cartão de avisos.
   */
  useEffect(() => {
    if (!loja || !operador) return;
    void registrarAparelhoSePermitido(loja.id, operador);
  }, [loja, operador]);

  /**
   * ABRIR NA ABA QUE O AVISO PEDIU (ago/2026)
   *
   * Duas entradas, porque são duas situações diferentes:
   *
   * - App FECHADO: o service worker abre a janela já com `?aba=...`, lido
   *   aqui na montagem. A URL é limpa em seguida com `replaceState` para
   *   não reabrir a mesma aba no próximo recarregamento — nem virar um
   *   link que alguém salva por engano.
   * - App ABERTO: o service worker manda um recado. Trocar a aba por
   *   mensagem preserva a tela; recarregar jogaria fora o pedido que a
   *   filial estava digitando.
   */
  useEffect(() => {
    const inicial = abaDaUrl(window.location.search);
    if (inicial) {
      setAba(inicial);
      window.history.replaceState(null, "", window.location.pathname);
    }

    const aoReceberRecado = (evento: MessageEvent) => {
      /**
       * O service worker pede o som quando a janela está aberta mas sem
       * foco — no PC do balcão ela vive atrás do PDV. Nesse estado o FCM
       * entrega no service worker, que não tem WebAudio; quem toca é esta
       * página, que continua carregada. Ver public/firebase-messaging-sw.js.
       */
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

  /**
   * Abrir a aba É o ato de ver: o contador zera na entrada. Se
   * sobrevivesse à abertura voltaria a ser o número que nunca zera, que é
   * exatamente o que ninguém olha.
   */
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
    // Nome vazio é o "trocar" do cabeçalho: além de sair, apaga a
    // sugestão — senão a tela de entrada ofereceria de volta exatamente
    // o nome que a pessoa acabou de recusar.
    setNomeSugerido(nome);
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

    acompanharImpressao(trabalhos.map((t) => t.id));
  }

  /**
   * Acompanha os trabalhos até o agente do caixa dar o desfecho.
   *
   * O caso que motivou isto não é a falha de impressão — é o SILÊNCIO. No
   * primeiro dia de uso o programa do caixa estava fechado: o app gravou
   * tudo certo, a nuvem guardou tudo certo, e ninguém do outro lado pegou.
   * Da tela, isso era indistinguível de ter funcionado. A descoberta veio
   * de abrir o log do PC — coisa que o padeiro não vai fazer.
   *
   * Por isso existe o tempo limite: quando nada responde, a mensagem
   * aponta para a causa real em vez de deixar o operador esperando um
   * papel que não vem.
   */
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

  /**
   * Histórico de fornadas para a tela de Análises.
   *
   * useCallback e não uma função solta: a tela busca dentro de um
   * useEffect que depende desta referência. Recriada a cada render, ela
   * dispararia uma consulta nova a cada render — laço infinito de leitura
   * no Firestore, que é conta paga.
   */
  const carregarFornadasDoPeriodo = useCallback(
    (dataInicio: string, dataFim: string): Promise<FornadaPronta[]> =>
      repositorio ? repositorio.listarFornadasNoPeriodo(dataInicio, dataFim) : Promise.resolve([]),
    [repositorio]
  );

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
     * As duas coisas avisam a matriz, por motivos diferentes (ago/2026):
     *
     * - REPOSIÇÃO: existe porque o produto está faltando no balcão AGORA.
     *   Um aviso que espera alguém lembrar de abrir a tela perdeu a razão
     *   de existir.
     * - LISTA DO DIA: é planejamento, mas a matriz monta o cronograma no
     *   fim do expediente e, se uma filial atrasa, a produção sai sem ela
     *   e a loja abre no dia seguinte sem mercadoria. O aviso dá fim
     *   conhecido à espera, em vez de a matriz reabrir a tela para ver se
     *   chegou.
     *
     * Rascunho não avisa: a filial ainda está mexendo nele, e interromper
     * a matriz a cada salvamento automático seria ruído puro.
     *
     * Como no aviso de fornada, falhar aqui não desfaz o pedido: ele já
     * está gravado e a matriz o vê na tela de qualquer forma.
     */
    /**
     * EM PARALELO, E NÃO EM FILA (ago/2026 — defeito relatado no uso).
     *
     * Os dois efeitos estavam encadeados: primeiro o aviso, depois o
     * papel. Como o aviso é uma chamada de rede, bastava ela demorar para
     * a impressão atrasar junto — e, se ela nunca respondesse (função
     * hibernada acordando, conexão que trava sem fechar), o papel
     * simplesmente NUNCA saía. Os dois falhavam juntos e sem mensagem
     * nenhuma, que é exatamente o sintoma que apareceu na padaria.
     *
     * Agora cada um corre por conta própria e cuida do próprio erro.
     * `allSettled` porque nenhum dos dois pode derrubar o outro: o pedido
     * já está gravado, e é ele que vale.
     */
    await Promise.allSettled([avisarMatrizDoPedido(pedido), imprimirPedidoNoCaixa(pedido)]);
  }

  /**
   * Avisa a matriz do que a filial acabou de mandar.
   *
   * - REPOSIÇÃO: existe porque o produto está faltando no balcão AGORA.
   *   Um aviso que espera alguém lembrar de abrir a tela perdeu a razão
   *   de existir.
   * - LISTA DO DIA: é planejamento, mas a matriz monta o cronograma no
   *   fim do expediente e, se uma filial atrasa, a produção sai sem ela e
   *   a loja abre no dia seguinte sem mercadoria.
   *
   * Rascunho não avisa: a filial ainda está mexendo nele, e interromper a
   * matriz a cada salvamento automático seria ruído puro.
   */
  async function avisarMatrizDoPedido(pedido: PedidoFilial) {
    try {
      if (ehReposicao(pedido)) {
        const item = pedido.itens[0];
        if (item) {
          const nome = produtos.find((p) => p.codigoPdv === item.codigoPdv)?.nome ?? "Produto";
          await avisarMatriz(nome, item.codigoPdv, item.quantidadeUnidades);
        }
      } else if (pedido.status === "enviado") {
        await avisarListaEnviada(pedido.itens.length);
      }
    } catch (erro) {
      // Falhar aqui não desfaz o pedido: ele já está gravado e a matriz o
      // vê na tela de qualquer forma.
      console.warn("Pedido gravado, mas o aviso à matriz não saiu:", erro);
    }
  }

  /**
   * Enfileira a lista da filial para a impressora do caixa da matriz.
   *
   * A IMAGEM É GERADA AQUI, no aparelho da filial, e não na matriz: a
   * matriz pode estar com o app fechado quando o pedido chega, e um papel
   * que só sai quando alguém abre a tela não é impressão automática.
   *
   * A fila (`fila_impressao`) é compartilhada e o agente do caixa imprime
   * tudo que estiver pendente, sem olhar de que loja veio — ver
   * agente-impressao/agente.py. As regras do Firestore continuam exigindo
   * que o trabalho seja carimbado com a loja de quem gravou, então cada
   * papel é rastreável até quem o mandou.
   */
  async function imprimirPedidoNoCaixa(pedido: PedidoFilial) {
    // A decisão de imprimir mora aqui, junto da impressão: espalhada na
    // chamada, ela precisava ser repetida em todo lugar que mandasse
    // pedido. Reposição não imprime — é decidida na tela, uma por vez, e
    // um papel por reposição gastaria bobina o dia inteiro.
    if (ehReposicao(pedido) || pedido.status !== "enviado") return;
    try {
      const sessoes = agruparPorCategoria(pedido.itens, produtos);
      if (sessoes.length === 0) return;

      const agora = new Date();
      const hora = agora.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
      const canvases = gerarCanvasesFita({
        titulo: `Pedido — ${nomeDaLoja(pedido.lojaId)}`,
        dataFormatada: `${rotuloDoDia(diaDaSemanaDeData(pedido.data))}, ${formatarDataBr(pedido.data)}`,
        sessoes,
        produtos,
        // A HORA vai junto de quem montou de propósito: a filial pode
        // reenviar a lista corrigida, e aí saem dois papéis parecidos. Sem
        // a hora, não há como saber qual dos dois é o que vale.
        montadoPor: `${operador} · enviado ${hora}`,
      });

      const nomeBase = `pedido-${pedido.lojaId.toLowerCase()}-${pedido.data}`;
      const criadoEm = agora.toISOString();
      const trabalhos: TrabalhoImpressao[] = canvases.map((canvas, indice) => ({
        id: `${nomeBase}-${indice + 1}-${agora.getTime()}`,
        lojaId: loja!.id,
        documento: `Pedido — ${nomeDaLoja(pedido.lojaId)}`,
        nomeArquivo:
          canvases.length > 1 ? `${nomeBase}-parte${indice + 1}.png` : `${nomeBase}.png`,
        parte: indice + 1,
        totalPartes: canvases.length,
        imagemBase64: base64DoDataUrl(canvas.toDataURL("image/png"), nomeBase),
        status: "pendente",
        criadoPor: operador,
        criadoEm,
      }));

      await repositorio!.enviarParaImpressao(trabalhos);
    } catch (erro) {
      /**
       * O pedido JÁ está gravado e a matriz JÁ foi avisada por push — o
       * papel é conveniência, não o canal. Por isso a mensagem diz o que
       * continua valendo, em vez de sugerir que o envio falhou e precisa
       * ser refeito.
       */
      console.warn("Pedido enviado, mas não foi para a impressora do caixa:", erro);
      setAviso({
        tipo: "erro",
        texto:
          "Pedido enviado para a matriz, mas não consegui mandar para a impressora do caixa. A matriz vê o pedido normalmente na tela dela.",
      });
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
  /**
   * Garante que cada item de uma reposição confirmada esteja na produção
   * de HOJE. Não mexe em quantidade já planejada: item que a matriz já
   * tinha na lista foi atendido com o que já saiu do forno, e somar as
   * duas coisas inflaria a produção do dia com mercadoria que não
   * existiu.
   */
  async function registrarNaProducaoDeHoje(pedido: PedidoFilial) {
    const hoje = dataDeHojeIso();
    const agora = new Date().toISOString();
    let plano = planos.find((p) => p.data === hoje && p.status === "confirmado");

    for (const item of pedido.itens) {
      const categoria = produtos.find((p) => p.codigoPdv === item.codigoPdv)?.categoria;
      if (!categoria) continue;

      // Sem cronograma montado hoje (feriado, movimento imprevisto) o
      // plano nasce aqui, já confirmado: o produto saiu do forno e foi
      // pedido — não é intenção, é fato.
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

    /**
     * Reposição confirmada de item FORA do cronograma entra na produção
     * de hoje. A matriz assou, anunciou pela busca da aba Nova Fornada e
     * vai entregar — se o plano do dia não conhecer esse produto, uma
     * perda lançada amanhã sobre ele apareceria como perda sem produção,
     * e a taxa do dia ficaria sem denominador (ver
     * src/lib/producaoDeHoje.ts).
     */
    if (desfecho === "confirmado") {
      try {
        await registrarNaProducaoDeHoje(decidido);
      } catch (erro) {
        // O pedido já está confirmado e a filial já foi atendida; falhar
        // aqui em vermelho faria a matriz achar que precisa confirmar de
        // novo. O que se perde é o registro contábil do item, não a
        // operação.
        console.warn("Reposição confirmada, mas o item não entrou na produção de hoje:", erro);
      }
    }

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
    return (
      <TelaIdentificacao
        onConfirmar={handleDefinirOperador}
        nomeDaLoja={loja.nome}
        nomeSugerido={nomeSugerido}
      />
    );
  }

  const abasVisiveis = ABAS_POR_PAPEL[loja.papel];
  // A aba guardada no estado pode não existir neste perfil (ex.: sair da
  // matriz e entrar como filial no mesmo aparelho). Cai na primeira
  // disponível em vez de renderizar tela em branco.
  const abaAtual = abasVisiveis.some((a) => a.chave === aba) ? aba : abasVisiveis[0].chave;

  /** Cronograma confirmado de HOJE — é dele que sai a lista do forno. */
  const planoDeHojeParaFornada = planos.find(
    (p) => p.data === diaCorrente && p.status === "confirmado"
  );

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
        onIrParaPerdas={() => irParaAba("perdas")}
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
            onClick={() => irParaAba(a.chave)}
          >
            {a.rotulo}
            {a.chave === "fornada" && fornadasNovas > 0 && (
              <span className="selo-aba" aria-label={`${fornadasNovas} fornadas novas`}>
                {fornadasNovas}
              </span>
            )}
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
            planos={planos}
            perdas={perdas}
            operador={operador}
            hoje={diaCorrente}
            onSalvarPlano={handleSalvarPlano}
          />
        )}
        {/* Aba própria: na matriz é onde se MARCA a fornada; na filial é
            onde se vê o que saiu e se pede reposição. Duas telas para o
            mesmo assunto, cada uma no papel de quem está olhando. */}
        {abaAtual === "fornada" &&
          (loja.papel === "matriz" ? (
            <>
              {/* Reposição é pedido de HOJE, feito enquanto o forno
                  trabalha — mora junto do resto do expediente, e não no
                  Cronograma, que é sobre amanhã. */}
              <PainelPedidosFiliais
                pedidos={pedidos}
                data={diaCorrente}
                somenteReposicoes
                reposicoesDeHoje={pedidos.filter(
                  (p) => p.data === diaCorrente && p.tipo === "reposicao"
                )}
                onDecidirReposicao={handleDecidirReposicao}
                nomeDoProduto={(codigo) =>
                  produtos.find((p) => p.codigoPdv === codigo)?.nome ?? `#${codigo}`
                }
                saiuDoForno={(codigo) =>
                  codigosComFornadaNoDia(fornadas, diaCorrente).has(codigo)
                }
              />
              {/* Sem o `if` de antes (ago/2026): a busca do painel anuncia
                  qualquer produto do catálogo, então um dia sem cronograma
                  montado deixou de ser motivo para esconder a tela. O
                  próprio painel explica o que fazer quando não há lista. */}
              <PainelFornoDeHoje
                plano={planoDeHojeParaFornada}
                produtos={produtos}
                fornadas={fornadas}
                dataHoje={diaCorrente}
                onMarcarFornada={handleMarcarFornada}
              />
            </>
          ) : (
            <PainelFornadasFilial
              loja={loja}
              produtos={produtos}
              fornadas={fornadas}
              pedidos={pedidos}
              operador={operador}
              onSalvarPedido={handleSalvarPedido}
            />
          ))}

        {abaAtual === "pedido" && (
          <TelaPedidoFilial
            loja={loja}
            produtos={produtos}
            pedidos={pedidos}
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

/**
 * Tela de entrada — sempre a primeira, mesmo com a loja já autenticada.
 *
 * Dois caminhos, e o de um toque é o normal:
 *
 *   - Já trabalhou neste aparelho -> "Continuar como Daniel", um toque
 *   - Primeira vez, ou trocou de pessoa -> digita o nome
 *
 * O nome não é senha: é a assinatura de quem lançou cada registro. Por
 * isso confirmar é rápido, e por isso trocar tem que ser fácil — numa
 * padaria o mesmo celular passa de mão em mão entre turnos.
 */
function TelaIdentificacao({
  onConfirmar,
  nomeDaLoja,
  nomeSugerido,
}: {
  onConfirmar: (nome: string) => void;
  nomeDaLoja: string;
  nomeSugerido: string;
}) {
  const [nome, setNome] = useState("");
  const [digitando, setDigitando] = useState(!nomeSugerido);

  return (
    <div className="tela-identificacao">
      <img
        className="marca-login"
        src="/logo-pao-de-mel.png"
        alt="Padaria Pão de Mel"
        width="320"
        height="115"
      />
      <p className="subtitulo">{nomeDaLoja}</p>

      {!digitando ? (
        <>
          <p className="pergunta-entrada">Continuar como</p>
          {/* O nome É o botão, e é o maior alvo da tela: é o que a pessoa
              vai tocar todo dia, muitas vezes, com a mão ocupada. */}
          <button type="button" className="botao-continuar" onClick={() => onConfirmar(nomeSugerido)}>
            {nomeSugerido}
          </button>
          <button type="button" className="link" onClick={() => setDigitando(true)}>
            é outra pessoa
          </button>
        </>
      ) : (
        <>
          <p className="pergunta-entrada">Quem está lançando os dados hoje?</p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (nome.trim()) onConfirmar(nome.trim());
            }}
          >
            <input
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              placeholder="Seu nome"
              autoFocus
            />
            <button type="submit" className="primario" disabled={nome.trim() === ""}>
              Entrar
            </button>
          </form>
          {nomeSugerido && (
            <button type="button" className="link" onClick={() => setDigitando(false)}>
              voltar
            </button>
          )}
        </>
      )}

      <p className="nota-rodape">
        O nome fica junto de cada lançamento, para saber quem registrou o quê.
      </p>
    </div>
  );
}
