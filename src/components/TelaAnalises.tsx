/**
 * src/components/TelaAnalises.tsx
 * ---------------------------------------------------------------
 * Painel de análises (ago/2026). A pergunta que o dono do negócio quer
 * responder de relance: "existe padrão de perda por dia da semana ou por
 * semana do mês?". Se terça desperdiça o dobro de sexta, o cronograma de
 * terça está errado — e isso é dinheiro que dá para parar de jogar fora
 * sem cortar nada da operação.
 *
 * UM FILTRO SÓ, NO TOPO, VALENDO PARA TUDO
 * -----------------------------------------
 * Período, loja e categoria são aplicados uma única vez (ver
 * src/lib/analises.ts) e alimentam os números, os três gráficos E o
 * resumo mandado para a IA. É o que garante que a tela e a IA estejam
 * olhando exatamente o mesmo recorte — se cada bloco filtrasse por conta
 * própria, a IA acabaria comentando dados que não estão na tela.
 *
 * PERCENTUAL, NÃO VOLUME
 * -----------------------
 * Os gráficos comparam TAXA de perda. Sábado produz muito mais que
 * segunda, então o total perdido no sábado seria sempre maior sem que
 * isso significasse desperdício pior. O percentual é o que torna os dias
 * comparáveis.
 */

import { useEffect, useMemo, useState } from "react";
import type { Produto } from "../types/produto";
import type { PlanoDeProducaoDiario } from "../types/producao";
import type { RegistroPerda } from "../types/perda";
import type { FornadaPronta } from "../types/fornada";
import {
  calcularTotais,
  fornadasPorFaixaDeHora,
  perdaPorDiaDaSemana,
  perdaPorSemanaDoMes,
  formatarPercentual,
  produtosPorNumeroDeFornadas,
  recortar,
  recortarFornadas,
  topProdutosPorPerda,
  totaisDeFornadas,
  type FiltroAnalise,
} from "../lib/analises";
import { CATEGORIAS_PRODUCAO } from "../lib/categorias";
import { LOJAS } from "../lib/lojas";
import { dataDeHojeIso, somarDias } from "../lib/data";
import {
  buscarInsightsCatalogo,
  construirResumoParaInsights,
  ErroInsightsCatalogo,
  type InsightCatalogo,
} from "../lib/insightsCatalogo";
import { GraficoBarras } from "./GraficoBarras";

interface TelaAnalisesProps {
  produtos: Produto[];
  planos: PlanoDeProducaoDiario[];
  perdas: RegistroPerda[];
  /**
   * Busca as fornadas do período. Vem de fora porque o app inteiro só
   * carrega as fornadas de HOJE (elas acumulam rápido) — o histórico é
   * buscado sob demanda, quando alguém de fato abre esta tela.
   */
  carregarFornadas: (dataInicio: string, dataFim: string) => Promise<FornadaPronta[]>;
}

const PERIODOS = [
  { dias: 7, rotulo: "7 dias" },
  { dias: 30, rotulo: "30 dias" },
  { dias: 90, rotulo: "90 dias" },
];

