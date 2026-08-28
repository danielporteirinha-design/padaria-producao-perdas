import { chromium } from "playwright";
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const p = await b.newPage({ viewport: { width: 430, height: 1200 } });
await p.addInitScript(() => {
  class FakeSR {
    start(){ setTimeout(()=>{ this.onresult && this.onresult({ results: [[{ transcript: window.__frase || "" }]] }); this.onend && this.onend(); }, 60); }
    stop(){ this.onend && this.onend(); } abort(){ this.onend && this.onend(); }
  }
  window.SpeechRecognition = FakeSR; window.webkitSpeechRecognition = FakeSR;
});
p.on("pageerror", e => console.log("PAGEERROR:", e.message));
await p.goto("http://localhost:5200/", { waitUntil: "networkidle" });

async function falar(frase) {
  await p.evaluate(f => { window.__frase = f; }, frase);
  await p.click("button.botao-assistente");
  await p.waitForTimeout(800);
}
const card = () => p.locator(".conferencia-voz").innerText().catch(()=> "(sem card)");

console.log("== falar 1a vez (3 itens), SEM confirmar ==");
await falar("20 pao frances, 10 broa de fuba e 6 sonho de creme");
console.log(await card());

console.log("\n== falar de novo SEM ter confirmado (mais 2, um repetido) ==");
await falar("15 rosca tatu e 5 pao frances");
console.log(await card());
await p.screenshot({ path: "/tmp/v2-card.png", fullPage: true });

console.log("\n== confirmar -> vai para a montagem ==");
await p.locator(".conferencia-voz button").last().click();
await p.waitForTimeout(700);
console.log(await p.locator(".pedido-em-montagem").innerText());

console.log("\n== enviar ==");
await p.locator("button", { hasText: "Enviar pedido" }).click();
await p.waitForTimeout(900);
await p.screenshot({ path: "/tmp/v2-sanfonas.png", fullPage: true });
console.log(await p.locator(".acordeao-sessao").first().innerText());
await b.close();
