/**
 * src/components/AnuncioPorVoz.tsx
 * ---------------------------------------------------------------
 * Anunciar uma fornada sem tocar na tela (ago/2026, pedido do dono do
 * negócio).
 *
 * O PROBLEMA É A MÃO, NÃO O TECLADO
 * ----------------------------------
 * Anunciar é a ação mais repetida do dia na matriz — pão francês sai seis
 * vezes — e acontece com as mãos na massa, na forma quente, na farinha.
 * Cada toque na tela é parar, limpar a mão, tocar, voltar. O microfone já
 * existia na BUSCA, mas resolvia só o primeiro passo: achado o produto,
 * ainda era preciso tocar para anunciar.
 *
 * Aqui o diálogo inteiro é falado, do nome ao envio:
 *
 *   app: "Qual produto saiu?"          pessoa: "pão francês"
 *   app: "PÃO FRANCÊS. Confirma?"      pessoa: "isso"
 *   app: "Quantas unidades?"           pessoa: "quarenta"
 *   app: "Quarenta. Confirma?"         pessoa: "sim"
 *   app: "Enviar ou descartar?"        pessoa: "enviar"
 *   -> o aviso sai para as três lojas, sem mais nenhum toque.
 *
 * CADA PASSO CONFIRMA ANTES DE SEGUIR, e é por isso que o diálogo tem
 * cinco perguntas e não duas. O reconhecimento de voz erra — e o erro
 * aqui não fica na tela de quem falou: vira um aviso para três lojas
 * dizendo que saiu um produto que não saiu, ou quarenta peças que são
 * quatro. Confirmar em voz custa uma palavra; desmentir um aviso errado
 * custa telefonema.
 *
 * A ÚLTIMA PERGUNTA NÃO ACEITA "SIM" SOZINHO por decisão de segurança —
 * ver entenderEnvioOuDescarte em src/lib/vozRespostas.ts.
 *
 * O TEXTO FICA NA TELA o tempo todo. Navegador sem síntese de voz,
 * aparelho no mudo ou barulho demais: o diálogo continua legível e
 * respondível pelos botões que acompanham cada pergunta. A voz é o
 * caminho rápido, não o único.
 */

import { useEffect, useRef, useState } from "react";
import type { Produto } from "../types/produto";
import { afinarComIA, ErroDeVoz, ouvirUmaFrase, vozDisponivel } from "../lib/vozParaBusca";
import { calar, falar } from "../lib/falar";
import {
  entenderEnvioOuDescarte,
  entenderQuantidade,
  entenderSimOuNao,
} from "../lib/vozRespostas";
import { contemBusca, paraBusca } from "../lib/texto";
import { IconeMicrofone } from "./Icones";

type Passo =
  | "parado"
  | "produto"
  | "confirmaProduto"
  | "quantidade"
  | "confirmaQuantidade"
  | "envio"
  | "enviando";

interface AnuncioPorVozProps {
  produtos: Produto[];
  /** Marca a fornada e dispara o aviso. Recebe a quantidade dita. */
  onAnunciar: (produto: Produto, quantidade: number) => Promise<void>;
}

