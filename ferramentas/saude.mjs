// Raio-x da temporada encerrada (leitura pública). Uso: node saude.mjs <pasta do projeto>
import { pathToFileURL } from "node:url";
import { writeFileSync } from "node:fs";
const raiz = process.argv[2];
const { notaBruta, notaDeTeto, POSICOES } = await import(pathToFileURL(raiz + "/src/modelo.js"));
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
const [liga] = await tudo("ligas?select=temporada,fundo_taca,copa");
const T = liga.temporada;
const clubes = await tudo("clubes?select=id,nome,grupo,divisao,dono,ultimo_acesso,estadio_nivel,torcida,humor,ct_nivel,medico_nivel,fisio_nivel,base_nivel&order=id");
const jog = await tudo("jogadores?select=id,clube_id,nome,idade,pos,fam,at,salario,salario_mercado,contrato_ate,inicio_temporada,juvenil,formador,aprende,aposenta_em,forma,moral,chegou_temporada&order=id");
const partidas = await tudo("partidas?select=id,grupo,rodada,casa,fora,fase,copa_fase,vencedor,publico&order=id");
const res = await tudo("resultados?select=partida_id,gols_casa,gols_fora,xg_casa,xg_fora&order=partida_id");
const hist = await tudo("historico?select=temporada,clube_id,divisao,grupo,posicao,pontos,destino,copa&order=temporada");
const transf = await tudo("transferencias?select=temporada,janela,tipo,jogador,pos,de_clube,para_clube,valor&order=id");
const safras = await tudo("safras?select=temporada,clube_id,jogador,pos,nivel&order=temporada");
writeFileSync(process.argv[3] || "dados.json", JSON.stringify({ liga, clubes, jog, partidas, res, hist, transf, safras }));

// clube de outro país: a "divisão" dele, aqui, é o grupo (ARG, URU…), para não misturar com a Série A
for (const c of clubes) if (!"ABCDE".includes(c.grupo)) c.divisao = c.grupo;
const SERIES = [1, 2, 3, ...new Set(clubes.map(c => c.divisao).filter(d => typeof d === "string"))];
const C = Object.fromEntries(clubes.map(c => [c.id, c]));
const med = v => { const s = [...v].sort((a, b) => a - b); return s.length ? (s[(s.length - 1) >> 1] + s[s.length >> 1]) / 2 : NaN; };
const media = v => v.reduce((s, x) => s + x, 0) / (v.length || 1);
const f1 = x => (Math.round(x * 10) / 10).toFixed(1);
for (const j of jog) { j.nota = notaBruta(j.at, j.pos); j.teto = notaDeTeto(j); }
const porClube = {};
for (const j of jog) if (j.clube_id && !j.juvenil) (porClube[j.clube_id] ||= []).push(j);
// melhor onze: melhor goleiro + 10 melhores de linha, pela nota na posição principal
const onze = l => { const s = [...l].sort((a, b) => b.nota - a.nota), g = s.find(j => j.pos === "GK"); return [g, ...s.filter(j => j.pos !== "GK").slice(0, 10)].filter(Boolean); };
for (const c of clubes) { const l = porClube[c.id] || []; c.onze = onze(l); c.n11 = media(c.onze.map(j => j.nota)); c.folha = l.reduce((s, j) => s + (j.salario || 0), 0); c.n = l.length; }

