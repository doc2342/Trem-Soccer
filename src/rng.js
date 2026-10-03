// Gerador de números aleatórios com semente (mulberry32).
// A mesma semente dá sempre o mesmo resultado, no navegador e no servidor.
export function criarRng(semente) {
  let a = (semente >>> 0) || 1;
  const n = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const int = (min, max) => min + Math.floor(n() * (max - min + 1));
  const pick = lista => lista[Math.floor(n() * lista.length)];
  // normal por Box-Muller
  const normal = (media, desvio) => media + desvio * Math.sqrt(-2 * Math.log(1 - n())) * Math.cos(2 * Math.PI * n());
  const chance = p => n() < p;
  const embaralhar = lista => {
    const l = lista.slice();
    for (let i = l.length - 1; i > 0; i--) { const j = int(0, i); [l[i], l[j]] = [l[j], l[i]]; }
    return l;
  };
  return { n, int, pick, normal, chance, embaralhar };
}

export const limitar = (v, min, max) => Math.max(min, Math.min(max, v));
