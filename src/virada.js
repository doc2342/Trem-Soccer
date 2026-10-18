// Virada de temporada: monta o plano (classificação final, prêmios, envelhecimento, aposentadorias, jovens, renovações).
// Não depende do navegador nem do banco: recebe os dados e devolve o que deve ser gravado. Valores em milhares.
import { ATRIBUTOS, ATR_MIN, ATR_MAX, notaNaPosicao, notaBruta, talentoMinimo, PAISES, paisDoGrupo } from "./modelo.js";
import { jovensDaBase, CONFIG_BASE } from "./base.js";
import { limitar } from "./rng.js";
import { gerarJogador, TALENTO_COMUM } from "./gerador.js";
import { salarioDeMercado, TETO_DE_FOLHA } from "./economia.js";
import { classificacao } from "./rodada.js";

// prêmio da liga por divisão: [campeão, lanterna], em degraus iguais entre as posições
// pela metade desde o 68_economia.sql (antes: 10 a 4 mi na A, 6 a 2,4 na B e 3,5 a 1,2 na C): entrava dinheiro demais e os caixas só cresciam
export const PREMIOS = { 1: [5000, 2000], 2: [3000, 1200], 3: [1750, 600] };
export const premioDaLiga = (divisao, posicao, clubes = 10, fora = false) => {
  const [topo, fundo] = fora ? REGUA_DE_FORA.premios : PREMIOS[divisao] || PREMIOS[2];
  return Math.round(topo - (topo - fundo) * (posicao - 1) / Math.max(1, clubes - 1));
};
export const chanceDeAposentar = idade => idade >= 40 ? 1 : idade < 35 ? 0 : (idade - 34) * 0.2; // 20% aos 35 … 80% aos 38
export const NOTA_DO_JOVEM = 22, CONTRATO_DO_JOVEM = 3;
export const REPOSICAO = { abaixoDoAposentado: 5 }; // o jovem que repõe o aposentado no bot chega até 5 pontos de nota abaixo dele
// jovem que repõe o aposentado nos clubes sem dirigente: chega mais pronto nas divisões de cima
export const NOTA_DO_JOVEM_POR_DIVISAO = { 1: 26, 2: 24, 3: 22 };
// Escada das divisões: o talento (teto) do jovem que o clube sem dirigente recebe é deslocado pela divisão de destino: média 66 / 50 / 38
// (o sorteio comum tem média 58). Sem isso o teto é igual em toda divisão e os elencos convergem; simulado em ferramentas/sim_escada.mjs:
// com a meia safra, onze mediano de 38,1 / 35,6 / 33,8 na liga madura (alvo 38 / 35 / 32).
export const TALENTO_DO_JOVEM_POR_DIVISAO = { 1: 8, 2: -8, 3: -20 };
// Outros países: campeonato de uma divisão só, sem acesso nem descenso, com régua própria, um pouco acima da Série A, para o campeão de
// cada país chegar à Libertadores com onze de 39 a 40. Simulado em ferramentas/sim_paises.mjs (10 clubes, 20 temporadas, 4 sementes): com jovem
// de nota 28 e talento +14, o campeão tem onze de ~38,5 nas primeiras temporadas e ~40,4 na liga madura, com folha de até ~23,9 mi.
// O teto de 24 mi é o mesmo do banco (teto_do_clube, 80_virada_com_paises.sql). O prêmio da liga é maior que o da Série A porque a folha é
// maior e TV, patrocínio e ingresso são os da Série A: sem ele o clube ficaria no vermelho e venderia jogador ao banco.
export const REGUA_DE_FORA = { nota: 28, talento: 14, teto: 24000, premios: [9000, 5000] };
// Safra de cada país, sorteada à parte (não tira raro do Brasil): em média 0,15 de teto 43 e 0,3 de teto 42 por temporada, a mesma
// proporção do Brasil por clube.
export const SAFRA_DE_FORA = [{ nivel: 43, tal: 100, quantos: [[0, 0.85], [1, 0.15]] }, { nivel: 42, tal: 95, quantos: [[0, 0.7], [1, 0.3]] }];
// Crescimento na virada: era provisório (+1 a +3 em tudo até os 23 anos) e saiu quando o treino entrou (src/treino.js):
// agora o jogador evolui rodada a rodada, pelos focos. A queda física por idade continua aqui.
export const crescimento = () => 0;

