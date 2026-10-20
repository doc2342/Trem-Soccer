// Camisa e uniforme (desenho de 20/10/2026, protótipo em prototipos/camisa_v2): silhueta de camisa de verdade, contorno fino, volume por sombra.
// u: { padrao, cor1, cor2, cor3 (opcional: filetes e terceira cor), gola, golaTipo, manga, manga2, textura, friso/corFriso (ombro),
//      frisoCalcao/corFrisoCalcao, frisoMeiao/corFrisoMeiao, calcao, meiao, chuteira, marca (url da arte do patrocínio), escudoSvg (já posicionado) }
// O src/escudo.js (svgUniforme) prepara o escudo no peito e a arte do patrocínio e chama este.
const hexOk = c => /^#[0-9a-fA-F]{6}$/.test(c || "");
const cor = (c, p) => hexOk(c) ? c : p;
const luz = c => { const n = parseInt(c.slice(1), 16); return 0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255); };
const contraste = c => luz(c) > 150 ? "#111111" : "#ffffff";
let serie = 0;

// peças em 200 x 220
const TRONCO = "M76 12 C68 17 54 22 44 26 C49 44 51 62 50 82 C49 120 50 168 51 206 Q100 214 149 206 C150 168 151 120 150 82 C149 62 151 44 156 26 C146 22 132 17 124 12 C116 23 84 23 76 12 Z";
const MANGA_E = "M44 26 C34 29 26 35 22 44 L4 90 C14 97 26 102 38 104 L50 82 C51 62 49 44 44 26 Z";
const MANGA_D = "M156 26 C166 29 174 35 178 44 L196 90 C186 97 174 102 162 104 L150 82 C149 62 151 44 156 26 Z";
const PUNHO_E = "M4 90 C14 97 26 102 38 104 L40.5 97 C28 95 17 90 6.5 83.5 Z";
const PUNHO_D = "M196 90 C186 97 174 102 162 104 L159.5 97 C172 95 183 90 193.5 83.5 Z";

const R = (x, y, w, h, c) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${c}"/>`;
const faixas = (n, f) => Array.from({ length: n }, (_, i) => f(i - (n - 1) / 2, i)).join("");
// desenhos no espaço da camisa (200 x 220); lisa: true = mangas na cor principal (o desenho não passa para elas)
export const DESENHOS = {
  liso: { nome: "Liso", d: () => "" },
  listras: { nome: "Listras verticais", d: (c2, c3) => faixas(7, (k, i) => R(100 + k * 28 - 7, 0, 14, 220, c3 && i % 2 ? c3 : c2)) },
  listrasFinas: { nome: "Listras finas", d: (c2) => faixas(11, k => R(100 + k * 16 - 1.2, 0, 2.4, 220, c2)) },
  horizontais: { nome: "Listras horizontais", d: (c2, c3) => faixas(7, (k, i) => R(0, 116 + k * 32 - 8, 200, 16, c3 && i % 2 ? c3 : c2)) },
  faixa: { nome: "Faixa no peito", lisa: true, d: (c2, c3) => c3 ? R(0, 84, 200, 16, c2) + R(0, 100, 200, 16, c3) : R(0, 84, 200, 36, c2) },
  faixaV: { nome: "Faixa vertical", lisa: true, d: (c2, c3) => R(72, 0, 56, 220, c2) + (c3 ? R(64, 0, 8, 220, c3) + R(128, 0, 8, 220, c3) : "") },
  diagonal: { nome: "Faixa diagonal", lisa: true, d: (c2, c3) => `<g transform="rotate(-32 100 110)">${c3 ? R(78, -120, 6, 460, c3) + R(116, -120, 6, 460, c3) : ""}${R(84, -120, 32, 460, c2)}</g>` },
  diagonal2: { nome: "Faixa diagonal (invertida)", lisa: true, d: (c2, c3) => `<g transform="rotate(32 100 110)">${c3 ? R(78, -120, 6, 460, c3) + R(116, -120, 6, 460, c3) : ""}${R(84, -120, 32, 460, c2)}</g>` },
  diagonais: { nome: "Listras diagonais", d: (c2, c3) => `<g transform="rotate(28 100 110)">${faixas(11, (k, i) => R(100 + k * 30 - 7, -120, 14, 460, c3 && i % 2 ? c3 : c2))}</g>` },
  metade: { nome: "Metade", d: (c2) => R(100, 0, 100, 220, c2) },
  metadeCruzada: { nome: "Metade, mangas cruzadas", cruzada: true, d: (c2) => R(100, 0, 100, 220, c2) },
  quartos: { nome: "Quartos", d: (c2) => R(100, 0, 100, 110, c2) + R(0, 110, 100, 110, c2) },
  xadrez: { nome: "Xadrez", d: (c2) => Array.from({ length: 11 }, (_, i) => Array.from({ length: 11 }, (_, k) => (i + k) % 2 ? R(1 + i * 22 - 22, k * 22 - 4, 22, 22, c2) : "").join("")).join("") },
  cruz: { nome: "Cruz", lisa: true, d: (c2) => R(80, 0, 40, 220, c2) + R(0, 86, 200, 40, c2) },
  chevron: { nome: "Chevron (V)", lisa: true, d: (c2, c3) => c3
    ? `<path d="M30 30 L100 104 L170 30" fill="none" stroke="${c2}" stroke-width="15"/><path d="M30 52 L100 126 L170 52" fill="none" stroke="${c3}" stroke-width="15"/>`
    : `<path d="M30 36 L100 112 L170 36" fill="none" stroke="${c2}" stroke-width="24"/>` },
  laterais: { nome: "Laterais", lisa: true, d: (c2) => R(44, 78, 15, 150, c2) + R(141, 78, 15, 150, c2) },
};

