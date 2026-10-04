// @ts-nocheck
// ARQUIVO GERADO por ferramentas/empacotar_funcao.py. Não editar à mão: mudar os módulos de src/ e gerar de novo.
//
// Trem Soccer · função do servidor que calcula as partidas cujo horário já chegou.
// Roda dentro do Supabase, com acesso total ao banco, e traz embutido o mesmo motor das páginas.
// Pode ser chamada por qualquer um e quantas vezes for: ela só calcula partida vencida e ainda não calculada,
// e reserva cada partida antes de calcular, então duas chamadas ao mesmo tempo não duplicam nada.
//
// Como publicar: painel do Supabase → Edge Functions → Deploy a new function → Via Editor → nome "rodada" →
// colar este arquivo inteiro → Deploy. Depois, nas configurações da função, desligar "Verify JWT".
import { createClient } from "npm:@supabase/supabase-js@2";

// >>> motor embutido
const __rng = (() => {
  // Gerador de números aleatórios com semente (mulberry32).
  // A mesma semente dá sempre o mesmo resultado, no navegador e no servidor.
  function criarRng(semente) {
    let a = (semente >>> 0) || 1;
    const n = () => {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    const int = (min, max) => min + Math.floor(n() * (max - min + 1));
    const pick = lista => lista[Math.floor(n() * lista.length)];
    // normal por Box-Muller
    const normal = (media, desvio) => media + desvio * Math.sqrt(-2 * Math.log(1 - n())) * Math.cos(2 * Math.PI * n());
    const chance = p => n() < p;
    const embaralhar = lista => {
      const l = lista.slice();
      for (let i = l.length - 1; i > 0; i--) { const j = int(0, i); [l[i], l[j]] = [l[j], l[i]]; }
      return l;
    };
    return { n, int, pick, normal, chance, embaralhar };
  }

  const limitar = (v, min, max) => Math.max(min, Math.min(max, v));
  return { criarRng, limitar };
})();

const __modelo = (() => {
  // Modelo de jogador: 22 atributos (os 21 do Dugout + Resistência), 18 posições e nota por posição.
  // Os pesos e os fatores de familiaridade são ponto de partida; a calibragem do motor pode mexer neles.

  const ATR_MIN = 1, ATR_MAX = 50;

  // grupo: gol (só goleiro), def, tec (técnicos de linha), fis, men
  const ATRIBUTOS = [
    { k: "ref", nome: "Reflexos", grupo: "gol" },
    { k: "um", nome: "Um contra um", grupo: "gol" },
    { k: "enc", nome: "Encaixe", grupo: "gol" },
    { k: "com", nome: "Comunicação", grupo: "men" },
    { k: "pos", nome: "Posicionamento", grupo: "men" },
    { k: "des", nome: "Desarme", grupo: "def" },
    { k: "mar", nome: "Marcação", grupo: "def" },
    { k: "cab", nome: "Cabeceio", grupo: "tec" },
    { k: "cru", nome: "Cruzamento", grupo: "tec" },
    { k: "cri", nome: "Criatividade", grupo: "tec" },
    { k: "pas", nome: "Passe", grupo: "tec" },
    { k: "dom", nome: "Domínio", grupo: "tec" },
    { k: "lon", nome: "Chute de longe", grupo: "tec" },
    { k: "fin", nome: "Finalização", grupo: "tec" },
    { k: "dri", nome: "Drible", grupo: "tec" },
    { k: "vel", nome: "Velocidade", grupo: "fis" },
    { k: "for", nome: "Força", grupo: "fis" },
    { k: "res", nome: "Resistência", grupo: "fis" },
    { k: "equ", nome: "Trabalho em equipe", grupo: "men" },
    { k: "agr", nome: "Agressividade", grupo: "men" },
    { k: "inf", nome: "Influência", grupo: "men" },
    { k: "exc", nome: "Excentricidade", grupo: "men" },
  ];
  const IDX = Object.fromEntries(ATRIBUTOS.map((a, i) => [a.k, i]));

  // linha: gol, defesa, ala, volante, meio, meia, ataque · lado: E, C, D
  const POSICOES = {
    GK: { nome: "Goleiro", linha: "gol", lado: "C", papel: "GK" },
    DC: { nome: "Zagueiro", linha: "defesa", lado: "C", papel: "DC" },
    SW: { nome: "Líbero", linha: "defesa", lado: "C", papel: "SW" },
    DR: { nome: "Lateral direito", linha: "defesa", lado: "D", papel: "LAT" },
    DL: { nome: "Lateral esquerdo", linha: "defesa", lado: "E", papel: "LAT" },
    WBR: { nome: "Ala direito", linha: "ala", lado: "D", papel: "ALA" },
    WBL: { nome: "Ala esquerdo", linha: "ala", lado: "E", papel: "ALA" },
    DMC: { nome: "Volante", linha: "volante", lado: "C", papel: "DMC" },
    MC: { nome: "Meio-campista", linha: "meio", lado: "C", papel: "MC" },
    AMC: { nome: "Meia-atacante", linha: "meia", lado: "C", papel: "AMC" },
    MR: { nome: "Meia direita", linha: "meio", lado: "D", papel: "MLAT" },
    ML: { nome: "Meia esquerda", linha: "meio", lado: "E", papel: "MLAT" },
    AMR: { nome: "Meia-atacante direito", linha: "meia", lado: "D", papel: "AMLAT" },
    AML: { nome: "Meia-atacante esquerdo", linha: "meia", lado: "E", papel: "AMLAT" },
    RW: { nome: "Ponta direita", linha: "ataque", lado: "D", papel: "PONTA" },
    LW: { nome: "Ponta esquerda", linha: "ataque", lado: "E", papel: "PONTA" },
    FC: { nome: "Atacante móvel", linha: "ataque", lado: "C", papel: "FC" },
    SC: { nome: "Centroavante", linha: "ataque", lado: "C", papel: "SC" },
  };
  const LISTA_POSICOES = Object.keys(POSICOES);

  // Peso de cada atributo na nota da posição (cada linha soma 100).
  const PESOS = {
    GK: { ref: 22, enc: 18, um: 16, pos: 16, com: 12, vel: 4, for: 4, inf: 4, equ: 4 },
    DC: { mar: 20, des: 20, pos: 16, cab: 14, for: 10, vel: 8, com: 6, equ: 3, pas: 3 },
    SW: { pos: 22, des: 14, vel: 14, mar: 10, com: 10, pas: 10, cab: 6, equ: 6, cri: 4, dom: 4 },
    LAT: { des: 18, mar: 16, vel: 16, pos: 12, cru: 10, res: 8, pas: 6, com: 4, equ: 4, for: 3, dri: 3 },
    ALA: { vel: 16, cru: 16, res: 12, des: 12, dri: 10, mar: 8, pos: 8, pas: 8, equ: 6, dom: 4 },
    DMC: { des: 20, pos: 20, mar: 12, pas: 12, for: 8, res: 8, equ: 8, cab: 4, dom: 4, agr: 4 },
    MC: { pas: 20, cri: 16, dom: 12, pos: 10, equ: 10, res: 8, des: 8, lon: 8, vel: 4, dri: 4 },
    AMC: { cri: 20, pas: 16, dom: 14, lon: 12, dri: 12, fin: 8, pos: 6, vel: 6, equ: 6 },
    MLAT: { cru: 18, pas: 14, vel: 12, dom: 10, cri: 10, dri: 10, res: 8, pos: 6, des: 6, equ: 6 },
    AMLAT: { dri: 18, cri: 14, cru: 12, vel: 12, pas: 10, dom: 10, lon: 8, fin: 8, pos: 4, equ: 4 },
    PONTA: { dri: 20, vel: 20, cru: 14, fin: 12, dom: 10, cri: 6, pos: 6, pas: 4, res: 4, lon: 4 },
    FC: { fin: 22, dom: 16, vel: 14, dri: 12, pos: 12, cri: 6, pas: 6, lon: 4, cab: 4, equ: 4 },
    SC: { fin: 22, cab: 20, for: 18, pos: 12, dom: 10, equ: 4, vel: 4, lon: 4, agr: 3, pas: 3 },
  };

  // Familiaridade com a posição, como no Dugout: Natural, Competente, Improvisado.
  const FAMILIARIDADE = { N: 1, C: 0.93, I: 0.8 };
  const NOME_FAMILIARIDADE = { N: "Natural", C: "Competente", I: "Improvisado" };

  // Posições parecidas, em que o jogador pode ser natural ou competente além da principal.
  const VIZINHAS = {
    GK: [],
    DC: ["SW", "DMC", "DR", "DL"],
    SW: ["DC", "DMC"],
    DR: ["WBR", "DL", "DC", "MR"],
    DL: ["WBL", "DR", "DC", "ML"],
    WBR: ["DR", "MR", "WBL"],
    WBL: ["DL", "ML", "WBR"],
    DMC: ["MC", "DC", "SW"],
    MC: ["DMC", "AMC", "MR", "ML"],
    AMC: ["MC", "AMR", "AML", "FC"],
    MR: ["AMR", "WBR", "ML", "MC"],
    ML: ["AML", "WBL", "MR", "MC"],
    AMR: ["MR", "RW", "AML", "AMC"],
    AML: ["ML", "LW", "AMR", "AMC"],
    RW: ["AMR", "LW", "FC"],
    LW: ["AML", "RW", "FC"],
    FC: ["SC", "AMC", "RW", "LW"],
    SC: ["FC"],
  };

  const familiaridade = (jogador, pos) => jogador.fam[pos] || "I";

  // Nota do jogador numa posição, na escala dos atributos (1 a 50), sem a familiaridade.
  function notaBruta(atributos, pos) {
    const pesos = PESOS[POSICOES[pos].papel];
    let soma = 0;
    for (const k in pesos) soma += pesos[k] * atributos[IDX[k]];
    return soma / 100;
  }

  const notaNaPosicao = (jogador, pos) => notaBruta(jogador.at, pos) * FAMILIARIDADE[familiaridade(jogador, pos)];

  function melhorPosicao(jogador) {
    let melhor = null;
    for (const pos of LISTA_POSICOES) {
      const nota = notaNaPosicao(jogador, pos);
      if (!melhor || nota > melhor.nota) melhor = { pos, nota };
    }
    return melhor;
  }
  return { ATR_MIN, ATRIBUTOS, IDX, POSICOES, LISTA_POSICOES, PESOS, FAMILIARIDADE, NOME_FAMILIARIDADE, VIZINHAS, familiaridade, notaBruta, notaNaPosicao, melhorPosicao };
})();

const __escalacao = (() => {
  // Formações de referência e escalação automática simples (o melhor disponível para cada vaga).
  const { notaNaPosicao } = __modelo;
  const FORMACOES = {
    "4-4-2": ["GK", "DR", "DC", "DC", "DL", "MR", "MC", "MC", "ML", "FC", "SC"],
    "4-3-3 com pontas": ["GK", "DR", "DC", "DC", "DL", "DMC", "MC", "MC", "RW", "LW", "SC"],
    "4-2-3-1": ["GK", "DR", "DC", "DC", "DL", "DMC", "DMC", "AMR", "AMC", "AML", "SC"],
    "3-5-2 com alas": ["GK", "DC", "DC", "DC", "WBR", "WBL", "DMC", "MC", "MC", "FC", "SC"],
    "4-5-1": ["GK", "DR", "DC", "DC", "DL", "MR", "MC", "DMC", "MC", "ML", "SC"],
    "4-3-3 do Dugout (1 MC, 3 FC)": ["GK", "DR", "DC", "DC", "DL", "MR", "MC", "ML", "FC", "FC", "FC"],
  };

  // Preenche as vagas pegando sempre o par (vaga, jogador) de maior nota entre os que sobraram.
  function escalar(elenco, vagas) {
    const livres = new Set(elenco), escalacao = new Array(vagas.length).fill(null);
    for (let n = 0; n < vagas.length; n++) {
      let melhor = null;
      vagas.forEach((pos, i) => {
        if (escalacao[i]) return;
        for (const j of livres) {
          const nota = notaNaPosicao(j, pos);
          if (!melhor || nota > melhor.nota) melhor = { i, j, pos, nota };
        }
      });
      if (!melhor) break;
      escalacao[melhor.i] = { j: melhor.j, pos: melhor.pos };
      livres.delete(melhor.j);
    }
    return escalacao.filter(Boolean);
  }
  return { FORMACOES, escalar };
})();

const __motor = (() => {
  // Motor da partida.
  // Campo em 9 zonas: 3 linhas (D defesa, M meio, A ataque) x 3 lados (E, C, D), sempre vistas pelo time que as ocupa.
  // Cada ataque passa por três duelos de zona (saída de bola, construção, criação) e, se vencer, vira uma chance com xG.
  // Passo D: instruções, energia, substituições e ordens condicionais, faltas, cartões, lesões e bola parada.
  // As constantes saíram da calibragem (calibragem.html).
  const { limitar } = __rng;
  const { IDX, FAMILIARIDADE, familiaridade, notaNaPosicao } = __modelo;
  const CONFIG = {
    ataquesPorMinuto: 0.92, // ataques iniciados por minuto, somando os dois times
    mando: 1.04, // multiplicador da força do mandante
    expoentePosse: 1,
    expoenteCorredor: 1.5,
    pesoCentro: 1.15, // o jogo pelo centro é um pouco mais natural
    zonaVazia: 6, // força mínima de uma zona, para zona sem ninguém não virar divisão por zero
    inclinacaoDuelo: 1.2, // quanto a diferença de força pesa no duelo; mais alto, o melhor time vence mais
    baseDuelo: { D: 1.5, M: 0.45, A: 0.1 }, // logit do sucesso com forças iguais: cerca de 82%, 61% e 52%
    ajudaAoCentro: 0.5, // quanto da defesa dos lados fecha o centro quando o adversário não ameaça pelos lados
    continuidade: 1.3, // preferência por seguir no mesmo lado de uma linha para a outra
    pesoCentroPosse: 1.5, // o centro do meio-campo pesa mais na posse do que os lados
    vantagemFinalizador: 3, // somado ao atributo de quem chuta, na disputa com o goleiro
    xgBase: { cruzamento: 0.11, corte: 0.09, profundidade: 0.19, area: 0.13, longe: 0.05, escanteio: 0.09, falta: 0.06, penalti: 0.76 },
    inclinacaoXg: 1.2,
    inclinacaoFinalizacao: 1.5,
    fatorLibero: 0.8, // o líbero reduz o xG das bolas em profundidade
    pesoTipo: { profundidade: 0.25, area: 0.4, longe: 0.3, cruzamento: 0.6, corte: 0.4 }, // mistura dos tipos de chance, pelo centro e pelos lados
    chuteForcado: 0.12, // chance de sair um chute de longe, pior, quando o duelo no ataque é perdido
    fatorChuteForcado: 0.7,
    semGol: { defesa: 0.33, fora: 0.47, trave: 0.04, bloqueado: 0.16 }, // destino das finalizações que não viram gol

    // instruções
    mentalidadeAtaque: 0.06, // por nível de mentalidade: força no meio e no ataque
    mentalidadeDefesa: 0.065, // por nível de mentalidade ofensiva: força que a defesa perde
    mentalidadeRetranca: 0.065, // por nível de mentalidade defensiva: força que a defesa ganha (fechar é mais fácil que criar)
    espacoPorMentalidade: 0.2, // por nível de mentalidade de quem defende: espaço para a bola em profundidade do adversário
    ritmoPorMentalidade: 0.03, // por nível, somando os dois times: jogo mais aberto tem mais ataques
    mentalidadePosse: 0.02,
    agressividadeDefesa: 0.035, // por nível: força nos duelos defensivos
    pressaoDefesa: 0.09, // por nível: força na marcação do meio para a frente
    pressaoGasto: 0.25, // por nível: energia gasta a mais
    ladoPreferido: 1.6, ladosPreferidos: 1.35,
    passeCurto: { M: 1.06, A: 0.97 }, passeLongo: { M: 0.94, logitM: 0.2, logitA: -0.1 },
    contraAtaque: { com: 0.16, sem: 0.04, logit: 0.3, posse: 0.92, porMentalidade: 0.25 },
    impedimento: { semLinha: 0.07, base: 0.3, porComunicacao: 0.01, libero: -0.15, furou: 1.25 },
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
    penalti: 0.07, // das faltas no centro do ataque
    faltaDireta: 0.35, // das faltas no ataque que não são pênalti
  };

  const INSTRUCOES_PADRAO = {
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
  const ZONAS = ["DE", "DC", "DD", "ME", "MC", "MD", "AE", "AC", "AD"];
  const NOME_LADO = { E: "esquerda", C: "centro", D: "direita" };

  // A zona de ataque de um time é a zona de defesa do outro, com o lado trocado.
  const ESPELHO_LINHA = { D: "A", M: "M", A: "D" }, ESPELHO_LADO = { E: "D", C: "C", D: "E" };
  const espelho = z => ESPELHO_LINHA[z[0]] + ESPELHO_LADO[z[1]];

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
  const COBERTURA = {
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
  function prepararTime({ nome, escalacao, banco = [], instrucoes = {}, mandante = false }) {
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
    if (I.passe === "curto") { mAtk.M *= CONFIG.passeCurto.M; mAtk.A *= CONFIG.passeCurto.A; }
    if (I.passe === "longo") mAtk.M *= CONFIG.passeLongo.M;
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
  function avaliarZonas(escalacao) {
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
    const estilo = { profundidade: (I.passe === "longo" ? 1.2 : 1) * (contra ? 2 : 1) * espaco, area: I.passe === "curto" ? 1.2 : I.passe === "longo" ? 0.8 : 1, longe: I.passe === "curto" ? 0.8 : 1, cruzamento: I.passe === "longo" ? 1.2 : 1, corte: 1 };
    const opcoes = lado === "C"
      ? [["profundidade", pt.profundidade * alvoVeloz * estilo.profundidade], ["area", pt.area * presenca * estilo.area], ["longe", pt.longe * estilo.longe]]
      : [["cruzamento", pt.cruzamento * alvoAereo * estilo.cruzamento], ["corte", pt.corte]];
    const tipo = forcado ? "longe" : sortearPeso(rng, opcoes, o => o[1])[0];
    const zagueiro = (sortearPeso(rng, def.zonas.DC, o => o.w) || {}).jog;
    const zag = zagueiro ? zagueiro.at : null, gk = def.goleiro ? def.goleiro.at : null;
    const semZaga = 12, semGoleiro = 5; // valores usados quando não há zagueiro na zona ou goleiro em campo
    const c = { tipo, lado, criador: pivo, finalizador: pivo, zagueiro };
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
    c.xg = limitar(c.xg, 0.01, 0.6);
    return c;
  }

  function narrar(c, resultado, goleiro) {
    const f = c.finalizador.j.nome, cr = c.criador.j.nome, lado = NOME_LADO[c.lado];
    const inicio = {
      cruzamento: `${cr} cruza da ${lado} e ${f} sobe para cabecear`,
      corte: `${f} corta da ${lado} para dentro e chuta`,
      profundidade: `${cr} lança em profundidade e ${f} sai na cara do gol`,
      area: c.criador === c.finalizador ? `${f} recebe na área e finaliza` : `${cr} acha ${f} na área, que finaliza`,
      longe: `${f} arrisca de fora da área`,
      escanteio: `${cr} cobra o escanteio e ${f} cabeceia`,
      falta: c.criador === c.finalizador ? `${f} cobra a falta direto para o gol` : `${cr} levanta a falta na área e ${f} cabeceia`,
      penalti: `Pênalti! ${f} cobra`,
    }[c.tipo];
    const fim = {
      gol: "GOL!",
      defesa: goleiro ? `${goleiro.j.nome} defende.` : "a bola para na defesa.",
      fora: "para fora.",
      trave: "na trave!",
      bloqueado: c.zagueiro ? `${c.zagueiro.j.nome} bloqueia.` : "a zaga bloqueia.",
    }[resultado];
    return `${inicio}: ${fim}`;
  }

  const novaEstatistica = () => ({
    posse: 0, ataques: 0, contraAtaques: 0, corredor: { E: 0, C: 0, D: 0 }, chances: 0, finalizacoes: 0, noGol: 0, xg: 0, gols: 0,
    faltas: 0, amarelos: 0, vermelhos: 0, escanteios: 0, impedimentos: 0, substituicoes: 0,
    zonas: Object.fromEntries(ZONAS.map(z => [z, [0, 0]])), // duelos de ataque vencidos e perdidos por zona
  });

  // Simula uma partida inteira. O mesmo rng (mesma semente) dá sempre o mesmo jogo.
  function simularPartida(rng, casa, fora) {
    const times = [iniciar(casa), iniciar(fora)], estat = [novaEstatistica(), novaEstatistica()];
    const jogadores = {}, lances = [], eventos = [], lesoes = [];
    const ficha = (jog, i) => jogadores[jog.j.id] || (jogadores[jog.j.id] = { nome: jog.j.nome, pos: jog.pos, time: i, entrou: 0, saiu: null, gols: 0, finalizacoes: 0, xg: 0, duelosGanhos: 0, duelosPerdidos: 0, duelosEsperados: 0, faltas: 0, amarelos: 0, vermelho: false, lesionado: false, energia: 100 });
    times.forEach((t, i) => t.emCampo.forEach(jog => ficha(jog, i)));
    let min = 0, sujo = true, posseCasa = 0.5, defesas = null, somaPosse = 0;
    const gols = () => [estat[0].gols, estat[1].gols];
    const evento = (i, tipo, texto) => eventos.push({ min, time: i, tipo, texto });
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
        evento(i, "ordem", `${t.nome} muda a forma de jogar.`);
      });
      t.instr.substituicoes.forEach((s, k) => {
        if (t.subsFeitas.has(k) || min < (s.min || 0) || t.subs >= CONFIG.maxSubstituicoes) return;
        const sai = t.emCampo.find(x => x.j.id === s.sai), entra = t.banco.find(x => x.id === s.entra);
        if (!sai || !entra) { if (!sai && min >= (s.min || 0)) t.subsFeitas.add(k); return; }
        if (!condicao(i, s.cond, sai)) return;
        t.subsFeitas.add(k); sair(i, sai); entrar(i, entra, s.pos || sai.pos);
        evento(i, "substituicao", `Sai ${sai.j.nome}, entra ${entra.nome}.`);
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
      evento(i, "substituicao", `Entra ${entra.nome} no lugar de ${jog.j.nome}.`);
    }
    function falta(i, marcador) { // i: time que cometeu
      const t = times[i], s = jogadores[marcador.j.id];
      estat[i].faltas++; s.faltas++;
      if (rng.chance(CONFIG.vermelhoDireto)) return expulsar(i, marcador, `${marcador.j.nome} é expulso por entrada violenta!`);
      if (!rng.chance(CONFIG.amarelo * (1 + CONFIG.amareloPorAgressividade * t.instr.agressividade) * (marcador.amarelos ? CONFIG.cuidadoComAmarelo : 1))) return;
      marcador.amarelos++; s.amarelos++; estat[i].amarelos++;
      if (marcador.amarelos >= 2) return expulsar(i, marcador, `Segundo amarelo: ${marcador.j.nome} está expulso!`);
      evento(i, "amarelo", `Cartão amarelo para ${marcador.j.nome}.`);
    }
    function expulsar(i, jog, texto) {
      estat[i].vermelhos++; jogadores[jog.j.id].vermelho = true;
      sair(i, jog); evento(i, "vermelho", texto);
    }

    // Duelo de zona: força de ataque de um time contra a força de defesa do outro na zona espelhada.
    function duelo(i, zona, logit = 0) {
      const atk = times[i], def = times[1 - i], dz = defesas[i], e = estat[i];
      const a = atk.atk[zona] + CONFIG.zonaVazia, d = dz[zona] + CONFIG.zonaVazia;
      const longo = atk.instr.passe === "longo" ? (zona[0] === "M" ? CONFIG.passeLongo.logitM : zona[0] === "A" ? CONFIG.passeLongo.logitA : 0) : 0;
      const p = 1 / (1 + Math.exp(-(CONFIG.baseDuelo[zona[0]] + logit + longo + CONFIG.inclinacaoDuelo * Math.log(a / d))));
      let venceu = rng.chance(p), parada = false;
      const pivo = (sortearPeso(rng, atk.zonas[zona], x => x.p) || {}).jog, marcador = (sortearPeso(rng, def.zonas[espelho(zona)], x => x.w) || {}).jog;
      if (marcador && rng.chance(CONFIG.falta * (1 + CONFIG.faltaPorAgressividade * def.instr.agressividade) * Math.sqrt(marcador.j.at[A.agr] / 25))) {
        falta(1 - i, marcador);
        if (zona[0] === "A") parada = true; else venceu = true; // falta no ataque vira bola parada; atrás, a jogada segue
      } else {
        e.zonas[zona][venceu ? 0 : 1]++;
        if (pivo) registrar(pivo, venceu, p);
        if (marcador) registrar(marcador, !venceu, 1 - p);
      }
      if (pivo && rng.chance(CONFIG.lesao * (1 + 0.2 * def.instr.agressividade))) {
        const r = rng.n(), dias = r < 0.5 ? rng.int(1, 3) : r < 0.8 ? rng.int(4, 10) : rng.int(11, 30);
        jogadores[pivo.j.id].lesionado = true; lesoes.push({ id: pivo.j.id, time: i, dias });
        sair(i, pivo); evento(i, "lesao", `${pivo.j.nome} se machuca e não continua.`); reporLesionado(i, pivo);
        return { venceu: false, pivo: null, marcador, parada: false };
      }
      return { venceu, pivo, marcador, parada };
    }

    function finalizar(i, c) {
      const atk = times[i], def = times[1 - i], e = estat[i];
      if (c.tipo === "profundidade") {
        const K = CONFIG.impedimento;
        const p = def.instr.impedimento ? limitar(K.base + (def.comDefesa - 25) * K.porComunicacao + (def.temLibero ? K.libero : 0), 0.05, 0.5) : K.semLinha;
        if (rng.chance(p)) { e.impedimentos++; evento(i, "impedimento", `${c.finalizador.j.nome} é pego em impedimento.`); return; }
        if (def.instr.impedimento) c.xg = limitar(c.xg * K.furou, 0.01, 0.6);
      }
      const ruido = def.goleiro ? rng.normal(0, def.goleiro.j.at[A.exc] * CONFIG.excentricidade) : 0;
      const k = c.tipo === "penalti" ? 0.6 : CONFIG.inclinacaoFinalizacao;
      const pGol = limitar(c.xg * mod(c.chute + CONFIG.vantagemFinalizador, c.defesa + ruido, k), 0.005, 0.92);
      const resultado = rng.chance(pGol) ? "gol" : sortearPeso(rng, Object.entries(CONFIG.semGol), o => o[1])[0];
      e.chances++; e.xg += c.xg; e.finalizacoes++;
      if (resultado === "gol" || resultado === "defesa") e.noGol++;
      if (resultado === "gol") { e.gols++; sujo = true; }
      const sf = jogadores[c.finalizador.j.id];
      sf.finalizacoes++; sf.xg += c.xg; if (resultado === "gol") sf.gols++;
      lances.push({ min, time: i, tipo: c.tipo, lado: c.lado, xg: c.xg, resultado, finalizador: c.finalizador.j.id, criador: c.criador.j.id, goleiro: def.goleiro ? def.goleiro.j.id : null, texto: narrar(c, resultado, def.goleiro) });
      if ((resultado === "defesa" || resultado === "bloqueado") && c.tipo !== "penalti" && rng.chance(CONFIG.escanteio)) bolaParada(i, "escanteio", "C");
    }

    function cobrador(t, tipo, nota) {
      for (const id of t.instr.cobradores[tipo] || []) { const jog = t.emCampo.find(x => x.j.id === id); if (jog) return jog; }
      const linha = t.emCampo.filter(x => x.pos !== "GK");
      return linha.length ? linha.reduce((m, x) => nota(x.at) > nota(m.at) ? x : m) : null;
    }
    // Bola levantada na área em escanteio ou falta: os melhores no jogo aéreo sobem, zagueiros inclusive.
    function bolaAlcada(i, tipo, quem) {
      const atk = times[i], def = times[1 - i], k = CONFIG.inclinacaoXg;
      if (!rng.chance(CONFIG.cabecadaEscanteio)) return;
      const sobem = atk.emCampo.filter(x => x.pos !== "GK" && x !== quem), marcam = def.emCampo.filter(x => x.pos !== "GK");
      if (!sobem.length) return;
      const alvo = sortearPeso(rng, sobem, x => Math.pow(x.at[A.cab] + x.at[A.for], 2) * (x.j.id === atk.instr.alvo ? CONFIG.pesoAlvo : 1));
      const zag = sortearPeso(rng, marcam, x => x.at[A.cab] + x.at[A.mar]), gk = def.goleiro ? def.goleiro.at : null;
      const c = { tipo, lado: "C", criador: quem, finalizador: alvo, zagueiro: zag };
      c.xg = limitar(CONFIG.xgBase.escanteio * Math.pow(mod(quem.at[A.cru], 28, k), 0.6) * mod(media(alvo.at[A.cab], alvo.at[A.for]), zag ? media(zag.at[A.cab], zag.at[A.mar], zag.at[A.for]) : 12, k), 0.01, 0.6);
      c.chute = alvo.at[A.cab]; c.defesa = gk ? media(gk[A.enc], gk[A.pos]) : 5;
      finalizar(i, c);
    }
    function bolaParada(i, tipo, lado) {
      const atk = times[i], def = times[1 - i], gk = def.goleiro ? def.goleiro.at : null;
      if (tipo === "escanteio") {
        estat[i].escanteios++;
        const quem = cobrador(atk, "escanteio", at => at[A.cru]);
        if (quem) bolaAlcada(i, "escanteio", quem);
      } else if (lado === "C" && rng.chance(CONFIG.penalti)) {
        const quem = cobrador(atk, "penalti", at => at[A.fin]);
        if (quem) finalizar(i, { tipo: "penalti", lado: "C", criador: quem, finalizador: quem, zagueiro: null, xg: CONFIG.xgBase.penalti, chute: quem.at[A.fin], defesa: gk ? gk[A.um] : 5 });
      } else {
        const nota = at => at[A.lon] * 0.6 + at[A.cri] * 0.4, quem = cobrador(atk, "falta", nota);
        if (!quem) return;
        if (rng.chance(CONFIG.faltaDireta)) finalizar(i, { tipo: "falta", lado, criador: quem, finalizador: quem, zagueiro: null, xg: limitar(CONFIG.xgBase.falta * mod(nota(quem.at), 26, CONFIG.inclinacaoXg), 0.01, 0.6), chute: nota(quem.at), defesa: gk ? media(gk[A.ref], gk[A.pos]) : 5 });
        else bolaAlcada(i, "falta", quem);
      }
    }

    function atacar(i, contra = false) {
      const atk = times[i], def = times[1 - i], dz = defesas[i], e = estat[i];
      const bonus = contra ? CONFIG.contraAtaque.logit : 0;
      // quem recupera a bola pode sair em contra-ataque, mais ainda contra time que joga para a frente
      const perdeu = () => {
        if (contra) return;
        const K = CONFIG.contraAtaque, p = (def.instr.contraAtaque ? K.com : K.sem) * (1 + K.porMentalidade * Math.max(0, atk.instr.mentalidade));
        if (rng.chance(p)) { estat[1 - i].contraAtaques++; atacar(1 - i, true); }
      };
      e.ataques++;
      let lado = escolherLado(rng, atk, dz, contra ? "M" : "D");
      if (!contra && !duelo(i, "D" + lado).venceu) return;
      lado = escolherLado(rng, atk, dz, "M", lado);
      if (!duelo(i, "M" + lado, bonus).venceu) return perdeu();
      lado = escolherLado(rng, atk, dz, "A", lado);
      e.corredor[lado]++;
      const d = duelo(i, "A" + lado, bonus);
      if (d.parada) return bolaParada(i, "falta", lado);
      if (!d.pivo || !atk.emCampo.includes(d.pivo)) return;
      const forcado = !d.venceu;
      if (forcado && lado !== "C" && rng.chance(CONFIG.escanteioDuelo)) return bolaParada(i, "escanteio", lado);
      if (forcado && !rng.chance(CONFIG.chuteForcado)) return perdeu();
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
        if (k < n) atacar(rng.chance(posseCasa) ? 0 : 1);
      }
      somaPosse += posseCasa;
    }
    min = 90;
    times.forEach(t => t.emCampo.forEach(jog => { jogadores[jog.j.id].energia = Math.round(jog.energia); }));
    estat[0].posse = Math.round(somaPosse / 90 * 100); estat[1].posse = 100 - estat[0].posse;
    const narracao = [...lances, ...eventos].sort((a, b) => a.min - b.min);
    return { placar: gols(), xg: [estat[0].xg, estat[1].xg], estat, lances, eventos, narracao, jogadores, lesoes };
  }
  return { CONFIG, INSTRUCOES_PADRAO, ZONAS, espelho, COBERTURA, prepararTime, avaliarZonas, simularPartida };
})();

const __bot = (() => {
  // Tática de bot: vale para clubes sem dono e para dirigentes há 21 dias sem acessar.
  // O bot joga certo, mas sem ler o adversário: escolhe a formação que melhor aproveita o elenco e instruções neutras.
  const { IDX, notaNaPosicao } = __modelo;
  const { FORMACOES, escalar } = __escalacao;
  const { avaliarZonas } = __motor;
  const FORMACOES_BOT = ["4-4-2", "4-3-3 com pontas", "4-2-3-1", "3-5-2 com alas", "4-5-1"];
  const FAVORITO = 2; // diferença de nota média a partir da qual o bot se considera favorito ou azarão
  const A = IDX;

  const mediaNotas = escalacao => escalacao.reduce((s, x) => s + notaNaPosicao(x.j, x.pos), 0) / escalacao.length;
  const melhores = (lista, nota, n) => lista.slice().sort((a, b) => nota(b) - nota(a)).slice(0, n).map(x => x.j.id);

  // elenco: jogadores disponíveis (sem lesionados e suspensos). forcaAdversario: nota média do onze do adversário, se conhecida.
  function taticaBot(elenco, { mandante = false, forcaAdversario = null } = {}) {
    // formação: a que dá a maior nota somada ao melhor onze disponível
    let melhor = null;
    for (const nome of FORMACOES_BOT) {
      const escalacao = escalar(elenco, FORMACOES[nome]);
      if (escalacao.length < 11) continue;
      const forca = mediaNotas(escalacao);
      if (!melhor || forca > melhor.forca) melhor = { formacao: nome, escalacao, forca };
    }
    if (!melhor) { const escalacao = escalar(elenco, FORMACOES["4-4-2"]); melhor = { formacao: "4-4-2", escalacao, forca: escalacao.length ? mediaNotas(escalacao) : 0 }; }
    const { formacao, escalacao, forca } = melhor;

    // banco: um goleiro e os seis melhores que sobraram
    const fora = elenco.filter(j => !escalacao.some(x => x.j === j)).sort((a, b) => notaNaPosicao(b, b.pos) - notaNaPosicao(a, a.pos));
    const banco = [...fora.filter(j => j.pos === "GK").slice(0, 1), ...fora.filter(j => j.pos !== "GK").slice(0, 6)];

    // mentalidade: normal; um nível acima se é favorito ou joga em casa, um abaixo se é azarão
    const dif = forcaAdversario == null ? 0 : forca - forcaAdversario;
    const mentalidade = dif <= -FAVORITO ? -1 : (dif >= FAVORITO || mandante) ? 1 : 0;

    // lado: o próprio corredor mais forte, se houver um claramente melhor
    const { atk } = avaliarZonas(escalacao);
    const lado = atk.AE > atk.AD * 1.25 ? "E" : atk.AD > atk.AE * 1.25 ? "D" : "misto";

    const linha = escalacao.filter(x => x.pos !== "GK");
    // até três trocas, aos 60, 70 e 80: saem os de menor Resistência que tenham reserva à altura para a posição
    const livres = banco.filter(j => j.pos !== "GK"), substituicoes = [];
    for (const x of linha.slice().sort((a, b) => a.j.at[A.res] - b.j.at[A.res])) {
      if (substituicoes.length === 3 || !livres.length) break;
      livres.sort((a, b) => notaNaPosicao(b, x.pos) - notaNaPosicao(a, x.pos));
      if (notaNaPosicao(livres[0], x.pos) < 0.85 * notaNaPosicao(x.j, x.pos)) continue; // sem reserva à altura para a posição
      substituicoes.push({ min: 60 + 10 * substituicoes.length, sai: x.j.id, entra: livres.shift().id, cond: "sempre" });
    }

    const porInfluencia = melhores(escalacao, x => x.j.at[A.inf], 2);
    const meias = linha.filter(x => ["MC", "AMC", "DMC", "AMR", "AML", "MR", "ML"].includes(x.pos));
    const atacantes = linha.filter(x => ["SC", "FC"].includes(x.pos));
    const instrucoes = {
      mentalidade, agressividade: 0, pressao: 0, passe: "misto", lado, contraAtaque: false, impedimento: false,
      capitao: porInfluencia[0], vice: porInfluencia[1],
      armador: melhores(meias.length ? meias : linha, x => x.j.at[A.cri], 1)[0],
      alvo: melhores(atacantes.length ? atacantes : linha, x => x.j.at[A.cab] + x.j.at[A.for], 1)[0],
      cobradores: {
        escanteio: melhores(linha, x => x.j.at[A.cru], 3),
        falta: melhores(linha, x => x.j.at[A.lon] * 0.6 + x.j.at[A.cri] * 0.4, 3),
        penalti: melhores(linha, x => x.j.at[A.fin], 5),
      },
      substituicoes,
      ordens: [
        { min: 70, cond: "perdendo", muda: { mentalidade: Math.min(2, mentalidade + 1) } },
        { min: 80, cond: "ganhando", muda: { mentalidade: Math.max(-2, mentalidade - 1) } },
      ],
    };
    return { formacao, escalacao, banco, instrucoes, forca };
  }
  return { FORMACOES_BOT, taticaBot };
})();

const __relatorio = (() => {
  // Relatório da partida: resultado esperado pelo xG, notas dos jogadores, mapa de zonas e comentário do analista.
  const { ZONAS } = __motor;
  // Distribuição do número de gols a partir do xG de cada finalização (cada uma entra ou não, de forma independente).
  function distribuicaoGols(xgs) {
    let d = [1];
    for (const p of xgs) {
      const n = new Array(d.length + 1).fill(0);
      d.forEach((v, k) => { n[k] += v * (1 - p); n[k + 1] += v * p; });
      d = n;
    }
    return d;
  }

  // Chance de vitória, empate e derrota do time 0 e pontos esperados de cada um, pelas chances que cada time criou.
  function resultadoEsperado(lances) {
    const d = [0, 1].map(i => distribuicaoGols(lances.filter(l => l.time === i).map(l => l.xg)));
    let v = 0, e = 0;
    d[0].forEach((pa, a) => d[1].forEach((pb, b) => { if (a > b) v += pa * pb; else if (a === b) e += pa * pb; }));
    const der = 1 - v - e;
    return { vitoria: v, empate: e, derrota: der, pontos: [3 * v + e, 3 * der + e] };
  }

  const limitar = (v, min, max) => Math.max(min, Math.min(max, v));

  // Nota de 1 a 10: duelos vencidos acima ou abaixo do esperado, gols, assistências, chances, cartões; goleiro pelas defesas e pelo xG que enfrentou.
  function notas(partida) {
    const extra = {};
    const de = id => extra[id] || (extra[id] = { assistencias: 0, defesas: 0, sofridos: 0, xgContra: 0 });
    for (const l of partida.lances) {
      if (l.resultado === "gol" && l.criador !== l.finalizador) de(l.criador).assistencias++;
      if (l.goleiro) {
        const g = de(l.goleiro);
        if (l.resultado === "defesa") g.defesas++;
        if (l.resultado === "gol") g.sofridos++;
        if (l.resultado === "gol" || l.resultado === "defesa") g.xgContra += l.xg;
      }
    }
    return Object.entries(partida.jogadores).map(([id, j]) => {
      const x = de(id), minutos = (j.saiu === null ? 90 : j.saiu) - j.entrou;
      let nota = 6;
      if (j.pos === "GK") nota += 0.3 * x.defesas - 0.4 * x.sofridos + 0.6 * (x.xgContra - x.sofridos);
      else nota += limitar(0.4 * (j.duelosGanhos - j.duelosEsperados), -2, 2) + 1.1 * j.gols + 0.6 * x.assistencias + 0.5 * (j.xg - j.gols * 0.5) - 0.08 * j.faltas;
      nota -= 0.3 * Math.min(1, j.amarelos) + (j.vermelho ? 1.5 : 0);
      return { id, ...j, ...x, minutos, nota: limitar(Math.round(nota * 10) / 10, 1, 10) };
    });
  }

  const NOME_ZONA = { DE: "defesa esquerda", DC: "centro da defesa", DD: "defesa direita", ME: "meio esquerdo", MC: "centro do meio", MD: "meio direito", AE: "ataque pela esquerda", AC: "ataque pelo centro", AD: "ataque pela direita" };
  const pc = v => Math.round(v * 100) + "%";
  const f2 = v => v.toFixed(2).replace(".", ",");

  // Comentário do analista para o time i. nivel 1 a 3: quanto melhor o analista, mais ele enxerga.
  function analise(partida, esperado, jogadores, i, nivel) {
    const eu = partida.estat[i], ele = partida.estat[1 - i], frases = [];
    const saldo = eu.gols - ele.gols, difXg = eu.xg - ele.xg;
    // 1. o resultado foi justo?
    if (saldo < 0 && difXg > 0.4) frases.push(`Resultado injusto: criamos ${f2(eu.xg)} de xG contra ${f2(ele.xg)} e perdemos. Com as mesmas chances, venceríamos ${pc(i === 0 ? esperado.vitoria : esperado.derrota)} das vezes.`);
    else if (saldo > 0 && difXg < -0.4) frases.push(`Vencemos, mas o adversário criou mais: ${f2(ele.xg)} de xG contra ${f2(eu.xg)}. Não dá para contar com isso sempre.`);
    else if (saldo === 0 && Math.abs(difXg) > 0.6) frases.push(difXg > 0 ? `O empate ficou barato para o adversário: tivemos ${f2(eu.xg)} de xG contra ${f2(ele.xg)}.` : `O empate foi bom negócio: o adversário teve ${f2(ele.xg)} de xG contra ${f2(eu.xg)}.`);
    else frases.push(`O placar reflete o jogo: ${f2(eu.xg)} de xG nosso contra ${f2(ele.xg)} do adversário.`);
    // 2. pontaria
    if (eu.gols - eu.xg <= -1) frases.push(`Faltou pontaria: ${eu.finalizacoes} finalizações e ${eu.gols} ${eu.gols === 1 ? "gol" : "gols"} para ${f2(eu.xg)} de xG.`);
    else if (eu.gols - eu.xg >= 1) frases.push(`Aproveitamento acima do normal: ${eu.gols} gols com ${f2(eu.xg)} de xG.`);
    if (nivel < 2) return frases;
    // 3. zonas: onde atacamos melhor e onde o adversário passou
    const taxa = (e, z) => { const [g, p] = e.zonas[z]; return g + p >= 6 ? g / (g + p) : null; };
    const ataque = ["AE", "AC", "AD"].map(z => [z, taxa(eu, z)]).filter(x => x[1] !== null).sort((a, b) => b[1] - a[1]);
    if (ataque.length) frases.push(`Nosso melhor caminho foi o ${NOME_ZONA[ataque[0][0]]}: ${pc(ataque[0][1])} dos duelos vencidos.`);
    const espelho = { AE: "DD", AC: "DC", AD: "DE" };
    const sofrido = ["AE", "AC", "AD"].map(z => [espelho[z], taxa(ele, z)]).filter(x => x[1] !== null).sort((a, b) => b[1] - a[1]);
    if (sofrido.length && sofrido[0][1] > 0.5) frases.push(`O adversário passou mais pela nossa ${NOME_ZONA[sofrido[0][0]]}: venceu ${pc(sofrido[0][1])} dos duelos ali.`);
    const meio = ["ME", "MC", "MD"].reduce((s, z) => { s[0] += eu.zonas[z][0]; s[1] += eu.zonas[z][1]; return s; }, [0, 0]);
    if (meio[0] + meio[1] >= 10) frases.push(`No meio-campo vencemos ${pc(meio[0] / (meio[0] + meio[1]))} dos duelos com a bola e tivemos ${eu.posse}% de posse.`);
    if (nivel < 3) return frases;
    // 4. jogadores e energia
    const meus = jogadores.filter(j => j.time === i && j.minutos >= 30);
    if (meus.length) {
      const ord = meus.slice().sort((a, b) => b.nota - a.nota), melhor = ord[0], pior = ord[ord.length - 1];
      frases.push(`Melhor em campo do nosso lado: ${melhor.nome} (nota ${String(melhor.nota).replace(".", ",")}). Quem menos rendeu: ${pior.nome} (${String(pior.nota).replace(".", ",")}).`);
      const cansados = meus.filter(j => j.saiu === null && j.pos !== "GK" && j.energia < 40);
      if (cansados.length) frases.push(`Terminaram sem pernas: ${cansados.map(j => j.nome).join(", ")}. Vale trocar mais cedo ou baixar a pressão.`);
    }
    const parada = partida.lances.filter(l => l.time === 1 - i && ["escanteio", "falta", "penalti"].includes(l.tipo));
    const golsParada = parada.filter(l => l.resultado === "gol").length;
    if (golsParada) frases.push(`Sofremos ${golsParada} ${golsParada === 1 ? "gol" : "gols"} de bola parada em ${eu.faltas} faltas cometidas.`);
    return frases;
  }

  // nivelAnalista: [nível do analista do mandante, do visitante], de 1 a 3
  function montarRelatorio(partida, nivelAnalista = [3, 3]) {
    const esperado = resultadoEsperado(partida.lances), jogadores = notas(partida);
    return {
      placar: partida.placar, xg: partida.xg, esperado,
      jogadores,
      melhor: jogadores.filter(j => j.minutos >= 30).sort((a, b) => b.nota - a.nota)[0] || null,
      zonas: partida.estat.map(e => Object.fromEntries(ZONAS.map(z => { const [g, p] = e.zonas[z]; return [z, { ganhos: g, total: g + p }]; }))),
      analise: [0, 1].map(i => analise(partida, esperado, jogadores, i, nivelAnalista[i])),
      estat: partida.estat, narracao: partida.narracao,
    };
  }
  return { resultadoEsperado, montarRelatorio };
})();

const __rodada = (() => {
  // Calendário, cálculo de uma partida da liga e classificação.
  // Não depende do navegador nem do banco: recebe os dados e devolve o que deve ser gravado.
  const { criarRng } = __rng;
  const { notaNaPosicao, LISTA_POSICOES } = __modelo;
  const { prepararTime, simularPartida, CONFIG } = __motor;
  const { taticaBot } = __bot;
  const { montarRelatorio } = __relatorio;
  const DIAS_PARA_BOT = 21; // dirigente sem acessar por tantos dias: o clube joga com a tática de bot

  // Turno e returno pelo método do círculo. ids: clubes do grupo. Devolve [{ rodada, casa, fora }].
  // Os mandos alternam: o clube fixo troca a cada rodada e os demais pares alternam pela posição no círculo.
  // O returno repete o turno na mesma ordem, com o mando invertido: a rodada 10 é a volta da rodada 1, e assim por diante.
  // Dentro de cada turno ninguém passa de dois jogos seguidos em casa ou fora; na virada do turno pode haver três.
  function gerarTabela(ids) {
    const n = ids.length, roda = ids.slice(), jogos = [], meias = n - 1;
    for (let r = 0; r < meias; r++) {
      for (let k = 0; k < n / 2; k++) {
        const a = roda[k], b = roda[n - 1 - k];
        const [casa, fora] = (k === 0 ? r % 2 === 0 : k % 2 === 1) ? [a, b] : [b, a];
        jogos.push({ rodada: r + 1, casa, fora });
        jogos.push({ rodada: r + 1 + meias, casa: fora, fora: casa });
      }
      roda.splice(1, 0, roda.pop()); // gira todos menos o primeiro
    }
    return jogos.sort((x, y) => x.rodada - y.rodada);
  }

  // Converte a tática salva pelo dirigente no formato do motor. Devolve null se ela não for válida para o elenco atual.
  function taticaDoDirigente(dados, elenco) {
    try {
      const porId = Object.fromEntries(elenco.map(j => [j.id, j]));
      if (!dados || !Array.isArray(dados.vagas) || dados.vagas.length !== 11 || !Array.isArray(dados.jog) || dados.jog.length !== 11) return null;
      if (dados.vagas.some(p => !LISTA_POSICOES.includes(p)) || dados.vagas.filter(p => p === "GK").length !== 1) return null;
      if (dados.jog.some(id => !porId[id]) || new Set(dados.jog).size !== 11) return null;
      const emCampo = new Set(dados.jog);
      const banco = [...new Set((dados.banco || []).filter(id => porId[id] && !emCampo.has(id)))].slice(0, 7);
      const noBanco = new Set(banco), I = dados.instr || {};
      const num = (v, min, max) => Math.max(min, Math.min(max, Math.round(+v) || 0));
      const um = (v, lista, padrao) => lista.includes(v) ? v : padrao;
      const titular = id => emCampo.has(id) ? id : null;
      const lista = (l, n) => (Array.isArray(l) ? l : []).filter(id => emCampo.has(id)).slice(0, n);
      const conv = v => v === "true" ? true : v === "false" ? false : isNaN(+v) ? v : +v;
      const condicoes = ["sempre", "ganhando", "empatando", "perdendo", "cansado", "amarelo"];
      const instrucoes = {
        mentalidade: num(I.mentalidade, -2, 2), agressividade: num(I.agressividade, -2, 2), pressao: num(I.pressao, 0, 2),
        passe: um(I.passe, ["misto", "curto", "longo"], "misto"), lado: um(I.lado, ["misto", "E", "C", "D", "lados"], "misto"),
        contraAtaque: I.contraAtaque === true, impedimento: I.impedimento === true,
        capitao: titular(I.capitao), vice: titular(I.vice), armador: titular(I.armador), alvo: titular(I.alvo),
        cobradores: { escanteio: lista(I.cobradores && I.cobradores.escanteio, 3), falta: lista(I.cobradores && I.cobradores.falta, 3), penalti: lista(I.cobradores && I.cobradores.penalti, 5) },
        substituicoes: (dados.subs || []).filter(s => emCampo.has(s.sai) && noBanco.has(s.entra)).slice(0, CONFIG.maxSubstituicoes)
          .map(s => ({ min: num(s.min, 0, 89), sai: s.sai, entra: s.entra, cond: um(s.cond, condicoes, "sempre") })),
        ordens: (dados.ordens || []).slice(0, 3).map(o => {
          const [k, v] = String(o.muda || "").split(":");
          if (!["mentalidade", "pressao", "contraAtaque", "passe"].includes(k)) return null;
          return { min: num(o.min, 0, 89), cond: um(o.cond, condicoes.slice(0, 4), "sempre"), muda: { [k]: conv(v) } };
        }).filter(Boolean),
      };
      return { escalacao: dados.vagas.map((pos, i) => ({ j: porId[dados.jog[i]], pos })), banco: banco.map(id => porId[id]), instrucoes };
    } catch (e) { return null; }
  }

  const forcaDoOnze = escalacao => escalacao.reduce((s, x) => s + notaNaPosicao(x.j, x.pos), 0) / escalacao.length;

  // Instante em que um minuto de jogo passa a ser visível, com 15 minutos de intervalo, na escala da transmissão.
  function horaDoMinuto(inicio, min, minutosTransmissao) {
    const reais = (min <= 45 ? min : min + 15) * minutosTransmissao / 105;
    return new Date(new Date(inicio).getTime() + reais * 60000);
  }

  // lado: { clube: { id, nome, dono, ultimo_acesso }, elenco, tatica: dados salvos ou null }
  // Devolve as linhas de lances e o resultado a gravar.
  function calcularPartida({ partida, casa, fora, minutosTransmissao = 105, semente }) {
    const agora = new Date(partida.inicio).getTime();
    const lados = [casa, fora].map(l => {
      const inativo = !l.clube.dono || !l.clube.ultimo_acesso || agora - new Date(l.clube.ultimo_acesso).getTime() > DIAS_PARA_BOT * 86400000;
      const humana = inativo ? null : taticaDoDirigente(l.tatica, l.elenco);
      return { ...l, humana, previa: humana ? forcaDoOnze(humana.escalacao) : taticaBot(l.elenco).forca };
    });
    const times = lados.map((l, i) => {
      const t = l.humana || taticaBot(l.elenco, { mandante: i === 0, forcaAdversario: lados[1 - i].previa });
      return prepararTime({ nome: l.clube.nome, escalacao: t.escalacao, banco: t.banco, instrucoes: t.instrucoes, mandante: i === 0 });
    });
    const p = simularPartida(criarRng(semente), times[0], times[1]);
    const r = montarRelatorio(p, [3, 3]);
    const lances = p.narracao.map((l, ordem) => ({ partida_id: partida.id, ordem, min: l.min, libera_em: horaDoMinuto(partida.inicio, l.min, minutosTransmissao).toISOString(), dados: l }));
    const { narracao, ...semNarracao } = r; // a narração já está nos lances
    return {
      lances,
      resultado: {
        partida_id: partida.id, libera_em: partida.fim, gols_casa: p.placar[0], gols_fora: p.placar[1], xg_casa: p.xg[0], xg_fora: p.xg[1],
        pts_esp_casa: r.esperado.pontos[0], pts_esp_fora: r.esperado.pontos[1],
        relatorio: { ...semNarracao, comandados: lados.map(l => l.humana ? "dirigente" : "bot") },
      },
    };
  }

  // Tabela de um grupo a partir das partidas com resultado visível. Desempate: pontos, saldo, gols pró, gols contra.
  function classificacao(clubes, partidas, resultados) {
    const t = Object.fromEntries(clubes.map(c => [c.id, { clube: c, j: 0, v: 0, e: 0, d: 0, gp: 0, gc: 0, pts: 0, esp: 0 }]));
    const res = Object.fromEntries(resultados.map(r => [r.partida_id, r]));
    for (const p of partidas) {
      const r = res[p.id], a = t[p.casa], b = t[p.fora];
      if (!r || !a || !b) continue;
      a.j++; b.j++; a.gp += r.gols_casa; a.gc += r.gols_fora; b.gp += r.gols_fora; b.gc += r.gols_casa; a.esp += r.pts_esp_casa; b.esp += r.pts_esp_fora;
      if (r.gols_casa > r.gols_fora) { a.v++; b.d++; a.pts += 3; } else if (r.gols_casa < r.gols_fora) { b.v++; a.d++; b.pts += 3; } else { a.e++; b.e++; a.pts++; b.pts++; }
    }
    return Object.values(t).sort((x, y) => y.pts - x.pts || (y.gp - y.gc) - (x.gp - x.gc) || y.gp - x.gp || x.gc - y.gc || x.clube.nome.localeCompare(y.clube.nome));
  }
  return { DIAS_PARA_BOT, gerarTabela, taticaDoDirigente, horaDoMinuto, calcularPartida, classificacao };
})();
// <<< motor embutido
const { calcularPartida } = __rodada;

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (corpo, status = 200) => new Response(JSON.stringify(corpo), { status, headers: { ...cors, "Content-Type": "application/json" } });
const MAXIMO_POR_CHAMADA = 40;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const url = Deno.env.get("SUPABASE_URL"), chave = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !chave) return json({ erro: "Função sem acesso ao banco: faltam SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY." }, 500);
    const sb = createClient(url, chave, { auth: { persistSession: false } });
    const ok = ({ data, error }) => { if (error) throw new Error(error.message); return data; };

    const pendentes = ok(await sb.from("partidas").select("*").eq("processada", false).lte("inicio", new Date().toISOString())
      .order("inicio").order("id").limit(MAXIMO_POR_CHAMADA));
    if (!pendentes.length) return json({ calculadas: 0, erros: [] });

    const ids = [...new Set(pendentes.flatMap(p => [p.casa, p.fora]))];
    const ligas = Object.fromEntries(ok(await sb.from("ligas").select("id, minutos_transmissao").in("id", [...new Set(pendentes.map(p => p.liga_id))])).map(l => [l.id, l]));
    const clubes = Object.fromEntries(ok(await sb.from("clubes").select("id, nome, dono, ultimo_acesso").in("id", ids)).map(c => [c.id, c]));
    const taticas = Object.fromEntries(ok(await sb.from("taticas").select("clube_id, dados").in("clube_id", ids)).map(t => [t.clube_id, t.dados]));
    const elencos = {};
    for (let i = 0; i < ids.length; i += 20) { // em blocos, para não passar do limite de linhas por consulta
      const linhas = ok(await sb.from("jogadores").select("*").in("clube_id", ids.slice(i, i + 20)).order("id"));
      for (const l of linhas) (elencos[l.clube_id] = elencos[l.clube_id] || []).push({ id: "j" + l.id, nome: l.nome, pais: l.pais, idade: l.idade, pos: l.pos, fam: l.fam, at: l.at, titular: l.principal });
    }

    let calculadas = 0;
    const erros = [];
    for (const p of pendentes) {
      // reserva a partida; se outra chamada já pegou, pula
      const reserva = ok(await sb.from("partidas").update({ processada: true }).eq("id", p.id).eq("processada", false).select("id"));
      if (!reserva.length) continue;
      try {
        const lado = id => ({ clube: clubes[id], elenco: elencos[id] || [], tatica: taticas[id] || null });
        const { lances, resultado } = calcularPartida({
          partida: p, casa: lado(p.casa), fora: lado(p.fora),
          minutosTransmissao: ligas[p.liga_id].minutos_transmissao, semente: Math.floor(Math.random() * 2147483647),
        });
        ok(await sb.from("lances").insert(lances));
        ok(await sb.from("resultados").insert(resultado));
        calculadas++;
      } catch (e) { // desfaz a reserva, para a partida ser calculada na próxima chamada
        await sb.from("lances").delete().eq("partida_id", p.id);
        await sb.from("resultados").delete().eq("partida_id", p.id);
        await sb.from("partidas").update({ processada: false }).eq("id", p.id);
        erros.push(`partida ${p.id}: ${e.message}`);
      }
    }
    return json({ calculadas, erros });
  } catch (e) {
    return json({ erro: e.message }, 500);
  }
});