const FISICOS = ATRIBUTOS.map((a, i) => a.grupo === "fis" ? i : -1).filter(i => i >= 0);
const DE_GOLEIRO = new Set(ATRIBUTOS.map((a, i) => a.grupo === "gol" ? i : -1).filter(i => i >= 0));
const numero = id => +String(id).replace(/^j/, "");

// playoffs de acesso: a montagem das fases mora em rodada.js, porque o servidor também usa (cria as fases sozinho)
import { DESCENSO_DA_PRIMEIRA, vencedorDoPlayoff, vencedorDoGrupo, proximaFaseDosPlayoffs } from "./rodada.js";
export { DESCENSO_DA_PRIMEIRA, vencedorDoPlayoff, proximaFaseDosPlayoffs };
// Pirâmide desde a T14: Série A de 12 e grupos de 8 na Série B (B1 = "B", B2 = "C", B3 = "F"; "D" e "E" foram a Série C até a T13).
// Clube GUARDADO fica no grupo "X": sem partidas, fora de liga, copa, base e mercado; envelhece na virada e volta numa expansão.
export const GUARDADO = "X";
export const GRUPOS_DA_B = ["B", "C", "F"];
export const divisaoDoGrupo = g => PAISES[g] || g === "A" ? 1 : g === GUARDADO || g === "D" || g === "E" ? 3 : 2;
// força do onze, a mesma do raio-x (ferramentas/saude.mjs): o melhor goleiro e os 10 melhores de linha, pela nota na posição principal
export const forcaDoOnze = elenco => { const s = (elenco || []).map(j => ({ pos: j.pos, n: notaBruta(j.at, j.pos) })).sort((a, b) => b.n - a.n), g = s.find(j => j.pos === "GK");
  const onze = [g, ...s.filter(j => j.pos !== "GK").slice(0, 10)].filter(Boolean); return onze.length ? onze.reduce((t, j) => t + j.n, 0) / onze.length : 0; };
// Acesso e descenso: caem os 3 últimos da Série A; de cada grupo da Série B sobe o vencedor do playoff (rodada.js) e a B não cai.
// Os que caem são sorteados entre os grupos que cederam o clube que subiu (um para cada).
export function movimentos({ rng, clubes, grupos, partidas, resultados }) {
  const divDoGrupo = g => (clubes.find(c => c.grupo === g) || {}).divisao;
  const destino = {}, lista = [], vagas = [];
  for (const [g, linhas] of Object.entries(grupos)) {
    linhas.forEach(l => { destino[l.clube_id] = l.posicao === 1 && divDoGrupo(g) === 1 ? "campeão" : "ficou"; });
    if (divDoGrupo(g) === 1) continue;
    const v = vencedorDoGrupo(partidas, resultados, g);
    if (!v) throw new Error(`Falta a final do playoff da ${nomeCurto(g)}. Os playoffs saem sozinhos depois da última rodada do grupo (ou pelo botão "Gerar a próxima fase").`);
    destino[v] = "subiu"; vagas.push(g);
    lista.push({ clube_id: v, grupo: "A", divisao: 1, caiu: false });
  }
  const daA = grupos.A || [];
  if (vagas.length) rng.embaralhar(daA.slice(daA.length - DESCENSO_DA_PRIMEIRA).map(l => l.clube_id)).forEach((id, k) => {
    destino[id] = "caiu"; lista.push({ clube_id: id, grupo: vagas[k % vagas.length], divisao: 2, caiu: true }); });
  return { destino, lista };
}
const nomeCurto = g => ({ B: "Série B1", C: "Série B2", F: "Série B3", D: "Série C1", E: "Série C2" })[g] || "chave " + g;

