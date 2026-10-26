// Simulador da liga inteira, para a calibragem do reinício (plano 2026-10-23, Tarefas 3 e 4).
// Parte do estado do reinício (temporada 0: A com 12 bots; B, C e D com 6 donos e 2 bots; 4 países de 10) e roda temporada a temporada com os
// módulos reais: treino (treinar, fatorDaTemporada), virada (planejarVirada: envelhecimento, aposentadoria, base, reposição dos bots, safra,
// acesso e descenso, inclusive a regra da T0), gerador e economia. O que fica simplificado está marcado com "ponytail:".
// Uso: node ferramentas/sim_liga.mjs . [temporadas=10] [sementes=5] [CHAVE.caminho=valor …]
//   CHAVE é um dos objetos de AJUSTAVEIS (CONFIG_TREINO.pontosPorSessao=160, TETO_DE_FOLHA.1=22000, NIVEL.A=32, CONFIG_BASE.nota.0=16);
//   chave sem objeto vai para SIM (CURVA_DO_SALARIO=1.14, sigma=4).
// Partida: força do onze do mandante − a do visitante + SIM.casa + normal(0, SIM.sigma); |v| < SIM.empate é empate.
// σ = 5, empate = 1,5 e mando = 1,0 ajustados aos 660 jogos de liga da T14 real (A, grupos da B e países; força do onze no fim da temporada):
// a fórmula dá favorito 46%, empate 23% e mandante 45%; o real foi 45,9%, 22,7% e 45,9%. O σ de 1,2 do sim_escada ordenava a temporada inteira, não um jogo.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { criarRng } from "../src/rng.js";
import { notaBruta, melhorPosicao, talentoMinimo, PAISES } from "../src/modelo.js";
import { gerarElenco, gerarJogador, TALENTO_COMUM, PERFIS } from "../src/gerador.js";
import { jovensDaBase, CONFIG_BASE } from "../src/base.js";
import { CONFIG_TREINO, treinar, ctDoClube, fatorDaTemporada } from "../src/treino.js";
import { gerarTabela, classificacaoFinal, PREMIOS, PREMIOS_DE_FORA } from "../src/rodada.js";
import { planejarVirada, divisaoDoGrupo, forcaDoOnze, GRUPOS_DA_B, CONFIG_SAFRA, SAFRA_DE_FORA, NOTA_DO_JOVEM_POR_DIVISAO,
  TALENTO_DO_JOVEM_POR_DIVISAO, REGUA_DE_FORA, ELENCO_MINIMO_DO_BOT } from "../src/virada.js";
import { salarioDeMercado, TETO_DE_FOLHA, MAXIMO_INDIVIDUAL, MANUTENCAO, lugaresDoEstadio, comidaPorTorcedor, custoDeOperacao,
  manutencaoExtraDoEstadio, impostoDoLucro, valorNoAgente, VENDAS_PELO_AGENTE, MULTIPLO_DA_CLAUSULA } from "../src/economia.js";

