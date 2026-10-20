// Gráficos de transmissão: momento do jogo (pressão minuto a minuto) e corrida do xG (xG acumulado em degraus).
// Recebem só os lances já liberados, então servem à transmissão ao vivo (o desenho para no minuto atual) e ao pós-jogo.
// htmlGraficos devolve o cartão em texto (a página redesenha tudo a cada 10 s); ligarGraficos liga o cursor que corre pelos dois.
import { svgEscudo } from "./escudo.js";

const f1 = v => v.toFixed(1).replace(".", ","), f2 = v => v.toFixed(2).replace(".", ",");
const esc = s => String(s || "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const sobrenome = n => esc(String(n || "").split(" ").slice(-1)[0]).toUpperCase();
const luz = c => { const n = parseInt(c.slice(1), 16); return .299 * (n >> 16) + .587 * (n >> 8 & 255) + .114 * (n & 255); };
const dist = (a, b) => { const p = parseInt(a.slice(1), 16), q = parseInt(b.slice(1), 16); return Math.hypot((p >> 16) - (q >> 16), (p >> 8 & 255) - (q >> 8 & 255), (p & 255) - (q & 255)); };
// cor escura some no fundo escuro: clareia até ter luz suficiente
function clarear(c) { let n = parseInt(c.slice(1), 16), r = n >> 16, g = n >> 8 & 255, b = n & 255;
  while (.299 * r + .587 * g + .114 * b < 105) { r += (255 - r) * .15; g += (255 - g) * .15; b += (255 - b) * .15; }
  return "#" + [r, g, b].map(v => Math.round(v).toString(16).padStart(2, "0")).join(""); }
// cor de cada time: a principal do escudo, a não ser que seja preta, branca ou parecida com a do outro
export function coresDoJogo(e0, e1) {
  const op = e => [e?.cor1, e?.cor2].filter(c => /^#[0-9a-f]{6}$/i.test(c || "") && luz(c) > 40 && luz(c) < 225);
  const a = op(e0)[0] || "#3a7bd5", b = op(e1).find(c => dist(c, a) > 110) || (dist("#e8833a", a) > 110 ? "#e8833a" : "#d94a64");
  return [a, b].map(clarear);
}

// pressão: cada lance empurra para o lado de quem atacava; chance pesa pelo xG; suavizada e comprimida com tanh
function pressao(lances, ate) {
  const PESO = { posse: .35, roda: .15, canto: .5, escanteio: .5, contra: .6, impedimento: .3 }, v = Array(91).fill(0);
  for (const d of lances) { if (d.time !== 0 && d.time !== 1) continue; const w = typeof d.xg === "number" ? .8 + d.xg * 4 : PESO[d.tipo] || 0, m = Math.min(90, Math.max(1, d.min));
    for (let k = -2; k <= 2; k++) if (m + k >= 0 && m + k <= ate) v[m + k] += (d.time ? -1 : 1) * w * (1 - Math.abs(k) * .3); }
  const kk = [1, 2, 3, 2, 1], sv = v.map((_, i) => i > ate ? 0 : kk.reduce((a, w, j) => a + w * (i + j - 2 <= ate ? v[i + j - 2] ?? 0 : 0), 0) / 9);
  const ord = sv.slice(0, ate + 1).map(Math.abs).sort((p, q) => p - q), ref = ord[Math.floor(ord.length * .85)] || 1;
  return sv.map(x => Math.tanh(x / ref * .9));
}
function suave(p) { // Catmull-Rom em Bézier
  let d = `M${p[0][0].toFixed(1)} ${p[0][1].toFixed(1)}`;
  for (let i = 0; i < p.length - 1; i++) { const a = p[i - 1] || p[i], b = p[i], c = p[i + 1], e = p[i + 2] || c;
    d += ` C${(b[0] + (c[0] - a[0]) / 6).toFixed(1)} ${(b[1] + (c[1] - a[1]) / 6).toFixed(1)} ${(c[0] - (e[0] - b[0]) / 6).toFixed(1)} ${(c[1] - (e[1] - b[1]) / 6).toFixed(1)} ${c[0].toFixed(1)} ${c[1].toFixed(1)}`; }
  return d;
}
const etiqueta = (x, y, txt, cor, fs) => { const w = txt.length * fs * .56 + 14, h = fs + 9;
  return `<rect x="${x - w / 2}" y="${y - h / 2}" width="${w}" height="${h}" rx="3" fill="${cor}"/><text x="${x}" y="${y + fs * .36}" text-anchor="middle" font-size="${fs}" font-weight="800" letter-spacing=".5" fill="#fff">${txt}</text>`; };
// etiquetas em faixas sem sobrepor: a que bateria na anterior vai para a faixa seguinte (k)
function emFaixas(itens, x0, x1, gap = 6) {
  const fim = []; return itens.map(it => { const x = Math.min(x1 - it.w / 2, Math.max(x0 + it.w / 2, it.x)); let k = 0; while (fim[k] !== undefined && x - it.w / 2 < fim[k] + gap) k++; fim[k] = x + it.w / 2; return { ...it, x, k }; }); }
const rotGol = (t, fs) => { const txt = `${t.min > 90 ? "90+" : t.min}' ${sobrenome(t.quem)}`; return { txt, w: txt.length * fs * .56 + 14 }; };
const bola = (x, y, r) => `<g transform="translate(${x} ${y}) scale(${r / 10})"><circle r="10" fill="#fff"/><path d="M0 -4 L3.8 -1.2 L2.4 3.2 L-2.4 3.2 L-3.8 -1.2 Z" fill="#111"/><path d="M0 -4 V-10 M3.8 -1.2 L9.5 -3 M2.4 3.2 L5.8 8 M-2.4 3.2 L-5.8 8 M-3.8 -1.2 L-9.5 -3" stroke="#111" stroke-width="1.4"/></g>`;
const eixo = (X, y, fs) => [0, 15, 30, 45, 60, 75, 90].map(m => `<text x="${X(m)}" y="${y}" text-anchor="middle" font-size="${fs}" font-weight="600" fill="#9aa6c8">${m}'</text>`).join("");
const BRILHO = `<filter id="gtvBrilho" x="-10%" y="-30%" width="120%" height="160%"><feGaussianBlur stdDeviation="3" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>`;
const W = 520, FS = 15, H = 320, LANE = FS + 12;

// estado do último desenho, para o cursor
let ultimo = null;

function momentoSvg(G, anim) {
  const { cores: [k0, k1], pr, gols, ate, lances } = G, x0 = 8, x1 = W - 8, gap = 5, topoLivre = 2 * LANE + 8, amp = (H - 2 * topoLivre - 22) / 2, meio = topoLivre + amp;
  const Xm = m => m <= 45 ? x0 + m / 45 * ((x1 - x0) / 2 - gap) : x0 + (x1 - x0) / 2 + gap + (Math.min(m, 90) - 45) / 45 * ((x1 - x0) / 2 - gap);
  const yDe = m => meio - (pr[Math.min(90, m)] || 0) * amp;
  const curva = (de, fim, s) => { const pts = []; for (let m = de; m <= fim; m++) pts.push([Xm(m), meio - Math.max(0, s * pr[m]) * amp * s]); return pts; };
  let g = `<defs>${BRILHO}${[[k0, "a", 0, 1], [k1, "b", 1, 0]].map(([c, id, y1, y2]) => `<linearGradient id="gtv${id}" x1="0" y1="${y1}" x2="0" y2="${y2}"><stop offset="0" stop-color="${c}" stop-opacity=".95"/><stop offset=".7" stop-color="${c}" stop-opacity=".35"/><stop offset="1" stop-color="${c}" stop-opacity=".08"/></linearGradient>`).join("")}</defs>`;
  g += `<rect x="${x0}" y="${meio - amp}" width="${x1 - x0}" height="${amp}" fill="${k0}" opacity=".06"/><rect x="${x0}" y="${meio}" width="${x1 - x0}" height="${amp}" fill="${k1}" opacity=".06"/>`;
  for (const y of [-.5, .5]) g += `<line x1="${x0}" y1="${meio + y * amp}" x2="${x1}" y2="${meio + y * amp}" stroke="rgba(255,255,255,.06)" stroke-dasharray="3 5"/>`;
  g += `<g${anim ? ` class="gtv-revela"` : ""}>`;
  for (const [a, b] of [[0, 45], [45, 90]]) { const fim = Math.min(b, ate); if (fim <= a) continue;
    for (const [s, id, c] of [[1, "a", k0], [-1, "b", k1]]) { const linha = suave(curva(a, fim, s));
      g += `<path d="${linha} L${Xm(fim)} ${meio} L${Xm(a)} ${meio} Z" fill="url(#gtv${id})"/><path d="${linha}" fill="none" stroke="${c}" stroke-width="2.6" stroke-linejoin="round" filter="url(#gtvBrilho)"/>`; } }
  g += `</g><line x1="${x0}" y1="${meio}" x2="${x1}" y2="${meio}" stroke="rgba(255,255,255,.55)" stroke-width="1.2"/>`;
  const wi = 3 * (FS - 2) * .56 + 14;
  g += `<rect x="${Xm(45) - gap}" y="${meio - amp - 2}" width="${gap * 2}" height="${amp * 2 + 4}" fill="#0f1630"/><rect x="${Xm(45) - wi / 2}" y="${meio - (FS + 7) / 2}" width="${wi}" height="${FS + 7}" rx="3" fill="#0f1630" stroke="rgba(255,255,255,.25)"/>
    <text x="${Xm(45)}" y="${meio + (FS - 2) * .36}" text-anchor="middle" font-size="${FS - 2}" font-weight="800" letter-spacing="1" fill="#9aa6c8">INT</text>`;
  lances.filter(d => (d.tipo === "amarelo" || d.tipo === "vermelho") && (d.time === 0 || d.time === 1)).forEach(d => {
    const x = Xm(Math.min(90, d.min)), up = d.time === 0; g += `<rect x="${x - 3.5}" y="${up ? meio - 13 : meio + 3}" width="7" height="10" rx="1.2" fill="${d.tipo === "amarelo" ? "#facc15" : "#ef4444"}" stroke="#0a0f1f" stroke-width="1"/>`; });
  G.chutes.filter(t => !t.gol && t.xg >= .25).forEach(t => g += `<circle cx="${Xm(t.min)}" cy="${yDe(t.min)}" r="5" fill="#0a0f1f" stroke="#fff" stroke-width="2" opacity=".9"/>`);
  [0, 1].forEach(i => emFaixas(gols.filter(t => t.time === i).map(t => ({ t, x: Xm(t.min), ...rotGol(t, FS) })), x0, x1).forEach((it, k) => {
    const c = G.cores[i], xb = Xm(it.t.min), s = i ? -1 : 1, yb = meio - s * Math.max(.12, s * (pr[Math.min(90, it.t.min)] || 0)) * amp; // a bola fica do lado de quem marcou
    const ye = i === 0 ? LANE / 2 + 4 + it.k * LANE : H - 22 - LANE / 2 - 4 - it.k * LANE;
    g += `<g${anim ? ` class="gtv-pop" style="--d:${1 + k * .12}s"` : ""}><line x1="${xb}" y1="${yb}" x2="${it.x}" y2="${ye}" stroke="#fff" stroke-opacity=".55" stroke-dasharray="2 3"/>
      ${etiqueta(it.x, ye, it.txt, c, FS)}<circle cx="${xb}" cy="${yb}" r="11" fill="#fff" stroke="${c}" stroke-width="3"/>${bola(xb, yb, 7.5)}</g>`; }));
  if (G.aoVivo) g += `<circle class="gtv-pulso" cx="${Xm(ate)}" cy="${yDe(ate)}" r="6" fill="#f2c14e"/><circle cx="${Xm(ate)}" cy="${yDe(ate)}" r="4" fill="#f2c14e" stroke="#0a0f1f" stroke-width="1.5"/>`;
  g += eixo(Xm, H - 4, FS);
  g += `<g data-cursor opacity="0"><line y1="${meio - amp}" y2="${meio + amp}" stroke="#f2c14e" stroke-width="2"/><circle r="5" fill="#f2c14e" stroke="#0a0f1f" stroke-width="2"/></g><rect data-toque x="${x0}" y="0" width="${x1 - x0}" height="${H - 20}" fill="transparent"/>`;
  G.Xm = Xm; G.yDe = yDe;
  return `<svg class="gtv-g" data-graf="momento" viewBox="0 0 ${W} ${H}" role="img" aria-label="Pressão de cada time minuto a minuto">${g}</svg>`;
}

function corridaSvg(G, anim, clubes) {
  const x0 = 8, x1 = W - 100, y0 = 2 * LANE + 10, y1 = H - 26, { cores, sx, xgAte, ate } = G;
  const tot = [0, 1].map(i => xgAte(i, 999)), topo = Math.max(1, Math.ceil(Math.max(...tot) * 2) / 2);
  const X = m => x0 + Math.min(m, 90) / 90 * (x1 - x0), Y = v => y1 - v / topo * (y1 - y0);
  let g = `<defs>${BRILHO}${cores.map((c, i) => `<linearGradient id="gtvc${i}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${c}" stop-opacity=".22"/><stop offset="1" stop-color="${c}" stop-opacity="0"/></linearGradient>`).join("")}</defs>`;
  for (let v = 0; v <= topo + 1e-9; v += .5) g += `<line x1="${x0}" y1="${Y(v)}" x2="${x1}" y2="${Y(v)}" stroke="rgba(255,255,255,${v ? .07 : .4})"/>${v ? `<text x="${x0 + 2}" y="${Y(v) - 4}" font-size="${FS - 2}" font-weight="600" fill="#6f7ba0">${f1(v)}</text>` : ""}`;
  g += `<line x1="${X(45)}" y1="${y0 - 6}" x2="${X(45)}" y2="${y1}" stroke="rgba(255,255,255,.14)" stroke-dasharray="4 4"/>`;
  const faixa = ["", ""]; // entre as duas linhas, na cor de quem está na frente no xG; um caminho por cor, sem frestas
  for (let m = 0; m < Math.min(90, ate); m++) { const a = xgAte(0, m), b = xgAte(1, m); if (Math.abs(a - b) < .005) continue;
    faixa[a > b ? 0 : 1] += `M${X(m)} ${Y(Math.max(a, b))}H${X(m + 1)}V${Y(Math.min(a, b))}H${X(m)}Z`; }
  g += `<g${anim ? ` class="gtv-revela"` : ""}>${faixa.map((d, i) => d ? `<path d="${d}" fill="${cores[i]}" opacity=".18"/>` : "").join("")}</g>`;
  const marcas = [], fimX = X(Math.min(90, ate));
  [0, 1].forEach(i => { const c = cores[i]; let v = 0, d = `M${X(0)} ${Y(0)}`;
    for (const t of sx[i]) { d += ` H${X(t.min)}`; v += t.xg; d += ` V${Y(v)}`; if (t.gol) marcas.push({ i, t, xb: X(t.min), yb: Y(v) }); }
    d += ` H${fimX}`;
    g += `<path d="${d} V${Y(0)} H${X(0)} Z" fill="url(#gtvc${i})"/><path${anim ? ` class="gtv-traco" pathLength="1" style="--d:${.2 + i * .15}s"` : ""} d="${d}" fill="none" stroke="${c}" stroke-width="3.2" stroke-linejoin="round" filter="url(#gtvBrilho)"/>`;
    if (G.aoVivo) g += `<circle class="gtv-pulso" cx="${fimX}" cy="${Y(v)}" r="6" fill="${c}"/>`; });
  // placas na ponta: escudo, xG e gols; se ficarem perto, uma sobe e a outra desce
  const yf = tot.map(Y), alt = 40, sep = alt + 4;
  if (Math.abs(yf[0] - yf[1]) < sep) { const c = (yf[0] + yf[1]) / 2, s = yf[0] <= yf[1] ? -1 : 1; yf[0] = c + s * sep / 2; yf[1] = c - s * sep / 2; }
  [0, 1].forEach(i => { const y = Math.min(y1 - alt / 2, Math.max(y0 + alt / 2, yf[i])), gols = G.gols.filter(t => t.time === i).length;
    g += `<g${anim ? ` class="gtv-pop" style="--d:1.4s"` : ""}><line x1="${fimX}" y1="${Y(tot[i])}" x2="${x1 + 8}" y2="${y}" stroke="${cores[i]}" stroke-width="2" stroke-dasharray="${G.aoVivo ? "3 3" : "none"}"/><rect x="${x1 + 8}" y="${y - alt / 2}" width="${W - x1 - 10}" height="${alt}" rx="4" fill="${cores[i]}"/>
      <g transform="translate(${x1 + 13} ${y - 14})">${svgEscudo(clubes[i].escudo || {}, clubes[i].sigla || "", 28)}</g>
      <text x="${W - 9}" y="${y + 2}" text-anchor="end" font-size="${FS + 8}" font-weight="800" fill="#fff">${f2(tot[i])}</text>
      <text x="${W - 9}" y="${y + 15}" text-anchor="end" font-size="${FS - 3}" font-weight="700" letter-spacing=".5" fill="#ffffffd0">${gols} ${gols === 1 ? "GOL" : "GOLS"}</text></g>`; });
  emFaixas(marcas.sort((a, b) => a.t.min - b.t.min).map(e => ({ ...e, x: e.xb, ...rotGol(e.t, FS) })), x0, x1).forEach((e, k) => {
    const ye = LANE / 2 + 2 + e.k * LANE, c = cores[e.i];
    g += `<g${anim ? ` class="gtv-pop" style="--d:${1.1 + k * .1}s"` : ""}><line x1="${e.xb}" y1="${e.yb}" x2="${e.x}" y2="${ye}" stroke="#fff" stroke-opacity=".5" stroke-dasharray="2 3"/>${etiqueta(e.x, ye, e.txt, c, FS)}
      <circle cx="${e.xb}" cy="${e.yb}" r="10" fill="#fff" stroke="${c}" stroke-width="3"/>${bola(e.xb, e.yb, 6.5)}</g>`; });
  g += eixo(X, H - 4, FS);
  g += `<g data-cursor opacity="0"><line y1="${y0 - 6}" y2="${y1}" stroke="#f2c14e" stroke-width="2"/>${cores.map(c => `<circle r="6" fill="${c}" stroke="#fff" stroke-width="2"/>`).join("")}</g><rect data-toque x="${x0}" y="0" width="${x1 - x0}" height="${H - 20}" fill="transparent"/>`;
  G.X = X; G.Y = Y;
  return `<svg class="gtv-g" data-graf="corrida" viewBox="0 0 ${W} ${H}" role="img" aria-label="xG acumulado de cada time">${g}</svg>`;
}

// narracao: lances já liberados. clubes: [mandante, visitante] com nome, sigla e escudo. aoVivo: o jogo ainda está rolando.
export function htmlGraficos(narracao, clubes, { aoVivo = false, animar = !aoVivo } = {}) {
  const lances = narracao.filter(l => l.time === 0 || l.time === 1);
  const chutes = lances.filter(l => typeof l.xg === "number" && l.resultado !== undefined).map(l => ({ ...l, min: Math.min(90, l.min), gol: l.resultado === "gol" }));
  const ate = aoVivo ? Math.min(90, Math.max(1, ...lances.map(l => l.min))) : 90;
  const sx = [0, 1].map(i => chutes.filter(t => t.time === i));
  const G = { cores: coresDoJogo(clubes[0].escudo, clubes[1].escudo), lances, chutes, sx, ate, aoVivo, gols: chutes.filter(t => t.gol), pr: pressao(lances, ate),
    xgAte: (i, m) => sx[i].filter(t => t.min <= m).reduce((a, t) => a + t.xg, 0), clubes };
  const n = [0, 0, 0]; for (let m = 1; m <= ate; m++) n[G.pr[m] > .15 ? 0 : G.pr[m] < -.15 ? 2 : 1]++;
  const pc = n.map(v => Math.round(v / ate * 100)), [k0, k1] = G.cores;
  const momento = momentoSvg(G, animar), corrida = corridaSvg(G, animar, clubes);
  ultimo = G;
  garantirEstilo();
  const vivo = aoVivo ? `<span class="gtv-vivo">ao vivo · ${ate}'</span>` : "";
  return `<div class="card gtv" data-aba="graf" style="--c0:${k0};--c1:${k1}"><div class="gtv-duas">
    <div><div class="gtv-cab"><h2>Momento do jogo</h2>${vivo}</div>
      <div class="gtv-dom"><div class="l">${svgEscudo(clubes[0].escudo || {}, clubes[0].sigla || "", 26)}<b style="color:${k0}">${pc[0]}%</b></div>
        <div class="b"><i style="flex:${n[0]};background:${k0}"></i><i style="flex:${n[1]};background:#3a4466"></i><i style="flex:${n[2]};background:${k1}"></i></div>
        <div class="l"><b style="color:${k1}">${pc[2]}%</b>${svgEscudo(clubes[1].escudo || {}, clubes[1].sigla || "", 26)}</div><div class="r">Tempo por cima do jogo · equilibrado ${pc[1]}%</div></div>
      ${momento}<div class="gtv-ler" data-ler="momento"><span class="vazio">Arraste sobre o gráfico para ver quem pressionava em cada minuto.</span></div></div>
    <div><div class="gtv-cab"><h2>Corrida do xG</h2>${vivo}</div>
      ${corrida}<div class="gtv-ler" data-ler="corrida"><span class="vazio">Cada degrau é uma finalização, do tamanho da chance. Arraste para ver o xG até cada minuto.</span></div></div>
  </div></div>`;
}

// cursor: arrastar num dos gráficos move o dos dois e escreve o minuto embaixo de cada um
export function ligarGraficos(raiz = document) {
  const G = ultimo, card = raiz.querySelector(".gtv"); if (!G || !card) return;
  const svgs = { momento: card.querySelector('[data-graf="momento"]'), corrida: card.querySelector('[data-graf="corrida"]') };
  const ler = k => card.querySelector(`[data-ler="${k}"]`);
  const mostra = m => {
    const cm = svgs.momento.querySelector("[data-cursor]"), x = G.Xm(m); cm.setAttribute("opacity", "1");
    cm.firstElementChild.setAttribute("x1", x); cm.firstElementChild.setAttribute("x2", x); cm.lastElementChild.setAttribute("cx", x); cm.lastElementChild.setAttribute("cy", G.yDe(m));
    const cc = svgs.corrida.querySelector("[data-cursor]"), xc = G.X(m), xg = [0, 1].map(i => G.xgAte(i, m)); cc.setAttribute("opacity", "1");
    cc.querySelector("line").setAttribute("x1", xc); cc.querySelector("line").setAttribute("x2", xc); cc.querySelectorAll("circle").forEach((c, i) => { c.setAttribute("cx", xc); c.setAttribute("cy", G.Y(xg[i])); });
    const num = (v, c) => `<b style="color:${c}">${f2(v)}</b>`;
    ler("corrida").innerHTML = `<span class="min">${m}'</span>${num(xg[0], G.cores[0])}<span>${esc(G.clubes[0].sigla)} × ${esc(G.clubes[1].sigla)}</span>${num(xg[1], G.cores[1])}<span class="vazio">xG até aqui</span>`;
    const t = G.chutes.filter(c => Math.abs(c.min - m) <= 1).sort((a, b) => b.xg - a.xg)[0], p = G.pr[m];
    ler("momento").innerHTML = `<span class="min">${m}'</span>` + (t ? `<b style="color:${G.cores[t.time]}">${esc(t.quem)}</b><span>${t.gol ? "GOL" : "finaliza"} · xG ${f2(t.xg)}</span>`
      : Math.abs(p) < .15 ? `<span>Jogo equilibrado</span>` : `<b style="color:${G.cores[p > 0 ? 0 : 1]}">${esc(G.clubes[p > 0 ? 0 : 1].nome)}</b><span>${Math.abs(p) > .6 ? "encurrala o adversário" : "tem o controle"}</span>`);
  };
  for (const [k, svg] of Object.entries(svgs)) {
    const X = k === "momento" ? G.Xm : G.X, alvo = svg.querySelector("[data-toque]");
    const mover = ev => { const r = svg.getBoundingClientRect(), x = (ev.clientX - r.left) / r.width * W; let m = 0; while (m < G.ate && X(m + .5) < x) m++; mostra(Math.max(1, m)); };
    alvo.addEventListener("pointermove", mover); alvo.addEventListener("pointerdown", mover);
  }
}

// estilo do cartão: painel escuro de transmissão nos dois temas, como o grafismo sobre a imagem da TV
function garantirEstilo() {
  if (typeof document === "undefined" || document.getElementById("estiloGtv")) return;
  const s = document.createElement("style"); s.id = "estiloGtv";
  s.textContent = `
  .card.gtv { background:linear-gradient(180deg, #121a33, #0a0f1f); color:#fff; border-color:rgba(255,255,255,.09); position:relative; overflow:hidden; }
  .card.gtv::before { content:""; position:absolute; inset:0 0 auto 0; height:3px; background:linear-gradient(90deg, var(--c0) 50%, var(--c1) 50%); }
  .gtv-duas { display:grid; grid-template-columns:repeat(2, minmax(0,1fr)); gap:18px; } @media (max-width:900px) { .gtv-duas { grid-template-columns:minmax(0,1fr); } }
  .gtv-cab { display:flex; align-items:center; gap:10px; margin-bottom:6px; } .gtv .gtv-cab h2 { margin:0; color:#fff; font-weight:800; font-size:19px; }
  .gtv-vivo { margin-left:auto; font-family:var(--display); font-weight:700; font-size:12px; letter-spacing:.12em; text-transform:uppercase; background:#e11d48; color:#fff; padding:2px 8px; border-radius:3px; }
  .gtv-dom { display:grid; grid-template-columns:auto minmax(0,1fr) auto; align-items:center; gap:2px 10px; margin-bottom:4px; }
  .gtv-dom .l { display:flex; align-items:center; gap:6px; } .gtv-dom b { font-family:var(--display); font-weight:800; font-size:22px; font-variant-numeric:tabular-nums; }
  .gtv-dom .b { display:flex; gap:3px; height:9px; } .gtv-dom .b i { display:block; border-radius:2px; min-width:3px; }
  .gtv-dom .r { grid-column:1 / -1; text-align:center; font-family:var(--display); font-weight:600; font-size:12px; letter-spacing:.12em; text-transform:uppercase; color:#9aa6c8; }
  .gtv-g { display:block; width:100%; touch-action:manipulation; } .gtv-g text { font-family:var(--display); }
  .gtv-ler { display:flex; align-items:center; flex-wrap:wrap; gap:8px; min-height:38px; margin-top:6px; padding:6px 10px; background:#1b2647; border-left:5px solid #f2c14e; border-radius:4px; font-size:13.5px; color:#fff; }
  .gtv-ler .min { font-family:var(--display); font-weight:800; font-size:17px; background:#f2c14e; color:#0a0f1f; padding:0 7px; border-radius:2px; }
  .gtv-ler b { font-family:var(--display); font-weight:800; font-size:17px; letter-spacing:.03em; } .gtv-ler .vazio { color:#9aa6c8; }
  @media (prefers-reduced-motion:no-preference) {
    .gtv-pop { animation:gtvPop .45s cubic-bezier(.2,.9,.3,1.35) both; animation-delay:var(--d, 0s); transform-box:fill-box; transform-origin:center; } @keyframes gtvPop { from { transform:scale(0); opacity:0; } }
    .gtv-traco { stroke-dasharray:1; stroke-dashoffset:1; animation:gtvTraco 1.1s ease-out forwards; animation-delay:var(--d, 0s); } @keyframes gtvTraco { to { stroke-dashoffset:0; } }
    .gtv-revela { animation:gtvRevela 1.2s cubic-bezier(.4,0,.2,1) both; } @keyframes gtvRevela { from { clip-path:inset(0 100% 0 0); } to { clip-path:inset(0 0 0 0); } }
    .gtv-pulso { animation:gtvPulso 1.6s ease-out infinite; transform-box:fill-box; transform-origin:center; } @keyframes gtvPulso { from { transform:scale(1); opacity:.8; } to { transform:scale(3); opacity:0; } }
  }`;
  document.head.append(s);
}
