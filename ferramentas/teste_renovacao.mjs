// Confere a renovação automática da virada (src/virada.js, 99_renovacao_automatica.sql): quem vence renova por uma temporada,
// o marcado "não renovar" sai, o teto de folha tira os renovados mais caros, e o elenco nunca fica abaixo de 16.
// Uso: node ferramentas/teste_renovacao.mjs
import assert from "node:assert"; import { readFileSync } from "node:fs";
const imp = f => import(new URL("../src/" + f, import.meta.url));
const { criarRng } = await imp("rng.js"), G = await imp("gerador.js"), E = await imp("economia.js"), { planejarVirada } = await imp("virada.js");
const nomes = JSON.parse(readFileSync(new URL("../dados/nomes.json", import.meta.url)));

// clube com dirigente ativo: 20 jogadores de 25 anos, 4 vencem nesta temporada (T5); folha folgada, a não ser que o teto aperte
function rodar({ marcados = [], teto = 1e9, vencem = 4, total = 20 }) {
  const rng = criarRng(11), el = G.gerarElenco(rng, { nivel: 30, nomes }).slice(0, total).map((j, i) => ({ ...j, id: "j" + (i + 1), idade: 25,
    salario: 500 + 10 * i, mercado: E.salarioDeMercado(j), contratoAte: i < vencem ? 5 : 7, aposentaEm: null, naoRenovar: marcados.includes(i + 1) }));
  const clube = { id: 1, grupo: "A", divisao: 1, dono: "u", ultimo_acesso: new Date().toISOString(), nome: "Trem", perfil: "equilibrado" };
  const { plano, resumo } = planejarVirada({ rng, liga: { temporada: 5 }, clubes: [clube], elencos: { 1: el }, talentos: {}, partidas: [], resultados: [], nomes,
    comLivres: true, tetos: { 1: teto, 2: teto, 3: teto }, semMovimentos: true });
  const livres = new Set(plano.livres.map(x => x.id)), renovados = plano.jogadores.filter(r => r.contrato_ate === 6 && !livres.has(r.id)).map(r => r.id);
  return { livres, renovados, resumo, novos: plano.novos.filter(n => n.clube_id === 1).length };
}

let r = rodar({});
assert.deepEqual(r.renovados.sort(), [1, 2, 3, 4], "os 4 que vencem renovam por uma temporada");
assert.equal(r.livres.size, 0, "ninguém sai");
assert.equal(r.resumo.renovadosDono.length, 4, "o resumo lista os renovados do dirigente");

r = rodar({ marcados: [2] });
assert.ok(r.livres.has(2) && !r.renovados.includes(2), "o marcado sai livre");
assert.equal(r.renovados.length, 3);

r = rodar({ marcados: [1, 2, 3, 4], total: 18 });
assert.equal(18 - r.livres.size + r.novos, 16, "com 18 no elenco, os marcados saem só até sobrarem 16 (contando os jovens da base)");
assert.ok(r.livres.size < 4, "nem todos os 4 marcados saem");

const folhaSemOsRenovados = 20 * 500 + 10 * (20 * 19 / 2); // aproximação: o teto logo abaixo da folha renovada tira os mais caros
r = rodar({ teto: folhaSemOsRenovados - 1500 });
assert.ok(r.livres.size >= 1 && r.resumo.livres.every(x => x.peloTeto), "acima do teto, os renovados mais caros saem pelo teto");
assert.equal(r.resumo.renovadosDono.length, r.renovados.length, "quem saiu pelo teto não fica no resumo de renovados");
console.log("ok");