const nomes = JSON.parse(readFileSync(new URL("../dados/nomes.json", import.meta.url)));
// nível dos elencos gerados no reinício, por série (o botão do ritmo de 4 a 5 temporadas até a liga madura)
export const NIVEL = { A: 30, B: 30, fora: 30 };
// deslocamento do talento dos elencos gerados no reinício, por série (proposta para o admin.html, como o TALENTO_DO_JOVEM_POR_DIVISAO dos jovens):
// nas primeiras temporadas a liga é feita desses jogadores, e o teto deles (talento médio 48 nos adultos) é o que segura o nível da B
export const TALENTO_DO_REINICIO = { A: 0, B: 0, fora: 0 };
// deslocamento do talento dos jovens da base dos donos (proposta, não existe no jogo: hoje o talento da base é o sorteio comum, média 58); o raro da safra não muda
export const BASE = { talento: 0 };
// tabela divisoes do banco (lida pelo MCP em 25/10/2026); o teto de folha é o TETO_DE_FOLHA de economia.js. Países usam a divisão 1.
export const DIVISOES = { 1: { tv: 6500, patrocinio: 5200, ingresso: 25, torcida: 20000 }, 2: { tv: 6400, patrocinio: 4500, ingresso: 24, torcida: 14000 } };
export const SIM = {
  sigma: 5, empate: 1.5, casa: 1.0,
  CURVA_DO_SALARIO: 1.12,      // salário × (k / 1,12)^(nota − 41): a nota 41 custa o mesmo de hoje
  CT_DO_DONO: 4, BASE_DO_DONO: 4, ESTADIO_DO_DONO: 6, NIVEIS_POR_TEMPORADA: 2, // até onde o dono leva cada estrutura (2 níveis de CT e base por temporada)
  RESERVA: 0.25,               // o dono não gasta abaixo de 25% do teto em caixa
  ELENCO: 22,                  // adultos que o dono mantém
  COMPRAS: 4, GANHO_PELA_MULTA: 1.5, // compras de bot pela multa por temporada e o ganho mínimo de nota sobre o pior adulto para pagar a multa
  COTACAO_DO_AGENTE: 0.5,      // o dono vende ao agente quem dispensa (até VENDAS_PELO_AGENTE), pago com o caixa dos bots
  TREINADORES: 1.08, CUSTO_TREINADORES: 1400, // multiplicador do treino e custo por temporada da comissão do dono (T13: 1,4 mi na A)
  JOGOS_DA_BASE: 14,           // jogos da liga de base por temporada (cada um vale CONFIG_LIGA_DE_BASE.bonusDeTreino de sessão aos juvenis)
  BONUS_DA_BASE: 0.2,
  COPA: { 1: 1600, 2: 740, fora: 50 }, JOGOS_EXTRA_EM_CASA: 1, // copa e continentais por temporada (média da T13) e jogos a mais em casa
  PRESTIGIO: [0.04, 1.4],      // a torcida do dono cresce 4% por temporada, até 1,4 vez a da divisão (a A da T14 tem 1,39)
  CAIXA_INICIAL: 5000,
  // correções do caixa, só para medir (desligadas; nenhuma está no jogo): fator sobre TV e patrocínio (de todos, ou só dos clubes sem dono)
  // e imposto anual sobre o caixa acima do teto de folha
  RECEITA: 1, RECEITA_DO_BOT: 1, IMPOSTO_DO_CAIXA: 0,
};
export const AJUSTAVEIS = { CONFIG_TREINO, CONFIG_BASE, CONFIG_SAFRA, SAFRA_DE_FORA, NOTA_DO_JOVEM_POR_DIVISAO, TALENTO_DO_JOVEM_POR_DIVISAO,
  REGUA_DE_FORA, PREMIOS, PREMIOS_DE_FORA, TETO_DE_FOLHA, DIVISOES, NIVEL, TALENTO_DO_REINICIO, BASE, SIM };

// aplica { "OBJ.a.b": valor } e devolve a função que desfaz
export function aplicar(ajustes = {}) {
  const antes = [];
  for (const [chave, valor] of Object.entries(ajustes)) {
    const ks = chave.split("."), raiz = AJUSTAVEIS[ks[0]] ? ks.shift() : "SIM";
    const o = ks.slice(0, -1).reduce((o, k) => { if (o[k] == null) throw new Error("Chave desconhecida: " + chave); return o[k]; }, AJUSTAVEIS[raiz]);
    if (!(ks.at(-1) in o)) throw new Error("Chave desconhecida: " + chave);
    antes.push([o, ks.at(-1), o[ks.at(-1)]]); o[ks.at(-1)] = +valor;
  }
  return () => antes.reverse().forEach(([o, k, v]) => { o[k] = v; });
}

