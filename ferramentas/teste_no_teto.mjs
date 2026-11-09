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
// no teto o treino não para (rebalanço, 08/11): o foco sobe, outro atributo que pesa paga, e a nota não passa do limite
let k = { ...cheio, pts: null }, subiram = 0, desceram = 0;
const notaAntes = notaDeTeto(cheio);
for (let s = 0; s < 40; s++) { const r = treinar(k, { tal }); assert.ok(r && r.noTeto); subiram += r.subiu.length; desceram += r.desceu.length; k = { ...k, at: r.at, pts: r.pts }; }
assert.ok(subiram > 0 && desceram >= subiram, `subiram ${subiram}, desceram ${desceram}`);
assert.ok(notaDeTeto(k) <= Math.max(limite, notaAntes) + 1e-9, "a nota não cresce no teto");
// depois dos 30 o treino para pela idade, não pelo teto; sem talento (telas), ninguém é marcado
assert.equal(chegouAoTeto({ ...cheio, idade: 31 }, tal), false);
assert.equal(chegouAoTeto(cheio, null), false);
console.log("no teto: ok");
