// Virada de temporada: monta o plano (classificação final, prêmios, envelhecimento, aposentadorias, jovens, renovações).
// Não depende do navegador nem do banco: recebe os dados e devolve o que deve ser gravado. Valores em milhares.
import { ATRIBUTOS, ATR_MIN, ATR_MAX } from "./modelo.js";
import { limitar } from "./rng.js";
import { gerarJogador } from "./gerador.js";
import { salarioDeMercado } from "./economia.js";
import { classificacao } from "./rodada.js";

// prêmio da liga por divisão: [campeão, lanterna], em degraus iguais entre as posições
export const PREMIOS = { 1: [10000, 4000], 2: [6000, 2400], 3: [3500, 1200] };
export const premioDaLiga = (divisao, posicao, clubes = 10) => {
  const [topo, fundo] = PREMIOS[divisao] || PREMIOS[2];
  return Math.round(topo - (topo - fundo) * (posicao - 1) / Math.max(1, clubes - 1));
};
export const chanceDeAposentar = idade => idade >= 38 ? 1 : idade < 34 ? 0 : (idade - 33) * 0.2; // 20% aos 34 … 80% aos 37
export const NOTA_DO_JOVEM = 22, CONTRATO_DO_JOVEM = 3;
// crescimento provisório (até o treino existir): até os 23 anos, 1 a 3 pontos por temporada conforme o talento oculto
export const crescimento = (idade, talento) => idade > 23 ? 0 : talento >= 67 ? 3 : talento >= 34 ? 2 : 1;

const FISICOS = ATRIBUTOS.map((a, i) => a.grupo === "fis" ? i : -1).filter(i => i >= 0);
const DE_GOLEIRO = new Set(ATRIBUTOS.map((a, i) => a.grupo === "gol" ? i : -1).filter(i => i >= 0));
const numero = id => +String(id).replace(/^j/, "");

// ---------- playoffs de acesso: 2º x 5º e 3º x 4º, depois a final; jogo único na casa do mais bem colocado ----------
export const RODADA_SEMI = 19, RODADA_FINAL = 20;
const daLiga = p => !p.fase || p.fase === "liga";
// Empate classifica o mandante, que é sempre o de melhor campanha.
export const vencedorDoPlayoff = (p, r) => r.gols_casa >= r.gols_fora ? p.casa : p.fora;
// Devolve os jogos da próxima fase a criar: { fase, jogos: [{ grupo, rodada, fase, casa, fora }] } ou { erro }.
export function proximaFaseDosPlayoffs({ clubes, partidas, resultados }) {
  const res = Object.fromEntries(resultados.map(r => [r.partida_id, r]));
  if (!partidas.length || partidas.some(p => daLiga(p) && !res[p.id])) return { erro: "A fase de liga ainda não terminou." };
  const grupos = [...new Set(clubes.filter(c => c.divisao > 1).map(c => c.grupo))].sort();
  if (!grupos.length) return { erro: "Nenhum grupo disputa playoff (só as divisões abaixo da primeira)." };
  const semis = partidas.filter(p => p.fase === "semi"), finais = partidas.filter(p => p.fase === "final");
  if (finais.length) return { erro: "As finais dos playoffs já foram criadas." };
  const jogos = [];
  for (const g of grupos) {
    const t = classificacao(clubes.filter(c => c.grupo === g), partidas.filter(p => p.grupo === g), resultados).map(x => x.clube.id);
    if (!semis.length) {
      if (t.length < 5) continue;
      jogos.push({ grupo: g, rodada: RODADA_SEMI, fase: "semi", casa: t[1], fora: t[4] }, { grupo: g, rodada: RODADA_SEMI, fase: "semi", casa: t[2], fora: t[3] });
    } else {
      const doGrupo = semis.filter(p => p.grupo === g);
      if (doGrupo.some(p => !res[p.id])) return { erro: "As semifinais ainda não terminaram." };
      const v = doGrupo.map(p => vencedorDoPlayoff(p, res[p.id])).sort((a, b) => t.indexOf(a) - t.indexOf(b));
      if (v.length === 2) jogos.push({ grupo: g, rodada: RODADA_FINAL, fase: "final", casa: v[0], fora: v[1] });
    }
  }
  return { fase: semis.length ? "final" : "semi", jogos };
}

// Acesso e descenso: na primeira caem os 4 últimos; nas outras sobem o campeão e o vencedor do playoff, e na segunda caem
// os 2 últimos de cada grupo. Quem muda de nível é sorteado entre os grupos do destino, em partes iguais.
export function movimentos({ rng, clubes, grupos, partidas, resultados }) {
  const res = Object.fromEntries(resultados.map(r => [r.partida_id, r]));
  const divDoGrupo = g => (clubes.find(c => c.grupo === g) || {}).divisao, maxDiv = Math.max(...clubes.map(c => c.divisao));
  const destino = {}, sobem = {}, caem = {}; // por divisão de origem
  for (const [g, linhas] of Object.entries(grupos)) {
    const d = divDoGrupo(g), n = linhas.length;
    linhas.forEach(l => { destino[l.clube_id] = l.posicao === 1 && d === 1 ? "campeão" : "ficou"; });
    if (d > 1) {
      const final = partidas.find(p => p.grupo === g && p.fase === "final");
      if (!final || !res[final.id]) throw new Error(`Falta a final do playoff do grupo ${g}. Gere os playoffs antes da virada.`);
      const pelo = vencedorDoPlayoff(final, res[final.id]);
      for (const id of [linhas[0].clube_id, pelo]) { destino[id] = "subiu"; (sobem[d] = sobem[d] || []).push({ id, de: g }); }
    }
    if (d < maxDiv) linhas.slice(n - (d === 1 ? 4 : 2)).forEach(l => { destino[l.clube_id] = "caiu"; (caem[d] = caem[d] || []).push({ id: l.clube_id, de: g }); });
  }
  const gruposDa = d => Object.keys(grupos).filter(g => divDoGrupo(g) === d).sort();
  const lista = [];
  // distribui por igual entre os grupos do destino; quem sai de cada grupo abre exatamente as vagas que os que chegam ocupam
  const distribuir = (quem, d, caiu) => {
    const alvos = gruposDa(d), vagas = Object.fromEntries(alvos.map(g => [g, 0]));
    rng.embaralhar(quem).forEach((x, k) => { const g = alvos[k % alvos.length]; vagas[g]++; lista.push({ clube_id: x.id, grupo: g, divisao: d, caiu }); });
  };
  for (const d of Object.keys(sobem)) distribuir(sobem[d], +d - 1, false);
  for (const d of Object.keys(caem)) distribuir(caem[d], +d + 1, true);
  return { destino, lista };
}

