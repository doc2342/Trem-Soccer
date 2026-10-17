// Confere a tática da base: esquema do time principal, vagas fixadas pelo dirigente, vagas abertas automáticas e estilo escolhido.
// node ferramentas/teste_tatica_da_base.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { criarRng } from "../src/rng.js";
import { gerarElenco } from "../src/gerador.js";
import { escalacaoDaBase, timeDaBase } from "../src/ligabase.js";

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
