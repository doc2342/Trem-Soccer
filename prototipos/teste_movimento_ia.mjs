// Inteligência individual e organização tática (prototipos/movimento.js): cenários em cenas montadas e os critérios do Superprompt 03 em dois jogos inteiros da T1.
// node prototipos/teste_movimento_ia.mjs
import assert from "node:assert";
import { MOV, criarCena, novoJogador, papeisDePressao } from "./movimento.js";
import { jogar, medir } from "./sim_movimento.mjs";

// 4-4-2 × 4-4-2 no lugar: o time 0 ataca para a direita. d: deslocamento de todo o time 1 para a frente (metros)
const VAGAS = [["GK", 4, 34], ["DL", 32, 8], ["DC", 28, 26], ["DC", 28, 42], ["DR", 32, 60], ["ML", 50, 10], ["DMC", 44, 28], ["MC", 50, 40], ["MR", 50, 58], ["FC", 66, 28], ["SC", 68, 40]];
const montar = () => { const js = [], m = (x, y) => [105 - x, 68 - y]; VAGAS.forEach(([p, x, y], k) => js.push(novoJogador("a" + k, k, 0, p, x, y))); VAGAS.forEach(([p, x, y], k) => { const [a, b] = m(x, y); js.push(novoJogador("b" + k, 11 + k, 1, p, a, b)); }); return js; };
const cena = (dono, mudar = () => {}, posse = 0) => { const js = montar(); mudar(js); const q = js.find(j => j.id === dono), bola = { x: q.x, y: q.y, vx: 0, vy: 0, dono: q, alvo: null }, c = criarCena(js, bola); c.posse = posse; c.jogoParado = false; c.ligar = n => { for (let i = 0; i < n; i++) c.passoDeTempo(c.i = (c.i ?? -1) + 1); }; return { js, bola, c, por: id => js.find(j => j.id === id) }; };
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

// CENÁRIO A: portador no meio-campo. Um só pressiona, chega perto e freia; outro cobre; ninguém mais persegue a bola
{ const { js, c, por } = cena("a7", js => { const j = js.find(x => x.id === "a7"); j.x = 56; j.y = 34; }); c.ligar(40);
  const defs = js.filter(j => j.time === 1), press = defs.filter(j => j.estado === "pressionar"), p = por("a7");
  assert.equal(press.length, 1, "um só pressiona");
  assert.ok(dist(press[0], p) < 5, `chega no portador: ${dist(press[0], p).toFixed(1)} m`);
  assert.ok(Math.hypot(press[0].vx, press[0].vy) < press[0].lim.vmax * 0.7, "freia ao chegar");
  assert.ok(defs.filter(j => j.estado === "cobertura").length === 1, "um cobre");
  assert.ok(defs.filter(j => dist(j, p) < 6).length <= 2, "não vão todos na bola"); }

// CENÁRIO A2: o mais perto nem sempre: o zagueiro sem cobertura perde para o volante um pouco mais longe
{ const js = montar(), p = { x: 45, y: 34, vx: 0, vy: 0 }, b = js.filter(j => j.time === 1), z = b.find(j => j.pos === "DC"), v = b.find(j => j.pos === "DMC");
  z.x = 50; z.y = 34; z.ancora = [76, 34]; v.x = 53; v.y = 30; v.ancora = [58, 34];
  assert.strictEqual(papeisDePressao(b, p).primeiro, v, "o volante sai, o zagueiro segura a posição"); }

// CENÁRIO B: ponta com a bola na lateral. O lateral dele reage, outro cobre, os outros fecham o centro
{ const { js, c, por } = cena("a8", js => { const j = js.find(x => x.id === "a8"); j.x = 72; j.y = 62; }); c.ligar(45);
  const lat = por("b1"), p = por("a8"), defs = js.filter(j => j.time === 1 && j.pos !== "GK");
  assert.ok(lat.estado === "pressionar" || lat.estado === "cobertura", `o lateral do lado reage: ${lat.estado}`);
  assert.ok(defs.some(j => j !== lat && (j.estado === "cobertura" || j.estado === "pressionar")), "um segundo ajuda");
  const longe = defs.filter(j => !["pressionar", "cobertura"].includes(j.estado)), ym = longe.reduce((s, j) => s + j.y, 0) / longe.length;
  assert.ok(ym < 52, `os outros protegem por dentro: y médio ${ym.toFixed(0)}`); }

