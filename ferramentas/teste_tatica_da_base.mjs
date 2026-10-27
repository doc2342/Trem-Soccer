// Confere a tática da base: esquema do time principal, vagas fixadas pelo dirigente, vagas abertas automáticas e estilo escolhido.
// node ferramentas/teste_tatica_da_base.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { criarRng } from "../src/rng.js";
import { gerarElenco } from "../src/gerador.js";
import { escalacaoDaBase, timeDaBase, contratadoNaBase, CONFIG_LIGA_DE_BASE } from "../src/ligabase.js";
import { FORMACOES } from "../src/escalacao.js";

const nomes = JSON.parse(readFileSync(new URL("../dados/nomes.json", import.meta.url)));
const elenco = gerarElenco(criarRng(7), { nivel: 20, nomes, prefixoId: "j" });
const goleiro = elenco.find(j => j.pos === "GK"), linha = elenco.filter(j => j.pos !== "GK");
const juvenis = [goleiro, ...linha.slice(0, 5)].map(j => ({ ...j, juvenil: true })); // só 6 juvenis: o resto é garoto
const formacao = ["GK", "DR", "DC", "DC", "DL", "DMC", "MC", "MC", "AMC", "FC", "FC"];

// sem formação: escolhe entre os esquemas do bot, como antes
assert.notEqual(escalacaoDaBase(juvenis).nome, "do time principal");

// com formação e um fixo (inclusive improvisado): o esquema é o do clube e o fixo fica onde foi posto
const alvo = juvenis[3], id = String(alvo.id).replace(/^j/, "");
const e = escalacaoDaBase(juvenis, [], {}, { formacao, fixos: { 9: id, 0: String(linha[0].id) } });
assert.equal(e.nome, "do time principal");
assert.deepEqual(e.vagas.map(v => v.pos), formacao);
assert.equal(e.vagas[9].j, alvo); assert.ok(e.vagas[9].fixo);
assert.ok(!e.vagas[0].fixo && e.vagas[0].j === juvenis[0], "jogador de linha não vai para o gol; o goleiro juvenil fica lá");
assert.equal(new Set(e.vagas.filter(v => v.j).map(v => v.j)).size, juvenis.length, "os outros juvenis entram nas vagas abertas");

// formação inválida cai no automático
assert.notEqual(escalacaoDaBase(juvenis, [], {}, { formacao: ["GK"] }).nome, "do time principal");

// o fixado não sai no intervalo, mesmo com muitos juvenis
const muitos = elenco.map(j => ({ ...j, juvenil: true })), fixo = muitos.find(j => j.pos === "MC");
const m = escalacaoDaBase(muitos, [], { [fixo.id]: 900 }, { formacao, fixos: { 6: String(fixo.id).replace(/^j/, "") } });
assert.equal(m.vagas[6].j, fixo);
assert.ok(!m.trocas.some(t => t.vaga === 6), "fixado não é trocado");

// time pronto: 11 em campo, estilo escolhido vale e valor inválido é ignorado
const t = timeDaBase(criarRng(1), { juvenis, formacao, tatica: { fixos: { 9: id }, instr: { passe: "longo", pressao: 2, mentalidade: 9 } } });
assert.equal(t.escalacao.length, 11);
assert.equal(t.instrucoes.passe, "longo"); assert.equal(t.instrucoes.pressao, 2);
assert.ok([-2, -1, 0, 1, 2].includes(t.instrucoes.mentalidade));
console.log("tática da base: ok");

// esquema próprio da base: vale por cima do principal; nome inválido volta ao principal
const t2 = timeDaBase(criarRng(1), { juvenis, formacao, tatica: { esquema: "5-3-2" } });
assert.deepEqual(t2.escalacao.map(x => x.pos), FORMACOES["5-3-2"]);
assert.deepEqual(timeDaBase(criarRng(1), { juvenis, formacao, tatica: { esquema: "9-9-9" } }).escalacao.map(x => x.pos), formacao);
assert.deepEqual(timeDaBase(criarRng(1), { juvenis, tatica: { esquema: "4-4-2" } }).escalacao.map(x => x.pos), FORMACOES["4-4-2"], "sem tática principal, o esquema da base vale");
console.log("esquema próprio ok");