// textura tom sobre tom, por cima do desenho (escurece de leve: aparece em qualquer cor)
export const TEXTURAS = {
  nenhuma: { nome: "Nenhuma", p: null },
  risca: { nome: "Risca fina", p: `width="5" height="10"><rect width="1.6" height="10" fill="#000" fill-opacity=".09"/>` },
  tom: { nome: "Listras tom sobre tom", p: `width="14" height="10"><rect width="7" height="10" fill="#000" fill-opacity=".07"/>` },
  pontos: { nome: "Pontilhado", p: `width="6" height="6"><circle cx="3" cy="3" r="1.1" fill="#000" fill-opacity=".11"/>` },
  ondas: { nome: "Ondas", p: `width="24" height="9"><path d="M0 4.5 Q6 0 12 4.5 T24 4.5" fill="none" stroke="#000" stroke-opacity=".06" stroke-width="1.4"/>` },
  losangos: { nome: "Losangos", p: `width="16" height="16"><path d="M8 0 L16 8 L8 16 L0 8 Z" fill="none" stroke="#000" stroke-opacity=".09" stroke-width="1.4"/>` },
};
export const FRISOS = { nenhum: "Nenhum", um: "Um friso", tres: "Três frisos" };

function golaSvg(tipo, g, c1, id) {
  const dentro = `<path d="M78 12.5 C88 7 112 7 122 12.5 C114 21 86 21 78 12.5 Z" fill="${c1}"/><path d="M78 12.5 C88 7 112 7 122 12.5 C114 21 86 21 78 12.5 Z" fill="#000" fill-opacity=".38"/>`;
  const sombra = `filter="url(#s${id})"`;
  const canelura = `<path d="M75.5 11 C83.5 23.8 116.5 23.8 124.5 11" fill="none" stroke="#fff" stroke-opacity=".22" stroke-width=".6"/>`;
  if (tipo === "v") return `<path d="M81 11 L100 30 L119 11 C112 6 88 6 81 11 Z" fill="${c1}"/><path d="M81 11 L100 30 L119 11 C112 6 88 6 81 11 Z" fill="#000" fill-opacity=".38"/>
    <path d="M80 11 C88 6.5 112 6.5 120 11" fill="none" stroke="${g}" stroke-width="2.6"/>
    <path d="M74.5 10.5 L100 37 L125.5 10.5 L119 11 L100 30 L81 11 Z" fill="${g}" ${sombra}/><path d="M76 11.4 L100 35.5 L124 11.4" fill="none" stroke="#fff" stroke-opacity=".25" stroke-width=".7"/><path d="M78 11 L100 33 L122 11" fill="none" stroke="#000" stroke-opacity=".14" stroke-width=".6"/>`;
  if (tipo === "polo") return `${dentro}<path d="M96.5 22 H103.5 V52 H96.5 Z" fill="#000" fill-opacity=".1"/><path d="M100 22 V52" stroke="#000" stroke-opacity=".25" stroke-width=".8"/>
    <circle cx="100" cy="33" r="1.5" fill="${g}"/><circle cx="100" cy="44" r="1.5" fill="${g}"/>
    <path d="M73 10 C86 2 114 2 127 10 L123 13 C112 7.5 88 7.5 77 13 Z" fill="${g}"/>
    <path d="M73 10 C78 16 84 20 100 23 L91 39 C84 30 77 20 73 10 Z" fill="${g}" ${sombra}/><path d="M127 10 C122 16 116 20 100 23 L109 39 C116 30 123 20 127 10 Z" fill="${g}" ${sombra}/>`;
  return `${dentro}<path d="M78 12.5 C88 6.5 112 6.5 122 12.5" fill="none" stroke="${g}" stroke-width="3.6"/><path d="M78 12.5 C88 6.5 112 6.5 122 12.5" fill="none" stroke="#000" stroke-opacity=".25" stroke-width="3.6"/>
    <path d="M73.5 10.5 C82 25.5 118 25.5 126.5 10.5 L121.5 12.2 C114 20 86 20 78.5 12.2 Z" fill="${g}" ${sombra}/>${canelura}
    <path d="M76 11.4 C84 22.6 116 22.6 124 11.4" fill="none" stroke="#000" stroke-opacity=".14" stroke-width=".6"/>`;
}

