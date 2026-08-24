import { useEffect, useState } from "react";
import type { Produto, NovoProdutoInput } from "./types/produto";
import type { PlanoDeProducaoDiario } from "./types/producao";
import type { RegistroPerda, LancamentoPerdaInput } from "./types/perda";
import { RepositorioLocalStorage } from "./data/repositorioLocalStorage";
import { dataDeHojeIso, diaDaSemanaDeData } from "./lib/data";
import { TelaCronograma } from "./components/TelaCronograma";
import { TelaCadastroProdutos } from "./components/TelaCadastroProdutos";
import { TelaPerdas } from "./components/TelaPerdas";
import { TelaAnalises } from "./components/TelaAnalises";

// Ponto único de troca de backend: substitua por `new RepositorioFirestore()`
// quando o projeto Firebase estiver configurado (ver src/data/repositorioFirestore.ts).
const repositorio = new RepositorioLocalStorage();

type Aba = "cronograma" | "cadastro" | "perdas" | "analises";

export default function App() {
  const [operador, setOperador] = useState(() => localStorage.getItem("padaria:operador") ?? "");
  const [aba, setAba] = useState<Aba>("cronograma");
  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [planos, setPlanos] = useState<PlanoDeProducaoDiario[]>([]);
  const [perdas, setPerdas] = useState<RegistroPerda[]>([]);
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    Promise.all([repositorio.listarProdutos(), repositorio.listarPlanos(), repositorio.listarPerdas()]).then(
      ([p, pl, pe]) => {
        setProdutos(p);
        setPlanos(pl);
        setPerdas(pe);
        setCarregando(false);
      }
    );
  }, []);

  function handleDefinirOperador(nome: string) {
    setOperador(nome);
    localStorage.setItem("padaria:operador", nome);
  }

  async function handleSalvarPlano(plano: PlanoDeProducaoDiario) {
    await repositorio.salvarPlano(plano);
    setPlanos((atual) => [...atual.filter((p) => p.id !== plano.id), plano]);
  }

  async function handleCriarProduto(input: NovoProdutoInput) {
    const novo = await repositorio.salvarNovoProduto(input);
    setProdutos((atual) => [...atual, novo]);
  }

  async function handleAtualizarProduto(produto: Produto) {
    await repositorio.atualizarProduto(produto);
    setProdutos((atual) => atual.map((p) => (p.codigoPdv === produto.codigoPdv ? produto : p)));
  }

  async function handleRegistrarPerda(payload: {
    codigoPdv: number;
    planoDeProducaoId: string;
    entradaBruta: { valor: number; unidade: "un" | "kg" };
    quantidadeNormalizada: number;
    unidadeNormalizada: string;
    fatorConversaoAplicado: boolean;
    motivo: RegistroPerda["motivo"];
    observacao?: string;
    registradoPor: string;
  }) {
    const hoje = dataDeHojeIso();
    const input: LancamentoPerdaInput = {
      codigoPdv: payload.codigoPdv,
      planoDeProducaoId: payload.planoDeProducaoId,
      valor: payload.entradaBruta.valor,
      unidade: payload.entradaBruta.unidade,
      motivo: payload.motivo,
      observacao: payload.observacao,
      registradoPor: payload.registradoPor,
    };
    const registro = await repositorio.registrarPerda({
      ...input,
      quantidadeNormalizada: payload.quantidadeNormalizada,
      unidadeNormalizada: payload.unidadeNormalizada,
      fatorConversaoAplicado: payload.fatorConversaoAplicado,
      diaDaSemana: diaDaSemanaDeData(hoje),
      data: hoje,
    });
    setPerdas((atual) => [...atual, registro]);
  }

  const hoje = dataDeHojeIso();
  const planoDeHoje = planos.find((p) => p.data === hoje);

  if (carregando) {
    return <div className="carregando">Carregando...</div>;
  }

  if (!operador) {
    return <TelaIdentificacao onConfirmar={handleDefinirOperador} />;
  }

  return (
    <div className="app">
      <header className="cabecalho-app">
        <div>
          <strong>Padaria Pão de Mel</strong>
          <span className="subtitulo-app">Produção &amp; Perdas</span>
        </div>
        <div className="operador-atual">
          {operador}
          <button type="button" className="link" onClick={() => handleDefinirOperador("")}>
            trocar
          </button>
        </div>
      </header>

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
          <TelaCronograma produtos={produtos} operador={operador} onSalvarPlano={handleSalvarPlano} />
        )}
        {aba === "cadastro" && (
          <TelaCadastroProdutos
            produtos={produtos}
            onCriarProduto={handleCriarProduto}
            onAtualizarProduto={handleAtualizarProduto}
          />
        )}
        {aba === "perdas" && (
          <TelaPerdas
            produtos={produtos}
            perdas={perdas}
            planoDeHoje={planoDeHoje}
            operador={operador}
            onRegistrarPerda={handleRegistrarPerda}
          />
        )}
        {aba === "analises" && <TelaAnalises produtos={produtos} planos={planos} perdas={perdas} />}
      </main>
    </div>
  );
}

function TelaIdentificacao({ onConfirmar }: { onConfirmar: (nome: string) => void }) {
  const [nome, setNome] = useState("");
  return (
    <div className="tela-identificacao">
      <h1>Padaria Pão de Mel</h1>
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
