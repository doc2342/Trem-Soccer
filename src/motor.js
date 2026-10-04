// Motor da partida.
// Campo em 9 zonas: 3 linhas (D defesa, M meio, A ataque) x 3 lados (E, C, D), sempre vistas pelo time que as ocupa.
// Cada ataque passa por três duelos de zona (saída de bola, construção, criação) e, se vencer, vira uma chance com xG.
// Passo D: instruções, energia, substituições e ordens condicionais, faltas, cartões, lesões e bola parada.
// As constantes saíram da calibragem (calibragem.html).
import { limitar } from "./rng.js";
import { IDX, FAMILIARIDADE, familiaridade, notaNaPosicao } from "./modelo.js";

export const CONFIG = {
  ataquesPorMinuto: 0.9, // ataques iniciados por minuto, somando os dois times
  mando: 1.04, // multiplicador da força do mandante
  expoentePosse: 1,
  expoenteCorredor: 1.5,
  pesoCentro: 1.15, // o jogo pelo centro é um pouco mais natural
  zonaVazia: 6, // força mínima de uma zona, para zona sem ninguém não virar divisão por zero
  inclinacaoDuelo: 1.2, // quanto a diferença de força pesa no duelo; mais alto, o melhor time vence mais
  baseDuelo: { D: 1.6, M: 0.25, A: 0.1 }, // logit do sucesso com forças iguais: cerca de 83%, 56% e 52%
  ajudaAoCentro: 0.5, // quanto da defesa dos lados fecha o centro quando o adversário não ameaça pelos lados
  continuidade: 1.3, // preferência por seguir no mesmo lado de uma linha para a outra
  pesoCentroPosse: 1.5, // o centro do meio-campo pesa mais na posse do que os lados
  vantagemFinalizador: 3, // somado ao atributo de quem chuta, na disputa com o goleiro
  xgBase: { cruzamento: 0.095, corte: 0.08, profundidade: 0.27, area: 0.15, longe: 0.045, escanteio: 0.075, falta: 0.06, penalti: 0.76 },
  inclinacaoXg: 1.2,
  inclinacaoFinalizacao: 1.5,
  fatorLibero: 0.8, // o líbero reduz o xG das bolas em profundidade
  pesoTipo: { profundidade: 0.3, area: 0.8, longe: 0.2, cruzamento: 0.35, corte: 0.3, longeLado: 0.5 }, // mistura dos tipos de chance, pelo centro e pelos lados
  variacaoChance: { profundidade: 0.4, area: 0.55, cruzamento: 0.45, corte: 0.35, longe: 0.35 }, // dispersão da qualidade de cada chance (0 = todas parecidas); a média não muda
  ajusteGol: { cruzamento: 0.97, corte: 1.28, profundidade: 0.93, area: 0.89, longe: 1.26, escanteio: 0.99, falta: 1, penalti: 0.98 }, // acerto fino para o xG de cada tipo bater com os gols
  xgMaximo: 0.75,
  chuteForcado: 0.14, // chance de sair um chute de longe, pior, quando o duelo no ataque é perdido
  fatorChuteForcado: 0.7,
  semGol: { defesa: 0.33, fora: 0.47, trave: 0.04, bloqueado: 0.16 }, // destino das finalizações que não viram gol

  // instruções
  mentalidadeAtaque: 0.075, // por nível de mentalidade: força no meio e no ataque
  mentalidadeDefesa: 0.065, // por nível de mentalidade ofensiva: força que a defesa perde
  mentalidadeRetranca: 0.065, // por nível de mentalidade defensiva: força que a defesa ganha (fechar é mais fácil que criar)
  espacoPorMentalidade: 0.2, // por nível de mentalidade de quem defende: espaço para a bola em profundidade do adversário
  ritmoPorMentalidade: 0.03, // por nível, somando os dois times: jogo mais aberto tem mais ataques
  mentalidadePosse: 0.02,
  agressividadeDefesa: 0.07, // por nível: força nos duelos defensivos
  pressaoDefesa: 0.09, // por nível: força na marcação do meio para a frente
  pressaoGasto: 0.25, // por nível: energia gasta a mais
  ladoPreferido: 2.5, ladosPreferidos: 1.8, // quanto a instrução de lado concentra os ataques
  ensaio: 0.05, // logit a favor de quem ataca pelo lado que treinou (a instrução de lado)
  // Confrontos táticos: cada escolha forte tem uma resposta que a vence.
  // Passe de quem ataca contra a pressão de quem defende (0, 1 ou 2): logit somado aos duelos de quem ataca, por linha.
  //   passe curto vence time sem pressão e perde para pressão alta; bola longa vence pressão alta e perde para time recuado.
  passeXpressao: {
    curto: [{ D: 0, M: 0.22, A: 0.05 }, { D: 0, M: 0.05, A: 0 }, { D: -0.35, M: -0.35, A: 0 }],
    misto: [{ D: 0, M: 0, A: 0 }, { D: 0, M: 0, A: 0 }, { D: 0, M: 0, A: 0 }],
    longo: [{ D: 0, M: 0.05, A: -0.3 }, { D: 0.1, M: 0.2, A: -0.05 }, { D: 0.25, M: 0.3, A: 0.15 }],
  },
  estiloLongo: { profundidade: 1.6, cruzamento: 1.3, area: 0.6, longe: 0.8 }, // mistura de chances da bola longa
  estiloCurto: { area: 1.2, longe: 0.8 },
  // Contra-ataque: vence time que joga para a frente; contra time cauteloso quase não acontece, e quem o usa constrói pior.
  contraAtaque: { com: 0.16, sem: 0.04, logit: 0.3, logitPorMentalidade: 0.15, posse: 0.92, porMentalidade: 0.85, semInstrucao: 0.25, porRetranca: 0.3, construcao: -0.15, linhaAlta: 1.5, porPostura: 0.25, posturaOfensiva: 0.3 },
  // Linha de impedimento: pega a bola longa, sofre com o passe curto e com o contra-ataque.
  impedimento: { semLinha: 0.07, porPasse: { curto: 0.2, misto: 0.28, longo: 0.58 }, porComunicacao: 0.01, libero: -0.15, noContraAtaque: 0.3, furou: 1.35, furouNoContraAtaque: 1.6 },
  capitao: 0.002, // por ponto de Influência acima de 25, quando o time está perdendo
  pesoArmador: 2, pesoAlvo: 1.8,
  comunicacaoGoleiro: 0.002, // por ponto de Comunicação do goleiro acima de 25: defesa do centro
  excentricidade: 0.1, // desvio da defesa do goleiro por ponto de Excentricidade

  // energia
  gastoEnergia: 0.55, // por minuto, para Resistência 25
  gastoGoleiro: 0.3,
  energiaPiso: 0.8, // eficácia de um jogador com energia zero
  limiarCansado: 55,
  recalcularACada: 5, // minutos
  narrarPerda: { D: 0.12, M: 0.18, A: 0.6 }, // fração das perdas de posse que entra na narração, por linha do campo

  // faltas, cartões, lesões e bola parada
  falta: 0.1, // por duelo
  faltaPorAgressividade: 0.3,
  amarelo: 0.19, amareloPorAgressividade: 0.15, vermelhoDireto: 0.003,
  cuidadoComAmarelo: 0.3, // quem já tem amarelo se segura: multiplicador da chance do segundo
  lesao: 0.0007, // por duelo, para quem tem a bola
  maxSubstituicoes: 5,
  escanteio: 0.45, // chance de escanteio depois de defesa ou bloqueio
  escanteioDuelo: 0.2, // chance de escanteio quando a defesa corta uma jogada pelo lado
  cabecadaEscanteio: 0.4, // chance de o escanteio ou a falta alçada virar finalização
  penalti: 0.13, // das faltas no centro do ataque
  faltaDireta: 0.35, // das faltas no ataque que não são pênalti
};

