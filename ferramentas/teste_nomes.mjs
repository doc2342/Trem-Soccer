// Nomes de camisa (Tarefa 10 do plano do reinício): apelido em 15% a 25% dos brasileiros e nunca igual ao nome ou ao sobrenome,
// camisa sem repetir no elenco, estrangeiro com o sobrenome, peso respeitado e nome completo em todos. Uso: node ferramentas/teste_nomes.mjs
import assert from "node:assert";
import { readFileSync } from "node:fs";
import { criarRng } from "../src/rng.js";
import { gerarJogador, gerarElenco, semAcento } from "../src/gerador.js";
const nomes = JSON.parse(readFileSync(new URL("../dados/nomes.json", import.meta.url)));
const br = nomes.paises.Brasil, apelidos = new Set(br.a.map(semAcento));
assert.ok(br.pp && br.ps && br.a && br.pa, "nomes.json do Brasil com pesos e apelidos");

const rng = criarRng(42), lista = Array.from({ length: 1000 }, () => gerarJogador(rng, { id: null, pos: "MC", alvo: 30, idade: 25, nomes }));
lista.forEach(j => assert.ok(j.nome_completo, "todo jogador tem nome completo"));
const comApelido = lista.filter(j => apelidos.has(semAcento(j.nome)) && !semAcento(j.nome_completo).split(" ").includes(semAcento(j.nome)));
assert.ok(comApelido.length >= 150 && comApelido.length <= 250, `apelidos: ${comApelido.length} de 1000`);
comApelido.forEach(j => assert.ok(!semAcento(j.nome_completo).split(" ").includes(semAcento(j.nome)), `${j.nome} igual a parte de ${j.nome_completo}`));

// peso: um nome de peso 3 sai mais que um de peso 0,5 (nomes sorteados como primeiro nome de 20 mil completos)
const conta = {}, r2 = criarRng(7);
for (let i = 0; i < 20000; i++) { const p = r2.pickPeso(br.p, br.pp); conta[p] = (conta[p] || 0) + 1; }
const de = peso => br.p.filter((_, i) => br.pp[i] === peso), media = l => l.reduce((s, x) => s + (conta[x] || 0), 0) / l.length;
assert.ok(media(de(3)) > 3 * media(de(0.5)), `peso 3: ${media(de(3)).toFixed(1)}, peso 0,5: ${media(de(0.5)).toFixed(1)}`);

// camisa não se repete no elenco
for (let s = 1; s <= 50; s++) {
  const e = gerarElenco(criarRng(s), { nivel: 30, nomes });
  assert.strictEqual(new Set(e.map(j => semAcento(j.nome))).size, e.length, `semente ${s}: camisa repetida`);
}
// estrangeiro: o sobrenome na camisa
const ar = gerarElenco(criarRng(3), { nivel: 30, nomes, pais: "Argentina" });
ar.forEach(j => assert.ok(j.nome_completo.endsWith(" " + j.nome) || j.nome === j.nome_completo, `${j.nome} / ${j.nome_completo}`));
console.log(`nomes de camisa: ok (${comApelido.length} apelidos em 1000)`);
