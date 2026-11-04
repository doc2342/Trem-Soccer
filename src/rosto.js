// Rosto do jogador em SVG: caricatura vetorial montada de uma biblioteca de partes (03/11), com o acabamento moderno que o dono escolheu em 04/11:
// luz da esquerda em planos (luz, meio-tom, sombra, sombra funda), contorno fino e na cor da pele por dentro do rosto, olhos com órbita,
// nariz em planos, lábios com volume, cabeça um pouco menor, pescoço e ombros mais fortes. op.duo: o retrato em tons de cinza (teste, não usado).
// O rosto sai de um sorteio próprio, semeado pelo id (ou nome completo): o mesmo jogador tem sempre o mesmo rosto.
// Todos os números são sorteados sempre na mesma ordem; a idade só decide os cortes (barba, entradas, careca, grisalho),
// para o jogador envelhecer sem trocar de cara. Spec: docs/superpowers/specs/2026-11-03-caricaturas-superprompt.md
import { criarRng } from "./rng.js";
import { DESENHOS } from "./camisa.js";

const TRACO = "#1d140f", CX = 256;
// pele: [base, sombra]
export const PELES = [
  ["#f6d3b9", "#e2ab8c"], ["#efbe99", "#d49673"], ["#dda37b", "#bb7d56"], ["#c4875b", "#9f6541"],
  ["#9d633e", "#7b4629"], ["#70432a", "#532d1a"], ["#56311d", "#3e2213"],
];
// mistura de tons por país (do mais claro ao mais escuro), fiel ao que se vê em campo em cada liga
const PESO_PELE = {
  Brasil: [6, 16, 22, 20, 16, 12, 8], Argentina: [18, 34, 28, 14, 4, 1, 1], Uruguai: [18, 34, 26, 14, 5, 2, 1],
  Chile: [8, 26, 34, 24, 6, 1, 1], "Colômbia": [4, 14, 26, 26, 14, 10, 6],
};
export const CORES_CABELO = { preto: "#1f1711", castEsc: "#3a2518", castanho: "#5e3a22", castClaro: "#8a5a34", loiro: "#c9a061", ruivo: "#a5552a" };
export const GRISALHO = "#aaa59f";
const IRIS = { escuro: "#3a2414", castanho: "#6b4425", mel: "#8a6a30", verde: "#5c7a4a", azul: "#4f7fa8" };

// cortes por textura do fio
const CORTES = {
  lisa: { curto: 4, lateral: 4, topete: 4, franja: 2, raspado: 1, longo: 0.6, coque: 0.6 },
  ondulada: { curto: 4, lateral: 3, topete: 3, franja: 2, raspado: 1, coque: 0.8, cachos: 1 },
  cacheada: { cachos: 6, cachosAltos: 3, raspado: 1.5, curto: 1 },
  crespa: { raspado: 4, crespoCurto: 5, black: 1.5, twists: 2 },
};

const hex = c => (c.length === 4 ? "#" + [...c.slice(1)].map(d => d + d).join("") : c).match(/[0-9a-f]{2}/gi).map(h => parseInt(h, 16)); // aceita #abc e #aabbcc
export const mistura = (a, b, t) => "#" + hex(a).map((v, i) => Math.round(v + (hex(b)[i] - v) * t).toString(16).padStart(2, "0")).join("");
const n = v => +v.toFixed(1);
const L = x => n(CX - x), R = x => n(CX + x);
const hash = (s, sal) => [...String(s)].reduce((h, c) => Math.imul(h, 31) + c.charCodeAt(0) | 0, sal);
const peso = (rng, obj) => rng.pickPeso(Object.keys(obj), Object.values(obj));

// Os traços do jogador: tudo o que é sorteado, num objeto só (o desenho não sorteia nada de importante)
export function tracos(j) {
  const rng = criarRng(hash(j.id ?? j.nome_completo ?? j.nome, 777)), u = () => rng.n();
  const idade = j.idade ?? 25;
  const pele = rng.pickPeso([0, 1, 2, 3, 4, 5, 6], PESO_PELE[j.pais] || PESO_PELE.Brasil);
  const textura = peso(rng, pele >= 5 ? { crespa: 80, cacheada: 20 } : pele === 4 ? { crespa: 55, cacheada: 35, ondulada: 10 }
    : pele >= 2 ? { lisa: 30, ondulada: 35, cacheada: 25, crespa: 10 } : { lisa: 55, ondulada: 35, cacheada: 10 });
  const corCabelo = peso(rng, pele >= 4 ? { preto: 90, castEsc: 10 } : pele >= 2 ? { preto: 45, castEsc: 35, castanho: 17, castClaro: 3 }
    : { preto: 14, castEsc: 30, castanho: 28, castClaro: 15, loiro: 11, ruivo: 2 });
  const iris = pele <= 1 ? peso(rng, { escuro: 30, castanho: 35, mel: 12, verde: 10, azul: 13 }) : pele <= 3 ? peso(rng, { escuro: 50, castanho: 40, mel: 8, verde: 2 }) : "escuro";
  const corte = peso(rng, CORTES[textura]);
  const uCareca = u(), uEntrada = u(), uGrisalho = u(), uBarba = u(), uSorriso = u();
  const g = {
    pele, textura, corCabelo, iris, corte, idade,
    hw: 101 + u() * 13, top: 94 + u() * 10, mand: 0.7 + u() * 0.24, queixoY: 342 + u() * 26, queixoL: 12 + u() * 32,
    pescoco: 0.52 + u() * 0.11,
    olhoD: 38 + u() * 8, olhoY: 236 + u() * 8 - 4, olhoL: 34 + u() * 6, olhoA: 10 + u() * 6,
    sobrA: u() * 8 - 2, sobrE: 4 + u() * 8, sobrInc: u() * 8 - 3,
    narizY: 288 + u() * 10, narizL: 17 + u() * 15, bocaY: 326 + u() * 6, bocaL: 23 + u() * 15,
    volume: u(), lado: u() < 0.5 ? -1 : 1, franjaDentes: u(), detalhe: rng.int(1, 1e9), bochecha: 0.9 + u() * 0.16, testaL: 0.7 + u() * 0.16, palpebra: u() < 0.3, inclOlho: u() * 7 - 3, labio: u(),
    uNovo: u(), uPlatinado: u(), uRisca: u(), uBrinco: u(), uFaixa: u(), uSardas: u(), uCicatriz: u(),
  };
  // a idade decide os cortes: careca e entradas a partir dos 29/27, grisalho a partir dos 33, barba conforme a idade
  g.careca = uCareca < Math.max(0, (idade - 29) * 0.025) || (textura === "crespa" && uCareca > 0.96);
  g.entrada = uEntrada < Math.max(0, (idade - 26) * 0.06) ? 6 + uEntrada * 120 : 0;
  g.grisalho = Math.max(0, Math.min(0.75, (idade - 32) * 0.1 - uGrisalho * 0.4));
  const barbas = idade <= 20 ? { nenhuma: 70, sombra: 25, bigode: 5 } : idade <= 26 ? { nenhuma: 35, sombra: 30, curta: 18, cavanhaque: 10, bigode: 4, cheia: 3 }
    : { nenhuma: 22, sombra: 25, curta: 25, cheia: 15, cavanhaque: 10, bigode: 3 };
  let a = uBarba * Object.values(barbas).reduce((s, v) => s + v, 0);
  g.barba = Object.keys(barbas).find(k => (a -= barbas[k]) < 0) || "nenhuma";
  // moicano e tranças nagô; platinado (mais entre os novos); risca no degradê; brinco; faixa no cabelo comprido; sardas na pele clara; cicatriz na sobrancelha
  if (g.uNovo < 0.07) g.corte = "moicano"; else if (g.uNovo < 0.15 && (textura === "crespa" || textura === "cacheada")) g.corte = "trancas";
  g.platinado = g.uPlatinado < (idade <= 26 ? 0.09 : 0.03) && pele >= 2 && !["longo", "coque", "trancas"].includes(g.corte);
  g.risca = g.uRisca < 0.14; g.brinco = g.uBrinco < 0.07 ? 2 : g.uBrinco < 0.2 ? 1 : 0; g.faixa = g.uFaixa < 0.3;
  g.sardas = pele <= 1 && g.uSardas < 0.3; g.cicatriz = g.uCicatriz < 0.06;
  g.sorriso = uSorriso < 0.5 ? "dentes" : uSorriso < 0.78 ? "leve" : "fechada";
  return g;
}