// Transição T13 → T14 (uma vez só): de A 10 + B 2×10 + C 2×10 para A 12 + B 3×8. Ninguém cai da A. Sobem 2 das Bs: primeiro os clubes
// com dirigente ativo (pela campanha), depois os campeões dos grupos (o grupo que ainda não mandou ninguém primeiro). A Série B nova são
// os outros 18 das Bs e os 3 primeiros de cada grupo da C, em serpentina pela força do onze (1→B1, 2→B2, 3→B3, 4→B3, 5→B2, 6→B1…).
// Os outros da C ficam guardados. grupos: classificação final de cada grupo do Brasil; forca: { clubeId: força do onze }; ativo(clube).
export function movimentosDaTransicao({ clubes, grupos, forca, ativo, sobem = 2, daC = 3 }) {
  const porId = Object.fromEntries(clubes.map(c => [c.id, c])), div = g => divisaoDoGrupo(g);
  const linhasDa = d => Object.entries(grupos).filter(([g]) => div(g) === d).flatMap(([, l]) => l);
  const dasB = linhasDa(2).sort((a, b) => a.posicao - b.posicao || b.pontos - a.pontos);
  const subiram = dasB.filter(l => ativo(porId[l.clube_id])).slice(0, sobem);
  const campeoes = dasB.filter(l => l.posicao === 1 && !subiram.includes(l));
  while (subiram.length < sobem && campeoes.length) {
    campeoes.sort((a, b) => subiram.some(x => x.grupo === a.grupo) - subiram.some(x => x.grupo === b.grupo) || b.pontos - a.pontos);
    subiram.push(campeoes.shift());
  }
  for (const l of dasB) if (subiram.length < sobem && !subiram.includes(l)) subiram.push(l);
  const daC_ = linhasDa(3).filter(l => l.posicao <= daC), guardados = linhasDa(3).filter(l => l.posicao > daC);
  const serieB = [...dasB.filter(l => !subiram.includes(l)), ...daC_].sort((a, b) => (forca[b.clube_id] || 0) - (forca[a.clube_id] || 0) || a.clube_id - b.clube_id);
  const n = GRUPOS_DA_B.length, serpentina = k => { const v = k % (2 * n); return GRUPOS_DA_B[v < n ? v : 2 * n - 1 - v]; };
  const destino = {}, lista = [];
  linhasDa(1).forEach(l => { destino[l.clube_id] = l.posicao === 1 ? "campeão" : "ficou"; });
  subiram.forEach(l => { destino[l.clube_id] = "subiu"; lista.push({ clube_id: l.clube_id, grupo: "A", divisao: 1, caiu: false }); });
  serieB.forEach((l, k) => { const g = serpentina(k); destino[l.clube_id] = div(l.grupo) === 3 ? "subiu" : "ficou";
    if (g !== l.grupo) lista.push({ clube_id: l.clube_id, grupo: g, divisao: 2, caiu: false }); });
  guardados.forEach(l => { destino[l.clube_id] = "guardado"; lista.push({ clube_id: l.clube_id, grupo: GUARDADO, divisao: 3, caiu: false }); });
  return { destino, lista };
}

