/**
 * src/components/TelaPerdas.tsx
 * ---------------------------------------------------------------
 * Escolhe o produto, usa TelaRegistroPerda (já com o cálculo kg ->
 * unidades embutido) e mostra o histórico do dia. Serve tanto para o
 * lançamento de fim de expediente quanto para uma perda no meio do dia —
 * fornada queimada ou fora do padrão tem que ser lançada na hora.
 *
 * Perda NÃO é sinônimo de vencimento: um produto pode sair do forno fora
 * do padrão e virar perda no mesmo dia. Por isso a lista aqui traz todo
 * produto que já foi produzido em alguma ocasião, e não só os que estão
 * dentro do prazo — o prazo serve para identificar de qual fornada a
 * perda veio, nunca para autorizar o lançamento (ver janelaValidade.ts).
 */

import { useMemo, useState } from "react";
import type { Produto } from "../types/produto";
import type { RegistroPerda } from "../types/perda";
import type { PlanoDeProducaoDiario } from "../types/producao";
import { TelaRegistroPerda } from "./TelaRegistroPerda";
import { calcularCandidatosPerda, type ProdutoComOrigens } from "../lib/janelaValidade";
import { CATEGORIAS_PRODUCAO } from "../lib/categorias";
import { IconeSeta } from "./Icones";
import { LOJA_MATRIZ, nomeDaLoja, type Loja } from "../lib/lojas";
import { IconeLixeira } from "./Icones";
import { dataDeHojeIso, diaDaSemanaDeData, rotuloDoDia } from "../lib/data";

interface TelaPerdasProps {
  produtos: Produto[];
  planos: PlanoDeProducaoDiario[];
  perdas: RegistroPerda[];
  operador: string;
  /** Loja desta sessão — define o que a tela mostra e o que permite. */
  loja: Loja;
  /**
   * Só a matriz anula lançamento errado (ver firestore.rules) e só ela
   * enxerga as perdas das outras lojas.
   */
  ehMatriz: boolean;
  onAnularPerda: (perdaId: string, motivo: string) => Promise<void>;
  onRegistrarPerda: (payload: {
    codigoPdv: number;
    planoDeProducaoId: string;
    quantidadeQuilos: number;
    pesoUnitarioGramasInformado: number;
    quantidadeUnidadesEstimada: number;
    motivo: RegistroPerda["motivo"];
    observacao?: string;
    registradoPor: string;
  }) => Promise<void>;
}

/** Um produto na lista de escolha, com o contexto de fornada quando existe. */
function BotaoProdutoPerda({
  candidato,
  onEscolher,
}: {
  candidato: ProdutoComOrigens;
  onEscolher: (codigoPdv: number) => void;
}) {
  return (
    <button
      type="button"
      className="item-produto"
      onClick={() => onEscolher(candidato.produto.codigoPdv)}
    >
      <span>{candidato.produto.nome}</span>
      {candidato.origens.length > 1 && (
        <span className="tag-pendente">{candidato.origens.length} fornadas</span>
      )}
    </button>
  );
}

