// Confere o playoff de acesso: semifinal 3º x 4º, final do 2º contra o vencedor; e o formato antigo (duas semifinais) ainda fecha.
// Uso: node ferramentas/teste_playoff.mjs
import assert from "node:assert";
import { proximaFaseDosPlayoffs } from "../src/rodada.js";

// grupo D (terceira divisão) com 6 clubes; o clube de número menor vence todos os de número maior: a tabela sai 1, 2, 3, 4, 5, 6
const clubes = [1, 2, 3, 4, 5, 6].map(id => ({ id, nome: "Clube " + id, grupo: "D", divisao: 3 }));
const partidas = [], resultados = [];
const jogo = (fase, casa, fora, gc, gf) => { const id = partidas.length + 1; partidas.push({ id, grupo: "D", fase, casa, fora }); if (gc != null) resultados.push({ partida_id: id, gols_casa: gc, gols_fora: gf }); };
for (let a = 1; a <= 6; a++) for (let b = a + 1; b <= 6; b++) jogo("liga", a, b, 1, 0);
const lados = r => r.jogos.map(j => `${j.fase} ${j.casa}x${j.fora}`).join(", ");

assert.equal(lados(proximaFaseDosPlayoffs({ clubes, partidas, resultados })), "semi 3x4");
jogo("semi", 3, 4, 0, 1); // o 4º vence fora
assert.equal(lados(proximaFaseDosPlayoffs({ clubes, partidas, resultados })), "final 2x4");

// formato antigo: com duas semifinais no grupo, a final é entre os dois vencedores
jogo("semi", 2, 5, 1, 1); // empate classifica o mandante
assert.equal(lados(proximaFaseDosPlayoffs({ clubes, partidas, resultados })), "final 2x4");
console.log("playoff ok");