// clubes: [{ id, nome, grupo, divisao, perfil }] · elencos: { clubeId: [jogador no formato do motor] } · talentos: { idDoJogador: 1 a 100 }
// comLivres: o mercado de jogadores livres já existe (SQL 21); sem ele, todo contrato vencido se renova sozinho.
// Safra: os talentos raros de cada temporada. A liga sorteia quantos nascem (em média 0,75 de teto 43 e 1,5 de teto 42: metade do que era até a T9,
// quando a liga madura caminhava para ~22 jogadores com 43 e ~65 com 41,5 ou mais; com a metade, ~8 e ~32) e para que clubes vão.
// Cada clube tem um bilhete: peso 1 + nível da base (clube sem dirigente, 0,5); quem ganhou um raro nas últimas 3 temporadas (ou já ganhou nesta)
// concorre com metade do peso. No máximo um de cada nível por clube por temporada. O raro é um dos jovens que o clube já ia receber:
// clube sem dirigente que não repôs ninguém nesta virada fica fora do sorteio, para não aparecer um garoto a mais denunciando o raro.
export const CONFIG_SAFRA = {
  niveis: [{ nivel: 43, tal: 100, quantos: [[0, 0.4], [1, 0.45], [2, 0.15]] }, { nivel: 42, tal: 95, quantos: [[0, 0.1], [1, 0.4], [2, 0.4], [3, 0.1]] }],
  pesoDoBot: 0.5, meioPesoPor: 3, idadeNoBot: 19,
};
export const ELENCO_MINIMO = 16, DIAS_DE_INATIVIDADE = 21;
export const ELENCO_MINIMO_DO_BOT = 18;
// safras: { clubeId: última temporada em que o clube recebeu um talento raro }
export function planejarVirada({ rng, liga, clubes, elencos, talentos, partidas, resultados, nomes, comLivres = false, agora = Date.now(), tetos = TETO_DE_FOLHA, safras = {}, juvenis = false, taticas = {}, semMovimentos = false, transicao = false }) {
  const nova = liga.temporada + 1;
  const plano = { temporada: liga.temporada, classificacao: [], jogadores: [], aposentados: [], novos: [], movimentos: [], livres: [] };
  const resumo = { grupos: {}, aposentados: [], novos: [], livres: [], renovadosDono: [], cresceram: 0, cairam: 0, renovados: 0, reajustados: 0 };
  const grupoNovo = {}; // grupo em que cada clube que sobe ou cai vai jogar

  for (const g of [...new Set(clubes.map(c => c.grupo))].filter(g => g !== GUARDADO).sort()) { // guardado não tem tabela nem histórico
    const doGrupo = clubes.filter(c => c.grupo === g);
    resumo.grupos[g] = classificacao(doGrupo, partidas.filter(p => p.grupo === g), resultados).map((t, i) => {
      const linha = { clube_id: t.clube.id, divisao: t.clube.divisao, grupo: g, posicao: i + 1, pontos: t.pts, vitorias: t.v, empates: t.e, derrotas: t.d,
        gols_pro: t.gp, gols_contra: t.gc, premio: premioDaLiga(t.clube.divisao, i + 1, doGrupo.length, !!PAISES[g]) };
      plano.classificacao.push(linha);
      return { ...linha, nome: t.clube.nome, dono: !!t.clube.dono };
    });
  }

  // acesso e descenso (só quando há mais de uma divisão), só entre os clubes do Brasil: o campeonato de outro país não sobe nem cai ninguém
  const doBrasil = clubes.filter(c => !PAISES[c.grupo] && c.grupo !== GUARDADO);
  const ativo = c => !!c && !!c.dono && (!!c.extra || (!!c.ultimo_acesso && agora - new Date(c.ultimo_acesso).getTime() <= DIAS_DE_INATIVIDADE * 86400000));
  for (const [g, linhas] of Object.entries(resumo.grupos)) if (PAISES[g]) linhas.forEach(l => { l.destino = plano.classificacao.find(x => x.clube_id === l.clube_id).destino = l.posicao === 1 ? "campeão" : "ficou"; });
  // semMovimentos: temporada sem acesso e descenso (todo mundo fica na divisão e no grupo; playoffs não contam)
  if (semMovimentos) Object.values(resumo.grupos).flat().concat(plano.classificacao).forEach(l => { if (!PAISES[l.grupo]) l.destino = l.posicao === 1 && l.divisao === 1 ? "campeão" : "ficou"; });
  else if (transicao || new Set(doBrasil.map(c => c.divisao)).size > 1) {
    const grupos = Object.fromEntries(Object.entries(resumo.grupos).filter(([g]) => !PAISES[g]));
    const m = transicao ? movimentosDaTransicao({ clubes: doBrasil, grupos, forca: Object.fromEntries(doBrasil.map(c => [c.id, forcaDoOnze(elencos[c.id])])), ativo })
      : movimentos({ rng, clubes: doBrasil, grupos, partidas, resultados });
    plano.movimentos = m.lista;
    m.lista.forEach(x => { grupoNovo[x.clube_id] = x.grupo; });
    const para = Object.fromEntries(m.lista.map(x => [x.clube_id, x.grupo]));
    plano.classificacao.forEach(l => { if (!PAISES[l.grupo]) l.destino = m.destino[l.clube_id]; });
    Object.values(resumo.grupos).flat().forEach(l => { if (!PAISES[l.grupo]) { l.destino = m.destino[l.clube_id]; l.para = para[l.clube_id] || null; } });
  }

  const usados = new Set(Object.values(elencos).flat().map(j => j.nome));
  // jovem que o clube sem dirigente recebe (no lugar de um aposentado, ou quando a safra cai nele)
  // notaDeQuemSai: nota do aposentado que ele substitui; o jovem chega até 5 pontos abaixo dela (e nunca abaixo do piso da divisão),
  // para a liga não perder nível de uma vez quando a geração mais velha se aposenta
  const jovemDoBot = (c, pos, notaDeQuemSai = 0) => {
    const g = grupoNovo[c.id], div = g ? divisaoDoGrupo(g) : c.divisao, fora = !!PAISES[c.grupo]; // pela divisão em que o clube vai jogar
    const piso = fora ? REGUA_DE_FORA.nota : NOTA_DO_JOVEM_POR_DIVISAO[div] || NOTA_DO_JOVEM;
    const alvo = Math.max(piso, notaDeQuemSai - REPOSICAO.abaixoDoAposentado), pronto = alvo > piso; // reposição mais forte chega um pouco mais velha
    const jovem = gerarJogador(rng, { id: null, pos, alvo: limitar(alvo + rng.normal(0, 1.5), alvo - 4, alvo + 4), idade: pronto ? rng.int(19, 22) : rng.int(17, 19), pais: paisDoGrupo(c.grupo), perfil: c.perfil, nomes, usados });
    jovem.tal = limitar(jovem.tal + (fora ? REGUA_DE_FORA.talento : TALENTO_DO_JOVEM_POR_DIVISAO[div] || 0), 1, TALENTO_COMUM);
    // o teto nunca fica abaixo da nota com que ele chega: a reposição de um craque nascia com nota 43 e teto 31 (106_teto_acima_da_nota.sql)
    jovem.tal = Math.max(jovem.tal, talentoMinimo(jovem)); // depois do deslocamento da divisão, que pode baixar o talento de novo
    const mercado = salarioDeMercado(jovem);
    const novo = { clube_id: c.id, nome: jovem.nome, pais: jovem.pais, idade: jovem.idade, pos: jovem.pos, fam: jovem.fam, at: jovem.at, tal: jovem.tal,
      salario: mercado, salario_mercado: mercado, contrato_ate: nova + CONTRATO_DO_JOVEM - 1, protegido_ate: juvenis ? nova + CONFIG_BASE.idadeDeJuvenil - jovem.idade : nova };
    plano.novos.push(novo);
    resumo.novos.push({ clube: c.nome, dono: !!c.dono, nome: jovem.nome, pos: jovem.pos, idade: jovem.idade });
    return novo;
  };
  for (const c of clubes) {
   const vencidos = [], regs = [], renovadosAqui = []; let ficam = 0;
   // promoção da base: nos clubes com dirigente, os jovens vêm conforme o nível da base (e o aposentado não é reposto, mais abaixo)
   if (c.dono) for (const jovem of jovensDaBase(rng, { nivel: c.base_nivel || 0, momento: "promocao", perfil: c.perfil, nomes, usados, temporada: nova, juvenis, usa: taticas[c.id] || [],
     jaTem: (elencos[c.id] || []).filter(j => j.idade < CONFIG_BASE.idadeDeJuvenil).map(j => j.pos) })) {
     if (!juvenis) ficam++; // juvenil não conta no elenco profissional
     plano.novos.push({ clube_id: c.id, ...jovem });
     resumo.novos.push({ clube: c.nome, dono: true, nome: jovem.nome, pos: jovem.pos, idade: jovem.idade });
   }
   // clube com dirigente que entrou nos últimos 21 dias cuida dos próprios contratos; os demais renovam sozinhos
   const cuida = comLivres && ativo(c); // clube extra (96): sem inatividade
   const guardado = (grupoNovo[c.id] || c.grupo) === GUARDADO; // guardado envelhece e renova sozinho, mas não solta ninguém no mercado
   for (const j of elencos[c.id] || []) {
    const idade = j.idade + 1;
    // com o anúncio de aposentadoria (SQL 46), para quem anunciou no meio da temporada ou chega aos 40; antes dele, vale o sorteio na virada
    const para = j.aposentaEm !== undefined ? (j.aposentaEm === liga.temporada || idade >= 40) : rng.chance(chanceDeAposentar(idade));
    if (para) {
      plano.aposentados.push(numero(j.id));
      resumo.aposentados.push({ clube: c.nome, dono: !!c.dono, nome: j.nome, pos: j.pos, idade });
      if (c.dono) continue; // clube com dirigente: quem repõe é a base
      ficam++;
      jovemDoBot(c, j.pos, notaNaPosicao(j, j.pos));
      continue;
    }
    const at = j.at.slice(), sobe = crescimento(idade, talentos[numero(j.id)] || 50);
    if (sobe) { at.forEach((v, i) => { if (j.pos === "GK" || !DE_GOLEIRO.has(i)) at[i] = limitar(v + sobe, ATR_MIN, ATR_MAX); }); resumo.cresceram++; }
    if (idade >= 34) { FISICOS.forEach(i => { at[i] = limitar(at[i] - rng.int(1, 2), ATR_MIN, ATR_MAX); }); resumo.cairam++; }
    else if (idade >= 31) { rng.embaralhar(FISICOS).slice(0, rng.int(1, 2)).forEach(i => { at[i] = limitar(at[i] - 1, ATR_MIN, ATR_MAX); }); resumo.cairam++; }
    // salário de mercado de todos refeito pela nota de hoje; clube sem dono reajusta quem ganha abaixo dele (66_multa_e_bots.sql)
    const mercadoHoje = salarioDeMercado({ ...j, idade, at });
    const reg = { id: numero(j.id), idade, at, salario: j.salario, salario_mercado: mercadoHoje, contrato_ate: j.contratoAte };
    if (!c.dono && !j.juvenil && j.salario != null && j.salario < mercadoHoje) { reg.salario = mercadoHoje; resumo.reajustados++; }
    plano.jogadores.push(reg); regs.push(reg);
    if (j.juvenil) { // juvenil que passou dos 21 sem ser profissionalizado fica livre
      if (comLivres && !guardado && idade > CONFIG_BASE.idadeDeJuvenil) {
        plano.livres.push({ id: reg.id, salario_mercado: salarioDeMercado({ ...j, idade, at }) });
        resumo.livres.push({ clube: c.nome, dono: !!c.dono, juvenil: true, nome: j.nome, pos: j.pos, idade });
      }
    }
    else if (j.salario != null && j.contratoAte != null && j.contratoAte < nova) vencidos.push({ reg, j, mercado: salarioDeMercado({ ...j, idade, at }) });
    else ficam++;
   }
   // contratos vencidos renovam sozinhos por uma temporada, pelo maior entre o salário atual e o de mercado (99_renovacao_automatica.sql);
   // só fica livre quem o dirigente marcou "não renovar", a não ser que o elenco fosse ficar com menos de 16
   vencidos.sort((a, b) => b.mercado - a.mercado);
   for (const v of vencidos) {
    if (!(cuida && v.j.naoRenovar) || ficam < ELENCO_MINIMO) {
      v.reg.salario = Math.max(v.reg.salario, v.mercado); v.reg.salario_mercado = v.mercado; v.reg.contrato_ate = nova; ficam++; resumo.renovados++; renovadosAqui.push(v);
      if (c.dono) resumo.renovadosDono.push({ clube: c.nome, nome: v.j.nome, pos: v.j.pos, idade: v.reg.idade });
    } else {
      plano.livres.push({ id: v.reg.id, salario_mercado: v.mercado });
      resumo.livres.push({ clube: c.nome, dono: true, nome: v.j.nome, pos: v.j.pos, idade: v.reg.idade });
    }
   }
   // A renovação respeita o teto de folha: se a folha renovada passa do teto da divisão em que o clube vai jogar, os renovados mais caros
   // ficam livres e vão a leilão, até caber ou até o elenco chegar a 18 (clube sem dono ou com dirigente ausente) ou 16 (dirigente ativo).
   if (comLivres && !guardado) {
    const g = grupoNovo[c.id], teto = PAISES[c.grupo] ? REGUA_DE_FORA.teto : tetos[g ? divisaoDoGrupo(g) : c.divisao] || Infinity;
    let folha = regs.reduce((s, r) => s + (r.salario || 0), 0) + plano.novos.filter(n => n.clube_id === c.id).reduce((s, n) => s + (n.salario || 0), 0);
    for (const v of renovadosAqui.sort((a, b) => b.reg.salario - a.reg.salario)) {
      if (folha <= teto || ficam <= (cuida ? ELENCO_MINIMO : ELENCO_MINIMO_DO_BOT)) break;
      folha -= v.reg.salario; ficam--; resumo.renovados--;
      resumo.renovadosDono = resumo.renovadosDono.filter(x => !(x.clube === c.nome && x.nome === v.j.nome));
      plano.livres.push({ id: v.reg.id, salario_mercado: v.mercado });
      resumo.livres.push({ clube: c.nome, dono: !!c.dono, peloTeto: true, nome: v.j.nome, pos: v.j.pos, idade: v.reg.idade });
    }
   }
  }
  // safra da temporada nova
  plano.safra = []; resumo.safra = [];
  const jaGanhou = new Set(), raros = new Set(), aposentou = new Set([...plano.aposentados, ...plano.livres.map(x => x.id)]); // quem se aposenta ou fica livre não recebe o raro
  const sorteado = tabela => { let r = rng.n(); for (const [n, p] of tabela) if ((r -= p) < 0) return n; return tabela[tabela.length - 1][0]; };
  const sortearSafra = (clubes, niveis) => { for (const { nivel, tal, quantos } of niveis) {
    const fora = new Set();
    for (let k = sorteado(quantos); k > 0; k--) {
      // em clube sem dirigente o raro pode ser um jovem que chega ou alguém do elenco que terá até 19 anos e talento comum: não sobra pista
      const doBot = c => [...plano.novos.filter(x => x.clube_id === c.id && !raros.has(x)),
        ...(elencos[c.id] || []).filter(j => j.idade + 1 <= CONFIG_SAFRA.idadeNoBot && !raros.has(j) && !aposentou.has(numero(j.id)) && (talentos[numero(j.id)] || 50) <= TALENTO_COMUM)];
      const cand = clubes.filter(c => !fora.has(c.id) && (c.dono || doBot(c).length));
      // os clubes sem dirigente que ficaram fora (não iam receber jovem) passam o peso deles aos que concorrem: a fatia dos bots não encolhe
      const bots = clubes.filter(c => !c.dono).length, botsNoSorteio = cand.filter(c => !c.dono).length, pesoDoBot = CONFIG_SAFRA.pesoDoBot * (botsNoSorteio ? bots / botsNoSorteio : 1);
      const pesos = cand.map(c => (c.dono ? 1 + (c.base_nivel || 0) : pesoDoBot)
        * (!c.dono ? 1 : (safras[c.id] != null && safras[c.id] >= nova - CONFIG_SAFRA.meioPesoPor ? 0.5 : 1) * (jaGanhou.has(c.id) ? 0.5 : 1))); // o meio peso só vale para clube com dirigente
      let r = rng.n() * pesos.reduce((s, p) => s + p, 0), i = 0;
      while (i < cand.length - 1 && (r -= pesos[i]) >= 0) i++;
      const c = cand[i]; if (!c) break;
      if (c.dono) fora.add(c.id); // clube sem dirigente pode receber mais de um do mesmo nível: são poucos no sorteio
      jaGanhou.add(c.id);
      const meus = c.dono ? plano.novos.filter(x => x.clube_id === c.id && !raros.has(x)) : doBot(c);
      if (!meus.length) continue; // clube com dirigente sem jovem nesta virada: o raro não nasce
      const jovem = rng.pick(meus), jaNoClube = !plano.novos.includes(jovem), idade = jovem.idade + (jaNoClube ? 1 : 0);
      raros.add(jovem);
      if (!jaNoClube) jovem.tal = tal; // quem já estava no elenco tem o talento trocado pelo registro da safra (62_selecao_safra_e_devolucao.sql)
      plano.safra.push({ clube_id: c.id, temporada: nova, jogador: jovem.nome, pos: jovem.pos, idade, nivel, publico: !!c.dono, ...(jaNoClube ? { jogador_id: numero(jovem.id), tal } : {}) });
      resumo.safra.push({ clube: c.nome, dono: !!c.dono, nome: jovem.nome, pos: jovem.pos, idade, nivel });
    }
  } };
  sortearSafra(doBrasil.filter(c => grupoNovo[c.id] !== GUARDADO), CONFIG_SAFRA.niveis);
  for (const g of Object.keys(PAISES)) { const doPais = clubes.filter(c => c.grupo === g); if (doPais.length) sortearSafra(doPais, SAFRA_DE_FORA); }
  return { plano, resumo };
}

