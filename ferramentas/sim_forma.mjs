// Efeito da forma nos gols: os bots de um grupo jogam entre si com os elencos reais, a forma andando jogo a jogo, na regra antiga
// (nota comparada com 6) e na nova (comparada com a nota típica da posição). Uso: node ferramentas/sim_forma.mjs <pasta> <dados.json do saude.mjs> [grupo]
import { pathToFileURL } from "node:url"; import { readFileSync } from "node:fs";
const raiz = process.argv[2], imp = f => import(pathToFileURL(raiz + "/src/" + f));
const B = await imp("bot.js"), MO = await imp("motor.js"), N = await imp("rng.js"), S = await imp("saude.js"), R = await imp("relatorio.js"), M = await imp("modelo.js");
const d = JSON.parse(readFileSync(process.argv[3])), grupo = process.argv[4] || "A", TIPICA = { ...S.CONFIG_SAUDE.notaTipica };
const ataque = p => M.POSICOES[p].linha === "ataque", defesa = p => ["gol", "defesa", "ala"].includes(M.POSICOES[p].linha);
function temporadas(regra, voltas, semente) {
  for (const k in TIPICA) S.CONFIG_SAUDE.notaTipica[k] = regra === "nova" ? TIPICA[k] : 6;
  const clubes = d.clubes.filter(c => c.grupo === grupo && !c.dono).map(c => ({ nome: c.nome, elenco: d.jog.filter(j => j.clube_id === c.id && !j.juvenil).map(j => ({ id: "j" + j.id, nome: j.nome, pos: j.pos, idade: j.idade, at: j.at, fam: j.fam, forma: 50, moral: 50 })) }));
  const rng = N.criarRng(semente), saida = [];
  for (let v = 0; v < voltas; v++) { let g = 0, n = 0;
    for (const a of clubes) for (const b of clubes) if (a !== b) {
      const pa = B.taticaBot(a.elenco).forca, pb = B.taticaBot(b.elenco).forca, ta = B.taticaBot(a.elenco, { mandante: true, forcaAdversario: pb }), tb = B.taticaBot(b.elenco, { forcaAdversario: pa });
      const p = MO.simularPartida(rng, MO.prepararTime({ nome: a.nome, escalacao: ta.escalacao, banco: ta.banco, instrucoes: ta.instrucoes, mandante: true }), MO.prepararTime({ nome: b.nome, escalacao: tb.escalacao, banco: tb.banco, instrucoes: tb.instrucoes }));
      g += p.placar[0] + p.placar[1]; n++;
      const notas = Object.fromEntries(R.montarRelatorio(p).jogadores.map(x => [x.id, x]));
      for (const j of [...a.elenco, ...b.elenco]) { const x = notas[j.id]; j.forma = S.momentoDepois(j, { nota: x ? x.nota : null, minutos: x ? x.minutos : 0 }).forma; } // a moral fica em 50
    }
    const tit = clubes.flatMap(c => c.elenco.slice().sort((x, y) => y.forma - x.forma).slice(0, 11)), m = l => Math.round(l.reduce((s, j) => s + j.forma, 0) / (l.length || 1));
    saida.push(`${(g / n).toFixed(2)} gols (forma dos 11 de melhor forma: ataque ${m(tit.filter(j => ataque(j.pos)))}, defesa e goleiro ${m(tit.filter(j => defesa(j.pos)))})`);
  }
  return saida;
}
for (const regra of ["antiga", "nova"]) console.log(`grupo ${grupo}, regra ${regra}: ` + temporadas(regra, 5, 9).map((s, i) => `volta ${i + 1}: ${s}`).join(" | "));
