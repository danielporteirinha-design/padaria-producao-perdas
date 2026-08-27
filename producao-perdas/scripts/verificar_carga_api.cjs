/**
 * scripts/verificar_carga_api.cjs
 * ---------------------------------------------------------------
 * Impede a volta do defeito que tirou os avisos do ar por uma manhã
 * inteira (ago/2026).
 *
 * O que aconteceu: `api/notificar-fornada.ts` importava
 * `firebase-admin/auth`, que carrega `jwks-rsa`, que faz `require('jose')`
 * — e o `jose` virou pacote só-ESM. O runtime do Vercel não faz
 * `require()` de ESM, então a função morria com ERR_REQUIRE_ESM antes de
 * executar uma linha, devolvendo um 500 sem corpo. Na tela isso aparecia
 * como "HTTP 500" pelado, indistinguível de chave de serviço errada.
 *
 * O Node local NÃO reproduz isso: da versão 22.12 em diante ele aceita
 * `require()` de ESM. Por isso este script roda com
 * `--no-experimental-require-module`, que desliga essa tolerância e faz a
 * máquina de desenvolvimento se comportar como o servidor de produção.
 *
 * Rodar: node --no-experimental-require-module scripts/verificar_carga_api.cjs
 */

const fs = require("fs");
const path = require("path");

const RAIZ = path.join(__dirname, "..");
const PASTA_API = path.join(RAIZ, "api");

if (!process.execArgv.includes("--no-experimental-require-module")) {
  console.error(
    "FALHOU - rode com --no-experimental-require-module, senão o teste não reproduz o runtime do Vercel."
  );
  process.exit(1);
}

let falhas = 0;
const jaTestado = new Set();

for (const arquivo of fs.readdirSync(PASTA_API).filter((f) => f.endsWith(".ts"))) {
  const fonte = fs.readFileSync(path.join(PASTA_API, arquivo), "utf8");

  // Pega tanto `import x from "pacote"` quanto `await import("pacote")`,
  // ignorando caminhos relativos (esses são código nosso, não dependência).
  const pacotes = [...fonte.matchAll(/(?:from|import\()\s*["']([^."'][^"']*)["']/g)]
    .map((m) => m[1])
    .filter((nome) => !nome.startsWith("node:"));

  for (const pacote of pacotes) {
    const chave = `${arquivo}::${pacote}`;
    if (jaTestado.has(chave)) continue;
    jaTestado.add(chave);
    try {
      require(require.resolve(pacote, { paths: [RAIZ] }));
      console.log(`OK   - ${arquivo}: ${pacote} carrega como CommonJS`);
    } catch (erro) {
      console.error(
        `FALHOU - ${arquivo}: ${pacote} NÃO carrega no runtime do Vercel -> ${erro.code || erro.message}`
      );
      falhas++;
    }
  }
}

if (jaTestado.size === 0) {
  console.log("OK   - nenhuma dependência externa importada em /api");
}
console.log(`\n${falhas === 0 ? "TODAS AS FUNÇÕES CARREGAM" : `${falhas} IMPORT(S) QUEBRARIAM EM PRODUÇÃO`}`);
process.exit(falhas === 0 ? 0 : 1);