export function TelaAnalises({ produtos, planos, perdas, carregarFornadas }: TelaAnalisesProps) {
  const [filtro, setFiltro] = useState<FiltroAnalise>({ dias: 30 });
  const hoje = dataDeHojeIso();

  const recorte = useMemo(
    () => recortar(produtos, planos, perdas, hoje, filtro),
    [produtos, planos, perdas, hoje, filtro]
  );

  const totais = useMemo(() => calcularTotais(recorte), [recorte]);
  const porDia = useMemo(() => perdaPorDiaDaSemana(recorte), [recorte]);
  const porSemana = useMemo(() => perdaPorSemanaDoMes(recorte), [recorte]);
  const porProduto = useMemo(() => topProdutosPorPerda(recorte), [recorte]);

  // ---------------------------------------------------------------
  // Fornadas: o relatório do que SAI DO FORNO
  //
  // Dado independente do cronograma de propósito. Cada marcação carrega a
  // própria data e a própria hora, então a janela é aplicada sobre as
  // MARCAÇÕES — uma lista de produção montada em outro dia não entra na
  // conta, nem para mais nem para menos. É o que faz o número responder
  // "o que aconteceu no forno nestes N dias" em vez de "o que estava
  // planejado".
  // ---------------------------------------------------------------
  const [fornadas, setFornadas] = useState<FornadaPronta[]>([]);
  const [statusFornadas, setStatusFornadas] = useState<"carregando" | "pronto" | "erro">(
    "carregando"
  );

  useEffect(() => {
    let cancelado = false;
    const inicio = somarDias(hoje, -(filtro.dias - 1));
    setStatusFornadas("carregando");
    carregarFornadas(inicio, hoje)
      .then((lista) => {
        if (cancelado) return;
        setFornadas(lista);
        setStatusFornadas("pronto");
      })
      .catch((erro) => {
        if (cancelado) return;
        console.error("Falha ao carregar fornadas do período:", erro);
        setStatusFornadas("erro");
      });
    // Só o tamanho da janela dispara nova busca: loja e categoria são
    // recortados aqui mesmo, e ir ao banco de novo por causa de um select
    // gastaria leitura sem trazer nenhum dado novo.
    return () => {
      cancelado = true;
    };
  }, [carregarFornadas, hoje, filtro.dias]);

  const recorteFornadas = useMemo(
    () => recortarFornadas(fornadas, produtos, hoje, filtro),
    [fornadas, produtos, hoje, filtro]
  );
  const totaisFornadas = useMemo(() => totaisDeFornadas(recorteFornadas), [recorteFornadas]);
  const porFaixaDeHora = useMemo(() => fornadasPorFaixaDeHora(recorteFornadas), [recorteFornadas]);
  const porRepeticao = useMemo(
    () => produtosPorNumeroDeFornadas(recorteFornadas, produtos),
    [recorteFornadas, produtos]
  );

  const [insights, setInsights] = useState<InsightCatalogo[] | null>(null);
  const [statusInsights, setStatusInsights] = useState<"" | "carregando" | "erro">("");
  const [mensagemInsights, setMensagemInsights] = useState("");

  async function gerarInsights() {
    setStatusInsights("carregando");
    setMensagemInsights("");
    try {
      const resumo = construirResumoParaInsights(produtos, planos, perdas, hoje);
      if (resumo.length === 0) {
        setStatusInsights("erro");
        setMensagemInsights("Ainda não há histórico suficiente para analisar.");
        return;
      }
      // Os padrões vão junto do resumo por produto: sem eles a IA só
      // consegue falar de item isolado, e a pergunta do dono do negócio é
      // sobre PADRÃO — que dia, que semana, e o que fazer a respeito.
      const resultado = await buscarInsightsCatalogo(resumo, {
        porDiaDaSemana: porDia,
        porSemanaDoMes: porSemana,
        taxaGeral: totais.taxaPerda,
        janelaDias: filtro.dias,
      });
      setInsights(resultado);
      setStatusInsights("");
      if (resultado.length === 0) {
        setMensagemInsights("A IA não encontrou padrões relevantes neste recorte.");
      }
    } catch (erro) {
      console.error("Falha ao gerar insights:", erro);
      setStatusInsights("erro");
      setMensagemInsights(
        erro instanceof ErroInsightsCatalogo
          ? erro.message
          : "Não foi possível gerar os insights agora. Tente de novo em alguns minutos."
      );
    }
  }

  const semDados = totais.produzido === 0 && totais.perdido === 0;

  return (
    <div className="tela">
      <h2>Análises</h2>

      {/* Filtros numa linha só, acima de tudo — vale para os números, os
          gráficos e a IA ao mesmo tempo. */}
      <div className="filtros-analise">
        <div className="grupo-periodo">
          {PERIODOS.map((p) => (
            <button
              key={p.dias}
              type="button"
              className={filtro.dias === p.dias ? "ativa" : ""}
              onClick={() => setFiltro((f) => ({ ...f, dias: p.dias }))}
            >
              {p.rotulo}
            </button>
          ))}
        </div>
        <div className="grupo-selects">
          <select
            value={filtro.lojaId ?? ""}
            aria-label="Loja"
            onChange={(e) => setFiltro((f) => ({ ...f, lojaId: e.target.value || undefined }))}
          >
            <option value="">Todas as lojas</option>
            {LOJAS.map((l) => (
              <option key={l.id} value={l.id}>
                {l.nomeCurto}
              </option>
            ))}
          </select>
          <select
            value={filtro.categoria ?? ""}
            aria-label="Categoria"
            onChange={(e) => setFiltro((f) => ({ ...f, categoria: e.target.value || undefined }))}
          >
            <option value="">Todas as categorias</option>
            {CATEGORIAS_PRODUCAO.map((c) => (
              <option key={c.chave} value={c.chave}>
                {c.rotulo}
              </option>
            ))}
          </select>
        </div>
      </div>

      {semDados ? (
        <p className="callout-inline">
          Nenhum dado neste recorte. Amplie o período ou tire os filtros de loja e categoria.
        </p>
      ) : (
        <>
          {/* Números-cabeçalho: três valores, não um gráfico de três barras. */}
          <div className="linha-kpis">
            <div className="kpi">
              <span className="valor-kpi">
                {totais.taxaPerda === null ? "—" : formatarPercentual(totais.taxaPerda)}
              </span>
              <span className="rotulo-kpi">Taxa de perda</span>
            </div>
            <div className="kpi">
              <span className="valor-kpi">{formatar(totais.produzido)}</span>
              <span className="rotulo-kpi">Produzido (un)</span>
            </div>
            <div className="kpi">
              <span className="valor-kpi">{formatar(totais.perdido)}</span>
              <span className="rotulo-kpi">Perdido (un)</span>
            </div>
            <div className="kpi">
              <span className="valor-kpi">{formatar(totais.perdidoQuilos)}</span>
              <span className="rotulo-kpi">Perdido (kg)</span>
            </div>
          </div>

          <GraficoBarras
            titulo="Perda por dia da semana"
            descricao="Percentual, não volume — sábado produz mais que segunda, e sem a taxa a comparação seria injusta. Toque numa barra para ver os números."
            barras={porDia}
            vazio="Ainda não há produção registrada neste recorte."
          />

          <GraficoBarras
            titulo="Perda por semana do mês"
            descricao="Pega efeito de salário, feriado e data comemorativa no movimento."
            barras={porSemana}
            vazio="Ainda não há produção registrada neste recorte."
          />

          <GraficoBarras
            titulo="Produtos que mais desperdiçam"
            descricao="Só itens com pelo menos 20 unidades produzidas no período — abaixo disso a porcentagem é ruído, não padrão."
            barras={porProduto}
            vazio="Nenhum produto com produção suficiente para comparar ainda."
          />
        </>
      )}

      {/* O que sai do forno. Fica FORA do bloco acima de propósito: a
          fornada é marcada mesmo em período sem lançamento de perda, e
          esconder o relatório do forno porque não houve perda seria
          esconder o dado justamente no mês em que ele está mais limpo. */}
      <section className="secao-fornadas">
        <h3>O que saiu do forno</h3>
        <p className="nota-rodape">
          Vem das marcações de fornada — cada uma com a hora em que o item ficou pronto. Conta
          EVENTOS de forno, não unidades: um item que sai seis vezes por dia aparece seis vezes.
        </p>

        {statusFornadas === "carregando" && (
          <p className="nota-rodape">Carregando as fornadas do período...</p>
        )}

        {statusFornadas === "erro" && (
          <p className="erro-conversao" role="alert">
            Não foi possível carregar o histórico de fornadas agora. O resto da tela continua
            valendo.
          </p>
        )}

        {statusFornadas === "pronto" && totaisFornadas.total === 0 && (
          <p className="callout-inline">
            Nenhuma fornada marcada neste recorte. Marque na aba Nova Fornada ao longo do dia — em
            uma semana já dá para ler o ritmo do forno aqui.
          </p>
        )}

        {statusFornadas === "pronto" && totaisFornadas.total > 0 && (
          <>
            <div className="linha-kpis">
              <div className="kpi">
                <span className="valor-kpi">{formatar(totaisFornadas.mediaPorDia)}</span>
                <span className="rotulo-kpi">Fornadas por dia</span>
              </div>
              <div className="kpi">
                <span className="valor-kpi">{totaisFornadas.primeiraHoraTipica}</span>
                <span className="rotulo-kpi">1ª fornada (típica)</span>
              </div>
              <div className="kpi">
                <span className="valor-kpi">{formatar(totaisFornadas.total)}</span>
                <span className="rotulo-kpi">Fornadas no período</span>
              </div>
              <div className="kpi">
                <span className="valor-kpi">{formatar(totaisFornadas.diasComFornada)}</span>
                <span className="rotulo-kpi">Dias com marcação</span>
              </div>
            </div>

            <GraficoBarras
              titulo="Ritmo do forno ao longo do dia"
              descricao="Média de fornadas por faixa de hora, num dia típico. Faixa vazia à tarde é balcão descoberto no fim do expediente — e sobra da manhã encalhando."
              barras={porFaixaDeHora}
              formato="media"
              sufixo="/dia"
              vazio="Ainda não há fornadas marcadas neste recorte."
            />

            <GraficoBarras
              titulo="Itens que mais repetem fornada"
              descricao="Quantas vezes por dia cada item sai do forno. Número alto é candidato a lote maior; número perto de 1 é item que sai uma vez e acabou."
              barras={porRepeticao}
              formato="media"
              sufixo="/dia"
              vazio="Ainda não há fornadas marcadas neste recorte."
            />
          </>
        )}
      </section>

      <div className="cartao-insights">
        <div className="cabecalho-insights">
          <h3>✨ Insights e melhorias (IA)</h3>
          <button
            type="button"
            className="secundario"
            disabled={statusInsights === "carregando"}
            onClick={gerarInsights}
          >
            {statusInsights === "carregando" ? "Analisando..." : insights ? "Gerar de novo" : "Analisar"}
          </button>
        </div>
        <p className="nota-rodape">
          Lê os mesmos números da tela — inclusive os padrões por dia e por semana — e aponta o que
          está fora da curva e o que dá para fazer a respeito. Sempre informativo: nunca altera
          cadastro nem cronograma sozinho.
        </p>
        {mensagemInsights && (
          <p
            className={statusInsights === "erro" ? "erro-conversao" : "nota-rodape"}
            role={statusInsights === "erro" ? "alert" : undefined}
          >
            {mensagemInsights}
          </p>
        )}
        {insights && insights.length > 0 && (
          <ul className="lista-insights">
            {insights.map((insight, i) => (
              <li key={i} className={`cartao-insight ${insight.tipo}`}>
                <strong>{insight.titulo}</strong>
                <p>{insight.detalhe}</p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function formatar(valor: number): string {
  return valor.toLocaleString("pt-BR", { maximumFractionDigits: 1 });
}
