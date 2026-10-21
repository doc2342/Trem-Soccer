// Gráficos do jogo, versão enxuta: momento do jogo (pressão minuto a minuto) e corrida do xG (xG acumulado em degraus).
// Recebem só os lances já liberados, então servem à transmissão ao vivo (o desenho para no minuto atual) e ao relatório.
// htmlGraficos devolve o cartão em texto (a transmissão redesenha tudo a cada 10 s); ligarGraficos liga o cursor que corre pelos dois.
// Nada de escudo dentro do SVG: o escudo enviado é um <img> e quebraria o desenho. Os escudos ficam no HTML em volta.
import { svgEscudo } from "./escudo.js";

const f1 = v => v.toFixed(1).replace(".", ","), f2 = v => v.toFixed(2).replace(".", ",");
const esc = s => String(s || "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const sobrenome = n => esc(String(n || "").split(" ").slice(-1)[0]);
// cor de cada time: a mesma das estatísticas (--casa para o mandante, --fora para o visitante, de estilo.css), em todo o site
export function coresDoJogo(claro = false) {
  const css = typeof document !== "undefined" ? getComputedStyle(document.documentElement) : null, v = (k, p) => css?.getPropertyValue(k).trim() || p;
  return [v("--casa", claro ? "#1c78b0" : "#7fcdf0"), v("--fora", claro ? "#c0531d" : "#e58a5a")];
}

// pressão: cada lance empurra para o lado de quem atacava; chance pesa pelo xG; suavizada e comprimida com tanh
function pressao(lances, ate, F) {
  const PESO = { posse: .35, roda: .15, canto: .5, escanteio: .5, contra: .6, impedimento: .3 }, v = Array(F + 1).fill(0);
  for (const d of lances) { const w = typeof d.xg === "number" ? .8 + d.xg * 4 : PESO[d.tipo] || 0, m = Math.min(F, Math.max(1, d.t));
    for (let k = -2; k <= 2; k++) if (m + k >= 0 && m + k <= ate) v[m + k] += (d.time ? -1 : 1) * w * (1 - Math.abs(k) * .3); }
  const kk = [1, 2, 3, 2, 1], sv = v.map((_, i) => i > ate ? 0 : kk.reduce((a, w, j) => a + w * (i + j - 2 <= ate ? v[i + j - 2] ?? 0 : 0), 0) / 9);
  const ord = sv.slice(0, ate + 1).map(Math.abs).sort((p, q) => p - q), ref = ord[Math.floor(ord.length * .85)] || 1;
  return sv.map(x => Math.tanh(x / ref * .9));
}
// linha do tempo contínua (t): os acréscimos, jogados com o relógio parado no 45 e no 90 (campo ac), e a prorrogação (91 a 120) entram no desenho
function linhaDoTempo(narracao) {
  const a = [0, 0]; let pro = false;
  for (const l of narracao) { const h = l.min > 45 ? 1 : 0;
    if (l.ac && (l.min === 45 || l.min === 90)) a[h] = Math.max(a[h], l.ac);
    if (l.tipo === "acrescimo") a[h] = Math.max(a[h], +(/(\d+) minuto/.exec(l.texto || "") || [0, 0])[1]);
    if (l.min > 90 || l.tipo === "prorrogacao") pro = true; }
  const fim2 = 90 + a[0] + a[1], seg = [[0, 45 + a[0]], [45 + a[0], fim2], ...(pro ? [[fim2, fim2 + 30]] : [])];
  const t = l => l.min <= 45 ? l.min + (l.ac || 0) : l.min <= 90 ? l.min + a[0] + (l.ac || 0) : l.min + a[0] + a[1];
  const rot = m => m <= 45 ? m : m <= 45 + a[0] ? `45+${m - 45}` : m <= 90 + a[0] ? m - a[0] : m <= fim2 ? `90+${m - 90 - a[0]}` : m - a[0] - a[1];
  const marcas = [[0, 0], [15, 15], [30, 30], [45, 45], [60, 60 + a[0]], [75, 75 + a[0]], [90, 90 + a[0]], ...(pro ? [[105, 105 + a[0] + a[1]], [120, 120 + a[0] + a[1]]] : [])];
  return { F: seg[seg.length - 1][1], seg, t, rot, marcas };
}
function suave(p) { // Catmull-Rom em Bézier
  let d = `M${p[0][0].toFixed(1)} ${p[0][1].toFixed(1)}`;
  for (let i = 0; i < p.length - 1; i++) { const a = p[i - 1] || p[i], b = p[i], c = p[i + 1], e = p[i + 2] || c;
    d += ` C${(b[0] + (c[0] - a[0]) / 6).toFixed(1)} ${(b[1] + (c[1] - a[1]) / 6).toFixed(1)} ${(c[0] - (e[0] - b[0]) / 6).toFixed(1)} ${(c[1] - (e[1] - b[1]) / 6).toFixed(1)} ${c[0].toFixed(1)} ${c[1].toFixed(1)}`; }
  return d;
}
// rótulos em faixas sem sobrepor: o que bateria no anterior vai para a faixa seguinte (k)
function emFaixas(itens, x0, x1, gap = 8) {
  const fim = []; return itens.map(it => { const x = Math.min(x1 - it.w / 2, Math.max(x0 + it.w / 2, it.x)); let k = 0; while (fim[k] !== undefined && x - it.w / 2 < fim[k] + gap) k++; fim[k] = x + it.w / 2; return { ...it, x, k }; }); }
const W = 520, FS = 13;
const rotGol = t => { const txt = `${t.rot}' ${sobrenome(t.quem)}`; return { txt, w: txt.length * FS * .55 }; };
const T = (x, y, txt, est, ancora = "middle") => `<text x="${x}" y="${y}" text-anchor="${ancora}" font-size="${FS}" style="${est}">${txt}</text>`;
const eixo = (X, y, { marcas, F }) => marcas.map(([r, m]) => T(X(m), y, r + "'", "fill:var(--mut)", m ? m > F - 3 ? "end" : "middle" : "start")).join("");
const ponto = (x, y, cor) => `<circle cx="${x}" cy="${y}" r="4.5" fill="${cor}" style="stroke:var(--card)" stroke-width="2"/>`;
const fio = (x1, y1, x2, y2) => `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" style="stroke:var(--mut)" stroke-width="1" stroke-dasharray="1 2"/>`;

let ultimo = null; // dados do último desenho, para o cursor

function momentoSvg(G) {
  const H = 226, x0 = 4, x1 = W - 4, gap = 3, meio = 110, amp = 70, { cores, pr, ate, tempo: { seg, F } } = G;
  // um bloco por tempo (com seus acréscimos), separados por uma fresta; k força o bloco de quem está na divisa
  const larg = x1 - x0 - (seg.length - 1) * 2 * gap;
  const X = (m, k) => { m = Math.min(m, F); if (k === undefined) k = Math.max(0, seg.findIndex(([, b]) => m <= b)); return x0 + k * 2 * gap + m / F * larg; };
  const yDe = m => meio - (pr[Math.min(F, m)] || 0) * amp;
  let g = "";
  seg.forEach(([a, b], k) => { const fim = Math.min(b, ate); if (fim <= a) return;
    for (const s of [1, -1]) { const pts = []; for (let m = a; m <= fim; m++) pts.push([X(m, k), meio - Math.max(0, s * pr[m]) * amp * s]);
      g += `<path d="${suave(pts)} L${X(fim, k)} ${meio} L${X(a, k)} ${meio} Z" fill="${cores[s > 0 ? 0 : 1]}" fill-opacity=".85"/>`; } });
  g += `<line x1="${x0}" y1="${meio}" x2="${x1}" y2="${meio}" style="stroke:var(--line)"/>`;
  // gols: ponto na borda da área de quem marcou; o nome fica fora do desenho, em cima o mandante e embaixo o visitante
  [0, 1].forEach(i => emFaixas(G.gols.filter(t => t.time === i).map(t => ({ t, x: X(t.t), ...rotGol(t) })), x0, x1).forEach(it => {
    const s = i ? -1 : 1, xb = X(it.t.t), yb = meio - s * (Math.max(.08, s * (pr[Math.min(F, it.t.t)] || 0)) * amp + 6), yt = i ? 194 + it.k * 14 : 27 - it.k * 14;
    g += fio(xb, yb, it.x, i ? yt - 11 : yt + 4) + ponto(xb, yb, cores[i]) + T(it.x, yt, it.txt, `fill:${cores[i]};font-weight:600`); }));
  if (G.aoVivo) g += `<circle class="gr-pulso" cx="${X(ate)}" cy="${yDe(ate)}" r="4" style="fill:var(--tx)"/>`;
  g += eixo(X, H - 2, G.tempo);
  g += `<g data-cursor opacity="0"><line y1="${meio - amp}" y2="${meio + amp}" style="stroke:var(--tx)" stroke-opacity=".5"/><circle r="3.5" style="fill:var(--tx)"/></g><rect data-toque x="${x0}" y="0" width="${x1 - x0}" height="${H - 16}" fill="transparent"/>`;
  G.Xm = X; G.yDe = yDe;
  return `<svg class="gr-svg" data-graf="momento" viewBox="0 0 ${W} ${H}" role="img" aria-label="Pressão de cada time minuto a minuto">${g}</svg>`;
}

function corridaSvg(G) {
  const H = 226, x0 = 4, x1 = W - 52, y0 = 44, y1 = H - 20, { cores, sx, xgAte, ate, tempo: { F } } = G;
  const tot = [0, 1].map(i => xgAte(i, 999)), topo = Math.max(1, Math.ceil(Math.max(...tot) * 2) / 2);
  const X = m => x0 + Math.min(m, F) / F * (x1 - x0), Y = v => y1 - v / topo * (y1 - y0), fimX = X(ate);
  let g = "";
  for (let v = .5; v <= topo + 1e-9; v += .5) g += `<line x1="${x0}" y1="${Y(v)}" x2="${x1}" y2="${Y(v)}" style="stroke:var(--line)" stroke-dasharray="2 4"/>${T(x0, Y(v) - 4, f1(v), "fill:var(--mut)", "start")}`;
  g += `<line x1="${x0}" y1="${y1}" x2="${x1}" y2="${y1}" style="stroke:var(--line)"/>`;
  const marcas = [];
  [0, 1].forEach(i => { let v = 0, d = `M${X(0)} ${Y(0)}`;
    for (const t of sx[i]) { d += ` H${X(t.t)}`; v += t.xg; d += ` V${Y(v)}`; if (t.gol) marcas.push({ i, t, xb: X(t.t), yb: Y(v) }); }
    g += `<path d="${d} H${fimX}" fill="none" stroke="${cores[i]}" stroke-width="2.2" stroke-linejoin="round"/>`; });
  // total na ponta de cada linha; se ficarem perto, um sobe e o outro desce
  const yf = tot.map(Y);
  if (Math.abs(yf[0] - yf[1]) < 18) { const c = (yf[0] + yf[1]) / 2, s = yf[0] <= yf[1] ? -1 : 1; yf[0] = c + s * 9; yf[1] = c - s * 9; }
  [0, 1].forEach(i => g += `<text x="${x1 + 8}" y="${yf[i] + 5}" font-size="16" font-weight="700" fill="${cores[i]}">${f2(tot[i])}</text>`);
  // gols: ponto no degrau e o nome em cima, fora das linhas
  emFaixas(marcas.sort((a, b) => a.t.t - b.t.t).map(e => ({ ...e, x: e.xb, ...rotGol(e.t) })), x0, x1).forEach(e => {
    const yt = 13 + e.k * 14; g += fio(e.xb, e.yb - 5, e.x, yt + 4) + ponto(e.xb, e.yb, cores[e.i]) + T(e.x, yt, e.txt, `fill:${cores[e.i]};font-weight:600`); });
  if (G.aoVivo) [0, 1].forEach(i => g += `<circle class="gr-pulso" cx="${fimX}" cy="${Y(tot[i])}" r="3.5" fill="${cores[i]}"/>`);
  g += eixo(X, H - 2, G.tempo);
  g += `<g data-cursor opacity="0"><line y1="${y0}" y2="${y1}" style="stroke:var(--tx)" stroke-opacity=".5"/>${cores.map(c => `<circle r="3.5" fill="${c}"/>`).join("")}</g><rect data-toque x="${x0}" y="0" width="${x1 - x0}" height="${H - 16}" fill="transparent"/>`;
  G.X = X; G.Y = Y;
  return `<svg class="gr-svg" data-graf="corrida" viewBox="0 0 ${W} ${H}" role="img" aria-label="xG acumulado de cada time">${g}</svg>`;
}

// narracao: lances já liberados. clubes: [mandante, visitante] com nome, sigla e escudo. aoVivo: o jogo ainda está rolando.
export function htmlGraficos(narracao, clubes, { aoVivo = false } = {}) {
  const tempo = linhaDoTempo(narracao), lances = narracao.filter(l => l.time === 0 || l.time === 1).map(l => ({ ...l, t: tempo.t(l) }));
  const chutes = lances.filter(l => typeof l.xg === "number" && l.resultado !== undefined).map(l => ({ ...l, rot: tempo.rot(l.t), gol: l.resultado === "gol" }));
  if (aoVivo) tempo.F = Math.max(tempo.F, ...lances.map(l => l.t)); // lance além do previsto (acréscimo ainda não anunciado): o eixo cresce
  const ate = aoVivo ? Math.max(1, ...lances.map(l => l.t)) : tempo.F, sx = [0, 1].map(i => chutes.filter(t => t.time === i));
  const claro = typeof document !== "undefined" && document.documentElement.getAttribute("data-tema") === "claro";
  const G = { cores: coresDoJogo(claro), lances, chutes, sx, ate, aoVivo, gols: chutes.filter(t => t.gol), pr: pressao(lances, ate, tempo.F), tempo,
    xgAte: (i, m) => sx[i].filter(t => t.t <= m).reduce((a, t) => a + t.xg, 0), clubes };
  const n = [0, 0, 0]; for (let m = 1; m <= ate; m++) n[G.pr[m] > .15 ? 0 : G.pr[m] < -.15 ? 2 : 1]++;
  const pc = n.map(v => Math.round(v / ate * 100)), [k0, k1] = G.cores;
  const momento = momentoSvg(G), corrida = corridaSvg(G);
  ultimo = G; garantirEstilo();
  const vivo = aoVivo ? ` <span class="tag">até ${tempo.rot(ate)}'</span>` : "", golsDe = i => G.gols.filter(t => t.time === i).length;
  const time = i => `<span class="gr-time">${svgEscudo(clubes[i].escudo || {}, clubes[i].sigla || "", 20)}<b style="color:${G.cores[i]}">${esc(clubes[i].sigla || clubes[i].nome)}</b></span>`;
  return `<div class="card gr" data-aba="graf"><div class="gr-duas">
    <div><h2>Momento do jogo${vivo}</h2>
      <div class="gr-dom">${time(0)}<b style="color:${k0}">${pc[0]}%</b><div class="b"><i style="flex:${n[0]};background:${k0}"></i><i style="flex:${n[1]}"></i><i style="flex:${n[2]};background:${k1}"></i></div><b style="color:${k1}">${pc[2]}%</b>${time(1)}</div>
      ${momento}<div class="gr-ler" data-ler="momento">Quem estava por cima em cada minuto (equilibrado em ${pc[1]}% do tempo). Arraste para ver.</div></div>
    <div><h2>Corrida do xG${vivo}</h2>
      <div class="gr-dom">${time(0)}<span class="mut">${golsDe(0)} ${golsDe(0) === 1 ? "gol" : "gols"}</span><span style="flex:1"></span><span class="mut">${golsDe(1)} ${golsDe(1) === 1 ? "gol" : "gols"}</span>${time(1)}</div>
      ${corrida}<div class="gr-ler" data-ler="corrida">Cada degrau é uma finalização, do tamanho da chance.</div></div>
  </div></div>`;
}

// cursor: arrastar num dos gráficos move o dos dois e escreve o minuto embaixo de cada um
export function ligarGraficos(raiz = document) {
  const G = ultimo, card = raiz.querySelector(".gr"); if (!G || !card) return;
  const svgs = { momento: card.querySelector('[data-graf="momento"]'), corrida: card.querySelector('[data-graf="corrida"]') }, ler = k => card.querySelector(`[data-ler="${k}"]`);
  const mostra = m => {
    const cm = svgs.momento.querySelector("[data-cursor]"), x = G.Xm(m); cm.setAttribute("opacity", "1");
    cm.firstElementChild.setAttribute("x1", x); cm.firstElementChild.setAttribute("x2", x); cm.lastElementChild.setAttribute("cx", x); cm.lastElementChild.setAttribute("cy", G.yDe(m));
    const cc = svgs.corrida.querySelector("[data-cursor]"), xc = G.X(m), xg = [0, 1].map(i => G.xgAte(i, m)); cc.setAttribute("opacity", "1");
    cc.querySelector("line").setAttribute("x1", xc); cc.querySelector("line").setAttribute("x2", xc); cc.querySelectorAll("circle").forEach((c, i) => { c.setAttribute("cx", xc); c.setAttribute("cy", G.Y(xg[i])); });
    ler("corrida").innerHTML = `<b>${G.tempo.rot(m)}'</b> xG <b style="color:${G.cores[0]}">${f2(xg[0])}</b> × <b style="color:${G.cores[1]}">${f2(xg[1])}</b>`;
    const t = G.chutes.filter(c => Math.abs(c.t - m) <= 1).sort((a, b) => b.xg - a.xg)[0], p = G.pr[m];
    ler("momento").innerHTML = `<b>${G.tempo.rot(m)}'</b> ` + (t ? `<b style="color:${G.cores[t.time]}">${esc(t.quem)}</b> ${t.gol ? "marca" : "finaliza"} · xG ${f2(t.xg)}`
      : Math.abs(p) < .15 ? "jogo equilibrado" : `<b style="color:${G.cores[p > 0 ? 0 : 1]}">${esc(G.clubes[p > 0 ? 0 : 1].nome)}</b> ${Math.abs(p) > .6 ? "encurrala o adversário" : "tem o controle"}`);
  };
  for (const [k, svg] of Object.entries(svgs)) {
    const X = k === "momento" ? G.Xm : G.X, alvo = svg && svg.querySelector("[data-toque]");
    if (!alvo) continue; // desenho incompleto: fica sem cursor, mas não derruba a página
    const mover = ev => { const r = svg.getBoundingClientRect(), x = (ev.clientX - r.left) / r.width * W; let m = 0; while (m < G.ate && X(m + .5) < x) m++; mostra(Math.max(1, m)); };
    alvo.addEventListener("pointermove", mover); alvo.addEventListener("pointerdown", mover);
  }
}

function garantirEstilo() {
  if (typeof document === "undefined" || document.getElementById("estiloGr")) return;
  const s = document.createElement("style"); s.id = "estiloGr";
  s.textContent = `
  .gr-duas { display:grid; grid-template-columns:repeat(2, minmax(0,1fr)); gap:14px 28px; } @media (max-width:900px) { .gr-duas { grid-template-columns:minmax(0,1fr); } }
  .gr-dom { display:flex; align-items:center; gap:8px; font-size:13px; margin:2px 0 4px; font-variant-numeric:tabular-nums; }
  .gr-dom > b { font-family:var(--display); font-weight:700; font-size:17px; }
  .gr-dom .b { flex:1; display:flex; gap:2px; height:4px; } .gr-dom .b i { display:block; border-radius:2px; min-width:2px; background:var(--line); }
  .gr-time { display:inline-flex; align-items:center; gap:5px; } .gr-time b { font-family:var(--display); font-weight:700; letter-spacing:.04em; }
  .gr-svg { display:block; width:100%; touch-action:manipulation; } .gr-svg text { font-family:var(--display); }
  .gr-ler { min-height:20px; font-size:12.5px; color:var(--mut); margin-top:2px; } .gr-ler b { color:var(--tx); }
  @media (prefers-reduced-motion:no-preference) { .gr-pulso { animation:grPulso 1.6s ease-out infinite; } @keyframes grPulso { 50% { opacity:.25; } } }`;
  document.head.append(s);
}
