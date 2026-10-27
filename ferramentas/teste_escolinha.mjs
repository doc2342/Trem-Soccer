// Confere os juvenis do reinício (src/base.js, juvenisDoReinicio) e a saída do da escolinha na virada (src/virada.js, 155_garotos_da_escolinha.sql):
// 11 da escolinha de 16 anos com teto baixo e 2 comuns de talento 60 a 75; aos 21 o da escolinha se aposenta e o juvenil comum fica livre.
// Uso: node ferramentas/teste_escolinha.mjs
import assert from "node:assert"; import { readFileSync } from "node:fs";
const imp = f => import(new URL("../src/" + f, import.meta.url));
const { criarRng } = await imp("rng.js"), G = await imp("gerador.js"), B = await imp("base.js"), { planejarVirada } = await imp("virada.js"), { tetoDaNota } = await imp("treino.js");
const nomes = JSON.parse(readFileSync(new URL("../dados/nomes.json", import.meta.url)));

const lista = B.juvenisDoReinicio(criarRng(3), { nomes, usados: new Set() }), esc = lista.filter(j => j.escolinha), comuns = lista.filter(j => !j.escolinha);
assert.equal(esc.length, 11); assert.equal(comuns.length, 2);
assert.deepEqual(esc.map(j => j.pos), B.JUVENIS_DO_REINICIO.escolinha, "um onze, com goleiro");
assert.ok(lista.every(j => j.idade === 16 && j.juvenil && j.salario == null && j.protegido_ate === 5), "todos juvenis de 16, sem contrato");
assert.ok(esc.every(j => tetoDaNota(j.tal) < 28), "teto baixo: " + esc.map(j => j.tal));
assert.ok(comuns.every(j => j.tal >= 60 && j.tal <= 75), "talento de Série A: " + comuns.map(j => j.tal));
assert.equal(new Set(lista.map(j => j.nome)).size, 13, "nomes sem repetir");

// virada: aos 21 (fazendo 22), o da escolinha sai como aposentado e o comum fica livre; antes disso, ficam os dois
function virada(idade) {
  const rng = criarRng(5), el = G.gerarElenco(rng, { nivel: 30, nomes }).slice(0, 18).map((j, i) => ({ ...j, id: "j" + (i + 1), idade: 25, salario: 500, mercado: 500, contratoAte: 9, aposentaEm: null }));
  el.push({ ...lista[0], id: "j50", idade, juvenil: true, escolinha: true, aposentaEm: null }, { ...lista[11], id: "j51", idade, juvenil: true, aposentaEm: null });
  const clube = { id: 1, grupo: "A", divisao: 1, dono: "u", ultimo_acesso: new Date().toISOString(), nome: "Trem", perfil: "equilibrado" };
  return planejarVirada({ rng, liga: { temporada: 5 }, clubes: [clube], elencos: { 1: el }, talentos: {}, partidas: [], resultados: [], nomes, comLivres: true, juvenis: true, semMovimentos: true }).plano;
}
let p = virada(21);
assert.ok(p.aposentados.includes(50) && !p.livres.some(x => x.id === 50), "o da escolinha sai da liga");
assert.ok(p.livres.some(x => x.id === 51) && !p.aposentados.includes(51), "o juvenil comum fica livre");
p = virada(20);
assert.ok(!p.aposentados.includes(50) && !p.livres.some(x => x.id === 50 || x.id === 51), "aos 20 ficam os dois");
// 25 juvenis (os 11 da escolinha + 14 comuns de 17 anos): o jovem da virada toma a vaga do mais fraco da escolinha
{
  const rng = criarRng(5), el = G.gerarElenco(rng, { nivel: 30, nomes }).slice(0, 18).map((j, i) => ({ ...j, id: "j" + (i + 1), idade: 25, salario: 500, mercado: 500, contratoAte: 9, aposentaEm: null }));
  const soma = j => j.at.reduce((a, b) => a + b, 0), fraco = esc.reduce((m, j) => soma(j) < soma(m) ? j : m);
  esc.forEach((j, i) => el.push({ ...j, id: "j" + (100 + i), aposentaEm: null }));
  for (let i = 0; i < 14; i++) el.push({ ...comuns[0], id: "j" + (200 + i), idade: 17, aposentaEm: null });
  const clube = { id: 1, grupo: "A", divisao: 1, dono: "u", ultimo_acesso: new Date().toISOString(), nome: "Trem", perfil: "equilibrado", base_nivel: 0 };
  const plano = planejarVirada({ rng, liga: { temporada: 0 }, clubes: [clube], elencos: { 1: el }, talentos: {}, partidas: [], resultados: [], nomes, comLivres: true, juvenis: true, semMovimentos: true }).plano;
  const novos = plano.novos.filter(n => n.juvenil).length, saiu = plano.aposentados.filter(id => id >= 100 && id < 200);
  assert.ok(novos >= 1);
  assert.equal(saiu.length, novos, "um da escolinha sai por juvenil novo");
  assert.ok(saiu.includes(100 + esc.indexOf(fraco)), "sai o mais fraco");
}
console.log("teste_escolinha: ok");
