/**
 * src/components/PainelFornoDeHoje.tsx
 * ---------------------------------------------------------------
 * Marcação de fornada pronta, ao longo do expediente (ago/2026).
 *
 * POR QUE É UM PAINEL PRÓPRIO, E NÃO UM BOTÃO NA LISTA DO CRONOGRAMA
 * ------------------------------------------------------------------
 * A tela de Cronograma abre no dia SEGUINTE — ela existe para planejar.
 * Marcar fornada é sobre HOJE. Na primeira versão o botão ficava em cada
 * item da lista de planejamento, e o padeiro teria que trocar a data para
 * hoje toda vez que uma fornada saísse: seis vezes por dia, só de pão
 * francês. Ninguém faria, e o recurso morreria sem nunca ser usado
 * (defeito encontrado em teste antes da entrega).
 *
 * Aqui é o contrário: o painel fica no topo, sempre mostrando a produção
 * de HOJE, independente da data que o operador esteja planejando embaixo.
 * Abriu o app, marcou, fechou.
 *
 * UM TOQUE, SEM QUANTIDADE. Um item que sai seis vezes por dia viraria
 * seis digitações. O que a filial precisa saber é que saiu e a que horas;
 * quanto ela quer, ela informa no pedido de reposição.
 */

import { useMemo, useState } from "react";
import type { Produto } from "../types/produto";
import type { PlanoDeProducaoDiario } from "../types/producao";
import type { FornadaPronta } from "../types/fornada";
import { fornadasDoProduto, horaDaUltimaFornada } from "../types/fornada";
import { contemBusca } from "../lib/texto";
import { TesteDeAvisos } from "./TesteDeAvisos";
import { CampoDeBusca } from "./CampoDeBusca";
import { IconeLixeira } from "./Icones";

/**
 * Quantos resultados a busca mostra. O catálogo tem centenas de itens; a
 * lista inteira rolando embaixo do campo não ajuda ninguém a achar
 * nada — quem não achou em 12 linhas digita mais uma letra.
 */
const MAXIMO_RESULTADOS = 12;

interface PainelFornoDeHojeProps {
  /**
   * Plano confirmado de HOJE, quando existe. Opcional desde ago/2026: a
   * busca anuncia qualquer produto do catálogo, e um dia sem cronograma
   * montado (feriado, movimento imprevisto) não pode impedir a matriz de
   * avisar as filiais do que acabou de sair.
   */
  plano?: PlanoDeProducaoDiario;
  produtos: Produto[];
  fornadas: FornadaPronta[];
  dataHoje: string;
  /**
   * Produtos que a matriz tirou da vitrine de hoje. Vem de fora porque
   * mora na NUVEM: quem decide o que está disponível é a matriz, e a
   * decisão precisa chegar às filiais — ver src/types/anuncio.ts. Antes
   * isto era uma lista local do aparelho, e por isso a filial continuava
   * oferecendo o que a matriz já tinha tirado.
   */
  encerrados: Set<number>;
  onEncerrarAnuncio: (codigoPdv: number) => Promise<void>;
  /** Devolve TODOS à vitrine de uma vez — o "mostrar de novo". */
  onReabrirTudo: () => Promise<void>;
  onMarcarFornada: (codigoPdv: number) => Promise<void>;
}

