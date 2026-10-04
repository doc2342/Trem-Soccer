// Escudo e uniforme desenhados a partir de poucos parâmetros (nada de imagem enviada: economiza banco e banda).
export const FORMAS = { escudo: "Escudo", circulo: "Círculo", losango: "Losango" };
export const PADROES = { liso: "Liso", listras: "Listras", faixa: "Faixa", metade: "Metade" };
export const CORES = ["#c8102e", "#0b3d91", "#0a7d3b", "#111111", "#f2c14e", "#ffffff", "#f26b21", "#6a1b9a", "#7b1e24", "#3aa7e0", "#0f5c4d", "#8b9bb0"];

const cor = (c, padrao) => /^#[0-9a-fA-F]{6}$/.test(c || "") ? c : padrao;
const esc = s => String(s || "").replace(/[&<>"]/g, "");
const contraste = c => { const n = parseInt(c.slice(1), 16), l = 0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255); return l > 150 ? "#111111" : "#ffffff"; };

function preenchimento(padrao, c1, c2, id) {
  if (padrao === "listras") return `<pattern id="${id}" width="20" height="10" patternUnits="userSpaceOnUse"><rect width="10" height="10" fill="${c1}"/><rect x="10" width="10" height="10" fill="${c2}"/></pattern>`;
  if (padrao === "faixa") return `<pattern id="${id}" width="100" height="100" patternUnits="userSpaceOnUse"><rect width="100" height="100" fill="${c1}"/><rect y="38" width="100" height="24" fill="${c2}"/></pattern>`;
  if (padrao === "metade") return `<pattern id="${id}" width="100" height="100" patternUnits="userSpaceOnUse"><rect width="50" height="100" fill="${c1}"/><rect x="50" width="50" height="100" fill="${c2}"/></pattern>`;
  return `<pattern id="${id}" width="100" height="100" patternUnits="userSpaceOnUse"><rect width="100" height="100" fill="${c1}"/></pattern>`;
}

let serie = 0;
// escudo: { forma, padrao, cor1, cor2 }
export function svgEscudo(e = {}, sigla = "", tamanho = 48) {
  const c1 = cor(e.cor1, "#0b3d91"), c2 = cor(e.cor2, "#ffffff"), id = "pe" + (++serie);
  const forma = e.forma === "circulo" ? `<circle cx="50" cy="50" r="44"` : e.forma === "losango" ? `<path d="M50 4 L94 50 L50 96 L6 50 Z"` : `<path d="M10 8 H90 V52 C90 76 70 90 50 96 C30 90 10 76 10 52 Z"`;
  return `<svg viewBox="0 0 100 100" width="${tamanho}" height="${tamanho}" role="img" aria-label="Escudo"><defs>${preenchimento(e.padrao, c1, c2, id)}</defs>
    ${forma} fill="url(#${id})" stroke="${contraste(c1) === "#ffffff" ? "#e6edf3" : "#111"}" stroke-width="3"/>
    <text x="50" y="${e.forma === "escudo" || !e.forma ? 54 : 58}" text-anchor="middle" font-family="system-ui,sans-serif" font-weight="800" font-size="24" fill="${contraste(c1)}" stroke="${c1}" stroke-width="5" paint-order="stroke">${esc(sigla).slice(0, 3)}</text></svg>`;
}

// uniforme: { padrao, cor1, cor2, calcao }
export function svgUniforme(u = {}, tamanho = 48) {
  const c1 = cor(u.cor1, "#0b3d91"), c2 = cor(u.cor2, "#ffffff"), cal = cor(u.calcao, "#111111"), id = "pu" + (++serie);
  return `<svg viewBox="0 0 100 120" width="${tamanho}" height="${tamanho * 1.2}" role="img" aria-label="Uniforme"><defs>${preenchimento(u.padrao, c1, c2, id)}</defs>
    <path d="M30 6 L10 18 L2 40 L18 46 L22 34 V78 H78 V34 L82 46 L98 40 L90 18 L70 6 C64 14 36 14 30 6 Z" fill="url(#${id})" stroke="#0f1720" stroke-width="2"/>
    <path d="M24 82 H76 L80 116 H54 L50 96 L46 116 H20 Z" fill="${cal}" stroke="#0f1720" stroke-width="2"/></svg>`;
}

export function visualAleatorio(rng) {
  const c1 = rng.pick(CORES); let c2 = rng.pick(CORES); while (c2 === c1) c2 = rng.pick(CORES);
  const padrao = rng.pick(Object.keys(PADROES));
  return { escudo: { forma: rng.pick(Object.keys(FORMAS)), padrao, cor1: c1, cor2: c2 }, uniforme: { padrao, cor1: c1, cor2: c2, calcao: rng.pick([c1, c2, "#111111", "#ffffff"]) } };
}
