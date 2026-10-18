// Confere o playoff da segunda divisão (desde a T14): preliminar 3x6 e 4x5 em jogo único, semifinal e final em ida e volta com agregado.
// Uso: node ferramentas/teste_playoff.mjs
import assert from "node:assert";
import { proximaFaseDosPlayoffs, vencedorDoGrupo } from "../src/rodada.js";

// grupo B com 8 clubes; o clube de número menor vence todos os de número maior: a tabela sai 1, 2, ..., 8. Um grupo da A não entra.
const clubes = [...[1, 2, 3, 4, 5, 6, 7, 8].map(id => ({ id, nome: "Clube " + id, grupo: "B", divisao: 2 })), { id: 9, nome: "A1", grupo: "A", divisao: 1 }, { id: 10, nome: "A2", grupo: "A", divisao: 1 }];
const partidas = [], resultados = [];
const jogo = (fase, casa, fora, gc, gf, rodada = 1, grupo = "B") => { const id = partidas.length + 1; partidas.push({ id, grupo, fase, rodada, casa, fora }); if (gc != null) resultados.push({ partida_id: id, gols_casa: gc, gols_fora: gf }); return id; };
let r = 0;
for (let a = 1; a <= 8; a++) for (let b = a + 1; b <= 8; b++) { jogo("liga", a, b, 1, 0, 1 + (r % 14)); jogo("liga", b, a, 0, 1, 1 + ((r + 7) % 14)); r++; }
const proxima = () => proximaFaseDosPlayoffs({ clubes, partidas, resultados });
const lados = x => x.jogos.map(j => `${j.fase}/${j.rodada}/e${j.etapa} ${j.casa}x${j.fora}`).join(", ");
const cria = x => x.jogos.map(j => jogo(j.fase, j.casa, j.fora, null, null, j.rodada));
const resultado = (id, gc, gf) => resultados.push({ partida_id: id, gols_casa: gc, gols_fora: gf });

// a liga do grupo ainda em jogo: nada
const pendente = jogo("liga", 9, 10, null, null, 1, "A"); // a Série A ainda jogando não segura o grupo B
assert.equal(lados(proxima()), "pre/15/e0 3x6, pre/15/e0 4x5");
let ids = cria(proxima());
assert.match(proxima().erro, /Ainda em jogo: B/);
resultado(ids[0], 1, 1); // 3x6 empata: passa o mandante (3)
resultado(ids[1], 0, 2); // 5 vence o 4 fora
assert.equal(lados(proxima()), "semi/16/e1 5x1, semi/17/e2 1x5, semi/16/e1 3x2, semi/17/e2 2x3");
ids = cria(proxima());
resultado(ids[0], 2, 0); resultado(ids[1], 1, 0); // 5 x 1: 2x0 na ida, 1x0 na volta para o 1 → agregado 2x1, passa o 5
resultado(ids[2], 1, 0); resultado(ids[3], 1, 0); // 3 x 2: 1x1 no agregado → passa a melhor campanha (2)
assert.equal(lados(proxima()), "final/18/e3 5x2, final/19/e4 2x5");
ids = cria(proxima());
assert.equal(vencedorDoGrupo(partidas, resultados, "B"), null);
resultado(ids[0], 3, 1); resultado(ids[1], 2, 0); // agregado 3x3 → o 2 (melhor campanha, mandante da volta)
assert.equal(vencedorDoGrupo(partidas, resultados, "B"), 2);
assert.match(proxima().erro, /já foram todos criados/);
resultados.push({ partida_id: pendente, gols_casa: 0, gols_fora: 0 });
console.log("playoff ok");
