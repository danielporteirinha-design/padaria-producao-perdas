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

type Aba = "cronograma" | "cadastro" | "perdas" | "analises";

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
    Promise.all([repositorio.listarProdutos(), repositorio.listarPlanos(), repositorio.listarPerdas()])
      .then(([p, pl, pe]) => {
        if (cancelado) return;
        setProdutos(p);
        setPlanos(pl);
        setPerdas(pe);
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

      <nav className="abas-principais">
        <button type="button" className={aba === "cronograma" ? "ativa" : ""} onClick={() => setAba("cronograma")}>
          Cronograma
        </button>
        <button type="button" className={aba === "cadastro" ? "ativa" : ""} onClick={() => setAba("cadastro")}>
          Produtos
        </button>
        <button type="button" className={aba === "perdas" ? "ativa" : ""} onClick={() => setAba("perdas")}>
          Perdas
        </button>
        <button type="button" className={aba === "analises" ? "ativa" : ""} onClick={() => setAba("analises")}>
          Análises
        </button>
      </nav>

      <main className="conteudo-app">
        {aba === "cronograma" && (
          <TelaCronograma
            produtos={produtos}
            planos={planos}
            perdas={perdas}
            operador={operador}
            onSalvarPlano={handleSalvarPlano}
          />
        )}
        {aba === "cadastro" && (
          <TelaCadastroProdutos
            produtos={produtos}
            onCriarProduto={handleCriarProduto}
            onAtualizarProduto={handleAtualizarProduto}
            onExcluirProdutos={handleExcluirProdutos}
          />
        )}
        {aba === "perdas" && (
          <TelaPerdas
            produtos={produtos}
            planos={planos}
            perdas={perdas}
            operador={operador}
            onConfirmarProducao={handleConfirmarProducao}
            onRegistrarPerda={handleRegistrarPerda}
          />
        )}
        {aba === "analises" && <TelaAnalises produtos={produtos} planos={planos} perdas={perdas} />}
      </main>
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