export function AnuncioPorVoz({ produtos, onAnunciar }: AnuncioPorVozProps) {
  const [passo, setPasso] = useState<Passo>("parado");
  const [produto, setProduto] = useState<Produto | null>(null);
  const [quantidade, setQuantidade] = useState<number | null>(null);
  const [ouvindo, setOuvindo] = useState(false);
  const [erro, setErro] = useState("");

  const cancelarEscuta = useRef<(() => void) | null>(null);
  const montado = useRef(true);
  useEffect(() => {
    montado.current = true;
    return () => {
      montado.current = false;
      cancelarEscuta.current?.();
      calar();
    };
  }, []);

  const ativos = produtos.filter((p) => p.ativoNaProducao);

  function encerrar(mensagem = "") {
    cancelarEscuta.current?.();
    calar();
    setPasso("parado");
    setProduto(null);
    setQuantidade(null);
    setOuvindo(false);
    setErro(mensagem);
  }

  /**
   * Fala a pergunta, espera a fala TERMINAR e só então abre o microfone.
   *
   * A ordem importa: com o microfone aberto durante a fala, o
   * reconhecedor escuta o próprio alto-falante e responde à pergunta
   * sozinho — o diálogo anda inteiro sem ninguém falar nada.
   */
  async function perguntar(frase: string): Promise<string> {
    setErro("");
    await falar(frase);
    if (!montado.current) return "";
    setOuvindo(true);
    try {
      const sessao = ouvirUmaFrase();
      cancelarEscuta.current = sessao.cancelar;
      const dito = await sessao.promessa;
      return dito;
    } finally {
      if (montado.current) setOuvindo(false);
      cancelarEscuta.current = null;
    }
  }

  /** Acha o produto pelo que foi dito: texto primeiro, IA como reforço. */
  async function acharProduto(falado: string): Promise<Produto | null> {
    const direto = ativos.find((p) => contemBusca(p.nome, falado));
    if (direto) return direto;
    const afinado = await afinarComIA(falado, ativos.map((p) => p.nome));
    if (!afinado) return null;
    return (
      ativos.find((p) => paraBusca(p.nome) === paraBusca(afinado)) ??
      ativos.find((p) => contemBusca(p.nome, afinado)) ??
      null
    );
  }

  async function iniciar() {
    if (!vozDisponivel()) {
      setErro(
        "Este navegador não reconhece voz. No computador funciona no Chrome ou no Edge; " +
          "no celular, no Chrome (Android) ou no Safari (iPhone)."
      );
      return;
    }
    setProduto(null);
    setQuantidade(null);
    await pedirProduto();
  }

  async function pedirProduto() {
    setPasso("produto");
    try {
      const dito = await perguntar("Qual produto saiu?");
      if (!montado.current) return;
      if (!dito) return encerrar("Não ouvi nada. Toque para tentar de novo.");
      const achado = await acharProduto(dito);
      if (!montado.current) return;
      if (!achado) {
        // Repete em vez de desistir: "não achei" no meio do forno é pior
        // que perguntar de novo, e o nome mal ouvido é o erro mais comum.
        setErro(`Não achei "${dito}" no catálogo.`);
        return pedirProduto();
      }
      setProduto(achado);
      await confirmarProduto(achado);
    } catch (falha) {
      encerrar(falha instanceof ErroDeVoz ? falha.message : "Não consegui usar o microfone.");
    }
  }

  async function confirmarProduto(achado: Produto) {
    setPasso("confirmaProduto");
    try {
      const dito = await perguntar(`${achado.nome}. Confirma?`);
      if (!montado.current) return;
      const resposta = entenderSimOuNao(dito);
      if (resposta === true) return pedirQuantidade(achado);
      if (resposta === false) return pedirProduto();
      setErro("Não entendi. Responda sim ou não.");
      return confirmarProduto(achado);
    } catch (falha) {
      encerrar(falha instanceof ErroDeVoz ? falha.message : "Não consegui usar o microfone.");
    }
  }

  async function pedirQuantidade(escolhido: Produto) {
    setPasso("quantidade");
    try {
      const dito = await perguntar("Quantas unidades?");
      if (!montado.current) return;
      const numero = entenderQuantidade(dito);
      if (numero === null) {
        setErro(dito ? `Não entendi "${dito}" como número.` : "Não ouvi o número.");
        return pedirQuantidade(escolhido);
      }
      setQuantidade(numero);
      await confirmarQuantidade(escolhido, numero);
    } catch (falha) {
      encerrar(falha instanceof ErroDeVoz ? falha.message : "Não consegui usar o microfone.");
    }
  }

  async function confirmarQuantidade(escolhido: Produto, numero: number) {
    setPasso("confirmaQuantidade");
    try {
      const dito = await perguntar(`${numero} unidades. Confirma?`);
      if (!montado.current) return;
      const resposta = entenderSimOuNao(dito);
      if (resposta === true) return pedirEnvio(escolhido, numero);
      if (resposta === false) return pedirQuantidade(escolhido);
      setErro("Não entendi. Responda sim ou não.");
      return confirmarQuantidade(escolhido, numero);
    } catch (falha) {
      encerrar(falha instanceof ErroDeVoz ? falha.message : "Não consegui usar o microfone.");
    }
  }

  async function pedirEnvio(escolhido: Produto, numero: number) {
    setPasso("envio");
    try {
      const dito = await perguntar("Enviar ou descartar?");
      if (!montado.current) return;
      const decisao = entenderEnvioOuDescarte(dito);
      if (decisao === "descartar") return encerrar("Aviso descartado.");
      if (decisao === "enviar") return enviar(escolhido, numero);
      setErro("Não entendi. Diga enviar ou descartar.");
      return pedirEnvio(escolhido, numero);
    } catch (falha) {
      encerrar(falha instanceof ErroDeVoz ? falha.message : "Não consegui usar o microfone.");
    }
  }

  /**
   * O PRODUTO E O NÚMERO ANDAM PELOS PARÂMETROS, NÃO PELO ESTADO.
   *
   * Defeito encontrado em teste antes da entrega (ago/2026): o diálogo
   * inteiro roda dentro de UMA renderização — cada passo chama o
   * seguinte na mesma cadeia de promessas —, e o `useState` só muda o
   * valor na renderização SEGUINTE. Lendo `produto` do estado aqui, o
   * valor ainda era `null` no fim do diálogo: o app perguntava tudo,
   * ouvia tudo, e no "enviar" saía calado sem mandar nada.
   *
   * O estado continua existindo, para a tela mostrar em que passo está.
   * A decisão anda pelos parâmetros, que não têm atraso.
   */
  async function enviar(escolhido: Produto, numero: number) {
    setPasso("enviando");
    try {
      await onAnunciar(escolhido, numero);
      // A confirmação é falada porque a pessoa não está olhando: foi por
      // isso que ela usou a voz.
      await falar(`${escolhido.nome} anunciado.`);
    } catch {
      /* o aviso global cuida da mensagem */
    } finally {
      if (montado.current) encerrar();
    }
  }

  const perguntaNaTela: Record<Passo, string> = {
    parado: "",
    produto: "Qual produto saiu?",
    confirmaProduto: `${produto?.nome ?? ""} — confirma?`,
    quantidade: "Quantas unidades?",
    confirmaQuantidade: `${quantidade ?? ""} unidades — confirma?`,
    envio: "Enviar ou descartar?",
    enviando: "Enviando...",
  };

  if (passo === "parado") {
    return (
      <>
        <button type="button" className="secundario anunciar-por-voz" onClick={() => void iniciar()}>
          <IconeMicrofone tamanho={19} /> Anunciar falando
        </button>
        {erro && (
          <p className="nota-rodape" role="status">
            {erro}
          </p>
        )}
      </>
    );
  }

  return (
    <div className="dialogo-voz" role="status" aria-live="polite">
      <div className="pergunta-voz">
        <span className={`pulso-microfone ${ouvindo ? "ouvindo" : ""}`}>
          <IconeMicrofone tamanho={22} />
        </span>
        <strong>{perguntaNaTela[passo]}</strong>
      </div>

      {ouvindo && <p className="nota-rodape">Pode falar.</p>}
      {erro && <p className="erro-conversao">{erro}</p>}

      {/* O CAMINHO DE SAÍDA É SEMPRE UM TOQUE. Um diálogo que só se
          encerra falando prende quem está num lugar barulhento demais
          para ser ouvido — justamente onde o modo por voz mais falha. */}
      <button type="button" className="link" onClick={() => encerrar()}>
        cancelar
      </button>
    </div>
  );
}
