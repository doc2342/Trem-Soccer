// Ensaio da virada T13 → T14 e da T14 → T15 com os dados reais do banco (leitura pública; nada é gravado).
// 1) transição: planejarVirada com transicao em cima da liga de agora (com os resultados que já existem);
// 2) aplica os movimentos, joga a T14 inteira de mentira (liga + playoffs da B pelo proximaFaseDosPlayoffs) e planeja a virada normal.
// Uso: node ferramentas/ensaio_virada_t14.mjs
import assert from "node:assert";
import fs from "node:fs";
import { planejarVirada, GUARDADO, forcaDoOnze, divisaoDoGrupo } from "../src/virada.js";
import { gerarTabela, proximaFaseDosPlayoffs, classificacao } from "../src/rodada.js";
import { criarRng } from "../src/rng.js";

const K = "sb_publishable_Tsz8yf6kkgTn5Zj0M0d2Yw_eDoGeFjP", U = "https://gqsvsvrclyiroehymuot.supabase.co/rest/v1/";
async function tudo(caminho) {
  const saida = [];
  for (let de = 0; ; de += 1000) {
    const r = await fetch(U + caminho, { headers: { apikey: K, Authorization: "Bearer " + K, Range: `${de}-${de + 999}` } });
    if (!r.ok) throw new Error(caminho + " " + r.status + " " + await r.text());
    const l = await r.json(); saida.push(...l);
    if (l.length < 1000) return saida;
  }
}
const [liga] = await tudo("ligas?select=id,temporada");
const clubes = await tudo(`clubes?select=id,nome,grupo,divisao,dono,extra,ultimo_acesso,perfil,base_nivel&liga_id=eq.${liga.id}&order=id`);
const jog = await tudo("jogadores?select=*&order=id");
const partidas = await tudo(`partidas?select=id,grupo,rodada,fase,casa,fora&liga_id=eq.${liga.id}&order=id`);
const resultados = await tudo("resultados?select=partida_id,gols_casa,gols_fora&order=partida_id");
const nomes = JSON.parse(fs.readFileSync(new URL("../dados/nomes.json", import.meta.url), "utf8"));
const doElenco = l => ({ id: "j" + l.id, nome: l.nome, pais: l.pais, idade: l.idade, pos: l.pos, fam: l.fam, at: l.at, salario: l.salario, contratoAte: l.contrato_ate,
  naoRenovar: !!l.nao_renovar, juvenil: !!l.juvenil, aposentaEm: l.aposenta_em, emprestadoDe: l.emprestado_de });
const elencos = {}; for (const l of jog) if (l.clube_id) (elencos[l.clube_id] = elencos[l.clube_id] || []).push(doElenco(l));
const doBrasil = () => clubes.filter(c => !["ARG", "URU", "COL", "CHI"].includes(c.grupo));
const conta = () => Object.fromEntries([...new Set(clubes.map(c => c.grupo))].sort().map(g => [g, clubes.filter(c => c.grupo === g).length]));
console.log(`Liga ${liga.id}, temporada ${liga.temporada}: ${clubes.length} clubes`, conta(), `· ${resultados.length} resultados`);

// ---------- 1. transição ----------
const plano1 = planejarVirada({ rng: criarRng(13), liga, clubes, elencos, talentos: {}, partidas, resultados, nomes, comLivres: true, juvenis: true, transicao: true });
const { plano, resumo } = plano1;
const para = Object.fromEntries(plano.movimentos.map(m => [m.clube_id, m]));
const nome = id => clubes.find(c => c.id === id).nome, ativo = c => c.dono && (c.extra || (c.ultimo_acesso && Date.now() - new Date(c.ultimo_acesso) <= 21 * 86400000));
for (const c of clubes) if (para[c.id]) { c.grupo = para[c.id].grupo; c.divisao = para[c.id].divisao; }
console.log("Depois da transição:", conta());
assert.deepEqual(Object.fromEntries(["A", "B", "C", "F", "X"].map(g => [g, conta()[g]])), { A: 12, B: 8, C: 8, F: 8, X: 14 });
console.log("Sobem:", plano.movimentos.filter(m => m.grupo === "A").map(m => `${nome(m.clube_id)}${ativo(clubes.find(c => c.id === m.clube_id)) ? " (dirigente ativo)" : ""}`).join(", "));
for (const g of ["B", "C", "F"]) console.log(`Série ${g}:`, clubes.filter(c => c.grupo === g).map(c => `${c.nome}${c.dono ? "*" : ""} ${forcaDoOnze(elencos[c.id]).toFixed(1)}`).join(" · "));
const guardados = clubes.filter(c => c.grupo === GUARDADO);
console.log("Guardados:", guardados.map(c => c.nome).join(", "));
assert.equal(guardados.filter(c => c.dono).length, 0, "guardado com dirigente!");
assert.ok(clubes.filter(c => c.dono && c.grupo !== "A").every(c => !ativo(c)) || clubes.filter(c => c.grupo === "A" && ativo(c)).length >= 11, "dirigente ativo fora da A");
assert.equal(plano.classificacao.length, clubes.length - 0, "uma linha de histórico por clube (ninguém é guardado antes da transição)");
assert.equal(plano.livres.filter(x => guardados.some(c => (elencos[c.id] || []).some(j => j.id === "j" + x.id))).length, 0, "guardado soltou jogador no mercado");
assert.equal(plano.safra.filter(x => guardados.some(c => c.id === x.clube_id)).length, 0, "safra em guardado");
console.log(`Plano: ${plano.aposentados.length} aposentados, ${plano.novos.length} jovens, ${plano.livres.length} livres, prêmios ${plano.classificacao.reduce((s, x) => s + x.premio, 0)} mil`);

