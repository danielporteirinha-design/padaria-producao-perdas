/**
 * src/components/TelaLogin.tsx
 * ---------------------------------------------------------------
 * Entrada do app a partir de ago/2026, quando os dados passaram a viver
 * na nuvem e três lojas passaram a usar o mesmo sistema.
 *
 * O acesso é POR LOJA, não por funcionário: são três contas fixas
 * (ver src/lib/lojas.ts), e o funcionário escolhe a loja numa lista em
 * vez de digitar um e-mail. Digitar "arthur@paodemel.local" numa tela de
 * celular às 5h da manhã é fonte de erro sem nenhum ganho — a senha
 * continua sendo digitada normalmente.
 *
 * Quem lançou cada registro continua sendo identificado pelo NOME do
 * operador (TelaIdentificacao, depois deste passo). São coisas
 * diferentes: a loja diz de onde vem o dado, o nome diz quem digitou.
 */

import { useState } from "react";
import { signInWithCustomToken, signInWithEmailAndPassword } from "firebase/auth";
import { auth } from "../lib/firebase";
import { LOJAS } from "../lib/lojas";
import { BannerInstalar } from "./BannerInstalar";

/**
 * Traduz os códigos do Firebase para algo que o operador entenda. A
 * mensagem crua ("auth/invalid-credential") não ajuda ninguém na padaria.
 */
function mensagemDeErro(codigo: string): string {
  switch (codigo) {
    case "auth/invalid-credential":
    case "auth/wrong-password":
    case "auth/user-not-found":
      return "Senha incorreta para esta loja. Confira com o responsável.";
    case "auth/too-many-requests":
      return "Muitas tentativas seguidas. Espere alguns minutos e tente de novo.";
    case "auth/network-request-failed":
      return "Sem conexão. O primeiro acesso de cada aparelho precisa de internet — depois disso o app funciona offline.";
    case "auth/user-disabled":
      return "Este acesso foi desativado. Fale com o responsável.";
    default:
      return "Não foi possível entrar. Tente de novo — se continuar, me avise para eu investigar.";
  }
}

/**
 * Tenta a entrada SEM SENHA (ago/2026, provisória — ver
 * api/entrar-como-loja.ts).
 *
 * Devolve `false` em qualquer contratempo — recurso desligado no
 * servidor, sem internet, resposta estranha. Nunca lança: quem chama usa
 * o `false` para mostrar o campo de senha, que é o caminho que sempre
 * funcionou. Um atalho de conveniência não pode ser o motivo de alguém
 * ficar do lado de fora às cinco da manhã.
 */
/**
 * Tenta a entrada SEM SENHA (ago/2026, provisória — ver
 * api/entrar-como-loja.ts).
 *
 * Devolve o MOTIVO da falha junto, e não só "não deu".
 *
 * Isso mudou depois de uma tarde perdida: a tela caía no campo de senha
 * sem dizer por quê, e as quatro causas possíveis (variável ausente,
 * variável com o texto de exemplo, UID errado, chave de serviço
 * faltando) se pareciam exatamente igual para quem estava olhando. O
 * motivo aparece em letra miúda no rodapé; quem está no balcão ignora,
 * quem está configurando resolve em um minuto.
 */
async function entrarSemSenha(lojaId: string): Promise<{ ok: boolean; motivo: string }> {
  try {
    const resposta = await fetch("/api/entrar-como-loja", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ loja: lojaId }),
    });
    if (resposta.status === 404) {
      return { ok: false, motivo: "a função de entrada não subiu no deploy" };
    }
    if (!resposta.ok) {
      const dados = (await resposta.json().catch(() => ({}))) as { motivo?: string };
      return { ok: false, motivo: MOTIVOS[dados.motivo ?? ""] ?? `recusado (${resposta.status})` };
    }
    const dados = (await resposta.json()) as { token?: string };
    if (!dados.token) return { ok: false, motivo: "o servidor não devolveu credencial" };
    await signInWithCustomToken(auth, dados.token);
    return { ok: true, motivo: "" };
  } catch (e) {
    const codigo = (e as { code?: string }).code ?? "";
    if (codigo.includes("custom-token")) {
      return { ok: false, motivo: "o UID desta loja em UIDS_LOJAS não confere" };
    }
    if (codigo.includes("network")) return { ok: false, motivo: "sem conexão" };
    return { ok: false, motivo: codigo || "falha ao entrar sem senha" };
  }
}

/** Tradução dos códigos que api/entrar-como-loja.ts devolve. */
const MOTIVOS: Record<string, string> = {
  "sem-uids": "falta a variável UIDS_LOJAS na Vercel",
  "loja-sem-uid": "esta loja não está em UIDS_LOJAS",
  "sem-credencial": "falta FIREBASE_SERVICE_ACCOUNT na Vercel",
  "falha-ao-assinar": "a chave de serviço não pôde assinar (confira o JSON)",
};