export const INSTRUCOES_PADRAO = {
  mentalidade: 0, // -2 muito defensiva … +2 muito ofensiva
  agressividade: 0, // -2 … +2
  pressao: 0, // 0, 1 ou 2
  lado: "misto", // misto, E, C, D ou lados
  passe: "misto", // misto, curto ou longo
  contraAtaque: false,
  impedimento: false,
  capitao: null, vice: null, armador: null, alvo: null, // ids de jogadores
  cobradores: { escanteio: [], falta: [], penalti: [] }, // listas de ids, em ordem de preferência
  substituicoes: [], // { min, sai, entra, pos?, cond }
  ordens: [], // { min, cond, muda: { mentalidade: 1, … } }
};
// Condições de substituições e ordens: sempre, ganhando, empatando, perdendo, cansado, amarelo (as duas últimas olham o jogador que sai).

const LADOS = ["E", "C", "D"];
export const ZONAS = ["DE", "DC", "DD", "ME", "MC", "MD", "AE", "AC", "AD"];
const NOME_LADO = { E: "esquerda", C: "centro", D: "direita" };

// A zona de ataque de um time é a zona de defesa do outro, com o lado trocado.
const ESPELHO_LINHA = { D: "A", M: "M", A: "D" }, ESPELHO_LADO = { E: "D", C: "C", D: "E" };
export const espelho = z => ESPELHO_LINHA[z[0]] + ESPELHO_LADO[z[1]];

// Quanto cada posição cobre de cada zona (soma 1). As posições da esquerda são o espelho das da direita.
const COBERTURA_BASE = {
  DC: { DC: 0.62, DE: 0.12, DD: 0.12, MC: 0.14 },
  SW: { DC: 0.5, DE: 0.2, DD: 0.2, MC: 0.1 },
  DR: { DD: 0.6, DC: 0.15, MD: 0.25 },
  WBR: { DD: 0.38, MD: 0.42, AD: 0.2 },
  DMC: { MC: 0.45, DC: 0.35, ME: 0.1, MD: 0.1 },
  MC: { MC: 0.6, ME: 0.1, MD: 0.1, DC: 0.08, AC: 0.12 },
  AMC: { AC: 0.45, MC: 0.4, AE: 0.075, AD: 0.075 },
  MR: { MD: 0.5, AD: 0.3, MC: 0.1, DD: 0.1 },
  AMR: { AD: 0.45, MD: 0.35, AC: 0.2 },
  RW: { AD: 0.7, AC: 0.2, MD: 0.1 },
  FC: { AC: 0.7, AE: 0.1, AD: 0.1, MC: 0.1 },
  SC: { AC: 0.9, MC: 0.1 },
};
const espelharLado = cob => Object.fromEntries(Object.entries(cob).map(([z, w]) => [z[0] + ESPELHO_LADO[z[1]], w]));
export const COBERTURA = {
  GK: {},
  ...COBERTURA_BASE,
  DL: espelharLado(COBERTURA_BASE.DR),
  WBL: espelharLado(COBERTURA_BASE.WBR),
  ML: espelharLado(COBERTURA_BASE.MR),
  AML: espelharLado(COBERTURA_BASE.AMR),
  LW: espelharLado(COBERTURA_BASE.RW),
};

const A = IDX;
// Habilidade de quem tem a bola, por zona.
function habilidadeAtaque(at, zona) {
  const centro = zona[1] === "C";
  if (zona[0] === "D") return (at[A.pas] * 2 + at[A.dom] + at[A.pos]) / 4; // saída de bola
  if (zona[0] === "M") return centro ? (at[A.pas] * 2 + at[A.cri] * 1.5 + at[A.dom] + at[A.equ] * 0.5) / 5 : (at[A.dri] + at[A.vel] + at[A.pas] + at[A.dom]) / 4;
  return centro ? (at[A.cri] * 1.5 + at[A.pas] + at[A.dom] + at[A.dri] * 0.5) / 4 : (at[A.dri] * 1.5 + at[A.vel] * 1.5 + at[A.cru] * 0.5 + at[A.dom] * 0.5) / 4;
}
// Habilidade de quem marca, por zona.
function habilidadeDefesa(at, zona) {
  const centro = zona[1] === "C";
  if (zona[0] === "A") return (at[A.vel] + at[A.res] + at[A.agr] + at[A.equ]) / 4; // pressão na saída do adversário
  if (zona[0] === "M") return centro ? (at[A.pos] * 1.5 + at[A.des] * 1.5 + at[A.equ] * 0.5 + at[A.res] * 0.5) / 4 : (at[A.des] + at[A.vel] + at[A.mar] * 0.5 + at[A.pos] * 0.5) / 3;
  return centro ? (at[A.mar] * 1.5 + at[A.pos] * 1.5 + at[A.des]) / 4 : (at[A.des] * 1.5 + at[A.vel] + at[A.mar] + at[A.pos] * 0.5) / 4;
}

// escalacao: [{ j: jogador, pos }] com 11 nomes; banco: até 7 jogadores; instrucoes: ver INSTRUCOES_PADRAO.
// O objeto devolvido não muda durante a partida e pode ser reutilizado em várias simulações.
export function prepararTime({ nome, escalacao, banco = [], instrucoes = {}, mandante = false }) {
  return {
    nome, mandante, escalacao, banco,
    instrucoes: { ...INSTRUCOES_PADRAO, ...instrucoes, cobradores: { ...INSTRUCOES_PADRAO.cobradores, ...(instrucoes.cobradores || {}) } },
  };
}

const novoJog = (j, pos) => ({ j, pos, fam: FAMILIARIDADE[familiaridade(j, pos)], energia: 100, amarelos: 0, at: j.at });

// Estado do time durante a partida.
function iniciar(time) {
  return {
    nome: time.nome, mandante: time.mandante,
    instr: { ...time.instrucoes },
    emCampo: time.escalacao.map(({ j, pos }) => novoJog(j, pos)),
    banco: time.banco.slice(), subs: 0, subsFeitas: new Set(), ordensFeitas: new Set(),
    goleiro: null, temLibero: false, atk: {}, def: {}, zonas: {}, controle: 0, comDefesa: 25,
  };
}

const eficacia = (jog) => {
  const piso = jog.pos === "GK" ? (1 + CONFIG.energiaPiso) / 2 : CONFIG.energiaPiso;
  return piso + (1 - piso) * jog.energia / 100;
};