// vagas livres (assimétricas) valem por cima do esquema pronto; inválidas são ignoradas
const livres = ["GK", "DR", "DC", "DC", "WBL", "DMC", "MC", "AML", "MR", "SC", "FC"];
assert.deepEqual(timeDaBase(criarRng(1), { juvenis, formacao, tatica: { vagas: livres, esquema: "5-3-2" } }).escalacao.map(x => x.pos), livres);
assert.deepEqual(timeDaBase(criarRng(1), { juvenis, formacao, tatica: { vagas: ["GK", "GK"] } }).escalacao.map(x => x.pos), formacao);
console.log("vagas livres ok");

// contratados: no máximo CONFIG_LIGA_DE_BASE.contratados em campo, mesmo fixados; o elenco inicial (chegou vazio) e o formado não contam
assert.ok(!contratadoNaBase(null, null, 5) && !contratadoNaBase(5, 0, 5) && contratadoNaBase(null, 0, 5) && contratadoNaBase(9, 2, 5));
const pros = linha.map(j => ({ ...j, juvenil: false, contratado: true }));
const k = escalacaoDaBase([goleiro].map(j => ({ ...j, juvenil: true })), pros, {}, { formacao, fixos: Object.fromEntries(pros.slice(0, 5).map((j, i) => [i + 1, String(j.id).replace(/^j/, "")])) });
assert.equal(k.vagas.filter(v => v.j && v.j.contratado).length, CONFIG_LIGA_DE_BASE.contratados, "só 3 contratados entram");
const casa = linha.map(j => ({ ...j, juvenil: false }));
assert.ok(escalacaoDaBase([], casa, {}, { formacao }).vagas.filter(v => v.j).length > CONFIG_LIGA_DE_BASE.contratados, "elenco inicial e formados não têm limite");
console.log("limite de contratados ok");

// trocas do intervalo escolhidas pelo dirigente: valem antes das automáticas, que completam as cinco
const semJ = j => String(j.id).replace(/^j/, "");
const a0 = escalacaoDaBase(muitos, [], {}, { formacao });
const banco = muitos.filter(j => !a0.vagas.some(v => v.j === j)), titular = a0.vagas[3].j;
const escolhido = banco.filter(j => j.pos !== "GK").at(-1), vagaGol = formacao.indexOf("GK");
const mt = escalacaoDaBase(muitos, [], {}, { formacao, trocas: [{ entra: semJ(escolhido), vaga: 3 }, { entra: semJ(titular), vaga: 5 }, { entra: semJ(banco.find(j => j.pos !== "GK" && j !== escolhido)), vaga: vagaGol }] });
assert.deepEqual(mt.trocas[0], { vaga: 3, entra: escolhido, manual: true }, "a troca escolhida entra na vaga pedida");
assert.ok(!mt.trocas.some(t => t.entra === titular), "quem começa não entra no intervalo");
assert.ok(!mt.trocas.some(t => t.manual && t.vaga === vagaGol), "jogador de linha não entra no gol");
assert.equal(mt.trocas.length, Math.min(CONFIG_LIGA_DE_BASE.trocas, banco.length), "as automáticas completam");
assert.equal(new Set(mt.trocas.map(t => t.vaga)).size, mt.trocas.length, "uma troca por vaga");
const sem = escalacaoDaBase(muitos, [], {}, { formacao, trocas: [{ entra: semJ(escolhido), vaga: null }] });
assert.ok(sem.trocas[0].manual && sem.trocas[0].entra === escolhido, "sem vaga, entra onde o rodízio escolheria");
assert.ok(!sem.fora.includes(escolhido));
const tt = timeDaBase(criarRng(1), { juvenis: muitos, formacao, tatica: { trocas: [{ entra: semJ(escolhido), vaga: 3 }] } });
assert.equal(tt.instrucoes.substituicoes[0].entra, escolhido.id);
console.log("trocas escolhidas ok");
