// Estádio: só visual (aprovado em 18/10/2026, protótipo em prototipos/estadio.html). Três vistas a partir da mesma config:
//   desenharEstadio(el, config)  cena 3D girável (config.vista = "3d") ou wireframe da reforma (config.vista = "wire"), three.js r128
//   plantaEstadio(config)         planta baixa em SVG, com a hachura do que falta construir
// config = { modelo, nivel (1–8), obra (0–1), nomeEstadio, mosaico, padrao (setor|listras|sigla), cores[1–3], corEscadas,
//            cobertura (só Caldeirão: "", "N", "NS", "NSEW"), muralha (só Caldeirão: fundo oeste numa arquibancada única, com o mosaico), reforma (troca de modelo: tudo é novo),
//            clube (texto do carimbo da planta), custo e prazo (carimbo; padrão = obra do nível), marca (patrocinador master nas placas),
//            ocupacao (0–1, público estimado do jogo em casa: enche o estacionamento) }
// Fixos para todos: placas, bancos, túnel, telão e alambrado. Refletores e estacionamento seguem o nível (src/economia.js).
// Medidas em metros; x = leste, z = sul.
import { temRefletores, estacionamentoDoEstadio, lugaresDoEstadio, bonusDoEstadio } from "./economia.js";
import { MARCAS, placasDoJogo, ANUNCIE } from "./patrocinio.js";
export const MODELOS = { tradicional: "Tradicional", caldeirao: "Caldeirão", arena: "Arena moderna", dunas: "Arena Concha", ferradura: "Ferradura", bomboneira: "Bomboneira", laterais: "Estádio do Braga", inflavel: "Allianz Arena", sansiro: "San Siro", wembley: "Wembley", maracana: "Maracanã" };
// Sedes reais das finais (132_estadio_real.sql): sem dono, nome e capacidade de verdade; nivel = o desenho mais próximo da capacidade
export const SEDES = {
  maracana: { nome: "Maracanã", cidade: "Rio de Janeiro", lugares: 78838, nivel: 8, cores: ["#1d4f9c", "#f2c200"], entorno: "centro" },
  wembley: { nome: "Wembley", cidade: "Londres", lugares: 90000, nivel: 8, cores: ["#c8102e", "#ffffff"], entorno: "bairro" },
  sansiro: { nome: "San Siro", cidade: "Milão", lugares: 75817, nivel: 8, cores: ["#b3202a", "#1f3f8a"], entorno: "bairro" },
  inflavel: { nome: "Allianz Arena", cidade: "Munique", lugares: 75024, nivel: 8, cores: ["#c8102e", "#ffffff"], entorno: "bairro" },
  bomboneira: { nome: "La Bombonera", cidade: "Buenos Aires", lugares: 54000, nivel: 7, cores: ["#123d8c", "#f2c200"], entorno: "rio" },
  laterais: { nome: "Municipal de Braga", cidade: "Braga", lugares: 30286, nivel: 5, cores: ["#b3202a", "#ffffff"], entorno: "bairro" } };
export const FINAIS = { LIB: "Libertadores", COPA: "Copa", SUL: "Sul-Americana", SUP: "Supercopa", REC: "Recopa" };
// competição de uma final (a mesma conta de chave_da_final no SQL)
export const chaveDaFinal = p => p.fase === "copa" && p.copa_fase === 0 ? "SUP" : p.fase === "copa" && p.copa_fase === 6 ? "COPA" : p.fase === "lib" && p.copa_fase === 6 ? p.grupo || "LIB" : null;
// sede do jogo: a gravada na partida ou a da temporada (liga.sedes); a Libertadores é sempre no Maracanã
export const sedeDoJogo = (p, liga) => { const k = chaveDaFinal(p); return !k ? null : p.sede || (k === "LIB" ? "maracana" : liga?.sedes?.temporada === liga?.temporada ? liga.sedes[k] : null) || null; };
// config da sede; comp = chave da final (mosaico com o nome dela); festa = campeão { nome, cores } no mosaico da arquibancada norte
export function configDaSede(chave, comp, festa) {
  const s = SEDES[chave] || SEDES.maracana;
  return { modelo: SEDES[chave] ? chave : "maracana", nivel: s.nivel, obra: 1, nomeEstadio: s.nome, mosaico: (FINAIS[comp] || s.nome).toUpperCase(), padrao: "sigla",
    cores: s.cores, corEscadas: "#f2c200", cidade: s.entorno, clube: "SEDE", semente: 7, humor: 12, ocupacao: 0.9, festa: festa || null };
}
export const PADROES_DO_ESTADIO ={ setor: "Por setor", listras: "Anéis", sigla: "Nome no mosaico" };
export const COBERTURAS = { "": "Nenhuma", N: "Só a principal", NS: "Laterais", NSEW: "Todas" };

const FA = 52.5, FB = 34, DEP = 0.85, RISE = 0.42, CELL = 1.0, LS = 42.195, RI = 36.5, RO = RI + 9.76, POD = 2.4, PASSO_ESC = 24;
const M = { tradicional: { nome: "Tradicional", a0: 96, b0: 66, pista: 1 }, caldeirao: { nome: "Caldeirão", a0: 57, b0: 38.5, R: 1.5, cantos: 1 }, arena: { nome: "Arena moderna", a0: 59.5, b0: 41, R: 12, teto: "arena" }, dunas: { nome: "Arena Concha", a0: 60, b0: 44, R: 34, teto: "dunas" }, ferradura: { nome: "Ferradura", a0: 94, b0: 64, pista: 1, aberta: 1 },
  // Bomboneira (18/10): 3 anéis íngremes e um lado de palcos reto; a Muralha é opção do Caldeirão (config.muralha)
  bomboneira: { nome: "Bomboneira", a0: 55.5, b0: 37, R: 5, rise: 0.62, anel: 12, palcos: 6 },
  // 18/10: Estádio do Braga (sem a rocha) = só as laterais, cobertas e ligadas por cabos, fundos abertos;
  // Allianz Arena = Arena com uma pele de almofadas em losango na cor do clube
  laterais: { nome: "Estádio do Braga", a0: 57, b0: 38.5, R: 1.5, cantos: 1, laterais: 1 }, inflavel: { nome: "Allianz Arena", a0: 59.5, b0: 41, R: 20, teto: "arena", pele: 1 },
  // 18/10 San Siro, Wembley e Maracanã (protótipo em prototipos/teste_sansiro_wembley_maracana.html, SQL 129); folga = metros a mais em volta (esplanada, lote, barracas)
  sansiro: { nome: "San Siro", a0: 58, b0: 40, R: 6, teto: "arena", torres: 1, tetoIn: 0.1, folga: 12, fachada: ["#bdb4a0", "#ddd5c3", "#cfc6b2"] },
  wembley: { nome: "Wembley", a0: 59.5, b0: 41, R: 16, teto: "arena", arco: 1, via: 1, tetoIn: 0.22, corTeto: "#a3a8ab", folga: 12, fachada: ["#2f3d47", "#4d5f6b", "#3e4f5b"] },
  maracana: { nome: "Maracanã", a0: 86, b0: 63, geral: 6, marquise: 1, rampas: 1, fachada: ["#5f666b", "#7d8489", "#6e757a"] } };
const FACHADA = ["#8f8b82", "#d6d2c8", "#c4c0b5"]; // m.fachada troca as 3 cores das placas da fachada
const ROWS = [12, 12, 18, 24, 28, 41, 47, 53], CUSTO = [0, 0, 1500, 3000, 5000, 8000, 12000, 20000, 30000], PRAZO = [0, 1, 3, 6, 11, 18, 22, 27, 36]; // os mesmos de custo_da_obra e prazo_da_obra (55)
const lug = l => l < 1 ? 0 : l <= 5 ? 5000 + 5000 * l : [40000, 50000, 60000][l - 6];
const din = v => v >= 1000 ? (v / 1000).toLocaleString("pt-BR") + " mi" : v + " mil";
const HEX = /^#[0-9a-fA-F]{6}$/;
const lotacao = () => C.ocupacao == null ? 0.62 : 0.1 + 0.88 * C.ocupacao; // fração das vagas com carro

// Config a partir do clube (clubes.estadio_visual, 116_estadio_visual.sql) e da obra de nível em andamento.
export function configDoClube(c, obra) {
  const v = c.estadio_visual || {}, e = c.escudo || {};
  const cfg = { modelo: "tradicional", nomeEstadio: "", mosaico: c.sigla || "", padrao: "setor", cores: [e.cor1 || "#0b3d91", e.cor2 || "#ffffff"], corEscadas: "#f2c200",
    cobertura: "", ...v, nivel: c.estadio_nivel || 1, obra: 1, clube: c.sigla || "", humor: c.humor, semente: c.id || 0, marca: c.marca || null,
    ocupacao: c.torcida == null ? null : Math.min(1, c.torcida * (0.95 + 0.3 * (c.humor ?? 8) / 16) * bonusDoEstadio(c.estadio_nivel) / lugaresDoEstadio(c.estadio_nivel)) }; // a conta do público em finanças (jogo.html)
  if (obra && obra.estrutura === "estadio") { cfg.nivel = obra.nivel_alvo; cfg.obra = 1 - obra.rodadas_restantes / Math.max(1, obra.rodadas_total); }
  return cfg;
}

// estado da construção em curso (uma de cada vez; tudo síncrono)
let C, m, niv, rows, prev, obra = 1, cob = new Set(), T, grp, cur;
function aplicar(c) {
  const cores = (Array.isArray(c.cores) ? c.cores : []).filter(x => HEX.test(x)).slice(0, 3);
  C = { vista: "3d", padrao: "setor", corEscadas: "#f2c200", ...c, cores: cores.length ? cores : ["#0b3d91", "#ffffff"] };
  if (!HEX.test(C.corEscadas)) C.corEscadas = "#f2c200";
  m = M[C.modelo] || M.tradicional; if (m.cantos && C.muralha) m = { ...m, muralha: 1.2, mosaico: "W" }; niv = Math.min(8, Math.max(1, Math.round(+C.nivel || 1))); rows = ROWS[niv - 1];
  prev = C.reforma ? 0 : niv > 1 ? ROWS[niv - 2] : 0; obra = Math.min(1, Math.max(0, C.obra == null ? 1 : +C.obra));
  cob = new Set(m.cantos ? String(C.cobertura || "").split("").filter(x => "NSEW".includes(x) && !(m.muralha && x == "W")) : []); if (m.laterais) cob = new Set(["N", "S"]); // ponytail: Muralha sem cobertura no oeste (a parede passa da altura do teto)
  C.nb = estacionamentoDoEstadio(niv); C.refletores = temRefletores(niv);
}
function contorno(m, a, b) { const p = [];
  if (m.R == null) { for (let i = 0; i < 2400; i++) { const t = i / 2400 * 2 * Math.PI; p.push([a * Math.cos(t), b * Math.sin(t)]); } return p; }
  const R = Math.max(0.5, m.R + (a - m.a0)), ca = a - R, cb = b - R, cs = [[ca, cb], [-ca, cb], [-ca, -cb], [ca, -cb]];
  for (let q = 0; q < 4; q++) { const [cx, cz] = cs[q]; for (let j = 0; j < 24; j++) { const t = (q + j / 24) * Math.PI / 2; p.push([cx + R * Math.cos(t), cz + R * Math.sin(t)]); }
    const t = (q + 1) * Math.PI / 2, e = [cx + R * Math.cos(t), cz + R * Math.sin(t)], [nx, nz] = cs[(q + 1) % 4], s = [nx + R * Math.cos(t), nz + R * Math.sin(t)];
    for (let j = 0; j < 30; j++) p.push([e[0] + (s[0] - e[0]) * j / 30, e[1] + (s[1] - e[1]) * j / 30]); }
  return p; }
function walk(pts, step) { const out = []; let d = step / 2;
  for (let i = 0; i < pts.length; i++) { const p = pts[i], q = pts[(i + 1) % pts.length], L = Math.hypot(q[0] - p[0], q[1] - p[1]), ang = Math.atan2(q[1] - p[1], q[0] - p[0]);
    while (d <= L) { out.push({ x: p[0] + (q[0] - p[0]) * d / L, z: p[1] + (q[1] - p[1]) * d / L, ang }); d += step; } d -= L; }
  return out; }
const perim = pts => pts.reduce((s, p, i) => { const q = pts[(i + 1) % pts.length]; return s + Math.hypot(q[0] - p[0], q[1] - p[1]); }, 0);
function hRow(r) { if (r >= 28 && r <= 30) return hRow(27); return 1.0 + r * (m.rise || RISE) + (r > 30 ? 3 : 0) + (m.anel && r >= m.anel ? 2.2 : 0) + (m.geral ? 1.8 : 0); } // Maracanã: a arquibancada começa acima da geral
const lado = (x, z) => Math.abs(x) / m.a0 > Math.abs(z) / m.b0 ? (x > 0 ? "E" : "W") : (z > 0 ? "S" : "N");
const pula = (x, z, ld, lvl) => lvl < 1 || (lvl == 1 && (ld == "E" || ld == "W")) || (m.cantos && Math.abs(x) > FA + 3 && Math.abs(z) > FB + 3) || (m.aberta && ld == "E") || (m.laterais && (ld == "E" || ld == "W"));
const aRow = r => m.a0 + r * DEP + DEP / 2, bRow = r => m.b0 + r * DEP + DEP / 2;
const ladoNovo = (x, z, ld) => prev == 0 || pula(x, z, ld, niv - 1);
const novo = (x, z, ld, r) => r >= prev || ladoNovo(x, z, ld);
const pronto = (x, z, ld, r) => !novo(x, z, ld, r) || r < (ladoNovo(x, z, ld) ? rows * obra : prev + (rows - prev) * obra);
// Escadas: uma cadeira por fileira em cada corredor, para a linha sair contínua. Retas: corredores a cada PASSO_ESC metros;
// curvas: raios a partir do centro do canto (retângulo arredondado) ou do centro da elipse.
function marcarEscadas(pos) { const S = PASSO_ESC, alvos = [], porRow = {}; pos.forEach(p => (porRow[p.r] = porRow[p.r] || []).push(p));
  if (m.R == null) { const na = Math.round(perim(contorno(m, m.a0, m.b0)) / S); for (let k = 0; k < na; k++) alvos.push({ ang: 2 * Math.PI * k / na, cx: 0, cz: 0, sa: m.a0, sb: m.b0 }); }
  else { const ra = m.a0 - m.R, rb = m.b0 - m.R; for (let x = S / 2; x < ra - 1; x += S) for (const s of [-1, 1]) for (const ld of ["N", "S"]) alvos.push({ ld, x: s * x });
    for (let z = S / 2; z < rb - 1; z += S) for (const s of [-1, 1]) for (const ld of ["E", "W"]) alvos.push({ ld, z: s * z });
    if (m.R >= 10) for (const [sx, sz] of [[1, 1], [-1, 1], [-1, -1], [1, -1]]) for (const f of m.R >= 25 ? [1 / 3, 2 / 3] : [0.5]) { const a0 = Math.atan2(sz, 0), a1 = Math.atan2(0, sx); let d = a1 - a0; if (d > Math.PI) d -= 2 * Math.PI; if (d < -Math.PI) d += 2 * Math.PI; alvos.push({ ang: a0 + d * f, cx: sx * ra, cz: sz * rb, sa: 1, sb: 1, canto: 1 }); } }
  for (const r in porRow) { if (r >= 28 && r <= 30) continue; const L = porRow[r];
    for (const a of alvos) { let best = null, bd = 1e9;
      for (const p of L) { let d;
        if (a.ld) { if (p.ld != a.ld) continue; d = a.x != null ? Math.abs(p.x - a.x) : Math.abs(p.z - a.z); }
        else { if (a.canto && (Math.sign(p.x) != Math.sign(a.cx) || Math.sign(p.z) != Math.sign(a.cz) || Math.abs(p.x) < Math.abs(a.cx) || Math.abs(p.z) < Math.abs(a.cz))) continue;
          let da = Math.atan2((p.z - a.cz) / a.sb, (p.x - a.cx) / a.sa) - a.ang; da = Math.atan2(Math.sin(da), Math.cos(da)); d = Math.abs(da) * Math.hypot(p.x - a.cx, p.z - a.cz); }
        if (d < bd) { bd = d; best = p; } }
      if (best && bd < 0.9) best.esc = true; } } }
function assentos(lvl) { const out = []; for (let r = 0; r < ROWS[lvl - 1]; r++) { const linha = [];
  for (const p of walk(contorno(m, aRow(r), bRow(r)), CELL)) { p.ld = lado(p.x, p.z); if (pula(p.x, p.z, p.ld, lvl) || (m.palcos && p.z > m.b0 + m.palcos * DEP)) continue; p.r = r; p.h = hRow(r);
    if (m.muralha && p.ld == "W") { p.dep = DEP * m.muralha; p.x = -(m.a0 + (r + 0.5) * p.dep); const n = ROWS[lvl - 1]; p.h = 1 + r / Math.max(1, n - 1) * (hRow(n - 1) * 1.1 - 1); } linha.push(p); } // Muralha: a parede sobe só 10% acima das outras arquibancadas, sem o degrau dos camarotes
  linha.forEach((p, i) => { const a = linha[(i - 1 + linha.length) % linha.length], b = linha[(i + 1) % linha.length]; p.ponta = Math.hypot(a.x - p.x, a.z - p.z) > 1.8 || Math.hypot(b.x - p.x, b.z - p.z) > 1.8; });
  out.push(...linha); } return out; }
