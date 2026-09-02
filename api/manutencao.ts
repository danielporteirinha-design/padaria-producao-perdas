/**
 * api/manutencao.ts
 * ---------------------------------------------------------------
 * MODO DE MANUTENÇÃO — testar o app sem tocar o celular de ninguém
 * (ago/2026, pedido do dono do negócio).
 *
 * O PROBLEMA
 * -----------
 * Os colaboradores das três lojas já instalaram o app nos telefones
 * deles. A partir daí, cada teste feito na matriz — anunciar uma fornada,
 * mandar um pedido, decidir uma reposição — toca o celular de todo mundo,
 * a qualquer hora. Testar passou a ter um custo social, e o resultado
 * previsível disso é parar de testar.
 *
 * A SOLUÇÃO, E ONDE ELA MORA
 * ---------------------------
 * A trava é do SERVIDOR, e não do aplicativo. Tem que ser: quem dispara o
 * aviso é a matriz, e quem recebe é o telefone do colaborador — uma
 * chave no aplicativo de quem dispara não impediria a entrega, e uma
 * chave no telefone de quem recebe dependeria de cada um ter atualizado.
 * Aqui, no único ponto por onde todo aviso passa, uma chave só resolve
 * para os três aparelhos de uma vez.
 *
 * OS SEUS APARELHOS CONTINUAM RECEBENDO
 * --------------------------------------
 * Silenciar tudo, inclusive o próprio aparelho de teste, tornaria
 * impossível testar justamente o que mais quebra: o aviso chegando. Por
 * isso a manutenção não é um "desliga tudo" — é um "só os meus recebem".
 * O critério é o NOME DO OPERADOR gravado quando o aparelho ativou os
 * avisos (ver `registradoPor` em src/lib/notificacoes.ts): o telefone
 * onde você digitou o seu nome continua tocando, os outros ficam mudos.
 *
 * COMO LIGAR E DESLIGAR — na Vercel, em Environment Variables:
 *
 *   MANUTENCAO=1                  liga o modo (qualquer valor menos
 *                                 "0", "false" ou vazio)
 *   APARELHOS_DE_TESTE=Daniel     nomes que continuam recebendo,
 *                                 separados por vírgula
 *
 * Depois de salvar, é preciso um deploy novo para a variável valer —
 * é o preço de ter a chave fora do alcance de quem usa o app.
 *
 * SEM `APARELHOS_DE_TESTE`, A MANUTENÇÃO SILENCIA TUDO. É o
 * comportamento seguro para um esquecimento de configuração: o pior que
 * acontece é ninguém receber, e não o contrário.
 *
 * Módulo PURO nas funções exportadas (sem I/O) — ver
 * scripts/verificar_logica.ts. O `handler` no fim é só o diagnóstico.
 */

/** Comparação de nome sem acento e sem caixa — "Daniel" acha "DANIEL". */
function normalizar(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .trim();
}

/**
 * A manutenção está ligada?
 *
 * Aceita "0", "false", "off", "nao" e vazio como DESLIGADO. Qualquer
 * outro valor liga — quem digita `MANUTENCAO=sim` está querendo ligar, e
 * exigir um valor exato só criaria um jeito silencioso de errar.
 */
export function manutencaoAtiva(bruto: string | undefined): boolean {
  const valor = (bruto ?? "").trim().toLowerCase();
  if (valor === "") return false;
  return !["0", "false", "off", "nao", "não"].includes(valor);
}

/** Os nomes que continuam recebendo aviso durante a manutenção. */
export function operadoresDeTeste(bruto: string | undefined): string[] {
  return (bruto ?? "")
    .split(",")
    .map((n) => normalizar(n))
    .filter((n) => n.length > 0);
}

/** Este aparelho é de teste? Compara o nome de quem ativou os avisos. */
export function ehAparelhoDeTeste(
  registradoPor: string | undefined,
  nomesDeTeste: string[]
): boolean {
  if (nomesDeTeste.length === 0) return false;
  const nome = normalizar(registradoPor ?? "");
  if (nome === "") return false;
  // `includes` dos dois lados: "Daniel" casa com "Daniel Sarmento", e
  // quem cadastrou o nome completo na variável também é encontrado.
  return nomesDeTeste.some((teste) => nome.includes(teste) || teste.includes(nome));
}

export interface AparelhoRegistrado {
  token?: string;
  registradoPor?: string;
}

export interface DestinatariosFiltrados {
  /** Para quem o aviso realmente vai. */
  tokens: string[];
  /** Quantos aparelhos foram silenciados pela manutenção. */
  silenciados: number;
  manutencao: boolean;
}