// clubes: [{ id, nome, grupo, divisao, perfil }] · elencos: { clubeId: [jogador no formato do motor] } · talentos: { idDoJogador: 1 a 100 }
export function planejarVirada({ rng, liga, clubes, elencos, talentos, partidas, resultados, nomes }) {
  const nova = liga.temporada + 1;
  const plano = { temporada: liga.temporada, classificacao: [], jogadores: [], aposentados: [], novos: [], movimentos: [] };
  const resumo = { grupos: {}, aposentados: [], novos: [], cresceram: 0, cairam: 0, renovados: 0 };

  for (const g of [...new Set(clubes.map(c => c.grupo))].sort()) {
    const doGrupo = clubes.filter(c => c.grupo === g);
    resumo.grupos[g] = classificacao(doGrupo, partidas.filter(p => p.grupo === g), resultados).map((t, i) => {
      const linha = { clube_id: t.clube.id, divisao: t.clube.divisao, grupo: g, posicao: i + 1, pontos: t.pts, vitorias: t.v, empates: t.e, derrotas: t.d,
        gols_pro: t.gp, gols_contra: t.gc, premio: premioDaLiga(t.clube.divisao, i + 1, doGrupo.length) };
      plano.classificacao.push(linha);
      return { ...linha, nome: t.clube.nome, dono: !!t.clube.dono };
    });
  }

  // acesso e descenso (só quando há mais de uma divisão)
  if (new Set(clubes.map(c => c.divisao)).size > 1) {
    const m = movimentos({ rng, clubes, grupos: resumo.grupos, partidas, resultados });
    plano.movimentos = m.lista;
    const para = Object.fromEntries(m.lista.map(x => [x.clube_id, x.grupo]));
    plano.classificacao.forEach(l => { l.destino = m.destino[l.clube_id]; });
    Object.values(resumo.grupos).flat().forEach(l => { l.destino = m.destino[l.clube_id]; l.para = para[l.clube_id] || null; });
  }

  const usados = new Set(Object.values(elencos).flat().map(j => j.nome));
  for (const c of clubes) for (const j of elencos[c.id] || []) {
    const idade = j.idade + 1;
    if (rng.chance(chanceDeAposentar(idade))) {
      plano.aposentados.push(numero(j.id));
      const jovem = gerarJogador(rng, { id: null, pos: j.pos, alvo: limitar(NOTA_DO_JOVEM + rng.normal(0, 1.5), 18, 26), idade: rng.int(17, 19), perfil: c.perfil, nomes, usados });
      const mercado = salarioDeMercado(jovem);
      plano.novos.push({ clube_id: c.id, nome: jovem.nome, pais: jovem.pais, idade: jovem.idade, pos: jovem.pos, fam: jovem.fam, at: jovem.at, tal: jovem.tal,
        salario: mercado, salario_mercado: mercado, contrato_ate: nova + CONTRATO_DO_JOVEM - 1, protegido_ate: nova });
      resumo.aposentados.push({ clube: c.nome, dono: !!c.dono, nome: j.nome, pos: j.pos, idade });
      resumo.novos.push({ clube: c.nome, dono: !!c.dono, nome: jovem.nome, pos: jovem.pos, idade: jovem.idade });
      continue;
    }
    const at = j.at.slice(), sobe = crescimento(idade, talentos[numero(j.id)] || 50);
    if (sobe) { at.forEach((v, i) => { if (j.pos === "GK" || !DE_GOLEIRO.has(i)) at[i] = limitar(v + sobe, ATR_MIN, ATR_MAX); }); resumo.cresceram++; }
    if (idade >= 34) { FISICOS.forEach(i => { at[i] = limitar(at[i] - rng.int(1, 2), ATR_MIN, ATR_MAX); }); resumo.cairam++; }
    else if (idade >= 31) { rng.embaralhar(FISICOS).slice(0, rng.int(1, 2)).forEach(i => { at[i] = limitar(at[i] - 1, ATR_MIN, ATR_MAX); }); resumo.cairam++; }
    // contrato vencido se renova sozinho por uma temporada, pelo maior entre o salário atual e o de mercado (enquanto não há mercado)
    let salario = j.salario, mercado = j.mercado, contrato = j.contratoAte;
    if (salario != null && contrato != null && contrato < nova) {
      mercado = salarioDeMercado({ ...j, idade, at }); salario = Math.max(salario, mercado); contrato = nova; resumo.renovados++;
    }
    plano.jogadores.push({ id: numero(j.id), idade, at, salario, salario_mercado: mercado, contrato_ate: contrato });
  }
  return { plano, resumo };
}
