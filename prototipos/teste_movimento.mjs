// Deslocamento contínuo (prototipos/movimento.js): a física do ponto, depois um jogo inteiro da T1 com os 22.
// node prototipos/teste_movimento.mjs
import assert from "node:assert";
import { readFileSync } from "node:fs";
import { criarRng } from "../src/rng.js";
import { gerarOnze } from "../src/gerador.js";
import { FORMACOES } from "../src/escalacao.js";
import { IDX } from "../src/modelo.js";
import { prepararTime, simularPartida } from "../src/motor.js";
import { MOV, FASES, ESTADOS, limitesDe, passo, gerarTrajetorias, posicaoEm, percurso, pontoDaZona } from "./movimento.js";

const dt = MOV.dt, novo = (x = 10, y = 34) => ({ x, y, vx: 0, vy: 0 });
const at = (mud = {}) => { const a = Array(25).fill(25); for (const k in mud) a[IDX[k]] = mud[k]; return a; };
const lim = limitesDe(at());
// anda até (ax, ay); devolve o tempo de chegada, a maior velocidade e o maior salto de um passo
function ate(s, ax, ay, l = lim, vmax = l.vmax, teto = 60) {
  let t = 0, vm = 0, salto = 0;
  for (; t < teto; t += dt) {
    const x = s.x, y = s.y; passo(s, ax, ay, l, vmax, dt);
    salto = Math.max(salto, Math.hypot(s.x - x, s.y - y)); vm = Math.max(vm, Math.hypot(s.vx, s.vy));
    if (Math.hypot(s.x - ax, s.y - ay) < 0.15 && Math.hypot(s.vx, s.vy) < 0.3) return { t, vm, salto };
  }
  return { t: Infinity, vm, salto };
}

// 1. A até B, em distâncias diferentes: chega parado, sem salto, sem passar do teto; mais longe leva mais tempo
const t10 = ate(novo(), 20, 34), t40 = ate(novo(), 50, 34), t80 = ate(novo(), 90, 34);
assert.ok(t10.t < t40.t && t40.t < t80.t && t80.t < Infinity, "distância maior leva mais tempo");
assert.ok(t80.vm <= lim.vmax + 1e-6 && t80.salto <= lim.vmax * dt + 1e-6, "sem salto");
assert.ok(t80.vm > 0.95 * lim.vmax && t10.vm < t80.vm, "a curta não chega à velocidade máxima");

// 2. Aceleração e freada: uma volta não sai do zero para o máximo, e o último trecho perde velocidade
{ const s = novo(); passo(s, 90, 34, lim, lim.vmax, dt); assert.ok(Math.hypot(s.vx, s.vy) <= lim.acel * dt + 1e-9, "aceleração limitada");
  let v0 = 0; for (let i = 0; i < 400; i++) { const a = Math.hypot(s.vx, s.vy); passo(s, 90, 34, lim, lim.vmax, dt); const b = Math.hypot(s.vx, s.vy); assert.ok(b - a <= lim.acel * dt + 1e-9 && a - b <= lim.freio * dt + 1e-9, "aceleração limitada"); v0 = b; } assert.ok(v0 < 0.3, "chega parado"); }

// 3. Os atributos: quem é mais rápido chega antes; quem tem mais Drible e Domínio perde menos numa volta de 180°; ninguém passa do teto
const rapido = limitesDe(at({ vel: 42, for: 40 })), lento = limitesDe(at({ vel: 12, for: 12 }));
assert.ok(ate(novo(), 90, 34, rapido).t < ate(novo(), 90, 34, lento).t, "o rápido chega antes");
assert.ok(limitesDe(at({ vel: 50 })).vmax <= MOV.velocidade.teto && limitesDe(at({ vel: 1 })).vmax >= MOV.velocidade.piso, "velocidade dentro dos limites");
const meiaVolta = l => { const s = novo(50, 34); for (let i = 0; i < 50; i++) passo(s, 100, 34, l, l.vmax, dt); let t = 0; while (s.vx > 0 && t < 10) { passo(s, 0, 34, l, l.vmax, dt); t += dt; } return t; };
assert.ok(meiaVolta(limitesDe(at({ dri: 42, dom: 42 }))) < meiaVolta(limitesDe(at({ dri: 10, dom: 10 }))), "o ágil gira mais rápido");

// 4. Destino novo no meio do caminho: sai de onde está, com a velocidade que tem
{ const s = novo(10, 10); for (let i = 0; i < 30; i++) passo(s, 95, 10, lim, lim.vmax, dt);
  const x = s.x, y = s.y, v = Math.hypot(s.vx, s.vy); assert.ok(v > 3);
  passo(s, 95, 60, lim, lim.vmax, dt);
  assert.ok(Math.hypot(s.x - x, s.y - y) <= lim.vmax * dt + 1e-6 && Math.abs(Math.hypot(s.vx, s.vy) - v) <= lim.acel * dt + 1e-6, "troca sem salto");
  const r = ate(s, 95, 60); assert.ok(r.t < Infinity && r.salto <= lim.vmax * dt + 1e-6, "chega ao novo destino"); }

