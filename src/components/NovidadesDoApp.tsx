/**
 * src/components/NovidadesDoApp.tsx
 * ---------------------------------------------------------------
 * "O que mudou" — aparece uma vez por aparelho, depois que uma versão
 * nova entra (set/2026, pedido do dono do negócio: informar ao usuário
 * as melhorias realizadas quando o app atualizar).
 *
 * COMPARA COM O QUE ESTE APARELHO JÁ VIU (localStorage) — cada
 * aparelho guarda seu próprio "até onde eu vi", do mesmo jeito que o
 * "concluídos vistos" da Reposição (ver src/lib/concluidosVistos.ts).
 * Sem isso, o aviso voltaria a cada abertura do app, não só depois de
 * uma atualização de verdade.
 *
 * QUEM ALIMENTA A LISTA é src/data/novidades.ts — uma entrada por
 * entrega, escrita junto com o commit que a traz.
 */
import { useEffect, useState } from "react";
import { NOVIDADES } from "../data/novidades";
import { IconeConfere } from "./Icones";

const CHAVE_ULTIMA_VISTA = "novidades-ultima-vista";

export function NovidadesDoApp() {
  const [itensNovos, setItensNovos] = useState<string[] | null>(null);

  useEffect(() => {
    if (NOVIDADES.length === 0) return;
    let ultimaVista: string | null = null;
    try {
      ultimaVista = localStorage.getItem(CHAVE_ULTIMA_VISTA);
    } catch {
      // Sem localStorage (ex.: modo privado) — não trava o app; só não
      // guarda o "já vi", e a pessoa pode ver o aviso de novo depois.
    }
    if (ultimaVista === NOVIDADES[0].id) return;

    // Tudo que é MAIS NOVO que a última vista entra junto — cobre quem
    // ficou dias sem abrir o app e perdeu mais de uma entrega.
    const pendentes: string[] = [];
    for (const entrada of NOVIDADES) {
      if (entrada.id === ultimaVista) break;
      pendentes.push(...entrada.itens);
    }
    if (pendentes.length > 0) setItensNovos(pendentes);
  }, []);

  function fechar() {
    try {
      localStorage.setItem(CHAVE_ULTIMA_VISTA, NOVIDADES[0].id);
    } catch {
      // Ver comentário acima — só afeta se o aviso repete depois.
    }
    setItensNovos(null);
  }

  if (!itensNovos) return null;

  return (
    <div className="faixa-novidades" role="status">
      <IconeConfere tamanho={20} />
      <span className="texto-novidades">
        <strong>O que mudou</strong>
        <ul>
          {itensNovos.map((item, indice) => (
            <li key={indice}>{item}</li>
          ))}
        </ul>
      </span>
      <button type="button" className="primario" onClick={fechar}>
        Entendi
      </button>
    </div>
  );
}
