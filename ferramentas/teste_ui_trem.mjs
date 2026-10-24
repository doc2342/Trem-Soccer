// Confere as peças do visual novo (src/ui-trem.js): node ferramentas/teste_ui_trem.mjs
import assert from "node:assert/strict";
import { esc, rotulo, faixa, numero, botao, leitura, leituras, linhaDeEstacoes, ESTACOES, graficoDePosicoes } from "../src/ui-trem.js";

assert.equal(esc(`<a & "b">`), "&lt;a &amp; &quot;b&quot;&gt;");
assert.equal(esc(null), "");
assert.match(rotulo("Bastidores"), /class="t-rotulo"[^>]*>Bastidores</);
assert.ok(!rotulo("<b>").includes("<b>"));
// faixa: título em duas partes, destaque em negrito antes da frase, lado em html
const f = faixa({ rotulo: "Série B", titulo: "4º lugar ·", apagado: "8 rodadas", destaque: "Precisa de 2 pontos.", frase: "Dos 8 jogos…", lado: "<svg></svg>" });
assert.match(f, /class="t-faixa/);
assert.match(f, /<span class="t-apagado">8 rodadas<\/span>/);
assert.match(f, /<b>Precisa de 2 pontos.<\/b> Dos 8 jogos…/);
assert.match(f, /class="t-faixa-lado"><svg><\/svg>/);
assert.ok(!faixa({ rotulo: "x", titulo: "<script>" }).includes("<script>"));
assert.ok(!faixa({ rotulo: "x", titulo: "a" }).includes("t-faixa-lado"));
assert.ok(!faixa({ rotulo: "x", titulo: "a" }).includes("t-faixa-frase"));
// número
assert.match(numero({ rotulo: "Caixa", valor: 61, sufixo: "mi", legenda: "hoje" }), /t-numero-valor">61<small>mi<\/small>/);
// botões
assert.match(botao({ texto: "Ajustar a tática", abaIr: "tatica", tipo: "principal" }), /^<button type="button" class="t-botao t-botao-principal" data-aba-ir="tatica">Ajustar a tática<\/button>$/);
assert.match(botao({ texto: "Ver", href: "x.html?a=1&b=2" }), /^<a class="t-botao" href="x.html\?a=1&amp;b=2">Ver<\/a>$/);
assert.match(botao({ texto: "Manter", abaIr: "tatica", tipo: "link" }), /class="t-botao t-botao-link"/);
// leitura
const l = leitura({ tipo: "falhou", titulo: "As costas do Pedrinho", frase: "46% dos ataques…", acao: { texto: "Ajustar a tática", abaIr: "tatica", tipo: "principal" } });
assert.match(l, /data-tipo="falhou"/);
assert.match(l, /t-leitura-tipo">Falhou</);
assert.match(l, /data-aba-ir="tatica"/);
assert.ok(!leitura({ tipo: "atencao", titulo: "a", frase: "b" }).includes("t-botao"));
assert.match(leitura({ tipo: "bloqueada", titulo: "a", frase: "b" }), /t-leitura-tipo">Analista</);
assert.match(leitura({ tipo: "resultado", titulo: "a", frase: "b" }), /t-leitura-tipo">O jogo</);
assert.equal(leituras([]), "");
assert.equal((leituras([{ tipo: "ok", titulo: "a", frase: "b" }, { tipo: "falhou", titulo: "c", frase: "d" }]).match(/class="t-leitura"/g) || []).length, 2);
// linha de estações
const nav = linhaDeEstacoes(ESTACOES, "tatica");
assert.equal((nav.match(/class="t-estacao/g) || []).length, 7);
assert.match(nav, /class="t-estacao ativa"[^>]*data-aba="tatica"/);
assert.match(nav, /^<nav class="t-linha" id="abas"/);
assert.match(nav, /<span class="t-curto">Merc\.<\/span>/);
assert.deepEqual(ESTACOES.map(e => e.aba), ["inicio", "elenco", "tatica", "base", "mercado", "clube", "classificacao"]);
assert.equal(ESTACOES.at(-1).nome, "Liga");
// gráfico de posições
assert.match(graficoDePosicoes([9, 7, 4], 12, 4), /^<svg/);
assert.match(graficoDePosicoes([9, 7, 4], 12, 4), /t-grafico-zona/);
assert.ok(!graficoDePosicoes([9, 7, 4], 12).includes("t-grafico-zona"));
assert.equal(graficoDePosicoes([], 12), "");
assert.match(graficoDePosicoes([3], 8), /t-grafico-ponto/); // uma rodada só: o ponto, sem linha quebrada
