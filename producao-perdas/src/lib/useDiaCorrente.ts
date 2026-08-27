/**
 * src/lib/useDiaCorrente.ts
 * ---------------------------------------------------------------
 * A data de hoje que NOTA a virada da meia-noite (ago/2026).
 *
 * O DEFEITO QUE ISTO CORRIGE
 * ---------------------------
 * `dataDeHojeIso()` responde certo toda vez que é chamada — o problema é
 * que ela só era chamada quando algo fazia o React renderizar de novo. No
 * PC do caixa o app fica aberto o dia inteiro e a noite inteira, parado
 * na mesma aba. Na quinta de manhã a tela de Perdas ainda era a de
 * quarta: o formulário continuava com o dia anterior, e as perdas
 * lançadas na quarta apareciam como "lançadas hoje".
 *
 * Nada estava errado nos DADOS — cada perda foi gravada com a data certa.
 * O que estava errado era a tela, que nunca soube que o dia mudou. Esse
 * tipo de defeito é especialmente ruim porque a informação exibida é
 * plausível: ninguém desconfia de um número que parece o de sempre.
 *
 * COMO
 * -----
 * Um relógio de um minuto, mais dois gatilhos que cobrem o caso real: o
 * app volta ao primeiro plano (`visibilitychange`) ou a janela recebe
 * foco. No celular o app fica suspenso a noite toda e o intervalo pode
 * nem disparar; é o retorno ao primeiro plano que resolve, e ele acontece
 * exatamente quando alguém vai usar.
 *
 * Devolve a MESMA string quando o dia não mudou — o React descarta o
 * `setState` nesse caso, então o relógio de um minuto não custa
 * renderização nenhuma.
 */

import { useEffect, useState } from "react";
import { dataDeHojeIso } from "./data";

/** De quanto em quanto tempo conferir se o dia virou. */
const INTERVALO_MS = 60 * 1000;

export function useDiaCorrente(): string {
  const [dia, setDia] = useState(dataDeHojeIso);

  useEffect(() => {
    const conferir = () =>
      setDia((atual) => {
        const agora = dataDeHojeIso();
        return agora === atual ? atual : agora;
      });

    const id = setInterval(conferir, INTERVALO_MS);
    document.addEventListener("visibilitychange", conferir);
    window.addEventListener("focus", conferir);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", conferir);
      window.removeEventListener("focus", conferir);
    };
  }, []);

  return dia;
}
