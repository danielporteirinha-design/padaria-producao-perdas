/**
 * src/components/CampoDeBusca.tsx
 * ---------------------------------------------------------------
 * O campo de busca de produto do app inteiro, com ditado (ago/2026).
 *
 * UM COMPONENTE, QUATRO TELAS
 * ----------------------------
 * Busca de perda, de fornada, de pedido da filial e do catálogo eram
 * quatro `<input>` parecidos e independentes. Com o microfone entrando em
 * todos, quatro cópias virariam quatro comportamentos ligeiramente
 * diferentes na primeira correção. Aqui é um só.
 *
 * O MICROFONE SÓ APARECE ONDE FUNCIONA
 * -------------------------------------
 * Navegador sem reconhecimento de voz não ganha o botão — oferecer e
 * falhar é pior que não oferecer. Onde existe, o fluxo é: toca, fala, o
 * navegador transcreve, o Gemini casa a transcrição com um nome real do
 * catálogo (ver api/interpretar-busca.ts) e o termo entra no campo.
 *
 * A IA É OPCIONAL EM TODAS AS ETAPAS. Sem chave, com erro ou com resposta
 * inesperada, o campo recebe a transcrição crua — e como `contemBusca`
 * ignora acento e caixa, "pao frances" já acha "PÃO FRANCÊS" sozinho. O
 * Gemini entra para o que o texto não resolve: fala coloquial
 * ("pãozinho") e nome parcial ("pão de queijo" para "PAO DE QUEIJO
 * CONGELADO GRANDE").
 *
 * O TERMO FICA VISÍVEL E EDITÁVEL depois do ditado. Ditado que executa a
 * busca e some não deixa a pessoa corrigir uma palavra — ela teria que
 * falar tudo de novo.
 */

import { useEffect, useRef, useState } from "react";
import { afinarComIA, ErroDeVoz, ouvirUmaFrase, vozDisponivel } from "../lib/vozParaBusca";
import { IconeMicrofone } from "./Icones";

interface CampoDeBuscaProps {
  valor: string;
  onMudar: (valor: string) => void;
  placeholder: string;
  rotulo: string;
  /**
   * Nomes do catálogo que a IA pode escolher. Vazio desliga o afinamento
   * e mantém a transcrição crua — que continua funcionando.
   */
  nomesParaVoz?: string[];
  /** Botão extra à direita, como o "limpar" dos painéis de fornada. */
  children?: React.ReactNode;
  className?: string;
}

export function CampoDeBusca({
  valor,
  onMudar,
  placeholder,
  rotulo,
  nomesParaVoz = [],
  children,
  className = "",
}: CampoDeBuscaProps) {
  const [ouvindo, setOuvindo] = useState(false);
  const [pensando, setPensando] = useState(false);
  const [erro, setErro] = useState("");
  const cancelar = useRef<(() => void) | null>(null);
  // Evita mexer no estado depois que a tela saiu — ditado é assíncrono e
  // a pessoa pode trocar de aba no meio.
  const montado = useRef(true);
  useEffect(() => {
    montado.current = true;
    return () => {
      montado.current = false;
      cancelar.current?.();
    };
  }, []);

  const temVoz = vozDisponivel();

  async function ditar() {
    if (ouvindo || pensando) {
      cancelar.current?.();
      return;
    }
    setErro("");
    setOuvindo(true);
    try {
      const sessao = ouvirUmaFrase();
      cancelar.current = sessao.cancelar;
      const falado = await sessao.promessa;
      if (!montado.current) return;
      setOuvindo(false);
      if (!falado) return;

      // A transcrição já vale como busca. Ela entra no campo ANTES de
      // consultar a IA: se o afinamento demorar ou falhar, a pessoa já
      // está vendo resultado.
      onMudar(falado);

      if (nomesParaVoz.length === 0) return;
      setPensando(true);
      const afinado = await afinarComIA(falado, nomesParaVoz);
      if (!montado.current) return;
      if (afinado) onMudar(afinado);
    } catch (falha) {
      if (!montado.current) return;
      setErro(falha instanceof ErroDeVoz ? falha.message : "Não consegui usar o microfone agora.");
    } finally {
      if (montado.current) {
        setOuvindo(false);
        setPensando(false);
        cancelar.current = null;
      }
    }
  }

  return (
    <>
      <div className={`campo-com-voz ${className}`}>
        <input
          type="search"
          inputMode="search"
          placeholder={placeholder}
          aria-label={rotulo}
          value={valor}
          onChange={(e) => onMudar(e.target.value)}
        />
        {temVoz && (
          <button
            type="button"
            className={`botao-microfone ${ouvindo ? "ouvindo" : ""}`}
            aria-label={ouvindo ? "Parar de ouvir" : "Buscar falando o nome do produto"}
            title={ouvindo ? "Ouvindo... toque para parar" : "Falar o nome do produto"}
            disabled={pensando}
            onClick={ditar}
          >
            <IconeMicrofone tamanho={20} />
          </button>
        )}
        {children}
      </div>
      {(ouvindo || pensando) && (
        <p className="nota-rodape" role="status">
          {ouvindo ? "Ouvindo... fale o nome do produto." : "Procurando no catálogo..."}
        </p>
      )}
      {erro && (
        <p className="erro-conversao" role="alert">
          {erro}
        </p>
      )}
    </>
  );
}