export function PainelFornoDeHoje({
  plano,
  produtos,
  fornadas,
  dataHoje,
  encerrados,
  onEncerrarAnuncio,
  onReabrirTudo,
  onMarcarFornada,
}: PainelFornoDeHojeProps) {
  const [marcando, setMarcando] = useState<number | null>(null);
  const [busca, setBusca] = useState("");

  const nomeDoProduto = (codigo: number) =>
    produtos.find((p) => p.codigoPdv === codigo)?.nome ?? `#${codigo}`;

  /**
   * Resultado da busca no catálogo INTEIRO — não só na lista do dia.
   *
   * É a razão de a busca existir (pedido do dono do negócio, ago/2026): a
   * matriz assa coisa que não estava programada, e sem um caminho para
   * anunciar esse item as filiais só descobrem no dia seguinte, quando
   * não adianta mais. Aqui ela digita o nome, toca, e as três lojas
   * ficam sabendo na hora.
   *
   * Só produtos ATIVOS na produção: anunciar item pausado no cadastro
   * abriria pedido de reposição de coisa que a padaria decidiu não fazer.
   */
  const resultados = useMemo(() => {
    const termo = busca.trim();
    if (termo.length === 0) return [];
    return produtos
      .filter((p) => p.ativoNaProducao && contemBusca(p.nome, termo))
      .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"))
      .slice(0, MAXIMO_RESULTADOS);
  }, [produtos, busca]);

  const buscando = busca.trim().length > 0;

  /**
   * A lista do dia achatada: os itens do cronograma na ordem em que a
   * padaria produz, sem repetir o produto que aparece em duas sessões e
   * sem os que foram tirados da lista.
   */
  const itensDoDia = useMemo(() => {
    if (!plano) return [];
    const vistos = new Set<number>();
    const lista: number[] = [];
    for (const sessao of plano.sessoes) {
      for (const item of sessao.itens) {
        if (vistos.has(item.codigoPdv) || encerrados.has(item.codigoPdv)) continue;
        vistos.add(item.codigoPdv);
        lista.push(item.codigoPdv);
      }
    }
    return lista;
  }, [plano, encerrados]);

  /** Nomes que a IA pode escolher ao interpretar o que foi ditado. */
  const nomesAtivos = useMemo(
    () => produtos.filter((p) => p.ativoNaProducao).map((p) => p.nome),
    [produtos]
  );

  /** A linha é a mesma na busca e na lista do dia — um jeito só de marcar. */
  function linhaDoProduto(codigoPdv: number, podeTirarDaLista = false) {
    const doDia = fornadasDoProduto(fornadas, dataHoje, codigoPdv);
    const saiu = doDia.length > 0;
    return (
      <div key={codigoPdv} className="item-forno">
        <button
          type="button"
          className={`linha-forno ${saiu ? "saiu" : ""}`}
          disabled={marcando === codigoPdv}
          onClick={async () => {
            setMarcando(codigoPdv);
            try {
              // Anunciar devolve o produto à vitrine — quem reabre é o
              // App, junto da gravação na nuvem, para a filial voltar a
              // ver no mesmo instante.
              await onMarcarFornada(codigoPdv);
            } catch {
              /* o aviso global cuida da mensagem */
            } finally {
              setMarcando(null);
            }
          }}
        >
          <span className="nome-forno">{nomeDoProduto(codigoPdv)}</span>
          <span className="marca-forno">
            {marcando === codigoPdv
              ? "..."
              : saiu
                ? `${doDia.length}× · ${horaDaUltimaFornada(fornadas, dataHoje, codigoPdv)}`
                : "anunciar"}
          </span>
        </button>

        {/* Tirar da VITRINE, não do histórico (ago/2026). As fornadas já
            marcadas continuam gravadas e continuam alimentando o
            relatório do forno em Análises; o que muda é que as FILIAIS
            param de ver o produto como disponível hoje.

            Antes isto era só uma lista local deste aparelho, e o efeito
            ficava pela metade: a matriz parava de ver, a filial continuava
            pedindo mercadoria que tinha acabado. */}
        {podeTirarDaLista && (
          <button
            type="button"
            className="tirar-da-lista"
            aria-label={`Tirar ${nomeDoProduto(codigoPdv)} da lista de hoje e das filiais`}
            title="Tirar da lista — as filiais param de ver hoje"
            onClick={() => void onEncerrarAnuncio(codigoPdv)}
          >
            <IconeLixeira tamanho={16} />
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="painel-forno">
      <div className="corpo-forno">
        {/* A contagem "X de Y itens já saíram hoje" saiu daqui (ago/2026):
            esta aba não é sobre progresso da lista — é sobre anunciar o
            que acabou de sair. O progresso do dia se lê no card de
            confirmação, no Cronograma, que é onde ele decide alguma
            coisa. */}
        <CampoDeBusca
          className="busca-forno"
          valor={busca}
          onMudar={setBusca}
          placeholder="Buscar produto para anunciar..."
          rotulo="Buscar produto no catálogo para anunciar a fornada"
          nomesParaVoz={nomesAtivos}
        >
          {buscando && (
            <button type="button" className="link" onClick={() => setBusca("")}>
              limpar
            </button>
          )}
        </CampoDeBusca>

        {buscando ? (
          <>
            <p className="nota-rodape">
              Busca no catálogo inteiro — o produto não precisa estar na lista de hoje. Toque para
              anunciar às filiais.
            </p>
            {resultados.length === 0 ? (
              <p className="nota-rodape">Nenhum produto ativo com esse nome.</p>
            ) : (
              <div className="grupo-forno">{resultados.map((p) => linhaDoProduto(p.codigoPdv))}</div>
            )}
          </>
        ) : (
          <>
            <p className="nota-rodape">
              Toque no item quando a fornada sair. As filiais veem na hora e podem pedir reposição
              enquanto ainda dá tempo de entregar hoje.
            </p>

            {/* Lista CORRIDA, sem separar por sessão (ago/2026, decisão do
                dono do negócio). Aqui não se planeja nada: só se anuncia o
                que acabou de sair, e o cabeçalho de categoria só empurrava
                a lista para baixo sem ajudar a achar. A ordem é a do
                cronograma, que é a ordem em que a padaria produz. */}
            {!plano ? (
              <p className="nota-rodape">
                Nenhum cronograma confirmado para hoje. Use a busca acima para anunciar o que sair
                do forno.
              </p>
            ) : itensDoDia.length === 0 ? (
              <p className="nota-rodape">
                Todos os itens de hoje foram tirados da lista. Use a busca acima para anunciar, ou
                mostre a lista de novo abaixo.
              </p>
            ) : (
              <div className="grupo-forno">
                {itensDoDia.map((codigoPdv) => linhaDoProduto(codigoPdv, true))}
              </div>
            )}

            {/* O caminho de volta. Fica fora da lista de propósito: quando
                alguém tira o último item, é justamente aqui que ele
                precisa estar. */}
            {/* Uma linha só, como na tela da filial (ago/2026, decisão do
                dono do negócio). A lista nomeada, com um "devolver" por
                item, ocupava a tela com o que NÃO está em jogo — e a
                pessoa que abre esta aba veio anunciar, não administrar o
                que já tirou. Devolver tudo de uma vez é o caso comum:
                acabou o dia, começa outro. */}
            {encerrados.size > 0 && (
              <p className="nota-rodape">
                {encerrados.size} {encerrados.size === 1 ? "item escondido" : "itens escondidos"}{" "}
                hoje — as filiais não veem.{" "}
                <button type="button" className="link" onClick={() => void onReabrirTudo()}>
                  mostrar de novo
                </button>
              </p>
            )}
          </>
        )}

        {/* Diagnóstico, não operação: fica no rodapé, discreto, e só
            aparece o resultado quando alguém pergunta. */}
        <TesteDeAvisos destino="filiais" />
      </div>
    </div>
  );
}
