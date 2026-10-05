// Virada de temporada: monta o plano (classificação final, prêmios, envelhecimento, aposentadorias, jovens, renovações).
// Não depende do navegador nem do banco: recebe os dados e devolve o que deve ser gravado. Valores em milhares.
import { ATRIBUTOS, ATR_MIN, ATR_MAX } from "./modelo.js";
import { jovensDaBase } from "./base.js";
import { limitar } from "./rng.js";
import { gerarJogador } from "./gerador.js";
import { salarioDeMercado, TETO_DE_FOLHA } from "./economia.js";
import { classificacao } from "./rodada.js";

// prêmio da liga por divisão: [campeão, lanterna], em degraus iguais entre as posições
export const PREMIOS = { 1: [10000, 4000], 2: [6000, 2400], 3: [3500, 1200] };
export const premioDaLiga = (divisao, posicao, clubes = 10) => {
  const [topo, fundo] = PREMIOS[divisao] || PREMIOS[2];
  return Math.round(topo - (topo - fundo) * (posicao - 1) / Math.max(1, clubes - 1));
};
export const chanceDeAposentar = idade => idade >= 38 ? 1 : idade < 34 ? 0 : (idade - 33) * 0.2; // 20% aos 34 … 80% aos 37
export const NOTA_DO_JOVEM = 22, CONTRATO_DO_JOVEM = 3;
// Crescimento na virada: era provisório (+1 a +3 em tudo até os 23 anos) e saiu quando o treino entrou (src/treino.js):
// agora o jogador evolui rodada a rodada, pelos focos. A queda física por idade continua aqui.
export const crescimento = () => 0;

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
// os 2 últimos de cada grupo. Entre a segunda e a terceira divisão o destino é fixo e cruzado:
//   campeão da C1 → B1 e vencedor do playoff da C1 → B2; campeão da C2 → B2 e vencedor do playoff da C2 → B1;
//   lanterna da B1 → C1 e 9º da B1 → C2; lanterna da B2 → C2 e 9º da B2 → C1.
// Os 4 que caem da primeira divisão continuam sorteados, 2 para cada grupo da segunda.
export function movimentos({ rng, clubes, grupos, partidas, resultados }) {
  const res = Object.fromEntries(resultados.map(r => [r.partida_id, r]));
  const divDoGrupo = g => (clubes.find(c => c.grupo === g) || {}).divisao, maxDiv = Math.max(...clubes.map(c => c.divisao));
  const destino = {}, sobem = {}, caem = {}; // por divisão de origem
  for (const [g, linhas] of Object.entries(grupos)) {
    const d = divDoGrupo(g), n = linhas.length;
    linhas.forEach(l => { destino[l.clube_id] = l.posicao === 1 && d === 1 ? "campeão" : "ficou"; });
    if (d > 1) {
      const final = partidas.find(p => p.grupo === g && p.fase === "final");
      if (!final || !res[final.id]) throw new Error(`Falta a final do playoff da ${({ B: "Série B1", C: "Série B2", D: "Série C1", E: "Série C2" })[g] || "chave " + g}. Gere os playoffs antes da virada.`);
      const pelo = vencedorDoPlayoff(final, res[final.id]);
      // papel 0: fica no grupo "da mesma letra" do destino (campeão, lanterna); papel 1: vai para o outro grupo (playoff, penúltimo)
      [linhas[0].clube_id, pelo].forEach((id, papel) => { destino[id] = "subiu"; (sobem[d] = sobem[d] || []).push({ id, de: g, papel }); });
    }
    if (d < maxDiv) linhas.slice(n - (d === 1 ? 4 : 2)).forEach(l => { destino[l.clube_id] = "caiu"; (caem[d] = caem[d] || []).push({ id: l.clube_id, de: g, papel: d === 1 ? null : l.posicao === n ? 0 : 1 }); });
  }
  const gruposDa = d => Object.keys(grupos).filter(g => divDoGrupo(g) === d).sort();
  const lista = [];
  // distribui por igual entre os grupos do destino; quem sai de cada grupo abre exatamente as vagas que os que chegam ocupam
  const distribuir = (quem, d, caiu) => {
    const alvos = gruposDa(d), vagas = Object.fromEntries(alvos.map(g => [g, 0])), origens = [...new Set(quem.map(x => x.de))].sort();
    // mesmo número de grupos na origem e no destino, com papel definido: destino fixo e cruzado, sem sorteio
    if (alvos.length > 1 && origens.length === alvos.length && quem.every(x => x.papel != null)) {
      quem.forEach(x => lista.push({ clube_id: x.id, grupo: alvos[(origens.indexOf(x.de) + x.papel) % alvos.length], divisao: d, caiu }));
      return;
    }
    rng.embaralhar(quem).forEach((x, k) => { const g = alvos[k % alvos.length]; vagas[g]++; lista.push({ clube_id: x.id, grupo: g, divisao: d, caiu }); });
  };
  for (const d of Object.keys(sobem)) distribuir(sobem[d], +d - 1, false);
  for (const d of Object.keys(caem)) distribuir(caem[d], +d + 1, true);
  return { destino, lista };
}