// camisa sozinha (completo = false) ou uniforme inteiro (com calção e meião)
export function svgCamisa(u = {}, largura = 200, completo = false) {
  const id = "cv" + (++serie), des = DESENHOS[u.padrao] || DESENHOS.liso;
  const c1 = cor(u.cor1, "#0b3d91"), c2 = cor(u.cor2, "#ffffff"), c3 = cor(u.cor3, null);
  const g = cor(u.gola, c2 === c1 ? contraste(c1) : c2);
  const mE = cor(u.manga, des.cruzada ? c2 : null), mD = cor(u.manga2, des.cruzada && !hexOk(u.manga) ? c1 : mE);
  const desenho = des.d(c2, c3);
  const tex = TEXTURAS[u.textura] ? TEXTURAS[u.textura].p : null, fc = cor(u.corFriso, g);
  const linha = (dx, dy, w) => `<path d="M${79 + dx} ${12.6 + dy} C${69 + dx} ${18 + dy} ${55 + dx} ${23 + dy} ${44 + dx} ${27 + dy} C${34 + dx} ${30 + dy} ${26 + dx} ${36 + dy} ${22 + dx} ${45 + dy} L${7 + dx} ${83 + dy}" fill="none" stroke="${fc}" stroke-width="${w}"/>`;
  const frisos = u.friso === "tres" ? linha(1, 3, 2) + linha(2.6, 7, 2) + linha(4.2, 11, 2) : u.friso === "um" ? linha(1.6, 4.5, 3) : "";
  // calção e meião: sem escolha, um friso na cor da gola (como hoje); "nenhum" tira
  const fCal = { tipo: FRISOS[u.frisoCalcao] ? u.frisoCalcao : "um", cor: cor(u.corFrisoCalcao, null) }, fMei = { tipo: FRISOS[u.frisoMeiao] ? u.frisoMeiao : "um", cor: cor(u.corFrisoMeiao, null) };
  const fundo = (clip, manga) => manga ? `<path d="${clip}" fill="${manga}"/>` : `<g clip-path="url(#${clip === TRONCO ? "t" : clip === MANGA_E ? "e" : "d"}${id})">${R(0, 0, 200, 220, c1)}${des.lisa && clip !== TRONCO ? "" : desenho}</g>`;
  const cal = cor(u.calcao, "#ffffff"), mei = cor(u.meiao, cal), fr = g === cal ? contraste(cal) : g;
  const alto = completo ? 338 : 220;
  return `<svg viewBox="0 0 200 ${alto}" width="${largura}" height="${largura * alto / 200}" role="img" aria-label="Uniforme" style="vertical-align:middle"><defs>
    <clipPath id="t${id}"><path d="${TRONCO}"/></clipPath><clipPath id="e${id}"><path d="${MANGA_E}"/></clipPath><clipPath id="d${id}"><path d="${MANGA_D}"/></clipPath>
    <linearGradient id="v${id}" gradientUnits="userSpaceOnUse" x1="44" x2="156" y1="0" y2="0"><stop offset="0" stop-color="#000" stop-opacity=".26"/><stop offset=".14" stop-color="#000" stop-opacity=".06"/>
      <stop offset=".38" stop-color="#fff" stop-opacity=".10"/><stop offset=".55" stop-color="#fff" stop-opacity="0"/><stop offset=".84" stop-color="#000" stop-opacity=".07"/><stop offset="1" stop-color="#000" stop-opacity=".28"/></linearGradient>
    <linearGradient id="h${id}" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".08"/><stop offset=".5" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".12"/></linearGradient>
    <linearGradient id="m${id}" x1="0" x2="1" y1="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".12"/><stop offset=".6" stop-color="#000" stop-opacity=".05"/><stop offset="1" stop-color="#000" stop-opacity=".28"/></linearGradient>
    <linearGradient id="n${id}" x1="1" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".06"/><stop offset=".6" stop-color="#000" stop-opacity=".1"/><stop offset="1" stop-color="#000" stop-opacity=".34"/></linearGradient>
    ${tex ? `<pattern id="x${id}" patternUnits="userSpaceOnUse" ${tex}</pattern>` : ""}
    <filter id="b${id}" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="2.2"/></filter>
    <filter id="s${id}" x="-10%" y="-10%" width="120%" height="140%"><feDropShadow dx="0" dy="1.2" stdDeviation="1" flood-opacity=".35"/></filter></defs>
    ${completo ? calcaoEMeiao(cal, mei, fCal.cor || fr, fCal.tipo, fMei.cor || (fr === mei ? contraste(mei) : fr), fMei.tipo, cor(u.chuteira, "#111111"), id) : ""}
    ${fundo(MANGA_E, mE)}<path d="${MANGA_E}" fill="url(#m${id})"/>
    ${fundo(MANGA_D, mD)}<path d="${MANGA_D}" fill="url(#n${id})"/>
    <path d="${PUNHO_E}" fill="${g}"/><path d="${PUNHO_D}" fill="${g}"/>${c3 ? `<path d="M5.6 86.6 C16 93.4 27 98 39.2 100.4" fill="none" stroke="${c3}" stroke-width="1.8"/><path d="M194.4 86.6 C184 93.4 173 98 160.8 100.4" fill="none" stroke="${c3}" stroke-width="1.8"/>` : ""}
    ${fundo(TRONCO)}
    ${tex ? `<g clip-path="url(#t${id})"><rect width="200" height="220" fill="url(#x${id})"/></g><g clip-path="url(#e${id})"><rect width="200" height="220" fill="url(#x${id})"/></g><g clip-path="url(#d${id})"><rect width="200" height="220" fill="url(#x${id})"/></g>` : ""}
    ${frisos ? [0, 1].map(lado => `<g${lado ? ' transform="translate(200 0) scale(-1 1)"' : ""}>${["t", "e"].map(p => `<g clip-path="url(#${p}${id})">${frisos}</g>`).join("")}</g>`).join("") : ""}
    <g clip-path="url(#t${id})"><rect width="200" height="220" fill="url(#v${id})"/><rect width="200" height="220" fill="url(#h${id})"/>
      <g filter="url(#b${id})" fill="none" stroke-linecap="round"><path d="M53 88 Q66 104 63 128" stroke="#000" stroke-opacity=".11" stroke-width="5"/><path d="M147 88 Q134 104 137 128" stroke="#000" stroke-opacity=".11" stroke-width="5"/>
        <path d="M60 70 Q72 74 78 86" stroke="#fff" stroke-opacity=".14" stroke-width="5"/><path d="M76 192 Q100 200 126 194" stroke="#000" stroke-opacity=".07" stroke-width="5"/><path d="M118 140 Q126 160 122 182" stroke="#000" stroke-opacity=".05" stroke-width="6"/></g></g>
    <path d="M44 26 C49 44 51 62 50 82 M156 26 C151 44 149 62 150 82" fill="none" stroke="#000" stroke-opacity=".22" stroke-width="1"/>
    ${golaSvg(u.golaTipo, g, c1, id)}
    ${u.escudoSvg || ""}
    ${u.marca ? `<image href="${u.marca}" x="58" y="${des === DESENHOS.faixa ? 84 : 82}" width="84" height="${des === DESENHOS.faixa ? 36 : 44}" preserveAspectRatio="xMidYMid meet"/>` : ""}
    <path d="M76 12 C68 17 54 22 44 26 C34 29 26 35 22 44 L4 90 C14 97 26 102 38 104 L50 82 C49 120 50 168 51 206 Q100 214 149 206 C150 168 151 120 150 82 L162 104 C174 102 186 97 196 90 L178 44 C174 35 166 29 156 26 C146 22 132 17 124 12" fill="none" stroke="#000" stroke-opacity=".35" stroke-width="1.2" stroke-linejoin="round"/></svg>`;
}

