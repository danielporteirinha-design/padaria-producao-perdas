/**
 * src/components/CampoDeBusca.tsx
 * ---------------------------------------------------------------
 * O campo de busca de produto do app inteiro.
 *
 * UM COMPONENTE, VÁRIAS TELAS
 * ----------------------------
 * Busca de perda, de fornada, de pedido da filial, de suprimento e do
 * catálogo eram `<input>` parecidos e independentes. Cinco cópias viram
 * cinco comportamentos ligeiramente diferentes na primeira correção.
 * Aqui é um só.
 *
 * O MICROFONE SAIU DAQUI (ago/2026, decisão do dono do negócio: "o
 * microfone dentro de todas as caixas de texto do app deve ser retirado,
 * gerou ruído").
 *
 * O motivo é de desenho, e vale registrar: havia DOIS microfones na
 * mesma tela fazendo coisas diferentes — o do assistente, que monta um
 * pedido inteiro a partir de uma frase, e este, que só preenchia um
 * termo de busca. Dois botões com o mesmo ícone e resultados diferentes
 * é uma armadilha: a pessoa toca no errado, o app faz outra coisa, e a
 * conclusão é que o reconhecimento de voz não funciona.
 *
 * Ficou um microfone por tela, no assistente, que é o que resolve o
 * trabalho de verdade. Aqui ficou o que um campo de busca precisa ser:
 * um campo de busca.
 */

interface CampoDeBuscaProps {
  valor: string;
  onMudar: (valor: string) => void;
  placeholder: string;
  rotulo: string;
  /** Botão extra à direita, como o "limpar" dos painéis de fornada. */
  children?: React.ReactNode;
  className?: string;
}

export function CampoDeBusca({
  valor,
  onMudar,
  placeholder,
  rotulo,
  children,
  className = "",
}: CampoDeBuscaProps) {
  return (
    <div className={`campo-com-voz ${className}`}>
      <input
        type="search"
        inputMode="search"
        placeholder={placeholder}
        aria-label={rotulo}
        value={valor}
        onChange={(e) => onMudar(e.target.value)}
      />
      {children}
    </div>
  );
}
