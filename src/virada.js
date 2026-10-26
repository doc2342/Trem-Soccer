// Virada de temporada: monta o plano (classificação final, prêmios, envelhecimento, aposentadorias, jovens, renovações).
// Não depende do navegador nem do banco: recebe os dados e devolve o que deve ser gravado. Valores em milhares.
import { ATRIBUTOS, ATR_MIN, ATR_MAX, notaNaPosicao, notaBruta, talentoMinimo, PAISES, paisDoGrupo } from "./modelo.js";
import { jovensDaBase, CONFIG_BASE } from "./base.js";
import { limitar } from "./rng.js";
import { gerarJogador, TALENTO_COMUM, semAcento } from "./gerador.js";
import { salarioDeMercado, TETO_DE_FOLHA, PESO_DO_FORMADO } from "./economia.js";

// prêmio da liga e tabela final: moram em rodada.js, porque o servidor também usa (fecha a temporada sozinho)
import { PREMIOS, PREMIOS_DE_FORA, premioDaLiga, GUARDADO, classificacaoFinal } from "./rodada.js";
export { PREMIOS, premioDaLiga, GUARDADO };
export const chanceDeAposentar = idade => idade >= 40 ? 1 : idade < 35 ? 0 : (idade - 34) * 0.2; // 20% aos 35 … 80% aos 38
export const NOTA_DO_JOVEM = 22, CONTRATO_DO_JOVEM = 3;
export const REPOSICAO = { abaixoDoAposentado: 5 }; // o jovem que repõe o aposentado no bot chega até 5 pontos de nota abaixo dele
// jovem que repõe o aposentado nos clubes sem dirigente: chega mais pronto nas divisões de cima
export const NOTA_DO_JOVEM_POR_DIVISAO = { 1: 26, 2: 24 };
// Escada das divisões: o talento (teto) do jovem que o clube sem dirigente recebe é deslocado pela divisão de destino: média 66 / 50 / 38
// (o sorteio comum tem média 58). Sem isso o teto é igual em toda divisão e os elencos convergem; simulado em ferramentas/sim_escada.mjs:
// com a meia safra, onze mediano de 38,1 / 35,6 / 33,8 na liga madura (alvo 38 / 35 / 32).
export const TALENTO_DO_JOVEM_POR_DIVISAO = { 1: 8, 2: -22 }; // reinício: a chave 1 só vale para os bots da A na T0
// Outros países: campeonato de uma divisão só, sem acesso nem descenso, com régua própria, um pouco acima da Série A, para o campeão de
// cada país chegar à Libertadores com onze de 39 a 40. Simulado em ferramentas/sim_paises.mjs (10 clubes, 20 temporadas, 4 sementes): com jovem
// de nota 28 e talento +14, o campeão tem onze de ~38,5 nas primeiras temporadas e ~40,4 na liga madura, com folha de até ~23,9 mi.
// O teto (19 mi desde o reinício) é o mesmo do banco (teto_do_clube, 150_valores_do_reinicio.sql). O prêmio da liga é maior que o da Série A porque a folha é
// maior e TV, patrocínio e ingresso são os da Série A: sem ele o clube ficaria no vermelho e venderia jogador ao banco.
export const REGUA_DE_FORA = { nota: 28, talento: 0, teto: 19000, premios: PREMIOS_DE_FORA }; // reinício: talento 0 e teto 19 mi (150)
// Safra de cada país, sorteada à parte (não tira raro do Brasil): em média 0,08 de teto 43 e 0,15 de teto 42 por temporada, a mesma
// proporção do Brasil por clube.
export const SAFRA_DE_FORA = [{ nivel: 43, tal: 100, quantos: [[0, 0.92], [1, 0.08]] }, { nivel: 42, tal: 95, quantos: [[0, 0.85], [1, 0.15]] }]; // reinício: metade
// Crescimento na virada: era provisório (+1 a +3 em tudo até os 23 anos) e saiu quando o treino entrou (src/treino.js):
// agora o jogador evolui rodada a rodada, pelos focos. A queda física por idade continua aqui.
export const crescimento = () => 0;

