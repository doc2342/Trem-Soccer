// Escudo e uniforme desenhados a partir de poucos parâmetros. O escudo também pode ser uma imagem enviada pelo dirigente
// (51_escudo_enviado.sql): fica no Storage do Supabase e o desenho continua guardado, como reserva.
export const FORMAS = { escudo: "Escudo", classico: "Clássico", frances: "Francês", circulo: "Círculo", anel: "Círculo com aro", losango: "Losango", retangular: "Retangular", oval: "Oval" };
export const PADROES = { liso: "Liso", listras: "Listras verticais", horizontais: "Listras horizontais", faixa: "Faixa horizontal", faixaV: "Faixa vertical",
  diagonal: "Faixa diagonal", metade: "Metade", quartos: "Quartos", xadrez: "Xadrez", cruz: "Cruz", chevron: "Chevron (V)", borda: "Borda" };
export const SIMBOLOS = { sigla: "Sigla", estrela: "Estrela", bola: "Bola", coroa: "Coroa", raio: "Raio", torre: "Torre", trem: "Trem", ancora: "Âncora", leao: "Cabeça de leão", nenhum: "Nenhum" };
export const GOLAS = { redonda: "Redonda", v: "Em V", polo: "Polo" };
export const CORES = ["#c8102e", "#e4002b", "#7b1e24", "#f26b21", "#f2c14e", "#ffd100", "#0a7d3b", "#0f5c4d", "#7ac143", "#0b3d91", "#1e5bc6", "#3aa7e0",
  "#6a1b9a", "#e75480", "#8b5a2b", "#111111", "#4a4a4a", "#8b9bb0", "#ffffff", "#f3e5c0"];
// imagens enviadas: públicas no bucket "escudos"; o nome do arquivo (clube-versão.webp) fica em escudo.img
export const URL_DOS_ESCUDOS = "https://gqsvsvrclyiroehymuot.supabase.co/storage/v1/object/public/escudos/";

