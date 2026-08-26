/**
 * src/lib/plataforma.ts
 * ---------------------------------------------------------------
 * Onde o app está rodando — só o suficiente para dar a instrução certa
 * de como liberar as notificações (ago/2026).
 *
 * POR QUE ISTO EXISTE
 * -------------------
 * Nenhuma API da web abre a tela de configurações do sistema. Quando o
 * usuário já negou a permissão uma vez, o navegador NUNCA mais pergunta,
 * e o único caminho é ele mesmo ir nas configurações do aparelho — um
 * caminho diferente em cada sistema.
 *
 * Como o app não pode levá-lo até lá, o mínimo é não mandar procurar:
 * detectar o aparelho e mostrar os toques exatos, nessa ordem, com os
 * nomes que aparecem na tela dele. "Libere nas configurações" é uma
 * instrução que ninguém completa.
 *
 * Detecção por user agent é imprecisa por natureza (dá para falsificar,
 * e navegador novo aparece toda hora). Aqui isso é aceitável: o erro
 * mostra a instrução do aparelho errado, não quebra nada — e por isso
 * existe o caso `outro`, que descreve o caminho em termos genéricos em
 * vez de chutar.
 */

export type Plataforma = "android" | "ios" | "desktop" | "outro";

export function plataformaAtual(): Plataforma {
  if (typeof navigator === "undefined") return "outro";
  const ua = navigator.userAgent;

  // iPad moderno se anuncia como Mac; o que o denuncia é ter toque.
  const ehIpadDisfarcado = /Macintosh/.test(ua) && navigator.maxTouchPoints > 1;
  if (/iPhone|iPad|iPod/.test(ua) || ehIpadDisfarcado) return "ios";
  if (/Android/.test(ua)) return "android";
  if (/Windows|Macintosh|Linux|CrOS/.test(ua)) return "desktop";
  return "outro";
}

/** True quando o app está aberto instalado, e não numa aba do navegador. */
export function estaInstalado(): boolean {
  if (typeof window === "undefined") return false;
  if (window.matchMedia("(display-mode: standalone)").matches) return true;
  return Boolean((navigator as Navigator & { standalone?: boolean }).standalone);
}

export interface CaminhoDaPermissao {
  titulo: string;
  passos: string[];
  /** Endereço que o usuário cola na barra do navegador, quando existe. */
  atalho?: string;
}

/**
 * Os toques exatos para liberar a notificação neste aparelho, já
 * escolhendo entre "app instalado" e "aberto no navegador" — são telas
 * diferentes, e mandar a pessoa para a errada é pior que não instruir.
 */
export function comoLiberarNotificacao(): CaminhoDaPermissao {
  const instalado = estaInstalado();

  switch (plataformaAtual()) {
    case "android":
      return instalado
        ? {
            titulo: "No Android, com o app instalado",
            passos: [
              "Toque e segure o ícone do Pão de Mel na tela inicial",
              'Toque em "Informações do app"',
              "Abra Notificações e ligue a chave",
              "Volte aqui e toque em Ativar de novo",
            ],
          }
        : {
            titulo: "No Chrome do Android",
            passos: [
              "Toque nos três pontos ⋮ do Chrome",
              "Configurações → Configurações do site → Notificações",
              "Procure o endereço deste app na lista e escolha Permitir",
              "Volte aqui e toque em Ativar de novo",
            ],
          };

    case "ios":
      return instalado
        ? {
            titulo: "No iPhone, com o app instalado",
            passos: [
              "Abra os Ajustes do iPhone",
              'Role a lista de apps até "Pão de Mel"',
              "Toque em Notificações e ligue Permitir Notificações",
              "Volte aqui e toque em Ativar de novo",
            ],
          }
        : {
            titulo: "No iPhone, o app precisa estar instalado",
            passos: [
              "Toque no botão Compartilhar do Safari",
              "Escolha Adicionar à Tela de Início",
              "Abra o app pelo ícone que apareceu na tela inicial",
              "O aviso de notificação aparece lá dentro",
            ],
          };

    case "desktop":
      return {
        titulo: "No computador",
        passos: [
          "Clique no ícone à esquerda do endereço, na barra do navegador",
          "Em Notificações, escolha Permitir",
          "Recarregue a página e toque em Ativar de novo",
        ],
        atalho: "chrome://settings/content/notifications",
      };

    default:
      return {
        titulo: "Neste aparelho",
        passos: [
          "Abra as configurações do navegador",
          "Procure Notificações ou Permissões de site",
          "Libere a notificação para o endereço deste app",
          "Volte aqui e toque em Ativar de novo",
        ],
      };
  }
}