function capitaoEmCampo(t) {
  const porId = id => id != null && t.emCampo.find(x => x.j.id === id);
  return porId(t.instr.capitao) || porId(t.instr.vice) || t.emCampo.reduce((m, x) => !m || x.j.at[A.inf] > m.j.at[A.inf] ? x : m, null);
}

// Recalcula a força de ataque e de defesa do time em cada zona, com energia, instruções e placar.
function recalcular(t, saldo) {
  const I = t.instr, cap = capitaoEmCampo(t);
  const moral = saldo < 0 && cap ? 1 + (cap.j.at[A.inf] - 25) * CONFIG.capitao : 1;
  const base = (t.mandante ? CONFIG.mando : 1) * moral;
  const mAtk = { D: 1, M: 1 + CONFIG.mentalidadeAtaque * I.mentalidade, A: 1 + CONFIG.mentalidadeAtaque * I.mentalidade };
  const agr = 1 + CONFIG.agressividadeDefesa * I.agressividade, pre = 1 + CONFIG.pressaoDefesa * I.pressao, abre = I.mentalidade > 0 ? 1 - CONFIG.mentalidadeDefesa * I.mentalidade : 1 - CONFIG.mentalidadeRetranca * I.mentalidade;
  const mDef = { D: agr * abre, M: agr * abre * pre, A: agr * pre };
  t.goleiro = null; t.temLibero = false;
  for (const z of ZONAS) { t.atk[z] = 0; t.def[z] = 0; t.zonas[z] = []; }
  for (const jog of t.emCampo) {
    const f = jog.fam * base * eficacia(jog);
    jog.at = jog.j.at.map(v => v * f); // atributos efetivos neste momento da partida
    if (jog.pos === "GK") { t.goleiro = jog; continue; }
    if (jog.pos === "SW") t.temLibero = true;
    const p = jog.j.id === I.armador ? CONFIG.pesoArmador : 1;
    for (const [z, w] of Object.entries(COBERTURA[jog.pos])) {
      t.atk[z] += w * habilidadeAtaque(jog.at, z) * mAtk[z[0]];
      t.def[z] += w * habilidadeDefesa(jog.at, z) * mDef[z[0]];
      t.zonas[z].push({ jog, w, p: w * p });
    }
  }
  if (t.goleiro) t.def.DC *= 1 + (t.goleiro.j.at[A.com] - 25) * CONFIG.comunicacaoGoleiro;
  const linha = t.zonas.DC, peso = linha.reduce((s, o) => s + o.w, 0);
  t.comDefesa = peso ? linha.reduce((s, o) => s + o.w * o.jog.j.at[A.com], 0) / peso : 10;
  t.controle = LADOS.reduce((s, l) => s + (t.atk["M" + l] + t.def["M" + l]) * (l === "C" ? CONFIG.pesoCentroPosse : 1), 0)
    * (I.contraAtaque ? CONFIG.contraAtaque.posse : 1) * (1 + CONFIG.mentalidadePosse * I.mentalidade);
}

// Força de ataque e de defesa de uma escalação em cada zona, descansada e sem instruções. Serve ao bot e às telas.
export function avaliarZonas(escalacao) {
  const t = iniciar(prepararTime({ nome: "", escalacao }));
  recalcular(t, 0);
  return { atk: t.atk, def: t.def };
}

function sortearPeso(rng, lista, peso) {
  let total = 0;
  const pesos = lista.map(x => { const p = Math.max(0, peso(x)); total += p; return p; });
  if (total <= 0) return null;
  let r = rng.n() * total;
  for (let i = 0; i < lista.length; i++) { r -= pesos[i]; if (r <= 0) return lista[i]; }
  return lista[lista.length - 1];
}

const mod = (a, b, k) => Math.exp(k * (a - b) / 50);
const media = (...v) => v.reduce((a, b) => a + b, 0) / v.length;

// Defesa que o atacante enfrenta em cada zona (vista pelo atacante).
// Time que não ameaça pelos lados deixa os defensores de lado livres para fechar o centro: jogo estreito encontra defesa compacta.
function montarDefesa(atk, def) {
  const dz = {};
  for (const z of ZONAS) dz[z] = def.def[espelho(z)];
  for (const linha of ["M", "A"]) {
    let ajuda = 0;
    for (const l of ["E", "D"]) {
      const z = linha + l, ameaca = Math.min(1, (atk.atk[z] + CONFIG.zonaVazia) / (dz[z] + CONFIG.zonaVazia));
      ajuda += CONFIG.ajudaAoCentro * dz[z] * (1 - ameaca);
    }
    dz[linha + "C"] += ajuda;
  }
  return dz;
}

// Em cada linha o time procura o lado em que é mais forte em relação à cobertura do adversário.
function escolherLado(rng, atk, dz, linha, atual) {
  const pref = atk.instr.lado;
  const lado = sortearPeso(rng, LADOS, l => {
    const z = linha + l;
    const forca = (atk.atk[z] + CONFIG.zonaVazia) / (dz[z] + CONFIG.zonaVazia);
    const instrucao = pref === l ? CONFIG.ladoPreferido : pref === "lados" && l !== "C" ? CONFIG.ladosPreferidos : 1;
    return Math.pow(forca, CONFIG.expoenteCorredor) * (l === "C" ? CONFIG.pesoCentro : 1) * (atk.zonas[z].length ? 1 : 0.15) * (l === atual ? CONFIG.continuidade : 1) * instrucao;
  });
  return lado || "C";
}

