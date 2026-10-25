// Sem divisão 3: grupos A, B, C e D (B4 = "E" se precisar); o guardado ("X") não é da liga. Uso: node ferramentas/teste_grupos.mjs
import assert from "node:assert";
import { divisaoDoGrupo, GRUPOS_DA_B, ehDaLiga, PREMIOS, NOTA_DO_JOVEM_POR_DIVISAO, TALENTO_DO_JOVEM_POR_DIVISAO } from "../src/virada.js";
import { TETO_DE_FOLHA, PREMIO_MINIMO } from "../src/economia.js";
import { CONFIG_TREINO } from "../src/treino.js";
import { readFileSync } from "node:fs";

for (const [g, d] of [["A", 1], ["ARG", 1], ["B", 2], ["C", 2], ["D", 2], ["E", 2], ["X", 2]]) assert.equal(divisaoDoGrupo(g), d, g);
assert.deepEqual(GRUPOS_DA_B, ["B", "C", "D"]);
assert.equal(ehDaLiga("D"), true); assert.equal(ehDaLiga("X"), false); assert.equal(ehDaLiga("URU"), false);
for (const [nome, o] of Object.entries({ TETO_DE_FOLHA, PREMIO_MINIMO, PREMIOS, NOTA_DO_JOVEM_POR_DIVISAO, TALENTO_DO_JOVEM_POR_DIVISAO, ctSemDono: CONFIG_TREINO.ctSemDono }))
  assert.equal(3 in o, false, nome + " ainda tem a divisão 3");
// banco.js importa o Supabase por https e não carrega no node: confere o texto
const nomes = readFileSync(new URL("../src/banco.js", import.meta.url), "utf8").match(/nomeBaseDoGrupo = g => \(\{([^}]*)\}\)/)[1];
assert.match(nomes, /D: "Brasileiro Série B3"/); assert.match(nomes, /E: "Brasileiro Série B4"/); assert.doesNotMatch(nomes, /F:|Série C/);
console.log("grupos ok");