const FISICOS = ATRIBUTOS.map((a, i) => a.grupo === "fis" ? i : -1).filter(i => i >= 0);
const DE_GOLEIRO = new Set(ATRIBUTOS.map((a, i) => a.grupo === "gol" ? i : -1).filter(i => i >= 0));
const numero = id => +String(id).replace(/^j/, "");

// playoffs de acesso: a montagem das fases mora em rodada.js, porque o servidor também usa (cria as fases sozinho)
import { DESCENSO_DA_PRIMEIRA, vencedorDoPlayoff, vencedorDoGrupo, proximaFaseDosPlayoffs } from "./rodada.js";
export { DESCENSO_DA_PRIMEIRA, vencedorDoPlayoff, proximaFaseDosPlayoffs };
// Pirâmide: Série A e Série B em grupos (B1 = "B", B2 = "C", B3 = "D"; se faltar vaga, B4 = "E"). Não existe terceira divisão.
// Clube GUARDADO fica no grupo "X" (rodada.js): sem partidas, fora de liga, copa, base e mercado; envelhece na virada e volta numa expansão.
export const GRUPOS_DA_B = ["B", "C", "D"];
// o guardado ("X") tem divisão 2 só porque a coluna não pode ficar vazia; é excluído pelo grupo (GUARDADO) em todo lugar
export const divisaoDoGrupo = g => PAISES[g] || g === "A" ? 1 : 2;
export const ehDaLiga = g => g !== GUARDADO && !PAISES[g];
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
// Reinício da liga (temporada 0): sorteia onde cada clube joga. Países ficam como estão; os donos do Brasil vão em rodízio para a B
// (até 24 donos: B, C e D; acima disso abre a "E"); os bots do Brasil, embaralhados: 12 para a A, os seguintes completam cada grupo da B até 8 e o resto fica guardado.
export function gruposDoReinicio({ rng, clubes }) {
  const destino = {}, doBrasil = clubes.filter(c => !PAISES[c.grupo]);
  clubes.filter(c => PAISES[c.grupo]).forEach(c => { destino[c.id] = c.grupo; });
  const donos = rng.embaralhar(doBrasil.filter(c => c.dono)), bots = rng.embaralhar(doBrasil.filter(c => !c.dono));
  const gruposB = donos.length > 3 * 8 ? [...GRUPOS_DA_B, "E"] : GRUPOS_DA_B, vagas = Object.fromEntries(gruposB.map(g => [g, 8]));
  if (donos.length > gruposB.length * 8) throw new Error(`Donos demais para a B: ${donos.length} (cabem ${gruposB.length * 8}).`);
  donos.forEach((c, i) => { const g = gruposB[i % gruposB.length]; destino[c.id] = g; vagas[g]--; });
  const faltam = 12 + Object.values(vagas).reduce((t, v) => t + v, 0) - bots.length;
  if (faltam > 0) throw new Error(`Faltam ${faltam} clubes guardados para a B4.`);
  bots.slice(0, 12).forEach(c => { destino[c.id] = "A"; });
  const resto = bots.slice(12);
  for (const g of gruposB) for (; vagas[g] > 0; vagas[g]--) destino[resto.shift().id] = g;
  resto.forEach(c => { destino[c.id] = GUARDADO; });
  return destino;
}
// Virada da temporada 0: sobem os donos ativos que chegaram às semifinais da B (no máximo 12). A vaga de bot ou de dono inativo passa ao dono ativo
// de melhor posição do mesmo grupo e, faltando, ao melhor dono ativo dos outros. Os bots da A que não ficam descem em serpentina pela classificação.
export function movimentosDoReinicio({ clubes, grupos, partidas, resultados, ativo }) {
  const porId = Object.fromEntries(clubes.map(c => [c.id, c])), gruposB = Object.keys(grupos).filter(g => g !== "A").sort();
  const linhas = gruposB.flatMap(g => grupos[g]);
  const semis = new Set(partidas.filter(p => p.fase === "semi").flatMap(p => [p.casa, p.fora]));
  const melhor = (a, b) => a.posicao - b.posicao || b.pontos - a.pontos, sobem = [], vagasDe = {};
  const livre = l => !sobem.includes(l) && ativo(porId[l.clube_id]);
  for (const g of gruposB) {
    const quem = grupos[g].filter(l => semis.has(l.clube_id) && livre(l));
    sobem.push(...quem);
    vagasDe[g] = grupos[g].filter(l => semis.has(l.clube_id)).length - quem.length;
  }
  let faltam = 0;
  for (const g of gruposB) {
    const entram = grupos[g].filter(l => !semis.has(l.clube_id) && livre(l)).sort(melhor).slice(0, vagasDe[g]);
    sobem.push(...entram); faltam += vagasDe[g] - entram.length;
  }
  if (faltam > 0) sobem.push(...linhas.filter(livre).sort(melhor).slice(0, faltam));
  const sobiram = sobem.sort(melhor).slice(0, 12), subiu = new Set(sobiram.map(l => l.clube_id));
  const destino = {}, lista = sobiram.map(l => ({ clube_id: l.clube_id, grupo: "A", divisao: 1, caiu: false }));
  const daA = [...(grupos.A || [])].sort(melhor), ficam = daA.slice(0, 12 - sobiram.length), saem = daA.slice(12 - sobiram.length);
  // vagas que cada grupo da B abriu; a serpentina (B C D D C B …) pula o grupo que já está completo
  const vagas = Object.fromEntries(gruposB.map(g => [g, grupos[g].filter(l => subiu.has(l.clube_id)).length]));
  const n = gruposB.length, serp = k => { const r = k % (2 * n); return gruposB[r < n ? r : 2 * n - 1 - r]; };
  let k = 0;
  for (const l of saem) {
    while (!vagas[serp(k)]) k++;
    const g = serp(k++); vagas[g]--;
    lista.push({ clube_id: l.clube_id, grupo: g, divisao: 2, caiu: true });
  }
  Object.values(grupos).flat().forEach(l => { destino[l.clube_id] = "ficou"; });
  if (grupos.A && grupos.A.length) destino[daA[0].clube_id] = "campeão";
  lista.forEach(x => { if (!(x.caiu && destino[x.clube_id] === "campeão")) destino[x.clube_id] = x.caiu ? "caiu" : "subiu"; });
  return { destino, lista };
}
const nomeCurto = g => ({ B: "Série B1", C: "Série B2", D: "Série B3", E: "Série B4" })[g] || "chave " + g;

