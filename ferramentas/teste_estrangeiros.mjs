// Confere o limite de estrangeiros no mercado dos bots (src/mercadobots.js). Uso: node ferramentas/teste_estrangeiros.mjs
import assert from "node:assert"; import { readFileSync } from "node:fs";
const imp = f => import(new URL("../src/" + f, import.meta.url));
const { criarRng } = await imp("rng.js"), G = await imp("gerador.js"), E = await imp("economia.js"), B = await imp("mercadobots.js");
const nomes = JSON.parse(readFileSync(new URL("../dados/nomes.json", import.meta.url))), rng = criarRng(7);
const comSalario = j => ({ ...j, salario: E.salarioDeMercado(j), juvenil: false, aposentaEm: null });
const elenco = (pre, nivel, pais) => G.gerarElenco(rng, { nivel, pais, nomes, prefixoId: pre }).map(comSalario);
const clube = (id, pais) => ({ id, divisao: 1, pais, caixa: 50000, teto: 24000 });

// um craque argentino na lista: o bot do Brasil compra com 4 estrangeiros no elenco e não compra com 5
const craque = comSalario(G.gerarJogador(rng, { id: "j999", pos: "FC", alvo: 42, idade: 25, pais: "Argentina", nomes }));
const compra = n => { const el = elenco("a", 30, "Brasil"); el.slice(-n).forEach(j => { j.pais = "Uruguai"; });
  return B.comprasDeListados({ clubes: [clube(1, "Brasil")], elencos: { 1: el }, listados: [{ j: craque, preco: 3 * craque.salario }] }).length; };
assert.equal(compra(4), 1, "com 4 estrangeiros o bot compra o quinto");
assert.equal(compra(5), 0, "com 5 estrangeiros o bot não compra o sexto");

// entre bots: o clube fraco do Brasil se reforça no clube forte da Argentina, mas nunca passa de 5 estrangeiros
const clubes = [clube(1, "Brasil"), clube(2, "Argentina"), clube(3, "Argentina")], elencos = { 1: elenco("a", 26, "Brasil"), 2: elenco("b", 36, "Argentina"), 3: elenco("c", 36, "Argentina") };
const negocios = B.negociosEntreBots(rng, { clubes, elencos }, { ...B.CONFIG_MERCADO_BOTS, porJanela: 99, idadeMinima: 0, idadeMaxima: 99, elencoMinimo: 0 });
assert.ok(negocios.some(n => n.para === 1), "a fronteira abriu: o bot do Brasil compra na Argentina");
elencos[1].slice(0, 5).forEach(j => { j.pais = "Chile"; });
assert.ok(!B.negociosEntreBots(rng, { clubes, elencos }, { ...B.CONFIG_MERCADO_BOTS, porJanela: 99, idadeMinima: 0, idadeMaxima: 99, elencoMinimo: 0 }).some(n => n.para === 1), "com 5 estrangeiros, não compra mais fora");
console.log("ok");
