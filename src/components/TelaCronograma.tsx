/**
 * src/components/TelaCronograma.tsx
 * ---------------------------------------------------------------
 * Fluxo: as 5 categorias fixas de produção, exibidas
 * recolhidas (acordeão) -> tocar num produto abre uma textbox de
 * quantidade (sempre em UNIDADES, protegida contra erro de digitação) ->
 * Confirmar adiciona à lista -> Resumo (conferência final) -> Confirmar
 * produção salva o plano -> Exportar/Imprimir (uma única fita com todas
 * as sessões, separadas por linha de corte, pronta para WhatsApp/impressora
 * térmica).
 *
 * Sempre monta a produção do DIA SEGUINTE (decisão operacional: o
 * cronograma é fechado no fim do expediente do dia anterior).
 *
 * Cada categoria fixa tem um botão "Sugerir com IA" (Gemini, via
 * src/lib/sugestaoProducao.ts) que pré-preenche quantidades vazias com
 * base no histórico de produção/perda — sempre assistido, nunca
 * automático: o operador revisa e ajusta antes de confirmar.
 */

import { useMemo, useState } from "react";
import type { Produto } from "../types/produto";
import type { ItemPlanoProducao, PlanoDeProducaoDiario, SessaoProducao } from "../types/producao";
import type { RegistroPerda } from "../types/perda";
import { dataDeHojeIso, dataDeAmanhaIso, diaDaSemanaDeData, formatarDataBr, rotuloDoDia } from "../lib/data";
import { gerarId } from "../lib/id";
import { CATEGORIAS_PRODUCAO, rotuloDaCategoria } from "../lib/categorias";
import { ehNumeroValidoPositivo, paraNumero, sanitizarEntradaNumerica } from "../lib/numeros";
import { buscarSugestaoProducao, montarHistoricoPorCategoria, ErroSugestaoProducao } from "../lib/sugestaoProducao";
import { ExportarFita } from "./ExportarFita";
import { ConfirmarProducao } from "./ConfirmarProducao";
import { ehPedidoDiario, type PedidoFilial } from "../types/pedido";
import type { FornadaPronta } from "../types/fornada";
import { codigosComFornadaNoDia } from "../types/fornada";
import { FILIAIS, LOJA_MATRIZ, nomeDaLoja } from "../lib/lojas";
import {
  consolidarProducao,
  itensParaLoja,
  type ItemConsolidado,
} from "../lib/consolidacao";
import { IconeCalendario, IconeLixeira, IconeSeta } from "./Icones";

interface TelaCronogramaProps {
  produtos: Produto[];
  /** Pedidos das filiais — entram no total a produzir (ver consolidacao.ts). */
  pedidos: PedidoFilial[];
  /** Confirma, no fim do expediente, o que realmente saiu do forno. */
  onConfirmarProducao: (planoId: string, codigosNaoProduzidos: number[]) => Promise<void>;
  /** Envia as imagens para a impressora térmica do caixa (ver types/impressao.ts). */
  onImprimirNoCaixa: (canvases: HTMLCanvasElement[], documento: string, nomeBase: string) => Promise<void>;
  /** Fornadas já marcadas hoje (ver types/fornada.ts). */
  fornadas: FornadaPronta[];
  planos: PlanoDeProducaoDiario[];
  perdas: RegistroPerda[];
  operador: string;
  onSalvarPlano: (plano: PlanoDeProducaoDiario) => Promise<void>;
}

type Fase = "montar" | "resumo" | "exportar";
type StatusSugestao = "" | "carregando" | "erro";

/**
 * A montagem do cronograma cobre SÓ as 5 categorias fixas de produção.
 * A sessão livre "Encomendas e Especiais" foi retirada daqui (decisão do
 * dono do negócio, ago/2026): encomenda não entra na programação diária.
 * CHAVE_ESPECIAL continua existindo em src/lib/categorias.ts só para que
 * rotuloDaCategoria() saiba traduzir a chave caso algum plano antigo a
 * tenha gravado — nunca é oferecida como sessão nova.
 */
const GRUPOS = CATEGORIAS_PRODUCAO.map((c) => c.chave);

