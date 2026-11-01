// Modelo de jogador: 25 atributos (os 21 do Dugout + Resistência, e da T1 em diante Passe longo, Movimentação e Decisões), 18 posições e nota por posição.
// Os pesos e os fatores de familiaridade são ponto de partida; a calibragem do motor pode mexer neles.
import { criarRng } from "./rng.js";

// uma constante exportada por linha: o empacotador das funções do servidor só enxerga o primeiro nome de cada "export const"
export const ATR_MIN = 1;
export const ATR_MAX = 50;

// grupo: gol (só goleiro), def, tec (técnicos de linha), fis, men
export const ATRIBUTOS = [
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
  // da T1 em diante, sempre no fim: treino.c e treino_pts guardam índices. lon continua o Chute de longe
  { k: "plo", nome: "Passe longo", grupo: "tec" },
  { k: "mov", nome: "Movimentação", grupo: "men" },
  { k: "dec", nome: "Decisões", grupo: "men" },
];
export const IDX = Object.fromEntries(ATRIBUTOS.map((a, i) => [a.k, i]));
// O tamanho do vetor é a trava: at com 22 lê os pesos e o foco de hoje, at com 25 lê os da T1. O histórico gravado com 22, a T0 e o que o gerador sorteia não mudam.
export const N_DA_T0 = 22;
export const ATRIBUTOS_DA_T0 = ATRIBUTOS.slice(0, N_DA_T0);
export const ATRIBUTOS_DESDE = 1; // temporada em que a liga recebe os 3
export const temNovos = at => at.length > N_DA_T0;
export const atributosDe = j => ATRIBUTOS.slice(0, j.at.length);

