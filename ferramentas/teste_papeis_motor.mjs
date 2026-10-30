// Papéis no motor (etapa 2, laterais): o papel padrão (ou nenhum) joga igual a hoje, lance a lance; os outros papéis mudam as zonas com e sem a bola.
// Uso: node ferramentas/teste_papeis_motor.mjs
import assert from "node:assert";
import { readFileSync } from "node:fs";
import { criarRng } from "../src/rng.js";
import { gerarOnze } from "../src/gerador.js";
import { FORMACOES } from "../src/escalacao.js";
import { prepararTime, simularPartida, avaliarZonas } from "../src/motor.js";

const nomes = JSON.parse(readFileSync(new URL("../dados/nomes.json", import.meta.url)));
const onze = (f, s) => gerarOnze(criarRng(s), FORMACOES[f], { nivel: 30, nomes, prefixoId: "p" + s + "_" });
const comPapel = (esc, papeis) => esc.map(x => papeis[x.pos] ? { ...x, papel: papeis[x.pos] } : x);
const jogo = (a, b, s) => { const p = simularPartida(criarRng(s), prepararTime({ nome: "A", escalacao: a }), prepararTime({ nome: "B", escalacao: b })); return JSON.stringify([p.placar, p.narracao]); };

// (a) papel padrão explícito = sem papel, e (e) papel inválido = sem papel
for (let s = 1; s <= 20; s++) {
  const [fa, fb] = s % 2 ? ["4-4-2", "3-5-2 com alas"] : ["4-2-3-1", "5-4-1"], a = onze(fa, s), b = onze(fb, s + 500);
  const base = jogo(a, b, s);
  assert.strictEqual(jogo(comPapel(a, { DR: "fixo", DL: "fixo" }), comPapel(b, { WBR: "apoiador", WBL: "apoiador" }), s), base, `padrão, semente ${s}`);
  assert.strictEqual(jogo(comPapel(a, { DR: "xyz", DL: "invertidox" }), b, s), base, `inválido, semente ${s}`);
}

const a = onze("4-2-3-1", 7), z = avaliarZonas(a);
// (b) Apoiador no DR: mais ataque pelo lado, menos defesa no fundo
const ap = avaliarZonas(comPapel(a, { DR: "apoiador" }));
assert.ok(ap.atk.AD > z.atk.AD, "Apoiador soma ataque no AD");
assert.ok(ap.def.DD < z.def.DD, "Apoiador deixa o DD mais aberto");
// (c) Invertido no DR: meio mais forte com a bola, quase igual sem ela
const inv = avaliarZonas(comPapel(a, { DR: "invertido" }));
assert.ok(inv.atk.MC > z.atk.MC * 1.1, "Invertido soma no centro do meio com a bola");
assert.ok(inv.def.MC - z.def.MC < (inv.atk.MC - z.atk.MC) / 2, "sem a bola, pouco dele fica por dentro");
// (d) esquerdo espelhado
const apE = avaliarZonas(comPapel(a, { DL: "apoiador" }));
assert.ok(apE.atk.AE > z.atk.AE && Math.abs(apE.atk.AD - z.atk.AD) < 1e-9, "Apoiador no DL vai pela esquerda");

// Passagem do Apoiador (tarefa 3): com ponta aberto na frente (RW), passa por dentro (mais AC); com meia de lado (AMR), por fora
const comRW = avaliarZonas(comPapel(onze("4-3-3 com pontas", 7), { DR: "apoiador" })), semRW = avaliarZonas(onze("4-3-3 com pontas", 7));
const comAMR = avaliarZonas(comPapel(a, { DR: "apoiador" }));
const ganhoAC = (x, y) => x.atk.AC - y.atk.AC;
assert.ok(ganhoAC(comRW, semRW) > ganhoAC(comAMR, z) + 1, "com ponta aberto na frente, o Apoiador passa por dentro");
const comLW = avaliarZonas(comPapel(onze("4-3-3 com pontas", 7), { DL: "apoiador" }));
assert.ok(ganhoAC(comLW, semRW) > ganhoAC(comAMR, z) + 1, "na esquerda também");

// Ala pelo lado da bola (tarefa 3): só o ala que não é Apoiador; o 3-5-2 com alas Apoiadores joga igual a antes
import { CONFIG, defesaPorCorredor } from "../src/motor.js";
assert.ok(CONFIG.papeis && CONFIG.papeis.alaPorLado > 0);
const t352 = onze("3-5-2 com alas", 11), b442 = onze("4-4-2", 12);
assert.strictEqual(jogo(comPapel(t352, { WBR: "apoiador", WBL: "apoiador" }), b442, 5), jogo(t352, b442, 5), "alas Apoiadores: igual a antes");
const dc = defesaPorCorredor(comPapel(t352, { WBR: "fixo" }));
// corredor do lado dele (D): sobe para pressionar (MD mais forte, DD mais fraco); corredor oposto (E): fecha a linha (DC mais forte)
assert.ok(dc.D.MD > dc.C.MD && dc.D.DD < dc.C.DD, "bola do lado do ala: ele pressiona");
assert.ok(dc.E.DC > dc.C.DC && dc.E.DD < dc.C.DD, "bola do outro lado: ele fecha a linha");
const ds = defesaPorCorredor(t352);
assert.deepStrictEqual(ds.D, ds.C, "sem ala de papel, o corredor não muda a defesa");

// desenho com e sem a bola (tarefa 6): cada titular de linha conta na linha em que mais está (empate: a mais adiantada)
import { desenhoDoTime } from "../src/motor.js";
const t442 = onze("4-4-2", 21);
assert.deepStrictEqual(desenhoDoTime(t442), { com: "4-4-2", sem: "4-4-2" });
assert.deepStrictEqual(desenhoDoTime(comPapel(t442, { DR: "apoiador", DL: "apoiador" })), { com: "2-4-4", sem: "4-4-2" });
assert.deepStrictEqual(desenhoDoTime(onze("3-5-2 com alas", 21)), { com: "3-5-2", sem: "3-5-2" }, "alas de hoje: mais no meio do lado");
// Transição (tarefa 7): no contra-ataque do adversário, quem defende ainda está onde estava com a bola (mapa com a bola), e o padrão não muda
import { defesaNaTransicao } from "../src/motor.js";
const tr = defesaNaTransicao(comPapel(a, { DR: "apoiador" })), trPadrao = defesaNaTransicao(a);
assert.ok(tr.DD < ap.def.DD, "Apoiador pego no contra: o fundo do lado fica mais aberto que na defesa montada");
assert.deepStrictEqual(trPadrao, z.def, "sem papel, a defesa na transição é a de sempre");
console.log("teste_papeis_motor: ok");
