// Papéis na tática (etapa 2, laterais): a tática salva leva o papel de cada vaga, o inválido cai; a temporada 0 joga sem papéis;
// o bot escolhe papéis pelos atributos, sem dois Apoiadores com menos de dois volantes.
// Uso: node ferramentas/teste_papeis_tatica.mjs
import assert from "node:assert";
import { readFileSync } from "node:fs";
import { criarRng } from "../src/rng.js";
import { gerarElenco } from "../src/gerador.js";
import { IDX } from "../src/modelo.js";
import { taticaDoDirigente, calcularPartida } from "../src/rodada.js";
import { taticaBot, papeisDoBot } from "../src/bot.js";
import { FORMACOES, escalar } from "../src/escalacao.js";
import { PAPEIS_DESDE } from "../src/papeis.js";
import { papeisVisiveis } from "../src/amistoso.js";

const nomes = JSON.parse(readFileSync(new URL("../dados/nomes.json", import.meta.url)));
const e1 = gerarElenco(criarRng(9), { nivel: 30, nomes, prefixoId: "a" }), e2 = gerarElenco(criarRng(19), { nivel: 30, nomes, prefixoId: "b" });
const vagas = FORMACOES["4-2-3-1"], onze = escalar(e1, vagas);
const dados = papeis => ({ vagas: onze.map(x => x.pos), jog: onze.map(x => x.j.id), ...(papeis ? { papeis } : {}) });
const iDR = onze.findIndex(x => x.pos === "DR"), iMC = onze.findIndex(x => x.pos === "DMC");
const com = (i, p) => { const l = Array(11).fill(null); l[i] = p; return l; };

// tática antiga, sem papéis: tudo nulo
assert.ok(taticaDoDirigente(dados(), e1).escalacao.every(x => x.papel === null));
assert.strictEqual(taticaDoDirigente(dados(com(iDR, "invertido")), e1).escalacao[iDR].papel, "invertido");
assert.strictEqual(taticaDoDirigente(dados(com(iMC, "fixo")), e1).escalacao[iMC].papel, null, "papel de lateral no volante cai");
assert.strictEqual(taticaDoDirigente(dados(com(iDR, "xyz")), e1).escalacao[iDR].papel, null, "papel adulterado cai");
assert.strictEqual(taticaDoDirigente({ ...dados(), papeis: "lixo" }, e1).escalacao[iDR].papel, null, "papeis que não é lista");

// temporada 0: o papel salvo não entra no jogo
const lado = (id, elenco, tatica = null) => ({ clube: { id, nome: "Time " + id, dono: "x", ultimo_acesso: "2026-11-01T10:00:00Z" }, elenco, tatica });
const jogar = (temporada, tatica) => calcularPartida({ partida: { id: 1, inicio: "2026-11-01T11:00:00Z", fase: "liga" }, casa: lado(1, e1, tatica), fora: lado(2, e2), semente: 4242, temporada });
const texto = r => r.lances.map(l => l.dados.texto).join("\n");
const apoiadores = dados(onze.map(x => x.pos === "DR" || x.pos === "DL" ? "apoiador" : null));
assert.strictEqual(texto(jogar(0, apoiadores)), texto(jogar(0, dados())), "temporada 0: sem papéis");
assert.strictEqual(texto(jogar(undefined, apoiadores)), texto(jogar(0, dados())), "sem temporada: sem papéis");
assert.notStrictEqual(texto(jogar(1, apoiadores)), texto(jogar(1, dados())), "temporada 1: o papel muda o jogo");
assert.ok(jogar(1, apoiadores).lances[0].dados.escalacoes[0].titulares.some(t => t.papel === "apoiador"), "a abertura grava o papel");
assert.ok(jogar(0, apoiadores).lances[0].dados.escalacoes[0].titulares.every(t => !t.papel), "na temporada 0, não");
// o papel jogado de cada titular em posição com papéis (o padrão também), para a troca custar entrosamento (supabase/164); na T0, nada
const pj = jogar(1, apoiadores).papeis, idDR = onze[iDR].j.id;
assert.ok(pj.some(x => x.id === idDR && x.papel === "apoiador"));
assert.ok(jogar(1, dados()).papeis.some(x => x.id === idDR && x.papel === "padrao"), "o padrão também é gravado");
assert.ok(!pj.some(x => x.id === onze[iMC].j.id), "posição sem papéis não grava");
assert.deepStrictEqual(jogar(0, apoiadores).papeis, []);

// bot: lateral que passa e cria muito e marca pouco vira Construtor ou Invertido
const armador = e1.map(j => j.id === onze[iDR].j.id ? { ...j, at: j.at.map((v, k) => [IDX.pas, IDX.cri, IDX.dom].includes(k) ? 45 : [IDX.des, IDX.mar, IDX.cru].includes(k) ? 10 : v) } : j);
const dr = papeisDoBot(onze.map(x => x.pos === "DR" ? { ...x, j: armador.find(j => j.id === x.j.id) } : x)).find(x => x.pos === "DR");
assert.ok(["construtor", "invertido"].includes(dr.papel), `bot escolheu ${dr.papel}`);
assert.ok(taticaBot(e1).escalacao.every(x => "papel" in x), "a tática do bot traz o papel de cada vaga");
// nunca dois Apoiadores com menos de dois volantes
const rapidos = e1.map(j => ({ ...j, at: j.at.map((v, k) => [IDX.vel, IDX.cru, IDX.dri, IDX.res].includes(k) ? 45 : v) }));
for (const f of ["4-4-2", "4-3-3 com pontas", "4-1-4-1"]) {
  const esc = papeisDoBot(escalar(rapidos, FORMACOES[f]));
  const ap = esc.filter(x => x.papel === "apoiador" && ["DR", "DL"].includes(x.pos)).length, dmc = esc.filter(x => x.pos === "DMC").length;
  assert.ok(ap < 2 || dmc >= 2, `${f}: ${ap} Apoiadores com ${dmc} volantes`);
}
// bot com papel padrão: nulo (não grava o óbvio)
assert.ok(papeisDoBot(escalar(e1, FORMACOES["4-4-2"])).every(x => x.papel === null || !["fixo"].includes(x.papel)));
// na tática da liga o papel só aparece a partir de PAPEIS_DESDE; na de amistoso, sempre
assert.strictEqual(papeisVisiveis({ amistoso: false, temporada: 0 }), false);
assert.strictEqual(papeisVisiveis({ amistoso: true, temporada: 0 }), true);
assert.strictEqual(papeisVisiveis({ amistoso: false, temporada: PAPEIS_DESDE }), true);
assert.strictEqual(papeisVisiveis({ amistoso: false, temporada: null }), true);
console.log("teste_papeis_tatica: ok");
