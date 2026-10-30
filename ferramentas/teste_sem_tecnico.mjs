// Time sem técnico na T0 (bot ou dono que não entrou desde a virada): contra dono ativo rende menos; entre dois sem técnico, nada muda.
import assert from "node:assert";
import { readFileSync } from "node:fs";
import { criarRng } from "../src/rng.js";
import { gerarElenco } from "../src/gerador.js";
import { calcularPartida, semTecnico } from "../src/rodada.js";

const ativo = { dono: "x", ultimo_acesso: "2026-10-30T10:00:00+00:00" }, sumiu = { dono: "x", ultimo_acesso: "2026-10-26T12:00:00+00:00" };
assert.equal(semTecnico({ dono: null }, 0), true);
assert.equal(semTecnico(sumiu, 0), true);
assert.equal(semTecnico({ dono: "x", ultimo_acesso: null }, 0), true);
assert.equal(semTecnico(ativo, 0), false);
assert.equal(semTecnico({ ...sumiu, extra: true }, 0), false);
assert.equal(semTecnico({ dono: null }, 1), false); // só na T0

const nomes = JSON.parse(readFileSync(new URL("../dados/nomes.json", import.meta.url)));
const e1 = gerarElenco(criarRng(9), { nivel: 30, nomes, prefixoId: "a" }), e2 = gerarElenco(criarRng(19), { nivel: 30, nomes, prefixoId: "b" });
const jogar = (c1, c2, fase = "liga") => calcularPartida({ partida: { id: 1, inicio: "2026-11-01T11:00:00Z", fase }, casa: { clube: { id: 1, nome: "A", ...c1 }, elenco: e1, tatica: null }, fora: { clube: { id: 2, nome: "B", ...c2 }, elenco: e2, tatica: null }, semente: 4242, temporada: 0 }).lances.map(l => l.dados.texto).join("\n");
const normal = jogar(ativo, ativo);
assert.equal(jogar({ dono: null }, sumiu), normal, "dois sem técnico: jogo igual");
assert.notEqual(jogar({ dono: null }, ativo), normal, "bot contra dono ativo: o bot rende menos");
assert.notEqual(jogar(ativo, sumiu), normal, "dono sumido contra dono ativo: rende menos");
assert.equal(jogar({ dono: null }, ativo, "base"), normal, "liga de base não muda");
console.log("ok");