// clubes: [{ id, nome, grupo, divisao, perfil }] · elencos: { clubeId: [jogador no formato do motor] } · talentos: { idDoJogador: 1 a 100 }
// comLivres: o mercado de jogadores livres já existe (SQL 21); sem ele, todo contrato vencido se renova sozinho.
// Safra: os talentos raros de cada temporada. A liga sorteia quantos nascem (desde o reinício, em média 0,2 de teto 43 e 0,65 de teto 42; antes, 0,75 e 1,5, metade do que era até a T9,
// quando a liga madura caminhava para ~22 jogadores com 43 e ~65 com 41,5 ou mais; com a metade, ~8 e ~32) e para que clubes vão.
// Cada clube tem um bilhete: peso 1 + nível da base (clube sem dirigente, 0,5); quem ganhou um raro nas últimas 3 temporadas (ou já ganhou nesta)
// concorre com metade do peso. No máximo um de cada nível por clube por temporada. O raro é um dos jovens que o clube já ia receber:
// clube sem dirigente que não repôs ninguém nesta virada fica fora do sorteio, para não aparecer um garoto a mais denunciando o raro.
export const CONFIG_SAFRA = {
  niveis: [{ nivel: 43, tal: 100, quantos: [[0, 0.8], [1, 0.2]] }, { nivel: 42, tal: 95, quantos: [[0, 0.5], [1, 0.35], [2, 0.15]] }], // reinício: média 0,2 e 0,65 por temporada
  pesoDoBot: 0.5, meioPesoPor: 3, idadeNoBot: 19,
};
export const ELENCO_MINIMO = 16, DIAS_DE_INATIVIDADE = 21;
export const ELENCO_MINIMO_DO_BOT = 18;
// safras: { clubeId: última temporada em que o clube recebeu um talento raro }
export function planejarVirada({ rng, liga, clubes, elencos, talentos, partidas, resultados, nomes, comLivres = false, agora = Date.now(), tetos = TETO_DE_FOLHA, safras = {}, juvenis = false, taticas = {}, semMovimentos = false }) {
  const nova = liga.temporada + 1;
  const plano = { temporada: liga.temporada, classificacao: [], jogadores: [], aposentados: [], novos: [], movimentos: [], livres: [] };
  const resumo = { grupos: {}, aposentados: [], novos: [], livres: [], renovadosDono: [], cresceram: 0, cairam: 0, renovados: 0, reajustados: 0 };
  const grupoNovo = {}; // grupo em que cada clube que sobe ou cai vai jogar

  plano.classificacao = classificacaoFinal(clubes, partidas, resultados);
  const doClube = Object.fromEntries(clubes.map(c => [c.id, c]));
  for (const l of plano.classificacao) (resumo.grupos[l.grupo] = resumo.grupos[l.grupo] || []).push({ ...l, nome: doClube[l.clube_id].nome, dono: !!doClube[l.clube_id].dono });

  // acesso e descenso (só quando há mais de uma divisão), só entre os clubes do Brasil: o campeonato de outro país não sobe nem cai ninguém
  const doBrasil = clubes.filter(c => !PAISES[c.grupo] && c.grupo !== GUARDADO);
  const ativo = c => !!c && !!c.dono && (!!c.extra || (!!c.ultimo_acesso && agora - new Date(c.ultimo_acesso).getTime() <= DIAS_DE_INATIVIDADE * 86400000));
  for (const [g, linhas] of Object.entries(resumo.grupos)) if (PAISES[g]) linhas.forEach(l => { l.destino = plano.classificacao.find(x => x.clube_id === l.clube_id).destino = l.posicao === 1 ? "campeão" : "ficou"; });
  // semMovimentos: temporada sem acesso e descenso (todo mundo fica na divisão e no grupo; playoffs não contam)
  if (semMovimentos) Object.values(resumo.grupos).flat().concat(plano.classificacao).forEach(l => { if (!PAISES[l.grupo]) l.destino = l.posicao === 1 && l.divisao === 1 ? "campeão" : "ficou"; });
  else if (new Set(doBrasil.map(c => c.divisao)).size > 1) {
    const grupos = Object.fromEntries(Object.entries(resumo.grupos).filter(([g]) => !PAISES[g]));
    const m = liga.temporada === 0 ? movimentosDoReinicio({ clubes: doBrasil, grupos, partidas, resultados, ativo }) : movimentos({ rng, clubes: doBrasil, grupos, partidas, resultados });
    plano.movimentos = m.lista;
    m.lista.forEach(x => { grupoNovo[x.clube_id] = x.grupo; });
    const para = Object.fromEntries(m.lista.map(x => [x.clube_id, x.grupo]));
    plano.classificacao.forEach(l => { if (!PAISES[l.grupo]) l.destino = m.destino[l.clube_id]; });
    Object.values(resumo.grupos).flat().forEach(l => { if (!PAISES[l.grupo]) { l.destino = m.destino[l.clube_id]; l.para = para[l.clube_id] || null; } });
  }

  // camisas já usadas em cada clube (sem acento): o jovem novo não repete a de ninguém do elenco
  const usados = {}, usadosDe = id => usados[id] || (usados[id] = new Set((elencos[id] || []).map(j => semAcento(j.nome))));
  // jovem que o clube sem dirigente recebe (no lugar de um aposentado, ou quando a safra cai nele)
  // notaDeQuemSai: nota do aposentado que ele substitui; o jovem chega até 5 pontos abaixo dela (e nunca abaixo do piso da divisão),
  // para a liga não perder nível de uma vez quando a geração mais velha se aposenta
  const jovemDoBot = (c, pos, notaDeQuemSai = 0) => {
    const g = grupoNovo[c.id], div = g ? divisaoDoGrupo(g) : c.divisao, fora = !!PAISES[c.grupo]; // pela divisão em que o clube vai jogar
    const piso = fora ? REGUA_DE_FORA.nota : NOTA_DO_JOVEM_POR_DIVISAO[div] || NOTA_DO_JOVEM;
    const alvo = Math.max(piso, notaDeQuemSai - REPOSICAO.abaixoDoAposentado), pronto = alvo > piso; // reposição mais forte chega um pouco mais velha
    const jovem = gerarJogador(rng, { id: null, pos, alvo: limitar(alvo + rng.normal(0, 1.5), alvo - 4, alvo + 4), idade: pronto ? rng.int(19, 22) : rng.int(17, 19), pais: paisDoGrupo(c.grupo), perfil: c.perfil, nomes, usados: usadosDe(c.id) });
    jovem.tal = limitar(jovem.tal + (fora ? REGUA_DE_FORA.talento : TALENTO_DO_JOVEM_POR_DIVISAO[div] || 0), 1, TALENTO_COMUM);
    // o teto nunca fica abaixo da nota com que ele chega: a reposição de um craque nascia com nota 43 e teto 31 (106_teto_acima_da_nota.sql)
    jovem.tal = Math.max(jovem.tal, talentoMinimo(jovem)); // depois do deslocamento da divisão, que pode baixar o talento de novo
    const mercado = salarioDeMercado(jovem);
    const novo = { clube_id: c.id, nome: jovem.nome, nome_completo: jovem.nome_completo, pais: jovem.pais, idade: jovem.idade, pos: jovem.pos, fam: jovem.fam, at: jovem.at, tal: jovem.tal,
      salario: mercado, salario_mercado: mercado, contrato_ate: nova + CONTRATO_DO_JOVEM - 1, protegido_ate: juvenis ? nova + CONFIG_BASE.idadeDeJuvenil - jovem.idade : nova };
    plano.novos.push(novo);
    resumo.novos.push({ clube: c.nome, dono: !!c.dono, nome: jovem.nome, pos: jovem.pos, idade: jovem.idade });
    return novo;
  };
  for (const c of clubes) {
   const vencidos = [], regs = [], renovadosAqui = []; let ficam = 0;
   // promoção da base: nos clubes com dirigente, os jovens vêm conforme o nível da base (e o aposentado não é reposto, mais abaixo)
   if (c.dono) for (const jovem of jovensDaBase(rng, { nivel: c.base_nivel || 0, momento: "promocao", perfil: c.perfil, nomes, usados: usadosDe(c.id), temporada: nova, juvenis, usa: taticas[c.id] || [],
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
    // formado no clube conta 85% no teto, como no banco (folha_no_teto, 87_formado_no_teto.sql)
    const formados = new Set((elencos[c.id] || []).filter(j => j.formador != null && String(j.formador) === String(c.id)).map(j => numero(j.id)));
    const pesa = r => (r.salario || 0) * (formados.has(r.id) ? PESO_DO_FORMADO : 1);
    let folha = regs.reduce((s, r) => s + pesa(r), 0) + plano.novos.filter(n => n.clube_id === c.id).reduce((s, n) => s + (n.salario || 0), 0);
    for (const v of renovadosAqui.sort((a, b) => b.reg.salario - a.reg.salario)) {
      if (folha <= teto || ficam <= (cuida ? ELENCO_MINIMO : ELENCO_MINIMO_DO_BOT)) break;
      folha -= pesa(v.reg); ficam--; resumo.renovados--;
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