// Vagas continentais pela temporada anterior (admin.html, ao gerar o calendário). campanhas = historico da temporada (clube_id, grupo,
// posicao); campeao e vice = finalistas da Copa do Brasil (ou nulos). Só olha a posição no grupo "A", não o tamanho da Série A.
// Libertadores: 1º a 3º da A + campeão da copa (já entre os três: o 4º) e 1º a 3º de cada país.
// Sul-Americana: os 3 primeiros da A ainda sem vaga a partir do 4º + vice da copa (já classificado ou sem vice: o próximo da A sem vaga)
// e 4º a 6º de cada país. Devolve listas de ids; quem chama confere se estão completas.
export function vagasContinentais(campanhas, campeao, vice) {
  const tabelaA = campanhas.filter(x => x.grupo === "A").sort((a, b) => a.posicao - b.posicao).map(x => x.clube_id);
  const libBrasil = tabelaA.slice(0, 3);
  const quarta = campeao && !libBrasil.includes(campeao) ? campeao : tabelaA[3];
  if (quarta) libBrasil.push(quarta);
  const semVaga = tabelaA.slice(3).filter(id => !libBrasil.includes(id)), sulBrasil = semVaga.slice(0, 3);
  const ultima = vice && !libBrasil.includes(vice) && !sulBrasil.includes(vice) ? vice : semVaga[3];
  if (ultima) sulBrasil.push(ultima);
  const fora = (de, ate) => Object.keys(PAISES).flatMap(g => campanhas.filter(x => x.grupo === g && x.posicao >= de && x.posicao <= ate).map(x => x.clube_id));
  return { libBrasil, libFora: fora(1, 3), sulBrasil, sulFora: fora(4, 6) };
}
