/**
 * src/components/ConfirmarComSenha.tsx
 * ---------------------------------------------------------------
 * Pede a senha da loja antes de uma ação irreversível (ago/2026 —
 * pedido do dono do negócio para a exclusão de produtos do catálogo).
 *
 * Usa a senha que a loja JÁ tem, revalidando-a contra o Firebase
 * (`reauthenticateWithCredential`). Não existe um segundo segredo para
 * criar, distribuir e esquecer — e, principalmente, a checagem é real:
 * uma senha guardada no código do app seria visível para qualquer um que
 * abrisse o navegador, e serviria só de teatro.
 *
 * O que isso protege de verdade: o celular destravado em cima do balcão.
 * Não é uma barreira contra alguém que saiba a senha da loja — contra
 * esse, a proteção é a regra do Firestore, que já impede a filial de
 * mexer no catálogo.
 */

import { useState } from "react";
import { EmailAuthProvider, reauthenticateWithCredential } from "firebase/auth";
import { auth } from "../lib/firebase";
import { IconeCadeado } from "./Icones";

interface ConfirmarComSenhaProps {
  titulo: string;
  descricao: string;
  rotuloConfirmar: string;
  onConfirmado: () => void | Promise<void>;
  onCancelar: () => void;
}

export function ConfirmarComSenha({
  titulo,
  descricao,
  rotuloConfirmar,
  onConfirmado,
  onCancelar,
}: ConfirmarComSenhaProps) {
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState("");
  const [verificando, setVerificando] = useState(false);

  async function confirmar(evento: React.FormEvent) {
    evento.preventDefault();
    const usuario = auth.currentUser;
    if (!usuario?.email || !senha) return;

    setVerificando(true);
    setErro("");
    try {
      await reauthenticateWithCredential(
        usuario,
        EmailAuthProvider.credential(usuario.email, senha)
      );
      await onConfirmado();
    } catch (e) {
      const codigo = (e as { code?: string }).code ?? "";
      console.error("Falha ao confirmar com senha:", e);
      setErro(
        codigo.includes("too-many-requests")
          ? "Muitas tentativas seguidas. Espere alguns minutos."
          : codigo.includes("network")
            ? "Sem conexão para confirmar a senha. Esta ação exige internet."
            : "Senha incorreta."
      );
    } finally {
      setVerificando(false);
    }
  }

  return (
    <div className="fundo-modal" role="dialog" aria-modal="true">
      <div className="caixa-modal">
        <h3>
          <IconeCadeado tamanho={20} />
          {titulo}
        </h3>
        <p className="nota-rodape">{descricao}</p>
        <form onSubmit={confirmar}>
          <label>
            Senha da loja
            <input
              type="password"
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
              autoComplete="current-password"
              autoFocus
            />
          </label>
          {erro && <p className="erro-conversao">{erro}</p>}
          <div className="acoes">
            <button type="button" className="secundario" onClick={onCancelar} disabled={verificando}>
              Cancelar
            </button>
            <button type="submit" className="perigo" disabled={verificando || senha === ""}>
              {verificando ? "Verificando..." : rotuloConfirmar}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
