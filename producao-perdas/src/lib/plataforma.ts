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
            /**
             * Com o app instalado (WebAPK) NÃO existe configuração de site
             * do Chrome para mexer: a permissão passa a ser do aplicativo,
             * nas configurações do Android. Mandar para o Chrome aqui é
             * mandar para uma tela que não controla mais nada.
             */
            titulo: "No Android, com o app instalado",
            passos: [
              "Toque e SEGURE o ícone do Pão de Mel na tela inicial",
              'Toque em "Informações do app" (ou no ⓘ)',
              "Abra Notificações e ligue a chave",
              "Volte aqui e toque em Ativar de novo",
              "Se a chave já estava ligada e mesmo assim nada chega: desinstale o app da tela inicial e instale de novo — a recusa foi gravada antes da instalação",
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
      /**
       * "Clique no ícone" era ambíguo e mandou um usuário procurar atalho
       * na ÁREA DE TRABALHO (ago/2026) — que nem existe quando o app é
       * aberto pelo link, que é o caso do computador do caixa. Agora o
       * passo diz onde fica e o que tem escrito ao lado.
       */
      return {
        titulo: "No computador, pelo navegador",
        passos: [
          "Na barra de endereço do Chrome, clique no ícone logo ANTES do endereço do app (um cadeado ou uns controles deslizantes) — é na barra do navegador, não na área de trabalho",
          'Clique em "Configurações do site"',
          'Em Notificações, troque para "Permitir"',
          "Recarregue a página (F5) e clique em Ativar de novo",
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