console.log(`\n== T${T} · fundo ${liga.fundo_taca} mil · fator da copa ${liga.copa?.fator} · ${jog.length} jogadores (${jog.filter(j => j.juvenil).length} juvenis, ${jog.filter(j => !j.clube_id).length} sem clube)`);
console.log("\n== FORÇA POR DIVISÃO (melhor onze)  mediana | min–max | folha mediana | topo do elenco");
for (const d of SERIES) {
  const cs = clubes.filter(c => c.divisao === d), bots = cs.filter(c => !c.dono);
  console.log(`div ${d}: ${f1(med(cs.map(c => c.n11)))} | ${f1(Math.min(...cs.map(c => c.n11)))}–${f1(Math.max(...cs.map(c => c.n11)))} | só bots ${f1(med(bots.map(c => c.n11)))} (máx ${f1(Math.max(...bots.map(c => c.n11)))}) | folha ${Math.round(med(cs.map(c => c.folha)))} | CT/base bots ${f1(media(bots.map(c => c.ct_nivel)))}/${f1(media(bots.map(c => c.base_nivel)))}`);
}
console.log("\n== CLUBES COM DIRIGENTE");
for (const c of clubes.filter(c => c.dono)) {
  console.log(`${c.nome} (div ${c.divisao}, grupo ${c.grupo}) onze ${f1(c.n11)} folha ${c.folha} elenco ${c.n} estádio ${c.estadio_nivel} CT ${c.ct_nivel} med ${c.medico_nivel} fisio ${c.fisio_nivel} base ${c.base_nivel} torcida ${c.torcida} acesso ${c.ultimo_acesso?.slice(0, 10)}`);
  console.log("   onze: " + c.onze.map(j => `${j.pos} ${f1(j.nota)} (${j.idade}a${j.formador === c.id ? " base" : j.chegou_temporada != null ? " T" + j.chegou_temporada : ""})`).join(", "));
  const l = porClube[c.id] || [];
  console.log(`   nota ≥42: ${l.filter(j => j.nota >= 42).length} · ≥40: ${l.filter(j => j.nota >= 40).length} · ≥38: ${l.filter(j => j.nota >= 38).length} · teto(nota de teto) ≥42,5: ${l.filter(j => j.teto >= 42.5).length}`);
}
console.log("\n== DISTRIBUIÇÃO DA NOTA (profissionais com clube)");
const faixas = [[42.5, 99], [41.5, 42.5], [40, 41.5], [38, 40], [36, 38], [34, 36], [0, 34]];
for (const [a, b] of faixas) {
  const l = jog.filter(j => j.clube_id && !j.juvenil && j.nota >= a && j.nota < b);
  const h = l.filter(j => C[j.clube_id].dono).length;
  console.log(`${a}–${b}: ${l.length} (dirigentes ${h}; bots A ${l.filter(j => !C[j.clube_id].dono && C[j.clube_id].divisao === 1).length}, B ${l.filter(j => !C[j.clube_id].dono && C[j.clube_id].divisao === 2).length}, C ${l.filter(j => !C[j.clube_id].dono && C[j.clube_id].divisao === 3).length}) idade média ${f1(media(l.map(j => j.idade)))}`);
}
console.log("top 15 onzes: " + [...clubes].sort((a, b) => b.n11 - a.n11).slice(0, 15).map(c => `${c.nome.slice(0, 14)}${c.dono ? "*" : ""} ${c.divisao}/${f1(c.n11)}`).join(" · "));

console.log("\n== IDADES");
for (const [a, b] of [[0, 21], [22, 25], [26, 29], [30, 32], [33, 35], [36, 99]]) { const l = jog.filter(j => j.clube_id && j.idade >= a && j.idade <= b); console.log(`${a}–${b}: ${l.length} nota ${f1(media(l.map(j => j.nota)))}`); }
console.log(`aposentam nesta virada: ${jog.filter(j => j.aposenta_em === T).length} · contratos que vencem (contrato_ate ≤ T): ${jog.filter(j => j.clube_id && !j.juvenil && j.contrato_ate <= T).length} · aprendendo posição: ${jog.filter(j => j.aprende?.pos).length}`);
console.log("\n== TREINO NA TEMPORADA (nota agora − nota no início), por idade");
for (const [a, b] of [[16, 19], [20, 23], [24, 27], [28, 30], [31, 99]]) { const l = jog.filter(j => j.idade >= a && j.idade <= b && j.inicio_temporada?.t === T && j.inicio_temporada.nota); console.log(`${a}–${b}: ${l.length} jog. ${(media(l.map(j => j.nota - j.inicio_temporada.nota))).toFixed(2)}`); }