function porLado(lvl) { const c = { N: 0, S: 0, E: 0, W: 0, t: 0 }; if (lvl < 1) return c; for (const p of assentos(lvl)) if (p.r < 28 || p.r > 30) { c[p.ld]++; c.t++; } const cap = lug(lvl); for (const s of "NSEW") c[s] = Math.round(cap * c[s] / c.t / 100) * 100; return c; }
function lote(aM, bM, nb) { const W = Math.min(Math.floor(2 * aM * 0.9 / 2.5) * 2.5, 170), z0 = bM + (m.teto == "dunas" ? 26 : m.pele || m.folga ? 22 : 14), v = [], bands = [];
  for (let b = 0; b < nb; b++) { const za = 6 + 16 * b; bands.push(za); for (const [a1, a2, dir] of [[za, za + 5, 1], [za + 5, za + 10, -1]]) for (let x = -W / 2 + 1.25; x < W / 2; x += 2.5) v.push({ x, z: z0 + (a1 + a2) / 2, dir }); }
  return { W, z0, D: 6 + 16 * nb, z1: z0 + 6 + 16 * nb, v, bands }; }
function dunasGeo(topH) {
  const aM = m.a0 + rows * DEP, bM = m.b0 + rows * DEP, O = contorno(m, aM + 14, bM + 14), E = contorno(m, m.a0 + rows * DEP * 0.3, m.b0 + rows * DEP * 0.3), n = O.length, cum = [0];
  for (let i = 0; i < n; i++) { const p = O[i], q = O[(i + 1) % n]; cum.push(cum[i] + Math.hypot(q[0] - p[0], q[1] - p[1])); }
  const P = cum[n], N = 20, H = topH + 10;
  const idx = L => { L = ((L % P) + P) % P; let i = 0; while (cum[i + 1] < L) i++; return i + (L - cum[i]) / (cum[i + 1] - cum[i]); };
  const at = (R, f) => { const i = Math.floor(f) % n, j = (i + 1) % n, t = f - Math.floor(f); return [R[i][0] + (R[j][0] - R[i][0]) * t, R[i][1] + (R[j][1] - R[i][1]) * t]; };
  const pt = (f, s, Hj, b) => { const o = at(O, f), e = at(E, f), t = 1 - Math.cos(s * Math.PI / 2), dx = o[0] - e[0], dz = o[1] - e[1], dl = Math.hypot(dx, dz) || 1; return [o[0] + (e[0] - o[0]) * t + dx / dl * b, POD + Hj * Math.sin(s * Math.PI / 2) + b * 0.35, o[1] + (e[1] - o[1]) * t + dz / dl * b]; };
  const grade = (L0, L1, nu, nv, Hj, bul) => { const g = []; for (let u = 0; u <= nu; u++) { const f = idx(L0 + (L1 - L0) * u / nu), c = []; for (let v = 0; v <= nv; v++) c.push(pt(f, v / nv, Hj, bul * Math.sin(u / nu * Math.PI) * Math.pow(Math.sin(v / nv * Math.PI), 0.6))); g.push(c); } return g; };
  const petalas = []; for (let j = 0; j < N; j++) { const L0 = j * P / N + 0.6, L1 = (j + 1) * P / N - 0.6; petalas.push(grade(L0, L1, 12, 18, H * (j % 2 ? 0.985 : 1), 2.2)); }
  const casca = grade(0, P, N * 10, 18, H * 0.95, -0.5);
  const rampas = []; for (let j = 0; j < N; j++) { const f = idx(j * P / N), o = at(O, f), e = at(E, f), dx = o[0] - e[0], dz = o[1] - e[1], dl = Math.hypot(dx, dz); rampas.push({ o, d: [dx / dl, dz / dl] }); }
  const centro = sul => { let bi = 0, bv = 1e9; O.forEach((p, i) => { if ((sul ? p[1] > 0 : p[1] < 0) && Math.abs(p[0]) < bv) { bv = Math.abs(p[0]); bi = i; } }); return cum[bi]; };
  const faixa = (w, sul, hN) => { const Lc = centro(sul), bot = [], top = [], us = [], s0 = 0.22, s1 = Math.min(0.6, s0 + hN / H * 1.15); for (let i = 0; i <= 40; i++) { const L = Lc - w / 2 + w * i / 40, f = idx(L); bot.push(pt(f, s0, H, 2.6)); top.push(pt(f, s1, H, 2.6)); us.push(1 - i / 40); } return { bot, top, us }; };
  return { petalas, casca, rampas, O, inner: aM + 0.5, bInner: bM + 0.5, H, faixa }; }
// San Siro: 4 a 11 torres de rampa (3 + nível) coladas na fachada, fora dos letreiros do norte e do sul; com o teto, mais 4 nos cantos que seguram as treliças
function torresSS() { const aM = m.a0 + rows * DEP, bM = m.b0 + rows * DEP, oc = rows * DEP * 0.8 + 2, n = Math.min(11, 3 + niv);
  const cc = niv >= 3 ? [[1, 1], [-1, 1], [-1, -1], [1, -1]].map(([sx, sz]) => ({ x: sx * (m.a0 + oc), z: sz * (m.b0 + oc), r: 5.5, c: 1 })) : [];
  const ring = walk(contorno(m, aM + 5, bM + 5), 1).filter(p => !(Math.abs(p.x) < 34 && Math.abs(p.z) > bM) && cc.every(c => Math.hypot(p.x - c.x, p.z - c.z) > 18));
  return [...cc, ...Array.from({ length: n }, (_, i) => ({ ...ring[Math.floor((i + 0.5) * ring.length / n)], r: 4 }))]; }
// Wembley: o arco vai de um fundo ao outro, deitado 22° para o norte; perfil de meia elipse (sobe quase reto nos pés) e alto o bastante para passar 7 m acima da borda do teto
function arcoPts(topH) { const aM = m.a0 + rows * DEP, X = aM + 12, inc = 0.38, sb = (aM + 4) / X, H = Math.max(30 + 2.2 * topH, (topH + 12.4) / Math.cos(inc) / Math.sqrt(1 - sb * sb)), p = [];
  for (let i = 0; i <= 64; i++) { const s = Math.sin((-1 + 2 * i / 64) * Math.PI / 2), h = H * Math.sqrt(Math.max(0, 1 - s * s)); p.push([s * X, h * Math.cos(inc), -h * Math.sin(inc)]); }
  // o arco acompanha o nível: abaixo do 3 (sem teto) só os pés; a obra do nível 3 fecha o arco dos pés para o meio. p.trechos = o que já está de pé
  const PE = 0.12, ini = C.reforma || niv == 1 ? 0 : niv > 3 ? 1 : PE, f = ini + ((niv >= 3 ? 1 : PE) - ini) * obra, n = Math.round(f * 32);
  p.f = f; p.trechos = n >= 32 ? [p] : n < 1 ? [] : [p.slice(0, n + 1), p.slice(64 - n).reverse()]; return p; }
let _dg = null; function DG2() { if (!_dg || _dg.k !== m.nome + rows) { _dg = dunasGeo(hRow(rows - 1)); _dg.k = m.nome + rows; } return _dg; }
function mascara(txt, mr, meia, esc = 1) { const cw = 220, ch = Math.max(8, Math.round(cw * mr * esc / (2 * meia))), c = document.createElement("canvas"); c.width = cw; c.height = ch; const x = c.getContext("2d");
  x.font = "bold 100px sans-serif"; const w = x.measureText(txt).width || 1, fs = Math.min(ch * 0.92, 100 * cw * 0.94 / w); x.font = `bold ${fs}px sans-serif`; x.textAlign = "center"; x.textBaseline = "middle"; x.fillText(txt, cw / 2, ch / 2 + fs * 0.06);
  const d = x.getImageData(0, 0, cw, ch).data; let u0 = 1, u1 = 0; for (let i = 0; i < cw; i++) for (let j = 0; j < ch; j++) if (d[(j * cw + i) * 4 + 3] > 110) { u0 = Math.min(u0, i / cw); u1 = Math.max(u1, (i + 1) / cw); break; }
  const f = (u, v) => { const i = Math.min(cw - 1, Math.max(0, u * cw | 0)), j = Math.min(ch - 1, Math.max(0, v * ch | 0)); return d[(j * cw + i) * 4 + 3] > 110; }; f.u0 = u0; f.u1 = u1; return f; }
let rng = 7; const rnd = () => (rng = (rng * 16807) % 2147483647) / 2147483647;
function trilho(g, r, k, cx, cy) { g.beginPath(); g.moveTo(cx - LS * k, cy - r * k); g.lineTo(cx + LS * k, cy - r * k); g.arc(cx + LS * k, cy, r * k, -Math.PI / 2, Math.PI / 2); g.lineTo(cx - LS * k, cy + r * k); g.arc(cx - LS * k, cy, r * k, Math.PI / 2, Math.PI * 1.5); g.closePath(); }

// ---------- three.js (carregado uma vez, só quando a cena 3D é pedida) ----------
let _three = null;
function carregarThree() {
  if (window.THREE) return Promise.resolve(window.THREE);
  if (!document.querySelector("link[data-oswald]")) { const l = document.createElement("link"); l.rel = "stylesheet"; l.dataset.oswald = 1; l.href = "https://fonts.googleapis.com/css2?family=Oswald:wght@700&display=swap"; document.head.appendChild(l); }
  return _three || (_three = new Promise((ok, erro) => { const s = document.createElement("script"); s.src = "https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js";
    s.onload = () => document.fonts.load(FONTE_NOME).catch(() => {}).finally(() => ok(window.THREE)); s.onerror = () => { _three = null; erro(new Error("Não deu para carregar o 3D.")); }; document.head.appendChild(s); }));
}
let box, dm, AÇO, ESC, LUZ, cil, disco;
function materiaisFixos() { if (box) return; box = new T.BoxGeometry(1, 1, 1); dm = new T.Object3D(); AÇO = lam("#a8a59d"); ESC = lam("#3d3d3a"); LUZ = new T.MeshBasicMaterial({ color: "#fffbe6" }); cil = new T.CylinderGeometry(0.62, 0.5, 0.9, 14); disco = new T.CircleGeometry(0.55, 14); }
const shapeDe = pts => { const s = new T.Shape(); pts.forEach(([x, z], i) => i ? s.lineTo(x, -z) : s.moveTo(x, -z)); return s; };
const pathDe = pts => { const s = new T.Path(); pts.slice().reverse().forEach(([x, z], i) => i ? s.lineTo(x, -z) : s.moveTo(x, -z)); return s; };
function plano(geo, mat, y) { const g = new T.Mesh(geo, mat); g.rotation.x = -Math.PI / 2; g.position.y = y; g.receiveShadow = true; return g; }
const chao = (pts, cor, y) => plano(new T.ShapeGeometry(shapeDe(pts)), new T.MeshLambertMaterial({ color: cor }), y);
const lam = c => new T.MeshLambertMaterial({ color: c });
function anel(o, i, mat, y, d) { const s = shapeDe(o); s.holes.push(pathDe(i)); const me = new T.Mesh(new T.ExtrudeGeometry(s, { depth: d, bevelEnabled: false, curveSegments: 2 }), mat); me.rotation.x = -Math.PI / 2; me.position.y = y; me.castShadow = me.receiveShadow = true; grp.add(me); return me; }
function malha(g, mat) { const nu = g.length - 1, nv = g[0].length - 1, pos = [], ix = []; g.forEach(c => c.forEach(p => pos.push(...p)));
  for (let u = 0; u < nu; u++) for (let v = 0; v < nv; v++) { const a = u * (nv + 1) + v, b = a + nv + 1; ix.push(a, b, a + 1, b, b + 1, a + 1); }
  const geo = new T.BufferGeometry(); geo.setAttribute("position", new T.Float32BufferAttribute(pos, 3)); geo.setIndex(ix); geo.computeVertexNormals(); const me = new T.Mesh(geo, mat); me.castShadow = me.receiveShadow = true; grp.add(me); }
function faixaMesh(bot, top, us, t, basico) { const pos = [], uv = [], ix = []; for (let i = 0; i < bot.length; i++) { pos.push(...bot[i], ...top[i]); uv.push(us[i], 0, us[i], 1); if (i) { const a = (i - 1) * 2; ix.push(a, a + 2, a + 1, a + 2, a + 3, a + 1); } }
  const g = new T.BufferGeometry(); g.setAttribute("position", new T.Float32BufferAttribute(pos, 3)); g.setAttribute("uv", new T.Float32BufferAttribute(uv, 2)); g.setIndex(ix); g.computeVertexNormals();
  const o = { map: t, transparent: true, side: T.DoubleSide, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 };
  grp.add(new T.Mesh(g, basico ? new T.MeshBasicMaterial(o) : new T.MeshLambertMaterial(o))); }
function tex(c) { const t = new T.CanvasTexture(c); t.anisotropy = 8; return t; }
function canvas(w, h) { const c = document.createElement("canvas"); c.width = w; c.height = h; return [c, c.getContext("2d")]; }
// Nome na fachada: letras grafite com friso claro, fonte condensada larga para ler de longe.
const FONTE_NOME = '700 150px Oswald, "Arial Narrow", sans-serif';
function nomeTex(txt, cor) { const [, g0] = canvas(10, 10); g0.font = FONTE_NOME; g0.letterSpacing = "6px"; const r = (g0.measureText(txt).width + 40) / 200, cw = Math.min(4096, Math.round(200 * r)), [c, g] = canvas(cw, 200);
  g.font = FONTE_NOME.replace("150px", `${150 * cw / (200 * r)}px`); g.textAlign = "center"; g.textBaseline = "middle"; g.fillStyle = cor; g.fillText(txt, cw / 2, 104); return { t: tex(c), r }; }
// Letreiro: placa na cor do clube e letras claras em relevo (cópias da faixa empurradas para fora, face na frente).
function nome3D(txt, bot, top, us, fundo) { const fr = nomeTex(txt, "#f6f4ee").t, lat = nomeTex(txt, "#4a4843").t, nrm = p => { const l = Math.hypot(p[0], p[2] * 1.6) || 1; return [p[0] / l, 0, p[2] * 1.6 / l]; };
  const desl = (arr, o, dy) => arr.map(p => { const n = nrm(p); return [p[0] + n[0] * o, p[1] + dy, p[2] + n[2] * o]; });
  const cf = new T.Color(fundo); if (0.2126 * cf.r + 0.7152 * cf.g + 0.0722 * cf.b > 0.55) fundo = "#24272b";
  const [pc, pg] = canvas(4, 4); pg.fillStyle = fundo; pg.fillRect(0, 0, 4, 4); const pt = tex(pc), ab = (a, b, f) => a.map((p, i) => p.map((v, j) => v + (v - b[i][j]) * f));
  faixaMesh(desl(ab(bot, top, 0.16), 0.12, 0), desl(ab(top, bot, 0.16), 0.12, 0), us, pt, false);
  for (let i = 1; i <= 5; i++) faixaMesh(desl(bot, 0.12 + i * 0.1, -i * 0.02), desl(top, 0.12 + i * 0.1, -i * 0.02), us, lat, false);
  faixaMesh(desl(bot, 0.72, -0.12), desl(top, 0.72, -0.12), us, fr, true); }
function campoTex(linhas) { const k = 6, [c, g] = canvas(105 * k, 68 * k);
  if (!linhas) for (let i = 0; i < 12; i++) { g.fillStyle = i % 2 ? "#4f8a24" : "#5c9a2c"; g.fillRect(i * c.width / 12, 0, c.width / 12 + 1, c.height); }
  g.strokeStyle = linhas || "#fff"; g.lineWidth = linhas ? 1.5 : 2.5; const R = (x, y, w, h) => g.strokeRect(x * k, y * k, w * k, h * k);
  R(1, 1, 103, 66); g.beginPath(); g.moveTo(52.5 * k, k); g.lineTo(52.5 * k, 67 * k); g.stroke(); g.beginPath(); g.arc(52.5 * k, 34 * k, 9.15 * k, 0, 7); g.stroke();
  R(1, 13.85, 16.5, 40.3); R(87.5, 13.85, 16.5, 40.3); R(1, 24.85, 5.5, 18.3); R(98.5, 24.85, 5.5, 18.3);
  g.beginPath(); g.arc(12 * k, 34 * k, 9.15 * k, -0.93, 0.93); g.stroke(); g.beginPath(); g.arc(93 * k, 34 * k, 9.15 * k, Math.PI - 0.93, Math.PI + 0.93); g.stroke();
  return tex(c); }