// Monta a chance depois de vencido o duelo na zona de ataque.
function criarChance(rng, atk, def, lado, pivo, { forcado = false, contra = false } = {}) {
  const area = atk.zonas.AC, x = CONFIG.xgBase, k = CONFIG.inclinacaoXg, I = atk.instr;
  const alvoAereo = area.reduce((s, o) => s + o.w * media(o.jog.at[A.cab], o.jog.at[A.for]), 0) / 30;
  const alvoVeloz = area.reduce((s, o) => s + o.w * media(o.jog.at[A.vel], o.jog.at[A.dom]), 0) / 30;
  const presenca = Math.min(1, area.reduce((s, o) => s + o.w, 0));
  const pt = CONFIG.pesoTipo;
  const espaco = Math.max(0.3, 1 + CONFIG.espacoPorMentalidade * def.instr.mentalidade); // linha recuada tira o espaço nas costas
  const jeito = I.passe === "longo" ? CONFIG.estiloLongo : I.passe === "curto" ? CONFIG.estiloCurto : {};
  const estilo = { profundidade: (jeito.profundidade || 1) * (contra ? 2 : 1) * espaco, area: jeito.area || 1, longe: jeito.longe || 1, cruzamento: jeito.cruzamento || 1, corte: 1 };
  const opcoes = lado === "C"
    ? [["profundidade", pt.profundidade * alvoVeloz * estilo.profundidade], ["area", pt.area * presenca * estilo.area], ["longe", pt.longe * estilo.longe]]
    : [["cruzamento", pt.cruzamento * alvoAereo * estilo.cruzamento], ["corte", pt.corte], ["longe", pt.longeLado * estilo.longe]];
  const tipo = forcado ? "longe" : sortearPeso(rng, opcoes, o => o[1])[0];
  const zagueiro = (sortearPeso(rng, def.zonas.DC, o => o.w) || {}).jog;
  const zag = zagueiro ? zagueiro.at : null, gk = def.goleiro ? def.goleiro.at : null;
  const semZaga = 12, semGoleiro = 5; // valores usados quando não há zagueiro na zona ou goleiro em campo
  const c = { tipo, lado, criador: pivo, finalizador: pivo, zagueiro, contra };
  // quem recebe o passe ou o cruzamento não é quem o fez, a não ser que esteja sozinho na área
  const outros = area.filter(o => o.jog !== pivo), alvos = outros.length ? outros : area;
  const ehAlvo = o => o.jog.j.id === I.alvo ? CONFIG.pesoAlvo : 1;

  if (tipo === "cruzamento") {
    c.finalizador = sortearPeso(rng, alvos, o => o.w * (o.jog.at[A.cab] + o.jog.at[A.for]) * ehAlvo(o)).jog;
    const f = c.finalizador.at;
    c.xg = x.cruzamento * Math.pow(mod(pivo.at[A.cru], 28, k), 0.6) * mod(media(f[A.cab], f[A.for]), zag ? media(zag[A.cab], zag[A.mar], zag[A.for]) : semZaga, k);
    c.chute = f[A.cab]; c.defesa = gk ? media(gk[A.enc], gk[A.pos]) : semGoleiro;
  } else if (tipo === "corte") {
    c.xg = x.corte * mod(media(pivo.at[A.fin], pivo.at[A.lon]), 26, k);
    c.chute = media(pivo.at[A.fin], pivo.at[A.lon]); c.defesa = gk ? media(gk[A.ref], gk[A.pos]) : semGoleiro;
  } else if (tipo === "profundidade") {
    c.finalizador = sortearPeso(rng, alvos, o => o.w * (o.jog.at[A.vel] + o.jog.at[A.dom])).jog;
    const f = c.finalizador.at;
    c.xg = x.profundidade * Math.pow(mod(media(pivo.at[A.cri], pivo.at[A.pas]), 28, k), 0.5) * mod(media(f[A.vel], f[A.dom]), zag ? media(zag[A.pos], zag[A.vel]) : semZaga, k) * (def.temLibero ? CONFIG.fatorLibero : 1);
    c.chute = Math.max(f[A.fin], f[A.dri]) * 0.7 + f[A.dom] * 0.3; c.defesa = gk ? gk[A.um] : semGoleiro;
  } else if (tipo === "area") {
    c.finalizador = (sortearPeso(rng, area, o => o.w * o.jog.at[A.fin] * ehAlvo(o)) || { jog: pivo }).jog;
    const f = c.finalizador.at;
    c.xg = x.area * mod(media(f[A.dom], f[A.pos]), zag ? media(zag[A.mar], zag[A.pos]) : semZaga, k);
    c.chute = f[A.fin]; c.defesa = gk ? gk[A.ref] : semGoleiro;
  } else {
    c.xg = x.longe * mod(pivo.at[A.lon], 25, k) * (forcado ? CONFIG.fatorChuteForcado : 1);
    c.chute = pivo.at[A.lon]; c.defesa = gk ? media(gk[A.ref], gk[A.pos]) : semGoleiro;
  }
  // nem toda chance do mesmo tipo vale o mesmo: umas saem limpas, outras apertadas
  const v = CONFIG.variacaoChance[tipo] || 0;
  if (v) c.xg *= Math.exp(rng.normal(0, v) - v * v / 2);
  c.xg = limitar(c.xg, 0.01, CONFIG.xgMaximo);
  return c;
}

// nm: função que escreve o nome do jogador marcado com o time ("{0:Fulano}"), para a tela pintar cada um na cor do seu clube
function narrar(c, resultado, goleiro, nm) {
  const f = nm(c.finalizador), cr = nm(c.criador), lado = NOME_LADO[c.lado];
  const inicio = {
    cruzamento: `${cr} cruza da ${lado} e ${f} cabeceia`,
    corte: `${f} vem da ${lado} em diagonal e chuta`,
    profundidade: `${cr} lança em profundidade e ${f} sai na cara do gol`,
    area: c.criador === c.finalizador ? `${f} recebe na área e finaliza` : `${cr} acha ${f} na área, que finaliza`,
    longe: `${f} arrisca de fora da área`,
    escanteio: `${cr} cobra o escanteio e ${f} cabeceia`,
    falta: c.criador === c.finalizador ? `${f} cobra a falta direto no gol` : `${cr} levanta a falta na área e ${f} cabeceia`,
    penalti: `${f} cobra o pênalti`,
  }[c.tipo];
  const fim = {
    gol: "GOL!",
    defesa: goleiro ? `${nm(goleiro)} defende.` : "a defesa fica com a bola.",
    fora: "a bola sai pela linha de fundo.",
    trave: "na trave!",
    bloqueado: c.zagueiro ? `${nm(c.zagueiro)} bloqueia.` : "a zaga bloqueia.",
  }[resultado];
  return `${inicio}: ${fim}`;
}

const novaEstatistica = () => ({
  posse: 0, ataques: 0, contraAtaques: 0, corredor: { E: 0, C: 0, D: 0 }, chances: 0, finalizacoes: 0, noGol: 0, xg: 0, gols: 0,
  faltas: 0, amarelos: 0, vermelhos: 0, escanteios: 0, impedimentos: 0, substituicoes: 0,
  zonas: Object.fromEntries(ZONAS.map(z => [z, [0, 0]])), // duelos de ataque vencidos e perdidos por zona
});

