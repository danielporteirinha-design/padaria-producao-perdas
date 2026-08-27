/**
 * src/components/AvisoDeAtualizacao.tsx
 * ---------------------------------------------------------------
 * Faixa de "versão nova disponível" (ago/2026).
 *
 * FICA NO TOPO, E NÃO EMBAIXO
 * ----------------------------
 * A faixa de retorno de operação (AvisoGlobal) mora embaixo, perto do
 * polegar, porque responde ao que a pessoa acabou de fazer. Esta aqui é
 * outra coisa: é um anúncio sobre o APP, não sobre a ação em curso. No
 * mesmo canto, as duas se atropelariam — e a que sumiria por baixo seria
 * justamente a confirmação do que a pessoa estava fazendo.
 *
 * NÃO SOME SOZINHA
 * -----------------
 * Diferente do aviso de sucesso, esta faixa fica até alguém tocar. É o
 * que garante que ninguém passe o expediente numa versão antiga achando
 * que está na nova — o problema que o modo automático anterior escondia.
 *
 * O BOTÃO REINICIA DE VERDADE
 * ----------------------------
 * "Reiniciar o aplicativo" num PWA instalado não é fechar a janela: o
 * service worker antigo continua no controle até TODAS as abas fecharem,
 * e no PC do caixa isso não acontece. O botão ativa o service worker novo
 * e recarrega — o operador não precisa saber de nada disso.
 */

import { useEffect, useRef, useState } from "react";
import { observarAtualizacao, type Recarregar } from "../lib/atualizacao";
import { IconeConfere } from "./Icones";

/**
 * Componente autossuficiente: registra o service worker, escuta a
 * chegada da versão nova e só então aparece. Vive fora do App (ver
 * src/main.tsx) para valer também na tela de login e na de carregamento
 * — uma versão nova publicada não pode depender de alguém já estar
 * logado para ser anunciada.
 */
export function AvisoDeAtualizacao() {
  const [temVersaoNova, setTemVersaoNova] = useState(false);
  const [reiniciando, setReiniciando] = useState(false);
  const recarregar = useRef<Recarregar | null>(null);

  useEffect(() => {
    // Registrar duas vezes criaria dois service workers concorrentes. O
    // guard existe pelo StrictMode do desenvolvimento, que monta o
    // componente duas vezes de propósito.
    if (recarregar.current) return;
    recarregar.current = observarAtualizacao(() => setTemVersaoNova(true));
  }, []);

  async function reiniciar() {
    setReiniciando(true);
    try {
      await recarregar.current?.();
    } catch (erro) {
      // Se a ativação falhar, um recarregamento simples ainda costuma
      // pegar a versão nova — e ficar preso num botão "Reiniciando..."
      // seria pior que qualquer um dos dois.
      console.warn("Falha ao ativar a versão nova; recarregando mesmo assim:", erro);
      window.location.reload();
    }
  }

  if (!temVersaoNova) return null;

  return (
    <div className="faixa-atualizacao" role="status">
      <IconeConfere tamanho={20} />
      <span className="texto-atualizacao">
        <strong>Nova versão disponível</strong>
        <span>Reinicie para aplicar.</span>
      </span>
      <button type="button" className="primario" disabled={reiniciando} onClick={reiniciar}>
        {reiniciando ? "Reiniciando..." : "Atualizar agora"}
      </button>
    </div>
  );
}