function pistaTex() { const k = 6, W = 2 * (LS + RO + 2), H = 2 * (RO + 2), [c, g] = canvas(W * k | 0, H * k | 0), cx = c.width / 2, cy = c.height / 2;
  trilho(g, RO, k, cx, cy); g.fillStyle = "#c0563a"; g.fill(); trilho(g, RI, k, cx, cy); g.fillStyle = "#5c9a2c"; g.fill();
  g.strokeStyle = "#f6efe6"; g.lineWidth = 1.2; for (let i = 0; i <= 8; i++) { trilho(g, RI + i * 1.22, k, cx, cy); g.stroke(); }
  g.lineWidth = 2.5; g.beginPath(); g.moveTo(cx + LS * k, cy + RI * k); g.lineTo(cx + LS * k, cy + RO * k); g.moveTo(cx - LS * k, cy + RI * k); g.lineTo(cx - LS * k, cy + RO * k); g.stroke();
  g.lineWidth = 1.5; for (let i = 0; i < 8; i++) { const x = cx + (LS - 4 - i * 3.5) * k; g.beginPath(); g.moveTo(x, cy - (RI + i * 1.22) * k); g.lineTo(x, cy - (RI + (i + 1) * 1.22) * k); g.stroke(); }
  for (const s of [-1, 1]) { g.fillStyle = "#e3c891"; g.fillRect(cx + s * (LS + 18) * k - 4.5 * k, cy + 18 * k, 9 * k, 3 * k); g.fillStyle = "#b9b5aa"; g.beginPath(); g.arc(cx + s * (LS + 20) * k, cy - 14 * k, 2.2 * k, 0, 7); g.fill(); g.strokeStyle = "#f6efe6"; g.beginPath(); g.arc(cx + s * (LS + 20) * k, cy - 14 * k, 4.5 * k, 0.5, 5.8); g.stroke(); }
  return { t: tex(c), W, H }; }
function loteTex(L) { const k = 6, [c, g] = canvas(L.W * k, L.D * k);
  g.fillStyle = "#5a5955"; g.fillRect(0, 0, c.width, c.height); g.strokeStyle = "#f1efe8"; g.lineWidth = 1.6;
  for (const za of L.bands) { g.beginPath(); g.moveTo(0, (za + 5) * k); g.lineTo(c.width, (za + 5) * k); for (let x = 0; x <= L.W; x += 2.5) { g.moveTo(x * k, za * k); g.lineTo(x * k, (za + 10) * k); } g.stroke(); }
  g.fillStyle = "#f1efe8"; for (let z = 3; z < L.D; z += 16) for (let x = 8; x < L.W; x += 24) { g.beginPath(); g.moveTo(x * k, (z - .6) * k); g.lineTo((x + 4) * k, (z - .6) * k); g.lineTo((x + 4) * k, (z - 1.4) * k); g.lineTo((x + 6) * k, z * k); g.lineTo((x + 4) * k, (z + 1.4) * k); g.lineTo((x + 4) * k, (z + .6) * k); g.lineTo(x * k, (z + .6) * k); g.fill(); }
  return tex(c); }
// placas do campo: a sigla do clube nas duas cores, intercalada com o master e as placas sorteadas (só cosméticas); cada célula tem 6 m
function placaTex(cel) { const [c, g] = canvas(256 * cel.length, 64); g.textAlign = "center"; g.textBaseline = "middle";
  cel.forEach(([txt, bg, fg], i) => { g.fillStyle = bg; g.fillRect(i * 256, 0, 256, 64); g.font = "bold 40px sans-serif"; const fs = Math.min(40, 40 * 230 / Math.max(1, g.measureText(txt).width)); g.font = `bold ${fs}px sans-serif`; g.fillStyle = fg; g.fillText(txt, i * 256 + 128, 34); });
  const t = tex(c); t.wrapS = T.RepeatWrapping; t.userData = { m: 6 * cel.length }; return t; }
function celulasDasPlacas(sig, c0, c1) {
  const mk = MARCAS[C.marca], outras = [...(mk ? [[mk.nome.toUpperCase(), "#0d1220", "#ffffff"]] : []), ...placasDoJogo(C.semente, 3).concat(ANUNCIE).map(p => [p.nome.toUpperCase(), p.cor, p.txt])];
  return outras.flatMap((o, i) => [i % 2 ? [sig, c1, c0] : [sig, c0, c1], o]); }
function limpar() { grp.traverse(o => { o.geometry && o.geometry !== box && o.geometry !== cil && o.geometry !== disco && o.geometry.dispose(); if (o.material) [].concat(o.material).forEach(x => { if (x === AÇO || x === ESC || x === LUZ) return; x.map && x.map.dispose(); x.dispose(); }); }); cur.scene.remove(grp); grp = cur.grp = new T.Group(); cur.scene.add(grp); }
function inst(list, set, mat) { const im = new T.InstancedMesh(box, mat || new T.MeshLambertMaterial(), Math.max(1, list.length)); im.count = list.length; list.forEach((p, i) => set(p, i, im)); im.castShadow = im.receiveShadow = true; grp.add(im); return im; }
// barras de treliça: [x, y, z, direção, inclinação no plano vertical, comprimento, espessura, largura]
function barras(lista, mat) { dm.rotation.order = "YXZ"; inst(lista, ([x, y, z, yaw, tl, L, ey, ez = ey], i, im) => { dm.position.set(x, y, z); dm.rotation.set(0, -yaw, tl); dm.scale.set(L, ey, ez); dm.updateMatrix(); im.setMatrixAt(i, dm.matrix); }, mat); dm.rotation.order = "XYZ"; }
function put(im, i, x, y, z, ang, sx, sy, sz, c) { dm.position.set(x, y, z); dm.rotation.set(0, -ang, 0); dm.scale.set(sx, sy, sz); dm.updateMatrix(); im.setMatrixAt(i, dm.matrix); if (c) im.setColorAt(i, c); }
function bloco(w, h, d, mat, x, y, z) { const b = new T.Mesh(new T.BoxGeometry(w, h, d), mat); b.position.set(x, y, z); b.castShadow = b.receiveShadow = true; grp.add(b); return b; }
function torre(x, z, H) { const g = new T.Group(); g.position.set(x, 0, z); grp.add(g);
  const base = new T.Mesh(new T.BoxGeometry(3.2, 1, 3.2), lam("#bdb9ae")); base.position.y = 0.5; g.add(base);
  const mast = new T.Mesh(new T.CylinderGeometry(0.55, 1.05, H, 18), AÇO); mast.position.y = H / 2; mast.castShadow = true; g.add(mast);
  for (let y = 6; y < H - 2; y += 6) { const r = new T.Mesh(new T.CylinderGeometry(0.9 - 0.4 * y / H, 0.9 - 0.4 * y / H, 0.25, 18), ESC); r.position.y = y; g.add(r); }
  const hd = new T.Group(); hd.position.y = H + 2.6; hd.rotation.order = "YXZ"; hd.rotation.y = Math.atan2(-x, -z); hd.rotation.x = 0.42; g.add(hd);
  const pe = new T.Mesh(new T.BoxGeometry(0.6, 3, 0.6), AÇO); pe.position.set(0, -1.5, -0.3); hd.add(pe);
  for (const yy of [-0.2, 2.1, 4.4]) { const b = new T.Mesh(new T.BoxGeometry(12.6, 0.22, 0.22), ESC); b.position.set(0, yy, -0.55); hd.add(b); }
  for (const xx of [-6.2, 0, 6.2]) { const b = new T.Mesh(new T.BoxGeometry(0.22, 4.8, 0.22), ESC); b.position.set(xx, 2.1, -0.55); hd.add(b); }
  const pl = new T.Mesh(new T.BoxGeometry(12.8, 0.15, 1.6), lam("#6f6c64")); pl.position.set(0, -0.5, -1.4); hd.add(pl);
  const gr = new T.Mesh(new T.BoxGeometry(12.8, 0.08, 0.08), ESC); gr.position.set(0, 0.6, -2.15); hd.add(gr);
  for (let i = 0; i < 6; i++) for (let j = 0; j < 3; j++) { const lx = -5.2 + i * 2.08, ly = 0.4 + j * 1.95; const h = new T.Mesh(cil, ESC); h.rotation.x = Math.PI / 2; h.position.set(lx, ly, 0); h.castShadow = true; hd.add(h); const d = new T.Mesh(disco, LUZ); d.position.set(lx, ly, 0.46); hd.add(d); } }
function telao(x, y, z, pe) { const g = new T.Group(), tl = new T.Mesh(new T.BoxGeometry(1, 8, 18), [0, 1, 2, 3, 4, 5].map(i => new T.MeshLambertMaterial({ color: i == 0 ? "#185FA5" : "#2c2c2a", emissive: i == 0 ? "#0c447c" : "#000" }))); tl.castShadow = true; g.add(tl);
  for (const s of [-6, 6]) { const p = new T.Mesh(new T.BoxGeometry(0.4, Math.abs(pe), 0.4), lam("#5f5e5a")); p.position.set(0, pe > 0 ? 4 + pe / 2 : -4 + pe / 2, s); g.add(p); }
  g.position.set(x, y, z); g.rotation.y = Math.atan2(z, -x); grp.add(g); }

// Cena num elemento: devolve { atualizar(config), destruir() }. Arrastar gira.
export async function desenharEstadio(el, config) {
  T = await carregarThree(); materiaisFixos();
  el.style.position = "relative"; el.style.cursor = "grab"; el.style.touchAction = "none"; el.style.overflow = "hidden"; el.style.borderRadius = "12px";
  const tag = document.createElement("div"); tag.style.cssText = "position:absolute;left:12px;top:10px;font-family:monospace;font-size:12px;color:#FAC775;pointer-events:none";
  const ren = new T.WebGLRenderer({ antialias: true, alpha: true }); ren.setPixelRatio(Math.min(2, devicePixelRatio)); ren.shadowMap.enabled = true; ren.shadowMap.type = T.PCFSoftShadowMap;
  ren.domElement.style.display = "block"; el.replaceChildren(ren.domElement, tag);
  const scene = new T.Scene(), cam = new T.PerspectiveCamera(30, 1.6, 1, 3000);
  scene.add(new T.HemisphereLight(0xffffff, 0x77746a, 0.62));
  const sun = new T.DirectionalLight(0xffffff, 0.95); sun.position.set(-90, 150, 80); sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048); sun.shadow.bias = -0.0005; scene.add(sun);
  const I = { scene, grp: new T.Group(), sun, tag, az: 0.55, el: 0.62, dist: 300, tz: 0, vista: "3d" }; scene.add(I.grp);
  I.render = () => { const w = el.clientWidth; if (!w) return; const h = Math.round(w * 0.62); ren.setSize(w, h); cam.aspect = w / h;
    cam.position.set(I.dist * Math.cos(I.el) * Math.sin(I.az), I.dist * Math.sin(I.el), I.tz + I.dist * Math.cos(I.el) * Math.cos(I.az)); cam.lookAt(0, 4, I.tz); cam.updateProjectionMatrix();
    ren.setClearColor(I.vista == "wire" ? 0x0C447C : CEU, 1); ren.render(scene, cam); };
  let drag = null;
  el.addEventListener("pointerdown", e => { drag = [e.clientX, e.clientY, I.az, I.el]; el.setPointerCapture(e.pointerId); });
  el.addEventListener("pointermove", e => { if (!drag) return; I.az = drag[2] - (e.clientX - drag[0]) * 0.008; I.el = Math.min(1.35, Math.max(0.25, drag[3] + (e.clientY - drag[1]) * 0.005)); I.render(); });
  el.addEventListener("pointerup", () => drag = null);
  const ro = new ResizeObserver(() => I.render()); ro.observe(el);
  const atualizar = c => { cur = I; grp = I.grp; aplicar(c); I.vista = C.vista; construir(); };
  atualizar(config);
  return { atualizar, destruir: () => { ro.disconnect(); cur = I; grp = I.grp; limpar(); ren.dispose(); ren.forceContextLoss(); el.replaceChildren(); } };
}

