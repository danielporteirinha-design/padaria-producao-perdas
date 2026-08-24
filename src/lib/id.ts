/** Geração de identificadores — isolado num módulo próprio para poder trocar
 * a estratégia (ex.: IDs do próprio Firestore) sem tocar nas telas. */
export function gerarId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  // fallback simples para ambientes sem crypto.randomUUID (ex.: SSR antigo)
  return `id-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}
