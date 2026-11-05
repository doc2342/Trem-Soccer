// Evolução da temporada (aba Treino): atributos, XP e nota ganhos desde a foto do início. Uso: node ferramentas/teste_evolucao.mjs
import assert from "node:assert";
import { evolucaoDaTemporada } from "../src/evolucao.js";
import { ATRIBUTOS, IDX, notaBruta } from "../src/modelo.js";
const at = v => ATRIBUTOS.map(() => v), soma = a => a.reduce((s, v) => s + v, 0);
const foto = (j, t, exp) => ({ t, nota: Math.round(notaBruta(j.at, j.pos) * 10) / 10, soma: soma(j.at), exp, idade: j.idade });
const A0 = { id: 1, pos: "SC", idade: 19, at: at(10) }, B0 = { id: 2, pos: "DC", idade: 33, at: at(12) };
const A = { ...A0, exp: 34, at: at(10).map((v, i) => i === IDX.fin || i === IDX.dri ? v + 3 : v), inicio: foto(A0, 5, 20) };
const B = { ...B0, exp: null, at: at(12).map((v, i) => i === 4 ? v + 1 : v), inicio: foto(B0, 5, null) };
const C = { id: 3, pos: "MC", idade: 18, at: at(9), exp: 2, inicio: null }; // revelado na temporada: sem foto
const D = { id: 4, pos: "MC", idade: 25, at: at(9), exp: 50, inicio: { t: 4, nota: 1, soma: 1 } }; // foto de outra temporada
const ev = evolucaoDaTemporada([A, B, C, D], 5), de = id => ev.find(x => x.j.id === id);
assert.equal(ev.length, 2, "C e D fora");
assert.equal(de(1).atributos, 6); assert.equal(de(2).atributos, 1);
assert.equal(de(1).xp, 14); assert.equal(de(2).xp, 0, "33 anos: o piso pela idade não muda");
assert.equal(de(1).nota, Math.round((notaBruta(A.at, "SC") - A.inicio.nota) * 10) / 10);
assert.ok(de(1).nota > 0);
// foto antiga (do SQL 40, sem exp nem idade): a XP do início é o piso pela idade de hoje
const E = { id: 5, pos: "SC", idade: 20, exp: 40, at: at(10), inicio: { t: 5, nota: 1, soma: soma(at(10)) } };
assert.equal(evolucaoDaTemporada([E], 5)[0].xp, 40 - 24);
console.log("tudo certo");