function construir() {
  limpar();
  const topH = hRow(rows - 1), aM = m.a0 + rows * DEP, bM = m.b0 + rows * DEP, nb = C.nb, L = lote(aM, bM, nb), dunas = m.teto == "dunas";
  const ext0 = dunas ? 20 : m.pele ? 8 : m.folga || 0; cur.dist = Math.max(aM + ext0, (nb ? (bM + L.z1) / 2 + 10 : bM + ext0) * 1.3) * 3.0; cur.tz = nb ? (L.z1 - bM) / 2 : 0;
  const pos = assentos(niv), DG = dunas ? dunasGeo(topH) : null;
  const sc = cur.sun.shadow.camera, S = Math.max(aM + ext0, nb ? L.z1 : bM + ext0) + 30; sc.left = sc.bottom = -S; sc.right = sc.top = S; sc.far = 800; sc.updateProjectionMatrix();
  cur.scene.fog = null;
  if (C.vista == "wire") { wire(pos, aM, bM, topH, nb && L, DG); return; }
  entorno(aM + ext0 + (dunas ? 12 : 22), -(bM + ext0 + (dunas ? 12 : 22)), nb ? L.z1 + 14 : bM + ext0 + (dunas ? 12 : 22));
  cur.tag.textContent = obra < 1 ? "OBRA EM ANDAMENTO · " + Math.round(obra * 100) + "%" : "";
  const pad = C.padrao, k = C.cores.length, hx = [...C.cores, "#f2f2f2", "#c8102e"].slice(0, 3), cols = C.cores.map(c => new T.Color(c)), sig = (C.mosaico || " ").toUpperCase(), nomeE = (C.nomeEstadio || "").toUpperCase().trim();
  const LM = m.mosaico || "N", mr = LM == "W" ? rows : Math.min(rows, 28), meia = Math.min((LM == "W" ? m.b0 : m.a0) - 4, Math.max(10, ...pos.filter(p => p.ld == LM && p.r == 0).map(p => Math.abs(LM == "W" ? p.z : p.x) - 2))), uDe = p => ((LM == "W" ? -p.z : p.x) / meia + 1) / 2;
  // Bombonera: o mosaico fica só no anel do meio (o degrau do anel, na fileira m.anel, cortava as letras)
  const r0 = m.anel && mr > m.anel + 4 ? m.anel + 1 : 0, nr = mr - r0, vDe = r => 1 - (r - r0 + .5) / nr;
  const msk = mascara(sig, nr, meia, LM == "W" ? m.muralha : 1); marcarEscadas(pos);
  // festa do título: a torcida do campeão toma a arquibancada do mosaico com o nome e as cores do clube
  const fcs = ((C.festa && C.festa.cores) || []).filter(x => HEX.test(x)), fes = fcs.length ? { c: fcs.map(c => new T.Color(c)), k: mascara((C.festa.nome || " ").toUpperCase(), nr, meia, LM == "W" ? m.muralha : 1) } : null;
  // degradê da festa: o fundo vai da cor 1 (embaixo) até 35% da cor 2 (em cima); nos modelos com anéis, um tom por anel
  const tomDe = r => m.anel ? (r < m.anel ? 0 : r < 28 ? 0.5 : 1) : Math.min(1, r / Math.max(1, rows - 1)), fundoFesta = r => fes.c[0].clone().lerp(fes.c[1] || new T.Color("#fff"), 0.35 * tomDe(r));
  const naArea = p => { if (pad != "sigla" || p.ld != LM || p.r >= mr || p.r < r0) return false; const u = uDe(p); return u > msk.u0 - 0.025 && u < msk.u1 + 0.025; };
  const CONC = new T.Color("#bdb9ae"), OBRA = new T.Color("#9d998f"), SKY = new T.Color("#33393f"), ESCD = new T.Color(C.corEscadas);
  for (const p of pos) { const r = p.r, ld = p.ld; let c;
    if (!pronto(p.x, p.z, ld, r)) c = OBRA;
    else if (r >= 28 && r <= 30 && !p.dep) c = SKY; else if (p.ponta || (m.anel && r == m.anel)) c = CONC;
    else if (fes && ld == LM && (r >= mr || r < r0)) c = fundoFesta(r); // festa: a torcida toma a arquibancada inteira, o nome fica na parte do mosaico
    else if (fes && ld == LM) { const u = uDe(p); c = u > 0 && u < 1 && fes.k(u, vDe(r)) ? fes.c[1] || new T.Color("#fff") : fundoFesta(r); }
    else if (p.esc && !naArea(p)) c = ESCD;
    else if (pad == "setor") { const mp = k == 1 ? { N: 0, E: 0, S: 0, W: 0 } : k == 2 ? { N: 0, E: 1, S: 0, W: 1 } : { N: 0, S: 1, E: 2, W: 2 }; c = cols[mp[ld]]; }
    else if (pad == "listras") c = cols[Math.floor(r / 3) % k];
    else { c = cols[0]; if (ld == LM && r < mr && r >= r0) { const u = uDe(p), v = vDe(r); if (u > 0 && u < 1 && msk(u, v)) c = k > 1 ? cols[1] : new T.Color("#fff"); } }
    p.c = c === CONC || c === OBRA || c === SKY || c === ESCD ? c : c.clone().multiplyScalar(r % 2 ? 0.86 : 1); }
  const esp = dunas ? 30 : m.pele ? 16 : 8 + (m.folga || 0); grp.add(chao(contorno(m, aM + esp, bM + esp), "#d8d4ca", 0));
  grp.add(chao(contorno(m, m.a0, m.b0), "#4f8a24", 0.03));
  if (m.pista) { const pt = pistaTex(); grp.add(plano(new T.PlaneGeometry(pt.W, pt.H), new T.MeshLambertMaterial({ map: pt.t, transparent: true }), 0.05)); }
  grp.add(plano(new T.PlaneGeometry(105, 68), new T.MeshLambertMaterial({ map: campoTex() }), 0.08));
  inst(pos, (p, i, im) => put(im, i, p.x, p.h / 2, p.z, p.ang, CELL * 1.06, p.h, (p.dep || DEP) * 1.04, p.c));
  const teto = m.teto == "arena" && niv >= 3, yT = topH + 5.4, yC = topH + 4.5, yM = m.marquise && niv >= 3 ? topH + 4.5 : 0;
  const ext = pos.filter(p => p.r == rows - 1), out = p => { const nx = Math.sin(p.ang), nz = -Math.cos(p.ang), s = Math.sign(p.x * nx + p.z * nz) || 1; return [s * nx, s * nz]; };
  const fhOf = p => teto ? yT : yM || (cob.has(p.ld) ? yC + 0.2 : p.h + 1.6), dp = p => (p.dep || DEP) / 2;
  if (!dunas) {
    inst(ext, (p, i, im) => { const [nx, nz] = out(p), fh = fhOf(p); put(im, i, p.x + nx * (dp(p) + 0.3), fh / 2, p.z + nz * (dp(p) + 0.3), p.ang, CELL * 1.08, fh, 0.6, new T.Color((m.fachada || FACHADA)[i % 8 == 0 ? 0 : i % 8 < 5 ? 1 : 2])); });
    inst(ext, (p, i, im) => { const [nx, nz] = out(p); put(im, i, p.x + nx * (dp(p) + 0.62), Math.min(topH * 0.3, 3.2), p.z + nz * (dp(p) + 0.62), p.ang, CELL * 1.08, 1.3, 0.1, new T.Color("#4a5560")); });
    inst(ext, (p, i, im) => { const [nx, nz] = out(p); put(im, i, p.x + nx * (dp(p) + 0.62), fhOf(p) - 0.5, p.z + nz * (dp(p) + 0.62), p.ang, CELL * 1.08, 0.4, 0.12, new T.Color("#f1efe8")); });
    if (nomeE && !m.pele) for (const sul of [true, false]) { const sd = sul ? "S" : "N", lado_ = ext.filter(p => p.ld == sd); if (!lado_.length) continue;
      const fh = teto ? yT : yM || (cob.has(sd) ? yC + 0.2 : topH + 1.6), faixaJan = Math.min(topH * 0.3, 3.2) + 0.65, hN = Math.min(8, (fh - faixaJan - 1.2) * 0.62), y0 = faixaJan + 0.6 + (fh - 1 - faixaJan - 0.6) / 2, { r } = nomeTex(nomeE, "#000");
      if (hN < 1.2) continue; const xs = lado_.map(p => p.x), w = Math.min(r * hN, (Math.max(...xs) - Math.min(...xs)) * 0.92); if (w < 4) continue; const hh = w / r;
      const fo = yM ? 2.9 : 0.95, pts = walk(contorno(m, aM + fo, bM + fo), 1).filter(p => (sul ? p.z > 0 : p.z < 0) && Math.abs(p.x) <= w / 2).sort((a, b) => sul ? a.x - b.x : b.x - a.x);
      nome3D(nomeE, pts.map(p => [p.x, y0 - hh / 2, p.z]), pts.map(p => [p.x, y0 + hh / 2, p.z]), pts.map(p => sul ? (p.x + w / 2) / w : (w / 2 - p.x) / w), hx[0]); } }
  if (teto) { const fi = m.tetoIn ?? 0.5, fm = fi + (1 - fi) * 0.4, cIn = contorno(m, m.a0 + rows * DEP * fi, m.b0 + rows * DEP * fi), cMid = contorno(m, m.a0 + rows * DEP * fm, m.b0 + rows * DEP * fm), cOut = contorno(m, aM + 1.5, bM + 1.5);
    anel(cOut, cMid, lam(m.corTeto || "#eeece6"), yT, 0.5); // tetoIn: até onde o teto avança sobre a arquibancada (fração das fileiras)
    anel(cMid, cIn, new T.MeshLambertMaterial({ color: "#ffffff", transparent: true, opacity: .35, depthWrite: false }), yT + 0.1, 0.2);
    anel(cOut, contorno(m, aM + 0.9, bM + 0.9), lam(hx[0]), yT - 1.1, 1.6);
    anel(cIn, contorno(m, m.a0 + rows * DEP * fi - 0.6, m.b0 + rows * DEP * fi - 0.6), lam("#d3d1c7"), yT - 0.6, 1.2);
    const st = Math.max(1, Math.floor(cOut.length / 56)), tr = []; for (let i = 0; i < cOut.length; i += st) tr.push(i);
    inst(tr, (i, j, im) => { const [ox, oz] = cOut[i], [ix, iz] = cIn[i], L2 = Math.hypot(ox - ix, oz - iz) - 1.5; dm.position.set((ox + ix) / 2, yT + 0.75, (oz + iz) / 2); dm.rotation.set(0, -Math.atan2(iz - oz, ix - ox), 0); dm.scale.set(L2, 0.5, 0.3); dm.updateMatrix(); im.setMatrixAt(j, dm.matrix); }, lam("#c4c0b5")); }
  if (dunas) { anel(DG.O, contorno(m, DG.inner, DG.bInner), lam("#cfcbc1"), 0, POD);
    anel(contorno(m, aM + 3, bM + 3), contorno(m, aM + 1, bM + 1), new T.MeshLambertMaterial({ color: "#7fa6ad", transparent: true, opacity: .8 }), POD, 4);
    malha(DG.casca, new T.MeshLambertMaterial({ color: "#4f747c", side: T.DoubleSide }));
    const pm = new T.MeshLambertMaterial({ color: "#f6f5f1", side: T.DoubleSide }); DG.petalas.forEach(g => malha(g, pm));
    const rm = lam("#d6d2c8"), dk = lam("#bdb9ae"); for (const r of DG.rampas) { const yaw = Math.atan2(r.d[0], r.d[1]);
      const b = new T.Mesh(new T.BoxGeometry(7, 0.7, 15), rm); b.rotation.order = "YXZ"; b.rotation.y = yaw; b.rotation.x = Math.atan(POD / 15); b.position.set(r.o[0] + r.d[0] * 7, POD / 2, r.o[1] + r.d[1] * 7); b.castShadow = b.receiveShadow = true; grp.add(b);
      for (const s of [-1, 1]) { const w = new T.Mesh(new T.BoxGeometry(0.4, 1.1, 15), dk); w.rotation.order = "YXZ"; w.rotation.y = yaw; w.rotation.x = Math.atan(POD / 15); w.position.set(r.o[0] + r.d[0] * 7 + Math.cos(yaw) * s * 3.5, POD / 2 + 0.6, r.o[1] + r.d[1] * 7 - Math.sin(yaw) * s * 3.5); grp.add(w); }
      const pl = new T.Mesh(new T.BoxGeometry(9, 0.25, 5), dk); pl.rotation.y = yaw; pl.position.set(r.o[0] + r.d[0] * 16.5, 0.12, r.o[1] + r.d[1] * 16.5); pl.receiveShadow = true; grp.add(pl); }
    if (nomeE) { const { r } = nomeTex(nomeE, "#000"); const hN = Math.min(9, DG.H * 0.24), w = Math.min(r * hN, 120); for (const sul of [true, false]) { const f = DG.faixa(w, sul, w / r); nome3D(nomeE, f.bot, f.top, f.us, hx[0]); } } }
  for (const sd of cob) { const sp = pos.filter(p => p.ld == sd); if (!sp.length) continue;
    const ns = sd == "N" || sd == "S", sg = sd == "N" || sd == "W" ? -1 : 1, v = sp.map(p => ns ? p.x : p.z), mn = Math.min(...v), mx = Math.max(...v), eo = (ns ? bM : aM) + 0.9, ei = (ns ? m.b0 : m.a0) + rows * DEP * 0.28, len = mx - mn + 1.5, dep = eo - ei, mid = (mn + mx) / 2, c = sg * (eo + ei) / 2;
    const rf = bloco(ns ? len : dep, 0.4, ns ? dep : len, lam("#e9e7e1"), ns ? mid : c, yC + 0.6, ns ? c : mid);
    if (ns) rf.rotation.x = sg * 0.07; else rf.rotation.z = -sg * 0.07;
    bloco(ns ? len : 0.3, 1.1, ns ? 0.3 : len, lam(hx[0]), ns ? mid : sg * ei, yC + 0.6 + dep / 2 * 0.07, ns ? sg * ei : mid);
    for (let t = mn; t <= mx + 0.1; t += 8) bloco(0.5, yC + 0.4, 0.5, lam("#8f8b82"), ns ? t : sg * (eo - 0.4), (yC + 0.4) / 2, ns ? sg * (eo - 0.4) : t); }
  if (C.refletores && !m.teto) { const f = m.R == null ? 0.75 : 0.97; for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) torre(sx * (aM + 7) * f, sz * (bM + 7) * f, topH + 26); }
  if (m.palcos) { const z0 = m.b0 + m.palcos * DEP, z1 = z0 + 8, xs = () => aM + 0.5, feito = prev && !C.reforma ? prev + (rows - prev) * obra : rows * obra, Hb = hRow(Math.max(1, Math.round(feito)) - 1) + 1.6;
    const pr = new T.Mesh(new T.ExtrudeGeometry(shapeDe([[-xs(z0), z0], [xs(z0), z0], [xs(z1), z1], [-xs(z1), z1]]), { depth: Hb, bevelEnabled: false }), lam("#d6d2c8")); pr.rotation.x = -Math.PI / 2; pr.castShadow = pr.receiveShadow = true; grp.add(pr);
    const vidro = lam("#33444f"); for (let y = 2.4; y < Hb - 1.5; y += 3.2) bloco(2 * xs(z0) - 3, 1.7, 0.2, vidro, 0, y, z0 - 0.05);
    bloco(2 * xs(z0), 0.9, 0.3, lam(hx[0]), 0, Hb - 0.45, z0 - 0.1);
    if (nomeE && Hb > 7) { const { r } = nomeTex(nomeE, "#000"), w = Math.min(r * Math.min(8, Hb * 0.3), 2 * xs(z1) * 0.9), hh = w / r, y0 = Hb * 0.55, pts = []; for (let x = -w / 2; x <= w / 2 + 0.01; x += 1) pts.push(x);
      nome3D(nomeE, pts.map(x => [x, y0 - hh / 2, z1 + 0.2]), pts.map(x => [x, y0 + hh / 2, z1 + 0.2]), pts.map(x => (x + w / 2) / w), hx[0]); } }
  if (m.aberta) telao(m.a0 + 4, 10, 0, -6);
  else if (m.laterais) telao(-(m.a0 + 4), 10, 0, -6);
  else if (teto) telao(-(m.a0 + rows * DEP * 0.5) + 1, yT - 4.6, 0, 4.5);
  else if (dunas) telao(-(m.a0 + rows * DEP * 0.3) + 2, POD + DG.H - 9, 0, 5);
  else if (m.cantos) { const o = Math.min(rows, 28) * DEP * 0.45; telao(-(FA + 3 + o * 0.9), topH * 0.6 + 4, -(FB + 3 + o * 0.9), -(topH * 0.6)); }
  else telao(-(aM + 1.2), topH + 6, 0, -4);
  const sigP = sig.trim() || " ", pt = placaTex(celulasDasPlacas(sigP, hx[0], hx[1])), mk = len => { const t = pt.clone(); t.needsUpdate = true; t.repeat.x = len / pt.userData.m; return [0, 1, 2, 3, 4, 5].map(i => i > 3 ? new T.MeshLambertMaterial({ map: t }) : lam("#2c2c2a")); };
  const zP = m.pista ? FB + 1.2 : FB + 2.5, xP = m.pista ? FA + 2.5 : FA + 3.2;
  bloco(2 * xP, 0.9, 0.2, mk(2 * xP), 0, 0.45, -zP);
  bloco(xP - 20, 0.9, 0.2, mk(xP - 20), -(xP + 20) / 2, 0.45, zP); bloco(xP - 20, 0.9, 0.2, mk(xP - 20), (xP + 20) / 2, 0.45, zP);
  for (const s of [-1, 1]) { const t = pt.clone(); t.needsUpdate = true; t.repeat.x = 2 * zP / pt.userData.m; bloco(0.2, 0.9, 2 * zP, [0, 1, 2, 3, 4, 5].map(i => i < 2 ? new T.MeshLambertMaterial({ map: t }) : lam("#2c2c2a")), s * xP, 0.45, 0); }
  const zB = m.pista ? FB + 1.3 : FB + 2.2, vid = () => new T.MeshLambertMaterial({ color: "#dfe9ef", transparent: true, opacity: .55 });
  for (const s of [-1, 1]) { bloco(9, 0.25, 2.2, vid(), s * 10, 1.9, zB); bloco(9, 0.5, 0.6, lam("#185FA5"), s * 10, 0.5, zB + 0.6); bloco(9, 1.9, 0.15, lam("#bdb9ae"), s * 10, 0.95, zB + 1.05); for (const e of [-1, 1]) bloco(0.15, 1.9, 2.2, vid(), s * 10 + e * 4.5, 0.95, zB); }
  if (m.pista || m.geral) { bloco(3.2, 0.02, 5, lam("#1f1f1d"), 0, 0.1, zB + 0.5); bloco(0.25, 0.8, 5, lam("#f1efe8"), -1.7, 0.4, zB + 0.5); bloco(0.25, 0.8, 5, lam("#f1efe8"), 1.7, 0.4, zB + 0.5); bloco(3.6, 0.8, 0.25, lam("#f1efe8"), 0, 0.4, zB + 3.1); }
  else { const z1 = FB + 1.2, z2 = m.b0 + 0.5; bloco(3.6, 2.8, z2 - z1, lam("#f1efe8"), 0, 1.4, (z1 + z2) / 2); bloco(3.6, 0.8, z2 - z1, lam(hx[0]), 0, 2.6, (z1 + z2) / 2); bloco(2.4, 2.2, 0.1, lam("#2c2c2a"), 0, 1.1, z1 - 0.02); }
  const ag = 0.6 + (m.geral || 0), fp = walk(contorno(m, m.a0 - ag, m.b0 - ag), 2.5).filter(p => !(Math.abs(p.x) < 2.5 && p.z > 0 && !m.pista));
  inst(fp, (p, i, im) => put(im, i, p.x, 1.25, p.z, p.ang, 2.5, 2.5, 0.05), new T.MeshLambertMaterial({ color: "#7d8a90", transparent: true, opacity: .35, depthWrite: false }));
  inst(fp, (p, i, im) => put(im, i, p.x, 1.3, p.z, p.ang, 0.12, 2.6, 0.12, new T.Color("#5f5e5a")));
  inst(fp, (p, i, im) => put(im, i, p.x, 2.55, p.z, p.ang, 2.55, 0.1, 0.1, new T.Color("#5f5e5a")));
  if (m.laterais) { // Estádio do Braga: cabos ligando as duas coberturas por cima do campo (a rocha de Braga ficou estranha no meio da cidade)
    const ei = m.b0 + rows * DEP * 0.28, cab = []; for (let x = -(FA + 1); x <= FA + 1; x += 7) cab.push(x, yC + 0.6, -ei, x, yC + 0.6, ei);
    const gc = new T.BufferGeometry(); gc.setAttribute("position", new T.Float32BufferAttribute(cab, 3)); grp.add(new T.LineSegments(gc, new T.LineBasicMaterial({ color: "#3d3d3a" }))); }
  if (m.pele) { // Inflável: almofadas em losango em volta de tudo, na cor do clube; a pele estufa no meio da altura
    const Hs = teto ? yT + 0.5 : topH + 2, e = Math.min(1, Hs / 30), ta = 2.6 * Math.max(0.6, e), of = y => 1.5 + 1.5 * e + 5 * e * Math.sin(Math.PI * y / Hs), base = new T.Color(fes ? fcs[0] : hx[0]), alm = [], DY = ta * 0.707, DX = ta * 1.414; rng = 41;
    for (let j = 0, y = DY / 2; y < Hs - 0.6; j++, y += DY) { const pts = walk(contorno(m, aM + of(y), bM + of(y)), DX), use = j % 2 ? pts.map((p, i) => { const q = pts[(i + 1) % pts.length]; return { x: (p.x + q.x) / 2, z: (p.z + q.z) / 2, ang: p.ang }; }) : pts;
      for (const p of use) alm.push({ ...p, y, c: base.clone().lerp(new T.Color("#ffffff"), 0.2 + 0.25 * rnd()) }); }
    const im = new T.InstancedMesh(box, new T.MeshLambertMaterial({ emissive: base.clone().multiplyScalar(0.25) }), alm.length); dm.rotation.order = "YXZ";
    alm.forEach((p, i) => { dm.position.set(p.x, p.y, p.z); dm.rotation.set(0, -p.ang, Math.PI / 4); dm.scale.set(ta, ta, 0.7); dm.updateMatrix(); im.setMatrixAt(i, dm.matrix); im.setColorAt(i, p.c); });
    dm.rotation.order = "XYZ"; im.castShadow = im.receiveShadow = true; grp.add(im);
    anel(contorno(m, aM + of(Hs) + 0.6, bM + of(Hs) + 0.6), contorno(m, aM + 0.5, bM + 0.5), lam("#eeece6"), Hs - 0.2, 0.4);
    if (nomeE) { const { r } = nomeTex(nomeE, "#000"), y0 = Hs * 0.45, hN = Math.min(7, Hs * 0.22), o = of(y0) + 1.1, w = Math.min(r * hN, 2 * (m.a0 - m.R) * 0.95), hh = w / r;
      for (const sul of [true, false]) { const pts = walk(contorno(m, aM + o, bM + o), 1).filter(p => (sul ? p.z > 0 : p.z < 0) && Math.abs(p.x) <= w / 2).sort((a, b) => sul ? a.x - b.x : b.x - a.x);
        nome3D(nomeE, pts.map(p => [p.x, y0 - hh / 2, p.z]), pts.map(p => [p.x, y0 + hh / 2, p.z]), pts.map(p => sul ? (p.x + w / 2) / w : (w / 2 - p.x) / w), hx[0]); } } }
  if (m.torres) { // San Siro: torres listradas (a rampa em espiral vista de fora: faixa clara a cada 3,2 m sobre o núcleo escuro); as de canto passam do teto, lisas
    const faixa = [], tt = torresSS(), cf = new T.Color("#e6e1d4");
    for (const t of tt) { const Hs = t.c || !teto ? topH + 1.6 : yT, Ht = t.c ? yT + 7.2 : Hs, ns = 20, seg = 2 * Math.PI * t.r / ns * 1.12;
      const nu = new T.Mesh(new T.CylinderGeometry(t.r - 0.5, t.r - 0.5, Hs, 20), lam("#8d897f")); nu.position.set(t.x, Hs / 2, t.z); nu.castShadow = true; grp.add(nu);
      const tp = new T.Mesh(new T.CylinderGeometry(t.r + 0.1, t.r + 0.1, Ht - Hs + 0.6, 24), lam("#e9e5da")); tp.position.set(t.x, (Hs + Ht) / 2, t.z); tp.castShadow = true; grp.add(tp);
      for (let k = 0, y = 0.9; y < Hs - 0.8; k++, y += 3.2 / ns) { const th = k * 2 * Math.PI / ns; faixa.push({ x: t.x + t.r * Math.cos(th), z: t.z + t.r * Math.sin(th), y, ang: th + Math.PI / 2, seg }); } }
    inst(faixa, (p, i, im) => put(im, i, p.x, p.y, p.z, p.ang, p.seg, 1.7, 0.5, cf));
    if (teto) { // treliças vermelhas: as 4 grandes entre as torres de canto, com os "chifres" para fora, e uma grade menor por cima de cada lado do teto
      const cc = tt.filter(t => t.c), mb = [], y0 = yT + 1.2, ys = yT + 0.55, zI = m.b0 + rows * DEP * m.tetoIn, xI = m.a0 + rows * DEP * m.tetoIn, zO = bM + 1.5, xO = aM + 1.5, xr = m.a0 - 6, zr = m.b0 - 6;
      const tr = (a, b, y, hT, e) => { const L = Math.hypot(b.x - a.x, b.z - a.z), yaw = Math.atan2(b.z - a.z, b.x - a.x), n = Math.max(1, Math.round(L / hT)), st = L / n, dx = (b.x - a.x) / n, dz = (b.z - a.z) / n;
        for (const yy of [y, y + hT]) mb.push([(a.x + b.x) / 2, yy, (a.z + b.z) / 2, yaw, 0, L, e]);
        for (let j = 0; j <= n; j++) { const x = a.x + dx * j, z = a.z + dz * j; mb.push([x, y + hT / 2, z, yaw, Math.PI / 2, hT, e * 0.6]); if (j < n) mb.push([x + dx / 2, y + hT / 2, z + dz / 2, yaw, (j % 2 ? 1 : -1) * Math.atan2(hT, st), Math.hypot(hT, st), e * 0.6]); } };
      cc.forEach((a, i) => { const b = cc[(i + 1) % 4], L = Math.hypot(b.x - a.x, b.z - a.z), ux = (b.x - a.x) / L, uz = (b.z - a.z) / L; tr(a, b, y0, 5, 0.9);
        for (const [p, s] of [[a, -1], [b, 1]]) mb.push([p.x + s * ux * (p.r + 4.5), y0 + 3, p.z + s * uz * (p.r + 4.5), Math.atan2(uz, ux), s * 0.22, 9, 4.2, 1.8]); });
      for (const sg of [-1, 1]) { const nx = Math.max(1, Math.round(2 * xr / 11)), nz = Math.max(1, Math.round(2 * zr / 11));
        for (let j = 0; j <= nx; j++) { const x = -xr + 2 * xr * j / nx; tr({ x, z: sg * zI }, { x, z: sg * zO }, ys, 2.5, 0.4); }
        for (let j = 0; j <= nz; j++) { const z = -zr + 2 * zr * j / nz; tr({ x: sg * xI, z }, { x: sg * xO, z }, ys, 2.5, 0.4); }
        tr({ x: -xr, z: sg * zI }, { x: xr, z: sg * zI }, ys, 2.5, 0.4); tr({ x: sg * xI, z: -zr }, { x: sg * xI, z: zr }, ys, 2.5, 0.4); }
      barras(mb, lam("#c8102e")); } }
  if (m.arco) { // Wembley: arco branco com anéis de treliça, sapatas nos fundos e cabos até a borda do teto
    const ap = arcoPts(topH), br = lam("#f4f3ef"), zz = new T.Vector3(0, 0, 1);
    for (const tp of ap.trechos) { const curva = new T.CatmullRomCurve3(tp.map(p => new T.Vector3(...p))), fr = (tp.length - 1) / 64, na = Math.max(1, Math.round(90 * fr));
      const tubo = new T.Mesh(new T.TubeGeometry(curva, Math.max(8, Math.round(160 * fr)), 1.6, 10, false), br); tubo.castShadow = true; grp.add(tubo);
      const an = new T.InstancedMesh(new T.TorusGeometry(2.2, 0.22, 6, 14), br, na);
      for (let i = 0; i < na; i++) { const t = (i + 0.5) / na; dm.position.copy(curva.getPointAt(t)); dm.quaternion.setFromUnitVectors(zz, curva.getTangentAt(t)); dm.scale.set(1, 1, 1); dm.updateMatrix(); an.setMatrixAt(i, dm.matrix); }
      an.castShadow = true; grp.add(an); }
    for (const s of [-1, 1]) bloco(8, 3, 8, lam("#bdb9ae"), s * ap[64][0], 1.5, 0);
    if (ap.f < 1) { // arco por terminar: guindaste de torre amarelo ao lado do pé leste, lança sobre o arco
      const am = lam("#f2b200"), w = 2, cx = ap[64][0] + 4, cz = 9, n = Math.round(ap.f * 32), Hg = Math.ceil(((ap.trechos[0] || ap)[n] || ap[0])[1] + 14), tre = [];
      for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) bloco(0.25, Hg, 0.25, am, cx + sx * w / 2, Hg / 2, cz + sz * w / 2);
      for (let y = 1; y < Hg - 1; y += 2) for (const sg of [-1, 1]) { const tl = (y % 4 == 1 ? 1 : -1) * Math.atan2(2, w), L = Math.hypot(2, w);
        tre.push([cx, y + 1, cz + sg * w / 2, 0, tl, L, 0.12], [cx + sg * w / 2, y + 1, cz, Math.PI / 2, tl, L, 0.12]); }
      barras(tre, am);
      const Lj = 30, Lc = 9; bloco(Lj + Lc, 1, 1, am, cx - (Lj - Lc) / 2, Hg + 0.5, cz); // lança (oeste) e contralança
      bloco(3, 2.2, 1.8, lam("#8f8b82"), cx + Lc - 1.5, Hg - 0.6, cz); bloco(1.8, 1.6, 1.8, am, cx, Hg - 0.8, cz + 1.9); // contrapeso e cabine
      bloco(1.6, 3, 1.6, am, cx, Hg + 2.5, cz); bloco(0.08, Hg * 0.45, 0.08, lam("#2c2c2a"), cx - Lj * 0.7, Hg - Hg * 0.225, cz); // topo e cabo do gancho
      bloco(6, 1, 6, lam("#bdb9ae"), cx, 0.5, cz); }
    if (teto) { // teto cinza quase fechado, treliça branca em zigue-zague na borda de fora e cabos do arco só para o teto norte
      const zg = []; walk(contorno(m, aM + 1.2, bM + 1.2), 2.5).forEach((p, i) => { zg.push([p.x, yT + 2.4, p.z, p.ang, (i % 2 ? 1 : -1) * Math.atan2(3, 2.5), Math.hypot(3, 2.5), 0.25], [p.x, yT + 3.9, p.z, p.ang, 0, 2.6, 0.3]); }); barras(zg, br);
      const cO = contorno(m, aM + 1.5, bM + 1.5).filter(q => q[1] < 0), cab = [], borda = x => cO.reduce((b, q) => Math.abs(q[0] - x) < Math.abs(b[0] - x) ? q : b);
      if (ap.f == 1) for (let i = 6; i <= 58; i += 3) { const [x, y, z] = ap[i]; if (Math.abs(x) > aM - 6) continue; const q = borda(x); cab.push(x, y, z, q[0], yT + 0.9, q[1]); }
      const gc = new T.BufferGeometry(); gc.setAttribute("position", new T.Float32BufferAttribute(cab, 3)); grp.add(new T.LineSegments(gc, new T.LineBasicMaterial({ color: "#6f6c64" }))); } }
  if (m.geral) { // Maracanã: a geral é uma faixa de concreto rente ao campo, com gente em pé, atrás de um fosso
    const G = m.geral; anel(contorno(m, m.a0 + 0.2, m.b0 + 0.2), contorno(m, m.a0 - G, m.b0 - G), lam("#bdb9ae"), 0, 0.9);
    anel(contorno(m, m.a0 - G, m.b0 - G), contorno(m, m.a0 - G - 2.4, m.b0 - G - 2.4), lam("#46525a"), 0, 0.05);
    const linha = walk(contorno(m, m.a0 - G / 2, m.b0 - G / 2), 1), pal = ["#f1efe8", "#2c2c2a", "#c8102e", "#f2c200", "#185fa5", "#888780", hx[0], hx[1]].map(c => new T.Color(c)), gente = []; rng = 53;
    for (const p of linha) for (let k = 0; k < 3; k++) if (rnd() < niv / 10) { const [nx, nz] = out(p), o = (rnd() - 0.5) * (G - 1); gente.push({ x: p.x + nx * o + Math.cos(p.ang) * (rnd() - 0.5), z: p.z + nz * o + Math.sin(p.ang) * (rnd() - 0.5), c: pal[(rnd() * pal.length) | 0] }); }
    if (gente.length) inst(gente, (g, i, im) => put(im, i, g.x, 1.75, g.z, 0, 0.55, 1.7, 0.55, g.c)); }
  if (yM) { // Maracanã: marquise de concreto em anel, em balanço sobre a arquibancada, apoiada nos pilares de fora
    anel(contorno(m, aM + 2.6, bM + 2.6), contorno(m, m.a0 + rows * DEP * 0.42, m.b0 + rows * DEP * 0.42), lam("#ebe9e3"), yM, 0.6);
    anel(contorno(m, m.a0 + rows * DEP * 0.42 + 0.8, m.b0 + rows * DEP * 0.42 + 0.8), contorno(m, m.a0 + rows * DEP * 0.42, m.b0 + rows * DEP * 0.42), lam(hx[0]), yM - 0.5, 1.1);
    inst(walk(contorno(m, aM + 2.1, bM + 2.1), 4), (p, i, im) => put(im, i, p.x, yM / 2, p.z, p.ang, 0.8, yM, 1.6, new T.Color(hx[0]))); // pilares na cor do clube (no Maracanã, azuis)
    for (const f of [1 / 3, 2 / 3]) anel(contorno(m, aM + 2.8, bM + 2.8), contorno(m, aM + 0.8, bM + 0.8), lam("#f1efe8"), yM * f - 0.35, 0.7);
    const cI = contorno(m, m.a0 + rows * DEP * 0.42, m.b0 + rows * DEP * 0.42), cO = contorno(m, aM + 2.6, bM + 2.6), st = Math.max(1, Math.round(cO.length / (perim(cO) / 3.5))), nv = []; // nervuras radiais e a aba segmentada na borda
    for (let i = 0; i < cO.length; i += st) { const [ox, oz] = cO[i], [ix, iz] = cI[i], yaw = Math.atan2(iz - oz, ix - ox), L = Math.hypot(ix - ox, iz - oz);
      nv.push([(ox + ix) / 2, yM + 0.75, (oz + iz) / 2, yaw, 0, L, 0.3, 0.3], [ox, yM - 0.3, oz, yaw, Math.PI / 2, 1.8, 0.3, 0.3]); }
    barras(nv, lam("#dcdad3")); }
  barracas(aM, bM, topH, dunas, nb, hx);
  if (obra < 1) canteiro(aM, bM, hx, dunas, esp, ext0);
  if (m.rampas && niv >= 2) rampas();
  if (nb) { const zc = L.z0 + L.D / 2; bloco(L.W + 6, 0.02, L.D + 6, lam("#d8d4ca"), 0, 0.01, zc);
    const lt = plano(new T.PlaneGeometry(L.W, L.D), new T.MeshLambertMaterial({ map: loteTex(L) }), 0.04); lt.position.z = zc; grp.add(lt);
    const ac0 = bM + (dunas ? 31 : 8); bloco(10, 0.05, L.z0 - ac0, lam("#5a5955"), 0, 0.03, (ac0 + L.z0) / 2);
    const pal = ["#e8e6e0", "#2c2c2a", "#a32d2d", "#185fa5", "#888780", "#c9c6bd", "#3b6d11", "#e8e6e0", "#444441"].map(c => new T.Color(c)), carros = [];
    rng = 11; for (const v of L.v) if (rnd() < lotacao()) carros.push({ ...v, c: pal[(rnd() * pal.length) | 0] });
    inst(carros, (v, i, im) => put(im, i, v.x, 0.65, v.z + v.dir * 0.2, Math.PI / 2, 4.3, 0.9, 1.8, v.c));
    inst(carros, (v, i, im) => put(im, i, v.x, 1.35, v.z - v.dir * 0.2, Math.PI / 2, 2.2, 0.65, 1.6, new T.Color("#3a4652")));
    const ps = []; for (let x = -L.W / 2 + 12; x < L.W / 2; x += 30) for (const za of L.bands) ps.push([x, L.z0 + za + 5]); inst(ps, ([x, z], i, im) => put(im, i, x, 5, z, 0, 0.3, 10, 0.3, new T.Color("#6f6c64"))); }
  cur.render(); }