// linha: gol, defesa, ala, volante, meio, meia, ataque · lado: E, C, D
export const POSICOES = {
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
export const LISTA_POSICOES = Object.keys(POSICOES);

// Peso de cada atributo na nota da posição (cada linha soma 100).
export const PESOS = {
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

// Os mesmos pesos na T1, com os 3 atributos: quem tem at de 25 lê esta tabela (cada linha soma 100).
export const PESOS_T1 = {
  GK: { ref: 22, enc: 18, um: 16, pos: 16, com: 12, dec: 4, plo: 4, vel: 4, for: 4 },
  DC: { mar: 18, des: 18, pos: 14, cab: 14, for: 10, vel: 8, com: 5, dec: 5, plo: 5, pas: 3 },
  SW: { pos: 22, des: 14, vel: 14, mar: 10, com: 10, pas: 6, plo: 6, dec: 6, cab: 6, dom: 4, cri: 2 },
  LAT: { des: 18, mar: 16, vel: 16, pos: 12, cru: 10, res: 8, pas: 6, com: 4, dec: 4, mov: 3, for: 3 },
  ALA: { vel: 14, cru: 16, res: 12, des: 12, dri: 8, mov: 6, mar: 8, pos: 8, pas: 8, dec: 4, dom: 4 },
  DMC: { des: 18, pos: 16, mar: 12, pas: 10, dec: 12, plo: 6, for: 6, res: 8, dom: 4, agr: 4, cab: 2, equ: 2 },
  MC: { pas: 18, cri: 12, dom: 10, dec: 12, plo: 8, pos: 8, equ: 4, res: 8, des: 8, lon: 4, vel: 4, dri: 4 },
  AMC: { cri: 18, pas: 14, dom: 12, lon: 10, dri: 12, fin: 8, dec: 10, mov: 6, pos: 4, vel: 6 },
  MLAT: { cru: 16, pas: 12, vel: 12, dom: 8, cri: 8, dri: 10, res: 8, mov: 6, dec: 6, plo: 4, pos: 4, des: 6 },
  AMLAT: { dri: 16, cri: 12, cru: 12, vel: 12, pas: 8, dom: 8, lon: 8, fin: 8, mov: 8, dec: 6, pos: 2 },
  PONTA: { dri: 18, vel: 18, cru: 12, fin: 12, dom: 8, mov: 10, dec: 4, cri: 4, pos: 4, pas: 4, res: 4, lon: 2 },
  FC: { fin: 22, dom: 14, vel: 12, dri: 10, mov: 12, pos: 8, dec: 4, cri: 6, pas: 4, lon: 4, cab: 4 },
  SC: { fin: 22, cab: 18, for: 16, mov: 10, pos: 10, dom: 8, vel: 4, lon: 2, dec: 4, agr: 3, pas: 3 },
};
export const pesosDe = (at, papel) => (temNovos(at) ? PESOS_T1 : PESOS)[papel];

// Valor inicial dos 3 para quem já existe: [Passe longo, Movimentação, Decisões] em relação à nota, por posição principal.
export const AJUSTE_INICIAL = {
  GK: [-10, -24, -3], DC: [-5, -16, -4], SW: [-3, -14, -2], DR: [-8, -4, -8], DL: [-8, -4, -8], WBR: [-6, -3, -8], WBL: [-6, -3, -8],
  DMC: [-2, -12, -2], MC: [0, -6, 0], AMC: [-3, -2, 0], MR: [-9, -3, -6], ML: [-9, -3, -6], AMR: [-6, -1, -6], AML: [-6, -1, -6],
  RW: [-8, 0, -6], LW: [-8, 0, -6], FC: [-12, 0, -10], SC: [-14, 0, -10],
};

// Familiaridade com a posição, como no Dugout: Natural, Competente, Improvisado.
export const FAMILIARIDADE = { N: 1, C: 0.93, I: 0.8 };
export const NOME_FAMILIARIDADE = { N: "Natural", C: "Competente", I: "Improvisado" };

// Posições parecidas, em que o jogador pode ser natural ou competente além da principal.
export const VIZINHAS = {
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

export const familiaridade = (jogador, pos) => jogador.fam[pos] || "I";

// Nota do jogador numa posição, na escala dos atributos (1 a 50), sem a familiaridade.
export function notaBruta(atributos, pos) {
  const pesos = pesosDe(atributos, POSICOES[pos].papel);
  let soma = 0;
  for (const k in pesos) soma += pesos[k] * atributos[IDX[k]];
  return soma / 100;
}

// Pé dominante: "D" (direito), "E" (esquerdo) ou "A" (ambidestro). Só pesa em quem joga pelos lados, como no futebol de verdade:
//   no lado do pé bom, o cruzamento sai melhor;
//   no lado trocado, lateral, ala e meia aberto cruzam e passam pior;
//   ponta e meia-atacante de pé trocado cruzam pior, mas cortam para dentro e finalizam melhor.
// Ambidestro e quem joga pelo centro não mudam. Devolve { índice do atributo: multiplicador } ou null.
// Com a nota do pé fraco (pf, 1 a 20; 162_pe_fraco.sql), a perda do lado trocado vai com ela: quase some com 13 ou mais e cresce de 1 a 5
// (perda 1 = a de antes, na nota 6); o ambidestro conta como lado trocado com pé fraco alto, e quem tem 13 ou mais corta para dentro dos dois lados.
export const NOME_DO_PE = { D: "direito", E: "esquerdo", A: "ambidestro" };
export const CONFIG_PE = { cruzaBem: 1.04, cruzaMal: 0.90, passaMal: 0.97, finalizaBem: 1.05, perda: [13, 7, 0.1, 1.5], corta: 13 };
export function ajusteDoPe(pe, pos, pf) {
  const p = POSICOES[pos], C = CONFIG_PE;
  if (!p || p.lado === "C" || !pe || pe === "A" && pf == null) return null;
  const frente = p.linha === "ataque" || p.linha === "meia";
  if (pe === p.lado) return frente && pf >= C.corta ? { [IDX.cru]: C.cruzaBem, [IDX.fin]: C.finalizaBem, [IDX.lon]: C.finalizaBem } : { [IDX.cru]: C.cruzaBem };
  const [nota, passo, min, max] = C.perda, perda = pf == null ? 1 : Math.min(max, Math.max(min, (nota - pf) / passo));
  const pior = mal => pf == null ? mal : 1 - (1 - mal) * perda, cru = pior(C.cruzaMal), pas = pior(C.passaMal); // sem a nota, o número de antes, sem arredondar
  return frente
    ? { [IDX.cru]: cru, [IDX.fin]: C.finalizaBem, [IDX.lon]: C.finalizaBem }
    : { [IDX.cru]: cru, [IDX.pas]: pas };
}
// Pé fraco em palavras, como no FM (as faixas são o teto de cada nome)
export const NIVEIS_PE_FRACO = [[3, "Péssimo"], [6, "Fraco"], [9, "Razoável"], [12, "Bom"], [16, "Muito bom"], [20, "Ambidestro"]];
export const nomeDoPeFraco = pf => pf == null ? "" : (NIVEIS_PE_FRACO.find(([teto]) => pf <= teto) || NIVEIS_PE_FRACO[NIVEIS_PE_FRACO.length - 1])[1];
// como o site mostra o pé: "destro · pé esquerdo razoável" (curto: "destro · esquerdo razoável"), dizendo qual é o pé ruim
// (dizer "pé fraco fraco" não dava); o ambidestro: "ambidestro · pé fraco muito bom", ou só "ambidestro" no nível Ambidestro. Sem a nota, só o jeito
export const JEITO_DO_PE = { D: "destro", E: "canhoto", A: "ambidestro" };
export function textoDoPe(pe, pf, curto = false) {
  if (!pe) return "";
  const nivel = nomeDoPeFraco(pf).toLowerCase(), outro = { D: "esquerdo", E: "direito" }[pe];
  if (!nivel || nivel === "ambidestro") return JEITO_DO_PE[pe] || pe;
  return `${JEITO_DO_PE[pe] || pe} · ${outro ? (curto ? "" : "pé ") + outro : "pé fraco"} ${nivel}`;
}
// quanto o pé ruim atrapalha no motor: 1 com nota 1, 0 com 11 ou mais
export const fraquezaDoPe = pf => Math.min(1, Math.max(0, (11 - pf) / 10));
// temporada em que a nota do pé fraco passa a valer nas partidas (rodada.js tira a nota dos jogadores antes dela)
export const PE_FRACO_DESDE = 1;
// nota na posição já com o efeito do pé: é a que o bot (e o botão de escalar os melhores) usa para escolher quem joga em cada lado
export function notaComPe(j, pos) {
  const a = ajusteDoPe(j.pe, pos, j.pf);
  if (!a) return notaNaPosicao(j, pos);
  const at = j.at.slice();
  for (const k in a) at[k] *= a[k];
  return notaBruta(at, pos) * FAMILIARIDADE[familiaridade(j, pos)];
}
// como o pé cai numa posição de lado: "natural", "trocado" ou "" (centro, ambidestro ou sem pé definido)
export const peNaPosicao = (pe, pos) => { const p = POSICOES[pos]; return !p || p.lado === "C" || !pe || pe === "A" ? "" : pe === p.lado ? "natural" : "trocado"; };

export const notaNaPosicao = (jogador, pos) => notaBruta(jogador.at, pos) * FAMILIARIDADE[familiaridade(jogador, pos)];

// [Passe longo, Movimentação, Decisões] de quem tem 22: sorteio próprio, semeado pela chave (como sortearPeFraco), que serve à entrega na virada,
// ao gerador e ao motor. Depois sobe ou desce em rodízio os que pesam na posição, até 6 do sorteio, para a nota ficar a 0,1 da antiga.
export function atributosNovos(j, chave = j.id) {
  const rng = criarRng([...String(chave)].reduce((h, c) => Math.imul(h, 31) + c.charCodeAt(0) | 0, 172));
  const at = j.at.slice(0, N_DA_T0), nota = notaBruta(at, j.pos), [a, b, c] = AJUSTE_INICIAL[j.pos], idade = (j.idade ?? 25) - 25;
  const plo = j.pos === "GK" ? nota + a + rng.normal(0, 7) : 0.6 * (nota + a) + 0.4 * at[IDX.pas] + 0.15 * idade + rng.normal(0, 4);
  const mov = nota + b + rng.normal(0, 4), dec = nota + c + 0.3 * idade + rng.normal(0, 3.5);
  const novos = [plo, mov, dec].map(v => Math.max(ATR_MIN, Math.min(ATR_MAX, Math.round(v)))), sorteados = novos.slice();
  const pesos = PESOS_T1[POSICOES[j.pos].papel], giram = [0, 1, 2].filter(i => pesos[ATRIBUTOS[N_DA_T0 + i].k]);
  for (let i = 0, parados = 0; parados < giram.length; i++) {
    const dif = nota - notaBruta([...at, ...novos], j.pos);
    if (Math.abs(dif) <= 0.1) break;
    const x = giram[i % giram.length], v = novos[x] + Math.sign(dif);
    if (Math.abs(v - sorteados[x]) > 6 || v < ATR_MIN || v > ATR_MAX) parados++;
    else { novos[x] = v; parados = 0; }
  }
  return novos;
}
export const comNovos = j => temNovos(j.at) ? j.at : [...j.at, ...atributosNovos(j)];

// Teto da nota = 23 + 0,20 × talento (1 a 100). Talento mínimo para o teto não ficar abaixo da nota de hoje: ninguém nasce acima do próprio teto.
export const TETO_DO_TALENTO = [23, 0.20];
export const talentoMinimo = j => Math.max(1, Math.min(100, Math.ceil((notaDeTeto(j) - TETO_DO_TALENTO[0]) / TETO_DO_TALENTO[1])));

// Nota que conta para o teto do treino: a maior entre as posições em que o jogador é natural.
// Assim, aprender uma posição nova ou trocar a principal não abre um teto novo.
export function notaDeTeto(j) {
  let n = notaBruta(j.at, j.pos);
  for (const p in j.fam || {}) if (j.fam[p] === "N" && p !== j.pos && POSICOES[p]) n = Math.max(n, notaBruta(j.at, p));
  return n;
}

export function melhorPosicao(jogador) {
  let melhor = null;
  for (const pos of LISTA_POSICOES) {
    const nota = notaNaPosicao(jogador, pos);
    if (!melhor || nota > melhor.nota) melhor = { pos, nota };
  }
  return melhor;
}

// Outros países (supabase/77_paises.sql): cada um é um grupo de 10 clubes sem dirigente, com uma divisão só. O grupo diz o país.
export const PAISES = { ARG: "Argentina", URU: "Uruguai", COL: "Colômbia", CHI: "Chile" };
export const paisDoGrupo = g => PAISES[g] || "Brasil";