const cor = (c, padrao) => /^#[0-9a-fA-F]{6}$/.test(c || "") ? c : padrao;
const esc = s => String(s || "").replace(/[&<>"]/g, "");
const luz = c => { const n = parseInt(c.slice(1), 16); return 0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255); };
const contraste = c => luz(c) > 150 ? "#111111" : "#ffffff";

// desenho de fundo num ladrilho de 100 x 100 (serve para o escudo e para a camisa)
function preenchimento(padrao, c1, c2, id) {
  const r = (x, y, w, h, c) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${c}"/>`;
  const fundo = r(0, 0, 100, 100, c1);
  const desenhos = {
    listras: () => [10, 30, 50, 70, 90].map(x => r(x, 0, 10, 100, c2)).join(""),
    horizontais: () => [10, 30, 50, 70, 90].map(y => r(0, y, 100, 10, c2)).join(""),
    faixa: () => r(0, 38, 100, 24, c2),
    faixaV: () => r(38, 0, 24, 100, c2),
    diagonal: () => `<path d="M-10 18 L18 -10 L110 82 L82 110 Z" fill="${c2}"/>`,
    metade: () => r(50, 0, 50, 100, c2),
    quartos: () => r(50, 0, 50, 50, c2) + r(0, 50, 50, 50, c2),
    xadrez: () => [0, 1, 2, 3, 4].flatMap(i => [0, 1, 2, 3, 4].map(k => (i + k) % 2 ? r(i * 20, k * 20, 20, 20, c2) : "")).join(""),
    cruz: () => r(40, 0, 20, 100, c2) + r(0, 34, 100, 20, c2),
    chevron: () => `<path d="M0 22 L50 58 L100 22 L100 44 L50 80 L0 44 Z" fill="${c2}"/>`,
    borda: () => "",
  };
  return `<pattern id="${id}" width="100" height="100" patternUnits="userSpaceOnUse">${fundo}${(desenhos[padrao] || (() => ""))()}</pattern>`;
}

// contorno de cada forma (em 100 x 100)
const CONTORNOS = {
  escudo: `<path d="M10 8 H90 V52 C90 76 70 90 50 96 C30 90 10 76 10 52 Z"`,
  classico: `<path d="M8 6 C24 12 36 4 50 10 C64 4 76 12 92 6 V46 C92 74 72 88 50 97 C28 88 8 74 8 46 Z"`,
  frances: `<path d="M10 6 H90 V62 C90 80 76 88 62 88 C56 88 52 92 50 97 C48 92 44 88 38 88 C24 88 10 80 10 62 Z"`,
  circulo: `<circle cx="50" cy="50" r="44"`,
  anel: `<circle cx="50" cy="50" r="44"`,
  losango: `<path d="M50 4 L94 50 L50 96 L6 50 Z"`,
  retangular: `<rect x="12" y="6" width="76" height="88" rx="10"`,
  oval: `<ellipse cx="50" cy="50" rx="36" ry="46"`,
};

// símbolos centrais, desenhados em volta de (50, 52), na cor c
const SIMB = {
  estrela: c => `<path d="M50 30 L56 45 L72 46 L59 56 L64 72 L50 63 L36 72 L41 56 L28 46 L44 45 Z" fill="${c}"/>`,
  bola: c => `<circle cx="50" cy="52" r="20" fill="#ffffff" stroke="#111" stroke-width="2"/><path d="M50 43 L58 49 L55 59 L45 59 L42 49 Z" fill="#111"/><path d="M50 32 V43 M58 49 L69 46 M55 59 L61 68 M45 59 L39 68 M42 49 L31 46" stroke="#111" stroke-width="2"/>`,
  coroa: c => `<path d="M30 64 L27 38 L39 50 L50 32 L61 50 L73 38 L70 64 Z" fill="${c}"/><rect x="30" y="66" width="40" height="6" fill="${c}"/>`,
  raio: c => `<path d="M56 28 L36 56 H49 L43 78 L65 46 H52 Z" fill="${c}"/>`,
  torre: c => `<path d="M34 74 V40 H38 V34 H44 V40 H47 V34 H53 V40 H56 V34 H62 V40 H66 V74 Z" fill="${c}"/><rect x="46" y="58" width="8" height="16" rx="4" fill="#00000055"/>`,
  trem: c => `<path d="M28 68 V46 H40 V36 H52 V46 H64 V40 H70 V68 Z" fill="${c}"/><rect x="42" y="38" width="8" height="7" fill="#00000055"/><circle cx="36" cy="70" r="5" fill="${c}"/><circle cx="50" cy="70" r="5" fill="${c}"/><circle cx="63" cy="70" r="5" fill="${c}"/><path d="M70 66 L76 72 H66 Z" fill="${c}"/>`,
  ancora: c => `<g fill="none" stroke="${c}" stroke-width="5" stroke-linecap="round"><circle cx="50" cy="32" r="5"/><path d="M50 37 V74 M40 46 H60 M32 60 C34 72 44 76 50 76 C56 76 66 72 68 60"/></g>`,
  leao: c => `<path d="M50 30 C36 30 30 40 32 50 C28 54 30 62 36 64 C38 72 44 76 50 76 C56 76 62 72 64 64 C70 62 72 54 68 50 C70 40 64 30 50 30 Z" fill="${c}"/><circle cx="43" cy="50" r="2.5" fill="#00000088"/><circle cx="57" cy="50" r="2.5" fill="#00000088"/><path d="M46 60 L50 64 L54 60 Z" fill="#00000088"/>`,
};

let serie = 0;
// escudo: { forma, padrao, cor1, cor2, cor3 (símbolo), simbolo, estrelas (0 a 5), img (imagem enviada) }
export function svgEscudo(e = {}, sigla = "", tamanho = 48) {
  if (e && typeof e.img === "string" && /^\d+-\d+\.(webp|png)$/.test(e.img)) // imagem enviada: o desenho fica guardado como reserva
    return `<img src="${URL_DOS_ESCUDOS}${e.img}" width="${tamanho}" height="${tamanho}" alt="Escudo" loading="lazy" style="object-fit:contain;vertical-align:middle">`;
  const c1 = cor(e.cor1, "#0b3d91"), c2 = cor(e.cor2, "#ffffff"), id = "pe" + (++serie), forma = CONTORNOS[e.forma] ? e.forma : "escudo";
  const traco = luz(c1) > 150 ? "#111" : "#e6edf3", estrelas = Math.max(0, Math.min(5, +e.estrelas || 0));
  const c3 = cor(e.cor3, null), simbolo = SIMB[e.simbolo] ? e.simbolo : e.simbolo === "nenhum" ? "nenhum" : "sigla";
  const yTexto = (forma === "escudo" || forma === "classico" || forma === "frances" ? 54 : 58) + (estrelas ? 4 : 0);
  const centro = simbolo === "nenhum" ? ""
    : simbolo === "sigla" ? `<text x="50" y="${yTexto}" text-anchor="middle" font-family="system-ui,sans-serif" font-weight="800" font-size="24" fill="${c3 || contraste(c1)}" stroke="${c1}" stroke-width="5" paint-order="stroke">${esc(sigla).slice(0, 3)}</text>`
    : `<g transform="translate(0 ${estrelas ? 4 : 0})" stroke-linejoin="round"><g stroke="${c1}" stroke-width="6" paint-order="stroke">${SIMB[simbolo](c3 || contraste(c1))}</g></g>`; // contorno na cor do fundo: o símbolo aparece em qualquer desenho
  const fileira = estrelas ? Array.from({ length: estrelas }, (_, k) => { const x = 50 + (k - (estrelas - 1) / 2) * 13;
    return `<path transform="translate(${x} 22) scale(0.3)" d="M0 -20 L6 -6 L21 -6 L9 3 L13 18 L0 9 L-13 18 L-9 3 L-21 -6 L-6 -6 Z" fill="${c3 || "#f2c14e"}" stroke="#111" stroke-width="3"/>`; }).join("") : "";
  const extra = e.padrao === "borda" ? `${CONTORNOS[forma]} fill="none" stroke="${c2}" stroke-width="9" clip-path="url(#c${id})"/>` : "";
  const aro = forma === "anel" ? `<circle cx="50" cy="50" r="40" fill="none" stroke="${c2}" stroke-width="7"/>` : "";
  return `<svg viewBox="0 0 100 100" width="${tamanho}" height="${tamanho}" role="img" aria-label="Escudo" style="vertical-align:middle"><defs>${preenchimento(e.padrao, c1, c2, id)}<clipPath id="c${id}">${CONTORNOS[forma]}/></clipPath></defs>
    ${CONTORNOS[forma]} fill="url(#${id})"/>${extra}${aro}${fileira}${centro}
    ${CONTORNOS[forma]} fill="none" stroke="${traco}" stroke-width="3"/></svg>`;
}

// uniforme: { padrao, cor1, cor2, calcao, gola, manga, meiao, golaTipo, reserva: { mesmos campos } }
export function svgUniforme(u = {}, tamanho = 48) {
  const c1 = cor(u.cor1, "#0b3d91"), c2 = cor(u.cor2, "#ffffff"), cal = cor(u.calcao, "#111111"), id = "pu" + (++serie);
  const manga = cor(u.manga, null), gola = cor(u.gola, c2 === c1 ? contraste(c1) : c2), meiao = cor(u.meiao, cal);
  const golas = {
    v: `<path d="M38 8 L50 22 L62 8" fill="none" stroke="${gola}" stroke-width="4" stroke-linejoin="round"/>`,
    polo: `<path d="M36 7 L44 18 L50 12 L56 18 L64 7 Z" fill="${gola}" stroke="#0f1720" stroke-width="1"/>`,
    redonda: `<path d="M37 8 C42 15 58 15 63 8" fill="none" stroke="${gola}" stroke-width="4"/>`,
  };
  return `<svg viewBox="0 0 100 120" width="${tamanho}" height="${tamanho * 1.2}" role="img" aria-label="Uniforme" style="vertical-align:middle"><defs>${preenchimento(u.padrao === "borda" ? "liso" : u.padrao, c1, c2, id)}</defs>
    <path d="M30 6 L10 18 L2 40 L18 46 L22 34 V30 Z" fill="${manga || `url(#${id})`}" stroke="#0f1720" stroke-width="2"/>
    <path d="M70 6 L90 18 L98 40 L82 46 L78 34 V30 Z" fill="${manga || `url(#${id})`}" stroke="#0f1720" stroke-width="2"/>
    <path d="M30 6 L22 30 V72 H78 V30 L70 6 C64 14 36 14 30 6 Z" fill="url(#${id})" stroke="#0f1720" stroke-width="2"/>
    ${golas[u.golaTipo] || golas.redonda}
    <path d="M23 74 H77 L80 98 H54 L50 88 L46 98 H20 Z" fill="${cal}" stroke="#0f1720" stroke-width="2"/>
    <rect x="25" y="100" width="17" height="19" rx="2" fill="${meiao}" stroke="#0f1720" stroke-width="1.5"/><rect x="58" y="100" width="17" height="19" rx="2" fill="${meiao}" stroke="#0f1720" stroke-width="1.5"/></svg>`;
}

// uniformes de um jogo: o visitante (ou o segundo, em campo neutro) troca para o reserva quando as camisas se parecem
export function uniformesDoJogo(casa = {}, fora = {}) {
  const parece = (a, b) => { const x = cor(a.cor1, "#0b3d91"), y = cor(b.cor1, "#0b3d91"), d = k => parseInt(x.slice(k, k + 2), 16) - parseInt(y.slice(k, k + 2), 16);
    return Math.hypot(d(1), d(3), d(5)) < 110; };
  const reserva = fora.reserva && typeof fora.reserva === "object" ? fora.reserva : null;
  return [casa, reserva && parece(casa, fora) ? reserva : fora];
}

export function visualAleatorio(rng) {
  const c1 = rng.pick(CORES); let c2 = rng.pick(CORES); while (c2 === c1) c2 = rng.pick(CORES);
  const padrao = rng.pick(["liso", "listras", "faixa", "metade", "horizontais", "diagonal"]);
  return { escudo: { forma: rng.pick(Object.keys(FORMAS)), padrao, cor1: c1, cor2: c2 },
    uniforme: { padrao, cor1: c1, cor2: c2, calcao: rng.pick([c1, c2, "#111111", "#ffffff"]), golaTipo: rng.pick(Object.keys(GOLAS)), reserva: { padrao: "liso", cor1: c2, cor2: c1, calcao: c2 } } };
}
