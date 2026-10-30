// Regras da T1 (adendo de 30/10 ao plano dos papéis): defesa de reserva e "ao perder a bola". Sem as regras (temporada 0), o jogo é o de antes
// e a instrução não muda nada; com elas, quem deixa pouca gente atrás sofre mais contra-ataque, e pressionar ou recompor mudam a transição.
// Uso: node ferramentas/teste_regras_t1.mjs
import assert from "node:assert";
import { readFileSync } from "node:fs";
import { criarRng } from "../src/rng.js";
import { gerarOnze } from "../src/gerador.js";
import { FORMACOES } from "../src/escalacao.js";
import { prepararTime, simularPartida, CONFIG } from "../src/motor.js";

const nomes = JSON.parse(readFileSync(new URL("../dados/nomes.json", import.meta.url)));
const onze = (f, s, papeis = {}) => gerarOnze(criarRng(s), FORMACOES[f], { nivel: 30, nomes, prefixoId: "p" + s + "_" }).map(x => papeis[x.pos] ? { ...x, papel: papeis[x.pos] } : x);
const antes = JSON.stringify(CONFIG);
const jogo = (a, b, s, regrasT1, instrA = {}) => simularPartida(criarRng(s), prepararTime({ nome: "A", escalacao: a, instrucoes: instrA }), prepararTime({ nome: "B", escalacao: b }), { regrasT1 });

// sem as regras: a instrução não muda nada, e o CONFIG volta ao que era depois de cada partida
for (let s = 1; s <= 10; s++) {
  const a = onze("4-2-3-1", s), b = onze("4-4-2", s + 500), txt = p => JSON.stringify([p.placar, p.narracao]);
  assert.strictEqual(txt(jogo(a, b, s, false, { aoPerder: "pressionar" })), txt(jogo(a, b, s, false)), "sem as regras da T1, pressionar não muda o jogo");
  jogo(a, b, s, true, { aoPerder: "recompor" });
}
assert.strictEqual(JSON.stringify(CONFIG), antes, "o CONFIG volta ao que era");
assert.strictEqual(CONFIG.regrasT1, false);

// com as regras: soma de muitos jogos
const soma = (papeis, instrA, N = 400) => {
  let contrasSofridos = 0, retomadas = 0;
  for (let n = 0; n < N; n++) {
    const p = jogo(onze("4-2-3-1", 1000 + n % 40, papeis), onze("4-2-3-1", 1500 + n % 40), n, true, instrA);
    contrasSofridos += p.estat[1].contraAtaques; retomadas += p.estat[0].retomadas || 0;
  }
  return { contrasSofridos: contrasSofridos / N, retomadas: retomadas / N };
};
const fixos = soma({}, {}), apoiadores = soma({ DR: "apoiador", DL: "apoiador" }, {});
assert.ok(apoiadores.contrasSofridos > fixos.contrasSofridos * 1.15, `defesa de reserva: Apoiadores ${apoiadores.contrasSofridos} x Fixos ${fixos.contrasSofridos}`);
const recompoe = soma({}, { aoPerder: "recompor" }), pressiona = soma({}, { aoPerder: "pressionar" });
assert.ok(recompoe.contrasSofridos < fixos.contrasSofridos * 0.7, `recompor: ${recompoe.contrasSofridos} x ${fixos.contrasSofridos}`);
assert.ok(pressiona.retomadas > 0.5 && fixos.retomadas === 0, `pressionar retoma a bola: ${pressiona.retomadas}`);
console.log("teste_regras_t1: ok", JSON.stringify({ fixos, apoiadores, recompoe, pressiona }));
