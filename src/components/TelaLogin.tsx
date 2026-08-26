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
import { signInWithEmailAndPassword } from "firebase/auth";
import { auth } from "../lib/firebase";
import { LOJAS } from "../lib/lojas";

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

export function TelaLogin() {
  const [lojaId, setLojaId] = useState(LOJAS[0].id);
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState("");
  const [entrando, setEntrando] = useState(false);

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
      <h1>Padaria Pão de Mel</h1>
      <p>Produção &amp; Perdas</p>

      <form onSubmit={entrar}>
        <label>
          Loja
          <select value={lojaId} onChange={(e) => setLojaId(e.target.value)}>
            {LOJAS.map((l) => (
              <option key={l.id} value={l.id}>
                {l.nome}
              </option>
            ))}
          </select>
        </label>

        <label>
          Senha da loja
          <input
            type="password"
            value={senha}
            onChange={(e) => setSenha(e.target.value)}
            autoComplete="current-password"
            placeholder="Senha"
          />
        </label>

        <button type="submit" className="primario" disabled={entrando || senha === ""}>
          {entrando ? "Entrando..." : "Entrar"}
        </button>
      </form>

      {erro && <p className="erro-conversao">{erro}</p>}

      <p className="nota-rodape">
        O acesso fica gravado neste aparelho — não é preciso entrar toda vez. Só o primeiro acesso
        de cada celular precisa de internet.
      </p>
    </div>
  );
}
