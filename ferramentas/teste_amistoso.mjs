// Amistoso (src/amistoso.js): a mesma semente dá o mesmo jogo; a tática cai de amistoso → campeonato → bot; o papel da tática
// entra no jogo; o bot de estilo é sempre o mesmo elenco e joga no estilo; o jogo gravado é pequeno.
// Uso: node ferramentas/teste_amistoso.mjs
import assert from "node:assert";
import { readFileSync } from "node:fs";
import { criarRng } from "../src/rng.js";
import { gerarElenco } from "../src/gerador.js";
import { taticaBot } from "../src/bot.js";
import { escalar, FORMACOES } from "../src/escalacao.js";
import { taticaParaAmistoso, elencoDoBot, ESTILOS_DE_BOT, jogarAmistoso, partidaParaGravar } from "../src/amistoso.js";

const nomes = JSON.parse(readFileSync(new URL("../dados/nomes.json", import.meta.url)));
const e1 = gerarElenco(criarRng(9), { nivel: 30, nomes, prefixoId: "a" }), e2 = gerarElenco(criarRng(19), { nivel: 30, nomes, prefixoId: "b" });
const onze = escalar(e1, FORMACOES["4-4-2"]);
const dados = { vagas: onze.map(x => x.pos), jog: onze.map(x => x.j.id) };

// tática: amistoso → campeonato → bot (Review Focus 1 e 3)
let t = taticaParaAmistoso(null, null, e1, {});
assert.strictEqual(t.origem, "tática de bot");
assert.strictEqual(t.escalacao.length, 11);
assert.strictEqual(taticaParaAmistoso(dados, null, e1, {}).origem, "tática de amistoso");
assert.strictEqual(taticaParaAmistoso({ vagas: ["GK"] }, dados, e1, {}).origem, "tática do campeonato", "tática de amistoso inválida cai para a do campeonato");
assert.strictEqual(taticaParaAmistoso({ vagas: ["GK"] }, { jog: [] }, e1, {}).origem, "tática de bot");
// jogador que saiu do clube: como na partida oficial, entra o melhor disponível para a vaga
const saiu = { ...dados, jog: dados.jog.map((id, i) => i === 1 ? "x-vendido" : id) };
t = taticaParaAmistoso(saiu, null, e1, {});
assert.strictEqual(t.origem, "tática de amistoso");
assert.ok(t.escalacao.every(x => x.j && x.j.id !== "x-vendido"));

// mesma semente → mesmo jogo; sementes diferentes → jogos diferentes
const bot2 = taticaParaAmistoso(null, null, e2, { perfil: "tecnico" });
const jogo = (semente, tatica = taticaParaAmistoso(dados, null, e1, {})) => jogarAmistoso({ casa: { nome: "A", tatica }, fora: { nome: "B", tatica: bot2 }, semente });
const j1 = jogo(42), j2 = jogo(42);
assert.deepStrictEqual(j1.placar, j2.placar);
assert.deepStrictEqual(j1.partida.narracao, j2.partida.narracao);
assert.ok(new Set(Array.from({ length: 20 }, (_, s) => jogo(s + 1).placar.join("x"))).size >= 2);
assert.deepStrictEqual(Object.keys(j1.resumo).sort(), ["chutes", "posse", "xg"]);
assert.strictEqual(j1.resumo.posse[0] + j1.resumo.posse[1], 100);
assert.ok(j1.relatorio.jogadores.length >= 22);

// o papel da tática entra no jogo (regras da T1 sempre ligadas)
const lat = dados.vagas.map(p => p === "DR" || p === "DL" ? "apoiador" : null), fixo = dados.vagas.map(p => p === "DR" || p === "DL" ? "fixo" : null);
const comPapel = taticaParaAmistoso({ ...dados, papeis: lat }, null, e1, {}), semPapel = taticaParaAmistoso({ ...dados, papeis: fixo }, null, e1, {});
assert.ok(comPapel.escalacao.some(x => x.papel === "apoiador"));
assert.ok(Array.from({ length: 20 }, (_, s) => s + 1).some(s => JSON.stringify(jogo(s, comPapel).partida.narracao) !== JSON.stringify(jogo(s, semPapel).partida.narracao)));

// bot de estilo: mesmo elenco sempre, joga no estilo
assert.deepStrictEqual(ESTILOS_DE_BOT, ["equilibrado", "tecnico", "fisico", "veloz", "tatico"]);
const b1 = elencoDoBot("tecnico", 30, nomes), b2 = elencoDoBot("tecnico", 30, nomes);
assert.deepStrictEqual(b1.map(j => [j.id, j.at]), b2.map(j => [j.id, j.at]));
assert.notDeepStrictEqual(elencoDoBot("fisico", 30, nomes).map(j => j.at), b1.map(j => j.at));
assert.strictEqual(taticaBot(b1, { perfil: "tecnico" }).instrucoes.passe, "curto");

// o que se grava é pequeno e tem o que o replay usa
const g = partidaParaGravar(j1.partida);
assert.ok(JSON.stringify(g).length < 80000, `partida gravada: ${JSON.stringify(g).length} caracteres`);
for (const k of ["placar", "xg", "estat", "lances", "eventos", "narracao", "jogadores", "ordens", "acrescimos", "duracao"]) assert.ok(k in g, k);
console.log("amistoso: ok");
