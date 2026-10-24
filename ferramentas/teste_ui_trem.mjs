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
// destaques: números da frase da leitura em negrito (como num jornal), sem abrir brecha para HTML
assert.match(leitura({ tipo: "falhou", titulo: "a", frase: "O adversário venceu 63% dos duelos ali." }), /venceu <b>63%<\/b> dos duelos/);
assert.match(leitura({ tipo: "resultado", titulo: "a", frase: "2,03 de xG nosso contra 0,67" }), /<b>2,03<\/b> de xG nosso contra <b>0,67<\/b>/);
assert.match(leitura({ tipo: "desfalque", titulo: "a", frase: "Fora por 2 jogos." }), /Fora por <b>2 jogos<\/b>\./);
assert.match(leitura({ tipo: "x", titulo: "a", frase: "<i>1</i>" }), /&lt;i&gt;<b>1<\/b>&lt;\/i&gt;/); // a tag da entrada sai escapada; só o negrito do número é nosso
// manchete: o começo da notícia em negrito (até os dois-pontos, ou a primeira frase)
import { manchete } from "../src/ui-trem.js";
assert.equal(manchete('<div><span class="">Noite de Pedrinho: 3 gols no 3 a 0.</span></div>'), '<div><span class=""><b>Noite de Pedrinho:</b> 3 gols no 3 a 0.</span></div>');
assert.equal(manchete('<div class="urg"><span class="aviso">18 contratos vencem no fim. Renovam sozinhos.</span></div>'), '<div class="urg"><span class="aviso"><b>18 contratos vencem no fim.</b> Renovam sozinhos.</span></div>');
// link de clube no meio da manchete entra no negrito; outra tag (img, span) não
assert.equal(manchete('<div><span class="">A base do <a class="lk" href="#c">Trem</a> revelou uma joia: Laerte</span></div>'), '<div><span class=""><b>A base do <a class="lk" href="#c">Trem</a> revelou uma joia:</b> Laerte</span></div>');
assert.equal(manchete('<div><span class="">Com <img src="x"> imagem: fica</span></div>'), '<div><span class="">Com <img src="x"> imagem: fica</span></div>');
// faixa com números embaixo da frase (html montado pela tela)
assert.match(faixa({ rotulo: "x", titulo: "3º lugar ·", frase: "a", numeros: "<span>36 pts</span>" }), /t-faixa-frase">a<\/p><div class="t-faixa-numeros"><span>36 pts<\/span><\/div>/);
assert.ok(!faixa({ rotulo: "x", titulo: "a" }).includes("t-faixa-numeros"));
// campo de zonas do vestiário: ataque e meio com os nossos duelos; a defesa com quanto seguramos o ataque deles (zona espelhada: AE deles = nossa DD)
import { campoDeZonas } from "../src/ui-trem.js";
const nossas = { AE: [3, 5], AC: [6, 2], AD: [4, 4], ME: [4, 4], MC: [5, 5], MD: [4, 4], DE: [1, 1], DC: [1, 1], DD: [1, 1] };
const deles = { AE: [6, 2], AC: [2, 6], AD: [3, 5] };
const cz = campoDeZonas(nossas, deles, ["DD"]);
assert.equal((cz.match(/class="t-zona/g) || []).length, 9);
assert.ok(cz.indexOf('data-zona="AE"') < cz.indexOf('data-zona="DE"')); // o ataque vem antes (em cima)
assert.match(cz, /data-zona="AC"[^>]*data-nivel="bom"[^>]*><b>75%<\/b>/);
assert.match(cz, /class="t-zona t-zona-destaque" data-zona="DD"[^>]*data-nivel="ruim"[^>]*><b>25%<\/b>/); // seguramos 2 de 8 ataques deles pela AE
assert.match(cz, /data-zona="DC"[^>]*data-nivel="bom"[^>]*><b>75%<\/b>/);
assert.match(campoDeZonas({ ...nossas, ME: [1, 1] }, deles, []), /data-zona="ME"[^>]*data-nivel="pouco"[^>]*><b>—<\/b>/); // menos de 6 duelos: sem número
assert.match(campoDeZonas(nossas, null, []), /data-zona="DD"[^>]*data-nivel="pouco"/); // sem os dados deles, a defesa fica sem número
assert.equal(campoDeZonas(null, deles, []), "");
// régua de estatísticas do último jogo: nós × eles, barra proporcional, o maior em negrito; posse em %, xG com vírgula
import { reguaDoJogo } from "../src/ui-trem.js";
const rg = reguaDoJogo({ xg: 2.034, posse: 54, finalizacoes: 14, noGol: 6, faltas: 9, escanteios: 5 }, { xg: 0.67, posse: 46, finalizacoes: 6, noGol: 2, faltas: 12, escanteios: 3 });
assert.equal((rg.match(/class="t-regua-linha"/g) || []).length, 6);
assert.match(rg, /<b>2,03<\/b><span class="t-regua-nome">xG<\/span><span>0,67<\/span>/);
assert.match(rg, /<b>54%<\/b><span class="t-regua-nome">Posse<\/span><span>46%<\/span>/);
assert.match(rg, /<span>9<\/span><span class="t-regua-nome">Faltas<\/span><b>12<\/b>/); // o maior em negrito, de qualquer lado
assert.match(rg, /style="--nos:70%"/); // finalizações: 14 de 20
assert.equal(reguaDoJogo(null, {}), "");