// CENÁRIO C: corrida às costas. Quem está perto acompanha
{ const { js, c, por } = cena("a7", js => { const a = js.find(x => x.id === "a9"); a.x = 76; a.y = 28; a.vx = 7; a.ax = 98; a.ay = 28; a.ate = 99; a.estado = "profundidade"; a.ritmo = 1; }); c.ligar(25);
  const a = por("a9"), perto = js.filter(j => j.time === 1 && j.pos !== "GK" && dist(j, a) < 16);
  assert.ok(js.some(j => j.time === 1 && j.estado === "acompanharCorrida") || perto.some(j => j.estado === "marcar"), "alguém acompanha");
  assert.ok(perto.length >= 1 && Math.max(...perto.map(j => j.vx)) > 2, "corre junto para o próprio gol"); }

// CENÁRIO D: perda da bola. Quem está perto reage antes; a linha de trás se recompõe
{ const { js, bola, c, por } = cena("a7"); c.ligar(30);
  const novo = por("b6"); bola.dono = novo; c.posse = 1; c.transicao = true; c.papeis = [{}, {}]; c.proxPapel = 0; c.marcados.clear(); c.ligar(12);
  const a = js.filter(j => j.time === 0 && j.pos !== "GK");
  assert.ok(a.some(j => j.estado === "pressionar"), "o mais perto pressiona logo");
  assert.ok(new Set(a.map(j => j.estado)).size >= 3, "cada um faz uma coisa"); }

// CENÁRIO E: contra-ataque. Quem é de frente vai à profundidade em ritmo máximo, e alguém apoia
{ const { js, c, por } = cena("a6", js => { const j = js.find(x => x.id === "a6"); j.x = 48; }); c.transicao = true; c.ligar(30);
  const fr = js.filter(j => j.time === 0 && ["FC", "SC", "ML", "MR"].includes(j.pos));
  assert.ok(fr.some(j => j.estado === "profundidade"), `profundidade: ${fr.map(j => j.estado).join()}`);
  assert.ok(js.filter(j => j.time === 0 && j !== por("a6")).some(j => ["linhaDePasse", "aproximarBola", "aproximarPortador", "ocuparEspaco"].includes(j.estado)), "apoio"); }

// CENÁRIO F: inversão. A bola muda de lado; cada um se ajusta numa velocidade, sem salto e sem o bloco andar igual
{ const { js, bola, c, por } = cena("a8"); c.ligar(30); const antes = js.map(j => [j.x, j.y]), passo = [];
  bola.dono = por("a5"); c.proxPapel = 0; const sn = []; for (let i = 0; i < 25; i++) { const f = js.map(j => [j.x, j.y]); c.ligar(1); js.forEach((j, k) => assert.ok(Math.hypot(j.x - f[k][0], j.y - f[k][1]) <= MOV.velocidade.teto * MOV.dt + 1e-6, "sem salto")); }
  const novo = por("a5"), l = js.filter(j => j.time === 1 && j.pos !== "GK").map(j => ({ d: dist(j, novo), m: Math.hypot(j.x - antes[j.k][0], j.y - antes[j.k][1]) })).sort((a, b) => a.d - b.d);
  const med = q => q.reduce((a, b) => a + b.m, 0) / q.length, perto = med(l.slice(0, 3)), longe = med(l.slice(3));
  assert.ok(perto > longe * 1.3, `quem está perto reage primeiro, e o bloco não anda igual: ${perto.toFixed(1)} x ${longe.toFixed(1)} m`); }

// Sem tremer: parado em volta da bola parada, ninguém fica trocando de direção a cada olhada
{ const { js, c } = cena("a7"); c.ligar(50); let trocas = 0; const ult = js.map(() => 0); for (let i = 0; i < 300; i++) { c.ligar(1); js.forEach((j, k) => { const s = Math.sign(Math.round(j.vx)); if (s && ult[k] && s !== ult[k]) trocas++; if (s) ult[k] = s; }); }
  assert.ok(trocas / js.length < 6, `direção estável: ${(trocas / js.length).toFixed(1)} trocas por jogador em 30 s`); }

