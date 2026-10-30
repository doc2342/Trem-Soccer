// Pé fraco (plano dos papéis): sem a nota, o pé conta como antes; com ela, a perda do lado trocado vai com a nota; as palavras;
// e a trava da temporada: na temporada 0 a partida sai igual à de jogadores sem a nota, a partir da 1 a nota entra no jogo.
// Uso: node ferramentas/teste_pe_fraco.mjs
import assert from "node:assert";
import { readFileSync } from "node:fs";
import { ajusteDoPe, CONFIG_PE, IDX, nomeDoPeFraco, fraquezaDoPe, PE_FRACO_DESDE } from "../src/modelo.js";
import { criarRng } from "../src/rng.js";
import { gerarElenco, sortearPeFraco } from "../src/gerador.js";
import { calcularPartida } from "../src/rodada.js";
import { CONFIG } from "../src/motor.js";

const C = CONFIG_PE, perto = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} != ${b}`);
// sem a nota: igual a antes
assert.deepStrictEqual(ajusteDoPe("D", "DL"), { [IDX.cru]: C.cruzaMal, [IDX.pas]: C.passaMal });
assert.deepStrictEqual(ajusteDoPe("D", "AML"), { [IDX.cru]: C.cruzaMal, [IDX.fin]: C.finalizaBem, [IDX.lon]: C.finalizaBem });
assert.deepStrictEqual(ajusteDoPe("E", "DL"), { [IDX.cru]: C.cruzaBem });
assert.strictEqual(ajusteDoPe("A", "DL"), null);
assert.strictEqual(ajusteDoPe("D", "MC", 1), null, "pelo centro o pé não muda nada");
// lado trocado: nota 6 é a perda de antes; 13 ou mais quase nada; nota 1 perde mais
perto(ajusteDoPe("D", "DL", 6)[IDX.cru], C.cruzaMal);
perto(ajusteDoPe("D", "DL", 6)[IDX.pas], C.passaMal);
assert.ok(ajusteDoPe("D", "DL", 1)[IDX.cru] < C.cruzaMal && ajusteDoPe("D", "DL", 1)[IDX.cru] >= 1 - (1 - C.cruzaMal) * 1.5);
assert.ok(ajusteDoPe("A", "DL", 16)[IDX.cru] > 0.985, "ambidestro: perda quase zero");
// corte para dentro: o ponta do lado do pé bom com 13 ou mais também corta; abaixo, não
assert.strictEqual(ajusteDoPe("D", "RW", 13)[IDX.fin], C.finalizaBem);
assert.strictEqual(ajusteDoPe("D", "RW", 12)[IDX.fin], undefined);
assert.strictEqual(ajusteDoPe("A", "LW", 15)[IDX.fin], C.finalizaBem);

// palavras e fraqueza
assert.deepStrictEqual([1, 3, 4, 7, 10, 12, 13, 16, 17, 20].map(nomeDoPeFraco), ["Péssimo", "Péssimo", "Fraco", "Razoável", "Bom", "Bom", "Muito bom", "Muito bom", "Ambidestro", "Ambidestro"]);
assert.deepStrictEqual([fraquezaDoPe(1), fraquezaDoPe(11), fraquezaDoPe(20)], [1, 0, 0]);
// a média do CONFIG é a da liga: um pé de 1 a 12 (fraqueza média 5,5/12) e 8,3% de ambidestros (zero), como no banco em 28/10/2026
perto(Math.round(100 * 0.917 * Array.from({ length: 12 }, (_, k) => fraquezaDoPe(k + 1)).reduce((a, b) => a + b) / 12) / 100, CONFIG.peFraco.media);

// gerador: ambidestro de 13 a 20, os outros de 1 a 12, e a nota não muda o resto do sorteio
for (let k = 0; k < 200; k++) { const a = sortearPeFraco("x" + k, "A"), d = sortearPeFraco("x" + k, "D"); assert.ok(a >= 13 && a <= 20 && d >= 1 && d <= 12); }
const nomes = JSON.parse(readFileSync(new URL("../dados/nomes.json", import.meta.url)));
const e1 = gerarElenco(criarRng(9), { nivel: 30, nomes, prefixoId: "a" }), e2 = gerarElenco(criarRng(19), { nivel: 30, nomes, prefixoId: "b" });
assert.ok(e1.every(j => j.pe === "A" ? j.pf >= 13 : j.pf <= 12));

// trava da temporada
const lado = (id, elenco) => ({ clube: { id, nome: "Time " + id, dono: null }, elenco, tatica: null });
const jogar = (temporada, a = e1, b = e2) => calcularPartida({ partida: { id: 1, inicio: "2026-11-01T11:00:00Z", fase: "liga" }, casa: lado(1, a), fora: lado(2, b), semente: 4242, temporada }).lances.map(l => l.dados.texto).join("\n");
const sem = l => l.map(j => ({ ...j, pf: null }));
assert.strictEqual(PE_FRACO_DESDE, 1);
assert.strictEqual(jogar(0), jogar(0, sem(e1), sem(e2)), "temporada 0: a nota não entra");
assert.strictEqual(jogar(undefined), jogar(0, sem(e1), sem(e2)), "sem temporada: também não");
// a temporada 1 também liga as regras da T1 (motor.js, regrasT1), então a nota se compara dentro da mesma temporada
assert.notStrictEqual(jogar(1), jogar(1, sem(e1), sem(e2)), "temporada 1: a nota muda o jogo");
// narração: o chute com o pé ruim aparece a partir da temporada 1, nunca antes
const narrado = t => [3, 9, 27, 81].some(sm => calcularPartida({ partida: { id: sm, inicio: "2026-11-01T11:00:00Z", fase: "liga" }, casa: lado(1, e1), fora: lado(2, e2), semente: sm, temporada: t }).lances.some(l => /pé ruim|como se fosse o pé bom/.test(l.dados.texto || "")));
assert.ok(narrado(1) && !narrado(0));
console.log("pé fraco: ok");
