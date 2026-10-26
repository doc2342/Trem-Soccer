// Técnico do ano geral (só dirigentes): pontos de liga, playoff da Série B, copa e continentais, com os casos combinados com o dono.
import assert from "node:assert";
import { pontosDoTecnicoGeral, tecnicoGeral } from "../src/rodada.js";
import { ATRIBUTOS } from "../src/modelo.js";

// Série A com 12 (ids 1 a 12, na ordem da tabela) e um grupo da B com 8 (ids 21 a 28)
const linhas = [...Array.from({ length: 12 }, (_, i) => ({ clube_id: i + 1, divisao: 1, grupo: "A", posicao: i + 1 })),
  ...Array.from({ length: 8 }, (_, i) => ({ clube_id: 21 + i, divisao: 2, grupo: "B", posicao: i + 1 }))];
let id = 1;
const jogo = (fase, casa, fora, extra = {}) => ({ id: id++, grupo: "B", rodada: 40, fase, casa, fora, ...extra });
const copa = (copa_fase, casa, fora, vencedor = null) => jogo("copa", casa, fora, { grupo: null, copa_fase, vencedor });
const lib = (grupo, copa_fase, casa, fora, vencedor = null) => jogo("lib", casa, fora, { grupo, copa_fase, vencedor });
// playoff da B: semis 21x24 e 22x23; final 21x23, o visitante 23 vence e sobe
const playoff = () => { const s1 = jogo("semi", 21, 24), s2 = jogo("semi", 22, 23), f = jogo("final", 21, 23);
  return { partidas: [s1, s2, f], resultados: [{ partida_id: s1.id, gols_casa: 1, gols_fora: 0 }, { partida_id: s2.id, gols_casa: 0, gols_fora: 1 }, { partida_id: f.id, gols_casa: 0, gols_fora: 1 }] }; };
const todos = new Set([1, 2, 3, 4, 5, 6, 7, 21, 22, 23, 24]);

// 1: campeão da A e da Copa do Brasil (16) contra campeão da Libertadores no meio da tabela (11 + 6º = 15)
{ const p = playoff(), partidas = [...p.partidas, copa(5, 1, 9), copa(5, 5, 10), copa(6, 1, 5, 1), lib("LIB", 6, 6, 50, 6)];
  const pts = pontosDoTecnicoGeral({ linhas, partidas, resultados: p.resultados, donos: new Set([1, 6, 21, 22, 23]) });
  assert.equal(pts[1], 16); assert.equal(pts[6], 15); assert.ok(pts[1] > pts[6]);
  assert.equal(pts[2], undefined, "bot fora"); assert.equal(pts[5], undefined);
  assert.equal(pts[23], 6, "campeão da B é quem vence o playoff");
  assert.equal(pts[21], 4); assert.equal(pts[22], 3); }

// 2: Libertadores + Série A (21); campeão da B + Copa do Brasil (12), acima do campeão da A sozinho (10)
{ const p = playoff(), partidas = [...p.partidas, lib("LIB", 6, 1, 50, 1), copa(6, 23, 9, 23)];
  const pts = pontosDoTecnicoGeral({ linhas, partidas, resultados: p.resultados, donos: todos });
  assert.equal(pts[1], 21); assert.equal(pts[23], 12); assert.ok(pts[23] > 10);
  assert.equal(tecnicoGeral({ linhas, partidas, resultados: p.resultados, elencos: {}, donos: todos }).clube_id, 1); }

// 3: Libertadores (11) acima do título da A (10); Sul-Americana, Supercopa e Recopa
{ const pts = pontosDoTecnicoGeral({ linhas: [{ clube_id: 1, divisao: 1, grupo: "A", posicao: 12 }, { clube_id: 2, divisao: 1, grupo: "A", posicao: 1 }, { clube_id: 3, divisao: 1, grupo: "A", posicao: 11 }],
    partidas: [lib("LIB", 6, 1, 50, 1), lib("SUL", 6, 3, 50, 3), copa(0, 3, 2, 3), lib("REC", 6, 3, 1, 3)], resultados: [], donos: new Set([1, 2, 3]) });
  assert.ok(pts[1] > pts[2]); assert.equal(pts[3], 5 + 1 + 1); }

// 4: final da copa ainda sem vencedor: os dois finalistas ficam como vice; grupo da B sem final de playoff: o 1º é o campeão
{ const pts = pontosDoTecnicoGeral({ linhas, partidas: [copa(6, 1, 5)], resultados: [], donos: todos });
  assert.equal(pts[1], 10 + 4); assert.equal(pts[5], 5 + 4); assert.equal(pts[21], 6); assert.equal(pts[22], 3); }

// 5: empate em pontos (3º da A = 7; 4º da A = 6 + quartas da copa 1 = 7): ganha quem mais superou o esperado pela força
{ const elenco = v => Array.from({ length: 11 }, () => ({ at: ATRIBUTOS.map(() => v), pos: "MC" }));
  const elencos = Object.fromEntries(linhas.map(x => [x.clube_id, elenco(x.clube_id === 3 ? 20 : x.clube_id === 4 ? 1 : 10)]));
  const partidas = [copa(4, 4, 9)], donos = new Set([3, 4]);
  const pts = pontosDoTecnicoGeral({ linhas, partidas, resultados: [], donos });
  assert.equal(pts[3], 7); assert.equal(pts[4], 7);
  assert.deepEqual(tecnicoGeral({ linhas, partidas, resultados: [], elencos, donos }), { grupo: "TODOS", clube_id: 4, numero: 7 }); }

// 6: sem dirigente, ou ninguém com ponto: sem prêmio
assert.equal(tecnicoGeral({ linhas, partidas: [], resultados: [], elencos: {}, donos: new Set() }), null);
assert.equal(tecnicoGeral({ linhas, partidas: [], resultados: [], elencos: {}, donos: new Set([11, 12, 28]) }), null);
console.log("técnico geral ok");