// TESTE C: zagueiro com a bola. Volante perto para apoiar, lateral dá opção, quem é de frente segura a altura, e a pressão vem organizada
{ const { js, c, por } = cena("a2", js => { const j = js.find(x => x.id === "a2"); j.x = 20; j.y = 30; }); c.ligar(40);
  const fr = js.filter(j => j.time === 0 && ["FC", "SC"].includes(j.pos));
  assert.ok(fr.every(j => j.x > 55), "os atacantes não vêm todos buscar");
  assert.ok(js.filter(j => j.time === 1 && j.estado === "pressionar").length <= 1, "um pressiona por vez");
  assert.ok(js.filter(j => j.time === 1 && j.pos !== "GK" && dist(j, por("a2")) < 15).length <= 3, "sem enxame"); }

// Sobre a formação: a bola longe de todo mundo. Ninguém sai para pressionar, e o bloco fica
{ const { js, c } = cena("a1", js => { const j = js.find(x => x.id === "a1"); j.x = 6; j.y = 8; for (const q of js) if (q.time === 1) { q.x = Math.max(q.x, 62); q.ax = q.x; q.ancora = [q.x, q.y]; } }); c.ligar(40);
  assert.equal(js.filter(j => j.time === 1 && j.estado === "pressionar").length, 0, "o bloco fica");
  assert.ok(js.filter(j => j.time === 1 && j.pos !== "GK").every(j => Math.hypot(j.x - j.ancora[0], j.y - j.ancora[1]) < 12), "ninguém persegue a bola"); }

// Os critérios do Superprompt 03 e a checklist, em dois jogos inteiros da T1 com formações diferentes
const provas = [jogar(0), jogar(1, "4-3-3 com pontas", "3-5-2 com alas")];
for (const tr of provas) {
  const m = medir(tr), ok = (nome, v, teste) => { console.log(`${teste ? "ok  " : "FORA"} ${nome}: ${v}`); assert.ok(teste, nome); }, E = m.estados, soma = l => l.reduce((s, k) => s + (E[k] || 0), 0);
  ok("1. sem acúmulo no centro", `${m.centroPorTime.toFixed(1)} de 10 no corredor central; ${m.pertoDaBolaPorTime.toFixed(1)} a 15 m da bola`, m.centroPorTime < 3.8 && m.pertoDaBolaPorTime < 2.5);
  ok("2. formação reconhecível", `${m.foraDaFormacao.toFixed(1)} m do lugar no desenho do time`, m.foraDaFormacao < 8);
  ok("3. pressão sem abandonar a zona", `${E.pressionar || 0} amostras; comprimento do time ${m.comprimento.toFixed(0)} m`, (E.pressionar || 0) > 2000 && m.comprimento < 55);
  ok("4. distâncias razoáveis", `colega mais perto a ${m.vizinhoMetros.toFixed(1)} m`, m.vizinhoMetros > 9);
  ok("5. atacantes com movimento próprio", `${soma(["profundidade", "desmarque", "diagonal"])} amostras`, soma(["profundidade", "desmarque", "diagonal"]) > 500);
  ok("6. sem sobreposição", `${m.coladosMenos1m.toFixed(3)}% dos pares a menos de 1 m, ${m.coladosMenos2m.toFixed(3)}% a menos de 2 m`, m.coladosMenos1m < 0.1 && m.coladosMenos2m < 0.3);
  ok("7. corredores usados", `E/e/C/d/D ${m.corredores.join(" / ")}%`, m.corredores[0] > 10 && m.corredores[4] > 10);
  ok("8. direção suave", `${m.viradasPorMin.toFixed(1)} viradas bruscas por jogador e minuto`, m.viradasPorMin < 5);
  ok("9. destino estável", `${m.trocasAlvoPorMin.toFixed(1)} trocas de alvo por jogador e minuto`, m.trocasAlvoPorMin < 16);
  ok("10. coerente com a fase", `${soma(["linhaDePasse", "aproximarPortador", "aproximarBola"])} apoios, ${soma(["cobertura", "cobrirEspaco"])} coberturas, ${E.diagonal || 0} diagonais`, soma(["linhaDePasse", "aproximarPortador", "aproximarBola"]) > 500 && (E.diagonal || 0) > 30);
  ok("movimento pelo motivo certo", `${m.velocidade.toFixed(2)} m/s, ${m.parado.toFixed(0)}% parado; volante ${(m.velocidadePorPos.DMC ?? m.velocidadePorPos.MC).toFixed(2)} m/s`, m.velocidade > 1.2 && m.velocidade < 2.6 && m.parado > 15);
}
console.log("teste_movimento_ia: ok");