// clubes: [{ id, nome, grupo, divisao, perfil }] · elencos: { clubeId: [jogador no formato do motor] } · talentos: { idDoJogador: 1 a 100 }
// comLivres: o mercado de jogadores livres já existe (SQL 21); sem ele, todo contrato vencido se renova sozinho.
export const ELENCO_MINIMO = 16, DIAS_DE_INATIVIDADE = 21;
export const ELENCO_MINIMO_DO_BOT = 18;
export function planejarVirada({ rng, liga, clubes, elencos, talentos, partidas, resultados, nomes, comLivres = false, agora = Date.now(), tetos = TETO_DE_FOLHA }) {
  const nova = liga.temporada + 1;
  const plano = { temporada: liga.temporada, classificacao: [], jogadores: [], aposentados: [], novos: [], movimentos: [], livres: [] };
  const resumo = { grupos: {}, aposentados: [], novos: [], livres: [], cresceram: 0, cairam: 0, renovados: 0 };
  const grupoNovo = {}; // grupo em que cada clube que sobe ou cai vai jogar

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
    m.lista.forEach(x => { grupoNovo[x.clube_id] = x.grupo; });
    const para = Object.fromEntries(m.lista.map(x => [x.clube_id, x.grupo]));
    plano.classificacao.forEach(l => { l.destino = m.destino[l.clube_id]; });
    Object.values(resumo.grupos).flat().forEach(l => { l.destino = m.destino[l.clube_id]; l.para = para[l.clube_id] || null; });
  }

  const usados = new Set(Object.values(elencos).flat().map(j => j.nome));
  for (const c of clubes) {
   const vencidos = [], regs = [], renovadosAqui = []; let ficam = 0;
   // promoção da base: nos clubes com dirigente, os jovens vêm conforme o nível da base (e o aposentado não é reposto, mais abaixo)
   if (c.dono) for (const jovem of jovensDaBase(rng, { nivel: c.base_nivel || 0, momento: "promocao", perfil: c.perfil, nomes, usados, temporada: nova })) {
     ficam++;
     plano.novos.push({ clube_id: c.id, ...jovem });
     resumo.novos.push({ clube: c.nome, dono: true, nome: jovem.nome, pos: jovem.pos, idade: jovem.idade });
   }
   // clube com dirigente que entrou nos últimos 21 dias cuida dos próprios contratos; os demais renovam sozinhos
   const cuida = comLivres && !!c.dono && !!c.ultimo_acesso && agora - new Date(c.ultimo_acesso).getTime() <= DIAS_DE_INATIVIDADE * 86400000;
   for (const j of elencos[c.id] || []) {
    const idade = j.idade + 1;
    // com o anúncio de aposentadoria (SQL 46), para quem anunciou no meio da temporada ou chega aos 38; antes dele, vale o sorteio na virada
    const para = j.aposentaEm !== undefined ? (j.aposentaEm === liga.temporada || idade >= 38) : rng.chance(chanceDeAposentar(idade));
    if (para) {
      plano.aposentados.push(numero(j.id));
      resumo.aposentados.push({ clube: c.nome, dono: !!c.dono, nome: j.nome, pos: j.pos, idade });
      if (c.dono) continue; // clube com dirigente: quem repõe é a base
      ficam++;
      const jovem = gerarJogador(rng, { id: null, pos: j.pos, alvo: limitar(NOTA_DO_JOVEM + rng.normal(0, 1.5), 18, 26), idade: rng.int(17, 19), perfil: c.perfil, nomes, usados });
      const mercado = salarioDeMercado(jovem);
      plano.novos.push({ clube_id: c.id, nome: jovem.nome, pais: jovem.pais, idade: jovem.idade, pos: jovem.pos, fam: jovem.fam, at: jovem.at, tal: jovem.tal,
        salario: mercado, salario_mercado: mercado, contrato_ate: nova + CONTRATO_DO_JOVEM - 1, protegido_ate: nova });
      resumo.novos.push({ clube: c.nome, dono: !!c.dono, nome: jovem.nome, pos: jovem.pos, idade: jovem.idade });
      continue;
    }
    const at = j.at.slice(), sobe = crescimento(idade, talentos[numero(j.id)] || 50);
    if (sobe) { at.forEach((v, i) => { if (j.pos === "GK" || !DE_GOLEIRO.has(i)) at[i] = limitar(v + sobe, ATR_MIN, ATR_MAX); }); resumo.cresceram++; }
    if (idade >= 34) { FISICOS.forEach(i => { at[i] = limitar(at[i] - rng.int(1, 2), ATR_MIN, ATR_MAX); }); resumo.cairam++; }
    else if (idade >= 31) { rng.embaralhar(FISICOS).slice(0, rng.int(1, 2)).forEach(i => { at[i] = limitar(at[i] - 1, ATR_MIN, ATR_MAX); }); resumo.cairam++; }
    const reg = { id: numero(j.id), idade, at, salario: j.salario, salario_mercado: j.mercado, contrato_ate: j.contratoAte };
    plano.jogadores.push(reg); regs.push(reg);
    if (j.salario != null && j.contratoAte != null && j.contratoAte < nova) vencidos.push({ reg, j, mercado: salarioDeMercado({ ...j, idade, at }) });
    else ficam++;
   }
   // contratos vencidos: nos clubes sem dono (ou com dirigente ausente) renovam sozinhos por uma temporada, pelo maior entre o
   // salário atual e o de mercado; nos demais o jogador fica livre, a não ser que o elenco fosse ficar com menos de 16
   vencidos.sort((a, b) => b.mercado - a.mercado);
   for (const v of vencidos) {
    if (!cuida || ficam < ELENCO_MINIMO) {
      v.reg.salario = Math.max(v.reg.salario, v.mercado); v.reg.salario_mercado = v.mercado; v.reg.contrato_ate = nova; ficam++; resumo.renovados++; renovadosAqui.push(v);
    } else {
      plano.livres.push({ id: v.reg.id, salario_mercado: v.mercado });
      resumo.livres.push({ clube: c.nome, dono: true, nome: v.j.nome, pos: v.j.pos, idade: v.reg.idade });
    }
   }
   // Clube sem dono (ou com dirigente ausente) também respeita o teto de folha: se a folha renovada passa do teto da divisão em que ele vai
   // jogar, os renovados mais caros ficam livres e vão a leilão, até caber ou até o elenco chegar a 18.
   if (!cuida && comLivres) {
    const g = grupoNovo[c.id], teto = tetos[g ? (g === "A" ? 1 : "BC".includes(g) ? 2 : 3) : c.divisao] || Infinity;
    let folha = regs.reduce((s, r) => s + (r.salario || 0), 0) + plano.novos.filter(n => n.clube_id === c.id).reduce((s, n) => s + (n.salario || 0), 0);
    for (const v of renovadosAqui.sort((a, b) => b.reg.salario - a.reg.salario)) {
      if (folha <= teto || ficam <= ELENCO_MINIMO_DO_BOT) break;
      folha -= v.reg.salario; ficam--; resumo.renovados--;
      plano.livres.push({ id: v.reg.id, salario_mercado: v.mercado });
      resumo.livres.push({ clube: c.nome, dono: !!c.dono, peloTeto: true, nome: v.j.nome, pos: v.j.pos, idade: v.reg.idade });
    }
   }
  }
  return { plano, resumo };
}
