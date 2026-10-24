// Confere a ligação da Central nova no jogo.html (não há como abrir a tela logada num teste): node ferramentas/teste_central_nova.mjs
// ponytail: confere o texto do jogo.html, não o comportamento; trocar por um teste com DOM se a Central ganhar um módulo próprio
import assert from "node:assert/strict";
import fs from "node:fs";
const html = fs.readFileSync(new URL("../jogo.html", import.meta.url), "utf8"), css = fs.readFileSync(new URL("../trem.css", import.meta.url), "utf8");
// os botões do Vestiário e do próximo jogo chegam depois da primeira montagem: o clique tem de ser delegado no contêiner
assert.match(html, /\$\("cnVestiario"\)\.onclick = \$\("cnProximo"\)\.onclick = /);
// o passo do amistoso abre o <details> recolhido antes de rolar até ele
assert.match(html, /const d = \$\("amJogar"\)\.closest\("details"\); if \(d\) d\.open = true; \$\("amJogar"\)\.scrollIntoView/);
// o relatório do último jogo é lido uma vez por carga, não a cada redesenho
assert.match(html, /daLiga\("relatorio:" \+ ultimo\.id, \(\) => relatorioDaPartida\(ultimo\.id\)\)/);
// sem calendário: o aviso de hoje, não "não há mais jogos"
assert.match(html, /partidas\.length \? "Não há mais jogos nesta temporada\." : "O calendário ainda não foi gerado\."/);
// no PC a linha fica presa no topo, como as abas de hoje (as barras presas descontam a altura dela)
assert.match(css, /\.t-linha \{[^}]*position:sticky; top:0/);
// no celular a linha é fixa embaixo: precisa soltar o top:0 do PC, senão estica pela tela inteira e cobre a página
assert.match(css, /\.t-linha \{ position:fixed; top:auto;/);
