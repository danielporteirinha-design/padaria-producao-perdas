/**
 * src/components/AvisoDeAtualizacao.tsx
 * ---------------------------------------------------------------
 * Registra a atualização do app — SEM faixa visível (set/2026, pedido
 * do dono do negócio: "a mensagem de atualização avisando que vai ser
 * atualizado sozinho ainda aparece, quero dispensá-la").
 *
 * A faixa "Nova versão disponível / Atualizar agora" que existia aqui
 * foi removida — não porque a atualização em si mudou, mas porque ela
 * já acontece sozinha (ver `armarAplicacaoSozinha` em
 * src/lib/atualizacao.ts) e um aviso permanente sobre algo que não
 * exige mais nenhuma ação da pessoa tinha virado só ruído. Quem quer
 * saber o que mudou é avisado pelo NovidadesDoApp — que aparece uma
 * única vez por aparelho, assim que a versão nova entra em uso, e é a
 * única faixa que continua na tela (ver src/components/NovidadesDoApp.tsx).
 *
 * Este componente segue existindo mesmo sem nada para renderizar,
 * porque é ELE quem registra o service worker (`observarAtualizacao`)
 * — e isso precisa valer também na tela de login e na de carregamento,
 * o mesmo motivo que já o mantinha fora do App (ver src/main.tsx).
 */

import { useEffect, useRef } from "react";
import { observarAtualizacao, type Recarregar } from "../lib/atualizacao";

export function AvisoDeAtualizacao() {
  const recarregar = useRef<Recarregar | null>(null);

  useEffect(() => {
    // Registrar duas vezes criaria dois service workers concorrentes. O
    // guard existe pelo StrictMode do desenvolvimento, que monta o
    // componente duas vezes de propósito.
    if (recarregar.current) return;
    // `armarAplicacaoSozinha`, disparada de dentro de `observarAtualizacao`
    // assim que a versão nova chega, já cuida sozinha de aplicá-la
    // quando a aba sair de vista — não sobrou nenhum botão manual que
    // precise chamar a função de recarregar de volta.
    recarregar.current = observarAtualizacao(() => {});
  }, []);

  return null;
}