const nota = j => notaBruta(j.at, j.pos);
const med = v => { const s = [...v].sort((a, b) => a - b); return s.length ? (s[(s.length - 1) >> 1] + s[s.length >> 1]) / 2 : NaN; };
const media = v => v.length ? v.reduce((s, x) => s + x, 0) / v.length : NaN;
const serie = g => PAISES[g] ? "fora" : g === "A" ? "A" : "B";
const CUSTO_ESTRUTURA = [250, 500, 1000, 2000, 4000], CUSTO_ESTADIO = [0, 0, 1500, 3000, 5000, 8000, 12000, 20000, 30000]; // custo_da_obra (55)
const daBase = j => j.tal > TALENTO_COMUM ? j : { ...j, tal: Math.max(talentoMinimo(j), Math.min(TALENTO_COMUM, Math.max(1, j.tal + BASE.talento))) };
export const salario = j => Math.max(50, Math.round(salarioDeMercado(j) * Math.pow(SIM.CURVA_DO_SALARIO / 1.12, melhorPosicao(j).nota - 41)));

export function simular({ semente = 1, temporadas = 10, ajustes = {} } = {}) {
  const desfaz = aplicar(ajustes);
  try { return rodar(semente, temporadas); } finally { desfaz(); }
}

function rodar(semente, temporadas) {
  const rng = criarRng(semente), usados = new Set();
  let seq = 0;
  const novoId = () => "j" + (++seq);
  const clubes = [], elencos = {}, talentos = {}, safras = {}, subiuEm = {};
  const tetoDe = c => PAISES[c.grupo] ? REGUA_DE_FORA.teto : TETO_DE_FOLHA[c.divisao];
  const registrar = (c, j, extra = {}) => { const x = { ...j, id: novoId(), pts: null, treino: null, contratoAte: 999, desde: extra.desde ?? null, ...extra };
    talentos[+x.id.slice(1)] = x.tal; if (!x.juvenil) x.salario = salario(x); (elencos[c.id] ||= []).push(x); return x; };
  const novoClube = (grupo, dono) => { const c = { id: clubes.length + 1, nome: "C" + (clubes.length + 1), grupo, divisao: divisaoDoGrupo(grupo), perfil: rng.pick(Object.keys(PERFIS)),
    dono: dono ? "d" : null, extra: dono, base_nivel: 0, ct_nivel: 0, estadio: 1, gastoEstrut: 0, gastoEstadio: 0, caixa: SIM.CAIXA_INICIAL, prestigio: 1 };
    clubes.push(c); elencos[c.id] = [];
    const nivel = NIVEL[serie(grupo)], pais = PAISES[grupo] || "Brasil";
    for (const j of gerarElenco(rng, { nivel, perfil: c.perfil, pais, nomes }))
      registrar(c, { ...j, tal: Math.max(talentoMinimo(j), Math.min(100, Math.max(1, j.tal + TALENTO_DO_REINICIO[serie(grupo)]))) });
    return c; };
  for (let k = 0; k < 12; k++) novoClube("A", false);
  for (const g of GRUPOS_DA_B) { for (let k = 0; k < 6; k++) novoClube(g, true); novoClube(g, false); novoClube(g, false); }
  for (const g of Object.keys(PAISES)) for (let k = 0; k < 10; k++) novoClube(g, false);
  const livres = [], saida = [];
  const adultos = c => elencos[c.id].filter(j => !j.juvenil);

  for (let t = 0; t <= temporadas; t++) {
    // ---------- temporada: liga, treino e peneira ----------
    const grupos = {};
    for (const c of clubes) (grupos[c.grupo] ||= []).push(c);
    const partidas = [], resultados = [], porId = Object.fromEntries(clubes.map(c => [c.id, c]));
    let favorito = 0, empates = 0, jogosA = 0, difA = 0;
    const jogar = (casa, fora, grupo, rodada, fase) => {
      const fc = forcaDoOnze(adultos(porId[casa])), ff = forcaDoOnze(adultos(porId[fora])), v = fc - ff + SIM.casa + rng.normal(0, SIM.sigma);
      const gols = Math.abs(v) < SIM.empate ? [rng.int(0, 2), 0] : [1 + Math.floor((Math.abs(v) - SIM.empate) / 1.5), rng.int(0, 1)];
      const r = Math.abs(v) < SIM.empate ? { gols_casa: gols[0], gols_fora: gols[0] } : v > 0 ? { gols_casa: gols[0] + gols[1], gols_fora: gols[1] } : { gols_casa: gols[1], gols_fora: gols[0] + gols[1] };
      const p = { id: partidas.length + 1, grupo, rodada, fase, casa, fora };
      partidas.push(p); resultados.push({ partida_id: p.id, ...r });
      if (grupo === "A" && fase === "liga") { jogosA++; difA += Math.abs(fc - ff); if (r.gols_casa === r.gols_fora) empates++; else if ((r.gols_casa > r.gols_fora) === (fc > ff)) favorito++; }
      return r;
    };
    const tabelas = Object.fromEntries(Object.entries(grupos).map(([g, cs]) => [g, gerarTabela(rng.embaralhar(cs.map(c => c.id)))]));
    const maxRodadas = Math.max(...Object.values(tabelas).map(tb => tb.at(-1).rodada));
    for (let rodada = 1; rodada <= maxRodadas; rodada++) {
      for (const [g, tb] of Object.entries(tabelas)) {
        const doDia = tb.filter(x => x.rodada === rodada); if (!doDia.length) continue;
        doDia.forEach(x => jogar(x.casa, x.fora, g, rodada, "liga"));
        const fator = fatorDaTemporada(tb.at(-1).rodada);
        for (const c of grupos[g]) {
          const el = elencos[c.id], jogam = new Set(adultos(c).sort((a, b) => nota(b) - nota(a)).slice(0, 14));
          const mult = c.dono ? SIM.TREINADORES : 1, areas = { gol: mult, def: mult, mei: mult, ata: mult, fis: mult, tat: mult };
          for (const j of el) { const r = treinar(j, { tal: j.tal, ct: ctDoClube(c), jogou: jogam.has(j), areas, fator }); if (r) { j.at = r.at; j.pts = r.pts; } }
        }
      }
      // peneira dos donos (juvenis do meio da temporada)
      if (rodada === CONFIG_BASE.rodadaDaPeneira) for (const c of clubes.filter(c => c.dono))
        for (const j of jovensDaBase(rng, { nivel: c.base_nivel, momento: "peneira", perfil: c.perfil, nomes, usados, temporada: t, juvenis: true })) registrar(c, daBase(j), { desde: t, formador: c.id });
    }
    // liga de base: os juvenis dos donos ganham uma fração de sessão por jogo
    for (const c of clubes.filter(c => c.dono)) for (const j of elencos[c.id].filter(j => j.juvenil || j.idade <= 21))
      for (let k = 0; k < SIM.JOGOS_DA_BASE; k++) { const r = treinar(j, { tal: j.tal, ct: ctDoClube(c), areas: null, fator: SIM.BONUS_DA_BASE }); if (r) { j.at = r.at; j.pts = r.pts; } }
    // playoff de cada grupo da B: 3º x 6º e 4º x 5º em jogo único; semifinal e final em ida e volta (empate: melhor campanha)
    const tabelaFinal = classificacaoFinal(clubes, partidas, resultados);
    const posDe = Object.fromEntries(tabelaFinal.map(l => [l.clube_id, l]));
    let R = maxRodadas;
    const confronto = (melhor, pior, g, fase, idaEVolta) => {
      let a = 0, b = 0;
      if (idaEVolta) { const r = jogar(pior, melhor, g, ++R, fase); a += r.gols_fora; b += r.gols_casa; }
      const r = jogar(melhor, pior, g, ++R, fase); a += r.gols_casa; b += r.gols_fora;
      return b > a ? pior : melhor;
    };
    for (const g of Object.keys(grupos).filter(g => serie(g) === "B")) {
      const ord = tabelaFinal.filter(l => l.grupo === g).map(l => l.clube_id), r0 = R;
      const w36 = confronto(ord[2], ord[5], g, "preliminar", false), w45 = confronto(ord[3], ord[4], g, "preliminar", false);
      const melhorDe = (x, y) => posDe[x].posicao < posDe[y].posicao ? [x, y] : [y, x];
      const s1 = confronto(...melhorDe(ord[0], w45), g, "semi", true), s2 = confronto(...melhorDe(ord[1], w36), g, "semi", true);
      confronto(...melhorDe(s1, s2), g, "final", true);
      R = r0;
    }

    // ---------- economia da temporada ----------
    for (const c of clubes) {
      const fora = !!PAISES[c.grupo], d = DIVISOES[fora ? 1 : c.divisao], l = posDe[c.id], n = grupos[c.grupo].length;
      const torcida = d.torcida * c.prestigio, publico = Math.min(torcida, lugaresDoEstadio(c.estadio));
      const bilheteria = publico * (d.ingresso + comidaPorTorcedor(c.estadio) - custoDeOperacao(c.estadio)) * (n - 1 + SIM.JOGOS_EXTRA_EM_CASA) / 1000;
      const premio = l.premio, copa = SIM.COPA[fora ? "fora" : c.divisao];
      const folha = adultos(c).reduce((s, j) => s + j.salario, 0);
      const manut = MANUTENCAO.estruturas * c.gastoEstrut + MANUTENCAO.estadio * c.gastoEstadio + manutencaoExtraDoEstadio(c.estadio);
      const lucro = SIM.RECEITA * (c.dono ? 1 : SIM.RECEITA_DO_BOT) * (d.tv + d.patrocinio) + bilheteria + premio + copa - folha - manut - (c.dono ? SIM.CUSTO_TREINADORES : 0);
      c.caixa += lucro - (lucro > 0 ? impostoDoLucro(lucro, tetoDe(c)) : 0);
      c.caixa -= SIM.IMPOSTO_DO_CAIXA * Math.max(0, c.caixa - tetoDe(c));
      c.folha = folha;
    }

    // ---------- medidas (fim da temporada, antes da virada) ----------
    const medidas = {};
    for (const s of ["A", "B", "fora"]) {
      const cs = clubes.filter(c => serie(c.grupo) === s), ord = cs.map(c => adultos(c).map(nota).sort((a, b) => b - a));
      medidas[s] = {
        onze: med(cs.map(c => forcaDoOnze(adultos(c)))), r12_16: med(ord.map(o => media(o.slice(11, 16)))), r17_22: med(ord.map(o => media(o.slice(16, 22)))),
        elenco: med(cs.map(c => adultos(c).length)), juvenis: med(cs.map(c => elencos[c.id].length - adultos(c).length)),
        n42: cs.flatMap(c => adultos(c)).filter(j => nota(j) >= 42).length, folhaTeto: med(cs.map(c => c.folha / tetoDe(c))),
        caixa: med(cs.map(c => c.caixa)), caixaMax: Math.max(...cs.map(c => c.caixa)), donos: cs.filter(c => c.dono).length,
        caixaDono: med(cs.filter(c => c.dono).map(c => c.caixa)), caixaBot: med(cs.filter(c => !c.dono).map(c => c.caixa)),
      };
    }
    const ptsA = tabelaFinal.filter(l => l.grupo === "A").map(l => l.pontos);
    medidas.A.dif12 = ptsA[0] - ptsA[1]; medidas.A.favorito = favorito / jogosA; medidas.A.empates = empates / jogosA; medidas.A.dif = difA / jogosA;
    const posA = k => media(tabelaFinal.filter(l => l.grupo === "A" && subiuEm[l.clube_id] === t - k).map(l => l.posicao));
    medidas.subiu = { T1: posA(0), T2: posA(1) };
    // jovens acompanhados (entraram na liga com até 19 anos depois do reinício): nota por idade e talento
    medidas.jovens = clubes.flatMap(c => elencos[c.id].filter(j => j.desde != null).map(j => ({ idade: j.idade, nota: +nota(j).toFixed(2), tal: j.tal, dono: !!c.dono, s: serie(c.grupo) })));
    saida.push({ t, medidas });
    if (t === temporadas) break;

    // ---------- virada ----------
    const { plano } = planejarVirada({ rng, liga: { temporada: t }, clubes, elencos, talentos, partidas, resultados, nomes, comLivres: true, juvenis: true, tetos: TETO_DE_FOLHA, safras });
    const sai = new Set(plano.aposentados), soltos = new Set(plano.livres.map(x => x.id)), regs = Object.fromEntries(plano.jogadores.map(r => [r.id, r]));
    for (const c of clubes) {
      const fica = [];
      for (const j of elencos[c.id]) {
        const n = +j.id.slice(1);
        if (sai.has(n)) continue;
        const r = regs[n]; if (r) { j.idade = r.idade; j.at = r.at; }
        if (soltos.has(n)) { j.juvenil = false; livres.push(j); continue; }
        fica.push(j);
      }
      elencos[c.id] = fica;
    }
    for (const s of plano.safra) if (s.jogador_id != null) { talentos[s.jogador_id] = s.tal; for (const c of clubes) { const j = elencos[c.id].find(x => +x.id.slice(1) === s.jogador_id); if (j) j.tal = s.tal; } }
    for (const s of plano.safra) if (porId[s.clube_id].dono) safras[s.clube_id] = s.temporada;
    for (const nv of plano.novos) registrar(porId[nv.clube_id], porId[nv.clube_id].dono ? daBase(nv) : nv, { desde: nv.idade <= 19 ? t + 1 : null, formador: nv.clube_id });
    for (const m of plano.movimentos) { const c = porId[m.clube_id]; c.grupo = m.grupo; c.divisao = m.divisao; if (!m.caiu) subiuEm[c.id] = t + 1; }
    // o salário só sobe: a renovação é pelo maior entre o atual e o de mercado (99_renovacao_automatica.sql), e o bot reajusta quem ganha abaixo dele
    for (const c of clubes) { for (const j of elencos[c.id]) if (!j.juvenil) j.salario = Math.max(j.salario || 0, salario(j)); if (c.dono) c.prestigio = Math.min(SIM.PRESTIGIO[1], c.prestigio + SIM.PRESTIGIO[0]); }

    // ---------- entressafra: obras, mercado dos donos e reposição dos bots ----------
    let pagoPeloAgente = 0;
    for (const c of rng.embaralhar(clubes.filter(c => c.dono))) {
      const teto = tetoDe(c), reserva = SIM.RESERVA * teto;
      // obras: CT, base e estádio, nessa ordem, enquanto sobra caixa acima da reserva
      for (const [k, ate] of [["ct_nivel", SIM.CT_DO_DONO], ["base_nivel", SIM.BASE_DO_DONO]])
        for (let n = 0; n < SIM.NIVEIS_POR_TEMPORADA && c[k] < ate && c.caixa - CUSTO_ESTRUTURA[c[k]] >= reserva; n++) { c.caixa -= CUSTO_ESTRUTURA[c[k]]; c.gastoEstrut += CUSTO_ESTRUTURA[c[k]]; c[k]++; }
      if (c.estadio < SIM.ESTADIO_DO_DONO && c.caixa - CUSTO_ESTADIO[c.estadio + 1] >= reserva) { c.caixa -= CUSTO_ESTADIO[c.estadio + 1]; c.gastoEstadio += CUSTO_ESTADIO[c.estadio + 1]; c.estadio++; }
      // ponytail: dono de regra fixa (profissionaliza, dispensa e contrata pela nota); compra de bot pela multa e livres, sem negociação entre donos
      const el = elencos[c.id], folha = () => el.filter(j => !j.juvenil).reduce((s, j) => s + j.salario, 0);
      const piores = () => el.filter(j => !j.juvenil).sort((a, b) => nota(a) - nota(b));
      let vendas = 0;
      const dispensar = j => { el.splice(el.indexOf(j), 1); livres.push(j);
        if (vendas < VENDAS_PELO_AGENTE) { const v = valorNoAgente(salarioDeMercado(j), false, SIM.COTACAO_DO_AGENTE, vendas); c.caixa += v; pagoPeloAgente += v; vendas++; } };
      for (const j of el.filter(j => j.juvenil).sort((a, b) => nota(b) - nota(a))) {
        const ad = piores(), s = salario(j);
        if ((ad.length < SIM.ELENCO || nota(j) > nota(ad[0])) && folha() + s - (ad.length >= SIM.ELENCO ? ad[0].salario : 0) <= teto) {
          if (ad.length >= SIM.ELENCO) dispensar(ad[0]);
          j.juvenil = false; j.salario = s;
        }
      }
      while (piores().length > SIM.ELENCO || (folha() > teto && piores().length > 16)) dispensar(piores()[0]);
      // reforços: livres (sem custo) e jogadores de bot pela multa (até SIM.COMPRAS; o bot fica com pelo menos 19), o dinheiro vai para o bot
      const ofertas = [...livres.filter(j => j.idade <= 31).map(j => ({ j, de: null })),
        ...clubes.filter(b => !b.dono).flatMap(b => adultos(b).filter(j => j.idade >= 22 && j.idade <= 31).map(j => ({ j, de: b })))]
        .map(o => ({ ...o, s: Math.max(o.j.salario || 0, salario(o.j)), n: nota(o.j) })).sort((a, b) => b.n - a.n);
      let compras = 0;
      for (const o of ofertas) {
        if (o.de && (compras >= SIM.COMPRAS || adultos(o.de).length <= 19 || !elencos[o.de.id].includes(o.j))) continue;
        if (!o.de && !livres.includes(o.j)) continue;
        const ad = piores(), troca = ad.length >= SIM.ELENCO ? ad[0] : null, preco = o.de ? MULTIPLO_DA_CLAUSULA * o.s : 0;
        if (troca && o.n < nota(troca) + (o.de ? SIM.GANHO_PELA_MULTA : 1)) continue;
        if (o.s > MAXIMO_INDIVIDUAL * teto || folha() + o.s - (troca ? troca.salario : 0) > teto || c.caixa - preco < reserva) continue;
        if (troca) dispensar(troca);
        c.caixa -= preco; o.j.salario = o.s;
        if (o.de) { const eb = elencos[o.de.id]; eb.splice(eb.indexOf(o.j), 1); o.de.caixa += preco; compras++; }
        else livres.splice(livres.indexOf(o.j), 1);
        el.push(o.j);
      }
    }
    // o agente paga com o caixa dos bots
    const bots = clubes.filter(c => !c.dono);
    for (const c of bots) c.caixa -= pagoPeloAgente / bots.length;
    // ponytail: o bot só repõe o elenco até o mínimo (sem negociosEntreBots); primeiro o melhor livre, depois um jovem do piso da divisão
    for (const c of bots) while (adultos(c).length < ELENCO_MINIMO_DO_BOT) {
      const livre = livres.filter(j => j.idade <= 31).sort((a, b) => nota(b) - nota(a))[0];
      if (livre) { livres.splice(livres.indexOf(livre), 1); livre.salario = Math.max(livre.salario || 0, salario(livre)); elencos[c.id].push(livre); continue; }
      const piso = PAISES[c.grupo] ? REGUA_DE_FORA.nota : NOTA_DO_JOVEM_POR_DIVISAO[c.divisao];
      registrar(c, gerarJogador(rng, { id: null, pos: rng.pick(POS_DOS_REFORCOS), alvo: piso, idade: rng.int(19, 22), pais: PAISES[c.grupo] || "Brasil", nomes, usados }));
    }
    // livres envelhecem e somem depois de uma temporada sem clube
    livres.splice(0, livres.length, ...livres.filter(j => !j.livreDesde).map(j => (j.livreDesde = t + 1, j)));
  }
  return saida;
}
const POS_DOS_REFORCOS = ["GK", "DC", "DC", "DR", "DL", "DMC", "MC", "MC", "MR", "ML", "AMC", "RW", "LW", "FC", "SC"]; // posições sorteadas para os reforços e a reposição dos bots