export function TelaCronograma({
  produtos,
  pedidos,
  onConfirmarProducao,
  onImprimirNoCaixa,
  fornadas,
  planos,
  perdas,
  operador,
  onSalvarPlano,
}: TelaCronogramaProps) {
  const [dataAlvo, setDataAlvo] = useState(dataDeAmanhaIso());
  const [mostrarSeletorData, setMostrarSeletorData] = useState(false);
  /**
   * A sanfona do planejamento nasce FECHADA. Quem abre a aba na maior
   * parte do dia só quer conferir se a produção de amanhã já está
   * montada — e essa resposta agora está no próprio balão do título.
   * Quem vai montar toca uma vez e entra.
   */
  const [planejamentoAberto, setPlanejamentoAberto] = useState(false);
  const [lojasAbertas, setLojasAbertas] = useState<Record<string, boolean>>({});

  const planoExistente = useMemo(() => planos.find((p) => p.data === dataAlvo), [planos, dataAlvo]);

  const [itensPorGrupo, setItensPorGrupo] = useState<Record<string, ItemPlanoProducao[]>>(() =>
    mapaInicial(planoExistente)
  );
  const [expandido, setExpandido] = useState<Record<string, boolean>>({});
  const [produtoAtivo, setProdutoAtivo] = useState<number | null>(null);
  const [valorEditando, setValorEditando] = useState("");
  const [fase, setFase] = useState<Fase>("montar");
  const [salvando, setSalvando] = useState(false);
  const [planoConfirmado, setPlanoConfirmado] = useState<PlanoDeProducaoDiario | null>(null);
  // Qual sessão está com a limpeza pendente de confirmação (só uma por vez).
  // Limpar é destrutivo e não tem desfazer, então exige dois toques.
  const [sessaoAConfirmarLimpeza, setSessaoAConfirmarLimpeza] = useState<string | null>(null);
  const [documentoAtivo, setDocumentoAtivo] = useState<string>("producao");
  const [statusSugestao, setStatusSugestao] = useState<Record<string, StatusSugestao>>({});
  const [mensagemSugestao, setMensagemSugestao] = useState<Record<string, string>>({});

  const diaDaSemana = diaDaSemanaDeData(dataAlvo);
  const dataFormatada = `${rotuloDoDia(diaDaSemana)}, ${formatarDataBr(dataAlvo)}`;

  const pedidosDoDia = useMemo(() => pedidos.filter((p) => p.data === dataAlvo), [pedidos, dataAlvo]);

  /**
   * A confirmação do que saiu do forno é sobre a produção de HOJE, não
   * sobre o cronograma que está sendo montado (que é de amanhã). Por isso
   * o plano usado aqui é o do dia corrente, independente da data que o
   * operador estiver planejando na tela.
   */
  const hojeIso = dataDeHojeIso();
  const planoDeHoje = useMemo(
    () => planos.find((p) => p.data === hojeIso && p.status === "confirmado"),
    [planos, hojeIso]
  );

  /** Total pedido de cada item hoje (matriz + filiais) — é o que se confere. */
  const totaisPedidosDeHoje = useMemo(() => {
    if (!planoDeHoje) return undefined;
    const consolidado = consolidarProducao(
      planoDeHoje.sessoes.flatMap((sessao) => sessao.itens),
      pedidos.filter((p) => p.data === hojeIso),
      LOJA_MATRIZ.id
    );
    return new Map(consolidado.map((c) => [c.codigoPdv, c.totalUnidades]));
  }, [planoDeHoje, pedidos, hojeIso]);

  /**
   * `ehPedidoDiario` é obrigatório aqui: uma REPOSIÇÃO da loja tem a
   * mesma data e status "enviado", e sem o filtro ela faria a filial
   * parecer que já mandou o pedido do dia. A matriz confirmaria a
   * produção achando que estava completa.
   */
  const filiaisQueEnviaram = useMemo(
    () =>
      FILIAIS.filter((f) =>
        pedidosDoDia.some((p) => p.lojaId === f.id && p.status === "enviado" && ehPedidoDiario(p))
      ),
    [pedidosDoDia]
  );

  /**
   * Documentos disponíveis. Com MAIS DE UMA filial, entra a opção de sair
   * tudo numa bobina só (ago/2026): quem despacha não quer gerar,
   * compartilhar e imprimir duas vezes. A separação entre as lojas é
   * marcada por uma faixa preta com o nome da loja — ver
   * desenharMarcadorDeDestino em gerarImagemLista.ts.
   */
  /**
   * ATENÇÃO — HOOKS FICAM TODOS AQUI EM CIMA.
   *
   * Estes três useMemo já moraram depois dos `if (fase === ...) return`
   * e derrubaram o app: ao entrar no Resumo o componente retornava antes
   * de executá-los, o React contava menos hooks que na renderização
   * anterior e a tela ficava BRANCA, sem mensagem nenhuma — só reabrindo
   * o app (ago/2026).
   *
   * Regra do React: a mesma quantidade de hooks, na mesma ordem, em toda
   * renderização. Qualquer hook novo entra ANTES do primeiro return.
   */
  /**
   * O que vai ser produzido, aberto por destino.
   *
   * Junta o que a MATRIZ esta montando agora (rascunho na tela) com os
   * pedidos que as filiais ja enviaram para a mesma data. E a conta que o
   * padeiro executa e que a separacao da manha confere - ate hoje ela so
   * existia depois de "Ir para o Resumo", e conferir exigia sair do meio
   * da montagem.
   */
  const consolidadoDaData = useMemo(
    () =>
      consolidarProducao(
        GRUPOS.flatMap((chave) => itensPorGrupo[chave] ?? []),
        pedidosDoDia,
        LOJA_MATRIZ.id
      ),
    [itensPorGrupo, pedidosDoDia]
  );

  /**
   * O que vai para CADA loja, quebrado por sessão.
   *
   * Uma loja é um card; dentro dele, as sessões; dentro da sessão, os
   * itens com a quantidade daquela loja. É a mesma forma do trabalho
   * real: quem separa de manhã separa uma loja de cada vez, sessão por
   * sessão — e a tabela de colunas obrigava a matriz a fazer essa leitura
   * de cabeça, cruzando linha e coluna.
   */
  const porLoja = useMemo(
    () =>
      [LOJA_MATRIZ, ...FILIAIS].map((loja) => {
        const itens = itensParaLoja(consolidadoDaData, loja.id);
        const sessoes = GRUPOS.map((chave) => ({
          chave,
          rotulo: rotuloDaCategoria(chave),
          itens: itens.filter(
            (i) => produtos.find((p) => p.codigoPdv === i.codigoPdv)?.categoria === chave
          ),
        })).filter((sessao) => sessao.itens.length > 0);

        return {
          loja,
          sessoes,
          total: itens.reduce((soma, i) => soma + i.quantidadeUnidades, 0),
          variedades: itens.length,
        };
      }),
    [consolidadoDaData, produtos]
  );

  const documentos = useMemo(() => {
    const lista = [{ id: "producao", rotulo: "Produção" }];
    if (filiaisQueEnviaram.length > 1) lista.push({ id: "todas-filiais", rotulo: "Filiais (todas)" });
    for (const filial of filiaisQueEnviaram) {
      lista.push({ id: filial.id, rotulo: filial.nomeCurto });
    }
    return lista;
  }, [filiaisQueEnviaram]);

  /** Todas as filiais numa bobina só, cada uma aberta por uma faixa preta. */
  function blocosDeTodasAsFiliais(consolidado: ItemConsolidado[]) {
    return filiaisQueEnviaram.flatMap((filial) =>
      blocosDeSeparacao(consolidado, filial.id).map((bloco, indice) => ({
        ...bloco,
        // Só o PRIMEIRO bloco de cada loja carrega o marcador — os
        // seguintes são categorias da mesma loja, separadas pela faixa
        // de corte comum.
        inicioDeDestino: indice === 0 ? filial.nome : undefined,
      }))
    );
  }

  function blocosDeSeparacao(consolidado: ItemConsolidado[], lojaId: string) {
    // Agrupado por categoria também no romaneio: quem separa anda pela
    // padaria por setor, não por ordem alfabética de produto.
    const itens = itensParaLoja(consolidado, lojaId);
    const porCategoria = new Map<string, typeof itens>();
    for (const item of itens) {
      const categoria = produtos.find((p) => p.codigoPdv === item.codigoPdv)?.categoria ?? "OUTROS";
      porCategoria.set(categoria, [...(porCategoria.get(categoria) ?? []), item]);
    }
    return [...porCategoria.entries()].map(([categoria, lista]) => ({
      rotuloSessao: rotuloDaCategoria(categoria),
      itens: lista,
    }));
  }

  function trocarData(novaData: string) {
    setDataAlvo(novaData);
    setSessaoAConfirmarLimpeza(null);
    const plano = planos.find((p) => p.data === novaData);
    setItensPorGrupo(mapaInicial(plano));
    setFase("montar");
    setProdutoAtivo(null);
  }

  const totalItens = Object.values(itensPorGrupo).reduce((soma, itens) => soma + itens.length, 0);
  const totalUnidades = Object.values(itensPorGrupo)
    .flat()
    .reduce((soma, i) => soma + i.quantidadeUnidades, 0);

  function produtosDaCategoria(chave: string): Produto[] {
    return produtos
      .filter((p) => p.categoria === chave && p.ativoNaProducao)
      .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  }

  function abrirEdicao(codigoPdv: number, chaveGrupo: string) {
    if (produtoAtivo === codigoPdv) {
      setProdutoAtivo(null);
      setValorEditando("");
      return;
    }
    setProdutoAtivo(codigoPdv);
    const existente = itensPorGrupo[chaveGrupo]?.find((i) => i.codigoPdv === codigoPdv);
    setValorEditando(existente ? String(existente.quantidadeUnidades) : "");
  }

  function confirmarQuantidade(chaveGrupo: string, codigoPdv: number) {
    if (!ehNumeroValidoPositivo(valorEditando)) return;
    const quantidadeUnidades = paraNumero(valorEditando);
    setItensPorGrupo((atual) => {
      const itensAtuais = atual[chaveGrupo] ?? [];
      const existe = itensAtuais.some((i) => i.codigoPdv === codigoPdv);
      const novosItens = existe
        ? itensAtuais.map((i) => (i.codigoPdv === codigoPdv ? { ...i, quantidadeUnidades } : i))
        : [...itensAtuais, { codigoPdv, quantidadeUnidades }];
      return { ...atual, [chaveGrupo]: novosItens };
    });
    setProdutoAtivo(null);
    setValorEditando("");
  }

  function removerItem(chaveGrupo: string, codigoPdv: number) {
    setItensPorGrupo((atual) => ({
      ...atual,
      [chaveGrupo]: (atual[chaveGrupo] ?? []).filter((i) => i.codigoPdv !== codigoPdv),
    }));
  }

  /**
   * Limpa os itens de UMA sessão. Deliberadamente não existe um "limpar
   * tudo" que zere as 5 sessões de uma vez (decisão do dono do negócio,
   * ago/2026): um toque errado num botão global apagaria o cronograma
   * inteiro montado no fim do expediente, sem desfazer.
   */
  function limparSessao(chaveGrupo: string) {
    setItensPorGrupo((atual) => ({ ...atual, [chaveGrupo]: [] }));
    setSessaoAConfirmarLimpeza(null);
    setProdutoAtivo(null);
    // Recolhe o acordeão depois de limpar: a sessão ficou vazia, e deixá-la
    // aberta com a lista inteira de produtos disponíveis empurra as outras
    // sessões para fora da tela justamente quando o operador vai remontar.
    setExpandido((atual) => ({ ...atual, [chaveGrupo]: false }));
  }

  function nomeDoProduto(codigoPdv: number): string {
    return produtos.find((p) => p.codigoPdv === codigoPdv)?.nome ?? `#${codigoPdv}`;
  }

  async function gerarSugestaoIA(chave: string) {
    setStatusSugestao((atual) => ({ ...atual, [chave]: "carregando" }));
    setMensagemSugestao((atual) => ({ ...atual, [chave]: "" }));
    try {
      const historico = montarHistoricoPorCategoria(chave, produtos, planos, perdas);
      const sugestoes = await buscarSugestaoProducao(diaDaSemana, chave, historico);

      setItensPorGrupo((atual) => {
        const itensAtuais = atual[chave] ?? [];
        const codigosExistentes = new Set(itensAtuais.map((i) => i.codigoPdv));
        const novosItens = sugestoes
          .filter((s) => !codigosExistentes.has(s.codigoPdv) && s.quantidadeSugerida > 0)
          .map((s) => ({ codigoPdv: s.codigoPdv, quantidadeUnidades: arred(s.quantidadeSugerida) }));
        return { ...atual, [chave]: [...itensAtuais, ...novosItens] };
      });
      setExpandido((atual) => ({ ...atual, [chave]: true }));
      setStatusSugestao((atual) => ({ ...atual, [chave]: "" }));
      setMensagemSugestao((atual) => ({
        ...atual,
        [chave]:
          sugestoes.length > 0
            ? `${sugestoes.length} sugestão(ões) da IA adicionada(s) — revise as quantidades antes de confirmar.`
            : "A IA não encontrou histórico suficiente para sugerir quantidades nesta categoria ainda.",
      }));
    } catch (erro) {
      setStatusSugestao((atual) => ({ ...atual, [chave]: "erro" }));
      setMensagemSugestao((atual) => ({
        ...atual,
        [chave]: erro instanceof ErroSugestaoProducao ? erro.message : "Não foi possível gerar a sugestão agora.",
      }));
    }
  }

  async function confirmarESalvar() {
    setSalvando(true);
    const sessoes: SessaoProducao[] = GRUPOS.filter((chave) => (itensPorGrupo[chave]?.length ?? 0) > 0).map(
      (chave) => ({
        id: planoExistente?.sessoes.find((s) => s.categoria === chave)?.id ?? gerarId(),
        categoria: chave,
        itens: itensPorGrupo[chave] ?? [],
      })
    );
    const plano: PlanoDeProducaoDiario = {
      id: planoExistente?.id ?? gerarId(),
      data: dataAlvo,
      diaDaSemana,
      sessoes,
      status: "confirmado",
      criadoPor: planoExistente?.criadoPor ?? operador,
      criadoEm: planoExistente?.criadoEm ?? new Date().toISOString(),
      confirmadoEm: new Date().toISOString(),
    };
    try {
      await onSalvarPlano(plano);
      setPlanoConfirmado(plano);
      setFase("exportar");
    } catch {
      // Fica na tela de resumo com os itens intactos — a mensagem de
      // falha vem do aviso global (ver App.tsx). Avançar para a tela de
      // impressão sem ter salvo seria pior: o operador imprimiria uma
      // lista que o banco não tem.
    } finally {
      setSalvando(false);
    }
  }

  // ------------------------------------------------------------------
  // Fase: Exportar / Imprimir
  // ------------------------------------------------------------------
  if (fase === "exportar" && planoConfirmado) {
    /**
     * Saem DOIS tipos de documento da mesma confirmação, porque a
     * operação faz duas perguntas diferentes (ver src/lib/consolidacao.ts):
     * o padeiro precisa do TOTAL por item; quem separa de manhã precisa
     * da divisão por loja.
     */
    const consolidado = consolidarProducao(
      planoConfirmado.sessoes.flatMap((sessao) => sessao.itens),
      pedidosDoDia,
      LOJA_MATRIZ.id
    );

    // Fita de produção: mesmas sessões por categoria, mas com as
    // quantidades TOTALIZADAS (matriz + filiais que enviaram).
    const blocosProducao = planoConfirmado.sessoes.map((sessao) => ({
      rotuloSessao: rotuloDaCategoria(sessao.categoria),
      itens: sessao.itens.map((item) => ({
        codigoPdv: item.codigoPdv,
        quantidadeUnidades:
          consolidado.find((c) => c.codigoPdv === item.codigoPdv)?.totalUnidades ??
          item.quantidadeUnidades,
      })),
    }));

    const documentoSelecionado = documentos.find((d) => d.id === documentoAtivo) ?? documentos[0];

    return (
      <div className="tela">
        <h2>Listas prontas para impressão</h2>
        <p className="mensagem-sucesso">Produção de {dataFormatada} confirmada.</p>

        <div className="seletor-documento">
          {documentos.map((d) => (
            <button
              key={d.id}
              type="button"
              className={documentoAtivo === d.id ? "ativa" : ""}
              onClick={() => setDocumentoAtivo(d.id)}
            >
              {d.rotulo}
            </button>
          ))}
        </div>

        {documentoSelecionado.id === "todas-filiais" ? (
          <ExportarFita
            blocos={blocosDeTodasAsFiliais(consolidado)}
            titulo="Separação por loja"
            instrucao="As duas filiais numa bobina só. Cada loja começa depois de uma faixa preta com o nome dela — corte ali para separar os pedidos antes de despachar."
            dataFormatada={dataFormatada}
            produtos={produtos}
            montadoPor={planoConfirmado.criadoPor}
            nomeArquivoBase={`separacao-filiais-${dataAlvo}`}
            onImprimirNoCaixa={(canvases, titulo) =>
              onImprimirNoCaixa(canvases, titulo, `separacao-filiais-${dataAlvo}`)
            }
          />
        ) : documentoSelecionado.id === "producao" ? (
          <ExportarFita
            blocos={blocosProducao}
            titulo="Lista de Produção"
            instrucao="Quantidades TOTAIS — matriz mais as filiais que enviaram pedido. Imprima em uma tira só, corte em cada tesourinha e fixe cada pedaço no quadro do respectivo setor."
            dataFormatada={dataFormatada}
            produtos={produtos}
            montadoPor={planoConfirmado.criadoPor}
            nomeArquivoBase={`producao-${dataAlvo}`}
            onImprimirNoCaixa={(canvases, titulo) =>
              onImprimirNoCaixa(canvases, titulo, `producao-${dataAlvo}`)
            }
          />
        ) : (
          <ExportarFita
            blocos={blocosDeSeparacao(consolidado, documentoSelecionado.id)}
            titulo={`Separação — ${nomeDaLoja(documentoSelecionado.id)}`}
            instrucao="O que sai da matriz para esta loja. Use na separação da manhã, conferindo item por item antes de despachar."
            dataFormatada={dataFormatada}
            produtos={produtos}
            montadoPor={planoConfirmado.criadoPor}
            nomeArquivoBase={`separacao-${documentoSelecionado.id.toLowerCase()}-${dataAlvo}`}
            onImprimirNoCaixa={(canvases, titulo) =>
              onImprimirNoCaixa(canvases, titulo, `separacao-${documentoSelecionado.id.toLowerCase()}-${dataAlvo}`)
            }
          />
        )}

        <div className="acoes">
          <button type="button" className="secundario" onClick={() => setFase("montar")}>
            Voltar ao Cronograma
          </button>
        </div>
      </div>
    );
  }

  // ------------------------------------------------------------------
  // Fase: Resumo
  // ------------------------------------------------------------------
  if (fase === "resumo") {
    return (
      <div className="tela">
        <h2>Resumo — última conferência</h2>
        <p className="subtitulo destaque-data">{dataFormatada}</p>

        {GRUPOS.filter((chave) => (itensPorGrupo[chave]?.length ?? 0) > 0).map((chave) => {
          const itens = itensPorGrupo[chave] ?? [];
          const subtotal = itens.reduce((s, i) => s + i.quantidadeUnidades, 0);
          return (
            <div key={chave}>
              <h3>{rotuloDaCategoria(chave)}</h3>
              <div className="tabela-scroll">
                <table className="tabela-simples">
                  <thead>
                    <tr>
                      <th>Produto</th>
                      <th>Unidades</th>
                    </tr>
                  </thead>
                  <tbody>
                    {itens.map((item) => (
                      <tr key={item.codigoPdv}>
                        <td>{nomeDoProduto(item.codigoPdv)}</td>
                        <td>{item.quantidadeUnidades} un</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="nota-rodape">Subtotal: {arred(subtotal)} un</p>
            </div>
          );
        })}

        <p className="total-linha">
          <strong>{totalItens}</strong> itens · <strong>{arred(totalUnidades)}</strong> unidades planejadas no total
        </p>

        <div className="acoes">
          <button type="button" className="secundario" onClick={() => setFase("montar")}>
            Voltar e ajustar
          </button>
          <button type="button" className="primario" disabled={salvando} onClick={confirmarESalvar}>
            {salvando ? "Salvando..." : "Confirmar produção"}
          </button>
        </div>
      </div>
    );
  }

  // ------------------------------------------------------------------
  // Fase: Montar (padrão)
  // ------------------------------------------------------------------

  /**
   * Estado do plano em três palavras, para caber na linha do título.
   * "confirmado" é o único que encerra o assunto; os outros dois dizem
   * que ainda falta alguém fazer alguma coisa, e por isso ficam em âmbar.
   */
  const estadoDoPlano =
    planoExistente?.status === "confirmado"
      ? { texto: "Plano confirmado", tom: "ok" }
      : planoExistente
        ? { texto: "Rascunho salvo", tom: "pendente" }
        : { texto: "Ainda não montado", tom: "pendente" };

  const faltantes = FILIAIS.filter((f) => !filiaisQueEnviaram.some((e) => e.id === f.id));
  const filiaisFaltando = faltantes.length;
  /**
   * Uma frase, não dois cartões. O que a matriz decide com isto é uma
   * coisa só: dá para confirmar a produção agora, ou ainda falta pedido
   * de alguém? O nome de quem falta aparece quando é UMA loja — com duas
   * faltando, o número já basta e o nome só alongaria a linha.
   */
  const resumoDasFiliais =
    filiaisFaltando === 0
      ? "as duas filiais já pediram"
      : filiaisFaltando === FILIAIS.length
        ? "nenhuma filial pediu ainda"
        : `falta ${faltantes[0].nomeCurto}`;

  return (
    <div className="tela">
      {/*
        O BALÃO DO TÍTULO CARREGA O ESTADO, E É A PORTA DO PLANEJAMENTO
        ---------------------------------------------------------------
        Antes eram três blocos empilhados dizendo coisas sobre o mesmo
        dia: a data num balão, "Rascunho salvo — carregado abaixo" em
        outro, e os cartões de "enviou / não enviou" das filiais num
        terceiro. Três caixas para uma frase só — "a produção de quinta
        está assim" —, e a lista de produtos começava lá embaixo.

        Agora é um balão só: data, estado do plano e situação das filiais
        juntos, e ele é o botão que abre a sanfona do planejamento. Quem
        entra na aba responde de relance "está pronto?"; quem vai montar
        toca e entra.
      */}
      <button
        type="button"
        className={`destaque-data cabecalho-planejamento ${planejamentoAberto ? "aberto" : ""}`}
        aria-expanded={planejamentoAberto}
        onClick={() => setPlanejamentoAberto((v) => !v)}
      >
        <IconeCalendario tamanho={20} />
        <span className="texto-planejamento">
          <span className="titulo-planejamento">Produção de {dataFormatada}</span>
          <span className="linha-estado">
            {/* Sem separador entre os dois: quando a linha quebra, o "·"
                ficava órfão no fim da primeira metade. O espaço já separa. */}
            <span className={`estado-plano ${estadoDoPlano.tom}`}>{estadoDoPlano.texto}</span>
            <span className={`estado-filiais ${filiaisFaltando === 0 ? "ok" : "pendente"}`}>
              {resumoDasFiliais}
            </span>
          </span>
        </span>
        <IconeSeta className="seta-sessao" />
      </button>

      {planoDeHoje && (
        <ConfirmarProducao
          plano={planoDeHoje}
          produtos={produtos}
          operador={operador}
          totaisPedidos={totaisPedidosDeHoje}
          codigosComFornada={codigosComFornadaNoDia(fornadas, hojeIso)}
          onConfirmar={(codigos) => onConfirmarProducao(planoDeHoje.id, codigos)}
        />
      )}

      {/* As reposições saíram desta tela (ago/2026): elas são de HOJE e
          moram na aba "Nova fornada", junto do resto do que acontece
          durante o expediente. O Cronograma é sobre AMANHÃ. */}

      {/*
        QUANTO VAI PARA CADA UM — antes só existia depois de "Ir para o
        Resumo". Conferir se o pedido da filial já entrou na conta obrigava
        a sair do meio da montagem e voltar, e quem monta confere isso
        várias vezes enquanto digita.

        Sanfona fechada: é consulta, não etapa. O cabeçalho já diz o total
        do dia, que na maioria das vezes é a única coisa que se queria
        saber.
      */}
      {/*
        UM CARD POR LOJA (ago/2026).
        Substituiu o quadro único "Quanto vai para cada loja". A tabela
        com uma coluna por loja obrigava a matriz a cruzar linha e coluna
        de cabeça; e quem separa de manhã separa UMA loja de cada vez,
        sessão por sessão. O card agora tem a forma do trabalho real.

        O status do pedido do dia seguinte mora dentro do próprio card:
        antes era preciso decorar quem tinha enviado para saber se aquele
        número já estava completo.
      */}
      {porLoja.map(({ loja: destino, sessoes, total, variedades }) => {
        const ehFilial = destino.papel === "filial";
        const enviou = filiaisQueEnviaram.some((f) => f.id === destino.id);
        const aberto = !!lojasAbertas[destino.id];

        // Filial: o que importa é se a lista chegou. Matriz: em que pé
        // está o cronograma que ela mesma monta.
        const situacao = ehFilial
          ? enviou
            ? { texto: "lista enviada", tom: "ok" }
            : { texto: "lista pendente", tom: "pendente" }
          : planoExistente?.status === "confirmado"
            ? { texto: "cronograma confirmado", tom: "ok" }
            : { texto: "montando", tom: "pendente" };

        return (
          <div key={destino.id} className={`card-loja ${aberto ? "aberto" : ""}`}>
            <button
              type="button"
              className="cabecalho-loja"
              aria-expanded={aberto}
              onClick={() =>
                setLojasAbertas((atual) => ({ ...atual, [destino.id]: !atual[destino.id] }))
              }
            >
              <span className="texto-loja">
                <span className="nome-loja">{destino.nomeCurto}</span>
                <span className={`situacao-loja ${situacao.tom}`}>{situacao.texto}</span>
              </span>
              <span className="total-loja">
                {total > 0 ? `${arred(total)} un` : "—"}
              </span>
              <IconeSeta className="seta-sessao" />
            </button>

            {aberto && (
              <div className="corpo-loja">
                {sessoes.length === 0 ? (
                  <p className="nota-rodape">
                    {ehFilial && !enviou
                      ? "Esta filial ainda não enviou o pedido do dia."
                      : "Nada destinado a esta loja neste cronograma."}
                  </p>
                ) : (
                  <>
                    {sessoes.map((sessao) => (
                      <div key={sessao.chave} className="sessao-da-loja">
                        <h4>{sessao.rotulo}</h4>
                        {sessao.itens.map((item) => (
                          <div key={item.codigoPdv} className="item-da-loja">
                            <span className="nome-item-loja">{nomeDoProduto(item.codigoPdv)}</span>
                            <span className="qtd-item-loja">
                              {arred(item.quantidadeUnidades)} un
                            </span>
                          </div>
                        ))}
                      </div>
                    ))}
                    <p className="nota-rodape">
                      {variedades} {variedades === 1 ? "produto" : "produtos"} · {arred(total)}{" "}
                      unidades
                    </p>
                  </>
                )}
              </div>
            )}
          </div>
        );
      })}

      {!planejamentoAberto ? null : (
      <>
      {planoExistente?.status === "confirmado" && (
        <p className="callout-inline">
          Plano confirmado.{" "}
          <button
            type="button"
            className="link"
            onClick={() => {
              setPlanoConfirmado(planoExistente);
              setFase("exportar");
            }}
          >
            reimprimir
          </button>
        </p>
      )}

      <button type="button" className="link" onClick={() => setMostrarSeletorData((v) => !v)}>
        {mostrarSeletorData ? "usar amanhã (padrão)" : "planejar para outra data"}
      </button>
      {mostrarSeletorData && (
        <input type="date" value={dataAlvo} onChange={(e) => trocarData(e.target.value)} />
      )}

      {GRUPOS.map((chave) => {
        const rotulo = rotuloDaCategoria(chave);
        const itensDoGrupo = itensPorGrupo[chave] ?? [];
        const aberto = !!expandido[chave];
        const listaProdutos = produtosDaCategoria(chave);
        const statusIA = statusSugestao[chave] ?? "";
        const mensagemIA = mensagemSugestao[chave] ?? "";

        return (
          <div key={chave} className={`acordeao-sessao ${aberto ? "aberta" : ""}`}>
            {/* O cabeçalho deixou de ser um botão único (ago/2026) para
                caber "limpar" ao lado da contagem, longe do "remover"
                de cada produto — os dois botões vizinhos estavam sendo
                confundidos. Botão não pode aninhar botão, daí a div. */}
            <div className="cabecalho-sessao">
              <button
                type="button"
                className="abrir-sessao"
                aria-expanded={aberto}
                onClick={() => setExpandido((atual) => ({ ...atual, [chave]: !atual[chave] }))}
              >
                <span className="nome-sessao">{rotulo}</span>
                <span className="contagem-itens">
                  {itensDoGrupo.length > 0
                    ? `${itensDoGrupo.length} ${itensDoGrupo.length === 1 ? "item" : "itens"}`
                    : ""}
                </span>
                <IconeSeta className="seta-sessao" />
              </button>

              {itensDoGrupo.length > 0 &&
                (sessaoAConfirmarLimpeza === chave ? (
                  <span className="confirmar-limpeza">
                    <button type="button" className="perigo" onClick={() => limparSessao(chave)}>
                      Apagar {itensDoGrupo.length}?
                    </button>
                    <button
                      type="button"
                      className="link"
                      onClick={() => setSessaoAConfirmarLimpeza(null)}
                    >
                      não
                    </button>
                  </span>
                ) : (
                  <button
                    type="button"
                    className="botao-limpar-sessao"
                    title={`Limpar ${rotulo}`}
                    aria-label={`Limpar os itens de ${rotulo}`}
                    onClick={() => setSessaoAConfirmarLimpeza(chave)}
                  >
                    <IconeLixeira tamanho={17} />
                  </button>
                ))}
            </div>

            {aberto && (
              <div className="corpo-sessao">
                <div className="linha-sugestao-ia">
                  <button
                    type="button"
                    className="secundario"
                    disabled={statusIA === "carregando"}
                    onClick={() => gerarSugestaoIA(chave)}
                  >
                    {statusIA === "carregando" ? "Gerando sugestão..." : "✨ Sugerir quantidades com IA"}
                  </button>
                </div>
                {mensagemIA && (
                  <p className={statusIA === "erro" ? "erro-conversao" : "nota-rodape"}>{mensagemIA}</p>
                )}

                {listaProdutos.length === 0 && (
                  <p className="nota-rodape">Nenhum produto ativo nesta categoria ainda.</p>
                )}

                {listaProdutos.map((produto) => {
                  const itemSalvo = itensDoGrupo.find((i) => i.codigoPdv === produto.codigoPdv);
                  const editando = produtoAtivo === produto.codigoPdv;
                  return (
                    <div key={produto.codigoPdv} className="linha-produto-cronograma">
                      <button
                        type="button"
                        className={`item-produto ${itemSalvo ? "confirmado" : ""}`}
                        onClick={() => abrirEdicao(produto.codigoPdv, chave)}
                      >
                        <span>{produto.nome}</span>
                        {itemSalvo && <span className="valor-confirmado">{itemSalvo.quantidadeUnidades} un ✓</span>}
                      </button>

                      {editando && (
                        <div className="editor-quantidade">
                          <input
                            type="text"
                            inputMode="decimal"
                            pattern="[0-9]*[.,]?[0-9]*"
                            autoFocus
                            placeholder="Quantidade em unidades"
                            value={valorEditando}
                            onChange={(e) => setValorEditando(sanitizarEntradaNumerica(e.target.value))}
                          />
                          <span className="unidade-fixa">un</span>
                          <button
                            type="button"
                            className="primario"
                            disabled={!ehNumeroValidoPositivo(valorEditando)}
                            onClick={() => confirmarQuantidade(chave, produto.codigoPdv)}
                          >
                            Confirmar
                          </button>
                        </div>
                      )}

                      {itemSalvo && !editando && (
                        <button
                          type="button"
                          className="link"
                          onClick={() => removerItem(chave, produto.codigoPdv)}
                        >
                          remover
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}

      <div className="acoes">
        <button type="button" className="primario" disabled={totalItens === 0} onClick={() => setFase("resumo")}>
          Ir para o Resumo ({totalItens} itens)
        </button>
      </div>
      </>
      )}
    </div>
  );
}

function mapaInicial(plano: PlanoDeProducaoDiario | undefined): Record<string, ItemPlanoProducao[]> {
  if (!plano) return {};
  const mapa: Record<string, ItemPlanoProducao[]> = {};
  for (const sessao of plano.sessoes) {
    mapa[sessao.categoria] = sessao.itens;
  }
  return mapa;
}

function arred(valor: number): number {
  return Math.round(valor * 100) / 100;
}
