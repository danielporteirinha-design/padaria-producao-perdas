/**
 * src/components/AssistenteDeVoz.tsx
 * ---------------------------------------------------------------
 * Uma frase, uma confirmação (ago/2026, pedido do dono do negócio).
 *
 * O QUE ISTO SUBSTITUIU
 * ----------------------
 * A versão anterior era um diálogo falado: o app perguntava o produto,
 * ouvia, perguntava a quantidade, ouvia, perguntava se podia enviar,
 * ouvia. Cinco aberturas de microfone e cinco falas do aparelho para um
 * anúncio. O relato foi direto: ficou lento, e desligar o microfone deu
 * trabalho — exatamente o custo que o modo por voz existia para tirar.
 *
 * Agora: toca, fala a frase inteira, confere e confirma com um toque.
 * O app não fala mais nada; a leitura é feita nos bastidores e o
 * resultado aparece escrito.
 *
 * DOIS PAPÉIS, UMA TELA
 * ----------------------
 * - A MATRIZ anuncia: "anunciar fornada de palito vegetariano".
 * - A FILIAL pede: "20 pão francês e 10 broa de fubá".
 *
 * É o mesmo componente porque é a mesma mecânica — falar, ler o que foi
 * entendido, confirmar. O que muda é o texto e o que a confirmação
 * dispara.
 *
 * UM PEDIDO, UM AVISO. A filial que precisa de dez produtos diz os dez
 * numa frase e a matriz recebe UMA notificação com a lista. Antes cada
 * item era um pedido e um push: dez itens viravam dez avisos, e o
 * décimo chegava quando o primeiro já tinha sido esquecido.
 *
 * A CONFIRMAÇÃO NÃO É DISPENSÁVEL. O reconhecimento erra, e o erro aqui
 * não fica na tela de quem falou: vira mercadoria separada errada. Ler
 * três linhas antes de tocar em "Confirmar" custa dois segundos.
 */

import { useEffect, useRef, useState } from "react";
import type { Produto } from "../types/produto";
import { afinarComIA, ErroDeVoz, ouvirUmaFrase, vozDisponivel } from "../lib/vozParaBusca";
import { interpretarFrase, type ItemFalado } from "../lib/interpretarPedidoFalado";
import { paraBusca } from "../lib/texto";
import { ehNumeroValidoPositivo, paraNumero, sanitizarEntradaNumerica } from "../lib/numeros";
import { tocarErroSonoro } from "../lib/somDeAviso";
import { IconeConfere, IconeErro, IconeLixeira, IconeMicrofone } from "./Icones";

export interface ItemDitado {
  produto: Produto;
  quantidade: number | null;
}

interface AssistenteDeVozProps {
  produtos: Produto[];
  /**
   * `anunciar` (matriz) — a quantidade é opcional, e a frase costuma ter
   * um produto só. `pedir` (filial) — a quantidade é obrigatória, e a
   * frase costuma ter vários.
   */
  modo: "anunciar" | "pedir";
  /**
   * O que a confirmação faz de fato. `enviar` manda na hora (reposição,
   * anúncio); `adicionar` só põe na lista que ainda vai ser conferida e
   * enviada por um botão próprio (a Lista de Produção da filial).
   *
   * Existe porque o rótulo tem que dizer a verdade: "Enviar (3)" num
   * botão que apenas acrescenta à montagem faria a pessoa achar que já
   * mandou o pedido — e o pedido ficaria parado na tela dela.
   */
  acao?: "enviar" | "adicionar";
  onConfirmar: (itens: ItemDitado[]) => Promise<void>;
  /**
   * Avisa a tela que o microfone abriu ou fechou (set/2026).
   *
   * Quem está falando não vai digitar ao mesmo tempo, e a barra de busca
   * logo abaixo do botão só disputa espaço e atenção no momento em que a
   * pessoa precisa se concentrar na frase. Quem esconde é a tela, não
   * este componente: ele não conhece o que está em volta dele.
   */
  onOuvindoMudou?: (ouvindo: boolean) => void;
}

