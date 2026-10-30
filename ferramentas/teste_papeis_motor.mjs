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

console.log("teste_papeis_motor: ok");