// Entorno: um pedaço de cidade em volta do estádio, sorteado pela semente (o id do clube), para cada estádio parecer estar numa cidade
// diferente. Cinco tipos: centro (prédios altos), bairro (casas e árvores), rio, lago e litoral. Tudo instanciado e sem sombra (leve).
export const CIDADES = { centro: "Centro", bairro: "Bairro", rio: "Beira-rio", lago: "Lago", litoral: "Litoral" };
const CEU = "#dde8ee";
export const cidadeDoEstadio = c => CIDADES[c.cidade] ? c.cidade : Object.keys(CIDADES)[Math.abs(c.semente | 0) % 5];
function entorno(cx, zN, zS) {
  let sd = Math.abs((C.semente | 0) * 7919) % 2147483646 + 1; const r = () => (sd = (sd * 16807) % 2147483647) / 2147483647;
  const tipo = cidadeDoEstadio(C);
  const E = Math.max(cx, zS, -zN) * 2.3 + 140, zc = (zN + zS) / 2;
  const geoUp = g => { g.translate(0, 0.5, 0); return g; }, add = (geo, lista, set, opcoes) => { if (!lista.length) return;
    const im = new T.InstancedMesh(geo, new T.MeshLambertMaterial(opcoes || {}), lista.length); lista.forEach((p, i) => set(p, i, im)); grp.add(im); };
  const pos = (im, i, x, y, z, rot, sx, sy, sz, c) => { dm.position.set(x, y, z); dm.rotation.set(0, rot, 0); dm.scale.set(sx, sy, sz); dm.updateMatrix(); im.setMatrixAt(i, dm.matrix); if (c) im.setColorAt(i, c); };
  const cor = lista => new T.Color(lista[(r() * lista.length) | 0]);
  // chão
  grp.add(plano(new T.CircleGeometry(E + 400, 48), new T.MeshLambertMaterial({ color: { centro: "#a7ad98", bairro: "#88a862", rio: "#8ca967", lago: "#87a45f", litoral: "#98ad6c" }[tipo] }), -0.06));
  // água: rio ao norte, lago de um lado, mar ao norte com praia
  let naAgua = () => false, perto = () => 1e9, zMar = null;
  const azul = new T.MeshLambertMaterial({ color: "#5d8fb0" }), areia = new T.MeshLambertMaterial({ color: "#e3d3a8" });
  if (tipo === "rio") { const z0 = zN - 48 - r() * 20, w = 34 + r() * 16, fase = r() * 6, zr = x => z0 + 18 * Math.sin(x / 70 + fase), top = [], bot = [];
    for (let x = -E - 400; x <= E + 400; x += 10) { top.push([x, zr(x) - w / 2]); bot.push([x, zr(x) + w / 2]); }
    grp.add(plano(new T.ShapeGeometry(shapeDe([...top.map(([x, z]) => [x, z - 6]), ...bot.reverse().map(([x, z]) => [x, z + 6])])), new T.MeshLambertMaterial({ color: "#7d9a5a" }), -0.04));
    grp.add(plano(new T.ShapeGeometry(shapeDe([...top, ...bot])), azul, -0.02));
    naAgua = (x, z) => Math.abs(z - zr(x)) < w / 2 + 10; perto = (x, z) => Math.abs(z - zr(x)) - w / 2; }
  if (tipo === "lago") { const lado = r() < 0.5 ? -1 : 1, ra = 60 + r() * 30, rb = 45 + r() * 25, lx = lado * (cx + ra + 40), lz = zc + (r() - 0.5) * 80;
    const elipse = (a, b) => { const p = []; for (let i = 0; i < 64; i++) { const t = i / 64 * 2 * Math.PI, w = 1 + 0.08 * Math.sin(3 * t + 1); p.push([lx + a * w * Math.cos(t), lz + b * w * Math.sin(t)]); } return p; };
    grp.add(plano(new T.ShapeGeometry(shapeDe(elipse(ra + 7, rb + 7))), areia, -0.04)); grp.add(plano(new T.ShapeGeometry(shapeDe(elipse(ra, rb))), azul, -0.02));
    const d = (x, z) => Math.hypot((x - lx) / (ra + 12), (z - lz) / (rb + 12)); naAgua = (x, z) => d(x, z) < 1.1; perto = (x, z) => (d(x, z) - 1) * ra; }
  if (tipo === "litoral") { const zm = zMar = zN - 60 - r() * 20, praia = plano(new T.PlaneGeometry(2 * E + 800, 30), areia, -0.04); praia.position.z = zm + 15; grp.add(praia);
    const mar = plano(new T.PlaneGeometry(2 * E + 800, E + 400), azul, -0.02); mar.position.z = zm - (E + 400) / 2; grp.add(mar);
    naAgua = (x, z) => z < zm + 36; perto = (x, z) => z - zm - 30; }
  // áreas sem casas: as rampas do Maracanã (naRampa) e a Wembley Way (avenida no eixo leste, à vista da câmera, mais comprida a cada nível, até a água)
  const livres = []; let via = null;
  if (m.via) { const x0 = cx - 14; let x1 = x0; while (x1 < x0 + 50 + 30 * niv && !naAgua(x1 + 4, 0)) x1 += 4; via = { x0, x1, w: 22 }; livres.push([x0, x1 + 10, -22, 22]); }
  const livre = (x, z, f = 12) => !naRampa(x, z, f) && !livres.some(([x0, x1, z0, z1]) => x > x0 && x < x1 && z > z0 && z < z1);
  // ruas: o anel em volta da esplanada e avenidas a cada 96 m para fora
  const ruasX = [], ruasZ = [], M = 96;
  for (let x = cx + 6; x < E; x += M) ruasX.push(x, -x);
  for (let z = zS + 6; z < zc + E; z += M) ruasZ.push(z);
  for (let z = zN - 6; z > zc - E && (zMar == null || z > zMar + 36); z -= M) ruasZ.push(z);
  const asf = new T.MeshLambertMaterial({ color: "#5b5c60" });
  const z0r = zMar == null ? zc - E : zMar + 30; // no litoral as avenidas acabam na praia
  for (const x of ruasX) { const p = plano(new T.PlaneGeometry(9, zc + E - z0r), asf, 0.02); p.position.x = x; p.position.z = (z0r + zc + E) / 2; grp.add(p); }
  for (const z of ruasZ) { const p = plano(new T.PlaneGeometry(2 * E, 9), asf, 0.02); p.position.z = z; grp.add(p); }
  const naRua = (x, z, f) => ruasX.some(rx => Math.abs(x - rx) < 4.5 + f) || ruasZ.some(rz => Math.abs(z - rz) < 4.5 + f);
  // lotes de 22 m: prédio, casas, praça ou vazio, conforme o tipo e a distância do estádio
  const predios = [], casas = [], telhados = [], copas = [], troncos = [], L = 22;
  const PAREDE = ["#d9d4c7", "#c9c2b2", "#b8b9b5", "#e6e1d3", "#cdbfa6", "#bfb7a8", "#d6cdbb"], VIDRO = ["#8fa6b8", "#6f8799", "#a9bccb", "#7d93a3", "#c2ccd2"];
  const CASA = ["#efe6d2", "#e8d3b0", "#d9c6a5", "#f2efe6", "#cfd8c4", "#e9c9b5", "#d8dee6"], TELHA = ["#a5462f", "#8e3b28", "#b8593a", "#6b5d55", "#9a4a36"], FOLHA = ["#4f7a2e", "#5e8a35", "#3f6b2a", "#6a9440"];
  const arvore = (x, z, t) => { const h = t * (5 + r() * 4); troncos.push([x, z, h * 0.35]); copas.push([x, z, h, cor(FOLHA)]); };
  for (let x = -E; x <= E; x += L) for (let z = zc - E; z <= zc + E; z += L) {
    const jx = x + (r() - 0.5) * 3, jz = z + (r() - 0.5) * 3, d = Math.hypot(jx, jz - zc) / E;
    if (d > 1 || (jx > -cx - 6 && jx < cx + 6 && jz > zN - 6 && jz < zS + 6) || naAgua(jx, jz) || naRua(jx, jz, 7) || !livre(jx, jz)) continue;
    const u = r(), beira = perto(jx, jz) < 45, dc = Math.max(Math.abs(jx) - cx, zN - jz, jz - zS), baixo = dc < 45; // perto da esplanada, nada alto tampa o estádio
    if (u < (tipo === "bairro" ? 0.1 : 0.14)) { for (let k = 0; k < 5; k++) arvore(jx + (r() - 0.5) * 16, jz + (r() - 0.5) * 16, 1); continue; } // praça
    if (u > 0.94) continue; // terreno vazio
    const alto = tipo === "centro" ? (d < 0.55 ? 0.85 : 0.5) : tipo === "bairro" ? 0.08 : beira ? 0.5 : 0.3;
    if (r() < alto) { const w = 12 + r() * 7, dpt = 12 + r() * 7, h = tipo === "centro" ? 18 + Math.pow(r(), 1.6) * (d < 0.5 ? 90 : 40) : beira ? 10 + r() * 16 : 8 + r() * 20;
      predios.push([jx, jz, 0, w, baixo ? Math.min(h, 7 + dc / 4) : h, dpt, cor(h > 30 && !baixo ? VIDRO : PAREDE)]); }
    else { const n = 2 + ((r() * 3) | 0); for (let k = 0; k < n; k++) { const hx = jx + (k % 2 ? 5 : -5) + (r() - 0.5) * 2, hz = jz + (k > 1 ? 5 : -5) + (r() - 0.5) * 2, w = 6 + r() * 2.5, dd = 5 + r() * 2, h = 3 + r() * 3, rot = r() < 0.5 ? 0 : Math.PI / 2;
        casas.push([hx, hz, rot, w, h, dd, cor(CASA)]); telhados.push([hx, hz, rot, w, h, dd, cor(TELHA)]); }
      if (r() < 0.5) arvore(jx + (r() - 0.5) * 18, jz + (r() - 0.5) * 18, 0.8); }
  }
  // árvores na beira da água e em volta da esplanada
  for (let i = 0; i < 160; i++) { const t = r() * 2 * Math.PI, rr = 1 + r() * 0.15, x = Math.cos(t) * (cx + 14) * rr, z = zc + Math.sin(t) * ((zS - zN) / 2 + 14) * rr; if (!naRua(x, z, 2) && livre(x, z, 3)) arvore(x, z, 0.9); }
  if (via) { const Lv = via.x1 - via.x0, xm = (via.x0 + via.x1) / 2, c1 = C.cores[0], c2 = C.cores[1] || "#ffffff", postes = [], bandeiras = [];
    const pv = plano(new T.PlaneGeometry(Lv, via.w), new T.MeshLambertMaterial({ color: "#d3ccbc" }), 0.1); pv.position.x = xm; grp.add(pv); // 0,1: por cima das ruas que cruzam
    for (const s of [-1, 1]) { const f = plano(new T.PlaneGeometry(Lv, 1.4), new T.MeshLambertMaterial({ color: c1 }), 0.13); f.position.x = xm; f.position.z = s * (via.w / 2 - 2.5); grp.add(f); }
    for (let x = via.x0 + 6, i = 0; x < via.x1 - 2; x += 12, i++) for (const s of [-1, 1]) { postes.push([x, s * (via.w / 2 - 0.8)]); bandeiras.push([x + 1.2, s * (via.w / 2 - 0.8), new T.Color(i % 2 ? c2 : c1)]); }
    add(geoUp(new T.BoxGeometry(1, 1, 1)), postes, ([x, z], k, im) => pos(im, k, x, 0, z, 0, 0.3, 8.5, 0.3, new T.Color("#5f5e5a")));
    add(geoUp(new T.BoxGeometry(1, 1, 1)), bandeiras, ([x, z, c], k, im) => pos(im, k, x, 4, z, 0, 2.2, 4, 0.1, c)); }
  add(geoUp(new T.BoxGeometry(1, 1, 1)), predios, ([x, z, , w, h, d, c], i, im) => pos(im, i, x, 0, z, 0, w, h, d, c));
  add(geoUp(new T.BoxGeometry(1, 1, 1)), casas, ([x, z, rot, w, h, d, c], i, im) => pos(im, i, x, 0, z, rot, w, h, d, c));
  const tel = new T.ConeGeometry(0.75, 1, 4); tel.rotateY(Math.PI / 4); tel.translate(0, 0.5, 0);
  add(tel, telhados, ([x, z, rot, w, h, d, c], i, im) => pos(im, i, x, h, z, rot, w * 1.12, 2.4, d * 1.12, c));
  add(geoUp(new T.BoxGeometry(1, 1, 1)), troncos, ([x, z, h], i, im) => pos(im, i, x, 0, z, 0, 0.5, h, 0.5, new T.Color("#6b5a45")));
  add(new T.IcosahedronGeometry(1, 0), copas, ([x, z, h, c], i, im) => pos(im, i, x, h * 0.62, z, r() * 6, h * 0.36, h * 0.42, h * 0.36, c), { flatShading: true });
  cur.scene.fog = new T.Fog(CEU, cur.dist * 0.95, cur.dist + E * 0.95);
}