export function AssistenteDeVoz({
  produtos,
  modo,
  acao = "enviar",
  onConfirmar,
  onOuvindoMudou,
}: AssistenteDeVozProps) {
  const [ouvindo, setOuvindo] = useState(false);
  useEffect(() => {
    onOuvindoMudou?.(ouvindo);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ouvindo]);
  const [pensando, setPensando] = useState(false);
  const [frase, setFrase] = useState("");
  const [itens, setItens] = useState<ItemDitado[]>([]);
  const [sobras, setSobras] = useState<string[]>([]);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState("");
  /**
   * O BOTÃO VIRA O SINALIZADOR (set/2026, pedido do dono do negócio).
   *
   * Quem fala está olhando para o botão — foi nele que tocou — e a
   * resposta estava dois blocos abaixo, na lista de conferência. Com o
   * celular na mão e a outra ocupada, isso é longe demais: a pessoa
   * falava e não sabia se tinha dado certo até procurar.
   *
   * Agora a resposta acontece onde o olho já está: verde com tique
   * quando o produto e a quantidade foram entendidos, vermelho com X
   * quando não. Dois segundos — o suficiente para ler, curto o bastante
   * para não travar quem quer falar de novo.
   */
  const [sinal, setSinal] = useState<"" | "certo" | "errado">("");
  const relogioDoSinal = useRef<number | null>(null);

  function sinalizar(resultado: "certo" | "errado") {
    // O erro também SOA: quem fala está de costas para a tela metade
    // das vezes, e a cor sozinha não chega até lá.
    if (resultado === "errado") tocarErroSonoro();
    if (relogioDoSinal.current !== null) window.clearTimeout(relogioDoSinal.current);
    setSinal(resultado);
    relogioDoSinal.current = window.setTimeout(() => {
      if (montado.current) setSinal("");
      relogioDoSinal.current = null;
    }, 2000);
  }

  const cancelarEscuta = useRef<(() => void) | null>(null);
  const montado = useRef(true);
  useEffect(() => {
    montado.current = true;
    return () => {
      montado.current = false;
      cancelarEscuta.current?.();
      if (relogioDoSinal.current !== null) window.clearTimeout(relogioDoSinal.current);
    };
  }, []);

  const ativos = produtos.filter((p) => p.ativoNaProducao);
  const pedindo = modo === "pedir";

  function limpar() {
    setItens([]);
    setSobras([]);
    setFrase("");
    setErro("");
  }

  /**
   * Um toque no botão: começa a ouvir; tocando de novo, PARA.
   *
   * O mesmo alvo para começar e para parar foi o pedido explícito —
   * antes, encerrar o microfone dependia de achar outro caminho na tela.
   */
  async function ditar() {
    if (ouvindo) {
      cancelarEscuta.current?.();
      return;
    }
    if (!vozDisponivel()) {
      setErro(
        "Este navegador não reconhece voz. No computador funciona no Chrome ou no Edge; " +
          "no celular, no Chrome (Android) ou no Safari (iPhone)."
      );
      return;
    }
    /**
     * NÃO LIMPA A LISTA (ago/2026 — defeito relatado em produção: "se eu
     * já tiver na lista 1 ou mais produtos lançados por voz e quiser
     * acrescentar mais, a primeira lista é substituída pela nova").
     *
     * Era isto: cada nova fala zerava o que já tinha sido entendido.
     * Falar de novo é ACRESCENTAR — a lista só some por decisão da
     * pessoa (o "cancelar" abaixo) ou depois de confirmada.
     */
    setErro("");
    setOuvindo(true);
    try {
      const sessao = ouvirUmaFrase();
      cancelarEscuta.current = sessao.cancelar;
      const dito = await sessao.promessa;
      if (!montado.current) return;
      setOuvindo(false);
      if (!dito) {
        // Microfone abriu e não veio nada: silêncio, ruído, ou a pessoa
        // desistiu. Para quem está olhando o botão, é a mesma coisa.
        sinalizar("errado");
        return;
      }
      setFrase(dito);
      await interpretar(dito);
    } catch (falha) {
      if (!montado.current) return;
      setErro(falha instanceof ErroDeVoz ? falha.message : "Não consegui usar o microfone agora.");
    } finally {
      if (montado.current) {
        setOuvindo(false);
        cancelarEscuta.current = null;
      }
    }
  }

  /**
   * Lê a frase: primeiro por texto, aqui mesmo; depois, só para o que
   * sobrou, com a IA. A ordem importa — o casamento local é instantâneo e
   * resolve o caso comum, e chamar a rede antes dele acrescentaria espera
   * a toda frase para ajudar em poucas.
   */
  async function interpretar(dito: string) {
    const nomes = ativos.map((p) => p.nome);
    const leitura = interpretarFrase(dito, nomes);
    let encontrados = leitura.itens;
    const sobrando: string[] = [];

    if (leitura.naoReconhecidos.length > 0) {
      setPensando(true);
      for (const trecho of leitura.naoReconhecidos) {
        const afinado = await afinarComIA(trecho, nomes);
        if (!montado.current) return;
        const produto = afinado
          ? ativos.find((p) => paraBusca(p.nome) === paraBusca(afinado))
          : undefined;
        if (produto) {
          // A quantidade sai do trecho original: a IA devolve só o nome.
          const daFrase = interpretarFrase(`${trecho} ${produto.nome}`, [produto.nome]).itens[0];
          encontrados = [...encontrados, { nome: produto.nome, quantidade: daFrase?.quantidade ?? null }];
        } else {
          sobrando.push(trecho);
        }
      }
      setPensando(false);
    }

    /**
     * ACUMULA. O mesmo produto dito duas vezes SOMA, em vez de virar
     * duas linhas: quem falou "10 pão francês" e depois "mais 5 pão
     * francês" está pedindo 15. A quantidade continua editável na
     * linha, então a soma nunca é irreversível.
     */
    const novos = paraItens(encontrados);
    setItens((atual) => {
      const lista = [...atual];
      for (const novo of novos) {
        const onde = lista.findIndex((i) => i.produto.codigoPdv === novo.produto.codigoPdv);
        if (onde >= 0) {
          const somado = (lista[onde].quantidade ?? 0) + (novo.quantidade ?? 0);
          lista[onde] = { ...lista[onde], quantidade: somado > 0 ? somado : null };
        } else {
          lista.push(novo);
        }
      }
      return lista;
    });
    setSobras(sobrando);
    /**
     * O sinal é sobre ESTA fala, e não sobre a lista acumulada: quem
     * acabou de falar quer saber se o que ele disse agora foi entendido.
     * Sobra reconhecida pela metade também é erro — o item que não
     * entrou é o que vai faltar na entrega.
     */
    if (encontrados.length === 0) {
      setErro(`Não achei nenhum produto em "${dito}".`);
      sinalizar("errado");
    } else {
      sinalizar(sobrando.length === 0 ? "certo" : "errado");
    }
  }

  function paraItens(lidos: ItemFalado[]): ItemDitado[] {
    return lidos
      .map((lido) => {
        const produto = ativos.find((p) => p.nome === lido.nome);
        return produto ? { produto, quantidade: lido.quantidade } : null;
      })
      .filter((i): i is ItemDitado => i !== null);
  }

  const faltaQuantidade = pedindo && itens.some((i) => i.quantidade === null || i.quantidade <= 0);

  async function confirmar() {
    if (itens.length === 0 || faltaQuantidade || enviando) return;
    setEnviando(true);
    try {
      await onConfirmar(itens);
      limpar();
    } catch {
      /* o aviso global cuida da mensagem */
    } finally {
      if (montado.current) setEnviando(false);
    }
  }

  const pergunta =
    modo === "anunciar"
      ? itens.length === 1
        ? `Posso anunciar a fornada de ${itens[0].produto.nome}?`
        : `Posso anunciar ${itens.length} fornadas?`
      : acao === "adicionar"
        ? "Confere antes de incluir na lista:"
        : "Confere o pedido antes de enviar:";

  return (
    <div className="assistente-voz">
      <button
        type="button"
        className={`botao-assistente ${ouvindo ? "ouvindo" : ""} ${sinal ? `sinal-${sinal}` : ""}`}
        aria-label={ouvindo ? "Ouvindo" : "Falar"}
        disabled={pensando || enviando || sinal !== ""}
        onClick={() => void ditar()}
      >
        {sinal === "certo" ? (
          <IconeConfere tamanho={26} />
        ) : sinal === "errado" ? (
          <IconeErro tamanho={26} />
        ) : (
          <IconeMicrofone tamanho={26} />
        )}
        {/* SEM "toque para parar" (ago/2026, decisão do dono do negócio:
            "isso não faz sentido algum"). E ele tem razão: o
            reconhecedor trabalha com `continuous = false` e FECHA
            SOZINHO quando a pessoa para de falar — o convite a tocar
            pedia um passo que o navegador já dá. */}
        {sinal === "certo"
          ? "Entendi"
          : sinal === "errado"
            ? "Não entendi"
            : ouvindo
              ? "Ouvindo..."
              : pedindo
                ? "Pedir falando"
                : "Anunciar falando"}
      </button>

      {/* A instrução escrita e o exemplo saíram (ago/2026, decisão do
          dono do negócio). O rótulo do botão já diz o que ele faz, e a
          conferência logo abaixo mostra o que foi entendido — as duas
          linhas de texto ocupavam a dobra da tela repetindo isso. */}

      {pensando && <p className="nota-rodape">Entendendo o que você disse...</p>}
      {erro && <p className="erro-conversao">{erro}</p>}

      {/* O BLOCO VERMELHO VEM ANTES DA CONFERÊNCIA, E FORA DELA
          (set/2026, pedido do dono do negócio).

          Ele vivia DENTRO do cartão de conferência, que só existe quando
          algum item foi reconhecido. Quando o microfone não entendia
          NADA — o caso mais comum na matriz, que anuncia um produto por
          vez — o cartão não aparecia, e com ele sumia justamente o aviso
          que dizia o que tinha sido ouvido. Sobrava a frase genérica
          "não achei nenhum produto", sem o texto para corrigir.

          Fora do cartão, ele vale para os dois casos: nada reconhecido,
          e parte reconhecida. */}
          {/* O QUE NÃO ENTROU NA LISTA, EM VERMELHO E NEGRITO (set/2026,
          pedido do dono do negócio).

          Sumir em silêncio faria a pessoa achar que pediu dez itens
          quando pediu oito — e o item que faltou é o que vai faltar
          na entrega. Antes isto era uma nota de rodapé cinza, do
          mesmo tamanho e peso de "informe a quantidade": duas
          mensagens com urgências muito diferentes, escritas igual.

          Agora tem bloco próprio, borda vermelha e o texto do jeito
          que o microfone ouviu — porque é ele que a pessoa precisa
          repetir diferente, ou corrigir na busca. */}
      {sobras.length > 0 && (
        <div className="fora-da-lista">
          <strong className="titulo-fora-da-lista">
        {sobras.length === 1 ? "Não entrou na lista:" : "Não entraram na lista:"}
          </strong>
      {sobras.map((sobra, indice) => (
            <span key={`${sobra}-${indice}`} className="trecho-fora-da-lista">
              {sobra}
            </span>
          ))}
          <span className="dica-fora-da-lista">
            Fale de novo só este item, ou procure pelo nome na busca.
          </span>
        </div>
      )}

      {itens.length > 0 && (
        <div className="conferencia-voz">
          <strong className="pergunta-conferencia">{pergunta}</strong>
          {/* A LEGENDA DO QUE FOI OUVIDO, EM DESTAQUE (set/2026, pedido
              do dono do negócio).

              Ela era uma linha itálica pequena e cinza, no meio do
              cartão. Mas é ela que responde a pergunta que a pessoa faz
              depois de falar — "ele entendeu o que eu disse?" — e é
              lendo ela que se descobre POR QUE um item não entrou:
              quase sempre o microfone ouviu outra coisa. */}
          {frase && <p className="frase-ouvida">"{frase}"</p>}

          {itens.map((item, indice) => (
            <div key={item.produto.codigoPdv} className="linha-conferencia">
              <span className="nome-item-loja">{item.produto.nome}</span>

              {pedindo ? (
                <input
                  type="text"
                  inputMode="decimal"
                  pattern="[0-9]*"
                  className="qtd-conferencia"
                  aria-label={`Quantidade de ${item.produto.nome}`}
                  placeholder="qtd"
                  value={item.quantidade === null ? "" : String(item.quantidade)}
                  onChange={(e) => {
                    const bruto = sanitizarEntradaNumerica(e.target.value);
                    setItens((atual) =>
                      atual.map((i, n) =>
                        n === indice
                          ? { ...i, quantidade: ehNumeroValidoPositivo(bruto) ? paraNumero(bruto) : null }
                          : i
                      )
                    );
                  }}
                />
              ) : (
                item.quantidade !== null && (
                  <span className="qtd-item-loja">{item.quantidade} un</span>
                )
              )}

              <button
                type="button"
                className="tirar-da-lista"
                aria-label={`Tirar ${item.produto.nome} da lista`}
                onClick={() => setItens((atual) => atual.filter((_, n) => n !== indice))}
              >
                <IconeLixeira tamanho={16} />
              </button>
            </div>
          ))}

          {faltaQuantidade && (
            <p className="nota-rodape">Informe a quantidade dos itens em branco.</p>
          )}

          <div className="acoes">
            <button type="button" className="link" onClick={limpar}>
              cancelar
            </button>
            <button
              type="button"
              className="primario"
              disabled={enviando || faltaQuantidade}
              onClick={() => void confirmar()}
            >
              {enviando
                ? acao === "adicionar"
                  ? "Incluindo..."
                  : "Enviando..."
                : !pedindo
                  ? "Confirmar"
                  : acao === "adicionar"
                    ? `Incluir (${itens.length})`
                    : `Enviar (${itens.length})`}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