let serie = 0;
// opcoes: camisa, camisa2, gola (cores) e padrao "liso" | "listras" | "mangas"; decote "redondo" | "v"
export function rostoSVG(j, op = {}) {
  const g = tracos(j), rng = criarRng(g.detalhe), id = `ro${++serie}`;
  const cinza = v => { const h = Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0"); return "#" + h + h + h; };
  const lum = c => { const [r, gg, b] = hex(c); return 0.299 * r + 0.587 * gg + 0.114 * b; };
  const [pele, sombra] = op.duo ? [cinza(238 - g.pele * 25), cinza(156 - g.pele * 19)] : PELES[g.pele];
  let natural = g.grisalho ? mistura(CORES_CABELO[g.corCabelo], GRISALHO, g.grisalho) : CORES_CABELO[g.corCabelo];
  if (op.duo) natural = cinza(18 + Math.max(0, lum(natural) - 40) * 0.9);
  const cab = op.duo ? (g.platinado ? cinza(225) : natural) : g.platinado ? "#e8d9ad" : natural; // platinado: a sobrancelha continua na cor de verdade
  const funda = mistura(sombra, "#000", 0.34), luz = mistura(pele, "#ffffff", 0.3), linha = mistura(sombra, "#000", 0.5), labio = op.duo ? mistura(sombra, "#000", 0.1) : mistura(sombra, "#8a3b2e", 0.25);
  const cabSombra = mistura(cab, "#000", 0.35), cabLuz = mistura(cab, "#fff", 0.34), sobr = mistura(natural, "#000", g.corCabelo === "loiro" ? 0.35 : 0.15);
  const camisa = op.camisa || "#d2232a", camisa2 = op.camisa2 || "#ffffff", gola = op.gola || camisa2, padrao = op.padrao || "liso";
  const { hw, top, queixoY: qy, queixoL: ql } = g, jw = hw * g.mand, nw = hw * g.pescoco * 1.14, my = Math.min(g.bocaY, qy - 34), mw = g.bocaL, ny = Math.min(g.narizY, my - 30), nl = g.narizL; // rosto curto: a boca sobe para não colar no queixo
  const k = op.lista ? 1.8 : 1, tI = (w = 2) => `stroke="${linha}" stroke-width="${n(w * k)}" stroke-linejoin="round" stroke-linecap="round"`, tr = (w = 3) => `stroke="${TRACO}" stroke-width="${n(w * k)}" stroke-linejoin="round" stroke-linecap="round"`;
  const out = [];

  const cabeca = `M${CX},${n(top)} C${R(hw * g.testaL)},${n(top)} ${R(hw)},${n(top + 45)} ${R(hw)},235 C${R(hw * g.bochecha)},272 ${R(jw)},292 ${R(jw * 0.92)},318 `
    + `C${R(jw * 0.8)},${n(qy - 12)} ${R(ql + 14)},${n(qy)} ${R(ql)},${n(qy)} L${L(ql)},${n(qy)} C${L(ql + 14)},${n(qy)} ${L(jw * 0.8)},${n(qy - 12)} ${L(jw * 0.92)},318 `
    + `C${L(jw)},292 ${L(hw * g.bochecha)},272 ${L(hw)},235 C${L(hw)},${n(top + 45)} ${L(hw * g.testaL)},${n(top)} ${CX},${n(top)} Z`;

  // --- cabelo: contorno de fora (arco sobre a cabeça, com ondas para os cachos) e a linha da testa
  const yT = 208; // altura da têmpora
  const arco = (folga, vol, yIni = yT, pts = 16) => {
    const rx = hw + folga, ry = 235 - top + vol, a0 = Math.asin(Math.min(0.99, (235 - yIni) / ry)), l = [];
    for (let i = 0; i <= pts; i++) { const t = Math.PI + a0 + i / pts * (Math.PI - 2 * a0); const c = Math.cos(t), sn = Math.sin(t); l.push([CX + rx * Math.sign(c) * Math.abs(c) ** 0.8, 235 + ry * Math.sign(sn) * Math.abs(sn) ** 0.8]); }
    return l;
  };
  const ondas = (pts, b) => {
    let d = `M${n(pts[0][0])},${n(pts[0][1])}`;
    for (let i = 1; i < pts.length; i++) {
      const [x0, y0] = pts[i - 1], [x1, y1] = pts[i], mx = (x0 + x1) / 2, mY = (y0 + y1) / 2, dx = mx - CX, dy = mY - 235, h = Math.hypot(dx, dy) || 1, k = b * (0.7 + 0.6 * rng.n());
      d += b > 0 ? ` Q${n(mx + dx / h * k)},${n(mY + dy / h * k)} ${n(x1)},${n(y1)}` : b < 0 ? ` L${n(mx - dx / h * k * 0.4 + (x1 - x0) * 0.25)},${n(mY - dy / h * k * 0.4 + (y1 - y0) * 0.25)} L${n(x1)},${n(y1)}` : ` L${n(x1)},${n(y1)}`;
    }
    return d;
  };
  const yH = 158 + (g.corte === "raspado" ? 4 : 0); // linha da testa
  const e = g.entrada;
  const testa = forma => forma === "franja"
    ? ` L${R(hw - 3)},${yT + 4} C${R(hw * 0.85)},${yH + 6} ${n(CX + g.lado * hw * 0.35)},${yH + 30} ${n(CX - g.lado * hw * 0.1)},${yH + 22} C${n(CX - g.lado * hw * 0.45)},${yH + 16} ${L(hw * 0.85)},${yH + 4} ${L(hw - 3)},${yT + 4}`
    : ` L${R(hw - 3)},${yT + 4} C${R(hw * 0.95)},${n(yH - e * 0.2)} ${R(hw * 0.72)},${n(yH - e)} ${R(hw * 0.45)},${n(yH - e * 0.9)} C${R(hw * 0.25)},${n(yH - e * 0.2)} ${R(10)},${yH} ${CX},${yH}`
      + ` C${L(10)},${yH} ${L(hw * 0.25)},${n(yH - e * 0.2)} ${L(hw * 0.45)},${n(yH - e * 0.9)} C${L(hw * 0.72)},${n(yH - e)} ${L(hw * 0.95)},${n(yH - e * 0.2)} ${L(hw - 3)},${yT + 4}`;
  const fios = (qtd, curvo, corFio = cabSombra) => { // textura dentro do cabelo
    let d = "";
    for (let i = 0; i < qtd; i++) {
      const x = CX + (rng.n() * 2 - 1) * hw * 0.75, y = top + 8 + rng.n() * (yH - top - 14);
      if (curvo) { const r = 4 + rng.n() * 3; d += `M${n(x - r)},${n(y)} a${n(r)},${n(r)} 0 0 1 ${n(2 * r)},0 `; }
      else { const s = g.lado * (10 + rng.n() * 14); d += `M${n(x)},${n(y + 12)} q${n(s * 0.4)},-14 ${n(s)},-24 `; }
    }
    return `<path d="${d}" fill="none" stroke="${corFio}" stroke-width="2.4" stroke-linecap="round"/>`;
  };
  const brilho = (vol) => `<path d="${ondas(arco(-14, vol - 12, 175, 8), 0)}" fill="none" stroke="${cabLuz}" stroke-width="5" stroke-linecap="round" opacity="0.55"/>`;

  let atras = "", frente = "";
  const corte = g.careca ? "careca" : g.corte, vol = g.volume;
  if (corte === "careca") frente = `<ellipse cx="${R(hw * 0.25)}" cy="${n(top + 22)}" rx="${n(hw * 0.32)}" ry="12" fill="#fff" opacity="0.22"/>`;
  else if (corte === "raspado") frente = `<path d="${ondas(arco(1.5, 2), 0)}${testa()} Z" fill="${cab}" opacity="0.88" ${tr(3)}/>`;
  else if (corte === "black") {
    atras = `<path d="${ondas(arco(32 + vol * 12, 38 + vol * 12, 292, 22), 9)} Z" fill="${cab}" ${tr(4)}/>`;
    frente = `<path d="${ondas(arco(16, 28 + vol * 14, yT, 14), 7)}${testa()} Z" fill="${cab}" ${tr(3)}/>${fios(26, true)}`;
  } else if (corte === "twists") {
    let fio = "";
    for (const [x, y] of arco(10, 22, 285, 26)) {
      const a = Math.atan2(y - 235, x - CX) * 180 / Math.PI;
      fio += `<rect x="-6" y="-17" width="12" height="34" rx="6" transform="translate(${n(x)},${n(y)}) rotate(${n(a + 90)})" fill="${cab}" ${tr(2.5)}/>`;
    }
    atras = fio;
    frente = `<path d="${ondas(arco(8, 18 + vol * 8, yT, 18), 5)}${testa()} Z" fill="${cab}" ${tr(3)}/>`;
    for (let i = 0; i < 4; i++) { const x = CX + (i - 1.5) * hw * 0.36; frente += `<rect x="${n(x - 6)}" y="${yH - 10}" width="12" height="30" rx="6" fill="${cab}" ${tr(2.5)}/>`; }
  } else if (corte === "moicano") { // faixa alta no meio, lados raspados
    const fora = ondas(arco(-hw * 0.5, 16 + vol * 12, yH + 2, 12), -7);
    frente = `<path d="${fora} Z" fill="${cab}"/><path d="${fora}" fill="none" ${tr(3)}/><path d="${ondas(arco(1.5, 2), 0)}${testa()} Z" fill="${natural}" opacity="0.3"/>${fios(5, false, cabLuz)}`;
  } else if (corte === "trancas") { // nagô: fileiras do testa para trás
    frente = `<path d="${ondas(arco(2, 5), 0)}${testa()} Z" fill="${cab}" ${tr(3)}/>`;
    let d = ""; for (let i = -3; i <= 3; i++) { const x = CX + i * hw * 0.24; d += `M${n(x)},${yH} Q${n(CX + i * hw * 0.2)},${n((yH + top) / 2)} ${n(CX + i * hw * 0.12)},${n(top + 4)} `; }
    frente += `<path d="${d}" fill="none" stroke="${cabLuz}" stroke-width="7" stroke-dasharray="7 4" stroke-linecap="round"/><path d="${d}" fill="none" stroke="${cabSombra}" stroke-width="1.6"/>`;
  } else if (corte === "longo") {
    atras = `<path d="M${L(hw + 8)},220 C${L(hw + 22)},300 ${L(hw + 14)},370 ${L(hw + 4)},412 L${R(hw + 4)},412 C${R(hw + 14)},370 ${R(hw + 22)},300 ${R(hw + 8)},220 Z" fill="${cab}" ${tr(3.5)}/>`;
    frente = `<path d="${ondas(arco(9, 12, yT + 30), 0)} L${R(hw - 4)},${yT + 30} C${R(hw * 0.7)},${yH - 4} ${R(12)},${yH - 6} ${CX},${yH - 14} C${L(12)},${yH - 6} ${L(hw * 0.7)},${yH - 4} ${L(hw - 4)},${yT + 30} Z" fill="${cab}" ${tr(3)}/>${fios(6)}${brilho(12)}`;
  } else {
    // os cortes com volume em cima: curto, lateral, topete (degradê), franja, coque, cachos, crespo curto
    const curly = corte === "cachos" || corte === "cachosAltos" || corte === "crespoCurto";
    const v = { curto: 10, lateral: 14, topete: 18, franja: 12, coque: 5, cachos: 20, cachosAltos: 32, crespoCurto: 12 }[corte] + vol * 10;
    const degrade = corte !== "franja" && corte !== "coque";
    if (corte === "coque") atras = `<circle cx="${CX}" cy="${n(top - 10)}" r="${n(18 + vol * 5)}" fill="${cab}" ${tr(3.5)}/>`;
    const contorno = degrade ? arco(0, v, 180, 14) : arco(5, v, yT, 16);
    const base = degrade ? ` L${R(hw - 6)},180 C${R(hw * 0.75)},${yH - e * 0.6} ${R(14)},${yH} ${CX},${yH} C${L(14)},${yH} ${L(hw * 0.75)},${yH - e * 0.6} ${L(hw - 6)},180` : testa(corte === "franja" ? "franja" : "");
    const fora = ondas(curly ? contorno : degrade ? arco(0, v, 180, 22) : contorno, curly ? (corte === "crespoCurto" ? 4 : 8) : -6);
    frente = `<path d="${fora}${base} Z" fill="${cab}"/><path d="${fora}" fill="none" ${tr(3.2)}/><path d="M${base.trim().slice(1)}" fill="none" stroke="${cabSombra}" stroke-width="1.8" stroke-linecap="round"/>`;
    if (corte === "lateral") { // risco do lado e a franja varrida
      const s = g.lado;
      frente += `<path d="M${n(CX + s * hw * 0.45)},${n(top + 8)} C${n(CX + s * hw * 0.1)},${n(top - 4)} ${n(CX - s * hw * 0.6)},${n(top + 2)} ${n(CX - s * (hw + 2))},${yT - 26} L${n(CX - s * (hw - 6))},${yT - 16} C${n(CX - s * hw * 0.5)},${n(top + 34)} ${n(CX + s * hw * 0.2)},${n(top + 24)} ${n(CX + s * hw * 0.45)},${n(top + 8)} Z" fill="${cab}" stroke="${cabSombra}" stroke-width="2.4" stroke-linejoin="round"/>`;
    }
    if (corte === "topete") { // o topete levantado na frente, puxado para um lado
      const s = g.lado;
      frente += `<path d="M${L(hw * 0.62)},${yH - 2} C${L(hw * 0.7)},${n(top - 8)} ${n(CX + s * hw * 0.2)},${n(top - 30 - vol * 14)} ${n(CX + s * hw * 0.72)},${n(top + 2)} C${n(CX + s * hw * 0.5)},${n(top + 18)} ${R(hw * 0.3)},${yH - 14} ${R(hw * 0.55)},${yH - 2} Q${CX},${yH + 4} ${L(hw * 0.62)},${yH - 2} Z" fill="${cab}" stroke="${cabSombra}" stroke-width="2.4" stroke-linejoin="round"/>`;
    } else if (corte === "crespoCurto") { // linha reta na testa (o "pezinho" feito)
      frente += `<path d="M${L(hw * 0.7)},${yH} L${L(hw * 0.25)},${yH - 4} L${R(hw * 0.25)},${yH - 4} L${R(hw * 0.7)},${yH}" fill="none" stroke="${cabSombra}" stroke-width="2"/>`;
    } else if (corte === "curto" || corte === "franja") { // pontas do cabelo na beira da testa
      let d = ""; if (corte === "curto") for (const i of [-1, 1]) { const x = CX + i * hw * 0.2 + g.lado * 10; d += `M${n(x - 9)},${yH - 4} Q${n(x + g.lado * 2)},${yH + 2} ${n(x + g.lado * 12)},${yH + 8} Q${n(x + 4)},${yH - 2} ${n(x + 9)},${yH - 4} Z `; }
      if (d) frente += `<path d="${d}" fill="${cab}" stroke="${TRACO}" stroke-width="2" stroke-linejoin="round"/>`;
    }
    frente += fios(curly ? 22 : 9, curly) + (curly ? "" : fios(6, false, cabLuz) + brilho(v));
    frente += `<path d="M${R(hw * 0.2)},${n(top - v + 6)} C${R(hw * 0.6)},${n(top - v + 4)} ${R(hw)},${n(top + 10)} ${R(hw + 2)},${n(yT - 30)} L${R(hw * 0.7)},${n(yH - 6)} C${R(hw * 0.6)},${n(top + 20)} ${R(hw * 0.4)},${n(top)} ${R(hw * 0.2)},${n(top - v + 6)} Z" fill="${cabSombra}" opacity="0.85"/>`
      + `<path d="M${L(hw * 0.75)},${n(top + 14)} C${L(hw * 0.55)},${n(top - v + 6)} ${L(hw * 0.15)},${n(top - v + 2)} ${R(hw * 0.05)},${n(top - v + 8)}" fill="none" stroke="${cabLuz}" stroke-width="7" stroke-linecap="round" opacity="0.8"/>`;
  }
  if (g.faixa && ["longo", "black", "twists", "cachosAltos"].includes(corte)) frente += `<path d="M${L(hw + 3)},${yH + 6} Q${CX},${yH - 16} ${R(hw + 3)},${yH + 6} L${R(hw + 3)},${yH + 20} Q${CX},${yH - 2} ${L(hw + 3)},${yH + 20} Z" fill="${op.gola || "#f2f2f2"}" ${tr(2.6)}/>`;
  // degradê e costeleta: cabelo bem rente dos lados, cor do cabelo transparente (só onde há cabelo)
  const lados = corte === "careca" || corte === "longo" || corte === "black" || corte === "twists" ? ""
    : `<defs><linearGradient id="${id}g" gradientUnits="userSpaceOnUse" x1="0" x2="0" y1="165" y2="250"><stop offset="0" stop-color="${natural}" stop-opacity="0.85"/><stop offset="1" stop-color="${natural}" stop-opacity="0.15"/></linearGradient></defs><path d="M${L(hw + 4)},160 L${L(hw * 0.8)},165 Q${L(hw * 0.84)},215 ${L(hw * 0.92)},250 L${L(hw + 4)},250 Z M${R(hw + 4)},160 L${R(hw * 0.8)},165 Q${R(hw * 0.84)},215 ${R(hw * 0.92)},250 L${R(hw + 4)},250 Z" fill="url(#${id}g)"/>`;

  const risca = g.risca && ["topete", "curto", "lateral", "crespoCurto", "cachos", "moicano", "raspado"].includes(corte)
    ? `<path d="M${n(CX - g.lado * hw * 0.9)},${yT - 22} q${n(g.lado * 14)},-8 ${n(g.lado * 30)},-6" fill="none" stroke="${pele}" stroke-width="3.2" stroke-linecap="round"/>` : "";
  // --- barba
  const barbaCor = g.barba === "sombra" ? sombra : natural; // o platinado não pinta a barba
  const bTop = 262;
  const regiaoBarba = `M${L(hw + 10)},${bTop} L${L(hw * 0.86)},${bTop} C${L(hw * 0.78)},294 ${L(mw + 18)},${n(my - 26)} ${L(mw + 6)},${n(my - 10)} Q${CX},${n(my - 28)} ${R(mw + 6)},${n(my - 10)} `
    + `C${R(mw + 18)},${n(my - 26)} ${R(hw * 0.78)},294 ${R(hw * 0.86)},${bTop} L${R(hw + 10)},${bTop} L${R(hw + 10)},470 L${L(hw + 10)},470 Z`;
  const bigode = `M${L(mw + 5)},${n(my - 1)} C${L(mw)},${n(my - 19)} ${R(mw)},${n(my - 19)} ${R(mw + 5)},${n(my - 1)} Q${CX},${n(my - 10)} ${L(mw + 5)},${n(my - 1)} Z`;
  let barba = "", barbaFora = "";
  if (g.barba === "sombra") barba = `<path d="${regiaoBarba}" fill-rule="evenodd" fill="${barbaCor}" opacity="0.55"/>`;
  else if (g.barba === "curta" || g.barba === "cheia") {
    barba = `<path d="${regiaoBarba}" fill-rule="evenodd" fill="${barbaCor}" opacity="${g.barba === "cheia" ? 1 : 0.9}" ${tr(2.6)}/>`;
    if (g.barba === "cheia") barbaFora = `<path d="M${L(jw * 0.9)},316 C${L(jw * 0.85)},${n(qy + 6)} ${L(ql + 4)},${n(qy + 24)} ${CX},${n(qy + 26)} C${R(ql + 4)},${n(qy + 24)} ${R(jw * 0.85)},${n(qy + 6)} ${R(jw * 0.9)},316 Z" fill="${barbaCor}" ${tr(3.5)}/>`;
  } else if (g.barba === "cavanhaque") barba = `<path d="${bigode} M${L(mw * 0.75)},${n(my + 12)} Q${CX},${n(my + 6)} ${R(mw * 0.75)},${n(my + 12)} L${R(ql + 8)},${n(qy + 6)} L${L(ql + 8)},${n(qy + 6)} Z" fill="${barbaCor}" ${tr(2.4)}/>`;
  else if (g.barba === "bigode") barba = `<path d="${bigode}" fill="${barbaCor}" ${tr(2.4)}/>`;

  // --- rosto: olhos, sobrancelhas, nariz, boca
  let rosto = "";
  for (const s of [-1, 1]) {
    const ex = CX + s * g.olhoD, ey = g.olhoY, ew = g.olhoL / 2, eh = Math.max(10, g.olhoA * (g.palpebra ? 0.8 : 1)), ir = Math.max(eh, g.olhoA) * 0.66, io = g.inclOlho, P = (dx, dy) => `${n(ex + s * dx)},${n(ey + dy)}`;
    const olho = `M${P(-ew, 1)} C${P(-ew / 2, -eh)} ${P(ew / 2, -eh - io / 2)} ${P(ew, -1 - io)} C${P(ew / 2, eh * 0.7 - io / 2)} ${P(-ew / 2, eh * 0.7)} ${P(-ew, 1)} Z`;
    rosto += `<clipPath id="${id}o${s}"><path d="${olho}"/></clipPath><path d="${olho}" fill="${op.duo ? "#f4f4f4" : "#efe8df"}"/>`
      + `<g clip-path="url(#${id}o${s})"><circle cx="${n(ex)}" cy="${n(ey + 1)}" r="${n(ir)}" fill="${op.duo ? "#3a3a3a" : IRIS[g.iris]}" stroke="${op.duo ? "#111111" : mistura(IRIS[g.iris], "#000", 0.45)}" stroke-width="1.6"/><circle cx="${n(ex)}" cy="${n(ey + 1)}" r="${n(eh * 0.3)}" fill="#111"/><path d="M${n(ex - ew - 4)},${n(ey - eh - 2)} L${n(ex + ew + 4)},${n(ey - eh - 2)} L${n(ex + ew + 4)},${n(ey - eh * 0.25)} L${n(ex - ew - 4)},${n(ey - eh * 0.25)} Z" fill="${funda}" opacity="0.3"/></g>`
      + `<circle cx="${n(ex - 2)}" cy="${n(ey - 2)}" r="1.8" fill="#fff"/>`
      + `<path d="M${P(-ew - 1, 1)} C${P(-ew / 2, -eh - 1)} ${P(ew / 2, -eh - 1 - io / 2)} ${P(ew + 3, -2 - io)}" fill="none" ${tr(g.palpebra ? 4.6 : 3.6)}/>`
      + `<path d="M${P(-ew / 2, eh * 0.62)} Q${P(ew / 4, eh * 0.8)} ${P(ew - 1, 1)}" fill="none" ${tI(1.4)}/>`
      + `<path d="M${P(-ew / 2, -eh - 6)} Q${P(ew / 3, -eh - 9)} ${P(ew, -eh - 3)}" fill="none" stroke="${linha}" stroke-width="1.6" stroke-linecap="round"/>`
      + `<path d="M${P(-ew / 3, eh + 6)} Q${P(ew / 4, eh + 9)} ${P(ew * 0.8, eh + 3)}" fill="none" stroke="${sombra}" stroke-width="1.8" opacity="0.7" stroke-linecap="round"/>`
      + (g.idade >= 31 ? `<path d="M${P(ew + 7, -3)} l${n(s * 7)},-3 M${P(ew + 7, 2)} l${n(s * 7)},2" fill="none" stroke="${sombra}" stroke-width="2" stroke-linecap="round"/>` : "");
    rosto = `<ellipse cx="${n(ex + s * 2)}" cy="${n(ey - eh * 0.6)}" rx="${n(ew + 8)}" ry="${n(eh + 5)}" fill="${s > 0 ? funda : sombra}" opacity="${s > 0 ? 0.45 : 0.35}"/>` + rosto;
    // sobrancelha: grossa por dentro, afina para fora
    const by = ey - eh - 13 - g.sobrA, t = g.sobrE, inc = g.sobrInc;
    rosto += `<path d="M${n(ex - s * (ew + 3))},${n(by + inc)} Q${n(ex)},${n(by - 6 - t * 0.3)} ${n(ex + s * (ew + 6))},${n(by - 1 - inc * 0.4)} Q${n(ex)},${n(by + t * 0.5 - 3)} ${n(ex - s * (ew + 2))},${n(by + inc + t)} Z" fill="${sobr}" stroke="${mistura(sobr, "#000", 0.3)}" stroke-width="1.4" stroke-linejoin="round"/>`;
  }
  // nariz: as asas e a linha de um lado (luz da esquerda)
  rosto += `<path d="M${R(3)},${n(g.olhoY + 2)} C${R(9)},${n(ny - 34)} ${R(nl * 0.9)},${n(ny - 18)} ${R(nl + 2)},${n(ny - 2)} L${R(nl * 0.35)},${n(ny + 4)} C${R(6)},${n(ny - 16)} ${R(4)},${n(ny - 40)} ${R(1)},${n(g.olhoY + 2)} Z" fill="${funda}" opacity="0.4"/>`
    + `<ellipse cx="${CX}" cy="${n(ny + 10)}" rx="${n(nl * 0.9)}" ry="5.5" fill="${funda}" opacity="0.45"/>`
    + `<path d="M${L(3)},${n(g.olhoY + 10)} C${L(5)},${n(ny - 30)} ${L(6)},${n(ny - 16)} ${L(4)},${n(ny - 4)}" fill="none" stroke="${luz}" stroke-width="3.4" stroke-linecap="round"/><ellipse cx="${L(2)}" cy="${n(ny - 1)}" rx="5" ry="3.2" fill="${luz}"/>`
    + `<path d="M${L(nl)},${n(ny - 6)} C${L(nl + 4)},${n(ny + 4)} ${L(nl * 0.5)},${n(ny + 8)} ${L(6)},${n(ny + 4)} C${L(3)},${n(ny + 8)} ${R(3)},${n(ny + 8)} ${R(6)},${n(ny + 4)} C${R(nl * 0.5)},${n(ny + 8)} ${R(nl + 4)},${n(ny + 4)} ${R(nl)},${n(ny - 6)}" fill="none" ${tI(2)}/>`
    + `<ellipse cx="${L(nl * 0.42)}" cy="${n(ny + 4)}" rx="3.6" ry="2.2" fill="${linha}"/><ellipse cx="${R(nl * 0.42)}" cy="${n(ny + 4)}" rx="3.6" ry="2.2" fill="${linha}"/>`;
  // dobra do sorriso (e da idade)
  if (g.sorriso === "dentes" || g.idade >= 30)
    rosto += `<path d="M${L(nl + 7)},${n(ny + 2)} Q${L(mw + 12)},${n(my - 12)} ${L(mw + 6)},${n(my)} M${R(nl + 7)},${n(ny + 2)} Q${R(mw + 12)},${n(my - 12)} ${R(mw + 6)},${n(my)}" fill="none" stroke="${funda}" stroke-width="2.2" stroke-linecap="round"/>`;
  if (g.sorriso === "dentes") {
    rosto += `<path d="M${L(mw * 0.95)},${n(my - 4)} Q${CX},${n(my)} ${R(mw * 0.95)},${n(my - 4)} Q${R(mw * 0.5)},${n(my + 14)} ${CX},${n(my + 15)} Q${L(mw * 0.5)},${n(my + 14)} ${L(mw * 0.95)},${n(my - 4)} Z" fill="#f4efe8" ${tI(2.2)}/>`
      + `<path d="M${L(mw * 0.95)},${n(my - 4)} Q${CX},${n(my - 9)} ${R(mw * 0.95)},${n(my - 4)} Q${CX},${n(my)} ${L(mw * 0.95)},${n(my - 4)} Z" fill="${labio}"/><path d="M${L(mw * 0.6)},${n(my + 15)} Q${CX},${n(my + 21)} ${R(mw * 0.6)},${n(my + 15)} Q${CX},${n(my + 13)} ${L(mw * 0.6)},${n(my + 15)} Z" fill="${labio}" opacity="0.7"/>`
      + `<path d="M${L(mw * 0.85)},${n(my + 1)} Q${CX},${n(my + 6)} ${R(mw * 0.85)},${n(my + 1)}" fill="none" stroke="#d8d2cc" stroke-width="1.6"/>`
      + `<ellipse cx="${CX}" cy="${n(my + 22)}" rx="${n(mw * 0.45)}" ry="4" fill="${sombra}"/>`;
  } else {
    const c = g.sorriso === "leve" ? -5 : 1;
    rosto += `<path d="M${L(mw * 0.72)},${n(my - 1)} Q${CX},${n(my - 5 - g.labio * 8)} ${R(mw * 0.72)},${n(my - 1)} Z" fill="${labio}"/>`
      + `<path d="M${L(mw * 0.62)},${n(my + 1)} Q${CX},${n(my + 9 + g.labio * 7)} ${R(mw * 0.62)},${n(my + 1)} Z" fill="${mistura(labio, pele, 0.45)}"/><path d="M${L(mw * 0.25)},${n(my + 5 + g.labio * 3)} Q${CX},${n(my + 7 + g.labio * 4)} ${R(mw * 0.15)},${n(my + 5 + g.labio * 3)}" fill="none" stroke="${luz}" stroke-width="2" stroke-linecap="round"/>`
      + `<path d="M${L(mw)},${n(my + c)} Q${CX},${n(my + 4)} ${R(mw)},${n(my + c)}" fill="none" ${tI(2.4)}/>`
      + `<ellipse cx="${CX}" cy="${n(my + 15 + g.labio * 5)}" rx="${n(mw * 0.42)}" ry="${n(3 + g.labio * 2)}" fill="${funda}" opacity="0.55"/>`;
  }
  if (g.sardas) { let d = ""; for (let i = 0; i < 14; i++) { const s = i % 2 ? 1 : -1, x = CX + s * (g.olhoD * (0.5 + rng.n() * 0.8)), y = g.olhoY + 22 + rng.n() * 18; d += `<circle cx="${n(x)}" cy="${n(y)}" r="${n(1.3 + rng.n())}"/>`; } rosto += `<g fill="${mistura(sombra, "#7a3a1c", 0.35)}">${d}</g>`; }
  if (g.cicatriz) { const x = CX + g.lado * (g.olhoD + g.olhoL * 0.3), y = g.olhoY - g.olhoA - 16; rosto += `<path d="M${n(x - 3)},${n(y - 8)} L${n(x + 3)},${n(y + 6)}" stroke="${pele}" stroke-width="3.4" stroke-linecap="round"/>`; }
  // maçã do rosto e queixo
  rosto += `<path d="M${L(10)},${n(qy - 12)} Q${CX},${n(qy - 6)} ${R(10)},${n(qy - 12)}" fill="none" stroke="${sombra}" stroke-width="2.4" stroke-linecap="round"/>`;

  // --- camisa
  const ombro = s => `C${n(CX + s * (nw + 60))},400 ${n(CX + s * 175)},408 ${n(CX + s * 205)},440 C${n(CX + s * 226)},464 ${n(CX + s * 238)},490 ${n(CX + s * 244)},520`;
  const tronco = `M${L(nw + 6)},388 ${ombro(-1)} L${R(244)},520 C${R(238)},490 ${R(226)},464 ${R(205)},440 C${R(175)},408 ${R(nw + 60)},400 ${R(nw + 6)},388 Q${CX},444 ${L(nw + 6)},388 Z`;
  let desenho = "";
  if (padrao === "listras") for (let x = CX - 17 - 34 * 7; x < 512; x += 68) desenho += `<rect x="${x}" y="380" width="34" height="140" fill="${camisa2}"/>`;
  // op.desenho: o desenho do uniforme do clube (src/camisa.js, no espaço 200 × 220 da camisa), posto sobre o peito: gola em cima da gola, tronco até o ombro
  if (op.desenho) desenho = `<g transform="translate(-64 350) scale(3.2)">${op.desenho}</g>`;
  const manga = padrao === "mangas" ? camisa2 : op.manga;
  if (manga) desenho += `<path d="M${L(172)},404 C${L(188)},440 ${L(196)},480 ${L(198)},520 L0,520 L0,404 Z M${R(172)},404 C${R(188)},440 ${R(196)},480 ${R(198)},520 L512,520 L512,404 Z" fill="${manga}" ${tr(2.6)}/>`;
  const decote = op.decote === "v"
    ? `<path d="M${L(nw + 14)},390 L${CX},452 L${R(nw + 14)},390 L${R(nw + 2)},394 L${CX},434 L${L(nw + 2)},394 Z" fill="${gola}" ${tr(3)}/>`
    : `<path d="M${L(nw + 14)},390 Q${CX},458 ${R(nw + 14)},390 L${R(nw + 2)},394 Q${CX},438 ${L(nw + 2)},394 Z" fill="${gola}" ${tr(3)}/>`;

  // --- montagem, na ordem dos grupos da spec
  out.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="${op.lista ? "86 14 340 340" : "0 0 512 512"}" role="img" aria-label="${(j.nome || "Jogador").replace(/"/g, "")}">`,
    `<defs><clipPath id="${id}c"><path d="${cabeca}"/></clipPath><clipPath id="${id}p"><path d="${tronco}"/></clipPath><clipPath id="${id}n"><path id="${id}np" d="M${L(nw)},300 L${L(nw + 4)},400 Q${CX},430 ${R(nw + 4)},400 L${R(nw)},300 Z"/></clipPath></defs>`,
    `<g transform="translate(256 440) scale(1.1) translate(-256 -440)">`, `<g class="cabelo-atras" transform="translate(256 318) scale(0.92) translate(-256 -318)">${atras}</g>`,
    `<g class="pescoco"><path d="M${L(nw)},300 L${L(nw + 4)},400 Q${CX},430 ${R(nw + 4)},400 L${R(nw)},300 Z" fill="${pele}" ${tr(3.5)}/>`
    + `<g clip-path="url(#${id}n)"><path d="M${R(nw * 0.2)},300 L${R(nw + 10)},300 L${R(nw + 10)},430 L${R(nw * 0.35)},430 Z" fill="${sombra}"/><path d="${cabeca}" transform="translate(0 14) translate(256 318) scale(0.92) translate(-256 -318)" fill="${funda}" opacity="0.6"/></g>`
    + `<path d="M${L(nw * 0.6)},372 Q${L(nw * 0.35)},392 ${L(nw * 0.15)},408 M${R(nw * 0.6)},372 Q${R(nw * 0.35)},392 ${R(nw * 0.15)},408" fill="none" stroke="${sombra}" stroke-width="2.6" stroke-linecap="round"/></g>`,
    `<g class="uniforme"><path d="${tronco}" style="fill:${camisa}"/><g clip-path="url(#${id}p)">${desenho}`
    + `<path d="M${R(nw * 0.4)},400 L${R(260)},400 L${R(260)},540 L${R(40)},540 Z" fill="#000" opacity="0.14"/><path d="M${L(120)},430 L${L(70)},520 L${L(150)},520 Z" fill="#fff" opacity="0.08"/><path d="M${R(150)},440 L${R(110)},520 L${R(185)},520 Z" fill="#000" opacity="0.1"/><path d="M${L(nw + 20)},400 Q${CX},470 ${R(nw + 20)},400 L${R(nw + 24)},408 Q${CX},476 ${L(nw + 24)},408 Z" fill="#000" opacity="0.12"/></g>`
    + `<path d="${tronco}" fill="none" ${tr(3.4)}/>${decote}`
    + `<path d="M${L(150)},450 q10,20 8,50 M${R(150)},450 q-10,20 -8,50" fill="none" stroke="#000" stroke-opacity="0.18" stroke-width="3" stroke-linecap="round"/></g>`,
    `<g transform="translate(256 318) scale(0.92) translate(-256 -318)">`, `<g class="orelhas">${[-1, 1].map(s => { const X = d => n(CX + s * (hw + d)); return `<path d="M${X(-8)},212 C${X(14)},198 ${X(25)},226 ${X(21)},252 C${X(18)},275 ${X(6)},290 ${X(-8)},284 Z" fill="${pele}" ${tr(3.5)}/><path d="M${X(1)},224 C${X(13)},224 ${X(15)},246 ${X(8)},262 C${X(4)},270 ${X(1)},266 ${X(3)},258" fill="none" stroke="${sombra}" stroke-width="3" stroke-linecap="round"/>${g.brinco === 2 || (g.brinco === 1 && s === g.lado) ? `<circle cx="${X(4)}" cy="287" r="4.5" fill="#e4e4e4" ${tr(1.8)}/>` : ""}`; }).join("")}</g>`,
    barbaFora,
    `<g class="rosto"><path d="${cabeca}" fill="${pele}"/><g clip-path="url(#${id}c)"><path d="M${R(hw * 0.05)},${n(top - 20)} C${R(hw * 0.32)},180 ${R(hw * 0.3)},230 ${R(hw * 0.46)},262 L${R(hw * 0.3)},300 C${R(jw * 0.45)},${n(qy - 28)} ${R(ql * 0.4)},${n(qy - 6)} ${R(4)},${n(qy + 4)} L${R(hw + 20)},${n(qy + 20)} L${R(hw + 20)},${n(top - 20)} Z" fill="${sombra}"/><path d="M${R(hw * 0.78)},${n(top + 30)} C${R(hw * 0.8)},200 ${R(hw * 0.7)},250 ${R(hw * 0.78)},270 L${R(hw * 0.6)},296 L${R(jw * 0.72)},${n(qy - 16)} L${R(hw + 20)},${n(qy)} L${R(hw + 20)},${n(top + 20)} Z" fill="${funda}" opacity="0.95"/><path d="M${R(hw * 0.58)},262 L${R(hw * 0.86)},266 L${R(hw * 0.5)},300 Z" fill="${funda}" opacity="0.6"/><path d="M${L(hw * 0.86)},264 L${L(hw * 0.52)},282 L${L(hw * 0.8)},300 Z" fill="${sombra}" opacity="0.55"/><path d="M${L(hw * 0.8)},${n(top + 34)} L${R(hw * 0.02)},${n(top + 30)} L${L(hw * 0.12)},206 L${L(hw * 0.8)},212 Z" fill="${luz}" opacity="0.85"/><path d="M${L(hw - 6)},170 C${L(hw - 4)},230 ${L(hw * 0.96)},272 ${L(jw * 0.86)},318" fill="none" stroke="${luz}" stroke-width="6" stroke-linecap="round" opacity="0.9"/><path d="M${L(hw * 0.86)},244 L${L(hw * 0.36)},248 L${L(hw * 0.66)},276 Z" fill="${luz}"/><path d="M${L(ql + 18)},${n(qy - 2)} Q${CX},${n(qy + 12)} ${R(ql + 18)},${n(qy - 2)} L${R(ql + 30)},${n(qy + 20)} L${L(ql + 30)},${n(qy + 20)} Z" fill="${funda}" opacity="0.45"/><ellipse cx="${L(8)}" cy="${n(qy - 16)}" rx="12" ry="6" fill="${luz}" opacity="0.6"/>${lados}${risca}${barba}`
    + (frente && corte !== "careca" ? `<path d="${frente.match(/d="([^"]+)"/)[1]}" transform="translate(0 4)" fill="${sombra}" opacity="0.7"/>` : "") + `</g><path d="${cabeca}" fill="none" ${tr(3.2)}/></g>`,
    `<g class="feicoes">${rosto}</g>`,
    `<g class="cabelo-frente">${frente}</g>`,
    `</g></g></svg>`);
  return out.join("");
}

// o rosto com o uniforme do clube (o objeto uniforme de src/camisa.js); sem uniforme, camisa cinza
const hexOk = c => /^#[0-9a-fA-F]{6}$/.test(c || "");
export function rostoDoJogador(j, u, extra = {}) {
  u = u || {};
  const c1 = hexOk(u.cor1) ? u.cor1 : "#8a8f98", c2 = hexOk(u.cor2) ? u.cor2 : "#ffffff", c3 = hexOk(u.cor3) ? u.cor3 : null;
  const des = DESENHOS[u.padrao] || DESENHOS.liso;
  const [r, g, b] = hex(c1), claro = 0.299 * r + 0.587 * g + 0.114 * b > 150;
  return rostoSVG(j, {
    camisa: c1, gola: hexOk(u.gola) ? u.gola : c2 === c1 ? (claro ? "#111111" : "#ffffff") : c2, decote: u.golaTipo === "v" ? "v" : "redondo",
    desenho: des.d(c2, c3, hexOk(u.corFilete) ? u.corFilete : c3), manga: hexOk(u.manga) ? u.manga : des.lisa ? c1 : null, ...extra,
  });
}