function calcaoEMeiao(cal, mei, fr, tipoCal, frMei, tipoMei, chu, id) {
  // o calção começa por baixo da barra da camisa (y 196); o meião logo abaixo, como num uniforme estendido
  const C = "M50 196 Q100 200 150 196 L157 270 Q133 275 108 271 L100 248 L92 271 Q67 275 43 270 Z";
  const meiao = x => `M${x} 276 H${x + 30} V322 H${x} Z`;
  // chuteira de frente: bico arredondado, sola mais escura e um brilho
  const bota = x => `M${x - 1} 318 H${x + 31} Q${x + 36} 328 ${x + 33} 334 Q${x + 15} 337 ${x - 3} 334 Q${x - 6} 328 ${x - 1} 318 Z`;
  const chuteira = x => `<path d="${bota(x)}" fill="${chu}"/><path d="${bota(x)}" fill="url(#w${id})"/><path d="M${x - 3} 333 Q${x + 15} 336.5 ${x + 33} 333" fill="none" stroke="#000" stroke-opacity=".45" stroke-width="2.4"/>
    <path d="M${x + 4} 322 Q${x + 9} 320.5 ${x + 14} 322" fill="none" stroke="#fff" stroke-opacity=".35" stroke-width="1.4" stroke-linecap="round"/><path d="${bota(x)}" fill="none" stroke="#000" stroke-opacity=".4" stroke-width="1.2" stroke-linejoin="round"/>`;
  const v = `<linearGradient id="w${id}" gradientUnits="userSpaceOnUse" x1="43" x2="157" y1="0" y2="0"><stop offset="0" stop-color="#000" stop-opacity=".24"/><stop offset=".38" stop-color="#fff" stop-opacity=".08"/><stop offset=".6" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".26"/></linearGradient>`;
  return `<defs>${v}<clipPath id="c${id}"><path d="${C}"/></clipPath></defs><path d="${C}" fill="${cal}"/>
    <g clip-path="url(#c${id})"><rect x="0" y="190" width="200" height="90" fill="url(#w${id})"/>
      ${tipoCal === "nenhum" ? "" : (tipoCal === "tres" ? [-5, 0, 5] : [0]).map(o => `<path d="M${53 + o} 204 L${45 + o} 269 M${147 - o} 204 L${155 - o} 269" stroke="${fr}" stroke-width="${tipoCal === "tres" ? 2.2 : 4}"/>`).join("")}<path d="M100 248 L100 214" stroke="#000" stroke-opacity=".12" stroke-width="2"/></g>
    <path d="${C}" fill="none" stroke="#000" stroke-opacity=".35" stroke-width="1.2" stroke-linejoin="round"/>
    ${[61, 109].map(x => `<path d="${meiao(x)}" fill="${mei}"/>${tipoMei === "nenhum" ? "" : (tipoMei === "tres" ? [280, 285, 290] : [282]).map(y => `<rect x="${x}" y="${y}" width="30" height="${tipoMei === "tres" ? 2.5 : 5}" fill="${frMei}"/>`).join("")}<path d="${meiao(x)}" fill="url(#w${id})"/><path d="${meiao(x)}" fill="none" stroke="#000" stroke-opacity=".35" stroke-width="1.2"/>${chuteira(x)}`).join("")}`;
}
