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

import { useEffect, useMemo, useState } from "react";
import type { Produto } from "../types/produto";
import type { RegistroPerda } from "../types/perda";
import type { PlanoDeProducaoDiario } from "../types/producao";
import { TelaRegistroPerda } from "./TelaRegistroPerda";
import { calcularCandidatosPerda, type ProdutoComOrigens } from "../lib/janelaValidade";
import { CATEGORIAS_PRODUCAO } from "../lib/categorias";
import { contemBusca } from "../lib/texto";
import { IconeSeta } from "./Icones";
import { CampoDeBusca } from "./CampoDeBusca";
import { LOJA_MATRIZ, type Loja } from "../lib/lojas";
import { diaDaSemanaDeData, formatarDataBr, rotuloDoDia } from "../lib/data";

interface TelaPerdasProps {
  produtos: Produto[];
  planos: PlanoDeProducaoDiario[];
  perdas: RegistroPerda[];
  operador: string;
  /**
   * A data de hoje, vinda do App (ver src/lib/useDiaCorrente.ts).
   *
   * Não é calculada aqui de propósito: calculada aqui, ela só mudaria
   * quando algo fizesse o React renderizar — e com o app aberto a noite
   * inteira nada faz. A tela ficava no dia anterior sem que nada
   * indicasse isso.
   */
  hoje: string;
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
  hoje,
  onAnularPerda,
  onRegistrarPerda,
}: TelaPerdasProps) {
  const [buscaProduto, setBuscaProduto] = useState("");
  const [categoriasAbertas, setCategoriasAbertas] = useState<Record<string, boolean>>({});
  const [perdaAAnular, setPerdaAAnular] = useState<RegistroPerda | null>(null);
  const [motivoAnulacao, setMotivoAnulacao] = useState("");
  const [anulando, setAnulando] = useState(false);
  const [codigoSelecionado, setCodigoSelecionado] = useState<number | "">("");

  const diaDaSemana = diaDaSemanaDeData(hoje);

  /**
   * VIRADA DE DIA COM O APP ABERTO (ago/2026)
   *
   * No PC do caixa o app fica aberto a noite inteira, parado nesta aba.
   * Na quinta de manhã a tela ainda era a de quarta: o produto que sobrou
   * selecionado, a sanfona aberta na categoria de ontem, a busca com o
   * termo de ontem — e as perdas da quarta listadas como "lançadas hoje".
   * Os DADOS estavam certos; a tela é que nunca soube que o dia mudou.
   *
   * `hoje` agora chega de fora e muda sozinho na virada (ver
   * src/lib/useDiaCorrente.ts). Isto aqui limpa o que sobrou da sessão
   * anterior, para o dia começar como começa de verdade: formulário
   * vazio, sanfona fechada, pronto para o primeiro lançamento.
   *
   * O modal de anulação também fecha: ele carrega um registro do dia que
   * acabou, e confirmar uma anulação sem reler qual era o lançamento é
   * exatamente o tipo de engano que a senha existe para evitar.
   */
  useEffect(() => {
    setCodigoSelecionado("");
    setBuscaProduto("");
    setCategoriasAbertas({});
    setPerdaAAnular(null);
    setMotivoAnulacao("");
  }, [hoje]);

  /**
   * TODO produto ativo do catálogo pode receber perda, nas três lojas
   * (ago/2026 — pedido do dono do negócio, depois de a matriz ficar sem
   * conseguir lançar itens que não estavam na fornada do dia).
   *
   * A janela de validade não sumiu: ela continua sendo consultada para
   * ATRIBUIR a perda a uma fornada quando existe uma (o seletor "Produzido
   * em", FIFO, em TelaRegistroPerda). O que ela deixou de fazer é decidir
   * QUEM aparece na lista — isso era uma trava, e perda não é vencimento.
   *
   * Na prática: a matriz produz e costuma ter fornada atribuível; a filial
   * recebe da matriz e quase nunca tem. As duas lançam do mesmo jeito.
   */
  const candidatos = useMemo(() => {
    const comFornada = new Map(
      calcularCandidatosPerda(hoje, produtos, planos).map((c) => [c.produto.codigoPdv, c])
    );
    return produtos
      .filter((p) => p.ativoNaProducao)
      .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"))
      .map(
        (produto) =>
          comFornada.get(produto.codigoPdv) ?? { produto, origens: [], ultimaProducao: "" }
      );
  }, [hoje, produtos, planos]);



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

  /**
   * O último lançamento válido do dia — o único que ainda dá para anular
   * a partir desta tela desde que a tabela saiu. É onde o erro é
   * percebido: quem digitou 20 kg no lugar de 2 vê o número na hora.
   */
  const ultimoLancamento = useMemo(
    () => [...perdasDeHoje].reverse().find((p) => !p.cancelada),
    [perdasDeHoje]
  );

  const candidatoSelecionado = candidatos.find((c) => c.produto.codigoPdv === codigoSelecionado);

  const resultadosDaBusca = useMemo(() => {
    const termo = buscaProduto.trim();
    if (!termo) return [];
    return candidatos.filter((c) => contemBusca(c.produto.nome, termo)).slice(0, 40);
  }, [candidatos, buscaProduto]);

  return (
    <div className="tela">
      <h2>Registro de Perdas</h2>
      <p className="subtitulo">{rotuloDoDia(diaDaSemana)}, {formatarDataBr(hoje)}</p>



      {candidatos.length === 0 ? (
        /* Agora só cai aqui se o catálogo estiver vazio de verdade — a
           lista deixou de depender de fornada. O histórico do dia continua
           renderizado abaixo de qualquer forma, para não travar a anulação
           de um lançamento errado (defeito encontrado em teste, ago/2026). */
        <p className="callout-inline">
          Nenhum produto ativo no catálogo. Cadastre em <strong>Produtos</strong> para poder lançar
          perdas.
        </p>
      ) : !candidatoSelecionado ? (
        <div>
          {/* Antes era uma grade com TODOS os candidatos de uma vez — na
              filial isso dava 86 blocos empilhados e ninguém achava nada.
              Busca no topo para quem sabe o nome, acordeão por categoria
              para quem está procurando; o mesmo padrão da tela de Pedido,
              que o operador já conhece (ago/2026). */}
          <CampoDeBusca
            className="campo-busca"
            valor={buscaProduto}
            onMudar={setBuscaProduto}
            placeholder="Buscar produto pelo nome..."
            rotulo="Buscar produto pelo nome para lançar a perda"
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
                      {/* Sem contagem (ago/2026, decisão do dono do
                          negócio). Aqui ela mostrava quantos produtos a
                          categoria TEM no catálogo, não quantos foram
                          perdidos — número grande, sempre igual, que não
                          decidia nada e ainda parecia contar lançamento. */}
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

      {/*
        A TABELA DE "PERDAS LANÇADAS HOJE" SAIU DAQUI (ago/2026, decisão
        do dono do negócio).
        ---------------------------------------------------------------
        Ela ocupava o pé da tela todo dia — com o alternador "por
        lançamento / por produto" — para responder uma pergunta que quem
        acabou de lançar já sabe. Quem quer LER a perda vai a Análises,
        que é a tela feita para isso e cruza com a produção; quem vem
        aqui vem LANÇAR.

        O que não podia sair junto era a anulação: erro de digitação se
        percebe na hora, e sem caminho para desfazer o número errado fica
        contaminando a taxa de perda para sempre. Ficou o último
        lançamento do dia, numa linha — que é onde o erro é notado.
      */}
      {ehMatriz && ultimoLancamento && (
        <div className="ultimo-lancamento">
          <span className="texto-ultimo">
            Último: {produtos.find((pr) => pr.codigoPdv === ultimoLancamento.codigoPdv)?.nome ??
              ultimoLancamento.codigoPdv}{" "}
            · {ultimoLancamento.quantidadeQuilos} kg
          </span>
          <button
            type="button"
            className="link"
            onClick={() => {
              setPerdaAAnular(ultimoLancamento);
              setMotivoAnulacao("");
            }}
          >
            anular
          </button>
        </div>
      )}

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