// Simula uma partida inteira. O mesmo rng (mesma semente) dá sempre o mesmo jogo.
export function simularPartida(rng, casa, fora) {
  const times = [iniciar(casa), iniciar(fora)], estat = [novaEstatistica(), novaEstatistica()];
  const jogadores = {}, lances = [], eventos = [], lesoes = [];
  const ficha = (jog, i) => jogadores[jog.j.id] || (jogadores[jog.j.id] = { nome: jog.j.nome, pos: jog.pos, time: i, entrou: 0, saiu: null, gols: 0, finalizacoes: 0, xg: 0, duelosGanhos: 0, duelosPerdidos: 0, duelosEsperados: 0, faltas: 0, amarelos: 0, vermelho: false, lesionado: false, energia: 100 });
  times.forEach((t, i) => t.emCampo.forEach(jog => ficha(jog, i)));
  let min = 0, sujo = true, posseCasa = 0.5, defesas = null, somaPosse = 0;
  const gols = () => [estat[0].gols, estat[1].gols];
  let seq = 0; // ordem de acontecimento, para a narração misturar finalizações e os outros lances na sequência certa
  // parcial para a transmissão ao vivo: [posse do mandante em %, faltas do mandante, do visitante, escanteios do mandante, do visitante]
  const parcial = () => [min > 1 ? Math.round(somaPosse / (min - 1) * 100) : 50, estat[0].faltas, estat[1].faltas, estat[0].escanteios, estat[1].escanteios];
  const nm = jog => `{${jogadores[jog.j.id] ? jogadores[jog.j.id].time : "?"}:${jog.j.nome}}`, tm = i => `{${i}:${times[i].nome}}`;
  // os cartões esperam o lance da falta ser narrado e saem logo depois dele, já dizendo o motivo
  const pendentes = [];
  const soltarCartoes = () => { while (pendentes.length) { const c = pendentes.shift(); eventos.push({ n: seq++, min, time: c.i, tipo: c.tipo, texto: c.texto, p: parcial() }); } };
  const empurrar = (lista, o) => { lista.push(o); soltarCartoes(); };
  const evento = (i, tipo, texto) => empurrar(eventos, { n: seq++, min, time: i, tipo, texto, p: parcial() });
  const cartao = (i, tipo, texto) => pendentes.push({ i, tipo, texto });
  // Ataque que termina sem finalização: desarme, passe interceptado, domínio errado ou passe errado, conforme os atributos dos dois.
  const ONDE = { D: () => "na saída de bola", M: l => l === "C" ? "no meio-campo" : `pela ${NOME_LADO[l]} do meio-campo`, A: l => l === "C" ? "na entrada da área" : `no ataque pela ${NOME_LADO[l]}` };
  // Todo ataque é narrado passo a passo: os duelos vencidos (saída de bola, meio-campo) ficam na trilha e entram no texto do desfecho.
  // A trilha é uma lista de frases, cada uma com suas orações; "portador" é quem está com a bola, para a narração ligar um
  // jogador ao outro com o passe ("... e toca para Fulano") em vez de a bola mudar de pé sem explicação.
  let atacante = null, ultimoNarrado = null, aposFalta = false; // aposFalta: a jogada recomeça com a cobrança de uma falta // time do ataque em andamento e do último ataque que foi narrado
  let trilha = [], portador = null, ultimoAtaque = null, saida = null, cadeia = null, bola = null, proximo = null, rodou = false, emContra = false; // bola: quem a recuperou e em que linha do seu ataque; proximo: ataque seguinte já decidido
  const RODA = [
    (j, t, onde) => `${j} não acha espaço ${onde}, recua e o ${t} roda a bola.`,
    (j, t, onde) => `Marcação fechada ${onde}: ${j} volta o jogo e o ${t} troca passes atrás.`,
    (j, t, onde) => `${j} prefere não arriscar ${onde} e recomeça a jogada por trás.`,
    (j, t, onde) => `Sem opção ${onde}, ${j} toca para trás e o ${t} vira o jogo.`,
  ]; // saida: time que dá a saída depois de sofrer um gol
  // quando o mesmo time ataca duas vezes seguidas é porque retomou a bola logo depois de perdê-la
  const RETOMA = [n => `${n} recupera a bola`, n => `${n} retoma a posse`, n => `A bola volta para o ${n}`, n => `${n} rouba a bola de novo`];
  const frase = o => o.length > 1 ? o.slice(0, -1).join(", ") + " e " + o[o.length - 1] : o[0];
  const comTrilha = texto => { const t = trilha.length ? trilha.map(frase).join(". ") + ". " + texto : texto; trilha = []; portador = null; ultimoNarrado = atacante; return t; };
  const PELO = { E: "pela esquerda", C: "pelo meio", D: "pela direita" };
  // a bola chega a "jog": se estava com outro, o passe entra na frase anterior; devolve true se o jogador já era o portador
  function recebe(jog) {
    const mesmo = !!jog && jog === portador;
    if (jog && portador && !mesmo && aposFalta) trilha.push([`${nm(portador)} cobra a falta e aciona ${nm(jog)}`]);
    else if (jog && portador && !mesmo && trilha.length) {
      const ultima = trilha[trilha.length - 1];
      if (ultima.fechada) trilha.push([`${nm(portador)} toca para ${nm(jog)}`]); else ultima.push(`toca para ${nm(jog)}`);
    }
    portador = jog || null; aposFalta = false;
    return mesmo;
  }
  function passo(i, zona, d) {
    const p = d.pivo, m = d.marcador, lado = zona[1];
    if (!p) { portador = null; trilha.push([`${tm(i)} ${zona[0] === "D" ? "sai jogando" : "avança"} ${PELO[lado]}`]); return; }
    const depoisDeFalta = aposFalta, mesmo = recebe(p), nome = nm(p);
    // falta fora da zona de ataque: o time fica com a bola e recomeça dali, cobrando a falta (não é lei da vantagem)
    if (d.falta && m) { evento(i, "falta", comTrilha(`Falta de ${nm(m)} em ${nome} ${ONDE[zona[0]](lado)}.`)); portador = p; aposFalta = true; return; }
    if (zona[0] === "D") trilha.push(times[i].instr.passe === "longo" ? [`${nome} domina no campo de defesa ${PELO[lado]}`, "prepara o lançamento"] : [`${nome} sai jogando ${PELO[lado]}`, ...(m ? [`passa por ${nm(m)}`] : [])]);
    else trilha.push([`${mesmo ? (depoisDeFalta ? nome + " cobra a falta rápido e segue" : trilha.length ? "Segue" : nome + " segue") : nome + " carrega"} ${lado === "C" ? "pelo centro do meio-campo" : `pela ${NOME_LADO[lado]} do meio-campo`}`, ...(m ? [`supera ${nm(m)}`] : [])]);
  }
  function perdaDePosse(i, zona, d) {
    // quem ganha a bola começa o ataque seguinte dali: roubada na saída de bola do adversário, já no ataque; no meio, no meio
    bola = { time: 1 - i, zona: zona[0] === "D" ? "A" : zona[0] === "M" ? "M" : "D" };
    const onde = ONDE[zona[0]](zona[1]);
    // Do meio para a frente, o time de mais posse nem sempre perde a bola quando não acha espaço: recua, roda o jogo e tenta de novo
    // pelo meio-campo. A chance é a mesma com que ele retomaria a bola na cadeia de posse, então a fatia de ataques de cada time não muda.
    if (!emContra && zona[0] !== "D" && d.pivo) {
      const p = i === 0 ? posseCasa : 1 - posseCasa;
      if (p > 0.5 && !rng.chance((1 - p) / p)) {
        recebe(d.pivo);
        evento(i, "roda", comTrilha(RODA[seq % RODA.length](nm(d.pivo), tm(i), onde)));
        proximo = { time: i, zona: "M" }; rodou = true; bola = null;
        return false;
      }
      proximo = { time: 1 - i, zona: bola.zona };
    }
    if (!d.pivo) { if (trilha.length) evento(1 - i, "posse", comTrilha(`${tm(1 - i)} recupera a bola ${onde}.`)); return true; }
    const p = d.pivo, m = d.marcador;
    recebe(p);
    const causas = [["dominio", 60 - p.at[A.dom]], ["passe", 60 - p.at[A.pas]]];
    if (m) causas.push(["desarme", 20 + m.at[A.des]], ["corte", 20 + m.at[A.pos]]);
    // os sorteios seguem a ordem antiga (quando só parte das perdas era narrada), para a mesma semente continuar dando o mesmo jogo
    const causa = rng.chance(CONFIG.narrarPerda[zona[0]]) ? sortearPeso(rng, causas, c => c[1])[0] : causas[seq % causas.length][0];
    if (causa === "desarme") evento(1 - i, "posse", comTrilha(`${nm(m)} desarma ${nm(p)} ${onde}.`));
    else if (causa === "corte") evento(1 - i, "posse", comTrilha(`${nm(m)} intercepta o passe de ${nm(p)} ${onde}.`));
    else if (causa === "dominio") evento(i, "posse", comTrilha(`${nm(p)} domina mal ${onde} e perde a posse.`));
    else evento(i, "posse", comTrilha(`${nm(p)} erra o passe ${onde}.`));
    return true;
  }
  // esperado: chance que o jogador tinha de vencer o duelo; a nota compara o que ele venceu com o que era esperado
  const registrar = (jog, venceu, esperado) => { const s = jogadores[jog.j.id]; if (s) { s[venceu ? "duelosGanhos" : "duelosPerdidos"]++; s.duelosEsperados += esperado; } };

  function sair(i, jog) {
    const t = times[i];
    t.emCampo = t.emCampo.filter(x => x !== jog);
    const s = jogadores[jog.j.id]; s.saiu = min; s.energia = Math.round(jog.energia);
    sujo = true;
  }
  function entrar(i, j, pos) {
    const t = times[i], jog = novoJog(j, pos);
    t.banco = t.banco.filter(x => x !== j); t.emCampo.push(jog); t.subs++; estat[i].substituicoes++;
    ficha(jog, i).entrou = min; sujo = true;
    return jog;
  }
  function condicao(i, cond, jog) {
    const g = gols(), saldo = g[i] - g[1 - i];
    if (cond === "ganhando") return saldo > 0;
    if (cond === "empatando") return saldo === 0;
    if (cond === "perdendo") return saldo < 0;
    if (cond === "cansado") return !!jog && jog.energia < CONFIG.limiarCansado;
    if (cond === "amarelo") return !!jog && jog.amarelos > 0;
    return true;
  }
  function ordensESubstituicoes(i) {
    const t = times[i];
    t.instr.ordens.forEach((o, k) => {
      if (t.ordensFeitas.has(k) || min < (o.min || 0) || !condicao(i, o.cond)) return;
      t.ordensFeitas.add(k); Object.assign(t.instr, o.muda); sujo = true;
      evento(i, "ordem", `${tm(i)} muda a forma de jogar.`);
    });
    t.instr.substituicoes.forEach((s, k) => {
      if (t.subsFeitas.has(k) || min < (s.min || 0) || t.subs >= CONFIG.maxSubstituicoes) return;
      const sai = t.emCampo.find(x => x.j.id === s.sai), entra = t.banco.find(x => x.id === s.entra);
      if (!sai || !entra) { if (!sai && min >= (s.min || 0)) t.subsFeitas.add(k); return; }
      if (!condicao(i, s.cond, sai)) return;
      t.subsFeitas.add(k); sair(i, sai); entrar(i, entra, s.pos || sai.pos);
      evento(i, "substituicao", `Sai ${nm(sai)}, entra {${i}:${entra.nome}}.`);
    });
  }
  // Quem sai machucado é trocado pelo melhor do banco para a posição, se ainda houver substituição.
  function reporLesionado(i, jog) {
    const t = times[i];
    if (t.subs >= CONFIG.maxSubstituicoes || !t.banco.length) return;
    const candidatos = t.banco.filter(j => (j.pos === "GK") === (jog.pos === "GK"));
    if (!candidatos.length) return;
    const entra = candidatos.reduce((m, j) => notaNaPosicao(j, jog.pos) > notaNaPosicao(m, jog.pos) ? j : m);
    entrar(i, entra, jog.pos);
    evento(i, "substituicao", `Entra {${i}:${entra.nome}} no lugar de ${nm(jog)}.`);
  }
  function falta(i, marcador, vitima) { // i: time que cometeu
    const t = times[i], s = jogadores[marcador.j.id], em = vitima ? ` em ${nm(vitima)}` : "";
    estat[i].faltas++; s.faltas++;
    if (rng.chance(CONFIG.vermelhoDireto)) return expulsar(i, marcador, `Cartão vermelho direto para ${nm(marcador)} pela entrada violenta${em}!`);
    if (!rng.chance(CONFIG.amarelo * (1 + CONFIG.amareloPorAgressividade * t.instr.agressividade) * (marcador.amarelos ? CONFIG.cuidadoComAmarelo : 1))) return;
    marcador.amarelos++; s.amarelos++; estat[i].amarelos++;
    if (marcador.amarelos >= 2) return expulsar(i, marcador, `Segundo amarelo para ${nm(marcador)} pela falta${em}: está expulso!`);
    cartao(i, "amarelo", `Cartão amarelo para ${nm(marcador)} pela falta${em}.`);
  }
  function expulsar(i, jog, texto) {
    estat[i].vermelhos++; jogadores[jog.j.id].vermelho = true;
    sair(i, jog); cartao(i, "vermelho", texto);
  }

  // Duelo de zona: força de ataque de um time contra a força de defesa do outro na zona espelhada.
  function duelo(i, zona, logit = 0, contra = false) {
    const atk = times[i], def = times[1 - i], dz = defesas[i], e = estat[i];
    const a = atk.atk[zona] + CONFIG.zonaVazia, d = dz[zona] + CONFIG.zonaVazia;
    // confronto tático: passe contra pressão (só no ataque construído), custo de jogar no contra-ataque e lado ensaiado
    const pref = atk.instr.lado, ensaiado = pref === zona[1] || (pref === "lados" && zona[1] !== "C");
    const tatico = (contra ? 0 : CONFIG.passeXpressao[atk.instr.passe][def.instr.pressao][zona[0]] + (atk.instr.contraAtaque && zona[0] === "M" ? CONFIG.contraAtaque.construcao : 0))
      + (ensaiado && zona[0] !== "D" ? CONFIG.ensaio : 0);
    const p = 1 / (1 + Math.exp(-(CONFIG.baseDuelo[zona[0]] + logit + tatico + CONFIG.inclinacaoDuelo * Math.log(a / d))));
    let venceu = rng.chance(p), parada = false, comFalta = false;
    const pivo = (sortearPeso(rng, atk.zonas[zona], x => x.p) || {}).jog, marcador = (sortearPeso(rng, def.zonas[espelho(zona)], x => x.w) || {}).jog;
    if (marcador && rng.chance(CONFIG.falta * (1 + CONFIG.faltaPorAgressividade * def.instr.agressividade) * Math.sqrt(marcador.j.at[A.agr] / 25))) {
      falta(1 - i, marcador, pivo); comFalta = true;
      if (zona[0] === "A") parada = true; else venceu = true; // falta no ataque vira bola parada; atrás, a jogada segue
    } else {
      e.zonas[zona][venceu ? 0 : 1]++;
      if (pivo) registrar(pivo, venceu, p);
      if (marcador) registrar(marcador, !venceu, 1 - p);
    }
    if (pivo && rng.chance(CONFIG.lesao * (1 + 0.2 * def.instr.agressividade))) {
      const r = rng.n(), dias = r < 0.5 ? rng.int(1, 3) : r < 0.8 ? rng.int(4, 10) : rng.int(11, 30);
      jogadores[pivo.j.id].lesionado = true; lesoes.push({ id: pivo.j.id, time: i, dias });
      sair(i, pivo); recebe(pivo); evento(i, "lesao", comTrilha(`${nm(pivo)} se machuca e não continua.`)); reporLesionado(i, pivo);
      return { venceu: false, pivo: null, marcador, parada: false };
    }
    return { venceu, pivo, marcador, parada, falta: comFalta };
  }

  function finalizar(i, c) {
    const atk = times[i], def = times[1 - i], e = estat[i];
    if (c.tipo === "profundidade") {
      const K = CONFIG.impedimento;
      const p = def.instr.impedimento ? limitar((K.porPasse[atk.instr.passe] + (def.comDefesa - 25) * K.porComunicacao + (def.temLibero ? K.libero : 0)) * (c.contra ? K.noContraAtaque : 1), 0.05, 0.65) : K.semLinha;
      if (rng.chance(p)) { e.impedimentos++; recebe(c.criador); evento(i, "impedimento", comTrilha(`${nm(c.criador)} lança e ${nm(c.finalizador)} é pego em impedimento.`)); return; }
      if (def.instr.impedimento) c.xg = limitar(c.xg * (c.contra ? K.furouNoContraAtaque : K.furou), 0.01, 0.6);
    }
    const ruido = def.goleiro ? rng.normal(0, def.goleiro.j.at[A.exc] * CONFIG.excentricidade) : 0;
    const k = c.tipo === "penalti" ? 0.6 : CONFIG.inclinacaoFinalizacao;
    const pGol = limitar(c.xg * (CONFIG.ajusteGol[c.tipo] || 1) * mod(c.chute + CONFIG.vantagemFinalizador, c.defesa + ruido, k), 0.005, 0.92);
    let resultado = rng.chance(pGol) ? "gol" : sortearPeso(rng, Object.entries(CONFIG.semGol), o => o[1])[0];
    if (c.tipo === "penalti" && resultado === "bloqueado") resultado = "defesa"; // pênalti não tem zagueiro na frente
    e.chances++; e.xg += c.xg; e.finalizacoes++;
    if (resultado === "gol" || resultado === "defesa") e.noGol++;
    if (resultado === "gol") { e.gols++; sujo = true; saida = 1 - i; }
    const sf = jogadores[c.finalizador.j.id];
    sf.finalizacoes++; sf.xg += c.xg; if (resultado === "gol") sf.gols++;
    if (c.tipo === "escanteio" || c.tipo === "falta" || c.tipo === "penalti") portador = null; else recebe(c.criador);
    empurrar(lances, { n: seq++, min, time: i, tipo: c.tipo, lado: c.lado, xg: c.xg, resultado, finalizador: c.finalizador.j.id, criador: c.criador.j.id, goleiro: def.goleiro ? def.goleiro.j.id : null, texto: comTrilha(narrar(c, resultado, def.goleiro, nm)), p: parcial() });
    if ((resultado === "defesa" || resultado === "bloqueado") && c.tipo !== "penalti" && rng.chance(CONFIG.escanteio)) { evento(i, "canto", `Escanteio para o ${tm(i)}.`); bolaParada(i, "escanteio", "C"); }
  }

  function cobrador(t, tipo, nota) {
    for (const id of t.instr.cobradores[tipo] || []) { const jog = t.emCampo.find(x => x.j.id === id); if (jog) return jog; }
    const linha = t.emCampo.filter(x => x.pos !== "GK");
    return linha.length ? linha.reduce((m, x) => nota(x.at) > nota(m.at) ? x : m) : null;
  }
  // Bola levantada na área em escanteio ou falta: os melhores no jogo aéreo sobem, zagueiros inclusive.
  function bolaAlcada(i, tipo, quem) {
    const atk = times[i], def = times[1 - i], k = CONFIG.inclinacaoXg;
    if (!rng.chance(CONFIG.cabecadaEscanteio)) { portador = null; evento(i, "posse", comTrilha(`${nm(quem)} ${tipo === "escanteio" ? "cobra o escanteio" : "levanta a falta na área"} e a zaga afasta.`)); return; }
    const sobem = atk.emCampo.filter(x => x.pos !== "GK" && x !== quem), marcam = def.emCampo.filter(x => x.pos !== "GK");
    if (!sobem.length) return;
    const alvo = sortearPeso(rng, sobem, x => Math.pow(x.at[A.cab] + x.at[A.for], 2) * (x.j.id === atk.instr.alvo ? CONFIG.pesoAlvo : 1));
    const zag = sortearPeso(rng, marcam, x => x.at[A.cab] + x.at[A.mar]), gk = def.goleiro ? def.goleiro.at : null;
    const c = { tipo, lado: "C", criador: quem, finalizador: alvo, zagueiro: zag };
    c.xg = limitar(CONFIG.xgBase.escanteio * Math.pow(mod(quem.at[A.cru], 28, k), 0.6) * mod(media(alvo.at[A.cab], alvo.at[A.for]), zag ? media(zag.at[A.cab], zag.at[A.mar], zag.at[A.for]) : 12, k), 0.01, 0.6);
    c.chute = alvo.at[A.cab]; c.defesa = gk ? media(gk[A.enc], gk[A.pos]) : 5;
    finalizar(i, c);
  }
  function bolaParada(i, tipo, lado, penal = false) {
    const atk = times[i], def = times[1 - i], gk = def.goleiro ? def.goleiro.at : null;
    if (tipo === "escanteio") {
      estat[i].escanteios++;
      const quem = cobrador(atk, "escanteio", at => at[A.cru]);
      if (quem) bolaAlcada(i, "escanteio", quem);
    } else if (penal) {
      const quem = cobrador(atk, "penalti", at => at[A.fin]);
      if (quem) finalizar(i, { tipo: "penalti", lado: "C", criador: quem, finalizador: quem, zagueiro: null, xg: CONFIG.xgBase.penalti, chute: quem.at[A.fin], defesa: gk ? gk[A.um] : 5 });
    } else {
      const nota = at => at[A.lon] * 0.6 + at[A.cri] * 0.4, quem = cobrador(atk, "falta", nota);
      if (!quem) return;
      if (rng.chance(CONFIG.faltaDireta)) finalizar(i, { tipo: "falta", lado, criador: quem, finalizador: quem, zagueiro: null, xg: limitar(CONFIG.xgBase.falta * mod(nota(quem.at), 26, CONFIG.inclinacaoXg), 0.01, 0.6), chute: nota(quem.at), defesa: gk ? media(gk[A.ref], gk[A.pos]) : 5 });
      else bolaAlcada(i, "falta", quem);
    }
  }

  function atacar(i, contra = false, inicio = "D") {
    const atk = times[i], def = times[1 - i], dz = defesas[i], e = estat[i];
    const bonus = contra ? CONFIG.contraAtaque.logit + (atk.instr.contraAtaque ? CONFIG.contraAtaque.logitPorMentalidade * Math.max(0, def.instr.mentalidade) : 0) : 0;
    // quem recupera a bola pode sair em contra-ataque, mais ainda contra time que joga para a frente
    const perdeu = () => {
      if (contra) return;
      const K = CONFIG.contraAtaque, m = atk.instr.mentalidade;
      // quem perde a bola jogando para a frente ou com a linha alta fica mais exposto; time montado para o contra-ataque aproveita mais
      const fator = def.instr.contraAtaque ? (m > 0 ? 1 + K.porMentalidade * m : Math.max(0.3, 1 + K.porRetranca * m)) : 1 + K.semInstrucao * Math.max(0, m);
      // contra-ataque é arma de quem espera atrás: rende mais com mentalidade defensiva e menos com o próprio time adiantado
      const eu = def.instr.mentalidade, postura = !def.instr.contraAtaque ? 1 : eu < 0 ? 1 - K.porPostura * eu : Math.max(0.4, 1 - K.posturaOfensiva * eu);
      const p = (def.instr.contraAtaque ? K.com : K.sem) * fator * postura * (atk.instr.impedimento ? K.linhaAlta : 1);
      if (rng.chance(p)) { estat[1 - i].contraAtaques++; evento(1 - i, "contra", `${tm(1 - i)} recupera a bola e sai em contra-ataque.`); emContra = true; atacar(1 - i, true); emContra = false; if (proximo) proximo.zona = "D"; }
    };
    e.ataques++; trilha = []; portador = null; bola = null; aposFalta = false;
    soltarCartoes();
    if (!contra && ultimoNarrado === i && !rodou) trilha.push(Object.assign([RETOMA[seq % RETOMA.length](tm(i))], { fechada: true }));
    atacante = i;
    ultimoAtaque = i; if (!contra) rodou = false;
    if (contra) inicio = "M";
    let lado = escolherLado(rng, atk, dz, inicio);
    if (inicio === "D") { const d0 = duelo(i, "D" + lado); if (!d0.venceu) return perdaDePosse(i, "D" + lado, d0); passo(i, "D" + lado, d0); }
    if (inicio !== "A") {
      if (inicio === "D") lado = escolherLado(rng, atk, dz, "M", lado);
      const d1 = duelo(i, "M" + lado, bonus, contra);
      if (!d1.venceu) { if (perdaDePosse(i, "M" + lado, d1)) perdeu(); return; }
      passo(i, "M" + lado, d1);
      lado = escolherLado(rng, atk, dz, "A", lado);
    }
    e.corredor[lado]++;
    const d = duelo(i, "A" + lado, bonus, contra);
    if (d.parada) {
      const penal = lado === "C" && rng.chance(CONFIG.penalti); // decidido aqui (era dentro de bolaParada), para o texto da falta já dizer se foi pênalti
      if (d.pivo && d.marcador) { recebe(d.pivo); evento(i, "falta", comTrilha(penal ? `Pênalti! ${nm(d.marcador)} derruba ${nm(d.pivo)} na área.` : `Falta de ${nm(d.marcador)} em ${nm(d.pivo)} ${ONDE.A(lado)}.`)); }
      return bolaParada(i, "falta", lado, penal);
    }
    if (!d.pivo || !atk.emCampo.includes(d.pivo)) { if (trilha.length) evento(1 - i, "posse", comTrilha(`${tm(1 - i)} fica com a bola ${ONDE.A(lado)}.`)); return; }
    const forcado = !d.venceu;
    if (forcado && lado !== "C" && rng.chance(CONFIG.escanteioDuelo)) { recebe(d.pivo); evento(1 - i, "canto", comTrilha(`${d.marcador ? nm(d.marcador) : tm(1 - i)} corta ${nm(d.pivo)} e cede o escanteio.`)); return bolaParada(i, "escanteio", lado); }
    if (forcado && !rng.chance(CONFIG.chuteForcado)) { if (perdaDePosse(i, "A" + lado, d)) perdeu(); return; }
    finalizar(i, criarChance(rng, atk, def, lado, d.pivo, { forcado, contra }));
  }

  for (min = 1; min <= 90; min++) {
    ordensESubstituicoes(0); ordensESubstituicoes(1);
    for (const t of times) for (const jog of t.emCampo) {
      const gasto = CONFIG.gastoEnergia * (1 - (jog.j.at[A.res] - 25) / 100) * (1 + CONFIG.pressaoGasto * t.instr.pressao) * (1 + 0.04 * Math.abs(t.instr.mentalidade)) * (jog.pos === "GK" ? CONFIG.gastoGoleiro : 1);
      jog.energia = Math.max(0, jog.energia - gasto);
    }
    const ritmo = CONFIG.ataquesPorMinuto * (1 + CONFIG.ritmoPorMentalidade * (times[0].instr.mentalidade + times[1].instr.mentalidade));
    const n = (rng.chance(Math.min(1, ritmo)) ? 1 : 0) + (rng.chance(Math.max(0, ritmo - 1)) ? 1 : 0);
    for (let k = 0; k <= n; k++) {
      if (sujo || (k === 0 && min % CONFIG.recalcularACada === 1)) {
        const g = gols();
        recalcular(times[0], g[0] - g[1]); recalcular(times[1], g[1] - g[0]);
        defesas = [montarDefesa(times[0], times[1]), montarDefesa(times[1], times[0])];
        const cc = Math.pow(times[0].controle, CONFIG.expoentePosse), cf = Math.pow(times[1].controle, CONFIG.expoentePosse);
        posseCasa = limitar(cc / (cc + cf), 0.25, 0.75);
        sujo = false;
      }
      if (k < n) {
        // Posse encadeada: quem sofreu o gol dá a saída; fora isso, a bola quase sempre passa para quem estava se defendendo.
        // O time de mais controle às vezes retoma a bola logo depois de perdê-la, na medida exata para que, no fim,
        // cada time faça a mesma fatia de ataques que a sua posse (cadeia de dois estados com essa fatia estacionária).
        let i;
        let zona = null;
        if (saida !== null) { i = saida; saida = null; zona = "D"; }
        else if (proximo && min !== 46) { i = proximo.time; zona = proximo.zona; }
        else if (cadeia === null || min === 46) i = rng.chance(posseCasa) ? 0 : 1;
        else {
          const p = cadeia === 0 ? posseCasa : 1 - posseCasa;
          i = rng.chance((1 - p) / Math.max(p, 1 - p)) ? 1 - cadeia : cadeia;
        }
        cadeia = i; // o contra-ataque é um ataque a mais de quem recuperou a bola: não conta como a vez dele na cadeia
        if (zona === null) zona = bola && bola.time === i && min !== 46 ? bola.zona : "D";
        proximo = null;
        atacar(i, false, zona);
      }
    }
    somaPosse += posseCasa;
  }
  min = 90;
  times.forEach(t => t.emCampo.forEach(jog => { jogadores[jog.j.id].energia = Math.round(jog.energia); }));
  estat[0].posse = Math.round(somaPosse / 90 * 100); estat[1].posse = 100 - estat[0].posse;
  soltarCartoes();
  const narracao = [...lances, ...eventos].sort((a, b) => a.n - b.n);
  // segundo de cada lance dentro do seu minuto, para a transmissão soltar um por vez em vez de todos no minuto cheio
  const porMinuto = {};
  narracao.forEach(l => (porMinuto[l.min] = porMinuto[l.min] || []).push(l));
  Object.values(porMinuto).forEach(g => g.forEach((l, k) => { l.s = Math.floor((k + 0.5) / g.length * 60); }));
  return { placar: gols(), xg: [estat[0].xg, estat[1].xg], estat, lances, eventos, narracao, jogadores, lesoes };
}