// 5. Limites do campo: destino fora é barrado na linha
{ const s = novo(100, 60); for (let i = 0; i < 200; i++) { passo(s, 140, 90, lim, lim.vmax, dt); assert.ok(s.x >= 0 && s.x <= 105 && s.y >= 0 && s.y <= 68); } }

// 6. Jogo inteiro da T1, com os 22
const nomes = JSON.parse(readFileSync(new URL("../dados/nomes.json", import.meta.url)));
const onze = (p, s, f) => gerarOnze(criarRng(s), FORMACOES[f], { nivel: 30, nomes, prefixoId: p, novos: true });
const a = onze("a", 11, "4-2-3-1"), b = onze("b", 12, "4-4-2"), registro = [];
const partida = simularPartida(criarRng(5), prepararTime({ nome: "A", escalacao: a }), prepararTime({ nome: "B", escalacao: b }), { regrasT1: true, registro });
const fichas = Object.fromEntries([...a, ...b].map(x => [x.j.id, x.j.at]));
const t0 = performance.now(), tr = gerarTrajetorias(partida, registro, fichas), ms = performance.now() - t0;
assert.equal(tr.n, Object.keys(partida.jogadores).length);
assert.ok(tr.n >= 22 && tr.duracao >= 90 * 60, "o jogo inteiro");
assert.ok(ms < 8000, `custa pouco: ${ms.toFixed(0)} ms`);
assert.ok(tr.dados.byteLength < 8e6, `memória: ${(tr.dados.byteLength / 1e6).toFixed(1)} MB`);
// sem teletransporte: entre duas amostras ninguém anda mais que o teto (a Bola, mais que o chute), e todos ficam no campo
const D = tr.dados, o = (tr.n + 1) * 4;
for (let k = 0; k < tr.n; k++) for (let s = 1; s < tr.ns; s++) {
  const i = s * o + k * 4, j = i - o;
  assert.ok(Math.hypot(D[i] - D[j], D[i + 1] - D[j + 1]) <= MOV.velocidade.teto * tr.amostra + 0.01, `salto do jogador ${k} na amostra ${s}`);
  assert.ok(D[i] >= 0 && D[i] <= 105 && D[i + 1] >= 0 && D[i + 1] <= 68, "no campo");
}
for (let s = 1; s < tr.ns; s++) { const i = s * o + tr.n * 4, j = i - o; assert.ok(Math.hypot(D[i] - D[j], D[i + 1] - D[j + 1]) <= MOV.bola * tr.amostra + 0.01, "a bola não salta"); }
// o tempo manda: a mesma resposta em qualquer ordem de leitura (pausar, voltar, acelerar) e no mesmo jogo gerado de novo; fase e posse gravadas
const k = tr.indice[a[5].j.id], fim = tr.duracao / 2, ida = posicaoEm(tr, k, fim);
// a tela em 1×, 4×, 16× e 60×, em 30 quadros por segundo de relógio: chega ao mesmo lugar no mesmo tempo de jogo, em qualquer velocidade
for (const v of [1, 4, 16, 60]) { let t = fim - 30 * v / 30; for (let q = 0; q < 30; q++) { posicaoEm(tr, k, t); t += v / 30; } assert.ok(Math.abs(t - fim) < 1e-6); assert.deepStrictEqual(posicaoEm(tr, k, t > fim ? fim : t).x.toFixed(1), ida.x.toFixed(1)); }
// pausar e voltar: ler outro tempo e retomar dá o mesmo
posicaoEm(tr, k, 10); posicaoEm(tr, k, tr.duracao);
assert.deepStrictEqual(posicaoEm(tr, k, fim), ida, "posição depende só do tempo");
const tr2 = gerarTrajetorias(partida, registro, fichas);
assert.deepStrictEqual(Buffer.from(tr2.dados.buffer).equals(Buffer.from(tr.dados.buffer)), true, "determinístico");
const r = percurso(tr, a[5].j.id, 4);
assert.ok(r.length > 1000 && r.every(x => FASES.includes(x.fase) && ESTADOS.includes(x.estado) && (x.posse === 0 || x.posse === 1) && Number.isFinite(x.direcao) && x.id === a[5].j.id), "registro completo");
assert.ok(new Set(r.map(x => x.fase)).size >= 5, "as fases mudam");
assert.ok(new Set(r.map(x => x.estado)).size >= 3, "os estados de movimento mudam");
// o jogo não para: a bola anda em quase todo intervalo de 10 s
{ let parada = 0, n = 0; for (let s = 40; s + 20 < tr.ns; s += 20) { const i = s * o + tr.n * 4, j = i + 20 * o; n++; if (Math.hypot(D[i] - D[j], D[i + 1] - D[j + 1]) < 1) parada++; } assert.ok(parada / n < 0.1, `bola parada em ${(100 * parada / n).toFixed(0)}% dos intervalos`); }
// a saída de bola: todos no próprio campo e fora do círculo, menos quem sai jogando; vale no início, depois de cada gol e na volta do intervalo
const naSaida = (s, nome) => { let dentro = 0; for (let q = 0; q < tr.n; q++) { if (!tr.ativo[s * tr.n + q]) continue; const x = D[s * o + q * 4], y = D[s * o + q * 4 + 1]; assert.ok(tr.idTime[q] === 0 ? x <= 53 : x >= 52, `${nome}: ${tr.pos[q]} do time ${tr.idTime[q]} em x ${x.toFixed(1)}`); if (Math.hypot(x - 52.5, y - 34) < 9.15) dentro++; } assert.ok(dentro <= 1, `${nome}: ${dentro} no círculo`); };
naSaida(0, "início");
const gols = tr.lances.filter(x => x.l.resultado === "gol");
assert.ok(gols.length, "este jogo tem gol");
for (const g of gols) naSaida(Math.round((g.t + 3 + MOV.depoisDoGol - 1) / tr.amostra), "depois do gol");
{ let s = 0; for (let i = 60; i < tr.ns; i++) if (tr.fases[i * 2] === 6 && i * tr.amostra > 44 * 60 && i * tr.amostra < 60 * 60) { let longe = 0; for (let q = 0; q < tr.n; q++) if (tr.idTime[q] === 0 && D[i * o + q * 4] > 53) longe++; if (longe === 0) { s = i; break; } } assert.ok(s > 0, "a volta do intervalo reorganiza o time"); }
// a função pesa: o zagueiro fica atrás do atacante do mesmo time; sem a bola, o time fica mais curto que com ela
const media = (id, fn) => { const l = percurso(tr, id, 4).filter(fn); return l.reduce((s, x) => s + x.x, 0) / l.length; };
const dc = a.find(x => x.pos === "DC").j.id, sc = a.find(x => ["SC", "FC"].includes(x.pos)).j.id;
assert.ok(media(dc, () => true) + 15 < media(sc, () => true), "a linha defensiva atrás do ataque");
const comp = (posse) => { let s = 0, c = 0; for (let i = 0; i < tr.ns; i += 4) if (tr.posse[i] === posse) { const xs = a.filter(x => x.pos !== "GK").map(x => D[i * o + tr.indice[x.j.id] * 4]); s += Math.max(...xs) - Math.min(...xs); c++; } return s / c; };
assert.ok(comp(1) < comp(0), `compacto sem a bola: ${comp(1).toFixed(1)} x ${comp(0).toFixed(1)} m`);
// mudança de fase não vira correria: quem está longe da bola ainda não acelerou no primeiro meio segundo depois de trocar a posse
{ let cedo = 0, tarde = 0, q = 0;
  for (let i = 40; i < tr.ns - 6; i++) if (tr.posse[i] !== tr.posse[i - 1]) { const bi = i * o + tr.n * 4;
    for (let j = 0; j < tr.n; j++) if (Math.hypot(D[i * o + j * 4] - D[bi], D[i * o + j * 4 + 1] - D[bi + 1]) > 40) { const v = (s, c) => Math.hypot(D[s * o + j * 4 + 2], D[s * o + j * 4 + 3]); cedo += v(i + 1) - v(i); tarde += v(i + 5) - v(i); q++; } }
  assert.ok(q > 100 && cedo / q < tarde / q, `reação escalonada: ${(cedo / q).toFixed(2)} x ${(tarde / q).toFixed(2)} m/s`); }
assert.ok(pontoDaZona("5C", 0)[0] > 90 && pontoDaZona("5C", 1)[0] < 15, "cada time ataca para um lado");
// a bola chega em quem a tem: perto de um jogador na maior parte do tempo
let junto = 0, tot = 0; for (let s = 120; s < tr.ns; s += 3) { const bi = s * o + tr.n * 4; tot++; for (let q = 0; q < tr.n; q++) if (tr.ativo[s * tr.n + q] && Math.hypot(D[s * o + q * 4] - D[bi], D[s * o + q * 4 + 1] - D[bi + 1]) < 3) { junto++; break; } }
assert.ok(junto / tot > 0.7, `bola com alguém: ${(100 * junto / tot).toFixed(0)}%`);
console.log(`teste_movimento: ok (${ms.toFixed(0)} ms, ${(tr.dados.byteLength / 1e6).toFixed(1)} MB, ${tr.ns} amostras, bola com alguém ${(100 * junto / tot).toFixed(0)}%, compacto ${comp(1).toFixed(1)} x ${comp(0).toFixed(1)} m)`);
