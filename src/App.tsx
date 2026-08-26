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
import { dataDeHojeIso, diaDaSemanaDeData } from "./lib/data";
import { TelaCronograma } from "./components/TelaCronograma";
import { TelaCadastroProdutos } from "./components/TelaCadastroProdutos";
import { TelaPerdas } from "./components/TelaPerdas";
import { TelaAnalises } from "./components/TelaAnalises";
import { BannerInstalar } from "./components/BannerInstalar";
import { AvisoPerdaPendente } from "./components/AvisoPerdaPendente";

type Aba = "cronograma" | "cadastro" | "perdas" | "analises";

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

  const [operador, setOperador] = useState(() => localStorage.getItem("padaria:operador") ?? "");
  const [aba, setAba] = useState<Aba>("cronograma");
  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [planos, setPlanos] = useState<PlanoDeProducaoDiario[]>([]);
  const [perdas, setPerdas] = useState<RegistroPerda[]>([]);
  const [carregando, setCarregando] = useState(true);

  const [erroCarregamento, setErroCarregamento] = useState("");

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

  function handleDefinirOperador(nome: string) {
    setOperador(nome);
    localStorage.setItem("padaria:operador", nome);
  }

  async function handleSalvarPlano(plano: PlanoDeProducaoDiario) {
    await repositorio!.salvarPlano(plano);
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
    await repositorio!.salvarPlano(atualizado);
    setPlanos((atual) => atual.map((p) => (p.id === planoId ? atualizado : p)));
  }

  async function handleCriarProduto(input: NovoProdutoInput) {
    const novo = await repositorio!.salvarNovoProduto(input);
    setProdutos((atual) => [...atual, novo]);
  }

  async function handleAtualizarProduto(produto: Produto) {
    await repositorio!.atualizarProduto(produto);
    setProdutos((atual) => atual.map((p) => (p.codigoPdv === produto.codigoPdv ? produto : p)));
  }

  async function handleExcluirProdutos(codigosPdv: number[]) {
    await repositorio!.excluirProdutos(codigosPdv);
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
    const registro = await repositorio!.registrarPerda({
      ...input,
      quantidadeUnidadesEstimada: payload.quantidadeUnidadesEstimada,
      diaDaSemana: diaDaSemanaDeData(hoje),
      data: hoje,
    });
    setPerdas((atual) => [...atual, registro]);

    // Decisão operacional (ago/2026): o peso unitário informado no lançamento
    // de perda retroalimenta o cadastro do produto automaticamente — a
    // sugestão pré-preenchida na próxima perda (e no cronograma) fica cada
    // vez mais precisa, sem passo manual extra em Produtos.
    const produto = produtos.find((p) => p.codigoPdv === payload.codigoPdv);
    if (produto && produto.pesoMedioUnitarioGramas !== payload.pesoUnitarioGramasInformado) {
      await handleAtualizarProduto({ ...produto, pesoMedioUnitarioGramas: payload.pesoUnitarioGramasInformado });
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