/**
 * O FILTRO ÚNICO por onde todo envio passa.
 *
 * Fora da manutenção, devolve todo mundo — nenhum comportamento muda
 * enquanto a chave está desligada, que é a garantia mais importante
 * deste arquivo.
 */
export function filtrarDestinatarios(
  aparelhos: AparelhoRegistrado[],
  ambiente: { MANUTENCAO?: string; APARELHOS_DE_TESTE?: string } = process.env
): DestinatariosFiltrados {
  const todos = aparelhos
    .map((a) => a.token)
    .filter((t): t is string => Boolean(t));

  if (!manutencaoAtiva(ambiente.MANUTENCAO)) {
    return { tokens: todos, silenciados: 0, manutencao: false };
  }

  const nomesDeTeste = operadoresDeTeste(ambiente.APARELHOS_DE_TESTE);
  const permitidos = aparelhos
    .filter((a) => Boolean(a.token) && ehAparelhoDeTeste(a.registradoPor, nomesDeTeste))
    .map((a) => a.token as string);

  return {
    tokens: permitidos,
    silenciados: todos.length - permitidos.length,
    manutencao: true,
  };
}

/**
 * Diagnóstico — abra no navegador: /api/manutencao
 *
 * Responde o estado atual. O app também consulta este endereço para
 * mostrar a faixa de manutenção no topo da tela: quem está testando
 * precisa ver, o tempo todo, que os avisos estão suspensos — senão a
 * chave fica ligada por dias e ninguém entende por que parou de chegar
 * aviso.
 */
/**
 * QUEM ESTÁ REGISTRADO PARA RECEBER AVISO — e sob qual nome.
 *
 * POR QUE ISTO EXISTE (set/2026): "o teste de aviso não funcionou" tem
 * três causas que se parecem exatamente igual na tela — o aparelho de
 * destino nunca ativou os avisos, ativou sob outro nome de operador, ou
 * está silenciado pela manutenção. A coleção `dispositivos` é ilegível
 * pelo app de propósito (regra do Firestore: `allow read: if false`), e
 * sem enxergá-la a investigação vira tentativa e erro.
 *
 * NÃO DEVOLVE TOKEN. Só a loja, o nome do operador e se aquele aparelho
 * passa pelo filtro da manutenção — o suficiente para descobrir a causa,
 * e nada que sirva para mandar aviso a ninguém.
 */
async function aparelhosRegistrados(nomesDeTeste: string[], ativa: boolean) {
  const bruto = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!bruto) return { erro: "Sem FIREBASE_SERVICE_ACCOUNT — não dá para ler o registro." };

  try {
    const [app, firestore] = await Promise.all([
      import("firebase-admin/app"),
      import("firebase-admin/firestore"),
    ]);
    const { cert, getApp, getApps, initializeApp } = app;
    const aplicativo =
      getApps().length > 0
        ? getApp()
        : initializeApp({
            credential: cert(JSON.parse(bruto) as import("firebase-admin/app").ServiceAccount),
          });

    const snapshot = await firestore.getFirestore(aplicativo).collection("dispositivos").get();
    const porLoja: Record<string, { operador: string; recebeAgora: boolean }[]> = {};

    for (const documento of snapshot.docs) {
      const loja = (documento.get("lojaId") as string) ?? "(sem loja)";
      const operador = (documento.get("registradoPor") as string) ?? "(sem nome)";
      porLoja[loja] = porLoja[loja] ?? [];
      porLoja[loja].push({
        operador,
        recebeAgora: !ativa || ehAparelhoDeTeste(operador, nomesDeTeste),
      });
    }

    return { total: snapshot.size, porLoja };
  } catch (e) {
    return { erro: e instanceof Error ? e.message.slice(0, 300) : String(e).slice(0, 300) };
  }
}

export default async function handler(req: any, res: any) {
  const ativa = manutencaoAtiva(process.env.MANUTENCAO);
  const nomes = operadoresDeTeste(process.env.APARELHOS_DE_TESTE);
  const aparelhos = await aparelhosRegistrados(nomes, ativa);

  res.status(200).json({
    manutencao: ativa,
    // Os nomes não são segredo: são o primeiro nome de quem testa, e
    // vê-los é o que permite descobrir por que um aparelho não recebe.
    aparelhosDeTeste: nomes,
    aparelhosRegistrados: aparelhos,
    aviso:
      ativa && nomes.length === 0
        ? "Manutenção LIGADA sem APARELHOS_DE_TESTE: NINGUÉM está recebendo aviso."
        : undefined,
    comoLigar:
      "Na Vercel, em Environment Variables: MANUTENCAO=1 e APARELHOS_DE_TESTE=<seu nome>. " +
      "Para desligar, apague MANUTENCAO (ou ponha 0). Em ambos os casos é preciso um deploy novo.",
  });
  void req;
}