export function TelaPerdas({
  produtos,
  planos,
  perdas,
  loja,
  operador,
  ehMatriz,
  onAnularPerda,
  onRegistrarPerda,
}: TelaPerdasProps) {
  const [buscaProduto, setBuscaProduto] = useState("");
  const [categoriasAbertas, setCategoriasAbertas] = useState<Record<string, boolean>>({});
  const [perdaAAnular, setPerdaAAnular] = useState<RegistroPerda | null>(null);
  const [motivoAnulacao, setMotivoAnulacao] = useState("");
  const [anulando, setAnulando] = useState(false);
  const [codigoSelecionado, setCodigoSelecionado] = useState<number | "">("");

  const hoje = dataDeHojeIso();
  const diaDaSemana = diaDaSemanaDeData(hoje);

  /**
   * Na MATRIZ a perda é atribuída a uma fornada: ela produziu, então dá
   * para saber de qual lote veio (ver src/lib/janelaValidade.ts).
   *
   * Na FILIAL não se amarra nem à produção do dia nem à validade
   * (ago/2026): a loja recebe mercadoria da matriz, tem no balcão estoque
   * de dias diferentes, e o que ela precisa é registrar o que jogou fora.
   * Qualquer produto ativo do catálogo pode receber perda ali.
   */
  const candidatos = useMemo(() => {
    if (ehMatriz) return calcularCandidatosPerda(hoje, produtos, planos);
    return produtos
      .filter((p) => p.ativoNaProducao)
      .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"))
      .map((produto) => ({ produto, origens: [], ultimaProducao: "" }));
  }, [hoje, produtos, planos, ehMatriz]);



  /**
   * A filial vê SÓ as perdas lançadas nela (ago/2026). Misturar o
   * desperdício das três lojas na tela de uma filial não ajuda quem
   * trabalha lá e expõe número de outra unidade sem necessidade. A matriz
   * vê tudo, com a loja de origem em cada linha.
   *
   * Registro anterior às filiais não tem lojaId — conta como matriz.
   */
  const perdasDeHoje = useMemo(
    () =>
      perdas.filter(
        (p) => p.data === hoje && (ehMatriz || (p.lojaId ?? LOJA_MATRIZ.id) === loja.id)
      ),
    [perdas, hoje, ehMatriz, loja.id]
  );

  const candidatoSelecionado = candidatos.find((c) => c.produto.codigoPdv === codigoSelecionado);

  const resultadosDaBusca = useMemo(() => {
    const termo = buscaProduto.trim().toUpperCase();
    if (!termo) return [];
    return candidatos.filter((c) => c.produto.nome.toUpperCase().includes(termo)).slice(0, 40);
  }, [candidatos, buscaProduto]);

  return (
    <div className="tela">
      <h2>Registro de Perdas</h2>
      <p className="subtitulo">{rotuloDoDia(diaDaSemana)}, {hoje}</p>



      {candidatos.length === 0 ? (
        /* Sem fornada disponível ainda não pode esconder o resto da tela:
           o histórico do dia e a anulação de lançamento errado precisam
           continuar acessíveis (defeito encontrado em teste, ago/2026). */
        <p className="callout-inline">
          Ainda não há nenhuma fornada confirmada no app, então não existe produção à qual atribuir
          uma perda. Isso não tem relação com prazo de validade — assim que existir um cronograma
          confirmado, qualquer item dele pode ser lançado como perda, inclusive no mesmo dia em que
          foi produzido.
          <br />
          <br />
          Se a padaria já produziu hoje ({rotuloDoDia(diaDaSemana)}) sem passar pelo app, vá em{" "}
          <strong>Cronograma</strong> → <strong>planejar para outra data</strong>, escolha hoje,
          registre o que foi produzido e confirme. Os itens passam a aparecer aqui.
        </p>
      ) : !candidatoSelecionado ? (
        <div>
          {/* Antes era uma grade com TODOS os candidatos de uma vez — na
              filial isso dava 86 blocos empilhados e ninguém achava nada.
              Busca no topo para quem sabe o nome, acordeão por categoria
              para quem está procurando; o mesmo padrão da tela de Pedido,
              que o operador já conhece (ago/2026). */}
          <input
            className="campo-busca"
            placeholder="Buscar produto pelo nome..."
            value={buscaProduto}
            onChange={(e) => setBuscaProduto(e.target.value)}
          />

          {buscaProduto.trim() ? (
            <>
              {resultadosDaBusca.length === 0 ? (
                <p className="nota-rodape">Nenhum produto encontrado com "{buscaProduto}".</p>
              ) : (
                <div className="lista-produtos-perda">
                  {resultadosDaBusca.map((c) => (
                    <BotaoProdutoPerda key={c.produto.codigoPdv} candidato={c} onEscolher={setCodigoSelecionado} />
                  ))}
                </div>
              )}
            </>
          ) : (
            CATEGORIAS_PRODUCAO.map((categoria) => {
              const daCategoria = candidatos.filter((c) => c.produto.categoria === categoria.chave);
              if (daCategoria.length === 0) return null;
              const aberto = !!categoriasAbertas[categoria.chave];
              return (
                <div key={categoria.chave} className={`acordeao-sessao ${aberto ? "aberta" : ""}`}>
                  <div className="cabecalho-sessao">
                    <button
                      type="button"
                      className="abrir-sessao"
                      aria-expanded={aberto}
                      onClick={() =>
                        setCategoriasAbertas((a) => ({ ...a, [categoria.chave]: !a[categoria.chave] }))
                      }
                    >
                      <span className="nome-sessao">{categoria.rotulo}</span>
                      <span className="contagem-itens">{daCategoria.length}</span>
                      <IconeSeta className="seta-sessao" />
                    </button>
                  </div>
                  {aberto && (
                    <div className="corpo-sessao">
                      {daCategoria.map((c) => (
                        <BotaoProdutoPerda key={c.produto.codigoPdv} candidato={c} onEscolher={setCodigoSelecionado} />
                      ))}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      ) : (
        <div>
          <button type="button" className="link" onClick={() => setCodigoSelecionado("")}>
            &larr; escolher outro produto
          </button>
          <TelaRegistroPerda
            produto={candidatoSelecionado.produto}
            origens={candidatoSelecionado.origens}
            registradoPor={operador}
            onSalvar={async (payload) => {
              await onRegistrarPerda(payload);
              setCodigoSelecionado("");
            }}
          />
        </div>
      )}

      <h3>{ehMatriz ? "Perdas lançadas hoje — todas as lojas" : "Perdas lançadas hoje"}</h3>
      <div className="tabela-scroll">
        <table className="tabela-simples">
          <thead>
            <tr>
              <th>Produto</th>
              <th>Peso perdido</th>
              <th>Peso unitário usado</th>
              <th>Unidades (est.)</th>
              {ehMatriz && <th>Loja</th>}
              <th>Motivo</th>
              {ehMatriz && <th aria-label="Anular" />}
            </tr>
          </thead>
          <tbody>
            {perdasDeHoje.length === 0 && (
              <tr>
                <td colSpan={ehMatriz ? 7 : 5} className="vazio">
                  Nenhuma perda registrada ainda hoje.
                </td>
              </tr>
            )}
            {perdasDeHoje.map((p) => (
              <tr key={p.id} className={p.cancelada ? "linha-anulada" : ""}>
                <td>{produtos.find((pr) => pr.codigoPdv === p.codigoPdv)?.nome ?? p.codigoPdv}</td>
                <td>{p.quantidadeQuilos} kg</td>
                <td>{p.pesoUnitarioGramasInformado} g</td>
                <td>{p.quantidadeUnidadesEstimada}</td>
                {ehMatriz && <td>{nomeDaLoja(p.lojaId ?? LOJA_MATRIZ.id)}</td>}
                <td>{p.cancelada ? "anulada" : p.motivo}</td>
                {ehMatriz && (
                  <td>
                    {!p.cancelada && (
                      <button
                        type="button"
                        className="botao-limpar-sessao"
                        title="Anular este lançamento"
                        aria-label="Anular este lançamento"
                        onClick={() => {
                          setPerdaAAnular(p);
                          setMotivoAnulacao("");
                        }}
                      >
                        <IconeLixeira tamanho={16} />
                      </button>
                    )}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Anular NÃO apaga o registro: marca. Ver o comentário em
          RegistroPerda.cancelada sobre por que o histórico é preservado. */}
      {perdaAAnular && (
        <div className="fundo-modal" role="dialog" aria-modal="true">
          <div className="caixa-modal">
            <h3>Anular lançamento</h3>
            <p className="nota-rodape">
              {produtos.find((pr) => pr.codigoPdv === perdaAAnular.codigoPdv)?.nome} —{" "}
              {perdaAAnular.quantidadeQuilos} kg ({perdaAAnular.quantidadeUnidadesEstimada} un).
              O lançamento deixa de contar nas análises, mas continua no histórico marcado como
              anulado, com o seu nome e a data.
            </p>
            <label>
              Motivo da anulação
              <input
                value={motivoAnulacao}
                onChange={(e) => setMotivoAnulacao(e.target.value)}
                placeholder="Ex.: quantidade digitada errada"
                autoFocus
              />
            </label>
            <div className="acoes">
              <button
                type="button"
                className="secundario"
                disabled={anulando}
                onClick={() => setPerdaAAnular(null)}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="perigo"
                disabled={anulando || motivoAnulacao.trim() === ""}
                onClick={async () => {
                  setAnulando(true);
                  try {
                    await onAnularPerda(perdaAAnular.id, motivoAnulacao.trim());
                    setPerdaAAnular(null);
                  } catch {
                    // Mensagem vem do aviso global (ver App.tsx).
                  } finally {
                    setAnulando(false);
                  }
                }}
              >
                {anulando ? "Anulando..." : "Anular lançamento"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