// ---------- linha de comando ----------
const f = (x, d = 1) => x == null || Number.isNaN(x) ? "—" : x.toFixed(d);
const mi = x => f(x / 1000, 1);
export function resumo(rodadas) { // média das sementes, temporada a temporada
  return rodadas[0].map((_, t) => {
    const em = fn => media(rodadas.map(r => fn(r[t].medidas)).filter(x => !Number.isNaN(x)));
    const m = { t };
    for (const s of ["A", "B", "fora"]) m[s] = Object.fromEntries(Object.keys(rodadas[0][t].medidas[s]).map(k => [k, em(x => x[s][k])]));
    m.subiu = { T1: em(x => x.subiu.T1), T2: em(x => x.subiu.T2) };
    return m;
  });
}
// idade mediana em que os jovens passam de cada nota, e a curva de nota por idade, por faixa de talento (das temporadas de..ate)
export const chegada = (curva, n) => { const i = Object.keys(curva).map(Number).sort((a, b) => a - b).find(i => curva[i] >= n); if (i == null) return NaN;
  const ant = curva[i - 1]; return ant == null ? i : i - 1 + (n - ant) / (curva[i] - ant); }; // idade (interpolada) em que a mediana passa de n
export function curvas(rodadas, de, ate) {
  const pontos = rodadas.flatMap(r => r.filter(x => x.t >= de && x.t <= ate).flatMap(x => x.medidas.jovens));
  // "comum" de Série A: teto 35 a 38 (talento 60 a 75); abaixo de 60 o teto nem chega a reserva da A (35)
  const faixas = { "comum (60–75)": j => j.tal >= 60 && j.tal <= 75, "bom (76–89)": j => j.tal > 75 && j.tal < 90, "alto (≥ 90)": j => j.tal >= 90 };
  return Object.fromEntries(Object.entries(faixas).map(([nome, fx]) => {
    const idades = {};
    for (const j of pontos.filter(fx)) (idades[j.idade] ||= []).push(j.nota);
    return [nome, Object.fromEntries(Object.entries(idades).filter(([i, v]) => i <= 30 && v.length >= 5).map(([i, v]) => [i, med(v)]))];
  }));
}
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const args = process.argv.slice(3), num = args.filter(a => !a.includes("=")).map(Number);
  const opc = Object.fromEntries(args.filter(a => a.includes("=")).map(a => a.split("=")));
  const temporadas = num[0] ?? 10, sementes = +(opc.sementes ?? 5); delete opc.sementes;
  const rodadas = Array.from({ length: sementes }, (_, k) => simular({ semente: 11 + 17 * k, temporadas, ajustes: opc }));
  console.log(`${sementes} sementes, T0–T${temporadas}${Object.keys(opc).length ? " · " + Object.entries(opc).map(([k, v]) => k + "=" + v).join(" ") : ""}`);
  console.log("T  | série: onze r12–16 r17–22 elenco/juv ≥42 folha/teto caixa(med/máx, mi) | A: 1º−2º fav emp | subiu: pos na A T1/T2");
  for (const m of resumo(rodadas)) {
    const s = k => { const x = m[k]; return `${k.padEnd(4)} ${f(x.onze)} ${f(x.r12_16)} ${f(x.r17_22)} ${f(x.elenco, 0)}/${f(x.juvenis, 0)} ${f(x.n42, 0).padStart(2)} ${f(x.folhaTeto, 2)} ${mi(x.caixa)}/${mi(x.caixaMax)}`; };
    console.log(`T${String(m.t).padEnd(2)}| ${s("A")} | ${s("B")} | ${s("fora")} | ${f(m.A.dif12)} ${f(m.A.favorito, 2)} ${f(m.A.empates, 2)} (dif ${f(m.A.dif, 2)}) | ${f(m.subiu.T1)}/${f(m.subiu.T2)}`);
  }
  const c = curvas(rodadas, Math.min(5, temporadas), temporadas);
  console.log(`\nNota mediana por idade (jovens que entraram depois do reinício, T${Math.min(5, temporadas)}–T${temporadas}):`);
  for (const [nome, v] of Object.entries(c)) console.log(`  ${nome.padEnd(14)} ` + Object.entries(v).map(([i, n]) => `${i}:${f(n)}`).join(" "));
}