// Barracas de comida e bebida (118_comida_no_estadio.sql) na esplanada: 4 + 2 por nível; a fila em cada uma segue o humor da torcida (0 a 5 pessoas)
function barracas(aM, bM, topH, dunas, nb, hx) {
  const off = dunas ? 25 : m.pele ? 13 : m.folga ? m.folga + 4 : 5.5, ring = walk(contorno(m, aM + off, bM + off), 1), n = 4 + 2 * niv, fila = Math.round(5 * Math.min(16, Math.max(0, C.humor ?? 8)) / 16);
  const f = m.R == null ? 0.75 : 0.97, torres = C.refletores && !m.teto ? [[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([sx, sz]) => [sx * (aM + 7) * f, sz * (bM + 7) * f]) : m.torres ? torresSS().filter(t => t.c).map(t => [t.x, t.z]) : [];
  const livre = p => !(nb && p.z > 0 && Math.abs(p.x) < 8) && !naRampa(p.x, p.z, 4) && torres.every(([x, z]) => Math.hypot(p.x - x, p.z - z) > (m.torres ? 9 : 6));
  const pts = []; for (let i = 0; i < n; i++) { const p = ring[Math.floor((i + 0.5) * ring.length / n)]; if (!p) continue; if (m.muralha && p.x < -aM && Math.abs(p.z) < FB + 6) p.x -= rows * DEP * (m.muralha - 1); if (livre(p)) pts.push(p); }
  const fora = p => { const nx = Math.sin(p.ang), nz = -Math.cos(p.ang), s = Math.sign(p.x * nx + p.z * nz) || 1; return [s * nx, s * nz]; };
  const toldo = [hx[0], "#f2c200", hx[1], "#e8742a"].map(c => new T.Color(c)), gente = [], pal = [...toldo, new T.Color("#f1efe8"), new T.Color("#2c2c2a"), new T.Color("#888780")];
  inst(pts, (p, i, im) => put(im, i, p.x, 1.6, p.z, p.ang, 5, 3.2, 3, new T.Color("#f1efe8")));
  inst(pts, (p, i, im) => { const [nx, nz] = fora(p); put(im, i, p.x + nx * 0.6, 3.45, p.z + nz * 0.6, p.ang, 5.6, 0.5, 4.4, toldo[i % toldo.length]); });
  rng = 23; for (const p of pts) { const [nx, nz] = fora(p), tx = Math.cos(p.ang), tz = Math.sin(p.ang);
    for (let k = 0; k < fila; k++) { const d = 2.6 + 1.1 * k, lat = (rnd() - 0.5) * 1.6; gente.push({ x: p.x + nx * d + tx * lat, z: p.z + nz * d + tz * lat, c: pal[(rnd() * pal.length) | 0] }); } }
  if (gente.length) inst(gente, (g, i, im) => put(im, i, g.x, 1, g.z, 0, 0.8, 2, 0.8, g.c)); }

// Obra em andamento: tapume na cor do clube em volta da arquibancada (portões nos quatro eixos) e canteiro com contêineres e material no gramado a oeste, à vista da câmera
function canteiro(aM, bM, hx, dunas, esp, ext0) {
  const o = dunas ? 16 : m.pele ? 10 : m.folga ? m.folga * 0.6 : m.marquise ? 3.6 : 2.5; // por dentro das barracas
  const tp = walk(contorno(m, aM + o, bM + o), 2.4).filter(p => Math.abs(p.x) > 6 && Math.abs(p.z) > 6 && !naRampa(p.x, p.z, 1) && !(m.muralha && p.x < 0 && Math.abs(p.z) < FB + 4));
  inst(tp, (p, i, im) => put(im, i, p.x, 1.25, p.z, p.ang, 2.45, 2.5, 0.12, new T.Color(hx[0])));
  inst(tp, (p, i, im) => put(im, i, p.x, 2.3, p.z, p.ang, 2.46, 0.3, 0.14, new T.Color("#f1efe8")));
  const xIn = aM + (dunas ? 15 : esp) + 0.5, D = Math.min(12, aM + ext0 + (dunas ? 12 : 22) + 1.5 - xIn), g0 = grp, xc = 0, zc = 0, zf = -D / 2 + 1.6; grp = new T.Group(); // montado de lado (x = comprimento, -z = para fora) e girado para o oeste
  bloco(30, 0.04, D, lam("#b59a74"), xc, 0.02, zc);
  const bra = lam("#eeece6"); bloco(6.1, 2.6, 2.4, bra, xc - 9, 1.3, zf); bloco(6.1, 2.6, 2.4, bra, xc - 2.7, 1.3, zf); bloco(6.1, 2.6, 2.4, lam("#185fa5"), xc - 5.9, 3.9, zf); // contêineres
  const vg = []; for (let c = 0; c < 3; c++) for (let k = 0; k < 4 - c; k++) vg.push([xc + 8, 0.25 + c * 0.5, zc + 1 + k * 0.6 + c * 0.3, 0, 0, 9, 0.45, 0.45]); barras(vg, lam("#8a8f94")); // vigas
  for (let k = 0; k < 4; k++) bloco(1.2, 1, 1.2, lam("#9d998f"), xc + 1 + k * 1.6, 0.5, zc + D / 2 - 1.4); // paletes de bloco
  const ar = new T.Mesh(new T.ConeGeometry(2.6, 2, 10), lam("#d8c08a")); ar.position.set(xc + 11, 1, zf + 0.6); ar.castShadow = true; grp.add(ar);
  const g = grp; grp = g0; g.position.set(-(xIn + D / 2), 0, bM * 0.4); g.rotation.y = Math.PI / 2; grp.add(g); }
// Maracanã: duas rampas monumentais (UERJ a oeste, Bellini a leste) saem do anel superior, descem até um patamar na ponta e voltam
// paralelas, do lado sul, até o chão perto da fachada; as quatro menores (B, C, E, F, nas diagonais) descem retas do anel de baixo; do nível 2 em diante.
// Cada rampa: ponto na fachada, direção para fora (normal da elipse), altura, comprimento e a área que ocupa (d para fora, l de lado, sentido sg)
const rampaLista = () => { const aM = m.a0 + rows * DEP, bM = m.b0 + rows * DEP, hT = hRow(rows - 1);
  return [[0, 0.55, 9], [Math.PI, 0.55, 9], ...[1, 2, 4, 5].map(k => [k * Math.PI / 3, 0.3, 5])].map(([t, fh, W]) => { const H = hT * fh, n = Math.hypot(Math.cos(t) / aM, Math.sin(t) / bM), nx = Math.cos(t) / aM / n, nz = Math.sin(t) / bM / n;
    const r = { x: Math.cos(t) * (aM + 0.5), z: Math.sin(t) * (bM + 0.5), nx, nz, H, W, vai: W > 6, sg: Math.sign(nx) || 1 };
    if (r.vai) { r.L = Math.max(24, 3 * H); r.box = [-4, r.L + W + 4, -W / 2, 1.5 * W + 1]; } else { r.L = Math.max(14, 3.2 * H); r.box = [-4, r.L + 11, -W / 2, W / 2]; }
    return r; }); };
const naRampa = (x, z, f) => m.rampas && niv >= 2 && rampaLista().some(r => { const d = (x - r.x) * r.nx + (z - r.z) * r.nz, l = r.sg * ((z - r.z) * r.nx - (x - r.x) * r.nz), [d0, d1, l0, l1] = r.box; return d > d0 && d < d1 + f && l > l0 - f && l < l1 + f; });
function rampas() { const br = lam("#ebe9e3"), pil = lam("#dcdad3");
  for (const r of rampaLista()) { const { H, L, W, sg } = r, g = new T.Group();
    const bk = (w, h, d, mat, x, y, z, rz = 0) => { const b = new T.Mesh(new T.BoxGeometry(w, h, d), mat); b.position.set(x, y, z); b.rotation.z = rz; b.castShadow = b.receiveShadow = true; g.add(b); };
    const lance = (x0, x1, y0, y1, z) => { const Ls = Math.hypot(x1 - x0, y1 - y0), rz = Math.atan((y1 - y0) / (x1 - x0)), xm = (x0 + x1) / 2, ym = (y0 + y1) / 2; // um lance reto de rampa, com guarda-corpo e pilares
      bk(Ls, 0.6, W, br, xm, ym, z, rz); for (const e of [-1, 1]) bk(Ls, 1.1, 0.25, br, xm, ym + 0.85, z + e * (W / 2 - 0.12), rz);
      const n = Math.floor(Math.abs(x1 - x0) / 7); for (let k = 1; k <= n; k++) { const f = k / (n + 1), h = y0 + (y1 - y0) * f - 0.3; if (h > 1) for (const e of [-1, 1]) bk(0.8, h, 0.8, pil, x0 + (x1 - x0) * f, h / 2, z + e * (W / 2 - 1)); } };
    bk(2.4, 0.6, W + 2, br, 0, H, 0); // saída do anel
    if (!r.vai) { lance(0, L, H, 0, 0); bk(6, 0.3, 8, br, L + 2.5, 0.15, 0); }
    else { const z2 = sg * (W + 1); lance(0, L, H, H / 2, 0); lance(L, 6, H / 2, 0, z2); // ida até a ponta e volta por fora
      bk(W, 0.6, W + Math.abs(z2), br, L + W / 2, H / 2, z2 / 2); for (const zz of [0, z2]) bk(0.9, H / 2 - 0.3, 0.9, pil, L + W / 2, (H / 2 - 0.3) / 2, zz); // patamar da virada
      bk(6, 0.3, W + 2, br, 3, 0.15, z2); }
    g.position.set(r.x, 0, r.z); g.rotation.y = -Math.atan2(r.nz, r.nx); grp.add(g); } }

function wire(pos, aM, bM, topH, L, DG) {
  const W = [], A = [], B = [], seg = (arr, p, q) => arr.push(p[0], p[1], p[2], q[0], q[1], q[2]), amb = (x, z, ld, r) => !pronto(x, z, ld, r);
  const porRow = {}; pos.forEach(p => (porRow[p.r] = porRow[p.r] || []).push(p));
  for (const r in porRow) { if (r % 2 && r != rows - 1) continue; const pts = porRow[r];
    for (let i = 0; i < pts.length; i++) { const p = pts[i], q = pts[(i + 1) % pts.length]; if (Math.hypot(p.x - q.x, p.z - q.z) > CELL * 1.8) continue; seg(amb(p.x, p.z, p.ld, +r) ? A : W, [p.x, p.h, p.z], [q.x, q.h, q.z]); } }
  const Cr = r => contorno(m, aRow(r), bRow(r)), n = Cr(0).length, step = Math.max(1, Math.floor(n / 96)), chk = [0];
  for (let r = 4; r < rows - 1; r += 4) chk.push(r); chk.push(rows - 1); const Cs = chk.map(Cr);
  for (let i = 0; i < n; i += step) { const P = j => [Cs[j][i][0], hRow(chk[j]), Cs[j][i][1]], p0 = P(0), pl = P(chk.length - 1), ld = lado(p0[0], p0[2]);
    if (pula(p0[0], p0[2], ld, niv) || pula(pl[0], pl[2], lado(pl[0], pl[2]), niv)) continue;
    seg(amb(p0[0], p0[2], ld, 0) ? A : W, [p0[0], 0, p0[2]], p0);
    for (let j = 1; j < chk.length; j++) { const q = P(j); seg(amb(q[0], q[2], ld, chk[j]) ? A : W, P(j - 1), q); }
    seg(amb(pl[0], pl[2], ld, rows - 1) ? A : W, pl, [pl[0], 0, pl[2]]); }
  if (L) { const x0 = -L.W / 2, x1 = L.W / 2, y = 0.05; [[x0, L.z0, x1, L.z0], [x1, L.z0, x1, L.z1], [x1, L.z1, x0, L.z1], [x0, L.z1, x0, L.z0]].forEach(([a, b, c, d]) => seg(B, [a, y, b], [c, y, d]));
    for (const za of L.bands) { seg(B, [x0, y, L.z0 + za + 5], [x1, y, L.z0 + za + 5]); for (let x = x0; x <= x1; x += 2.5) seg(B, [x, y, L.z0 + za], [x, y, L.z0 + za + 10]); } }
  if (DG) { for (const g of DG.petalas) { const nu = g.length - 1, nv = g[0].length - 1; for (let v = 0; v <= nv; v += 3) for (let u = 0; u < nu; u++) seg(B, g[u][v], g[u + 1][v]); for (const u of [0, nu / 2, nu]) for (let v = 0; v < nv; v++) seg(B, g[u][v], g[u][v + 1]); } }
  const add = (arr, cor, op) => { const g = new T.BufferGeometry(); g.setAttribute("position", new T.Float32BufferAttribute(arr, 3)); grp.add(new T.LineSegments(g, new T.LineBasicMaterial({ color: cor, transparent: true, opacity: op || .9 }))); };
  add(W, "#E6F1FB"); add(A, "#FAC775"); if (B.length) add(B, "#85B7EB", .6);
  const ln = (a, b) => { const pts = contorno(m, a, b).map(([x, z]) => new T.Vector3(x, 0, z)); pts.push(pts[0]); grp.add(new T.Line(new T.BufferGeometry().setFromPoints(pts), new T.LineBasicMaterial({ color: "#85B7EB" }))); };
  ln(aM + 8, bM + 8); ln(m.a0, m.b0);
  grp.add(plano(new T.PlaneGeometry(105, 68), new T.MeshBasicMaterial({ map: campoTex("#E6F1FB"), transparent: true }), 0.05));
  const fmt = v => v.toLocaleString("pt-BR");
  cur.tag.textContent = (C.reforma ? "REFORMA · " + m.nome.toUpperCase() + " · " : prev ? "NÍVEL " + (niv - 1) + " → " + niv + " · " + fmt(lug(niv - 1)) + " → " : "NÍVEL 1 · ") + fmt(lug(niv)) + " LUGARES · obra " + Math.round(obra * 100) + "% · amarelo = a construir";
  cur.render(); }

// Planta baixa (SVG em texto). Não precisa do three.js.
export function plantaEstadio(config) {
  aplicar(config);
  const aO = m.a0 + rows * DEP, bO = m.b0 + rows * DEP, nb = C.nb, L = lote(aO, bO, nb), dunas = m.teto == "dunas", ex = dunas ? 18 : m.muralha ? rows * DEP * (m.muralha - 1) : m.pele ? 9 : m.folga || 0, zB = nb ? L.z1 : bO + ex;
  const k = Math.min(390 / (2 * (aO + ex) + 40), 330 / (bO + ex + zB + 44)), CX = 246, CY = 258 - ((zB - bO - ex) / 2) * k;
  const X = x => (CX + x * k).toFixed(1), Y = z => (CY + z * k).toFixed(1);
  const P = pts => "M" + pts.map(p => X(p[0]) + " " + Y(p[1])).join("L") + "Z";
  const Co = off => contorno(m, m.a0 + off, m.b0 + off), ring = (o1, o2) => P(Co(o2)) + P(Co(o1));
  const BR = "#E6F1FB", LB = "#85B7EB", AM = "#FAC775", BG = "#0C447C", DD = 'stroke-dasharray="8 3 2 3"', esc = t => t.replace(/&/g, "&amp;").replace(/</g, "&lt;");
  const nomeE = esc((C.nomeEstadio || "").toUpperCase().trim()), id = "p" + Math.random().toString(36).slice(2, 8); // ids únicos: mais de uma planta na página
  const mask = (mid, lvl) => { let s = `<mask id="${id}${mid}"><rect width="680" height="480" fill="#fff"/>`; const Lm = 600, r = m.b0 / m.a0, tri = sx => `<polygon points="${CX},${CY} ${CX + sx * Lm},${CY + Lm * r} ${CX + sx * Lm},${CY - Lm * r}" fill="#000"/>`;
    if (lvl == 1) s += tri(1) + tri(-1); else if (m.aberta) s += tri(1);
    if (m.palcos) s += `<rect x="0" y="${Y(m.b0 + m.palcos * DEP)}" width="680" height="480" fill="#000"/>`;
    if (m.laterais && lvl > 1) s += tri(1) + tri(-1);
    if (m.cantos) { const ax = (FA + 3) * k, bz = (FB + 3) * k; for (const sx of [-1, 1]) for (const sz of [-1, 1]) s += `<rect x="${sx > 0 ? CX + ax : CX - ax - 400}" y="${sz > 0 ? CY + bz : CY - bz - 400}" width="400" height="400" fill="#000"/>`; }
    return s + "</mask>"; };
  const vom = (off, filtro, cor) => walk(Co(off), 24).filter(p => filtro(p.x, p.z, lado(p.x, p.z))).map(p => `<rect x="${(-1.6 * k).toFixed(1)}" y="${(-1.3 * k).toFixed(1)}" width="${(3.2 * k).toFixed(1)}" height="${(2.6 * k).toFixed(1)}" transform="translate(${X(p.x)} ${Y(p.z)}) rotate(${(p.ang * 180 / Math.PI).toFixed(1)})" fill="${BG}" stroke="${cor}" stroke-width="0.8"/>`).join("");
  let s = `<svg viewBox="0 0 680 480" xmlns="http://www.w3.org/2000/svg" role="img" style="font-family:monospace;width:100%;display:block"><title>Planta baixa da reforma</title><defs>
  <pattern id="${id}hach" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="5" stroke="${AM}" stroke-width="0.9"/></pattern>
  <pattern id="${id}grade" width="20" height="20" patternUnits="userSpaceOnUse"><path d="M20 0H0V20" fill="none" stroke="#185FA5" stroke-width="0.5"/></pattern>${mask("mN", niv)}${prev ? mask("mP", niv - 1) : ""}</defs>
  <rect width="680" height="480" rx="12" fill="${BG}"/><rect x="10" y="10" width="660" height="460" fill="url(#${id}grade)"/>
  <rect x="16" y="16" width="648" height="448" fill="none" stroke="${BR}" stroke-width="1.2"/><rect x="20" y="20" width="640" height="440" fill="none" stroke="${BR}" stroke-width="0.4"/>
  <line x1="472" y1="20" x2="472" y2="460" stroke="${BR}" stroke-width="0.8"/>`;
  s += `<path d="${P(Co(rows * DEP + 8 + ex))}" fill="none" stroke="${LB}" stroke-width="0.6" stroke-dasharray="1 3"/>`;
  if (nb) { const x0 = -L.W / 2, vg = L.v.length; s += `<rect x="${X(-5)}" y="${Y(bO + 8 + ex)}" width="${(10 * k).toFixed(1)}" height="${(Math.max(0, L.z0 - bO - 8 - ex) * k).toFixed(1)}" fill="none" stroke="${LB}" stroke-width="0.6"/><rect x="${X(x0)}" y="${Y(L.z0)}" width="${(L.W * k).toFixed(1)}" height="${(L.D * k).toFixed(1)}" fill="#0a3d70" stroke="${LB}" stroke-width="0.8"/>`;
    rng = 11; for (const za of L.bands) { s += `<line x1="${X(x0)}" y1="${Y(L.z0 + za + 5)}" x2="${X(-x0)}" y2="${Y(L.z0 + za + 5)}" stroke="${LB}" stroke-width="0.5"/>`; for (let x = x0; x <= -x0 + 0.01; x += 2.5) s += `<line x1="${X(x)}" y1="${Y(L.z0 + za)}" x2="${X(x)}" y2="${Y(L.z0 + za + 10)}" stroke="${LB}" stroke-width="0.4"/>`; }
    for (const v of L.v) if (rnd() < lotacao()) s += `<rect x="${X(v.x - 0.85)}" y="${Y(v.z - 2.1)}" width="${(1.7 * k).toFixed(1)}" height="${(4.2 * k).toFixed(1)}" rx="1" fill="none" stroke="${LB}" stroke-width="0.5"/>`;
    s += `<rect x="${CX - 100}" y="${+Y(L.z0 + L.D / 2) - 8}" width="200" height="16" fill="${BG}"/><text x="${CX}" y="${+Y(L.z0 + L.D / 2) + 4}" text-anchor="middle" font-size="11" fill="${BR}">ESTACIONAMENTO N${nb} · ${vg} vagas</text>`; }
  if (dunas) { const D = DG2(); s += `<path d="${P(D.O)}${P(Co(rows * DEP + 0.5))}" fill-rule="evenodd" fill="#0a3d70" stroke="${LB}" stroke-width="0.6"/>`;
    for (const r of D.rampas) { const cx = r.o[0] + r.d[0] * 7, cz = r.o[1] + r.d[1] * 7; s += `<g transform="translate(${X(cx)} ${Y(cz)}) rotate(${(Math.atan2(-r.d[0], r.d[1]) * 180 / Math.PI).toFixed(1)})"><rect x="${(-3.5 * k).toFixed(1)}" y="${(-7.5 * k).toFixed(1)}" width="${(7 * k).toFixed(1)}" height="${(15 * k).toFixed(1)}" fill="${BG}" stroke="${BR}" stroke-width="0.6"/>${[...Array(6)].map((_, i) => `<line x1="${(-3.5 * k).toFixed(1)}" x2="${(3.5 * k).toFixed(1)}" y1="${((-7.5 + 2.5 * (i + 0.5)) * k).toFixed(1)}" y2="${((-7.5 + 2.5 * (i + 0.5)) * k).toFixed(1)}" stroke="${LB}" stroke-width="0.4"/>`).join("")}</g>`; } }
  if (m.pista) { const tp = r => `M${X(-LS)} ${Y(-r)}L${X(LS)} ${Y(-r)}A${(r * k).toFixed(1)} ${(r * k).toFixed(1)} 0 0 1 ${X(LS)} ${Y(r)}L${X(-LS)} ${Y(r)}A${(r * k).toFixed(1)} ${(r * k).toFixed(1)} 0 0 1 ${X(-LS)} ${Y(-r)}Z`;
    s += `<path d="${tp(RO)}${tp(RI)}" fill-rule="evenodd" fill="#185FA5" stroke="${LB}" stroke-width="0.8"/>`; for (let i = 1; i < 8; i++) s += `<path d="${tp(RI + i * 1.22)}" fill="none" stroke="${LB}" stroke-width="0.35"/>`;
    s += `<g stroke="${BR}" stroke-width="1"><line x1="${X(LS)}" y1="${Y(RI)}" x2="${X(LS)}" y2="${Y(RO)}"/><line x1="${X(-LS)}" y1="${Y(RI)}" x2="${X(-LS)}" y2="${Y(RO)}"/></g>`;
    for (const sx of [-1, 1]) s += `<rect x="${X(sx * (LS + 18) - 4.5)}" y="${Y(18)}" width="${(9 * k).toFixed(1)}" height="${(3 * k).toFixed(1)}" fill="none" stroke="${LB}" stroke-width="0.6"/><circle cx="${X(sx * (LS + 20))}" cy="${Y(-14)}" r="${(2.2 * k).toFixed(1)}" fill="none" stroke="${LB}" stroke-width="0.6"/>`; }
  const f = (x, y, w, h) => `<rect x="${X(x)}" y="${Y(y)}" width="${(w * k).toFixed(1)}" height="${(h * k).toFixed(1)}"/>`, dz = 7.31, r9 = (9.15 * k).toFixed(1);
  s += `<g fill="none" stroke="${LB}" stroke-width="0.8">${f(-52.5, -34, 105, 68)}<line x1="${X(0)}" y1="${Y(-34)}" x2="${X(0)}" y2="${Y(34)}"/><circle cx="${X(0)}" cy="${Y(0)}" r="${r9}"/>
  ${f(-52.5, -20.15, 16.5, 40.3)}${f(36, -20.15, 16.5, 40.3)}${f(-52.5, -9.15, 5.5, 18.3)}${f(47, -9.15, 5.5, 18.3)}${f(-54.5, -3.66, 2, 7.32)}${f(52.5, -3.66, 2, 7.32)}
  <path d="M${X(-36)} ${Y(-dz)}A${r9} ${r9} 0 0 1 ${X(-36)} ${Y(dz)}M${X(36)} ${Y(-dz)}A${r9} ${r9} 0 0 0 ${X(36)} ${Y(dz)}"/></g>
  <g fill="${LB}"><circle cx="${X(0)}" cy="${Y(0)}" r="1.2"/><circle cx="${X(-41.5)}" cy="${Y(0)}" r="1"/><circle cx="${X(41.5)}" cy="${Y(0)}" r="1"/></g>
  <text x="${X(0)}" y="${Y(22)}" text-anchor="middle" font-size="11" fill="${LB}">105 × 68</text>`;
  const zP = m.pista ? FB + 1.2 : FB + 2.5, xP = m.pista ? FA + 2.5 : FA + 3.2, zBn = m.pista ? FB + 1.3 : FB + 2.2;
  s += `<g stroke="${LB}" stroke-width="1.6"><line x1="${X(-xP)}" y1="${Y(-zP)}" x2="${X(xP)}" y2="${Y(-zP)}"/><line x1="${X(-xP)}" y1="${Y(-zP)}" x2="${X(-xP)}" y2="${Y(zP)}"/><line x1="${X(xP)}" y1="${Y(-zP)}" x2="${X(xP)}" y2="${Y(zP)}"/><line x1="${X(-xP)}" y1="${Y(zP)}" x2="${X(-20)}" y2="${Y(zP)}"/><line x1="${X(20)}" y1="${Y(zP)}" x2="${X(xP)}" y2="${Y(zP)}"/></g>`;
  for (const sx of [-1, 1]) s += `<rect x="${X(sx * 10 - 4.5)}" y="${Y(zBn - 1.1)}" width="${(9 * k).toFixed(1)}" height="${(2.2 * k).toFixed(1)}" fill="${BG}" stroke="${BR}" stroke-width="0.8"/>`;
  s += m.pista || m.geral ? `<rect x="${X(-1.6)}" y="${Y(zBn - 2)}" width="${(3.2 * k).toFixed(1)}" height="${(5 * k).toFixed(1)}" fill="${BR}"/>` : `<rect x="${X(-1.8)}" y="${Y(FB + 1.2)}" width="${(3.6 * k).toFixed(1)}" height="${((m.b0 + 0.5 - FB - 1.2) * k).toFixed(1)}" fill="${BG}" stroke="${BR}" stroke-width="0.8"/>`;
  s += `<path d="${P(Co(-0.6))}" fill="none" stroke="${LB}" stroke-width="0.8" stroke-dasharray="4 1.5 1 1.5"/>`;
  s += `<g mask="url(#${id}mN)"><path d="${ring(0, rows * DEP)}" fill-rule="evenodd" fill="url(#${id}hach)"/>`;
  for (let r = 4; r < rows; r += 4) s += `<path d="${P(Co(r * DEP))}" fill="none" stroke="${AM}" stroke-width="0.4" stroke-dasharray="1 2" opacity=".7"/>`;
  s += `<path d="${P(Co(rows * DEP))}" fill="none" stroke="${AM}" stroke-width="1.4" stroke-dasharray="6 4"/>`;
  if (obra > 0) { const lim = rows > prev && prev ? (prev + (rows - prev) * obra) : rows * obra; s += `<path d="${ring(0, lim * DEP)}" fill-rule="evenodd" fill="${BG}" stroke="${BR}" stroke-width="1.1"/>`; }
  s += "</g>";
  if (prev) { s += `<g mask="url(#${id}mP)"><path d="${ring(0, prev * DEP)}" fill-rule="evenodd" fill="${BG}" stroke="${BR}" stroke-width="1.4"/>`;
    for (let r = 4; r < prev; r += 4) s += `<path d="${P(Co(r * DEP))}" fill="none" stroke="${LB}" stroke-width="0.5" stroke-dasharray="1.5 2.5"/>`;
    if (prev > 30) s += `<path d="${ring(28 * DEP, 31 * DEP)}" fill-rule="evenodd" fill="#185FA5" stroke="${BR}" stroke-width="0.8"/>`;
    s += vom(prev * DEP / 2, (x, z, ld) => !pula(x, z, ld, niv - 1), BR) + "</g>"; }
  if (m.palcos) { const z0 = m.b0 + m.palcos * DEP, z1 = z0 + 8, xs = () => aO + 0.5;
    s += `<path d="${P([[-xs(z0), z0], [xs(z0), z0], [xs(z1), z1], [-xs(z1), z1]])}" fill="${BG}" stroke="${BR}" stroke-width="1.1"/><line x1="${X(-xs(z0))}" y1="${Y(z0 + 1.5)}" x2="${X(xs(z0))}" y2="${Y(z0 + 1.5)}" stroke="${LB}" stroke-width="0.5"/>`; }
  if (m.muralha) { const x0 = -m.a0, x1 = -(m.a0 + rows * DEP * m.muralha), zz = FB + 3; // ponytail: a parede inteira hachurada ou pronta, sem o avanço da obra
    s += `<rect x="${X(x1)}" y="${Y(-zz)}" width="${((x0 - x1) * k).toFixed(1)}" height="${(2 * zz * k).toFixed(1)}" fill="${obra < 1 ? `url(#${id}hach)` : BG}" stroke="${obra < 1 ? AM : BR}" stroke-width="1.1"/>`; }
  const midN = rows > prev ? (prev + rows) / 2 * DEP : rows / 2 * DEP;
  s += vom(midN, (x, z, ld) => !pula(x, z, ld, niv) && (rows > prev || pula(x, z, ld, niv - 1)), AM);
  if (m.teto == "arena" && niv >= 3) s += `<g fill="none" stroke="${LB}" stroke-width="0.9" ${DD}><path d="${P(Co(rows * DEP * (m.tetoIn ?? 0.5)))}"/><path d="${P(Co(rows * DEP + 1.5))}"/></g>`;
  if (m.pele) s += `<path d="${P(Co(rows * DEP + 8))}${P(Co(rows * DEP + 3))}" fill-rule="evenodd" fill="#185FA5" fill-opacity=".5" stroke="${BR}" stroke-width="0.8"/>`;
  if (m.laterais) {
    for (let x = -(FA + 1); x <= FA + 1; x += 7) s += `<line x1="${X(x)}" y1="${Y(-(m.b0 + rows * DEP * 0.28))}" x2="${X(x)}" y2="${Y(m.b0 + rows * DEP * 0.28)}" stroke="${LB}" stroke-width="0.4" ${DD}/>`; }
  if (m.torres) for (const t of torresSS()) s += `<circle cx="${X(t.x)}" cy="${Y(t.z)}" r="${(t.r * k).toFixed(1)}" fill="${BG}" stroke="${t.c ? AM : BR}" stroke-width="0.8"/><circle cx="${X(t.x)}" cy="${Y(t.z)}" r="${(1.5 * k).toFixed(1)}" fill="none" stroke="${LB}" stroke-width="0.5"/>`;
  if (m.torres && niv >= 3) { const c = torresSS().filter(t => t.c); s += `<path d="${P(c.map(t => [t.x, t.z]))}" fill="none" stroke="#e24b4a" stroke-width="1.2" ${DD}/>`; }
  if (m.arco) { const ap = arcoPts(hRow(rows - 1)); s += ap.trechos.map(tp => `<path d="M${tp.map(p => X(p[0]) + " " + Y(p[2])).join("L")}" fill="none" stroke="${BR}" stroke-width="1.4" ${DD}/>`).join("") + [ap[0], ap[64]].map(p => `<rect x="${X(p[0] - 4)}" y="${Y(-4)}" width="${(8 * k).toFixed(1)}" height="${(8 * k).toFixed(1)}" fill="${BG}" stroke="${BR}" stroke-width="0.8"/>`).join(""); }
  if (m.geral) s += `<path d="${ring(-m.geral, 0)}" fill-rule="evenodd" fill="#185FA5" fill-opacity=".5" stroke="${BR}" stroke-width="0.6"/><path d="${P(Co(-m.geral - 2.4))}" fill="none" stroke="${LB}" stroke-width="0.5"/>`;
  if (m.marquise && niv >= 3) s += `<g fill="none" stroke="${LB}" stroke-width="0.9" ${DD}><path d="${P(Co(rows * DEP * 0.42))}"/><path d="${P(Co(rows * DEP + 2.6))}"/></g>`;
  if (dunas) { s += `<g fill="none" stroke="${LB}" stroke-width="0.8" ${DD}>`; for (const g of DG2().petalas) { const nu = g.length - 1, nv = g[0].length - 1, pts = []; for (let u = 0; u <= nu; u++) pts.push(g[u][0]); for (let v = 0; v <= nv; v++) pts.push(g[nu][v]); for (let u = nu; u >= 0; u--) pts.push(g[u][nv]); for (let v = nv; v >= 0; v--) pts.push(g[0][v]); s += `<path d="${P(pts.map(p => [p[0], p[2]]))}"/>`; } s += "</g>"; }
  if (cob.size) { const ps = assentos(niv); s += `<g fill="none" stroke="${LB}" stroke-width="0.9" ${DD}>`; for (const sd of cob) { const sp = ps.filter(p => p.ld == sd); if (!sp.length) continue; const ns = sd == "N" || sd == "S", sg = sd == "N" || sd == "W" ? -1 : 1, v = sp.map(p => ns ? p.x : p.z), mn = Math.min(...v) - 0.75, mx = Math.max(...v) + 0.75, eo = sg * ((ns ? bO : aO) + 0.9), ei = sg * ((ns ? m.b0 : m.a0) + rows * DEP * 0.28);
    s += ns ? `<rect x="${X(mn)}" y="${Y(Math.min(eo, ei))}" width="${((mx - mn) * k).toFixed(1)}" height="${(Math.abs(eo - ei) * k).toFixed(1)}"/>` : `<rect x="${X(Math.min(eo, ei))}" y="${Y(mn)}" width="${(Math.abs(eo - ei) * k).toFixed(1)}" height="${((mx - mn) * k).toFixed(1)}"/>`; } s += "</g>"; }
  const cP = porLado(prev ? niv - 1 : 0), cN = porLado(niv), fmt = v => v.toLocaleString("pt-BR"), cap = sd => cN[sd] ? (prev && cP[sd] ? fmt(cP[sd]) + " → " : "novo · ") + fmt(cN[sd]) : "";
  const plaq = (x, y, rot, nome, sd) => cap(sd) ? `<g transform="translate(${x.toFixed(1)} ${y.toFixed(1)}) rotate(${rot})"><rect x="-50" y="-14" width="100" height="28" rx="2" fill="${BG}" stroke="${BR}" stroke-width="0.5"/><text y="-2" text-anchor="middle" font-size="11" fill="${BR}">${nome}</text><text y="10" text-anchor="middle" font-size="11" fill="${AM}">${cap(sd)}</text></g>` : "";
  const mb = m.b0 + rows * DEP / 2, ma = m.a0 + rows * DEP / 2;
  s += plaq(CX, CY - mb * k, 0, "NORTE", "N") + plaq(CX, CY + mb * k, 0, "SUL", "S") + plaq(CX + ma * k, CY, 90, "LESTE", "E") + plaq(CX - ma * k, CY, -90, "OESTE", "W");
  if (C.refletores && !m.teto) { const fr = m.R == null ? 0.75 : 0.97; for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { const x = +X(sx * (aO + 7) * fr), y = +Y(sz * (bO + 7) * fr); s += `<g stroke="${BR}" stroke-width="0.8" fill="none"><circle cx="${x}" cy="${y}" r="4"/><path d="M${x - 3} ${y - 3}L${x + 3} ${y + 3}M${x + 3} ${y - 3}L${x - 3} ${y + 3}"/></g>`; } }
  const cota = (x1, y1, x2, y2, txt, cor, vert) => { const mx = (x1 + x2) / 2, my = (y1 + y2) / 2; return `<g stroke="${BR}" stroke-width="0.6"><line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"/>${[[x1, y1], [x2, y2]].map(([x, y]) => `<line x1="${x - 4}" y1="${y + 4}" x2="${x + 4}" y2="${y - 4}"/>` + (vert ? `<line x1="${x - 6}" y1="${y}" x2="${x + 12}" y2="${y}"/>` : `<line x1="${x}" y1="${y - 6}" x2="${x}" y2="${y + 12}"/>`)).join("")}</g><text font-size="11" fill="${cor}" text-anchor="middle" ${vert ? `transform="translate(${mx - 5} ${my}) rotate(-90)"` : `x="${mx}" y="${my - 5}"`}>${txt}</text>`; };
  const mm = v => v.toFixed(2).replace(".", ","), xl = +X(-aO - ex) - 26;
  s += cota(+X(-aO), +Y(-bO - ex) - 18, +X(aO), +Y(-bO - ex) - 18, mm(2 * aO), AM);
  s += cota(xl, +Y(-bO), xl, +Y(bO), mm(2 * bO), AM, 1);
  if (prev && !nb) { const aP = m.a0 + prev * DEP; s += cota(+X(-aP), +Y(bO + ex) + 20, +X(aP), +Y(bO + ex) + 20, mm(2 * aP) + " existente", BR); }
  s += `<g transform="translate(440 64)"><circle r="13" fill="none" stroke="${BR}" stroke-width="0.8"/><path d="M0 -13L5 6L0 2L-5 6Z" fill="${BR}"/><text y="-17" text-anchor="middle" font-size="11" fill="${BR}">N</text></g>`;
  const s10 = 10 * k; s += `<g transform="translate(36 436)"><rect width="${s10}" height="5" fill="${BR}"/><rect x="${s10}" width="${s10}" height="5" fill="none" stroke="${BR}" stroke-width="0.6"/><rect x="${2 * s10}" width="${3 * s10}" height="5" fill="${BR}"/>
  <g font-size="11" fill="${BR}"><text y="18">0</text><text x="${2 * s10}" y="18" text-anchor="middle">20</text><text x="${5 * s10}" y="18" text-anchor="middle">50 m</text></g></g>`;
  let ly = 90; const item = (sym, txt) => { const r = sym(ly) + `<text x="528" y="${ly + 4}" font-size="11" fill="${BR}">${txt}</text>`; ly += 18; return r; };
  s += `<g font-size="11" fill="${BR}"><text x="488" y="44" font-size="15">PLANTA BAIXA</text><text x="488" y="62" fill="${LB}">${C.reforma ? "Reforma: " + m.nome : prev ? "Ampliação de arquibancada" : "Implantação inicial"}</text>`;
  s += item(y => `<line x1="488" y1="${y}" x2="520" y2="${y}" stroke="${BR}" stroke-width="1.6"/>`, "Existente / pronto");
  s += item(y => `<rect x="488" y="${y - 6}" width="32" height="12" fill="url(#${id}hach)" stroke="${AM}" stroke-dasharray="4 3"/>`, "A construir");
  s += item(y => `<rect x="498" y="${y - 4}" width="10" height="8" fill="${BG}" stroke="${BR}" stroke-width="0.8"/>`, "Vomitório");
  if (m.teto == "arena" && niv >= 3 || dunas || cob.size || m.marquise && niv >= 3) s += item(y => `<line x1="488" y1="${y}" x2="520" y2="${y}" stroke="${LB}" ${DD}/>`, dunas ? "Conchas da cobertura" : "Projeção cobertura");
  if (rows > 30) s += item(y => `<rect x="494" y="${y - 4}" width="20" height="8" fill="#185FA5" stroke="${BR}" stroke-width="0.6"/>`, "Camarotes");
  s += item(y => `<line x1="488" y1="${y}" x2="520" y2="${y}" stroke="${LB}" stroke-dasharray="4 1.5 1 1.5"/>`, "Alambrado");
  if (nb) s += item(y => `<rect x="494" y="${y - 5}" width="20" height="10" fill="#0a3d70" stroke="${LB}" stroke-width="0.6"/>`, "Estacionamento");
  s += `<text x="488" y="${ly + 12}" fill="${AM}">Obra: ${Math.round(obra * 100)}% concluída</text></g>`;
  const cut = (t, n) => t.length > n ? t.slice(0, n - 1) + "…" : t, custo = C.custo ?? CUSTO[niv], prazo = C.prazo ?? PRAZO[niv];
  const cl = [[307, "TREM SOCCER", 13], [335, "Clube: " + esc(cut((C.clube || C.mosaico || "—").toUpperCase(), 17))], [363, cut(nomeE || "ESTÁDIO SEM NOME", 24)], [391, cut(m.nome, 13) + " · nív. " + (prev ? niv - 1 + "→" : "") + niv], [419, (prev ? fmt(lug(niv - 1)) + " → " : "") + fmt(lug(niv)) + " lug."]];
  s += `<g font-size="11" fill="${BR}"><rect x="480" y="288" width="172" height="164" fill="none" stroke="${BR}" stroke-width="0.8"/>${[316, 344, 372, 400, 428].map(y => `<line x1="480" y1="${y}" x2="652" y2="${y}" stroke="${BR}" stroke-width="0.5"/>`).join("")}
  <line x1="566" y1="428" x2="566" y2="452" stroke="${BR}" stroke-width="0.5"/>
  ${cl.map(([y, t, fs], i) => `<text x="488" y="${y}" ${fs ? `font-size="${fs}"` : ""} ${i == 4 ? `fill="${AM}"` : ""}>${t}</text>`).join("")}
  <text x="488" y="445">${custo ? din(custo) : "—"}</text><text x="574" y="445">${prazo} rodada${prazo > 1 ? "s" : ""}</text></g></svg>`;
  return s;
}