console.log("\n== JOGOS");
const R = Object.fromEntries(res.map(r => [r.partida_id, r]));
const liga_ = partidas.filter(p => !p.fase || p.fase === "liga");
console.log("fases:", JSON.stringify(partidas.reduce((o, p) => (o[p.fase || "liga"] = (o[p.fase || "liga"] || 0) + 1, o), {})), "resultados", res.length);
for (const d of SERIES) {
  const ps = liga_.filter(p => C[p.casa]?.divisao === d && R[p.id]);
  const g = ps.map(p => R[p.id]);
  console.log(`div ${d}: ${ps.length} jogos · ${(media(g.map(r => r.gols_casa + r.gols_fora))).toFixed(2)} gols (xG ${(media(g.map(r => r.xg_casa + r.xg_fora))).toFixed(2)}) · casa ${Math.round(100 * g.filter(r => r.gols_casa > r.gols_fora).length / g.length)}% empate ${Math.round(100 * g.filter(r => r.gols_casa === r.gols_fora).length / g.length)}% fora ${Math.round(100 * g.filter(r => r.gols_casa < r.gols_fora).length / g.length)}%`);
}
// classificação por grupo + correlação onze × pontos
const tab = {};
for (const p of liga_) { const r = R[p.id]; if (!r) continue; for (const [id, gp, gc] of [[p.casa, r.gols_casa, r.gols_fora], [p.fora, r.gols_fora, r.gols_casa]]) { const t = tab[id] ||= { id, pts: 0, gp: 0, gc: 0, j: 0 }; t.j++; t.gp += gp; t.gc += gc; t.pts += gp > gc ? 3 : gp === gc ? 1 : 0; } }
const xs = clubes.filter(c => tab[c.id]);
const corr = (a, b) => { const ma = media(a), mb = media(b); return a.reduce((s, x, i) => s + (x - ma) * (b[i] - mb), 0) / Math.sqrt(a.reduce((s, x) => s + (x - ma) ** 2, 0) * b.reduce((s, x) => s + (x - mb) ** 2, 0)); };
for (const g of "ABCDE") {
  const l = xs.filter(c => c.grupo === g).sort((a, b) => tab[b.id].pts - tab[a.id].pts || (tab[b.id].gp - tab[b.id].gc) - (tab[a.id].gp - tab[a.id].gc));
  console.log(`grupo ${g} (corr onze×pts ${corr(l.map(c => c.n11), l.map(c => tab[c.id].pts)).toFixed(2)}): ` + l.map(c => `${c.nome.slice(0, 12)}${c.dono ? "*" : ""} ${tab[c.id].pts}(${f1(c.n11)})`).join(" · "));
}
console.log("playoffs/copa:", partidas.filter(p => p.fase && p.fase !== "liga" && (p.fase !== "copa" || ["final", "semi"].includes(p.copa_fase))).map(p => `${p.fase}${p.copa_fase ? "/" + p.copa_fase : ""} ${C[p.casa]?.nome} ${R[p.id]?.gols_casa}x${R[p.id]?.gols_fora} ${C[p.fora]?.nome}${p.vencedor ? " → " + C[p.vencedor]?.nome : ""}`).join(" | "));

console.log("\n== HISTÓRICO: campeões da Série A e da copa; por onde andaram os dirigentes");
for (let t = 0; t < T; t++) { const h = hist.filter(x => x.temporada === t); const camp = h.find(x => x.grupo === "A" && x.posicao === 1); const copa = h.find(x => x.copa === "campeão" || x.copa === "campeao"); console.log(`T${t}: A ${C[camp?.clube_id]?.nome} · copa ${C[copa?.clube_id]?.nome || "-"} · ` + clubes.filter(c => c.dono).map(c => { const x = h.find(y => y.clube_id === c.id); return x ? `${c.nome.slice(0, 6)} ${x.grupo}${x.posicao}` : ""; }).join(" ")); }
console.log(`clubes que já jogaram a Série A: ${new Set(hist.filter(x => x.grupo === "A").map(x => x.clube_id)).size}`);
console.log("valores de copa no histórico:", JSON.stringify([...new Set(hist.map(x => x.copa))]));

console.log("\n== MERCADO por temporada (tipo: negócios / mil)");
for (let t = Math.max(1, T - 3); t <= T; t++) { const l = transf.filter(x => x.temporada === t), o = {}; for (const x of l) { const k = x.tipo + (C[x.de_clube]?.dono ? ":deDir" : "") + (C[x.para_clube]?.dono ? ":paraDir" : ""); (o[k] ||= [0, 0])[0]++; o[k][1] += x.valor || 0; } console.log(`T${t}: ` + Object.entries(o).map(([k, v]) => `${k} ${v[0]}/${v[1]}`).join(" · ")); }
console.log("\n== SAFRAS públicas:", safras.map(s => `T${s.temporada} ${C[s.clube_id]?.nome?.slice(0, 8)} ${s.pos} ${s.nivel}`).join(" · "));
console.log("\n== FORMA/MORAL: forma mediana", med(jog.filter(j => j.clube_id).map(j => j.forma ?? 50)), "moral mediana", med(jog.filter(j => j.clube_id).map(j => j.moral ?? 50)));
