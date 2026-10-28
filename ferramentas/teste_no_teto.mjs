// Jogador no limite (163_no_teto.sql): chegouAoTeto é a mesma condição que faz o treinar parar.
// Uso: node ferramentas/teste_no_teto.mjs
import assert from "node:assert";
import { readFileSync } from "node:fs";
import { chegouAoTeto, treinar, tetoDaNota, folgaDoTeto } from "../src/treino.js";
import { notaDeTeto } from "../src/modelo.js";
import { gerarJogador } from "../src/gerador.js";
import { criarRng } from "../src/rng.js";
const nomes = JSON.parse(readFileSync(new URL("../dados/nomes.json", import.meta.url)));
const tal = 40, base = gerarJogador(criarRng(7), { id: "j77", pos: "MC", alvo: 26, idade: 22, nomes, usados: new Set() });
const j = { ...base, id: "j77" };
const limite = tetoDaNota(tal) + folgaDoTeto(j.id, tal);
assert.ok(notaDeTeto(j) < limite);
assert.equal(chegouAoTeto(j, tal), false);
assert.ok(treinar(j, { tal }));
// sobe os atributos até passar do limite: o treino para e a marca acende
const cheio = { ...j, at: j.at.map(v => Math.min(50, v + 30)) };
assert.ok(notaDeTeto(cheio) >= limite);
assert.equal(chegouAoTeto(cheio, tal), true);
assert.equal(treinar(cheio, { tal }), null);
// depois dos 30 o treino para pela idade, não pelo teto; sem talento (telas), ninguém é marcado
assert.equal(chegouAoTeto({ ...cheio, idade: 31 }, tal), false);
assert.equal(chegouAoTeto(cheio, null), false);
console.log("no teto: ok");