export function TelaLogin() {
  const [lojaId, setLojaId] = useState(LOJAS[0].id);
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState("");
  const [entrando, setEntrando] = useState(false);
  /**
   * O campo de senha começa ESCONDIDO e só aparece quando a entrada sem
   * senha não funciona. Assim a mesma tela serve nos dois modos, e
   * religar a senha é apagar uma variável na Vercel — sem publicar
   * versão nova e sem ninguém ficar trancado do lado de fora.
   */
  const [pedirSenha, setPedirSenha] = useState(false);
  /** Por que a entrada direta não valeu — só para quem está configurando. */
  const [motivoSemSenha, setMotivoSemSenha] = useState("");

  /** Um toque na loja: tenta entrar direto; se não der, pede a senha. */
  async function escolherLoja(id: string) {
    setLojaId(id);
    setErro("");
    if (pedirSenha) return;

    setEntrando(true);
    const tentativa = await entrarSemSenha(id);
    setEntrando(false);
    // Sem `else`: quando entra, é o onAuthStateChanged do App que troca
    // a tela — mexer no estado daqui competiria com a desmontagem.
    if (!tentativa.ok) {
      setMotivoSemSenha(tentativa.motivo);
      setPedirSenha(true);
    }
  }

  async function entrar(evento: React.FormEvent) {
    evento.preventDefault();
    const loja = LOJAS.find((l) => l.id === lojaId);
    if (!loja || !senha) return;

    setEntrando(true);
    setErro("");
    try {
      await signInWithEmailAndPassword(auth, loja.email, senha);
      // Não trocamos de tela aqui: o App observa o estado de autenticação
      // e reage sozinho (ver onAuthStateChanged em App.tsx).
    } catch (e) {
      const codigo = (e as { code?: string }).code ?? "";
      console.error("Falha ao entrar:", e);
      setErro(mensagemDeErro(codigo));
    } finally {
      setEntrando(false);
    }
  }

  return (
    <div className="tela-identificacao">
      {/* A marca no lugar do título escrito: é a primeira tela do dia e a
          única onde sobra espaço para ela sem disputar com dado nenhum. */}
      <img
        className="marca-login"
        src="/logo-pao-de-mel.png"
        alt="Padaria Pão de Mel"
        width="320"
        height="115"
      />
      <p>Produção &amp; Perdas</p>

      {/* O convite para instalar vive AQUI, e não só depois do login
          (ago/2026). Quem recebe o endereço cai nesta tela, e antes o
          único caminho para pôr o ícone no aparelho aparecia depois de
          entrar — ou seja, nunca, para quem ainda não tinha senha. */}
      <BannerInstalar emDestaque />

      {/* A loja é um BOTÃO por unidade, e não uma lista suspensa: são
          três opções, o alvo fica grande para o dedo, e num toque só o
          aparelho já entra. */}
      <div className="escolha-de-loja">
        {LOJAS.map((l) => (
          <button
            key={l.id}
            type="button"
            className={`botao-loja ${pedirSenha && lojaId === l.id ? "escolhida" : ""}`}
            disabled={entrando}
            onClick={() => void escolherLoja(l.id)}
          >
            {l.nome}
          </button>
        ))}
      </div>

      {/* O campo de senha só existe quando a entrada direta não valeu. */}
      {pedirSenha && (
        <form onSubmit={entrar}>
          <label>
            Senha da loja
            <input
              type="password"
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
              autoComplete="current-password"
              placeholder="Senha"
              autoFocus
            />
          </label>

          <button type="submit" className="primario" disabled={entrando || senha === ""}>
            {entrando ? "Entrando..." : "Entrar"}
          </button>
        </form>
      )}

      {entrando && !pedirSenha && <p className="nota-rodape">Entrando...</p>}
      {erro && <p className="erro-conversao">{erro}</p>}

      <p className="nota-rodape">
        O acesso fica gravado neste aparelho — não é preciso entrar toda vez. Só o primeiro acesso
        de cada celular precisa de internet.
      </p>

      {/* A versão também aparece AQUI, e não só depois do login (ago/2026):
          esta é a primeira tela de qualquer aparelho, e é onde se confere
          se a atualização entrou sem precisar acessar uma loja. */}
      {motivoSemSenha && (
        <p className="rodape-versao">entrada direta indisponível: {motivoSemSenha}</p>
      )}
      <p className="rodape-versao">versão de {__VERSAO_APP__}</p>
    </div>
  );
}
