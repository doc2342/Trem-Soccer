// Confere o adversário do amistoso (taticaDoAmistoso): o dirigente repete a escalação do último jogo; sem ela, tática de bot.
// Uso: node ferramentas/teste_amistoso.mjs
import assert from "node:assert";
import { readFileSync } from "node:fs";
import { criarRng } from "../src/rng.js";
import { gerarElenco } from "../src/gerador.js";
import { taticaBot } from "../src/bot.js";
import { taticaDoAmistoso } from "../src/rodada.js";

const nomes = JSON.parse(readFileSync(new URL("../dados/nomes.json", import.meta.url)));
const elenco = gerarElenco(criarRng(5), { nivel: 34, nomes, prefixoId: "j" });
// a escalação observada: os 11 do bot, mas com o goleiro reserva no gol
const bot = taticaBot(elenco), reserva = elenco.find(j => j.pos === "GK" && !bot.escalacao.some(x => x.j === j));
const observada = { jogos: 1, vagas: bot.escalacao.map(x => ({ pos: x.pos, j: x.pos === "GK" ? reserva : x.j })) };
const t = taticaDoAmistoso(elenco, observada, {});
assert.equal(t.origem, "escalação do último jogo");
assert.deepEqual(t.escalacao.map(x => x.j.id), observada.vagas.map(v => v.j.id));
assert.equal(t.banco.length > 0, true); assert.equal(t.escalacao.length, 11); assert.ok(t.forca > 0);
assert.ok(!t.banco.some(j => t.escalacao.some(x => x.j === j))); // ninguém no campo e no banco
assert.equal(taticaDoAmistoso(elenco, null, {}).origem, "tática de bot");
assert.equal(taticaDoAmistoso(elenco, { jogos: 1, vagas: observada.vagas.slice(0, 9) }, {}).origem, "tática de bot"); // incompleta: bot
console.log("amistoso ok");