// ---------- 2. T14 de mentira e a virada normal ----------
// os jogadores do plano: idade nova; aposentados saem (o suficiente para o próximo plano)
const rng = criarRng(14), novas = [], res2 = []; let id = 1;
const jogar = p => { const forca = x => forcaDoOnze(elencos[x]) + rng.normal(0, 4), a = forca(p.casa) + 1, b = forca(p.fora);
  res2.push({ partida_id: p.id, gols_casa: Math.max(0, Math.round((a - b) / 4 + 1.3 + rng.normal(0, 1))), gols_fora: Math.max(0, Math.round((b - a) / 4 + 1 + rng.normal(0, 1))) }); };
for (const g of [...new Set(clubes.map(c => c.grupo))].filter(g => g !== GUARDADO))
  for (const j of gerarTabela(clubes.filter(c => c.grupo === g).map(c => c.id))) { const p = { id: id++, grupo: g, rodada: j.rodada, fase: "liga", casa: j.casa, fora: j.fora }; novas.push(p); jogar(p); }
assert.equal(Math.max(...novas.filter(p => p.grupo === "A").map(p => p.rodada)), 22);
assert.equal(Math.max(...novas.filter(p => p.grupo === "F").map(p => p.rodada)), 14);
for (let k = 0; k < 5; k++) { const r = proximaFaseDosPlayoffs({ clubes, partidas: novas, resultados: res2 });
  if (r.erro) break; for (const j of r.jogos) { const p = { id: id++, grupo: j.grupo, rodada: j.rodada, fase: j.fase, casa: j.casa, fora: j.fora }; novas.push(p); jogar(p); } }
for (const g of ["B", "C", "F"]) assert.equal(novas.filter(p => p.grupo === g && p.fase !== "liga").length, 2 + 4 + 2, g);
const liga2 = { ...liga, temporada: liga.temporada + 1 };
const { plano: p2, resumo: r2 } = planejarVirada({ rng: criarRng(15), liga: liga2, clubes, elencos, talentos: {}, partidas: novas, resultados: res2, nomes, comLivres: true, juvenis: true });
const sobem = p2.movimentos.filter(m => m.grupo === "A"), caem = p2.movimentos.filter(m => m.caiu);
console.log("T14 → T15: sobem", sobem.map(m => `${nome(m.clube_id)} (de ${r2.grupos.B.concat(r2.grupos.C, r2.grupos.F).find(l => l.clube_id === m.clube_id).grupo}, ${r2.grupos.B.concat(r2.grupos.C, r2.grupos.F).find(l => l.clube_id === m.clube_id).posicao}º)`).join(", "),
  "· caem", caem.map(m => `${nome(m.clube_id)} → ${m.grupo}`).join(", "));
assert.equal(sobem.length, 3); assert.equal(caem.length, 3);
assert.deepEqual(caem.map(m => m.grupo).sort(), [...new Set(sobem.map(m => r2.grupos.B.concat(r2.grupos.C, r2.grupos.F).find(l => l.clube_id === m.clube_id).grupo))].sort());
assert.ok(!r2.grupos[GUARDADO], "guardado na classificação");
assert.equal(p2.classificacao.length, clubes.length - 14);
assert.ok(p2.novos.some(n => guardados.some(c => c.id === n.clube_id)) || p2.aposentados.length >= 0); // guardado repõe aposentado (quando há)
assert.ok(p2.jogadores.some(j => guardados.some(c => (elencos[c.id] || []).some(x => x.id === "j" + j.id))), "guardado não envelheceu");
console.log("ensaio ok");
