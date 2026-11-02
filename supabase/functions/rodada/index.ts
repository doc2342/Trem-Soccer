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
    // sorteio com peso (pesos paralelos à lista); sem pesos, igual ao pick
    const pickPeso = (lista, pesos) => {
      if (!pesos) return pick(lista);
      let r = n() * pesos.reduce((a, b) => a + b, 0);
      for (let i = 0; i < lista.length; i++) if ((r -= pesos[i]) < 0) return lista[i];
      return lista[lista.length - 1];
    };
    // normal por Box-Muller
    const normal = (media, desvio) => media + desvio * Math.sqrt(-2 * Math.log(1 - n())) * Math.cos(2 * Math.PI * n());
    const chance = p => n() < p;
    const embaralhar = lista => {
      const l = lista.slice();
      for (let i = l.length - 1; i > 0; i--) { const j = int(0, i); [l[i], l[j]] = [l[j], l[i]]; }
      return l;
    };
    return { n, int, pick, pickPeso, normal, chance, embaralhar };
  }

  const limitar = (v, min, max) => Math.max(min, Math.min(max, v));
  return { criarRng, limitar };
})();

const __modelo = (() => {
  // Modelo de jogador: 25 atributos (os 21 do Dugout + Resistência, e da T1 em diante Passe longo, Movimentação e Decisões), 18 posições e nota por posição.
  // Os pesos e os fatores de familiaridade são ponto de partida; a calibragem do motor pode mexer neles.
  const { criarRng } = __rng;
  // uma constante exportada por linha: o empacotador das funções do servidor só enxerga o primeiro nome de cada "export const"
  const ATR_MIN = 1;
  const ATR_MAX = 50;

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
    // da T1 em diante, sempre no fim: treino.c e treino_pts guardam índices. lon continua o Chute de longe
    { k: "plo", nome: "Passe longo", grupo: "tec" },
    { k: "mov", nome: "Movimentação", grupo: "men" },
    { k: "dec", nome: "Decisões", grupo: "men" },
  ];
  const IDX = Object.fromEntries(ATRIBUTOS.map((a, i) => [a.k, i]));
  // O tamanho do vetor é a trava: at com 22 lê os pesos e o foco de hoje, at com 25 lê os da T1. O histórico gravado com 22, a T0 e o que o gerador sorteia não mudam.
  const N_DA_T0 = 22;
  const ATRIBUTOS_DA_T0 = ATRIBUTOS.slice(0, N_DA_T0);
  const ATRIBUTOS_DESDE = 1; // temporada em que a liga recebe os 3
  const temNovos = at => at.length > N_DA_T0;
  const atributosDe = j => ATRIBUTOS.slice(0, j.at.length);

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

  // Os mesmos pesos na T1, com os 3 atributos: quem tem at de 25 lê esta tabela (cada linha soma 100).
  const PESOS_T1 = {
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
  const pesosDe = (at, papel) => (temNovos(at) ? PESOS_T1 : PESOS)[papel];

  // Valor inicial dos 3 para quem já existe: [Passe longo, Movimentação, Decisões] em relação à nota, por posição principal.
  const AJUSTE_INICIAL = {
    GK: [-10, -24, -3], DC: [-5, -16, -4], SW: [-3, -14, -2], DR: [-8, -4, -8], DL: [-8, -4, -8], WBR: [-6, -3, -8], WBL: [-6, -3, -8],
    DMC: [-2, -12, -2], MC: [0, -6, 0], AMC: [-3, -2, 0], MR: [-9, -3, -6], ML: [-9, -3, -6], AMR: [-6, -1, -6], AML: [-6, -1, -6],
    RW: [-8, 0, -6], LW: [-8, 0, -6], FC: [-12, 0, -10], SC: [-14, 0, -10],
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
  const NOME_DO_PE = { D: "direito", E: "esquerdo", A: "ambidestro" };
  const CONFIG_PE = { cruzaBem: 1.04, cruzaMal: 0.90, passaMal: 0.97, finalizaBem: 1.05, perda: [13, 7, 0.1, 1.5], corta: 13 };
  function ajusteDoPe(pe, pos, pf) {
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
  const NIVEIS_PE_FRACO = [[3, "Péssimo"], [6, "Fraco"], [9, "Razoável"], [12, "Bom"], [16, "Muito bom"], [20, "Ambidestro"]];
  const nomeDoPeFraco = pf => pf == null ? "" : (NIVEIS_PE_FRACO.find(([teto]) => pf <= teto) || NIVEIS_PE_FRACO[NIVEIS_PE_FRACO.length - 1])[1];
  // como o site mostra o pé: "destro · pé esquerdo razoável" (curto: "destro · esquerdo razoável"), dizendo qual é o pé ruim
  // (dizer "pé fraco fraco" não dava); o ambidestro: "ambidestro · pé fraco muito bom", ou só "ambidestro" no nível Ambidestro. Sem a nota, só o jeito
  const JEITO_DO_PE = { D: "destro", E: "canhoto", A: "ambidestro" };
  function textoDoPe(pe, pf, curto = false) {
    if (!pe) return "";
    const nivel = nomeDoPeFraco(pf).toLowerCase(), outro = { D: "esquerdo", E: "direito" }[pe];
    if (!nivel || nivel === "ambidestro") return JEITO_DO_PE[pe] || pe;
    return `${JEITO_DO_PE[pe] || pe} · ${outro ? (curto ? "" : "pé ") + outro : "pé fraco"} ${nivel}`;
  }
  // quanto o pé ruim atrapalha no motor: 1 com nota 1, 0 com 11 ou mais
  const fraquezaDoPe = pf => Math.min(1, Math.max(0, (11 - pf) / 10));
  // temporada em que a nota do pé fraco passa a valer nas partidas (rodada.js tira a nota dos jogadores antes dela)
  const PE_FRACO_DESDE = 1;
  // nota na posição já com o efeito do pé: é a que o bot (e o botão de escalar os melhores) usa para escolher quem joga em cada lado
  function notaComPe(j, pos) {
    const a = ajusteDoPe(j.pe, pos, j.pf);
    if (!a) return notaNaPosicao(j, pos);
    const at = j.at.slice();
    for (const k in a) at[k] *= a[k];
    return notaBruta(at, pos) * FAMILIARIDADE[familiaridade(j, pos)];
  }
  // como o pé cai numa posição de lado: "natural", "trocado" ou "" (centro, ambidestro ou sem pé definido)
  const peNaPosicao = (pe, pos) => { const p = POSICOES[pos]; return !p || p.lado === "C" || !pe || pe === "A" ? "" : pe === p.lado ? "natural" : "trocado"; };

  const notaNaPosicao = (jogador, pos) => notaBruta(jogador.at, pos) * FAMILIARIDADE[familiaridade(jogador, pos)];

  // [Passe longo, Movimentação, Decisões] de quem tem 22: sorteio próprio, semeado pela chave (como sortearPeFraco), que serve à entrega na virada,
  // ao gerador e ao motor. Depois sobe ou desce em rodízio os que pesam na posição, até 6 do sorteio, para a nota ficar a 0,1 da antiga.
  function atributosNovos(j, chave = j.id) {
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
  const comNovos = j => temNovos(j.at) ? j.at : [...j.at, ...atributosNovos(j)];

  // Teto da nota = 23 + 0,20 × talento (1 a 100). Talento mínimo para o teto não ficar abaixo da nota de hoje: ninguém nasce acima do próprio teto.
  const TETO_DO_TALENTO = [23, 0.20];
  const talentoMinimo = j => Math.max(1, Math.min(100, Math.ceil((notaDeTeto(j) - TETO_DO_TALENTO[0]) / TETO_DO_TALENTO[1])));

  // Nota que conta para o teto do treino: a maior entre as posições em que o jogador é natural.
  // Assim, aprender uma posição nova ou trocar a principal não abre um teto novo.
  function notaDeTeto(j) {
    let n = notaBruta(j.at, j.pos);
    for (const p in j.fam || {}) if (j.fam[p] === "N" && p !== j.pos && POSICOES[p]) n = Math.max(n, notaBruta(j.at, p));
    return n;
  }

  function melhorPosicao(jogador) {
    let melhor = null;
    for (const pos of LISTA_POSICOES) {
      const nota = notaNaPosicao(jogador, pos);
      if (!melhor || nota > melhor.nota) melhor = { pos, nota };
    }
    return melhor;
  }

  // Outros países (supabase/77_paises.sql): cada um é um grupo de 10 clubes sem dirigente, com uma divisão só. O grupo diz o país.
  const PAISES = { ARG: "Argentina", URU: "Uruguai", COL: "Colômbia", CHI: "Chile" };
  const paisDoGrupo = g => PAISES[g] || "Brasil";
  return { ATR_MIN, ATR_MAX, ATRIBUTOS, IDX, N_DA_T0, ATRIBUTOS_DA_T0, ATRIBUTOS_DESDE, temNovos, atributosDe, POSICOES, LISTA_POSICOES, PESOS, PESOS_T1, pesosDe, AJUSTE_INICIAL, FAMILIARIDADE, NOME_FAMILIARIDADE, VIZINHAS, familiaridade, notaBruta, NOME_DO_PE, CONFIG_PE, ajusteDoPe, NIVEIS_PE_FRACO, nomeDoPeFraco, JEITO_DO_PE, textoDoPe, fraquezaDoPe, PE_FRACO_DESDE, notaComPe, peNaPosicao, notaNaPosicao, atributosNovos, comNovos, TETO_DO_TALENTO, talentoMinimo, notaDeTeto, melhorPosicao, PAISES, paisDoGrupo };
})();

const __grade = (() => {
  // Grade 5×5 do motor (regras da T1): 5 faixas (1 = saída de bola … 5 = ataque) × 5 corredores
  // (E lado esquerdo, e meio-espaço esquerdo, C centro, d meio-espaço direito, D lado direito),
  // sempre do ponto de vista do time que ocupa a zona. Código: dígito da faixa + letra do corredor ("1E" … "5D").
  // O dígito nunca colide com os códigos de 9 zonas ("DE" … "AD"), que seguem valendo na T0.
  const { IDX } = __modelo;
  const { limitar } = __rng;
  const CORREDORES = ["E", "e", "C", "d", "D"];
  const ZONAS_GRADE = [1, 2, 3, 4, 5].flatMap(f => CORREDORES.map(c => f + c));
  // ZONA_EM[faixa][coluna]: a zona pronta (montar a chave na hora, f + c, custa caro nas contas que rodam a cada passo)
  const ZONA_EM = [null, ...[1, 2, 3, 4, 5].map(f => ZONAS_GRADE.slice(5 * f - 5, 5 * f))];

  function ehGrade(z) { return z[0] >= "1" && z[0] <= "5"; }
  function faixaDe(z) { return +z[0]; }
  function corredorDe(z) { return z[1]; }
  const COLUNA = { E: 0, e: 1, C: 2, d: 3, D: 4 };
  function colunaDe(z) { return COLUNA[z[1]]; }

  // A faixa k de quem ataca enfrenta a faixa 6−k de quem defende, e o corredor troca de lado (tabela pronta: o motor chama a cada duelo)
  const ESPELHO = Object.fromEntries(ZONAS_GRADE.map(z => [z, (6 - faixaDe(z)) + CORREDORES[4 - colunaDe(z)]]));
  function espelhoGrade(z) { return ESPELHO[z]; }

  // Linha e lado "antigos" (9 zonas) de uma zona: faixa 1 → D, 2–3 → M, 4–5 → A; meio-espaço e centro → C.
  // Com código de 9 zonas, devolve o próprio z[0]/z[1].
  function linhaDaZona(z) { return ehGrade(z) ? "DMMAA"[faixaDe(z) - 1] : z[0]; }
  function ladoDaZona(z) { return ehGrade(z) ? ({ E: "E", D: "D" })[z[1]] || "C" : z[1]; }

  function vizinhas(z) {
    const f = faixaDe(z), c = colunaDe(z), r = [];
    for (let df = -1; df <= 1; df++) for (let dc = -1; dc <= 1; dc++) {
      if ((df || dc) && f + df >= 1 && f + df <= 5 && c + dc >= 0 && c + dc <= 4) r.push((f + df) + CORREDORES[c + dc]);
    }
    return r;
  }

  const NOME_FAIXA = ["na saída de bola", "na faixa dos volantes", "no meio-campo", "na faixa do meia ofensivo", "na entrada da área"];
  const NOME_LADO = ["a saída de bola pela", "o lado $ na faixa dos volantes", "o meio-campo pela", "o lado $ na faixa do meia ofensivo", "o fundo pela"];
  const NOME_CENTRO = ["a saída de bola pelo meio", "o meio, na frente dos volantes", "o meio-campo pelo centro", "a zona 14", "a entrada da área"];

  // Nome para a narração e o analista, visto por quem ataca. deQuem = "defesa": z está nas coordenadas de quem defende.
  function nomeDaZona(z, deQuem = "ataque") {
    if (deQuem === "defesa") z = espelhoGrade(z);
    const f = faixaDe(z) - 1, c = corredorDe(z);
    if (c === "C") return NOME_CENTRO[f];
    if (c === "e" || c === "d") return "o meio-espaço " + (c === "e" ? "esquerdo " : "direito ") + NOME_FAIXA[f];
    const lado = c === "E" ? "esquerda" : "direita", n = NOME_LADO[f];
    return n.includes("$") ? n.replace("$", lado === "esquerda" ? "esquerdo" : "direito") : n + " " + lado;
  }

  // Soma um mapa de 25 zonas em 9: faixas 1 → D, 2–3 → M, 4–5 → A; corredor E → E, D → D, C → C,
  // meio-espaço metade para o lado e metade para o C. Vale para números e para pares [ganhos, perdidos] (estat.zonas).
  function paraNoveZonas(mapa25) {
    const r = {};
    const somar = (k, v, p) => {
      if (Array.isArray(v)) { r[k] = r[k] || v.map(() => 0); v.forEach((x, i) => { r[k][i] += x * p; }); }
      else r[k] = (r[k] || 0) + v * p;
    };
    for (const [z, v] of Object.entries(mapa25)) {
      const l = linhaDaZona(z), c = corredorDe(z);
      if (c === "e" || c === "d") { somar(l + (c === "e" ? "E" : "D"), v, 0.5); somar(l + "C", v, 0.5); }
      else somar(l + c, v, 1);
    }
    return r;
  }

  // estat.zonas de qualquer jogo em 9 zonas: o da grade somado (paraNoveZonas), o de 9 zonas como veio. Para as telas que leem 9.
  function emNoveZonas(z) { return z && Object.keys(z).length && ehGrade(Object.keys(z)[0]) ? paraNoveZonas(z) : z; }

  // Quem decide o passo: o atributo Decisões. Sob pressão (0 a 2) o bom decisor perde pouco e o mau perde muito: é a Compostura, sem atributo próprio.
  function decisao(at) { return at[IDX.dec]; }
  function decisaoSobPressao(dec, pressao, V) { return dec - V.decisao.pressao * pressao * (1 - dec / 50); }
  // Quem chega na bola no espaço: a Velocidade e a Movimentação (o tempo da corrida). Quem marca corre só com a Velocidade.
  function chegada(at) { return (at[IDX.vel] + at[IDX.mov]) / 2; }

  // Manchas: quanto de cada jogador fica em cada zona, sem e com a bola (lado direito; o esquerdo é o espelho).
  // Rascunho aprovado em .superpowers/brainstorm/29-1793397721/content/manchas-v2.html, números de partida (a calibragem ajusta).
  // Zagueiros, volantes e atacantes repetidos têm a versão da dupla ("2d", o da direita) e do trio.
  const MANCHAS = {
    DC1: { sem: { "1C": 0.6, "1e": 0.12, "1d": 0.12, "2C": 0.16 }, com: { "1C": 0.55, "1e": 0.15, "1d": 0.15, "2C": 0.15 } },
    DC2d: { sem: { "1d": 0.4, "1C": 0.35, "1D": 0.05, "2d": 0.1, "2C": 0.1 }, com: { "1d": 0.55, "1C": 0.15, "1D": 0.1, "2d": 0.15, "2C": 0.05 } },
    DC3c: { sem: { "1C": 0.65, "1e": 0.1, "1d": 0.1, "2C": 0.15 }, com: { "1C": 0.6, "1e": 0.1, "1d": 0.1, "2C": 0.2 } },
    DC3d: { sem: { "1d": 0.45, "1D": 0.2, "1C": 0.15, "2d": 0.1, "2D": 0.1 }, com: { "1d": 0.4, "1D": 0.25, "2d": 0.2, "2D": 0.1, "1C": 0.05 } },
    SW: { sem: { "1C": 0.5, "1e": 0.15, "1d": 0.15, "2C": 0.2 }, com: { "1C": 0.35, "2C": 0.35, "2e": 0.1, "2d": 0.1, "3C": 0.1 } },
    DR: { sem: { "1D": 0.55, "1d": 0.15, "2D": 0.25, "3D": 0.05 }, com: { "1D": 0.35, "2D": 0.3, "3D": 0.25, "1d": 0.05, "4D": 0.05 } },
    WBR: { sem: { "1D": 0.35, "2D": 0.45, "3D": 0.15, "1d": 0.05 }, com: { "2D": 0.25, "3D": 0.35, "4D": 0.3, "1D": 0.1 } },
    DMC1: { sem: { "2C": 0.45, "1C": 0.2, "2e": 0.1, "2d": 0.1, "3C": 0.15 }, com: { "2C": 0.5, "3C": 0.2, "1C": 0.15, "2e": 0.075, "2d": 0.075 } },
    DMC2d: { sem: { "2d": 0.4, "2C": 0.25, "1d": 0.1, "1C": 0.1, "3d": 0.15 }, com: { "2d": 0.45, "2C": 0.15, "3d": 0.25, "3C": 0.1, "1d": 0.05 } },
    MC1: { sem: { "3C": 0.5, "3e": 0.1, "3d": 0.1, "2C": 0.15, "4C": 0.15 }, com: { "3C": 0.45, "3e": 0.1, "3d": 0.1, "2C": 0.1, "4C": 0.25 } },
    MC2d: { sem: { "3d": 0.45, "3C": 0.2, "3D": 0.05, "2d": 0.15, "4d": 0.15 }, com: { "3d": 0.4, "3C": 0.15, "2d": 0.1, "4d": 0.3, "3D": 0.05 } },
    AMC: { sem: { "4C": 0.45, "3C": 0.35, "4e": 0.1, "4d": 0.1 }, com: { "4C": 0.45, "4e": 0.1, "4d": 0.1, "5C": 0.15, "3C": 0.2 } },
    // o AMC com o peso do 4C passado para o 4d e o do 4e dividido entre 4d e 4C (caixa do Pep, árvore de Natal)
    AMC2d: { sem: { "4d": 0.6, "4C": 0.05, "3C": 0.35 }, com: { "4d": 0.6, "4C": 0.05, "5C": 0.15, "3C": 0.2 } },
    MR: { sem: { "3D": 0.5, "2D": 0.15, "3d": 0.15, "4D": 0.2 }, com: { "3D": 0.35, "4D": 0.4, "5D": 0.1, "3d": 0.15 } },
    AMR: { sem: { "4D": 0.5, "3D": 0.35, "4d": 0.15 }, com: { "4D": 0.45, "4d": 0.25, "5D": 0.15, "3D": 0.15 } },
    RW: { sem: { "4D": 0.45, "3D": 0.25, "5D": 0.2, "4d": 0.1 }, com: { "5D": 0.45, "4D": 0.3, "5d": 0.15, "4d": 0.1 } },
    FC1: { sem: { "5C": 0.45, "4C": 0.35, "5e": 0.05, "5d": 0.05, "3C": 0.1 }, com: { "5C": 0.6, "4C": 0.2, "5e": 0.1, "5d": 0.1 } },
    SC1: { sem: { "5C": 0.7, "4C": 0.25, "3C": 0.05 }, com: { "5C": 0.85, "5e": 0.05, "5d": 0.05, "4C": 0.05 } },
    FC2d: { sem: { "5d": 0.35, "4d": 0.35, "4C": 0.15, "3d": 0.15 }, com: { "5d": 0.25, "5C": 0.4, "4d": 0.25, "5D": 0.1 } },
    SC2d: { sem: { "5d": 0.55, "5C": 0.25, "4d": 0.2 }, com: { "5d": 0.35, "5C": 0.55, "5D": 0.1 } },
    FC3d: { sem: { "5d": 0.35, "5D": 0.2, "4d": 0.3, "4D": 0.15 }, com: { "5d": 0.45, "5D": 0.25, "4d": 0.2, "5C": 0.1 } },
  };

  // troca o corredor de cada chave (lado direito ↔ esquerdo), sem mudar a faixa
  function espelharGrade(mapa) {
    return Object.fromEntries(Object.entries(mapa).map(([z, w]) => [z[0] + CORREDORES[4 - colunaDe(z)], w]));
  }
  const ESPELHADAS = new Map(); // as manchas não mudam: o espelho de cada uma é feito uma vez só
  const espelhada = m => ESPELHADAS.get(m) || ESPELHADAS.set(m, { com: espelharGrade(m.com), sem: espelharGrade(m.sem) }).get(m);

  // posições de lado: a do lado esquerdo usa o espelho da direita
  const LADO = { DR: "DR", WBR: "WBR", MR: "MR", AMR: "AMR", RW: "RW", DL: "DR", WBL: "WBR", ML: "MR", AML: "AMR", LW: "RW" };
  const FAMILIA = { DC: "zaga", SW: "zaga", DMC: "volante", MC: "meio", AMC: "meia", FC: "ataque", SC: "ataque" };
  // variante de cada posição por quantos da família há: [sozinho, da dupla, do centro do trio]
  const VARIANTE = {
    DC: ["DC1", "DC2d", "DC3c"], SW: ["SW", "DC2d", "DC3c"], DMC: ["DMC1", "DMC2d", "DMC1"], MC: ["MC1", "MC2d", "MC1"],
    AMC: ["AMC", "AMC2d", "AMC"], FC: ["FC1", "FC2d", "FC1"], SC: ["SC1", "SC2d", "SC1"],
  };
  // no trio, quem fica no meio-espaço usa a versão de lado do trio quando existe
  const DE_LADO_DO_TRIO = { DC: "DC3d", SW: "DC3d", FC: "FC3d", SC: "FC3d" };

  // { com, sem } de cada jogador, na ordem da escalação (null no goleiro). Por família: 1 no centro; 2 um em cada meio-espaço
  // (o primeiro da escalação no direito, o segundo no esquerdo); 3 meio-espaço direito / centro / meio-espaço esquerdo.
  // ponytail: ordem da escalação decide o lado; trocar pelo pé dominante se a calibragem pedir. 4 ou mais: os que passam de 3 repetem o centro.
  function manchasDoTime(escalacao) {
    const n = {}, i = {};
    for (const j of escalacao) if (FAMILIA[j.pos]) n[FAMILIA[j.pos]] = (n[FAMILIA[j.pos]] || 0) + 1;
    return escalacao.map(j => {
      if (LADO[j.pos]) return j.pos === LADO[j.pos] ? MANCHAS[j.pos] : espelhada(MANCHAS[LADO[j.pos]]);
      const f = FAMILIA[j.pos];
      if (!f) return null;
      const k = i[f] = (i[f] || 0) + 1, total = n[f], v = VARIANTE[j.pos];
      if (total === 1) return MANCHAS[v[0]];
      if (total === 2) return k === 1 ? MANCHAS[v[1]] : espelhada(MANCHAS[v[1]]);
      if (k === 2 || k > 3) return MANCHAS[v[2]];
      const m = MANCHAS[DE_LADO_DO_TRIO[j.pos] || v[1]];
      return k === 1 ? m : espelhada(m);
    });
  }

  // Defesa que o atacante enfrenta (spec 9.1 e 9.2), tudo na visão de quem ataca: dz[z] = def[espelhoGrade(z)] mais os ajustes.
  // atk: ataque de quem ataca por zona (dele); def e posicionamento (Posicionamento médio de quem cobre cada zona): por zona de quem defende.
  // Só muda a defesa de lugar: o total não muda.
  const DENTRO = { E: ["e"], e: ["C"], C: ["e", "d"], d: ["C"], D: ["d"] }, FORA = { e: "E", d: "D" };
  // quem empresta a cada zona, na ordem: volante (mesmo corredor, uma faixa à frente de quem defende), zagueiro (vizinho do lado do centro), lateral (de fora)
  const DOADORES = Object.fromEntries(ZONAS_GRADE.map(z => { const f = faixaDe(z), c = z[1]; return [z, [...(f > 1 ? [(f - 1) + c] : []), ...DENTRO[c].map(k => f + k), ...(FORA[c] ? [f + FORA[c]] : [])]]; }));
  // as contas rodam em vetores pela posição da zona em ZONAS_GRADE (5 × (faixa − 1) + coluna; o espelho é 24 − posição): o motor refaz as 6 arrumações
  // a cada recálculo, e a chave de texto custava caro
  const DOADORES_I = ZONAS_GRADE.map(z => DOADORES[z].map(y => ZONAS_GRADE.indexOf(y)));
  function defesaVista({ atk, def, posicionamento, corredorDaBola, V }) {
    const dz = new Float64Array(25), pos = new Float64Array(25), at = new Float64Array(25), Z = V.vazio, buracos = { profundidade: 1, cruzamento: 1 };
    ZONAS_GRADE.forEach((z, i) => { const e = ZONAS_GRADE[24 - i]; dz[i] = def[e] || 0; pos[i] = (posicionamento && posicionamento[e]) || 0; at[i] = atk[z] || 0; });
    const ameaca = i => Math.min(1, (at[i] + Z) / (dz[i] + Z));
    // 1. três corredores: o bloco fica na bola (centro → e C d; lado → lado, meio-espaço vizinho, centro; meio-espaço → ele, centro, lado vizinho).
    // Dos 2 livres sai a fração basculacao do que não marca ninguém ali, mais quanto mais longe da bola (o lado oposto é o lado fraco da virada);
    // com a bola no meio-espaço, zonaCinza do que sai fica no meio-espaço oposto
    const cb = COLUNA[corredorDaBola];
    const ocupados = cb === 2 ? [1, 2, 3] : cb === 0 ? [0, 1, 2] : cb === 4 ? [2, 3, 4] : cb === 1 ? [0, 1, 2] : [2, 3, 4];
    const cinza = cb === 1 ? 3 : cb === 3 ? 1 : -1;
    for (let b = 0; b < 25; b += 5) {
      let sai = 0;
      for (let c = 0; c < 5; c++) if (!ocupados.includes(c)) {
        const i = b + c, v = V.basculacao * dz[i] * (1 - ameaca(i)) * Math.abs(c - cb) / 4;
        dz[i] -= v; sai += v;
      }
      if (cinza >= 0) { dz[b + cinza] += V.zonaCinza * sai; sai *= 1 - V.zonaCinza; }
      const pesos = ocupados.map(c => dz[b + c] + Z), tot = pesos.reduce((a, b) => a + b, 0);
      ocupados.forEach((c, k) => { dz[b + c] += sai * pesos[k] / tot; });
    }
    // 2. cobertura emprestada: zona vazia (abaixo de vazia × a média da faixa) ou sobrecarregada (ataque acima de ameaca × a defesa) pega, nesta ordem,
    // do volante (mesmo corredor, uma faixa à frente de quem defende), do zagueiro (corredor vizinho do lado do centro) e do lateral (do lado de fora).
    // Só empresta quem não está ameaçado; até emprestimo do que sobra, pela qualidade do Posicionamento, e nunca mais que a falta.
    // ponytail: a falta (o que chega à ameaça ou ao piso da faixa) limita o empréstimo; sem ela a zona vazia passaria a vizinha. Ordem fixa das zonas
    const emprestou = new Uint8Array(25), pegou = new Uint8Array(25), pisos = [0, 5, 10, 15, 20].map(b => V.vazia * (dz[b] + dz[b + 1] + dz[b + 2] + dz[b + 3] + dz[b + 4]) / 5);
    const precisa = i => dz[i] < pisos[(i / 5) | 0] || at[i] > V.ameaca * dz[i];
    for (let b = 20; b >= 0; b -= 5) {
      const piso = pisos[b / 5];
      for (const c of [2, 1, 3, 0, 4]) { // C, e, d, E, D
        const i = b + c;
        if (emprestou[i] || !precisa(i)) continue;
        for (const y of DOADORES_I[i]) {
          const falta = Math.max(at[i], piso) - dz[i];
          if (falta <= 0) break;
          if (pegou[y] || at[y] >= dz[y] || precisa(y)) continue;
          const v = Math.min(falta, V.emprestimo * (dz[y] - at[y]) * limitar(pos[y] / 25, 0.6, 1.3));
          if (v <= 0) continue;
          dz[y] -= v; dz[i] += v; emprestou[y] = 1; pegou[i] = 1;
          // 3. buracos: o zagueiro que sai (faixa 1 de quem defende, no centro: o nosso 5C) abre a profundidade; o lateral (lado das faixas 1–2) abre o cruzamento
          if (y === 22) buracos.profundidade = 1 + V.buracoZaga;
          if (y >= 15 && (y % 5 === 0 || y % 5 === 4)) buracos.cruzamento = 1 + V.buracoLateral;
        }
      }
    }
    // vetor: a defesa pela posição da zona (o que o motor lê); dz, a mesma por zona, montada só quando alguém lê (testes, telas)
    return { vetor: dz, buracos, get dz() { return Object.fromEntries(ZONAS_GRADE.map((z, i) => [z, dz[i]])); } };
  }

  // Basculação com um passo de atraso (spec 7.3): a defesa do passo mistura a arrumação de onde a bola estava com a de onde está, pela rapidez
  function defesaComAtraso(arrumacoes, corredorAntes, corredorAgora, rapidez) {
    const a = arrumacoes[corredorAntes].dz, b = arrumacoes[corredorAgora].dz;
    return Object.fromEntries(Object.keys(b).map(z => [z, rapidez * b[z] + (1 - rapidez) * a[z]]));
  }
  // pos, equ: Posicionamento e Trabalho em equipe médios da linha de quem defende
  function rapidezBasculacao(pos, equ, V) { return limitar(V.basculacaoRapidez * ((pos + equ) / 2) / 25, 0.2, 1); }

  // Ganhar com folga arrasta o cobridor (spec 9.1): girar na zona 14 tira o zagueiro (bola em profundidade); bater o lateral no lado das faixas 4–5
  // puxa o zagueiro para fora e enfraquece o meio-espaço vizinho na faixa seguinte (na faixa 5, na mesma)
  function arrasto({ zona, folga, V }) {
    if (folga < V.arrasto.folga) return null;
    if (zona === "4C") return { profundidade: 1 + V.buracoZaga };
    const f = faixaDe(zona), c = corredorDe(zona);
    if (f >= 4 && (c === "E" || c === "D")) return { zonaFraca: Math.min(5, f + 1) + (c === "E" ? "e" : "d"), fator: 1 - V.arrasto.lado };
    return null;
  }

  // O passo (spec 7): tipo pelo deslocamento. Virada: de lado a lado oposto ou de meio-espaço a meio-espaço oposto, na mesma faixa ou ±1;
  // voltar: uma faixa para trás; lado: mesma faixa; subir/diagonal: uma faixa, mesmo corredor/vizinho; pular: 2+ faixas, corredor ≤ 1;
  // inversão: o resto (muda faixa e corredor, distância somada ≥ 3)
  function tipoDoPasso(de, para) {
    const df = faixaDe(para) - faixaDe(de), a = colunaDe(de), b = colunaDe(para), dc = Math.abs(b - a);
    if (Math.abs(df) <= 1 && a + b === 4 && dc >= 2) return "virada";
    if (df < 0) return "voltar";
    if (df === 0) return "lado";
    if (dc >= 2) return "inversao";
    if (df >= 2) return "pular";
    return dc ? "diagonal" : "subir";
  }

  // Destinos de de: para trás só uma faixa (corredor ≤ 1 ou a virada), para o lado até a virada, para a frente até a faixa 5.
  // Condução é um modo do passo (a bola no pé), não um destino: só em subir, diagonal e lado.
  const OPCOES = {}; // as opções de cada zona não mudam: feitas uma vez (quem chama não altera a lista)
  function opcoesDoPasso(de) {
    if (OPCOES[de]) return OPCOES[de];
    const r = OPCOES[de] = [];
    for (const para of ZONAS_GRADE) {
      if (para === de || faixaDe(para) < faixaDe(de) - 1) continue;
      const tipo = tipoDoPasso(de, para);
      if (tipo === "voltar" && Math.abs(colunaDe(para) - colunaDe(de)) > 1) continue;
      // i: posição do destino em ZONAS_GRADE; k: posição da opção na lista (o motor guarda contas por elas)
      const i = ZONAS_GRADE.indexOf(para);
      r.push({ para, tipo, i, k: r.length });
      if (tipo === "subir" || tipo === "diagonal" || tipo === "lado") r.push({ para, tipo, conduzir: true, i, k: r.length });
    }
    return r;
  }

  // Logit somado ao duelo do destino (V = CONFIG.gradeValores). O passe que atravessa faixa sofre a marcação dela no motor (V.atravessa).
  function dificuldade(tipo, de, para, V) {
    const D = V.dificuldade, df = faixaDe(para) - faixaDe(de), dc = Math.abs(colunaDe(para) - colunaDe(de)), cd = corredorDe(de);
    let l = tipo === "voltar" ? D.voltar : tipo === "lado" ? D.lado + D.ladoLonge * (dc - 1) : tipo === "subir" ? D.subir
      : tipo === "diagonal" ? (cd === "e" || cd === "d" ? D.diagonalMeio : D.diagonal) : tipo === "pular" ? D.pular * (df - 1)
      : tipo === "virada" ? D.virada : D.pular * (df - 1) + D.inversao * (df + dc - 2); // a inversão paga as faixas puladas, como o pular, e a distância
    if ((cd === "E" || cd === "D") && dc && tipo !== "voltar" && tipo !== "virada") l += D.paraDentro; // do lado para dentro: mais interceptado
    return l + D.pertoDoGol * Math.max(0, faixaDe(para) - 3);
  }

  const LARGURA = { E: "E", e: "e", C: "C", d: "e", D: "E" }; // corredor sem o lado
  // Valor da zona: o xT da 5×5 (spec 8), plano na largura até a faixa 5
  function valorDaZona(z, V) {
    const f = faixaDe(z);
    return f < 5 ? V.valorZona.faixas[f - 1] : V.valorZona.f5[LARGURA[z[1]]];
  }

  // Quem tem a bola compara as opções da lista: a nota vai de 0 (a pior) a 1 (a melhor), então o valor pode ser negativo (perto do próprio gol quase
  // todos são) sem as opções virarem iguais. Peso = ((piso + nota) × multDe)^γ, com γ pela Decisão: o bom decisor fica perto da melhor, o mau perto
  // da média. valorDe devolve null para a opção impossível. sortear: o sortearPeso do motor, por parâmetro para não duplicar.
  function escolherPasso(rng, opcoes, valorDe, dec, V, sortear, multDe = null) {
    const g = Math.max(0, V.decisao.base + V.decisao.inclinacao * (dec - 25) / 25), vals = opcoes.map(valorDe);
    let min = Infinity, max = -Infinity;
    for (const v of vals) if (v !== null) { if (v < min) min = v; if (v > max) max = v; }
    const faixa = max - min || 1, ids = [];
    for (let n = 0; n < vals.length; n++) if (vals[n] !== null) ids.push(n);
    const n = sortear(rng, ids, n => Math.pow((V.decisao.piso + (vals[n] - min) / faixa) * (multDe ? multDe(opcoes[n]) : 1), g));
    return n === null ? null : opcoes[n];
  }

  // O que o passo ganho deixa para o seguinte, num valor só (spec 12b: embalo, "a folga decide o próximo passo" e quem recebe de frente não somam):
  // logit = o maior entre o embalo, o bônus de frente e o de atrair a pressão (A2: a volta ganha contra quem pressiona, zero contra a retranca).
  // deFrente: diagonal saindo do meio-espaço com companheiro no corredor vizinho da faixa seguinte (temVizinho), ou folga acima do giro.
  // prende: reto pela lateral ou vertical pelo centro sem girar (quem recebe fica de costas e tende a devolver).
  function proximoImpulso({ folga, tipo, de, temVizinho, pressaoAdv = 0, mentalidadeAdv = 0, V }) {
    const I = V.impulso, c = corredorDe(de), reto = tipo === "subir" || tipo === "pular";
    const deFrente = (tipo === "diagonal" && (c === "e" || c === "d") && !!temVizinho) || folga >= I.giro;
    const prende = !deFrente && reto && (c === "E" || c === "D" || c === "C");
    const atrair = tipo === "voltar" && pressaoAdv >= 1 && mentalidadeAdv > -1 ? V.atrairPressao * pressaoAdv : 0;
    return { logit: Math.max(Math.min(I.teto, Math.max(0, I.parte * folga)), deFrente ? I.deFrente : 0, atrair), deFrente, prende };
  }

  // Rede de segurança do laço da jogada (spec 7.4): quase nunca atingida. Com 12, cortava 12% dos ataques e tirava a bola justamente de quem a guardava bem
  const LIMITE_DE_PASSOS = 30;

  // Preferência de passo por papel (aprovada pelo dono em 31/10): multiplica o valor de cada opção. Neutra nesta entrega; a etapa dos papéis preenche
  // (Distribuidor/Construtor: virada e pular; Técnico/Condutor: condução; Organizador: lado e volta; Criador/Articulador: diagonal e enfiada; …)
  function preferenciaDoPasso(papel, tipo, conduzir) { return 1; }

  // Segunda bola (spec 7.7): pela presença de cada time na zona de queda e nas vizinhas, com V.segundaBola.acaso de sorteio puro, seja quem for que
  // ganhou o 1º toque (quem ganhou entra pela presença: o motor multiplica a do time dele pelo Cabeceio, a direção da bola)
  function segundaBola(rng, nossa, deles, V) {
    const a = V.segundaBola.acaso;
    return rng.chance((1 - a) * (nossa + deles > 0 ? nossa / (nossa + deles) : 0.5) + a * 0.5);
  }
  return { CORREDORES, ZONAS_GRADE, ZONA_EM, ehGrade, faixaDe, corredorDe, colunaDe, espelhoGrade, linhaDaZona, ladoDaZona, vizinhas, nomeDaZona, paraNoveZonas, emNoveZonas, decisao, decisaoSobPressao, chegada, MANCHAS, espelharGrade, manchasDoTime, defesaVista, defesaComAtraso, rapidezBasculacao, arrasto, tipoDoPasso, opcoesDoPasso, dificuldade, valorDaZona, escolherPasso, proximoImpulso, LIMITE_DE_PASSOS, preferenciaDoPasso, segundaBola };
})();

const __papeis = (() => {
  // Papéis dos jogadores (plano fase 2): dentro da posição, o técnico escolhe o jeito de jogar. Cada papel tem os pesos da ficha (a nota no papel),
  // um mapa de zonas com a bola e outro sem a bola (motor.js) e um ritmo de gasto de energia. Os mapas são do lado direito; o esquerdo é o espelho.
  // O papel padrão de cada posição usa as zonas de hoje (COBERTURA do motor) nas duas fases e o gasto de hoje: sem escolha, nada muda.
  // Primeira fatia: laterais e alas. Os números vêm da página do plano (seções 03 e 04, aprovados em 28 e 29/10).
  const { IDX, FAMILIARIDADE, familiaridade } = __modelo;
  const { MANCHAS, espelharGrade } = __grade;
  // temporada em que os papéis passam a valer nas partidas (rodada.js tira o papel das escalações antes dela)
  const PAPEIS_DESDE = 1;

  const ESPELHO_LADO = { E: "D", C: "C", D: "E" };
  const espelharLado = mapa => Object.fromEntries(Object.entries(mapa).map(([z, w]) => [z[0] + ESPELHO_LADO[z[1]], w]));

  // gasto: o valor aprovado (28/10); gastoDoPapel divide pelo do papel padrão da posição.
  // mapas: só onde o papel não é o padrão (no padrão o motor usa a COBERTURA da posição).
  const PAPEIS = {
    fixo: {
      nome: "Fixo", faz: "Guarda o lado da defesa e fecha o ponta adversário.", custa: "Quase não chega ao fundo: o ponta do time fica sozinho pelo lado.",
      pesos: { des: 17, mar: 14, vel: 14, pos: 12, pas: 10, res: 7, cru: 6, cab: 5, dom: 5, com: 4, equ: 3, for: 3 },
      // no ala, um pouco mais à frente com a bola que o lateral (AD 0,15). No DR é o padrão e fica com a COBERTURA nas duas fases:
      // medido em 31/10, dividir o Fixo do lateral em com/sem a bola o deixava pego na transição e 0,1 pt/jogo abaixo dos outros papéis
      mapas: { WBR: { com: { AD: 0.15, MD: 0.40, DD: 0.45 }, sem: { MD: 0.35, DC: 0.10, DD: 0.55 } } },
      // na grade (spec 6): atrás, no lado da faixa 1. No DR é a mancha do lateral padrão (o Fixo é o padrão do DR)
      grade: { DR: MANCHAS.DR, WBR: { com: { "1D": 0.40, "2D": 0.30, "3D": 0.15, "4D": 0.15 }, sem: { "1D": 0.55, "1d": 0.10, "2D": 0.30, "3D": 0.05 } } },
      gasto: { DR: 0.95, WBR: 0.95 },
    },
    apoiador: {
      nome: "Apoiador", faz: "Chega ao fundo e cruza: soma ataque pelo lado.", custa: "As costas ficam abertas para o contra-ataque, e cansa mais.",
      pesos: { vel: 17, cru: 14, dri: 11, res: 11, pas: 10, des: 10, pos: 7, cri: 5, dom: 5, equ: 5, mar: 5 },
      // WBR é o padrão, só com as regras da T1 (mapasDoPapel comPadrao); sem elas o ala usa a COBERTURA de sempre. Mais alto que o lateral Apoiador nas
      // duas fases (DR com AD 0,30 desde 31/10, era 0,35: o mesmo pt/jogo): o terceiro zagueiro cobre, e sem a bola ele fica na linha dos volantes
      // (só cai para a linha de 5 com o time recuado). Fontes do dono: goal.com, guidetofootball.com, footballiconic.com. Calibrado em 31/10
      // (sim_papeis_laterais, 3-5-2, 3000 jogos): os outros papéis do ala a -0,06, -0,04 e -0,01 pt/jogo do padrão; mais que isso deixava 0,1 abaixo
      mapas: { DR: { com: { AD: 0.30, MD: 0.40, DC: 0.05, DD: 0.25 }, sem: { AD: 0.10, MD: 0.40, DC: 0.05, DD: 0.45 } }, WBR: { com: { AD: 0.32, MD: 0.42, DD: 0.26 }, sem: { AD: 0.10, MD: 0.45, DD: 0.45 } } },
      // na grade: sobe pelo lado até as faixas 4–5; o ala (padrão) fica na faixa 2 sem a bola
      grade: {
        DR: { com: { "1D": 0.20, "1d": 0.05, "2D": 0.15, "3D": 0.25, "4D": 0.20, "5D": 0.15 }, sem: { "1D": 0.45, "1d": 0.05, "2D": 0.25, "3D": 0.15, "4D": 0.10 } },
        WBR: { com: { "1D": 0.16, "2D": 0.20, "3D": 0.32, "4D": 0.20, "5D": 0.12 }, sem: { "1D": 0.35, "2D": 0.45, "3D": 0.10, "4D": 0.10 } },
      },
      gasto: { DR: 1.10, WBR: 1.15 },
    },
    construtor: {
      nome: "Construtor", faz: "Leva a bola da defesa ao meio pelo lado, com passe e criatividade.", custa: "Não chega ao fundo para cruzar e marca menos que o Fixo.",
      pesos: { pas: 17, vel: 14, des: 13, pos: 11, dom: 10, mar: 10, cri: 9, res: 7, cru: 3, equ: 3, dri: 3 },
      mapas: {
        DR: { com: { AD: 0.05, MD: 0.40, DC: 0.10, DD: 0.45 }, sem: { MD: 0.30, DC: 0.15, DD: 0.55 } },
        WBR: { com: { AD: 0.10, MC: 0.10, MD: 0.50, DD: 0.30 }, sem: { MD: 0.45, DC: 0.10, DD: 0.45 } },
      },
      // na grade: na faixa 2, entre o lado e o meio-espaço
      grade: {
        DR: { com: { "1D": 0.30, "1d": 0.05, "2D": 0.30, "2d": 0.25, "3D": 0.05, "4D": 0.05 }, sem: { "1D": 0.55, "1d": 0.15, "2D": 0.25, "3D": 0.05 } },
        WBR: { com: { "1D": 0.15, "2D": 0.30, "2d": 0.30, "3D": 0.15, "3d": 0.05, "4D": 0.05 }, sem: { "1D": 0.40, "1d": 0.05, "2D": 0.45, "3D": 0.10 } },
      },
      gasto: { DR: 1, WBR: 1 },
    },
    invertido: {
      nome: "Invertido", faz: "Com a bola, fecha por dentro e vira um volante a mais; sem ela, volta para o lado.", custa: "Na perda da bola, o corredor fica vazio até ele voltar, e cruza pouco.",
      // Velocidade 8→11 e Resistência 4→8 em 30/10 (fontes do dono: vai e volta entre o meio e o lado o jogo todo), tirados de Equilíbrio, Criatividade, Agressividade e Força
      pesos: { pas: 17, des: 15, pos: 13, dom: 11, vel: 11, mar: 10, res: 8, equ: 7, cri: 6, agr: 2 },
      mapas: {
        DR: { com: { MC: 0.35, MD: 0.10, DC: 0.15, DD: 0.40 }, sem: { MC: 0.10, MD: 0.20, DC: 0.15, DD: 0.55 } },
        WBR: { com: { AC: 0.10, MC: 0.40, MD: 0.25, DD: 0.25 }, sem: { MC: 0.15, MD: 0.40, DD: 0.45 } },
      },
      // na grade: com a bola no meio-espaço da faixa 2; sem ela, de volta ao lado
      grade: {
        DR: { com: { "1D": 0.30, "1d": 0.10, "2d": 0.40, "2C": 0.05, "2D": 0.10, "3d": 0.05 }, sem: { "1D": 0.55, "1d": 0.15, "2D": 0.25, "2d": 0.05 } },
        WBR: { com: { "1D": 0.15, "2d": 0.35, "2D": 0.15, "3d": 0.20, "3D": 0.10, "4d": 0.05 }, sem: { "1D": 0.40, "2D": 0.45, "2d": 0.05, "3D": 0.10 } },
      },
      gasto: { DR: 1.05, WBR: 1.05 },
    },
  };

  const PAPEL_PADRAO = { DR: "fixo", DL: "fixo", WBR: "apoiador", WBL: "apoiador" };
  const PAPEIS_POR_POSICAO = { DR: ["fixo", "apoiador", "construtor", "invertido"], WBR: ["apoiador", "fixo", "construtor", "invertido"] };
  // posição do lado direito que serve de base para a do esquerdo
  const DIREITA = { DL: "DR", WBL: "WBR" };
  const base = pos => DIREITA[pos] || pos;

  // papéis de uma posição, o padrão primeiro
  const papeisDaPosicao = pos => (PAPEIS_POR_POSICAO[base(pos)] || []).slice();
  const papelValido = (pos, papel) => !!papel && papeisDaPosicao(pos).includes(papel);

  // { com, sem } do papel na posição, já espelhado na esquerda; null quando o motor deve usar a COBERTURA da posição (padrão, sem papel ou papel inválido).
  // comPadrao (regras da T1): o padrão, sem papel ou papel inválido usa os mapas do papel padrão da posição, se ele tiver (o ala Apoiador tem; o lateral Fixo não)
  // grade (5×5): o mapa da grade do papel, também no padrão; null fora dos laterais/alas (o motor usa manchasDoTime)
  const ESPELHADOS = new Map();
  function mapasDoPapel(pos, papel, comPadrao = false, grade = false) {
    if (grade) {
      if (!papelValido(pos, papel)) { if (!comPadrao || !PAPEL_PADRAO[pos]) return null; papel = PAPEL_PADRAO[pos]; }
      const g = PAPEIS[papel].grade[base(pos)];
      if (!DIREITA[pos]) return g;
      return ESPELHADOS.get(g) || ESPELHADOS.set(g, { com: espelharGrade(g.com), sem: espelharGrade(g.sem) }).get(g); // o espelho de cada mapa, feito uma vez só
    }
    if (!papelValido(pos, papel) || papel === PAPEL_PADRAO[pos]) {
      if (!comPadrao || !PAPEL_PADRAO[pos]) return null;
      papel = PAPEL_PADRAO[pos];
    }
    const m = PAPEIS[papel].mapas[base(pos)];
    if (!m) return null;
    return DIREITA[pos] ? { com: espelharLado(m.com), sem: espelharLado(m.sem) } : m;
  }

  // nota do jogador no papel, na escala dos atributos, com a familiaridade da posição (como notaNaPosicao)
  function notaNoPapel(j, pos, papel) {
    const pesos = PAPEIS[papel].pesos;
    let soma = 0;
    for (const k in pesos) soma += pesos[k] * j.at[IDX[k]];
    return soma / 100 * FAMILIARIDADE[familiaridade(j, pos)];
  }

  // multiplicador do gasto de energia, relativo ao papel padrão da posição
  function gastoDoPapel(pos, papel) {
    if (!papelValido(pos, papel)) return 1;
    const b = base(pos);
    return PAPEIS[papel].gasto[b] / PAPEIS[PAPEL_PADRAO[pos]].gasto[b];
  }
  return { PAPEIS_DESDE, espelharLado, PAPEIS, PAPEL_PADRAO, papeisDaPosicao, papelValido, mapasDoPapel, notaNoPapel, gastoDoPapel };
})();

const __saude = (() => {
  // Saúde (etapa T3): lesões, forma e moral.
  // Lesões: o médico encurta a recuperação dos lesionados que atende e o preparador de prevenção reduz a chance de lesão do elenco.
  // Forma (0 a 100, começa em 50): sobe para quem joga e joga bem, cai para quem joga mal ou fica parado. O preparador de forma atende alguns por rodada.
  // Moral (0 a 100, começa em 50): sobe com vitória e com minutos em campo, cai com derrota e com banco. O psicólogo segura as quedas.
  // As duas pesam no desempenho em campo: forma de -6% a +6%, moral de -3% a +3%.
  // Módulo puro: usado pelo motor, pela função do servidor e pelas páginas.
  const CONFIG_SAUDE = {
    prevencao: [0.10, 0.30], // reduz a chance de lesão de 10% (skill 1) a 40% (skill 50)
    medico: 0.01,            // a skill do médico é o corte na duração da lesão: skill 50, metade do tempo (mínimo de 1 jogo fora)
    atendidos: [1, 1],       // o médico cuida de 1 lesionado ao mesmo tempo, mais 1 por nível do departamento médico
    efeitoDaForma: 0.06, efeitoDaMoral: 0.03,
    // jogou: por jogar 45 minutos ou mais; porNota: por ponto de nota acima (ou abaixo) da nota típica da posição (notaTipica). Titular que joga mal fica perto de 50, quem joga bem fica por volta de 65 a 75
    // volta: quanto puxa de volta para 50 a cada rodada. Era 0,1: em T13 o campeão chegou a forma 93 e moral 81 (+7% em campo) e a vantagem
    // se realimentava; com 0,2 o ganho de equilíbrio (bom jogo, preparador, vitória) vale a metade.
    forma: { jogou: 1, porNota: 4, entrou: 1, parado: -1, lesionado: -4, volta: 0.2 },
    // Nota típica de quem joga em cada posição (média de 300 partidas da T10, 45 minutos ou mais). A forma compara a nota do jogador com a da
    // posição dele: quando todos eram comparados com 6, o centroavante titular (nota média 7,15) estacionava em forma ~100 e o zagueiro em ~58,
    // o ataque ganhava uns 4% sobre a defesa e os gols por jogo subiam temporada a temporada (ferramentas/sim_forma.mjs).
    notaTipica: { GK: 6.0, DC: 6.0, SW: 5.9, DR: 5.9, DL: 5.9, WBR: 6.0, WBL: 6.0, DMC: 5.9, MC: 6.0, MR: 6.2, ML: 6.2, AMC: 6.5, AMR: 6.3, AML: 6.3, RW: 6.35, LW: 6.35, FC: 6.8, SC: 7.1 },
    moral: { vitoria: 3, derrota: -3, jogou: 2, entrou: 1, banco: -2, volta: 0.2 },
    preparador: [2, 6],      // o preparador de forma dá de 2 a 8 pontos de forma a cada jogador atendido
    atendidosNaForma: [2, 2],// atende 2 jogadores por rodada, mais 2 por nível da fisioterapia (os de pior forma)
    psicologo: [0.2, 0.4],   // o psicólogo corta de 20% a 60% das quedas de moral
    minutosDeJogo: 45,
  };
  // Analista: nível do comentário pós-jogo (1 sem analista, 2 com skill até 24, 3 com 25 ou mais) e detalhe da prévia do adversário.
  const nivelDoAnalista = skill => !skill ? 1 : skill < 25 ? 2 : 3;
  const FUNCOES_DE_SAUDE = { medico: "Médico", prevencao: "Preparador de prevenção", forma: "Preparador de forma", psicologo: "Psicólogo" };
  const escala = ([base, extra], skill) => skill ? base + extra * Math.min(50, skill) / 50 : 0;
  const reducaoDeLesao = skill => escala(CONFIG_SAUDE.prevencao, skill);
  const reducaoDoMedico = skill => CONFIG_SAUDE.medico * Math.min(50, skill || 0);
  const atendidosPeloMedico = nivel => CONFIG_SAUDE.atendidos[0] + CONFIG_SAUDE.atendidos[1] * (nivel || 0);
  const ganhoDeForma = skill => escala(CONFIG_SAUDE.preparador, skill);
  const atendidosNaForma = nivel => CONFIG_SAUDE.atendidosNaForma[0] + CONFIG_SAUDE.atendidosNaForma[1] * (nivel || 0);
  const corteDoPsicologo = skill => escala(CONFIG_SAUDE.psicologo, skill);
  // equipe: funcionários contratados do clube ([{ funcao, skill }]); clube: { medico_nivel, fisio_nivel }.
  function saudeDoClube(equipe, clube) {
    const de = f => (equipe || []).filter(x => x.funcao === f).reduce((m, x) => Math.max(m, x.skill || 0), 0);
    const medico = de("medico"), forma = de("forma");
    return {
      prevencao: reducaoDeLesao(de("prevencao")),
      medico: medico ? { reducao: reducaoDoMedico(medico), vagas: atendidosPeloMedico(clube && clube.medico_nivel) } : null,
      forma: forma ? { ganho: ganhoDeForma(forma), vagas: atendidosNaForma(clube && clube.fisio_nivel) } : null,
      psicologo: corteDoPsicologo(de("psicologo")),
      analista: nivelDoAnalista(de("analista")),
    };
  }

  // Experiência (0 a 100): sobe jogando e deixa o desempenho mais estável. Sem valor gravado, vale a estimativa pela idade.
  // Cada jogador tem um "dia" em cada partida: um multiplicador sorteado em torno de 1. Quanto mais experiente, menos ele varia.
  // bonus: além de estabilizar, a experiência rende um pouco mais em campo, de 0% (experiência 0) a 3% (experiência 100)
  const CONFIG_EXPERIENCIA = { jogou: 1, entrou: 0.5, porIdade: [17, 8], desvio: [0.05, 0.01], limiteDoDia: 0.12, bonus: 0.03,
    // jogo grande (final, playoff, Libertadores): o inexperiente oscila mais (desvio dele multiplicado) e sente o jogo (até 3% a menos, com experiência 0);
    // com experiência 100 nada muda
    jogoGrande: { desvio: 1.6, nervosismo: 0.03 } };
  // vale a maior entre a gravada e a estimativa pela idade: quem demora a estrear não fica para trás de quem nunca jogou
  const experienciaPelaIdade = j => Math.max(0, Math.min(100, (j.idade - CONFIG_EXPERIENCIA.porIdade[0]) * CONFIG_EXPERIENCIA.porIdade[1]));
  const experienciaDe = j => j.exp != null ? Math.max(+j.exp, experienciaPelaIdade(j)) : experienciaPelaIdade(j);
  const desvioDoDia = exp => CONFIG_EXPERIENCIA.desvio[0] + (CONFIG_EXPERIENCIA.desvio[1] - CONFIG_EXPERIENCIA.desvio[0]) * Math.max(0, Math.min(100, exp)) / 100;
  // multiplicador do jogador nesta partida; sem sorteio (rng nulo), 1
  function diaDoJogador(rng, j, grande = false) {
    if (!rng) return 1;
    const C = CONFIG_EXPERIENCIA, exp = experienciaDe(j), falta = 1 - Math.max(0, Math.min(100, exp)) / 100;
    const desvio = desvioDoDia(exp) * (grande ? 1 + (C.jogoGrande.desvio - 1) * falta : 1), centro = grande ? 1 - C.jogoGrande.nervosismo * falta : 1;
    return Math.max(1 - C.limiteDoDia, Math.min(1 + C.limiteDoDia, centro + rng.normal(0, desvio)));
  }
  // experiência depois de uma partida oficial (guarda uma casa decimal)
  // peso: 1 na liga e nos playoffs; 1,5 nos jogos de copa
  const experienciaDepois = (j, minutos, peso = 1) => Math.min(100, Math.round((experienciaDe(j) + peso * (minutos >= CONFIG_SAUDE.minutosDeJogo ? CONFIG_EXPERIENCIA.jogou : minutos > 0 ? CONFIG_EXPERIENCIA.entrou : 0)) * 10) / 10);

  const valor = v => v == null ? 50 : v;
  // Multiplicador do desempenho do jogador pela forma, pela moral (neutras em 50) e pela experiência (até 3% a mais).
  const fatorDeMomento = j => (1 + CONFIG_SAUDE.efeitoDaForma * (valor(j.forma) - 50) / 50) * (1 + CONFIG_SAUDE.efeitoDaMoral * (valor(j.moral) - 50) / 50) * (1 + CONFIG_EXPERIENCIA.bonus * experienciaDe(j) / 100);
  const limite = v => Math.max(0, Math.min(100, Math.round(v)));
  // Forma e moral depois de uma partida. nota e minutos: do relatório (minutos 0 para quem não entrou); resultado: 1 vitória, 0 empate, -1 derrota;
  // fora: "lesão", "suspensão" ou null (como o jogador estava antes do jogo); ganho: pontos de forma do preparador; psicologo: corte nas quedas de moral.
  function momentoDepois(j, { nota = null, minutos = 0, resultado = 0, fora = null, ganho = 0, psicologo = 0 } = {}) {
    const C = CONFIG_SAUDE, F = C.forma, M = C.moral, forma = valor(j.forma), moral = valor(j.moral);
    const jogou = minutos >= C.minutosDeJogo, entrou = minutos > 0 && !jogou;
    let df = fora === "lesão" ? F.lesionado : jogou ? F.jogou + (nota == null ? 0 : F.porNota * (nota - (C.notaTipica[j.pos] || 6))) : entrou ? F.entrou : F.parado;
    df += ganho - F.volta * (forma - 50);
    let dm = (resultado > 0 ? M.vitoria : resultado < 0 ? M.derrota : 0) + (jogou ? M.jogou : entrou ? M.entrou : fora ? 0 : M.banco);
    dm -= M.volta * (moral - 50);
    if (dm < 0) dm *= 1 - psicologo;
    return { forma: limite(forma + df), moral: limite(moral + dm) };
  }
  return { CONFIG_SAUDE, nivelDoAnalista, FUNCOES_DE_SAUDE, reducaoDeLesao, reducaoDoMedico, atendidosPeloMedico, ganhoDeForma, atendidosNaForma, corteDoPsicologo, saudeDoClube, CONFIG_EXPERIENCIA, experienciaDe, desvioDoDia, diaDoJogador, experienciaDepois, fatorDeMomento, momentoDepois };
})();

const __escalacao = (() => {
  // Formações de referência e escalação automática simples (o melhor disponível para cada vaga).
  const { notaNaPosicao, notaComPe } = __modelo;
  const { fatorDeMomento } = __saude;
  // nota na posição já com o pé, a forma, a moral e a experiência do jogador: é com ela que o bot (e o botão de escalar os melhores) escolhe
  const notaDoMomento = (j, pos) => notaComPe(j, pos) * fatorDeMomento(j);

  // reservas no banco de cada time (jogo, bots e tela)
  const TAMANHO_DO_BANCO = 9;

  const FORMACOES = {
    "4-4-2": ["GK", "DR", "DC", "DC", "DL", "MR", "MC", "MC", "ML", "FC", "SC"],
    "4-3-3 com pontas": ["GK", "DR", "DC", "DC", "DL", "DMC", "MC", "MC", "RW", "LW", "SC"],
    "4-2-3-1": ["GK", "DR", "DC", "DC", "DL", "DMC", "DMC", "AMR", "AMC", "AML", "SC"],
    "3-5-2 com alas": ["GK", "DC", "DC", "DC", "WBR", "WBL", "DMC", "MC", "MC", "FC", "SC"],
    "4-5-1": ["GK", "DR", "DC", "DC", "DL", "MR", "MC", "DMC", "MC", "ML", "SC"],
    "4-3-3 do Dugout (1 MC, 3 FC)": ["GK", "DR", "DC", "DC", "DL", "MR", "MC", "ML", "FC", "FC", "FC"],
    "4-1-4-1": ["GK", "DR", "DC", "DC", "DL", "DMC", "MR", "MC", "MC", "ML", "SC"],
    "4-4-1-1": ["GK", "DR", "DC", "DC", "DL", "MR", "MC", "MC", "ML", "AMC", "SC"],
    "4-3-2-1 (árvore de Natal)": ["GK", "DR", "DC", "DC", "DL", "MC", "MC", "MC", "AMC", "AMC", "SC"],
    "5-4-1": ["GK", "DC", "DC", "DC", "WBR", "WBL", "MR", "MC", "MC", "ML", "SC"],
    "5-3-2": ["GK", "DC", "DC", "DC", "WBR", "WBL", "MC", "MC", "MC", "FC", "SC"],
    "4-4-2 losango": ["GK", "DR", "DC", "DC", "DL", "DMC", "MC", "MC", "AMC", "FC", "SC"],
  };

  // Preenche as vagas pegando sempre o par (vaga, jogador) de maior nota entre os que sobraram.
  function escalar(elenco, vagas) {
    const livres = new Set(elenco), escalacao = new Array(vagas.length).fill(null);
    for (let n = 0; n < vagas.length; n++) {
      let melhor = null;
      vagas.forEach((pos, i) => {
        if (escalacao[i]) return;
        for (const j of livres) {
          const nota = notaDoMomento(j, pos);
          if (!melhor || nota > melhor.nota) melhor = { i, j, pos, nota };
        }
      });
      if (!melhor) break;
      escalacao[melhor.i] = { j: melhor.j, pos: melhor.pos };
      livres.delete(melhor.j);
    }
    return escalacao.filter(Boolean);
  }
  return { notaDoMomento, TAMANHO_DO_BANCO, FORMACOES, escalar };
})();

const __motor = (() => {
  // Motor da partida.
  // Campo em 9 zonas: 3 linhas (D defesa, M meio, A ataque) x 3 lados (E, C, D), sempre vistas pelo time que as ocupa.
  // Cada ataque passa por três duelos de zona (saída de bola, construção, criação) e, se vencer, vira uma chance com xG.
  // Passo D: instruções, energia, substituições e ordens condicionais, faltas, cartões, lesões e bola parada.
  // As constantes saíram da calibragem (calibragem.html).
  const { limitar } = __rng;
  const { IDX, POSICOES, FAMILIARIDADE, familiaridade, notaNaPosicao, ajusteDoPe, fraquezaDoPe, comNovos } = __modelo;
  const { fatorDeMomento, diaDoJogador } = __saude;
  const { mapasDoPapel, gastoDoPapel, papelValido, espelharLado, PAPEL_PADRAO } = __papeis;
  const { ZONAS_GRADE, ZONA_EM, CORREDORES, ehGrade, espelhoGrade, linhaDaZona, ladoDaZona, corredorDe, faixaDe, colunaDe, nomeDaZona, manchasDoTime, espelharGrade, defesaVista, rapidezBasculacao, arrasto, opcoesDoPasso, dificuldade, valorDaZona, escolherPasso, proximoImpulso, decisao, decisaoSobPressao, chegada, preferenciaDoPasso, segundaBola, vizinhas, LIMITE_DE_PASSOS } = __grade;
  const CONFIG = {
    ataquesPorMinuto: 0.75, /* 0,68 até a falta no meio deixar de dar o duelo (29/10/2026, ferramentas/sim_conversao.mjs); 0,84 com o embalo; 0,9 quando a energia passou a pesar (time cansado finaliza pior); 0,85 com os acréscimos (~6 min a mais), para os gols da liga ficarem onde estavam;
      0,68 depois da T14 (3,07 gols e 12% dos jogos com 6 ou mais): meta de 2,5 gols e ~24 finalizações por jogo, como no Brasileirão */ // ataques iniciados por minuto, somando os dois times
    mando: 1.04, // multiplicador da força do mandante
    expoentePosse: 1,
    expoenteCorredor: 1.5,
    pesoCentro: 1.15, // o jogo pelo centro é um pouco mais natural
    zonaVazia: 6, // força mínima de uma zona, para zona sem ninguém não virar divisão por zero
    inclinacaoDuelo: 1.2, // quanto a diferença de força pesa no duelo; mais alto, o melhor time vence mais
    baseDuelo: { D: 1.6, M: 0.25, A: 0.1 }, // logit do sucesso com forças iguais: cerca de 83%, 56% e 52%
    basculacao: 0.6, // fração da defesa livre do lado vazio que vai para o lado sobrecarregado, na medida do desequilíbrio do ataque
    ajudaAoCentro: 0.65, // quanto da defesa dos lados fecha o centro quando o adversário não ameaça pelos lados
    continuidade: 1.3, // preferência por seguir no mesmo lado de uma linha para a outra
    pesoCentroPosse: 1.5, // o centro do meio-campo pesa mais na posse do que os lados
    posseNumerica: 2, // controle × (em campo / 11)^isto: com 10 o time fica com ~44% da bola em vez de ~49% (sim10, 18/10/2026)
    vantagemFinalizador: 3, // somado ao atributo de quem chuta, na disputa com o goleiro
    xgBase: { cruzamento: 0.095, corte: 0.08, profundidade: 0.27, area: 0.15, longe: 0.045, escanteio: 0.075, falta: 0.06, penalti: 0.76 },
    inclinacaoXg: 1.2,
    // peso de quem chuta e do goleiro na chance de gol, os dois em volta do goleiroReferencia; a média dos dois é a inclinação antiga (1),
    // então forte x fraco não muda, mas o goleiro pesa o dobro (no Dugout ele pesa 3 a 4 vezes: ferramentas/dugout_rev/RELATORIO.md)
    finalizacao: { chute: 2 / 3, goleiro: 4 / 3, penalti: 0.6 },
    goleiroReferencia: 38, // defesa de um goleiro titular típico: a nota do goleiro compara os gols sofridos com o xG que esse goleiro enfrentaria
    fatorLibero: 0.8, // o líbero reduz o xG das bolas em profundidade
    // quem chuta mal prefere cruzar ou tocar: o peso do corte e do chute de longe depende do pé de quem venceu o duelo,
    // e o chute forçado (ataque emperrado) sai do pé de quem chuta melhor entre ele e os atacantes da área (null desliga)
    decisaoDoChute: { referencia: 25, inclinacao: 3 },
    pesoTipo: { profundidade: 0.3, area: 0.8, longe: 0.2, cruzamento: 0.35, corte: 0.3, longeLado: 0.5 }, // mistura dos tipos de chance, pelo centro e pelos lados
    variacaoChance: { profundidade: 0.4, area: 0.55, cruzamento: 0.45, corte: 0.35, longe: 0.35, cutback: 0.4 }, // dispersão da qualidade de cada chance (0 = todas parecidas); a média não muda
    ajusteGol: { cruzamento: 0.97, corte: 1.28, profundidade: 0.93, area: 0.89, longe: 1.26, escanteio: 0.99, falta: 1, penalti: 0.98, cutback: 1 }, // acerto fino para o xG de cada tipo bater com os gols
    xgMaximo: 0.75,
    // chance pelo lado multiplicada por (ataque na ponta / defesa daquele lado) / referência, elevado ao expoente, entre min e max (ver ferramentas/sim_formacoes.mjs)
    flancoAberto: { referencia: 0.38, expoente: 0.7, min: 0.7, max: 1.4 }, // max era 2,2: o bônus premiava os times fortes e a média passou de 3,4 gols na liga (18/10/2026)
    chuteForcado: 0.14, // chance de sair um chute de longe, pior, quando o duelo no ataque é perdido
    fatorChuteForcado: 0.7,
    // chute em etapas: bloqueado pela zaga; senão vai no gol com a chance `alvo` (para quem chuta no nível do goleiroReferencia, sobe com o pé dele);
    // no gol, o que sobra da chance de gol decide entre gol e defesa (aí só contam a chance e o goleiro). Fora: `trave` é a parte que bate na trave.
    semGol: {
      area: { bloqueado: 0.16, alvo: 0.46 }, longe: { bloqueado: 0.18, alvo: 0.4 }, corte: { bloqueado: 0.16, alvo: 0.4 }, cruzamento: { bloqueado: 0.12, alvo: 0.4 },
      escanteio: { bloqueado: 0.14, alvo: 0.4 }, falta: { bloqueado: 0.16, alvo: 0.38 }, profundidade: { bloqueado: 0.1, alvo: 0.55 }, cutback: { bloqueado: 0.14, alvo: 0.48 }, rebote: { bloqueado: 0.12, alvo: 0.62 }, penalti: { bloqueado: 0, alvo: 0.88 }, trave: 0.08,
      alvoPorGol: 0.6, // quanto a chance de ir no gol sobe com a chance de gol: chance boa vai mais no gol e o goleiro defende mais (os gols não mudam)
    },

    // instruções
    mentalidadeAtaque: 0.075, // por nível de mentalidade: força no meio e no ataque
    mentalidadeDefesa: 0.065, // por nível de mentalidade ofensiva: força que a defesa perde
    // retranca: 0,065 e ritmo 0,03 até 22/10/2026; o azarão que se fechava não ganhava nada contra o forte (0,46 → 0,47 ponto por jogo, ferramentas/sim_zebra.mjs).
    // 0,09 até o recuo entregar a posse (mentalidadePosseRetranca): o adversário passou a atacar mais e a defesa recuada ficou mais forte para compensar
    mentalidadeRetranca: 0.18, // por nível de mentalidade defensiva: força que a defesa ganha (fechar é mais fácil que criar)
    espacoPorMentalidade: 0.2, // por nível de mentalidade de quem defende: espaço para a bola em profundidade do adversário
    ritmoPorMentalidade: 0.08, // por nível, somando os dois times: jogo mais aberto tem mais ataques; o fechado tem menos gols, e jogo de poucos gols é o que dá chance ao azarão
    mentalidadePosse: 0.02,
    // Recuar entrega a bola: o adversário ataca mais (o "abafa" depois do 1 x 0), cada ataque dele vale menos, e o jogo esfria menos que o
    // somatório de mentalidades daria. Antes do recuo, a retranca valia como cera (os dois atacavam menos). ferramentas/sim_zebra.mjs
    mentalidadePosseRetranca: 0.15, ritmoPorRetranca: 0.03, // por nível de mentalidade defensiva (em -2, o adversário fica com 56% dos ataques, eram 50,6%)
    agressividadeDefesa: 0.07, // por nível: força nos duelos defensivos
    pressaoDefesa: 0.15, // por nível: força na marcação do meio para a frente (paga o cansaço: a pressão rende no 1º tempo e cobra no 2º)
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
    // Chuva (1 fraca, 2 forte): logit somado, por nível, aos duelos do ataque construído conforme o passe; e as perdas por domínio e passe errado aparecem mais
    chuva: { curto: -0.09, misto: -0.04, longo: 0, erros: 0.5 },
    estiloLongo: { profundidade: 1.6, cruzamento: 1.3, area: 0.6, longe: 0.8 }, // mistura de chances da bola longa
    estiloCurto: { area: 1.2, longe: 0.8 },
    // Finalização: resolver rápido (longe) chuta de fora e cruza cedo: mais chutes (e o duelo perdido no ataque vira chute ou chuveirinho mais vezes), mas piores;
    //   trabalhar até a área dá menos chutes e melhores, e o ataque emperrado perde a bola em vez de chutar.
    //   longe/cruzamento/outros: peso dos tipos de chance; cruzaForcado: parte dos duelos perdidos pelo lado que vira cruzamento afobado
    finalizar: { longe: { longe: 2.2, cruzamento: 1.4, outros: 0.85, forcado: 1.8, qualidade: 1.5, cruzaForcado: 0.5 }, area: { longe: 0.35, cruzamento: 0.7, outros: 1.15, forcado: 0.4 } },
    // Cruzamento alto (cabeceio) ou rasteiro (finalização e velocidade de quem chega). No misto, cada cruzamento vai para o que a área faz melhor.
    //   rasteiro: xG do rasteiro em relação ao alto; afobado: xG do cruzamento forçado
    cruzamento: { rasteiro: 1.1, afobado: 0.7 },
    // centroavante sozinho na área (o segundo da área tem peso < limite): os dois zagueiros ficam nele. bonus: pontos somados à marcação dele no cruzamento; peso: multiplica a vontade de cruzar
    marcacaoDobrada: { limite: 0.4, bonus: 6, peso: 0.8 },
    // por nível de mentalidade de quem defende (só para quem escolheu a instrução): chute de longe contra retranca; área contra retranca e contra time aberto
    finalizarXmentalidade: { longe: 0.15, areaRetranca: 0.1, areaAberto: 0.08 },
    // Contra a retranca, por nível de mentalidade defensiva: o passe curto não entra na área lotada (logit nos duelos da linha de ataque)
    // e o chuveirinho (cruzamento alto, por instrução) acha os lados livres (xG do cruzamento). A resposta à retranca é resolver rápido ou cruzar.
    curtoXretranca: 0.15, altoXretranca: 0.1,
    // Contra-ataque: vence time que joga para a frente; contra time cauteloso quase não acontece, e quem o usa constrói pior.
    contraAtaque: { com: 0.16, sem: 0.04, logit: 0.3, logitPorMentalidade: 0.15, posse: 0.92, porMentalidade: 0.85, semInstrucao: 0.25, porRetranca: 0.3, construcao: -0.15, linhaAlta: 1.5, porPostura: 0.25, posturaOfensiva: 0.3 },
    // Linha de impedimento: pega a bola longa, sofre com o passe curto e com o contra-ataque.
    impedimento: { semLinha: 0.07, porPasse: { curto: 0.2, misto: 0.28, longo: 0.58 }, porComunicacao: 0.01, libero: -0.15, noContraAtaque: 0.3, furou: 1.35, furouNoContraAtaque: 1.6,
      naPerda: { base: 0.2, linha: 1.6, longo: 1.4, curto: 0.7 } }, // bola perdida no ataque que vira impedimento (só muda a narração e a falta; o futebol real tem ~4 por jogo)
    capitao: 0.002, // por ponto de Influência acima de 25, quando o time está perdendo
    pesoArmador: 2, pesoAlvo: 1.8,
    comunicacaoGoleiro: 0.002, // por ponto de Comunicação do goleiro acima de 25: defesa do centro
    excentricidade: 0.1, // desvio da defesa do goleiro por ponto de Excentricidade
    // só narração (não mexe em nada do jogo): faixas da chance de gol do chute que foi no gol, e o frango quando a Excentricidade aumentou a chance em `frango` vezes
    narracaoDefesa: { facil: 0.2, boa: 0.4, milagre: 0.6, frango: 1.1 },
    // marcador superado no mesmo ataque: peso dele para marcar de novo, bloquear ou ser o zagueiro do chute (deixado para trás com facilidade fica fora do lance)
    recuperacao: { normal: 0.35, facil: 0 },
    narracaoChance: { marcado: 0.88, livraSe: 1.14, apertado: 0.55, livre: 1.8 }, // só narração do chute na área: multiplicadores do xG pelo duelo com o zagueiro e pela jogada limpa ou apertada

    calor: 0.2, // calor forte: fração a mais de energia gasta por minuto
    // Entrosamento: recém-chegado (j.entrosar = jogos do clube que faltam, de 8 a 0) tira rendimento do setor inteiro em que joga;
    // perda = o que o setor perde se todos os titulares dele acabaram de chegar
    entrosamento: { jogos: 8, perda: 0.10 },
    // energia
    gastoEnergia: 0.55, // por minuto, para Resistência 25
    gastoGoleiro: 0.3,
    energiaPiso: 0.6, // eficácia de um jogador com energia zero (era 0,8 e o cansaço não mudava nada: ver ferramentas/sim_energia.mjs)
    limiarCansado: 55,
    // Embalo: quem vence um duelo em que tinha folga (vantagem acima do normal naquela zona) leva parte dela para o lance seguinte.
    //   parte: fração da folga que segue adiante; teto: limite, em logit (0,28 dá uns 7 pontos percentuais);
    //   chance: quanto a folga no último duelo melhora a qualidade da finalização, no teto;
    //   contra: quanto a folga da defesa, quando ela rouba a bola, aumenta a chance de contra-ataque, no teto.
    embalo: { parte: 0.5, teto: 0.28, chance: 0.12, contra: 0.5, narrar: 0.85 },
    pe: { mesmo: 0.03, ambidestro: 0.06, compensacao: 0.02 }, // confronto de pés no duelo: bônus de quem ataca e o desconto que zera o efeito médio
    // Pé fraco (j.pf, de 1 a 20; jogador sem a nota não sente nada disto e o motor não sorteia nada a mais). Cada efeito vai em volta da média da liga
    // (media: fraqueza média dos jogadores, ver fraquezaDoPe), para não mudar os gols: quem tem o pé ruim pior perde, quem tem melhor ganha.
    //   tempo: logit no duelo do ataque, vezes a Marcação de quem marca / 25 (forçar para o pé ruim);
    //   pressao: logit nos duelos da defesa e do meio, por nível de pressão de quem defende (a saída de bola do zagueiro de um pé só);
    //   chute: parte dos chutes da área e do cruzamento rasteiro que sai com o pé ruim e o xG que ele perde com nota 1 (o xG médio fica igual);
    //   ambidestro: o bônus do confronto de pés vai de (nota - 12) / escala; na nota média dos ambidestros (16,5) é o de antes
    peFraco: { media: 0.42, tempo: 0.12, pressao: 0.1, chute: { parte: 0.3, perda: 0.35 }, ambidestro: 4.5 },
    desempenhoRuim: -1.5, desempenhoBom: 1.5, // condições de substituição "jogando mal" e "jogando bem": duelos vencidos além do esperado, mais 2 por gol
    recalcularACada: 5, // minutos
    narrarPerda: { D: 0.12, M: 0.18, A: 0.6 }, // fração das perdas de posse que entra na narração, por linha do campo

    // faltas, cartões, lesões e bola parada
    falta: 0.153, // 0,147 até 31/10/2026, quando quem tem amarelo passou a fazer menos falta; por duelo (alvo: 22 faltas por jogo, com os acréscimos); era 0,12 com 0,85 ataque por minuto
    faltaPorAgressividade: 0.2, // por nível: 0,6x a 1,4x faltas entre -2 e +2
    // Quem faz a falta: sem isto, quem cobre uma zona sozinho (meia e lateral) levava mais cartão que volante e zagueiro, ao contrário do futebol
    // real (volante, zagueiro e meio-campo na frente; ponta e meia de lado atrás). Ajustado com ferramentas/sim_cartoes.mjs.
    faltaPorPosicao: { DC: 1.6, SW: 1.6, DMC: 1.3, MC: 1.2, DR: 0.83, DL: 0.83, WBR: 0.8, WBL: 0.8, MR: 0.53, ML: 0.53, AMC: 0.77, AMR: 0.71, AML: 0.71, RW: 0.71, LW: 0.71, FC: 0.83, SC: 1.3 },
    // T14 com 0,47 e 0,003: 4,9 amarelos e 0,23 vermelho por jogo; meta agora de 4 amarelos e 0,2 vermelho (ferramentas/sim_jogo.mjs, 26/10/2026)
    amarelo: 0.37, amareloPorAgressividade: 0.1, vermelhoDireto: 0.004,
    cuidadoComAmarelo: 0.16, // era 0,12 antes do faltaComAmarelo (31/10/2026: 2º amarelo 0,11 → 0,09 por jogo, vermelho direto 0,08); o juiz alivia o segundo: multiplicador da chance de amarelo na falta de quem já tem um
    faltaComAmarelo: 0.6, // e quem já tem amarelo se segura: faz menos faltas (multiplicador da chance de falta no duelo)
    amareloPrimeiraFalta: 0.35, amareloPorFaltaAntes: 0.5, // o juiz pune a repetição: a chance cresce com as faltas que o jogador já fez (0,35 na 1ª, 0,85 na 2ª, 1,35 na 3ª…)
    segundoAmareloPrimeiroTempo: 0.5, // e segura a expulsão cedo
    lesao: 0.0026, // era 0,0023 com 0,85 ataque por minuto; por duelo, para quem tem a bola (alvo: 3 a 4 lesões por clube por temporada de 18 rodadas)
    maxSubstituicoes: 5,
    acrescimoPorFalta: 0.1, acrescimoPorSubstituicao: 0.5, acrescimoPorGol: 0.5, acrescimoPorLesao: 0.5, // minutos de acréscimo em cada tempo (arredondados para cima, mínimo 1)
    // Cera (instrução, só vale com o time ganhando): o jogo tem menos ataques, a arbitragem devolve parte do tempo no acréscimo
    // e cada minuto de cera arrisca um amarelo por retardar o reinício (goleiro mais que os outros; quem já tem amarelo se segura).
    cera: { ritmo: 0.7, acrescimo: 0.07, amarelo: 0.01, pesoGoleiro: 3 }, // ferramentas/sim_cera.mjs: +0,05 ponto por jogo, ~0,5 amarelo nos jogos em que é usada
    // chance de escanteio depois de defesa do goleiro e de bloqueio da zaga; era 0,53 para os dois até 31/10/2026, quando 60% dos escanteios saíam de
    // finalização. No real ~40% (estimativa: ~3 defesas e ~2 bloqueios por time; site de apostas sem método: 40% bloqueio de chute ou cruzamento,
    // 25% corte, 20% defesa, 15% rebote de bola parada); o resto vem do lado (escanteioDuelo)
    escanteio: { defesa: 0.3, bloqueado: 0.45 },
    escanteioDuelo: 0.39, // chance de escanteio quando a defesa corta uma jogada pelo lado (era 0,25)
    cabecadaEscanteio: 0.4, // chance de o escanteio ou a falta alçada virar finalização
    penalti: 0.072, // das faltas no centro do ataque
    faltaDireta: 0.15, // das faltas no ataque que não são pênalti (0,27 até 29/10/2026: quase 2 cobranças diretas por jogo, o dobro do futebol real)
    // Papéis (src/papeis.js), valores iniciais a calibrar (ferramentas/sim_papeis_laterais.mjs):
    //   passagemPorDentro: o que muda no mapa com a bola do Apoiador do DR quando há um ponta aberto (RW ou MR) na frente dele (no DL, o espelho);
    //   alaPorLado: parte do peso no fundo do lado do ala (de papel que não é o Apoiador) que sobe para o meio do lado com a bola do lado dele,
    //     ou fecha o centro da defesa com a bola do outro lado; entrosarTroca: jogos de entrosamento de quem troca de papel (supabase/164)
    //   transicao: no contra-ataque do adversário, quanto da defesa de quem tem papel sai do mapa com a bola (ele ainda não voltou) em vez do mapa sem a bola
    papeis: { passagemPorDentro: { AD: -0.20, AC: 0.10, MD: 0.10 }, alaPorLado: 0.3, entrosarTroca: 3, transicao: 1 },
    faltaRecomeca: true, // falta fora do ataque em quem perdia o duelo: o time recomeça do mesmo setor, em vez de ganhar o duelo
    // Regras da T1 (adendo de 30/10 ao plano dos papéis): só valem com simularPartida(..., { regrasT1: true }), o padrão; calcularPartida liga a partir
    // de PAPEIS_DESDE. regrasT1 é a chave que o motor lê durante a partida; t1: valores do CONFIG que mudam com as regras (aplicados e devolvidos).
    //   reserva: defesa de reserva, a soma dos pesos nas zonas D do mapa com a bola (quem fica atrás quando o time ataca); ao perder a bola, a chance de
    //     contra-ataque do adversário vai por (referencia / reserva) ^ expoente (a referência é a média das formações prontas);
    //   pressionar ("ao perder a bola"): retomada = chance de recuperar na hora, vezes a pressão do time na zona contra quem tem a bola ali;
    //     falha = quanto o contra-ataque fica mais provável quando a pressão não pega; gasto = energia a mais por minuto;
    //   recompor: contra = quanto do contra-ataque sobra (e o time não é pego fora do lugar); posse = o que fica do controle do meio
    regrasT1: false,
    //   compactacao: a marcação no meio de um lado só conta para a posse até razao vezes a defesa do fundo do mesmo lado (marcar alto sem cobertura atrás
    //     não segura a bola); o resto é o time esticado. As formações prontas ficam abaixo de 1 (o 5-4-1, 1,2)
    //   lotacao: zona com mais de limite jogadores (soma dos pesos): o que passa rende só resto. As formações prontas ficam até 2,5, menos a árvore de Natal (3,0 no meio)
    compactacao: { razao: 0.9 }, lotacao: { limite: 2.5, resto: 0.6 },
    transicao: { reserva: { mais: 1, expoente: 2 }, pressionar: { retomada: 0.25, falha: 1.4, gasto: 0.1 }, recompor: { contra: 0.35, posse: 0.95 } },
    // Pacote tático/transição (aprovado em 30/10, fontes do dono: rest defence, contra-ataque, goleiros). Tudo aqui vale só nas regras da T1 (os valores da
    // temporada 0 desligam; os da T1 ficam em t1, abaixo). ferramentas/sim_transicao.mjs
    //   reserva (R1): quem fica atrás é comparado com o peso que o adversário deixa nas zonas de ataque no mapa sem a bola, mais um (o princípio do +1):
    //     contra x ((saída do adversário + mais) / reserva) ^ expoente. Contra o 4-5-1 (centroavante sozinho) 2 bastam; contra o 4-4-2, ~3
    //   pressaoLeitura (4A): peso do Posicionamento na pressão da zona A, ao lado de Velocidade, Resistência, Agressividade e Equilíbrio
    //   contraChance (R4): o chute do contra-ataque vale qualidade x razao ^ expoente, sendo razao a mesma conta da R1 (pouca gente atrás, chance melhor);
    //     o real é ~1,4 vez o chute de jogo corrido (0,17 x 0,12)
    //   linhaAlta (1): a linha de impedimento expõe mais quem tem a zaga lenta: o x1,5 do contra-ataque e o furou da bola nas costas vão por
    //     (referencia / Velocidade de quem fica atrás) ^ expoente, entre min e max; o goleiro conta como goleiro zagueiros a mais nessa média
    //   saidaGoleiro (G2, régua da Opta: o goleiro sai pelo menos até a borda da área): na bola em profundidade ele tenta cortar com a chance tentativa
    //     (x linhaAlta com a linha de impedimento); corta pela leitura (média de Um contra um, Velocidade e Posicionamento) contra a Velocidade de quem
    //     corre; se não chega, o gol fica quase vazio (a defesa do goleiro no chute cai para vazio)
    //   escanteioContra (R5): time com a instrução de contra-ataque deixa o mais adiantado lá na frente no escanteio contra; quando a zaga afasta,
    //     sai em contra-ataque com a chance `chance` (razao: a da R4, com a zaga do adversário na área); custo: um a menos na área, cabeceio x custo
    pressaoLeitura: 0,
    // Grade 5×5 (docs/superpowers/specs/2026-10-31-grade-5x5-design.md): a chave que o motor lê durante a partida; só nas regras da T1 (t1.grade).
    // gradeValores, números de partida (a calibragem ajusta):
    //   lotacao: limite de jogadores (soma dos pesos) por corredor, o lado lota antes (zonas menores que as de 9); o que passa rende só resto
    //   compactacao: a defesa de cada zona da faixa k (2 a 5) só vale até razao vezes a da faixa k−1 no mesmo corredor (o bolsão entre as linhas)
    //   pesoPosse: peso de cada corredor das faixas 2–3 no controle do meio (d = e, D = E)
    //   passagemPorDentro: o mesmo de papeis.passagemPorDentro, na grade (o Apoiador com ponta aberto na frente passa pelo meio-espaço)
    //   defesa que o atacante enfrenta (defesaVista, spec 9.1–9.2): vazio, o zonaVazia de sempre; basculacao, o de sempre, dos 2 corredores livres
    //   para os 3 da bola; zonaCinza, parte que fica no meio-espaço oposto com a bola no meio-espaço; vazia (× a média da faixa) e ameaca (ataque ×
    //   a defesa): a zona pede ajuda; emprestimo: parte do que sobra a quem empresta; buracoZaga/buracoLateral: bônus da profundidade/do cruzamento
    //   quando o zagueiro/o lateral sai para cobrir; basculacaoRapidez: a defesa bascula com um passo de atraso (Posicionamento e Trabalho em equipe);
    //   arrasto: folga do duelo que arrasta o cobridor (a do narrar do embalo) e quanto o meio-espaço vizinho perde quando o ponta bate o lateral
    //   o passo (spec 7): dificuldade, logit de cada tipo (voltar > lado > subir > pular > virada, metas ~95/84/50/40% de acerto; ladoLonge por
    //   corredor além do 1º, paraDentro saindo do lado, pertoDoGol por faixa acima da 3); valorZona, o xT da 5×5; decisao, γ do peso v^γ pela Decisão;
    //   impulso: o embalo de hoje (parte, teto), giro (folga que vira quem recebe de frente, = arrasto.folga), deFrente (bônus de quem recebe de frente),
    //   prende (peso das opções para a frente de quem recebe de costas); atrairPressao: logit por nível de pressão do adversário na volta ganha (A2)
    //   a jogada (atacarNaGrade, spec 7): risco, quanto do valor da zona que o adversário ganha na perda pesa contra a opção; posse, o que perder a bola
    //   custa além disso, pela faixa de quem tem a bola (caro atrás, quase nada perto do gol: sem isso o lançamento compensa sempre); ousadia
    //   (Excentricidade, aprovada em 01/11): peso, quanto as opções difíceis ganham por (Excentricidade − 25) / 25, × faixas (de quem tem a bola; a
    //   Decisão filtra pelo γ), folga, quanto o passo difícil ganho leva a mais; sobe o risco, nunca a chance do duelo; calma (Influência, decidida em
    //   01/11): capitao e equipe, pesos da Influência do capitão e do Trabalho em equipe do time; moral, força perdendo por calma; pressao, quanto a
    //   calma segura a queda da Decisão sob pressão; pressaoNaVolta, logit contra
    //   a volta por nível de pressão, pela metade com peso ≥ dividir nas duas zonas vizinhas de quem recebe; pularPressao/pularLinha, vontade de pular
    //   faixa contra a pressão e a linha alta; armadilhaLado (A1), logit contra o passe para o lado por nível de pressão; atravessa, logit contra por
    //   ln(1 + defesa/zonaVazia) de cada faixa atravessada; conduzir, logit da condução (base + peso × (Drible, Velocidade, Domínio − 25) / 25);
    //   area (ações da área, dono 01/11): o valor da opção de finalizar na faixa 5 = chute × xT da zona × qualidade de quem tem a bola × (piso + (1 − piso) × 2 × folga na zona); mov, logit do passe para a área por (Movimentação de quem chega − 25) / 25;
    //   conduzir.fora, × na nota da condução do lateral fixo para zona fora da mancha dele (Passo 0: ele carregava para dentro; valendo para todos, zerava Decisões e Passe); atrair (dono, 01/11):
    //   quem conduz para cima da marcação puxa o marcador da zona vizinha: ganho, parte do xT do companheiro de lá que soma ao valor da condução; fator,
    //   quanto a defesa dali perde no passo seguinte, × (1 + drible × (Drible − 25) / 25) e × defesa do destino / marcador, até 1; pivo (dono, 01/11): quem
    //   recebe de costas nas faixas 4–5 segura com Força e Domínio e escora para quem chega: peso (0 desliga), segura, logit a favor da escora; vontade, peso dela na nota;
    //   mov, o bônus do terceiro homem × (1 + mov × (Movimentação de quem chega − 25) / 25). goleiro (dono, 01/11): a volta da faixa 1 para ele:
    //   dificuldade (logit), vontade + pressao por nível de pressão do adversário (× na nota), superioridade (logit do passe seguinte por nível: o 4×3)
    //   presenca, peso nosso que conta como "tem alguém" (o vizinho da diagonal); contato, multiplica a falta e a lesão por passo (há mais passos que
    //   duelos nas 9 zonas); narrar, passos contados no texto do ataque (passosChance no que termina em finalização)
    //   chance (Tarefa 7, spec 8, fim da jogada por corredor): areaMeio, peso do chute de dentro da área saindo do meio-espaço (5e e 5d ficam dentro da área: sem ele, a dupla de
    //   ataque quase não finalizava, e o 4-4-2 fazia 1 chute da área contra 5,7 do 4-2-3-1), xgMeio, o xG dele em relação ao do centro; xgCutback, xG base do passe para trás de quem chega ao fundo; cutback, peso dele;
    //   corteMeio, peso do chute direto do meio-espaço (raro diante do cutback e da enfiada); enfiada, peso da profundidade saindo do meio-espaço;
    //   peInvertido, quanto o pé do lado de dentro ajuda (e o outro atrapalha) o corte; blocoBaixo, por nível de mentalidade defensiva de quem
    //   defende, o cruzamento da linha de fundo e o cutback rendem mais; antecipado, o cruzamento cedo da faixa 4 do lado (opção do passo: valor
    //   da opção, xG em relação ao da linha de fundo, × no contra-ataque e contra linha alta); chutar, valor da opção de chute de longe da zona 14
    //   Tarefa 8 (spec 7.6–7.7): terceiro: o passo para a frente ganho com folga < apertado seguido da volta ganha dá ao próximo passo para a frente
    //   bonus × (1 + pressao × pressão do adversário) × agressivo (agressividade > 0) × retranca (mentalidade ≤ −1) × entrosamento do setor × diagonal
    //   (a volta para o corredor vizinho); a volta é disputada (disputa × (pressão + (Desarme e Agressividade de quem marca − 25) / 25)) e, perdida,
    //   o contra-ataque sai com chance × contra. longa: o lançamento para e/C/d da faixa 5 vai pelo alto sempre com o passe longo e, fora dele, com
    //   chance alto × Passe longo / 25; ladoZagueiro: logit do 1º toque quando sai do zagueiro pelo lado. aereo (1º toque, pacote aéreo): logit = base
    //   + lancador × (Passe longo − 25) / 25 + inclinacao × ln((Posicionamento + Força nosso + vazio) / (o deles + vazio)); direcao: quem ganha
    //   multiplica a presença do time dele na segunda bola por 1 + direcao × Cabeceio / 25. segundaBola: acaso, vizinhas (peso das zonas vizinhas da
    //   queda). viradaInstrucao: × no valor da virada e da inversão (passe longo, lados, curto); lancamento: logit do lançamento, da virada e da inversão por
    //   (Passe longo − 25) / 25 de quem passa
    //   Tarefa 9 (spec 10, transição): contra.centro: logit do contra-ataque que nasce de roubada no centro ou de interceptação; reciclar: quem
    //   roubou não sai no contra se a melhor chance de ganhar um passo para a frente (contra a defesa pega na transição) fica abaixo disto (o
    //   mau decisor às vezes sai mesmo assim); pressionarMeio: peso da vizinha de meio-espaço ocupada na retomada de quem pressiona ao perder
    //   (a zona da perda 1, cada vizinha metade); impedimento: a armadilha × (base + pressao × pressão de quem defende), e o furou ÷ isso
    grade: false,
    gradeValores: {
      lotacao: { E: 1.6, e: 2.0, C: 2.2, resto: 0.6 }, compactacao: { razao: 0.9 }, pesoPosse: { C: 1.5, e: 1.25, E: 1 },
      passagemPorDentro: { "4D": -0.10, "5D": -0.10, "4d": 0.10, "5d": 0.10 },
      vazio: 6, basculacao: 0.6, zonaCinza: 0.15, vazia: 0.35, ameaca: 1.3, emprestimo: 0.65, buracoZaga: 0.25, buracoLateral: 0.2,
      basculacaoRapidez: 0.5, arrasto: { folga: 0.85, lado: 0.2 },
      dificuldade: { voltar: 1.6, lado: 1.4, ladoLonge: -0.3, subir: 0, diagonal: 0.1, diagonalMeio: 0.35, pular: -1.7, virada: -2.6, inversao: -0.6,
        paraDentro: -0.2, pertoDoGol: -0.3 },
      valorZona: { faixas: [0.009, 0.017, 0.032, 0.075], f5: { E: 0.13, e: 0.15, C: 0.22 } }, decisao: { base: 5, inclinacao: 3, pressao: 5, piso: 0.02 },
      impulso: { parte: 0.5, teto: 0.28, giro: 0.85, deFrente: 0.3, prende: 0.5 }, atrairPressao: 0.12,
      baseDuelo: { D: 2.6, M: 1.7, A: 1.2 }, risco: 1.5, posse: [0.2, 0.2, 0.15, 0.06, 0.02], goleiro: { dificuldade: 1.2, vontade: 1, pressao: 0.1, superioridade: 0.12 }, ousadia: { peso: 0.3, folga: 0.5, faixas: [0.2, 0.4, 0.7, 1, 1] }, calma: { capitao: 0.7, equipe: 0.3, moral: 0.1, pressao: 0.5 }, pressaoNaVolta: 0.35, dividir: 0.3, pularPressao: 0.25, pularLinha: 0.3, armadilhaLado: 0.15, atravessa: 0.15,
      conduzir: { base: -0.3, peso: 0.6, fora: 0.6 }, area: { chute: 1, piso: 0.6, mov: 1 }, atrair: { ganho: 0.5, fator: 0.2, drible: 1, marcador: 20 }, pivo: { peso: 1, segura: 0.8, vontade: 1, mov: 1 }, presenca: 0.2, contato: 0.5, narrar: { passos: 3, passosChance: 8, alto: 30 },
      chance: { areaMeio: 0.8, xgMeio: 0.75, xgCutback: 0.16, cutback: 0.5, corteMeio: 0.35, enfiada: 1, peInvertido: 0.15, blocoBaixo: 0.15,
        antecipado: { valor: 0.12, xg: 0.8, contra: 1.4, linhaAlta: 1.25 }, chutar: 0.05,
        // acerto do cruzamento (meta 20–25% certos): logit = base + cruzador × (Cruzamento − 25) / 25 + inclinacao × ln((nossos + vazio) / (deles + vazio)),
        // quem ganha a bola = Posicionamento + Força no alto, Posicionamento + Velocidade no chão (pacote aéreo de 29/10), o goleiro sai (goleiro ×
        // Encaixe/Um contra um); menos afobado (o forçado); errado vira perda de bola, escanteio às vezes; cego: peso com que o mau decisor cruza mesmo
        // com a área vazia (o bom evita), pela Decisão de 15 (todo) a 35 (nada). Fontes de cruzamento (31/10, aprovadas P1–P6): cruzador pesa mais
        // (o bom acerta 30–40%, média 23,6%); pressao: menos × marcação/(marcação + vazio) na zona de quem cruza; peRuim: menos × fraqueza do pé de
        // quem cruza da linha de fundo do lado trocado; ladoFraco: parte do lado oposto da faixa 1 (lateral do lado fraco, ponta que volta) na defesa
        // da área; linhaAlta: a defesa da área × isso contra linha alta; virada: e × isso no antecipado do contra-ataque ou contra linha alta (a zaga
        // corre de frente para o próprio gol)
        cruzamento: { base: 0, cruzador: 1.0, inclinacao: 1, vazio: 3, goleiro: 0.3, afobado: 0.6, escanteio: 0.15, cego: 0.4,
          pressao: 0.6, peRuim: 0.5, ladoFraco: 0.6, linhaAlta: 0.85, virada: 0.85 } },
      terceiro: { apertado: 0.3, bonus: 0.35, pressao: 0.5, agressivo: 1.3, retranca: 0.2, diagonal: 1.3, contra: 1.5, disputa: 0.3 },
      longa: { alto: 0.5, ladoZagueiro: -0.3 }, aereo: { base: -0.3, lancador: 0.5, inclinacao: 1.5, vazio: 5, direcao: 0.5 },
      segundaBola: { acaso: 0.3, vizinhas: 0.5 }, viradaInstrucao: { longo: 1.5, lados: 1.5, curto: 0.6 }, lancamento: 0.4,
      contra: { centro: 0.15 }, reciclar: 0.8, pressionarMeio: 1.2, impedimento: { base: 0.6, pressao: 0.2 },
      // passe no espaço (Tarefa 9b, dono 31/10): a bola na frente, em zona sem ninguém nosso, para quem chega da faixa de baixo (mesmo corredor ou vizinho).
      // peso: o ataque do duelo = habilidade de quem chega no destino × chegada/25 × peso; dificuldade: logit; corrida: × (chegada dele − Velocidade de quem
      // marca ali)/25; impedimento: parte da conta da profundidade nas faixas 4–5
      espaco: { vontade: 2, peso: 0.6, dificuldade: -0.3, corrida: 0.5, impedimento: 0.5 },
      // passe entrelinhas (dono, 31/10): na faixa 4 por dentro (4e, zona 14, 4d) sem ninguém nosso, alguém aparece entre o meio e a defesa deles: o 9 que
      // recua da faixa 5 (recebe de costas) ou quem chega da 3 ou do lado; a bola no pé, sem corrida nem impedimento. Quem aparece: peso × Domínio;
      // peso: o ataque do duelo = habilidade dele ali × peso; dificuldade: logit; mov: logit por (Movimentação − 25) / 25: quem se movimenta bem se solta do marcador
      entrelinhas: { peso: 0.6, dificuldade: -0.2, mov: 0.5 },
      // reposição do goleiro (Tarefa 9c, dono 31/10): tiro de meta depois do chute para fora, a bola nas mãos depois da defesa que ele segura. Vai longe com
      // logit = base + instr + pressao × (pressão do adversário − 1) + goleiro × (Passe longo dele − referencia) / 25, e maos na reposição com a mão.
      // referencia: o Passe longo médio dos goleiros (19). Base −0,25 (~56% curtos): Opta, Premier League
      // 2024/25, 50,7% dos tiros de meta ficam na própria área e cerca de 45% saem do terço defensivo (fontes-tiro-de-meta). roubo: logit do tiro de meta curto por ponto de pressão (a saída sofrida; na reposição com a mão, o
      // adversário está voltando). Longo: duelo aéreo nas faixas 4–5, segunda bola uma faixa abaixo
      // rebote (Tarefa 9d): a defesa que não vira escanteio solta a bola com chance defesa × referencia / Encaixe, e o chute de longe × longe (quase sempre
      // segurado); a trave devolve com chance trave. proprio: parte em que o próprio chutador pega. xg: chance do chute do rebote. The Athletic: 1,4% dos
      // chutes, 1 em 4 vira gol, 1 em 4 gols é de quem chutou, 3,6% dos gols sem pênalti, nasce de chute de perto. golContra: chance no cruzamento errado que a
      // zaga corta e no escanteio afastado, × referencia / Posicionamento de quem corta (Copas 2,0% dos gols, Premier League ~3%; meta a rever com o volume de
      // cruzamentos da Tarefa 12). olimpico: chance por escanteio × (Cruzamento / 25)²: Premier League, 21 em 33 anos, 12 desde dezembro de 2015
      rebote: { defesa: 0.06, trave: 0.3, longe: 0.3, referencia: 30, proprio: 0.25, xg: 0.3 }, golContra: { cruzamento: 0.006, escanteio: 0.015, referencia: 28 }, olimpico: 0.0004,
      reposicao: { base: -0.25, instr: { curto: -1.2, misto: 0, longo: 1.2 }, pressao: 0.5, goleiro: 1.5, referencia: 19, maos: -1, roubo: 0.6 },
    },
    contraChance: null, linhaAlta: null, saidaGoleiro: null, escanteioContra: null,
    // t1, pacote tático/transição (30/10, ferramentas/sim_transicao.mjs, 6.000 jogos entre formações e instruções sorteadas): contra-ataque menos
    //   frequente (0,32/0,08 → 0,17/0,053) e melhor (R4), para os gols de contra-ataque na régua da Opta (recuperação na própria metade) ficarem em 6,0%
    //   (meta 5–7%; recorde da Premier League 7,1%), o chute de contra-ataque valer 1,37 vez o de jogo corrido (real ~1,4) e o time montado para o
    //   contra-ataque fazer 17,8% dos gols assim (meta 15–20%). Ritmo 0,69 → 0,79 para a liga voltar a 2,32 gols por jogo; conversão no alvo 28,5% (T0 27,1%).
    //   Saída do goleiro: 1,06 por jogo somando os dois (real 0,5 a 1 por goleiro), corta 79%. Posicionamento com a 4A: +7 a 12% de valor, atrás da Velocidade
    t1: { contraAtaque: { com: 0.17, sem: 0.053, logit: 0.9 }, ataquesPorMinuto: 0.79, baseDuelo: { D: 1.2, M: 0.25, A: 0.1 },
      pressaoLeitura: 0.5,
      contraChance: { qualidade: 1.17, expoente: 1, min: 0.6, max: 2 },
      linhaAlta: { referencia: 28, expoente: 1.5, goleiro: 0.5, min: 0.6, max: 1.8 },
      saidaGoleiro: { tentativa: 0.5, linhaAlta: 2, base: 1, inclinacao: 3, vazio: 8 },
      escanteioContra: { chance: 0.15, razao: 1.4, custo: 1.1 },
      grade: true }, // a jogada na grade 5×5 (atacarNaGrade)
  };

  const INSTRUCOES_PADRAO = {
    mentalidade: 0, // -2 muito defensiva … +2 muito ofensiva
    agressividade: 0, // -2 … +2
    pressao: 0, // 0, 1 ou 2
    lado: "misto", // misto, E, C, D ou lados
    passe: "misto", // misto, curto ou longo
    finalizar: "misto", // misto, longe (resolver rápido: chute de fora e cruzamento) ou area (trabalhar a bola até a área)
    cruzamento: "misto", // misto, alto ou rasteiro
    contraAtaque: false,
    impedimento: false,
    cera: false, // só vale enquanto o time estiver ganhando
    aoPerder: "misto", // misto, pressionar ou recompor (regras da T1)
    capitao: null, vice: null, armador: null, alvo: null, // ids de jogadores
    cobradores: { escanteio: [], falta: [], penalti: [] }, // listas de ids, em ordem de preferência
    substituicoes: [], // { min, sai, entra, pos?, cond }
    ordens: [], // { min, cond, muda: { mentalidade: 1, … } }
  };
  // Condições de substituições e ordens: sempre, ganhando, empatando, perdendo, cansado, amarelo (as duas últimas olham o jogador que sai).

  const LADOS = ["E", "C", "D"];
  const NA_ZONA = {}; // nome da zona da grade com a preposição, montado uma vez
  const ZONAS = ["DE", "DC", "DD", "ME", "MC", "MD", "AE", "AC", "AD"];
  const ZERADAS = { 9: Object.fromEntries(ZONAS.map(z => [z, 0])), 25: Object.fromEntries(ZONAS_GRADE.map(z => [z, 0])) };
  const NOME_LADO = { E: "esquerda", C: "centro", D: "direita" };

  // A zona de ataque de um time é a zona de defesa do outro, com o lado trocado.
  const ESPELHO_LINHA = { D: "A", M: "M", A: "D" }, ESPELHO_LADO = { E: "D", C: "C", D: "E" };
  const espelho = z => ehGrade(z) ? espelhoGrade(z) : ESPELHO_LINHA[z[0]] + ESPELHO_LADO[z[1]];
  // zonas em uso: as 25 da grade (regras da T1 com CONFIG.grade) ou as 9 de sempre
  const zonasDoMotor = () => CONFIG.grade ? ZONAS_GRADE : ZONAS;
  const meioEspaco = z => z[1] === "e" || z[1] === "d";
  const largura = z => ({ d: "e", D: "E" })[z[1]] || z[1]; // corredor sem o lado (d = e, D = E), para os valores por corredor da grade

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
    AMR: { AD: 0.62, MD: 0.33, AC: 0.05 }, // meia de lado fica na ponta (o 4-2-3-1 não vira um meio fechado)
    RW: { AD: 0.7, AC: 0.2, MD: 0.1 },
    FC: { AC: 0.7, AE: 0.1, AD: 0.1, MC: 0.1 },
    SC: { AC: 0.9, MC: 0.1 },
  };
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
  // a narração conta o papel só quando ele não é o padrão da posição (sem escolha, o texto é o de sempre)
  const temPapel = (jog, ...papeis) => !!jog && !!jog.papel && jog.papel !== PAPEL_PADRAO[jog.pos] && papeis.includes(jog.papel);
  const PONTA_ABERTO = ["RW", "LW", "MR", "ML"]; // na frente do Apoiador, quem fica aberto (padrões Agudo e Garçom); AMR/AML (Condutor) corta para dentro
  // Habilidade de quem tem a bola, por zona.
  // Na grade, cada zona vale pela linha antiga da faixa (1 = D, 2–3 = M, 4–5 = A) e pelo lado do corredor; o meio-espaço tem conta própria por faixa.
  function habilidadeAtaque(at, zona) {
    if (meioEspaco(zona)) {
      const f = faixaDe(zona);
      if (f >= 4) return (at[A.cri] * 1.25 + at[A.dom] * 1.25 + at[A.pas] + at[A.dri] + at[A.lon] * 0.5) / 5;
      if (f >= 2) return (at[A.pas] * 1.5 + at[A.dom] * 1.25 + at[A.cri] + at[A.dri] * 0.5 + at[A.vel] * 0.5) / 4.75;
      return (at[A.pas] * 2 + at[A.dom] + at[A.pos] + at[A.vel] * 0.5) / 4.5;
    }
    const centro = ladoDaZona(zona) === "C", linha = linhaDaZona(zona);
    if (linha === "D") return (at[A.pas] * 2 + at[A.dom] + at[A.pos]) / 4; // saída de bola
    if (linha === "M") return centro ? (at[A.pas] * 2 + at[A.cri] * 1.5 + at[A.dom] + at[A.equ] * 0.5) / 5 : (at[A.dri] + at[A.vel] + at[A.pas] + at[A.dom]) / 4;
    return centro ? (at[A.cri] * 1.5 + at[A.pas] + at[A.dom] + at[A.dri] * 0.5) / 4 : (at[A.dri] * 1.5 + at[A.vel] * 1.5 + at[A.cru] * 0.5 + at[A.dom] * 0.5) / 4;
  }
  // Habilidade de quem marca, por zona.
  function habilidadeDefesa(at, zona) {
    const linha = linhaDaZona(zona), pos = CONFIG.grade ? at[A.pos] * 0.75 + at[A.dec] * 0.25 : at[A.pos]; // na grade, defender também é decidir: dar o bote, atrasar ou recuar
    if (meioEspaco(zona) && linha !== "A") return faixaDe(zona) === 1
      ? (pos * 1.5 + at[A.mar] * 1.25 + at[A.vel] + at[A.des] * 0.75) / 4.5 // o canal zagueiro–lateral
      : (pos * 1.25 + at[A.des] * 1.25 + at[A.vel] * 0.75 + at[A.res] * 0.5 + at[A.mar] * 0.5) / 4.25;
    const centro = ladoDaZona(zona) === "C";
    if (linha === "A") return (at[A.vel] + at[A.res] + at[A.agr] + at[A.equ] + CONFIG.pressaoLeitura * pos) / (4 + CONFIG.pressaoLeitura); // pressão na saída do adversário
    if (linha === "M") return centro ? (pos * 1.5 + at[A.des] * 1.5 + at[A.equ] * 0.5 + at[A.res] * 0.5) / 4 : (at[A.des] + at[A.vel] + at[A.mar] * 0.5 + pos * 0.5) / 3;
    return centro ? (at[A.mar] * 1.5 + pos * 1.5 + at[A.des]) / 4 : (at[A.des] * 1.5 + at[A.vel] + at[A.mar] + pos * 0.5) / 4;
  }

  // escalacao: [{ j: jogador, pos, papel? }] com 11 nomes (papel: src/papeis.js; sem ele, ou inválido, o jeito de hoje da posição); banco: até TAMANHO_DO_BANCO (escalacao.js) jogadores; instrucoes: ver INSTRUCOES_PADRAO.
  // O objeto devolvido não muda durante a partida e pode ser reutilizado em várias simulações.
  // prevencao: fração a menos na chance de lesão dos jogadores deste time (preparador de prevenção), de 0 a 1
  function prepararTime({ nome, escalacao, banco = [], instrucoes = {}, mandante = false, prevencao = 0 }) {
    return {
      nome, mandante, escalacao, banco, prevencao,
      instrucoes: { ...INSTRUCOES_PADRAO, ...instrucoes, cobradores: { ...INSTRUCOES_PADRAO.cobradores, ...(instrucoes.cobradores || {}) } },
    };
  }

  // dia: o multiplicador do jogador nesta partida (varia menos em quem tem mais experiência); sem sorteio, 1
  const novoJog = (j, pos, rng = null, grande = false, papel = null) => ({ j, pos, papel: papelValido(pos, papel) ? papel : null, fam: FAMILIARIDADE[familiaridade(j, pos)], energia: 100, amarelos: 0, at: j.at, dia: diaDoJogador(rng, j, grande) });

  // Entrosamento de cada setor (D defesa com o goleiro, M meio, A ataque), de 1 - perda a 1. lista: [{ j, pos }]
  const SETOR = { gol: "D", defesa: "D", ala: "D", volante: "M", meio: "M", meia: "M", ataque: "A" };
  const setorDaPosicao = pos => SETOR[POSICOES[pos].linha];
  function entrosamento(lista) {
    const falta = { D: 0, M: 0, A: 0 }, n = { D: 0, M: 0, A: 0 }, C = CONFIG.entrosamento;
    for (const { j, pos } of lista) { const s = setorDaPosicao(pos); n[s]++; falta[s] += Math.min(1, (j.entrosar || 0) / C.jogos); }
    return { D: 1 - C.perda * falta.D / (n.D || 1), M: 1 - C.perda * falta.M / (n.M || 1), A: 1 - C.perda * falta.A / (n.A || 1) };
  }

  // Estado do time durante a partida.
  function iniciar(time, rng = null, grande = false) {
    return {
      nome: time.nome, mandante: time.mandante, prevencao: time.prevencao || 0,
      instr: { ...time.instrucoes },
      emCampo: time.escalacao.map(({ j, pos, papel }) => novoJog(j, pos, rng, grande, papel)),
      banco: time.banco.slice(), subs: 0, subsFeitas: new Set(), ordensFeitas: new Set(),
      cumpridas: {}, // "s0", "o1"…: { aos } (minuto) quando a troca/ordem aconteceu, { motivo } quando foi descartada
      nomes: Object.fromEntries([...time.escalacao.map(x => x.j), ...time.banco].map(j => [j.id, j.nome])),
      goleiro: null, temLibero: false, atk: {}, def: {}, zonas: {}, zonasDef: {}, controle: 0, comDefesa: 25,
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
    // na grade, a calma do time (capitão e Trabalho em equipe, nos dois sentidos): pesa perdendo aqui e sob pressão na Decisão (atacarNaGrade)
    const CA = CONFIG.grade && CONFIG.gradeValores.calma;
    t.calma = CA && cap ? CA.capitao * (cap.j.at[A.inf] - 25) / 25 + CA.equipe * (media(...t.emCampo.map(x => x.j.at[A.equ])) - 25) / 25 : 0;
    const moral = saldo >= 0 || !cap ? 1 : CA ? 1 + CA.moral * t.calma : 1 + (cap.j.at[A.inf] - 25) * CONFIG.capitao;
    const base = (t.mandante ? CONFIG.mando : 1) * moral;
    const mAtk = { D: 1, M: 1 + CONFIG.mentalidadeAtaque * I.mentalidade, A: 1 + CONFIG.mentalidadeAtaque * I.mentalidade };
    const agr = 1 + CONFIG.agressividadeDefesa * I.agressividade, pre = 1 + CONFIG.pressaoDefesa * I.pressao, abre = I.mentalidade > 0 ? 1 - CONFIG.mentalidadeDefesa * I.mentalidade : 1 - CONFIG.mentalidadeRetranca * I.mentalidade;
    const mDef = { D: agr * abre, M: agr * abre * pre, A: agr * pre };
    const ent = entrosamento(t.emCampo);
    t.goleiro = null; t.temLibero = false;
    const grade = CONFIG.grade, Z = zonasDoMotor(), G = CONFIG.gradeValores, manchas = grade ? manchasDoTime(t.emCampo) : null;
    t.atk = {}; t.def = {}; t.zonas = {}; t.zonasDef = {}; // novos a cada conta: sem resto das zonas da outra notação
    t.atk = { ...ZERADAS[Z.length] }; t.def = { ...ZERADAS[Z.length] }; // cópia de um molde com as chaves prontas (mais rápido que pôr uma a uma)
    for (const z of Z) { t.zonas[z] = []; t.zonasDef[z] = []; }
    const alas = []; // alas de papel que não é o Apoiador: mudam com o lado da bola
    t.reserva = 0; t.saida = 0; t.naFrente = null; // defesa de reserva: peso nas zonas D com a bola; saída: peso nas zonas A sem a bola (R1); naFrente: o mais adiantado (R5)
    let velAtras = 0, frente = 0;
    const transicao = {}; let naTransicao = false; // o que muda na defesa quando o adversário sai em contra-ataque (quem tem papel ainda está no mapa com a bola)
    for (const [i, jog] of t.emCampo.entries()) {
      const f = jog.fam * base * eficacia(jog) * fatorDeMomento(jog.j) * (jog.dia || 1) * ent[setorDaPosicao(jog.pos)]; // forma e moral do jogador (1 quando as duas estão em 50)
      // atributos efetivos neste momento da partida. Na grade, quem tem 22 (amistoso da T0, garoto da escolinha) joga com os 3 da T1, só no jogo: j.at não muda
      jog.at = (grade ? jog.cheio ??= comNovos(jog.j) : jog.j.at).map(v => v * f);
      const pe = ajusteDoPe(jog.j.pe, jog.pos, jog.j.pf); // pé dominante: pesa no cruzamento, no passe e na finalização de quem joga pelos lados
      if (pe) for (const k in pe) jog.at[k] *= pe[k];
      if (jog.pos === "GK") { t.goleiro = jog; continue; }
      if (jog.pos === "SW") t.temLibero = true;
      const p = jog.j.id === I.armador ? CONFIG.pesoArmador : 1;
      // zonas: quem tem a bola (mapa com a bola do papel); zonasDef: quem marca (mapa sem a bola). Sem papel, as duas são a COBERTURA da posição
      // na grade: o mapa da grade do papel (laterais e alas) ou a mancha da posição pela contagem da família (src/grade.js)
      const m = grade ? mapasDoPapel(jog.pos, jog.papel, true, true) || manchas[i] : mapasDoPapel(jog.pos, jog.papel, CONFIG.regrasT1);
      const sem = m ? m.sem : COBERTURA[jog.pos], P = POSICOES[jog.pos]; // na T1 o ala padrão também tem as duas fases
      let com = m ? m.com : COBERTURA[jog.pos];
      // passagem do Apoiador: com um ponta que fica aberto no mesmo lado (lido do lugar de cada um no campo), passa por dentro
      if (m && jog.papel === "apoiador" && P.linha === "defesa" && t.emCampo.some(o => o !== jog && PONTA_ABERTO.includes(o.pos) && POSICOES[o.pos].lado === P.lado)) {
        const pdD = grade ? G.passagemPorDentro : CONFIG.papeis.passagemPorDentro, pd = P.lado === "D" ? pdD : (grade ? espelharGrade : espelharLado)(pdD);
        com = { ...com }; for (const z in pd) com[z] = (com[z] || 0) + pd[z];
      }
      if (grade) jog.mancha = { com, sem }; // o relatório desenha o contorno do papel no mapa do jogador (Tarefa 11)
      const fundo = (grade ? "1" : "D") + P.lado; // fundo do lado: zona D de 9 ou faixa 1 da grade
      if (m && P.linha === "ala" && (papelValido(jog.pos, jog.papel) ? jog.papel : PAPEL_PADRAO[jog.pos]) !== "apoiador") alas.push({ jog, lado: P.lado, w: sem[fundo] || 0 });
      for (const z in com) {
        const w = com[z];
        // reserva (R1): na grade, quem fica na faixa 1 inteira (o lateral que não sobe conta, como nas 9 zonas) e nos corredores de dentro da faixa 2
        if (grade ? z[0] === "1" || (z[0] === "2" && ladoDaZona(z) === "C") : z[0] === "D") { t.reserva += w; velAtras += w * jog.at[A.vel]; }
        t.atk[z] += w * habilidadeAtaque(jog.at, z) * mAtk[linhaDaZona(z)];
        t.zonas[z].push({ jog, w, p: w * p });
      }
      let naA = 0;
      for (const z in sem) {
        const w = sem[z];
        t.def[z] += w * habilidadeDefesa(jog.at, z) * mDef[linhaDaZona(z)];
        t.zonasDef[z].push({ jog, w });
        if (linhaDaZona(z) === "A") naA += w; // na grade, as faixas 4–5
      }
      t.saida += naA; if (naA > frente) { frente = naA; t.naFrente = jog; }
      // transição: só quem tem papel fora do jeito de sempre da posição (na grade, os mapas de todos têm as duas fases; o Fixo padrão não entra)
      if (grade ? mapasDoPapel(jog.pos, jog.papel, true) : m) for (const z of Z) {
        const dw = (com[z] || 0) - (sem[z] || 0);
        if (dw) { transicao[z] = (transicao[z] || 0) + CONFIG.papeis.transicao * dw * habilidadeDefesa(jog.at, z) * mDef[linhaDaZona(z)]; naTransicao = true; }
      }
    }
    // zona lotada (regras da T1): passando de limite jogadores (soma dos pesos), o que sobra rende só a fração resto (o congestionamento do futebol real).
    // Na grade, o limite é por corredor (o lado lota antes)
    const lotar = (forca, quem, z) => {
      const W = quem.reduce((s, o) => s + o.w, 0), L = grade ? G.lotacao : CONFIG.lotacao, limite = grade ? L[largura(z)] : L.limite;
      if (W > limite) forca[z] *= (limite + (W - limite) * L.resto) / W;
    };
    if (CONFIG.regrasT1 || grade) for (const z of Z) { lotar(t.atk, t.zonas[z], z); lotar(t.def, t.zonasDef[z], z); }
    // compactação na grade (spec 9.3): a defesa da faixa k (2 a 5) só vale até razao vezes a da faixa k−1 no mesmo corredor (já compactada);
    // o que passa disso não conta (o bolsão entre as linhas). As faixas 2–3 entram assim no controle do meio
    const centroDaDefesa = grade ? "1C" : "DC";
    if (t.goleiro) t.def[centroDaDefesa] *= 1 + (t.goleiro.j.at[A.com] - 25) * CONFIG.comunicacaoGoleiro;
    if (grade) for (let k = 2; k <= 5; k++) for (let c = 0; c < 5; c++) { const z = ZONA_EM[k][c]; t.def[z] = Math.min(t.def[z], G.compactacao.razao * t.def[ZONA_EM[k - 1][c]]); }
    // Velocidade de quem fica atrás (com o goleiro), para a linha alta (1): com zaga lenta, a bola nas costas e o contra-ataque machucam mais
    const LA = CONFIG.linhaAlta, g = LA && t.goleiro ? LA.goleiro : 0;
    t.linhaAlta = LA ? limitar(Math.pow(LA.referencia / Math.max(1, (velAtras + g * (t.goleiro ? t.goleiro.at[A.vel] : 0)) / Math.max(0.1, t.reserva + g)), LA.expoente), LA.min, LA.max) : 1;
    // defesa com a bola em cada corredor (lado do próprio time): o ala do lado da bola sobe para pressionar, o do outro lado fecha a linha
    t.defTransicao = naTransicao ? Object.fromEntries(Z.map(z => [z, Math.max(0, t.def[z] + (transicao[z] || 0))])) : t.def;
    t.defLado = { E: t.def, C: t.def, D: t.def };
    if (alas.length) for (const l of ["E", "D"]) {
      const d = { ...t.def };
      for (const a of alas) {
        // na grade: do lado da faixa 1 para o lado da faixa 2 (o lado da bola) ou para o 1C
        const f = CONFIG.papeis.alaPorLado * a.w, fundo = (grade ? "1" : "D") + a.lado, para = a.lado === l ? (grade ? "2" : "M") + a.lado : centroDaDefesa;
        d[fundo] -= f * habilidadeDefesa(a.jog.at, fundo) * mDef.D; d[para] += f * habilidadeDefesa(a.jog.at, para) * mDef[linhaDaZona(para)];
      }
      t.defLado[l] = d;
    }
    if (grade) { t.defLado.e = t.defLado.E; t.defLado.d = t.defLado.D; } // na grade, a bola no meio-espaço conta como a do lado vizinho
    const linha = grade ? ["1e", "1C", "1d"].flatMap(z => t.zonasDef[z]) : t.zonasDef.DC, peso = linha.reduce((s, o) => s + o.w, 0);
    t.comDefesa = peso ? linha.reduce((s, o) => s + o.w * o.jog.j.at[A.com], 0) / peso : 10;
    const defNoMeio = l => CONFIG.regrasT1 && l !== "C" ? Math.min(t.def["M" + l], CONFIG.compactacao.razao * t.def["D" + l]) : t.def["M" + l]; // compactação (regras da T1)
    // na grade, o controle do meio vem das faixas 2–3, com o peso de cada corredor
    const meio = grade ? ZONAS_GRADE.filter(z => faixaDe(z) === 2 || faixaDe(z) === 3).reduce((s, z) => s + (t.atk[z] + t.def[z]) * G.pesoPosse[largura(z)], 0)
      : LADOS.reduce((s, l) => s + (t.atk["M" + l] + defNoMeio(l)) * (l === "C" ? CONFIG.pesoCentroPosse : 1), 0);
    t.controle = meio
      * (I.contraAtaque ? CONFIG.contraAtaque.posse : 1) * (1 + (I.mentalidade < 0 ? CONFIG.mentalidadePosseRetranca : CONFIG.mentalidadePosse) * I.mentalidade) * Math.pow(t.emCampo.length / 11, CONFIG.posseNumerica)
      * (CONFIG.regrasT1 && I.aoPerder === "recompor" ? CONFIG.transicao.recompor.posse : 1);
  }

  // Defesa de uma escalação com a bola em cada corredor (E, C, D, do lado do próprio time), descansada. Serve aos testes e às telas.
  function defesaPorCorredor(escalacao, instrucoes = {}) {
    const t = iniciar(prepararTime({ nome: "", escalacao, instrucoes }));
    recalcular(t, 0);
    return t.defLado;
  }

  // Desenho do time com e sem a bola, como "3-2-5": cada titular de linha conta na linha do campo (D, M, A) em que mais está no mapa da fase
  // (empate: a mais adiantada). Só leitura, para a escalação; a passagem do Apoiador e o lado da bola não entram.
  function desenhoDoTime(escalacao) {
    const conta = fase => {
      const n = { D: 0, M: 0, A: 0 };
      for (const { pos, papel } of escalacao) {
        if (pos === "GK") continue;
        const m = mapasDoPapel(pos, papel), mapa = m ? m[fase] : COBERTURA[pos], linha = { D: 0, M: 0, A: 0 };
        for (const [z, w] of Object.entries(mapa)) linha[z[0]] += w;
        n[["A", "M", "D"].reduce((a, l) => linha[l] > linha[a] + 1e-9 ? l : a)]++;
      }
      return `${n.D}-${n.M}-${n.A}`;
    };
    return { com: conta("com"), sem: conta("sem") };
  }

  // Defesa de uma escalação pega no contra-ataque, por zona (quem tem papel ainda no mapa com a bola), descansada. Serve aos testes.
  function defesaNaTransicao(escalacao, instrucoes = {}) {
    const t = iniciar(prepararTime({ nome: "", escalacao, instrucoes }));
    recalcular(t, 0);
    return t.defTransicao;
  }

  // Força de ataque e de defesa de uma escalação em cada zona, descansada e sem instruções. Serve ao bot e às telas.
  // grade: a conta na grade 5×5 (liga a chave só durante a conta)
  function avaliarZonas(escalacao, instrucoes = {}, { grade = false } = {}) {
    const antes = CONFIG.grade;
    CONFIG.grade = grade;
    try {
      const t = iniciar(prepararTime({ nome: "", escalacao, instrucoes }));
      recalcular(t, 0);
      return { atk: t.atk, def: t.def };
    } finally { CONFIG.grade = antes; }
  }

  // Defesa que o ataque de escAtk enfrenta contra escDef na grade (as 5 arrumações e a da transição), descansada. Serve aos testes.
  function defesaVistaNaGrade(escAtk, escDef, instrAtk = {}, instrDef = {}) {
    const antes = CONFIG.grade;
    CONFIG.grade = true;
    try {
      const [a, d] = [[escAtk, instrAtk], [escDef, instrDef]].map(([escalacao, instrucoes]) => { const t = iniciar(prepararTime({ nome: "", escalacao, instrucoes })); recalcular(t, 0); return t; });
      return { ...defesaDoCorredor(a, d), def: d.def };
    } finally { CONFIG.grade = antes; }
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
  // defZ: a defesa do adversário por zona (a do corredor da bola; sem ela, a geral)
  function montarDefesa(atk, def, defZ = def.def) {
    const dz = {};
    for (const z of ZONAS) dz[z] = defZ[espelho(z)];
    for (const linha of ["M", "A"]) {
      let ajuda = 0;
      const livre = {}, Z = CONFIG.zonaVazia; // livre: defesa de um lado que sobra porque o adversário não ameaça ali
      for (const l of ["E", "D"]) {
        const z = linha + l, ameaca = Math.min(1, (atk.atk[z] + Z) / (dz[z] + Z));
        livre[l] = dz[z] * (1 - ameaca);
        ajuda += CONFIG.ajudaAoCentro * livre[l];
      }
      dz[linha + "C"] += ajuda;
      // basculação: quem ataca mais por um lado puxa a defesa do lado vazio para lá; o lado vazio fica mais aberto para a virada de jogo
      const [e, d] = [atk.atk[linha + "E"], atk.atk[linha + "D"]], forte = e > d ? "E" : "D", fraco = forte === "E" ? "D" : "E";
      const vai = CONFIG.basculacao * Math.abs(e - d) / (e + d + Z) * livre[fraco];
      dz[linha + forte] += vai; dz[linha + fraco] -= vai;
    }
    return dz;
  }

  // Defesa que o atacante enfrenta em cada corredor dele (o corredor E do atacante é o lado D de quem defende); o C escolhe o lado do lance
  // Na grade: as 5 arrumações (corredor da bola, do atacante) e a da transição, cada uma { dz, buracos }
  function defesaDoCorredor(atk, def) {
    if (CONFIG.grade) {
      const posicionamento = Object.fromEntries(ZONAS_GRADE.map(z => {
        const q = def.zonasDef[z], w = q.reduce((s, o) => s + o.w, 0);
        return [z, w ? q.reduce((s, o) => s + o.w * o.jog.at[A.pos], 0) / w : 0];
      }));
      const vista = (defZ, corredorDaBola) => defesaVista({ atk: atk.atk, def: defZ, posicionamento, corredorDaBola, V: CONFIG.gradeValores });
      const r = Object.fromEntries(CORREDORES.map(c => [c, vista(def.defLado[CORREDORES[4 - colunaDe("1" + c)]], c)]));
      // a da transição só no contra-ataque, montada na primeira vez; as defesas também em vetores pela posição da zona (a jogada avalia ~25 opções por passo)
      let T = null;
      Object.defineProperty(r, "T", { get: () => T || (T = vista(def.defTransicao, "C")), enumerable: true });
      r.vetor = { col: CORREDORES.map(c => r[c].vetor), get T() { return r.T.vetor; } };
      const linha = def.emCampo.filter(x => x.pos !== "GK"), n = linha.length || 1;
      r.rapidez = rapidezBasculacao(linha.reduce((s, x) => s + x.at[A.pos], 0) / n, linha.reduce((s, x) => s + x.at[A.equ], 0) / n, CONFIG.gradeValores);
      return r;
    }
    const C = montarDefesa(atk, def), por = l => def.defLado && def.defLado[ESPELHO_LADO[l]] !== def.def ? montarDefesa(atk, def, def.defLado[ESPELHO_LADO[l]]) : C;
    return { E: por("E"), C, D: por("D"), T: def.defTransicao && def.defTransicao !== def.def ? montarDefesa(atk, def, def.defTransicao) : C };
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

  // Área e zaga na grade: as zonas de dentro da faixa 5 de quem ataca e da faixa 1 de quem defende, somadas por jogador
  const juntar = lista => { const m = new Map(); for (const o of lista) { const x = m.get(o.jog); if (x) { x.w += o.w; x.p += o.p || 0; } else m.set(o.jog, { ...o, p: o.p || 0 }); } return [...m.values()]; };
  const naArea = t => CONFIG.grade ? juntar(["5e", "5C", "5d"].flatMap(z => t.zonas[z])) : t.zonas.AC;
  const naZaga = t => CONFIG.grade ? juntar(["1e", "1C", "1d"].flatMap(z => t.zonasDef[z])) : t.zonasDef.DC;
  // o quanto quem leva a bola cruza ou rola para a área vazia: o mau decisor (Decisão 15) todo, o bom (35) nada
  const cegueira = at => limitar((35 - decisao(at)) / 20, 0, 1);

  // Monta a chance depois de vencido o duelo na zona de ataque.
  // Com a grade (zona = onde a jogada termina, buracos = o que a cobertura emprestada abriu), a mistura vem do corredor (spec 8): 5C área, profundidade
  // e longe; meio-espaço da faixa 5 cutback, enfiada e o corte (raro); lado da faixa 5 cruzamento da linha de fundo e cutback; 4E/4D o cruzamento
  // antecipado; 4C (zona 14) o chute de longe. Sem zona, o de sempre.
  function criarChance(rng, atk, def, lado, pivo, { forcado = false, contra = false, superados = null, zona = null, buracos = null, marcacao = 0 } = {}) {
    const area = naArea(atk), x = CONFIG.xgBase, k = CONFIG.inclinacaoXg, I = atk.instr;
    const alvoAereo = area.reduce((s, o) => s + o.w * media(o.jog.at[A.cab], o.jog.at[A.for]), 0) / 30;
    const alvoVeloz = area.reduce((s, o) => s + o.w * media(o.jog.at[A.vel], o.jog.at[A.dom]), 0) / 30;
    const alvoRasteiro = area.reduce((s, o) => s + o.w * media(o.jog.at[A.fin], o.jog.at[A.vel]), 0) / 30;
    const MD = CONFIG.marcacaoDobrada, pesos = area.map(o => o.w).sort((a, b) => b - a), sozinho = area.length > 0 && (pesos[1] || 0) < MD.limite;
    const centroavante = sozinho ? area.reduce((m, o) => o.w > m.w ? o : m).jog : null; // o único atacante de verdade na área
    const alvoCruz = (I.cruzamento === "alto" ? alvoAereo : I.cruzamento === "rasteiro" ? alvoRasteiro : Math.max(alvoAereo, alvoRasteiro)) * (sozinho ? MD.peso : 1);
    const presenca = Math.min(1, area.reduce((s, o) => s + o.w, 0));
    const pt = CONFIG.pesoTipo;
    const espaco = Math.max(0.3, 1 + CONFIG.espacoPorMentalidade * def.instr.mentalidade); // linha recuada tira o espaço nas costas
    const jeito = I.passe === "longo" ? CONFIG.estiloLongo : I.passe === "curto" ? CONFIG.estiloCurto : {};
    const estilo = { profundidade: (jeito.profundidade || 1) * (contra ? 2 : 1) * espaco, area: jeito.area || 1, longe: jeito.longe || 1, cruzamento: jeito.cruzamento || 1, corte: 1 };
    const fin = CONFIG.finalizar[I.finalizar]; // chutar de longe ou trabalhar até a área: muda a mistura dos tipos de chance
    if (fin) for (const t in estilo) estilo[t] *= fin[t] || fin.outros;
    const D = CONFIG.decisaoDoChute, pe = v => D ? mod(v, D.referencia, D.inclinacao) : 1; // vontade de chutar, pelo pé
    const G = CONFIG.gradeValores.chance, b = buracos || { profundidade: 1, cruzamento: 1 }, cz = zona && zona[1], f5 = !!zona && zona[0] === "5";
    if (zona) lado = cz === "E" || cz === "e" ? "E" : cz === "D" || cz === "d" ? "D" : "C"; // o meio-espaço narra o lado dele
    const fechado = 1 + G.blocoBaixo * Math.max(0, -def.instr.mentalidade); // bloco baixo: ir ao fundo e cruzar ou rolar para trás
    const opcoes = zona === "4C" ? [["longe", 1]] : zona && !f5 ? [["cruzamento", 1]]
      : f5 && (cz === "e" || cz === "d") ? [["corte", pt.corte * G.corteMeio * pe(media(pivo.at[A.fin], pivo.at[A.lon]))], ["cutback", G.cutback * Math.max(presenca, G.cruzamento.cego * cegueira(pivo.at))], ["profundidade", pt.profundidade * alvoVeloz * estilo.profundidade * G.enfiada], ["area", pt.area * presenca * estilo.area * G.areaMeio]]
      : f5 && cz !== "C" ? [["cruzamento", pt.cruzamento * Math.max(alvoCruz, G.cruzamento.cego * cegueira(pivo.at)) * estilo.cruzamento * b.cruzamento * fechado], ["cutback", G.cutback * Math.max(presenca, G.cruzamento.cego * cegueira(pivo.at)) * fechado]]
      : lado === "C"
      ? [["profundidade", pt.profundidade * alvoVeloz * estilo.profundidade], ["area", pt.area * presenca * estilo.area], ["longe", pt.longe * estilo.longe * pe(pivo.at[A.lon])]]
      : [["cruzamento", pt.cruzamento * alvoCruz * estilo.cruzamento], ["corte", pt.corte * pe(media(pivo.at[A.fin], pivo.at[A.lon]))], ["longe", pt.longeLado * estilo.longe * pe(pivo.at[A.lon])]];
    const tipo0 = !forcado ? (sortearPeso(rng, opcoes, o => o[1]) || [f5 ? "corte" : "longe"])[0] : (f5 && (cz === "E" || cz === "D")) || lado !== "C" && fin && fin.cruzaForcado && rng.chance(fin.cruzaForcado) ? "cruzamento" : "longe"; // na linha de fundo, o afobado cruza
    const tipo = tipo0 === "cutback" && !area.length ? "corte" : tipo0; // rolar para trás sem ninguém chegando: ele mesmo chuta
    // chute forçado: quem chuta mal rola para quem chuta melhor (ele mesmo ou um atacante da área)
    if (forcado && D && tipo === "longe") { const quem = sortearPeso(rng, [{ jog: pivo }, ...area.filter(o => o.jog !== pivo)], o => Math.pow(pe(o.jog.at[A.lon]), 2)); if (quem) pivo = quem.jog; }
    const volta = o => superados && superados.has(o.jog) ? superados.get(o.jog) : 1;
    const zagueiro = (sortearPeso(rng, naZaga(def), o => o.w * volta(o)) || {}).jog;
    const zag = zagueiro ? zagueiro.at : null, gk = def.goleiro ? def.goleiro.at : null;
    const semZaga = 12, semGoleiro = 5; // valores usados quando não há zagueiro na zona ou goleiro em campo
    const c = { tipo, lado, criador: pivo, finalizador: pivo, zagueiro, contra, recuperou: !!(zagueiro && superados && superados.has(zagueiro)), ...(zona ? { zona } : {}) };
    // quem recebe o passe ou o cruzamento não é quem o fez, a não ser que esteja sozinho na área
    const outros = area.filter(o => o.jog !== pivo), alvos = outros.length ? outros : area;
    const ehAlvo = o => o.jog.j.id === I.alvo ? CONFIG.pesoAlvo : 1;

    if (tipo === "cruzamento") {
      // alto ou rasteiro: o escolhido na instrução; no misto, sorteado pela força da área no alto e no chão
      c.rasteiro = I.cruzamento === "rasteiro" || I.cruzamento !== "alto" && rng.chance(alvoRasteiro / (alvoAereo + alvoRasteiro || 1));
      const Cz = CONFIG.cruzamento;
      if (zona) { // na grade o cruzamento pode não achar ninguém (o mais comum no futebol): a área vazia, a zaga ou o goleiro chegam antes
        const CZ = G.cruzamento, ganha = j => j.at[A.pos] + (c.rasteiro ? j.at[A.vel] : j.at[A.for]);
        const fraco = def.zonasDef[lado === "E" ? "1E" : "1D"] || []; // o lado oposto da faixa 1 de quem defende (o espelho troca os lados)
        const alta = def.instr.impedimento || def.instr.mentalidade > 0;
        const nos = area.reduce((s, o) => s + o.w * (o.jog.at[A.mov] + (c.rasteiro ? o.jog.at[A.vel] : o.jog.at[A.for])), 0) / 2; // quem ataca a bola: a Movimentação; quem defende: o Posicionamento
        const eles = ((naZaga(def).reduce((s, o) => s + o.w * ganha(o.jog), 0) + CZ.ladoFraco * fraco.reduce((s, o) => s + o.w * ganha(o.jog), 0)) / 2
          * (alta ? CZ.linhaAlta : 1) * (!f5 && (contra || alta) ? CZ.virada : 1) + (gk ? CZ.goleiro * media(gk[A.enc], gk[A.um]) : 0));
        c.vazia = !area.length;
        const pf = pivo.j.pf, trocado = f5 && pf != null && (pivo.j.pe === "E" || pivo.j.pe === "D") && pivo.j.pe !== lado; // da linha de fundo, sem tempo de ajeitar
        const l = CZ.base + CZ.cruzador * (pivo.at[A.cru] - 25) / 25 + CZ.inclinacao * Math.log((nos + CZ.vazio) / (eles + CZ.vazio)) - (forcado ? CZ.afobado : 0)
          - CZ.pressao * marcacao / (marcacao + CZ.vazio) - (trocado ? CZ.peRuim * fraquezaDoPe(pf) : 0);
        if (!f5) c.antecipado = true;
        if (c.vazia || !rng.chance(1 / (1 + Math.exp(-l)))) { c.errado = true; return c; }
      }
      if (c.rasteiro) { // rasteiro: o cruzador precisa chegar à linha de fundo; quem chega bate de primeira contra a marcação e o reflexo do goleiro
        c.finalizador = sortearPeso(rng, alvos, o => o.w * (o.jog.at[A.fin] + o.jog.at[A.vel]) * ehAlvo(o)).jog;
        const f = c.finalizador.at;
        const dobra = c.finalizador === centroavante ? MD.bonus : 0;
        c.xg = x.cruzamento * Cz.rasteiro * Math.pow(mod(media(pivo.at[A.cru], pivo.at[A.dri]), 28, k), 0.6) * mod(media(f[A.fin], f[A.vel]), (zag ? media(zag[A.mar], zag[A.pos], zag[A.vel]) : semZaga) + dobra, k);
        c.chute = f[A.fin]; c.defesa = gk ? gk[A.ref] : semGoleiro;
      } else {
        c.finalizador = sortearPeso(rng, alvos, o => o.w * (o.jog.at[A.cab] + o.jog.at[A.for]) * ehAlvo(o)).jog;
        const f = c.finalizador.at;
        const dobra = c.finalizador === centroavante ? MD.bonus : 0;
        c.xg = x.cruzamento * Math.pow(mod(pivo.at[A.cru], 28, k), 0.6) * mod(media(f[A.cab], f[A.for]), (zag ? media(zag[A.cab], zag[A.mar], zag[A.for]) : semZaga) + dobra, k);
        c.chute = f[A.cab]; c.defesa = gk ? media(gk[A.enc], gk[A.pos]) : semGoleiro;
      }
      if (forcado) c.xg *= Cz.afobado; // chuveirinho de quem perdeu o duelo: cruza sem tempo de mirar
      if (zona && !f5) { // cruzamento antecipado: pior que o da linha de fundo, melhor com a zaga correndo para trás (contra-ataque, linha alta)
        const AN = G.antecipado;
        c.xg *= AN.xg * (contra ? AN.contra : 1) * (def.instr.impedimento || def.instr.mentalidade > 0 ? AN.linhaAlta : 1);
      }
    } else if (tipo === "cutback") { // vai ao fundo e rola para trás para quem chega: chute de primeira, de frente, com a zaga virada
      c.finalizador = (sortearPeso(rng, alvos, o => o.w * (o.jog.at[A.fin] + o.jog.at[A.dom]) * ehAlvo(o)) || { jog: pivo }).jog;
      const f = c.finalizador.at;
      c.xg = G.xgCutback * Math.pow(mod(media(pivo.at[A.cru], pivo.at[A.pas]), 28, k), 0.5) * mod(media(f[A.fin], f[A.dom]), zag ? media(zag[A.mar], zag[A.pos]) : semZaga, k);
      c.chute = f[A.fin]; c.defesa = gk ? gk[A.ref] : semGoleiro;
    } else if (tipo === "corte") {
      c.xg = x.corte * mod(media(pivo.at[A.fin], pivo.at[A.lon]), 26, k);
      if (zona && (pivo.j.pe === "E" || pivo.j.pe === "D")) c.xg *= pivo.j.pe !== lado ? 1 + G.peInvertido : 1 - G.peInvertido; // o pé invertido corta para o pé bom
      c.chute = media(pivo.at[A.fin], pivo.at[A.lon]); c.defesa = gk ? media(gk[A.ref], gk[A.pos]) : semGoleiro;
    } else if (tipo === "profundidade") {
      c.finalizador = sortearPeso(rng, alvos, o => o.w * (o.jog.at[A.vel] + o.jog.at[A.dom])).jog;
      const f = c.finalizador.at;
      c.xg = x.profundidade * Math.pow(mod(media(pivo.at[A.cri], pivo.at[A.pas]), 28, k), 0.5) * mod(media(f[A.vel], f[A.dom]), zag ? media(zag[A.pos], zag[A.vel]) : semZaga, k) * (def.temLibero ? CONFIG.fatorLibero : 1) * b.profundidade; // o zagueiro que saiu para cobrir abre as costas
      c.chute = Math.max(f[A.fin], f[A.dri]) * 0.7 + f[A.dom] * 0.3; c.defesa = gk ? gk[A.um] : semGoleiro;
    } else if (tipo === "area") {
      c.finalizador = (sortearPeso(rng, area, o => o.w * o.jog.at[A.fin] * ehAlvo(o)) || { jog: pivo }).jog;
      const f = c.finalizador.at;
      c.marcacao = mod(media(f[A.dom], f[A.pos]), zag ? media(zag[A.mar], zag[A.pos]) : semZaga, k); // a narração conta quem ganhou o duelo com o zagueiro
      c.xg = x.area * c.marcacao;
      c.chute = f[A.fin]; c.defesa = gk ? gk[A.ref] : semGoleiro;
    } else {
      c.xg = x.longe * mod(pivo.at[A.lon], 25, k) * (forcado ? CONFIG.fatorChuteForcado : 1);
      c.chute = pivo.at[A.lon]; c.defesa = gk ? media(gk[A.ref], gk[A.pos]) : semGoleiro;
    }
    // chute da área e do cruzamento rasteiro: parte sai com o pé ruim; a divisão devolve a média, então só quem tem o pé pior que a liga perde
    const PF = CONFIG.peFraco.chute, pf = c.finalizador.j.pf;
    if ((tipo === "area" || c.rasteiro) && pf != null) {
      const ruim = rng.chance(PF.parte);
      c.xg *= (ruim ? 1 - PF.perda * fraquezaDoPe(pf) : 1) / (1 - PF.parte * PF.perda * CONFIG.peFraco.media);
      if (ruim) c.peRuim = pf; // a narração conta o chute com o pé ruim
    }
    // nem toda chance do mesmo tipo vale o mesmo: umas saem limpas, outras apertadas
    const v = CONFIG.variacaoChance[tipo] || 0;
    if (v) { c.espaco = Math.exp(rng.normal(0, v) - v * v / 2); c.xg *= c.espaco; } // a narração conta a chance limpa ou apertada
    // contra-ataque (R4, regras da T1): menos gente atrás do adversário, chance melhor
    const CC = CONFIG.contraChance;
    if (contra && CC) c.xg *= CC.qualidade * limitar(Math.pow(contra.razao, CC.expoente), CC.min, CC.max);
    // confronto da finalização com a postura de quem defende: retranca congestiona a área e dá espaço fora dela; time aberto deixa a área livre
    const FM = CONFIG.finalizarXmentalidade, m = def.instr.mentalidade;
    if (I.finalizar === "longe" && tipo === "longe") c.xg *= (1 + FM.longe * Math.max(0, -m)) * mod(c.chute, 25, CONFIG.finalizar.longe.qualidade); // time treinado para chutar de fora: o bom chutador rende ainda mais
    if (I.finalizar === "area" && (tipo === "area" || tipo === "profundidade")) c.xg *= m < 0 ? 1 + FM.areaRetranca * m : 1 + FM.areaAberto * m;
    if (I.cruzamento === "alto" && tipo === "cruzamento") c.xg *= 1 + CONFIG.altoXretranca * Math.max(0, -m);
    c.xg = limitar(c.xg, 0.01, CONFIG.xgMaximo);
    return c;
  }

  // nm: função que escreve o nome do jogador marcado com o time ("{0:Fulano}"), para a tela pintar cada um na cor do seu clube
  // chute com o pé ruim (só com a nota do pé fraco): narrado quando faz diferença, o pé fraco ruim (até 6) ou o quase ambidestro (13 ou mais)
  function peRuimNarrado(c) {
    const pf = c.peRuim, pe = c.finalizador.j.pe;
    if (pf == null || pf > 6 && pf < 13) return "";
    const qual = pe === "D" ? "de canhota" : pe === "E" ? "de direita" : c.lado === "D" ? "de direita" : "de canhota";
    return pf <= 6 ? ` ${qual}, o pé ruim` : ` ${qual}, como se fosse o pé bom`;
  }
  // noAlvo: chance de gol do chute que foi no gol (decide defesa fácil, boa ou milagre); falha: chance com a Excentricidade do goleiro ÷ sem ela (o frango)
  // chute na área: conta o que mais pesou na chance, se pesou (o duelo com o zagueiro ou a jogada limpa/apertada); o pé ruim já é narrado à parte
  function porQueDaChance(c, nm) {
    const N = CONFIG.narracaoChance, nada = { antes: "", depois: "" };
    if (c.peRuim != null) return nada;
    const z = c.zagueiro && c.marcacao ? Math.log(c.marcacao) : 0, e = c.espaco ? Math.log(c.espaco) : 0;
    // cada fator medido contra o próprio corte: conta o que passou mais do corte
    const pz = z / Math.log(z < 0 ? N.marcado : N.livraSe), pe = e / Math.log(e < 0 ? N.apertado : N.livre);
    if (Math.max(pz, pe) < 1) return nada;
    if (pz >= pe) return z < 0 ? { antes: "", depois: c.recuperou ? ` com ${nm(c.zagueiro)} já de volta na marcação` : ` com ${nm(c.zagueiro)} em cima` } : { antes: `se livra${c.recuperou ? " de novo" : ""} de ${nm(c.zagueiro)}`, depois: "" };
    return { antes: "", depois: e < 0 ? " sem ângulo" : " livre" };
  }
  // o drible folgado pelos atributos de quem leva a bola (só texto; v, o número do lance, escolhe sem sorteio; null: a frase de sempre)
  function dribleNarrado(at, m, v) {
    const N = CONFIG.gradeValores.narrar, um = l => l[v % l.length];
    if (at[A.dri] >= N.alto && at[A.exc] >= N.alto) return um([`dá uma caneta em ${m}`, `aplica um chapéu em ${m}`, `passa de elástico por ${m}`]);
    if (at[A.dri] >= N.alto) return um([`corta ${m} para dentro`, `tira ${m} da jogada com um toque curto`]);
    return at[A.vel] >= N.alto ? um([`deixa ${m} na corrida`, `arranca e deixa ${m} para trás`]) : null;
  }
  // na grade, a forma do cara a cara pelos atributos de quem finaliza; vale para qualquer desfecho, para a frase não entregar o gol (null: a frase de sempre)
  function formaNoCaraACara(c, nm, goleiro, v) {
    const at = c.finalizador.at, f = nm(c.finalizador), cr = nm(c.criador), gk = goleiro ? nm(goleiro) : "o goleiro";
    // Excentricidade alta: um lance em dois, para não tirar o drible no goleiro de quem também o sabe fazer
    if (at[A.exc] >= CONFIG.gradeValores.narrar.alto + 2 && v % 2) return `${cr} lança em profundidade, ${f} sai na cara do gol e tenta ${v % 4 === 1 ? `a cavadinha sobre ${gk}` : "de letra"}`;
    if (c.goleiroSaiu && at[A.lon] >= at[A.fin]) return `${cr} lança em profundidade, ${gk} sai da área e ${f} tenta encobrir`;
    if (at[A.dri] <= at[A.fin]) return null;
    return v % 2 && at[A.dom] >= at[A.fin] ? `${cr} lança em profundidade, ${f} sai na cara do gol e finge o chute` : `${cr} lança em profundidade, ${f} sai na cara do gol e tenta cortar ${gk}`;
  }
  // v: número do lance, escolhe entre as frases equivalentes (sem sorteio, a mesma partida sai sempre com o mesmo texto)
  function narrar(c, resultado, goleiro, nm, noAlvo = 0.3, falha = 1, v = 0) {
    const um = lista => lista[v % lista.length];
    // a bicicleta (dono, 01/11): só em bola pelo alto (cruzamento, escanteio, falta levantada), rara, de quem tem Excentricidade alta. Só texto
    const alto = CONFIG.grade && c.finalizador.at[A.exc] >= CONFIG.gradeValores.narrar.alto + 2 && v % 5 === 0 ? "tenta de bicicleta" : "cabeceia";
    const f = nm(c.finalizador), cr = nm(c.criador), lado = NOME_LADO[c.lado], q = c.tipo === "area" ? porQueDaChance(c, nm) : { antes: "", depois: "" };
    const cara = CONFIG.grade && c.tipo === "profundidade" ? formaNoCaraACara(c, nm, goleiro, v) : null;
    const inicio = {
      cruzamento: c.antecipado ? `${cr} ${temPapel(c.criador, "apoiador") ? "sobe pela lateral e " : ""}cruza cedo${c.rasteiro ? `, rasteiro, da ${lado}, e ${f} bate de primeira` : ` da ${lado} e ${f} ${alto}`}`
        : `${cr} ${temPapel(c.criador, "apoiador") ? "chega ao fundo e " : ""}${c.rasteiro ? `cruza rasteiro da ${lado} e ${f} bate de primeira` : `cruza da ${lado} e ${f} ${alto}`}`,
      cutback: c.zona && "ED".includes(c.zona[1]) ? `${cr} vai ao fundo pela ${lado} e rola para trás para ${f}, que finaliza` : `${cr} invade a área pela ${lado} e rola para trás para ${f}, que finaliza`,
      corte: `${f} vem da ${lado} em diagonal e chuta`,
      profundidade: cara || (c.goleiroSaiu ? `${cr} lança em profundidade, ${nm(goleiro)} sai da área e não chega, e ${f} fica com o gol quase vazio` : `${cr} lança em profundidade e ${f} sai na cara do gol`),
      area: c.criador === c.finalizador ? `${f} recebe na área${q.antes ? ", " + q.antes : ""} e finaliza${q.depois}` : `${cr} acha ${f} na área, que ${q.antes ? q.antes + " e " : ""}finaliza${q.depois}`,
      longe: `${f} arrisca de fora da área`,
      escanteio: alto !== "cabeceia" ? `${cr} cobra o escanteio e ${f} ${alto}` : um([`${cr} cobra o escanteio e ${f} cabeceia`, `${cr} cobra o escanteio na área e ${f} cabeceia`, `${f} cabeceia o escanteio cobrado por ${cr}`]),
      falta: c.criador === c.finalizador ? `${f} cobra a falta direto no gol` : `${cr} levanta a falta na área e ${f} ${alto}`,
      penalti: `${f} cobra o pênalti`,
      rebote: c.deTrave ? `A bola volta da trave e ${f} pega o rebote` : c.criador === c.finalizador ? `${goleiro ? nm(goleiro) : "A defesa"} solta e o próprio ${f} pega o rebote` : `${goleiro ? nm(goleiro) : "A defesa"} solta a bola e ${f} chega no rebote`,
    }[c.tipo] + peRuimNarrado(c);
    const N = CONFIG.narracaoDefesa, gk = goleiro && nm(goleiro);
    const fim = {
      gol: gk && c.tipo !== "penalti" && falha >= N.frango && noAlvo < N.facil * 2 ? `GOL! Falha de ${gk}, que aceita um chute defensável!` : "GOL!",
      defesa: c.goleiroSaiu ? "a zaga salva em cima da linha." : !gk ? "a defesa fica com a bola." : c.tipo === "penalti" ? `${gk} pega o pênalti!`
        : noAlvo >= N.milagre ? um([`${gk} faz um milagre!`, `${gk} voa e tira de onde não dava! Milagre!`, `inacreditável, ${gk} defende! Que milagre!`])
        : noAlvo >= N.boa ? um([`${gk} faz grande defesa!`, `${gk} se estica todo e espalma! Grande defesa!`, `que defesa de ${gk}!`])
        : noAlvo < N.facil ? um([`${gk} defende sem dificuldade.`, `${gk} encaixa sem problemas.`, `fraco, nas mãos de ${gk}.`, `${gk} fica com a bola tranquilo.`])
        : um([`${gk} defende.`, `${gk} segura firme.`, `${gk} faz a defesa.`, `${gk} espalma.`]),
      fora: "a bola sai pela linha de fundo.",
      trave: "na trave!",
      bloqueado: c.zagueiro && !q.antes ? `${nm(c.zagueiro)} bloqueia.` : "a zaga bloqueia.", // quem se livrou do zagueiro não é bloqueado por ele
    }[resultado];
    // o zagueiro já vencido neste ataque que volta e bloqueia
    if (resultado === "bloqueado" && c.recuperou && !q.antes) return `${inicio.replace(/finaliza$|chuta$|bate de primeira$|cabeceia$|arrisca de fora da área$/, m => "se prepara para " + ({ finaliza: "finalizar", chuta: "chutar", cabeceia: "cabecear", "arrisca de fora da área": "chutar de fora da área" }[m] || "chutar"))}, mas ${nm(c.zagueiro)} volta a tempo e bloqueia o chute.`;
    return `${inicio}: ${fim}`;
  }

  const novaEstatistica = () => ({
    posse: 0, ataques: 0, contraAtaques: 0, corredor: { E: 0, C: 0, D: 0 }, chances: 0, finalizacoes: 0, noGol: 0, xg: 0, gols: 0,
    faltas: 0, amarelos: 0, vermelhos: 0, escanteios: 0, impedimentos: 0, substituicoes: 0,
    zonas: Object.fromEntries(zonasDoMotor().map(z => [z, [0, 0]])), // duelos de ataque vencidos e perdidos por zona
    // na grade: passos [tentados, certos] por tipo, conduções, ataques com 10 passos certos ou mais, passos certos de cada ataque e dos que terminaram em gol
    // toquesArea: passos certos na faixa 5; cutbacks: [tentados, no gol]; cruzamentos: [tentados, certos]
    ...(CONFIG.grade ? { grade: { passos: {}, conducoes: [0, 0], posses10: 0, passosPorAtaque: [], passosNoGol: [], toquesArea: 0, cutbacks: [0, 0], cruzamentos: [0, 0],
      aereos: [0, 0], segundas: [0, 0], longas: [0, 0], sobras: [0, 0], tabelas: [0, 0], terceiros: [0, 0], espaco: [0, 0], entrelinhas: [0, 0], tiros: [0, 0, 0], maos: [0, 0], rebotes: [0, 0], golsContra: 0, olimpicos: 0,
      perdasAtras: 0, perdasAtrasChute: 0, reciclagens: 0, contraInicio: {}, contraPorCorredor: { E: 0, e: 0, C: 0, d: 0, D: 0 } } } : {}),
  });

  // Simula uma partida inteira. O mesmo rng (mesma semente) dá sempre o mesmo jogo.
  // minutos em que a bola volta ao centro: segundo tempo e os dois tempos da prorrogação
  const reinicio = min => min === 46 || min === 91 || min === 106;
  // opcoes.prorrogacao: jogo de mata-mata; empate nos 90 minutos leva a mais 30, jogados como o resto da partida
  // opcoes.calor: calor forte, todos cansam mais rápido. opcoes.chuva: 0, 1 (fraca) ou 2 (forte). opcoes.jogoGrande: a experiência pesa mais no dia de cada jogador
  // opcoes.regrasT1 (padrão true): as regras da T1 (CONFIG.t1 e CONFIG.regrasT1); calcularPartida e as metas da diretoria desligam antes de PAPEIS_DESDE.
  //   Os amistosos (jogo-treino) ficam no padrão: o dono liberou as regras e os papéis da T1 só neles antes da virada (30/10).
  // ponytail: troca o CONFIG global durante a partida e devolve no fim (o motor é síncrono); se um dia rodar partidas em paralelo, passar o CONFIG adiante
  function simularPartida(rng, casa, fora, opcoes = {}) {
    if (opcoes.regrasT1 === false) return jogarPartida(rng, casa, fora, opcoes);
    const antes = {};
    for (const k in CONFIG.t1) { antes[k] = CONFIG[k]; CONFIG[k] = typeof CONFIG[k] === "object" ? { ...CONFIG[k], ...CONFIG.t1[k] } : CONFIG.t1[k]; }
    CONFIG.regrasT1 = true;
    try { return jogarPartida(rng, casa, fora, opcoes); } finally { Object.assign(CONFIG, antes); CONFIG.regrasT1 = false; }
  }
  function jogarPartida(rng, casa, fora, opcoes) {
    const chuva = opcoes.chuva || 0, calor = opcoes.calor ? 1 + CONFIG.calor : 1, grande = !!opcoes.jogoGrande;
    const times = [iniciar(casa, rng, grande), iniciar(fora, rng, grande)], estat = [novaEstatistica(), novaEstatistica()];
    const jogadores = {}, lances = [], eventos = [], lesoes = [];
    const ficha = (jog, i) => jogadores[jog.j.id] || (jogadores[jog.j.id] = { nome: jog.j.nome, pos: jog.pos, time: i, entrou: 0, saiu: null, gols: 0, finalizacoes: 0, xg: 0, duelosGanhos: 0, duelosPerdidos: 0, duelosEsperados: 0, faltas: 0, amarelos: 0, vermelho: false, lesionado: false, energia: 100 });
    times.forEach((t, i) => t.emCampo.forEach(jog => ficha(jog, i)));
    let min = 0, ac = 0, jogados = 0, sujo = true, posseCasa = 0.5, defesas = null, somaPosse = 0; // ac: minuto de acréscimo (45+ac, 90+ac); jogados conta os minutos com os acréscimos
    const gols = () => [estat[0].gols, estat[1].gols];
    let seq = 0; // ordem de acontecimento, para a narração misturar finalizações e os outros lances na sequência certa
    // parcial para a transmissão ao vivo: [posse do mandante em %, faltas do mandante, do visitante, escanteios do mandante, do visitante]
    const parcial = () => [jogados ? Math.round(somaPosse / jogados * 100) : 50, estat[0].faltas, estat[1].faltas, estat[0].escanteios, estat[1].escanteios];
    const nm = jog => `{${jogadores[jog.j.id] ? jogadores[jog.j.id].time : "?"}:${jog.j.nome}}`, tm = i => `{${i}:${times[i].nome}}`;
    // os cartões esperam o lance da falta ser narrado e saem logo depois dele, já dizendo o motivo
    const pendentes = [];
    const soltarCartoes = () => { while (pendentes.length) { const c = pendentes.shift(); eventos.push({ n: seq++, min, ...(ac ? { ac } : {}), time: c.i, tipo: c.tipo, texto: c.texto, p: parcial() }); } };
    const empurrar = (lista, o) => { lista.push(o); soltarCartoes(); };
    let faseDoEvento = null; // as fases da jogada perigosa que acabou sem finalização
    const evento = (i, tipo, texto) => { const f = faseDoEvento; faseDoEvento = null; empurrar(eventos, { n: seq++, min, ...(ac ? { ac } : {}), time: i, tipo, texto, ...(f ? { fases: f } : {}), p: parcial() }); };
    const cartao = (i, tipo, texto) => pendentes.push({ i, tipo, texto });
    // Ataque que termina sem finalização: desarme, passe interceptado, domínio errado ou passe errado, conforme os atributos dos dois.
    const ONDE = { D: () => "na saída de bola", M: l => l === "C" ? "no meio-campo" : `pela ${NOME_LADO[l]} do meio-campo`, A: l => l === "C" ? "na entrada da área" : `no ataque pela ${NOME_LADO[l]}` };
    // zona da grade com a preposição: "n" (na zona 14, no meio-espaço…), "pel" (pela/pelo) ou "para " (para a/para o)
    const naZona = (z, prep = "n") => NA_ZONA[prep + z] || (NA_ZONA[prep + z] = nomeDaZona(z).replace(/^(o|a) /, (_, a) => prep + a + " "));
    const ondeDe = z => ehGrade(z) ? naZona(z) : ONDE[z[0]](z[1]);
    // Todo ataque é narrado passo a passo: os duelos vencidos (saída de bola, meio-campo) ficam na trilha e entram no texto do desfecho.
    // A trilha é uma lista de frases, cada uma com suas orações; "portador" é quem está com a bola, para a narração ligar um
    // jogador ao outro com o passe ("... e toca para Fulano") em vez de a bola mudar de pé sem explicação.
    let atacante = null, ultimoNarrado = null, aposFalta = false, impedido = false; // aposFalta: a jogada recomeça com a cobrança de uma falta // time do ataque em andamento e do último ataque que foi narrado
    const superados = new Map(); // marcadores vencidos neste ataque → peso para voltar ao lance (CONFIG.recuperacao)
    let trilha = [], rota = [], portador = null, ultimoAtaque = null, saida = null, cadeia = null, bola = null, proximo = null, rodou = false, emContra = false, cobranca = null, ultimaPerda = { causa: null, marcador: null }, perdaAtras = null, aposPerda = null, repor = null; // repor (grade): o goleiro recomeça o próximo ataque do time, { time, tipo: "meta" ou "maos" }; bola: quem a recuperou e em que linha do seu ataque; proximo: ataque seguinte já decidido
    const RODA = [
      (j, t, onde) => `${j} não acha espaço ${onde}, recua e o ${t} roda a bola.`,
      (j, t, onde) => `Marcação fechada ${onde}: ${j} volta o jogo e o ${t} troca passes atrás.`,
      (j, t, onde) => `${j} prefere não arriscar ${onde} e recomeça a jogada por trás.`,
      (j, t, onde) => `Sem opção ${onde}, ${j} toca para trás e o ${t} vira o jogo.`,
    ]; // saida: time que dá a saída depois de sofrer um gol
    const IMPEDIDO = [
      (p, a) => `${p} tenta o passe, mas ${a} está em impedimento.`,
      (p, a) => `${p} enfia a bola para ${a}, mas o bandeirinha levanta a bandeira: impedimento.`,
      (p, a) => `${a} se adianta antes do passe de ${p} e fica impedido.`,
      (p, a) => `${p} procura ${a} nas costas da zaga, mas ele estava à frente da linha: impedimento.`,
    ];
    // quando o mesmo time ataca duas vezes seguidas é porque retomou a bola logo depois de perdê-la
    const RETOMA = [n => `${n} recupera a bola`, n => `${n} retoma a posse`, n => `A bola volta para o ${n}`, n => `${n} rouba a bola de novo`];
    const frase = o => o.length > 1 ? o.slice(0, -1).join(", ") + " e " + o[o.length - 1] : o[0];
    // Na grade, o texto conta no máximo narrar.passos passos (passosChance no ataque que termina em finalização): os que quebraram linha e o último;
    // na finalização e na jogada perigosa, também os passos para a frente. As voltas e os toques de lado deixados de fora viram "roda a bola atrás" quando são 3 ou mais;
    // se o passo deixado de fora levou a bola a outro, a narração conta para quem ela foi, para ninguém jogar sem ter recebido. Todos continuam na rota.
    const atras = f => f.passo.tipo === "voltar" || f.passo.tipo === "lado";
    // reciclar (grade): quem roubou não vê espaço para o contra-ataque (q: quem roubou, ou null; t: o time)
    const RECICLA = [(q, t) => `${q || t} olha para a frente, não vê espaço para o contra-ataque e segura a bola.`, (q, t) => `${t} recupera, mas prefere não arriscar o contra-ataque: troca passes para reorganizar.`,
      (q, t) => `Sem espaço para sair rápido, ${q ? q + " toca para trás" : t + " recomeça com calma"}.`];
    const RODA_ATRAS = [t => `O ${t} roda a bola atrás`, t => `O ${t} troca passes com calma`, t => `O ${t} toca de pé em pé`, t => `O ${t} circula a bola`];
    function enxuta(t, chance) {
      const ps = t.filter(f => f.passo);
      if (!ps.length) return t;
      const N = CONFIG.gradeValores.narrar, ultimo = ps[ps.length - 1];
      const fica = new Set([...ps.filter(f => f !== ultimo && (f.passo.quebra || (chance && !atras(f)))).slice(1 - (chance ? N.passosChance : N.passos)), ultimo]);
      let roda = ps.filter(f => !fica.has(f) && atras(f)).length >= 3, comBola = null;
      const viu = new Set();
      return t.flatMap(f => {
        // a frase sem passo que diz de quem é a bola (o cruzamento afastado): o passo que devolveu a ele pode ter sido cortado
        if (!f.passo) { const l = f.de && comBola && comBola !== f.de ? [[`A bola ${viu.has(f.de) ? "volta para" : "chega a"} ${f.de}`]] : []; if (f.de) comBola = null; return [...l, f]; }
        if (!fica.has(f)) { if (!roda || !atras(f)) return []; roda = false; comBola = null; return [[RODA_ATRAS[seq % RODA_ATRAS.length](tm(atacante))]]; }
        const { de, para } = f.passo, liga = comBola && de && comBola !== de ? [[`A bola ${viu.has(de) ? "volta para" : "chega a"} ${de}`]] : [];
        if (de) viu.add(de); if (para) viu.add(para);
        comBola = para || null;
        return [...liga, f];
      });
    }
    // na grade, por partida (os valores não mudam no meio do jogo): o xT de cada zona e a dificuldade de cada opção de cada zona
    const XT = CONFIG.grade ? ZONAS_GRADE.map(z => valorDaZona(z, CONFIG.gradeValores)) : null, DIFICULDADES = {};
    const difDe = z => DIFICULDADES[z] || (DIFICULDADES[z] = opcoesDoPasso(z).map(o => dificuldade(o.tipo, z, o.para, CONFIG.gradeValores)));
    // reciclar (spec 10): a melhor chance de quem roubou (time j, na zona z) ganhar um passo para a frente contra a defesa pega na transição; na faixa 5, todo
    const espacoNoContra = (j, z) => {
      if (faixaDe(z) === 5) return 1;
      const G = CONFIG.gradeValores, V = defesas[j].vetor, trans = naTransicao(j, true), at = times[j].atk, Zv = CONFIG.zonaVazia, dif = difDe(z), col = colunaDe(z);
      let melhor = 0;
      for (const o of opcoesDoPasso(z)) if (faixaDe(o.para) > faixaDe(z)) {
        const dz = trans ? V.T[o.i] : V.col[col][o.i];
        melhor = Math.max(melhor, 1 / (1 + Math.exp(-(G.baseDuelo[linhaDaZona(o.para)] + dif[o.k] + CONFIG.inclinacaoDuelo * Math.log((at[o.para] + Zv) / (dz + Zv))))));
      }
      return melhor;
    };
    // na grade, a bola é do goleiro: o próximo ataque é do time dele e começa por ele (tiro de meta ou a bola nas mãos)
    const reposicao = (time, tipo) => { proximo = { time, zona: "D" }; repor = { time, tipo }; };
    let fases = null; // na grade, as frases do último texto narrado, na ordem, com o desfecho por último (o ao vivo solta uma por vez)
    const comTrilha = (texto, chance = false) => { const fimDaRota = rota[rota.length - 1], perigo = !!CONFIG.grade && !chance && !!fimDaRota && typeof fimDaRota[1] === "string" && ehGrade(fimDaRota[1]) && faixaDe(fimDaRota[1]) === 5; const fr = (CONFIG.grade ? enxuta(trilha, chance || perigo) : trilha).map(frase); fases = CONFIG.grade ? [...fr, texto] : null; faseDoEvento = perigo && fr.length >= 2 ? fases : null; const t = fr.length ? fr.join(". ") + ". " + texto : texto; trilha = []; rota = []; portador = null; superados.clear(); ultimoNarrado = atacante; return t; };
    // rota do lance para a animação: [zona, quem leva a bola, marcador vencido] por passo; vai junto da finalização
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
    // duelo vencido com folga de sobra (bem acima do teto do embalo, para não virar bordão): a narração diz que foi fácil
    const comFolga = d => (d.folga || 0) >= CONFIG.embalo.narrar;
    function passo(i, zona, d) {
      const p = d.pivo, m = d.marcador, lado = zona[1], facil = comFolga(d), deNovo = d.recuperou ? " de novo" : "";
      if (!p) { portador = null; rota.push([zona]); trilha.push([`${tm(i)} ${zona[0] === "D" ? "sai jogando" : "avança"} ${PELO[lado]}`]); return; }
      const depoisDeFalta = aposFalta, mesmo = recebe(p), nome = nm(p);
      // falta fora da zona de ataque: o time fica com a bola e recomeça dali, cobrando a falta (não é lei da vantagem)
      if (d.falta && m) { evento(i, "falta", comTrilha(`Falta de ${nm(m)} em ${nome} ${ondeDe(zona)}.`)); rota.push([zona, p.j.id]); portador = p; aposFalta = true; return; }
      rota.push(m ? [zona, p.j.id, m.j.id] : [zona, p.j.id]);
      if (m && d.venceu) superados.set(m, facil ? CONFIG.recuperacao.facil : CONFIG.recuperacao.normal);
      if (zona[0] === "D") trilha.push(times[i].instr.passe === "longo" ? [`${nome} domina no campo de defesa ${PELO[lado]}`, "prepara o lançamento"] : [`${nome} sai jogando ${PELO[lado]}`, ...(m ? [facil ? `passa fácil por ${nm(m)}${deNovo}` : `passa por ${nm(m)}${deNovo}`] : facil ? ["sem ser incomodado"] : [])]);
      else trilha.push([`${mesmo ? (depoisDeFalta ? nome + " cobra a falta rápido e segue" : trilha.length ? "Segue" : nome + " segue") : lado === "C" && temPapel(p, "invertido") ? nome + " sai da lateral e fecha por dentro," : nome + " carrega"} ${lado === "C" ? "pelo centro do meio-campo" : `pela ${NOME_LADO[lado]} do meio-campo`}`, ...(m ? [facil ? `deixa ${nm(m)} para trás${deNovo} com facilidade` : `supera ${nm(m)}${deNovo}`] : facil ? ["com todo o espaço do mundo"] : [])]);
    }
    function perdaDePosse(i, zona, d) {
      impedido = false;
      // quem ganha a bola começa o ataque seguinte dali: roubada na saída de bola do adversário, já no ataque; no meio, no meio
      // na grade, a linha antiga da faixa; o ataque comum seguinte começa por ela como antes (só o contra nasce na zona da roubada, spec 10)
      const linha = linhaDaZona(zona);
      bola = { time: 1 - i, zona: linha === "D" ? "A" : linha === "M" ? "M" : "D" };
      ultimaPerda = { causa: null, marcador: d.marcador || null };
      const onde = ondeDe(zona);
      // Do meio para a frente, o time de mais posse nem sempre perde a bola quando não acha espaço: recua, roda o jogo e tenta de novo
      // pelo meio-campo. A chance é a mesma com que ele retomaria a bola na cadeia de posse, então a fatia de ataques de cada time não muda.
      if (!emContra && linha !== "D" && d.pivo) {
        const p = i === 0 ? posseCasa : 1 - posseCasa;
        if (p > 0.5 && !rng.chance((1 - p) / p)) {
          recebe(d.pivo);
          evento(i, "roda", comTrilha(RODA[seq % RODA.length](nm(d.pivo), tm(i), onde)));
          proximo = { time: i, zona: "M" }; rodou = true; bola = null;
          return false;
        }
        proximo = { time: 1 - i, zona: bola.zona };
      }
      if (estat[i].grade && faixaDe(zona) <= 2) { estat[i].grade.perdasAtras++; perdaAtras = 1 - i; } // vira chute do adversário? (finalizar)
      if (!d.pivo) { if (trilha.length) evento(1 - i, "posse", comTrilha(`${tm(1 - i)} recupera a bola ${onde}.`)); return true; }
      // na grade, o passe perdido tem dois: quem recebe (p: domina mal, é desarmado) e quem passa (q: erra, tem o passe cortado, acha o impedido)
      const p = d.pivo, m = d.marcador, q = d.passador || p;
      if (linha === "A") { // o passe para quem estava adiantado: impedimento, falta indireta para a defesa (a bola vai para ela como em qualquer perda)
        const K = CONFIG.impedimento.naPerda, I = times[i].instr, alvo = sortearPeso(rng, naArea(times[i]).filter(o => o.jog !== p), o => o.w);
        if (alvo && rng.chance(K.base * (times[1 - i].instr.impedimento ? K.linha : 1) * (I.passe === "longo" ? K.longo : I.passe === "curto" ? K.curto : 1))) {
          estat[i].impedimentos++; impedido = true; recebe(q); evento(i, "impedimento", comTrilha(IMPEDIDO[seq % IMPEDIDO.length](nm(q), nm(q !== p ? p : alvo.jog)))); return true;
        }
      }
      const molhado = 1 + CONFIG.chuva.erros * chuva, causas = [["dominio", (60 - p.at[A.dom]) * molhado], ["passe", (60 - q.at[A.pas]) * molhado]];
      if (m) causas.push(["desarme", 20 + m.at[A.des]], ["corte", 20 + m.at[A.pos]]);
      // os sorteios seguem a ordem antiga (quando só parte das perdas era narrada), para a mesma semente continuar dando o mesmo jogo
      const causa = ultimaPerda.causa = rng.chance(CONFIG.narrarPerda[linha]) ? sortearPeso(rng, causas, c => c[1])[0] : causas[seq % causas.length][0];
      const volta = d.recuperou ? " volta a tempo e" : ""; // o marcador já vencido neste ataque que volta ao lance
      recebe(causa === "passe" || causa === "corte" ? q : p);
      if (causa === "desarme") evento(1 - i, "posse", comTrilha(`${nm(m)}${volta} desarma ${nm(p)} ${onde}.`));
      else if (causa === "corte") evento(1 - i, "posse", comTrilha(`${nm(m)}${volta} intercepta o passe de ${nm(q)} ${onde}.`));
      else if (causa === "dominio") evento(i, "posse", comTrilha(`${nm(p)} domina mal ${onde} e perde a posse.`));
      else evento(i, "posse", comTrilha(`${nm(q)} erra o passe ${onde}.`));
      return true;
    }
    // esperado: chance que o jogador tinha de vencer o duelo; a nota compara o que ele venceu com o que era esperado
    const registrar = (jog, venceu, esperado) => { const s = jogadores[jog.j.id]; if (s) { s[venceu ? "duelosGanhos" : "duelosPerdidos"]++; s.duelosEsperados += esperado; } };

    function sair(i, jog) {
      const t = times[i];
      t.emCampo = t.emCampo.filter(x => x !== jog);
      const s = jogadores[jog.j.id]; s.saiu = min; s.energia = Math.round(jog.energia); if (jog.mancha) s.mancha = jog.mancha;
      sujo = true;
    }
    // papel: o de quem saiu (novoJog o descarta se não valer na posição de quem entra)
    function entrar(i, j, pos, papel = null) {
      const t = times[i], jog = novoJog(j, pos, rng, grande, papel);
      t.banco = t.banco.filter(x => x !== j); t.emCampo.push(jog); t.subs++; estat[i].substituicoes++;
      ficha(jog, i).entrou = min; sujo = true;
      return jog;
    }
    function condicao(i, cond, jog) {
      const g = gols(), saldo = g[i] - g[1 - i];
      if (cond === "ganhando") return saldo > 0;
      if (cond === "empatando") return saldo === 0;
      if (cond === "perdendo") return saldo < 0;
      if (cond === "umAMenos") return estat[i].vermelhos > estat[1 - i].vermelhos; // pelas expulsões: lesão sem troca não conta
      if (cond === "umAMais") return estat[i].vermelhos < estat[1 - i].vermelhos;
      if (cond === "cansado") return !!jog && jog.energia < CONFIG.limiarCansado;
      if (cond === "amarelo") return !!jog && jog.amarelos > 0;
      if (cond === "mal" || cond === "naoBem") { // como o jogador que sai está indo na partida (goleiro não entra nessa conta: fica sempre no meio-termo)
        const f = jog && jogadores[jog.j.id], d = f && jog.pos !== "GK" ? f.duelosGanhos - f.duelosEsperados + 2 * f.gols : 0;
        return cond === "mal" ? d <= CONFIG.desempenhoRuim : d < CONFIG.desempenhoBom;
      }
      return true;
    }
    function ordensESubstituicoes(i) {
      const t = times[i];
      t.instr.ordens.forEach((o, k) => {
        if (t.ordensFeitas.has(k) || min < (o.min || 0) || !condicao(i, o.cond)) return;
        t.ordensFeitas.add(k); t.cumpridas["o" + k] = { aos: min }; Object.assign(t.instr, o.muda); sujo = true;
        evento(i, "ordem", `${tm(i)} muda a forma de jogar.`);
      });
      t.instr.substituicoes.forEach((s, k) => {
        if (t.subsFeitas.has(k) || min < (s.min || 0) || t.subs >= CONFIG.maxSubstituicoes) return;
        const sai = t.emCampo.find(x => x.j.id === s.sai), entra = t.banco.find(x => x.id === s.entra);
        if (!sai || !entra) { if (!sai && min >= (s.min || 0)) { t.subsFeitas.add(k); t.cumpridas["s" + k] = { motivo: "ele já não estava em campo" }; } return; }
        if (!condicao(i, s.cond, sai)) return;
        t.subsFeitas.add(k); t.cumpridas["s" + k] = { aos: min }; sair(i, sai); entrar(i, entra, s.pos || sai.pos, sai.papel);
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
      entrar(i, entra, jog.pos, jog.papel);
      evento(i, "substituicao", `Entra {${i}:${entra.nome}} no lugar de ${nm(jog)}.`);
    }
    function falta(i, marcador, vitima) { // i: time que cometeu
      const t = times[i], s = jogadores[marcador.j.id], em = vitima ? ` em ${nm(vitima)}` : "";
      estat[i].faltas++; s.faltas++;
      if (rng.chance(CONFIG.vermelhoDireto)) return expulsar(i, marcador, `Cartão vermelho direto para ${nm(marcador)} pela entrada violenta${em}!`);
      const repeticao = CONFIG.amareloPrimeiraFalta + CONFIG.amareloPorFaltaAntes * (s.faltas - 1), segura = marcador.amarelos ? CONFIG.cuidadoComAmarelo * (min <= 45 ? CONFIG.segundoAmareloPrimeiroTempo : 1) : 1;
      if (!rng.chance(CONFIG.amarelo * (1 + CONFIG.amareloPorAgressividade * t.instr.agressividade) * repeticao * segura)) return;
      marcador.amarelos++; s.amarelos++; estat[i].amarelos++;
      if (marcador.amarelos >= 2) return expulsar(i, marcador, `Segundo amarelo para ${nm(marcador)}: está expulso!`);
      cartao(i, "amarelo", `Cartão amarelo para ${nm(marcador)}.`);
    }
    function expulsar(i, jog, texto) {
      estat[i].vermelhos++; jogadores[jog.j.id].vermelho = true;
      sair(i, jog); cartao(i, "vermelho", texto);
    }

    // confronto tático: passe contra pressão (só no ataque construído), custo de jogar no contra-ataque e lado ensaiado (na grade, pela linha e pelo lado antigos)
    function tatico(i, zona, contra) {
      const atk = times[i], def = times[1 - i], L = linhaDaZona(zona), lado = ladoDaZona(zona);
      const pref = atk.instr.lado, ensaiado = pref === lado || (pref === "lados" && lado !== "C");
      return (contra ? 0 : chuva * CONFIG.chuva[atk.instr.passe] + CONFIG.passeXpressao[atk.instr.passe][def.instr.pressao][L] + (atk.instr.passe === "curto" && L === "A" ? CONFIG.curtoXretranca * Math.min(0, def.instr.mentalidade) : 0) +(atk.instr.contraAtaque && L === "M" ? CONFIG.contraAtaque.construcao : 0))
        + (ensaiado && L !== "D" ? CONFIG.ensaio : 0);
    }
    // no contra-ataque, a defesa pega fora do lugar (transição), a não ser que o adversário recomponha
    const naTransicao = (i, contra) => contra && !(CONFIG.regrasT1 && times[1 - i].instr.aoPerder === "recompor");
    // Duelo de zona: força de ataque de um time contra a força de defesa do outro na zona espelhada.
    // g (só na grade): { dz: a defesa que o passo enfrenta, quem: o jogador que conduz a bola ou que chega no passe no espaço, az: o ataque dele ali }
    function duelo(i, zona, logit = 0, contra = false, g = null) {
      const atk = times[i], def = times[1 - i], e = estat[i], L = linhaDaZona(zona);
      const a = (g && g.az != null ? g.az : atk.atk[zona]) + CONFIG.zonaVazia, d = (g ? g.dz : (naTransicao(i, contra) ? defesas[i].T : defesas[i][zona[1]])[zona]) + CONFIG.zonaVazia;
      const tat = tatico(i, zona, contra);
      // quem disputa a jogada, um de cada lado, e o confronto de pés entre os dois (regra do FMP): mesmo pé dominante favorece quem ataca,
      // e o ambidestro leva vantagem maior sobre quem só tem um pé; pés opostos, ou dois ambidestros, não mudam nada.
      // A compensação tira de todo duelo o ganho médio, para a regra não aumentar os gols da liga. Sem pé definido, nada acontece.
      const pivo = g && g.quem ? g.quem : (sortearPeso(rng, atk.zonas[zona], x => x.p) || {}).jog, marcador = (sortearPeso(rng, def.zonasDef[espelho(zona)], x => x.w * (superados.has(x.jog) ? superados.get(x.jog) : 1)) || {}).jog, recuperou = !!marcador && superados.has(marcador);
      const pa = pivo && pivo.j.pe, pd = marcador && marcador.j.pe;
      const PF = CONFIG.peFraco, pf = pivo && pivo.j.pf;
      const pes = !pa || !pd ? 0 : (pa === "A" ? (pd === "A" ? 0 : CONFIG.pe.ambidestro * (pf == null ? 1 : (pf - 12) / PF.ambidestro)) : pa === pd ? CONFIG.pe.mesmo : 0) - CONFIG.pe.compensacao;
      // pé fraco de quem tem a bola: no ataque, o marcador o força para o pé ruim; atrás e no meio, a pressão pega quem só sai jogando com um pé
      const fraco = pf == null ? 0 : (PF.media - fraquezaDoPe(pf)) * (L === "A" ? PF.tempo * (marcador ? marcador.at[A.mar] / 25 : 1) : PF.pressao * def.instr.pressao);
      // folga: a vantagem de quem ataca acima do normal da zona (negativa quando a vantagem é da defesa); o embalo que veio do duelo anterior não conta
      const folga = tat + fraco + CONFIG.inclinacaoDuelo * Math.log(a * (1 + pes) / d);
      const p = 1 / (1 + Math.exp(-((g ? CONFIG.gradeValores.baseDuelo : CONFIG.baseDuelo)[L] + logit + folga)));
      const contato = g ? CONFIG.gradeValores.contato : 1; // na grade há mais passos que duelos nas 9 zonas
      let venceu = rng.chance(p), parada = false, comFalta = false, recomeca = false;
      if (marcador && rng.chance(CONFIG.falta * (1 + CONFIG.faltaPorAgressividade * def.instr.agressividade) * Math.sqrt(marcador.j.at[A.agr] / 25) * (CONFIG.faltaPorPosicao[marcador.pos] || 1) * (marcador.amarelos ? CONFIG.faltaComAmarelo : 1) * contato)) {
        falta(1 - i, marcador, pivo); comFalta = true;
        // falta no ataque (na grade, na faixa 5 ou na zona 14) vira bola parada; atrás, quem ganhava segue, e quem perdia fica com a bola e recomeça do mesmo setor (sem faltaRecomeca, a falta dava o duelo)
        if (g ? faixaDe(zona) === 5 || zona === "4C" : L === "A") parada = true; else if (!venceu && CONFIG.faltaRecomeca) recomeca = true; else venceu = true;
      } else {
        e.zonas[zona][venceu ? 0 : 1]++;
        if (pivo) registrar(pivo, venceu, p);
        if (marcador) registrar(marcador, !venceu, 1 - p);
      }
      if (pivo && rng.chance(CONFIG.lesao * (1 + 0.2 * def.instr.agressividade) * (1 - (times[i].prevencao || 0)) * contato)) {
        const r = rng.n(), dias = r < 0.5 ? rng.int(1, 3) : r < 0.8 ? rng.int(4, 10) : rng.int(11, 30);
        jogadores[pivo.j.id].lesionado = true; lesoes.push({ id: pivo.j.id, time: i, dias });
        sair(i, pivo); recebe(pivo); evento(i, "lesao", comTrilha(comFalta ? `Falta de ${nm(marcador)} em ${nm(pivo)}, que se machuca e não continua.` : `${nm(pivo)} se machuca e não continua.`)); reporLesionado(i, pivo);
        // o time de quem se machucou fica com a bola: bola parada se foi falta no ataque; senão recomeça dali (falta, ou bola ao chão para quem a tinha, Regra 8)
        return { venceu: false, pivo: null, marcador, parada, falta: comFalta, recomeca: !parada };
      }
      return { venceu, pivo, marcador, parada, falta: comFalta, folga, recomeca, recuperou };
    }

    // desfecho do chute contra o goleiro: bloqueado, fora, trave, defesa ou gol; xg é o publicado e chanceDeGol(defesa) a chance contra outro goleiro
    function chutar(c, goleiro) {
      const ruido = goleiro ? rng.normal(0, goleiro.j.at[A.exc] * CONFIG.excentricidade) : 0;
      const F = CONFIG.finalizacao, R = CONFIG.goleiroReferencia, m = c.tipo === "penalti" ? F.penalti : 1, S = CONFIG.semGol[c.tipo] || CONFIG.semGol.area;
      const pe = mod(c.chute + CONFIG.vantagemFinalizador, R, F.chute * m); // quem chuta: decide se vai no gol
      const chanceDeGol = defesa => limitar(c.xg * (CONFIG.ajusteGol[c.tipo] || 1) * pe * mod(R, defesa, F.goleiro * m), 0.005, 0.92);
      const xg = chanceDeGol(c.defesa), pGol = chanceDeGol(c.defesa + ruido); // xG publicado = a chance já com o duelo de quem chuta contra o goleiro (sem a sorte da excentricidade)
      const alvo = Math.max(limitar(S.alvo * pe + CONFIG.semGol.alvoPorGol * pGol, 0.1, 0.95), pGol / (1 - S.bloqueado)); // gol = (1 - bloqueado) x alvo x (gol no alvo), igual a pGol
      const resultado = rng.chance(S.bloqueado) ? "bloqueado" : !rng.chance(alvo) ? (rng.chance(CONFIG.semGol.trave) ? "trave" : "fora")
        : rng.chance(pGol / ((1 - S.bloqueado) * alvo)) ? "gol" : "defesa";
      // para a narração: a chance de gol do chute que foi no gol (difícil ou fácil para o goleiro) e quanto a Excentricidade o piorou no lance
      return { resultado, xg, chanceDeGol, noAlvo: pGol / ((1 - S.bloqueado) * alvo), falha: xg > 0 ? pGol / xg : 1 };
    }

    // a bola nas costas pega o impedimento: a armadilha (passe longo, comunicação da defesa, líbero; menos no contra-ataque) ou o acaso sem linha
    function chanceDeImpedimento(atk, def, contra) {
      const K = CONFIG.impedimento;
      return def.instr.impedimento ? limitar((K.porPasse[atk.instr.passe] + (def.comDefesa - 25) * K.porComunicacao + (def.temLibero ? K.libero : 0)) * (contra ? K.noContraAtaque : 1), 0.05, 0.65) : K.semLinha;
    }

    // gol sem chute (grade): o gol contra (quem: o defensor, não entra na artilharia) e o olímpico (quem: o cobrador)
    function golSemChute(i, quem, tipo, texto) {
      const e = estat[i], s = jogadores[quem.j.id], gc = tipo === "golcontra", gk = times[1 - i].goleiro;
      e.gols++; sujo = true; saida = 1 - i;
      if (gc) { s.golsContra = (s.golsContra || 0) + 1; e.grade.golsContra++; } else { s.gols++; s.finalizacoes++; e.finalizacoes++; e.chances++; e.noGol++; e.grade.olimpicos++; }
      empurrar(lances, { n: seq++, min, ...(ac ? { ac } : {}), time: i, tipo, lado: "C", xg: 0, resultado: "gol", finalizador: quem.j.id, criador: quem.j.id, quem: quem.j.nome + (gc ? " (contra)" : ""), assist: null, goleiro: gk ? gk.j.id : null, rota: rota.length ? rota : undefined, texto: comTrilha(texto, true), ...(fases ? { fases } : {}), p: parcial() });
    }
    // o goleiro solta ou a trave devolve (grade): um chute só de perto, com a defesa desarrumada; quem chutou ou quem está na área
    function rebote(i, c, deTrave) {
      const atk = times[i], gk = times[1 - i].goleiro, R = CONFIG.gradeValores.rebote, ali = naArea(atk).filter(x => atk.emCampo.includes(x.jog) && x.jog !== c.finalizador);
      const volta = atk.emCampo.includes(c.finalizador) && (!ali.length || rng.chance(R.proprio)), quem = volta ? c.finalizador : (sortearPeso(rng, ali, x => x.w * x.jog.at[A.mov]) || {}).jog;
      if (!quem) return false;
      estat[i].grade.rebotes[0]++;
      finalizar(i, { tipo: "rebote", rebote: true, deTrave, lado: "C", zona: "5C", criador: c.finalizador, finalizador: quem, zagueiro: null, xg: R.xg, contra: c.contra, chute: media(quem.at[A.fin], quem.at[A.dom]), defesa: gk ? media(gk.at[A.ref], gk.at[A.pos]) : 5 });
      return true;
    }

    function finalizar(i, c) {
      const atk = times[i], def = times[1 - i], e = estat[i];
      if (c.tipo === "profundidade") {
        const K = CONFIG.impedimento;
        // na grade, a armadilha rende menos (e a bola nas costas mais) quando o time não pressiona quem passa (spec 9.3)
        const GI = CONFIG.grade && def.instr.impedimento ? CONFIG.gradeValores.impedimento : null, fp = GI ? GI.base + GI.pressao * def.instr.pressao : 1;
        const p = chanceDeImpedimento(atk, def, c.contra) * fp;
        if (rng.chance(p)) { e.impedimentos++; recebe(c.criador); evento(i, "impedimento", comTrilha(`${nm(c.criador)} lança e ${nm(c.finalizador)} é pego em impedimento.`)); return; }
        if (def.instr.impedimento) c.xg = limitar(c.xg * (c.contra ? K.furouNoContraAtaque : K.furou) * def.linhaAlta / fp, 0.01, 0.6);
        // saída do goleiro (G2, regras da T1): corta o lançamento pela leitura contra a Velocidade de quem corre; se não chega, o gol fica quase vazio
        const G = CONFIG.saidaGoleiro, gk = def.goleiro, f = c.finalizador;
        if (G && gk && rng.chance(G.tentativa * (def.instr.impedimento ? G.linhaAlta : 1))) {
          estat[1 - i].saidasGoleiro = (estat[1 - i].saidasGoleiro || 0) + 1;
          if (rng.chance(1 / (1 + Math.exp(-(G.base + G.inclinacao * ((CONFIG.grade ? media(gk.at[A.um], gk.at[A.vel], gk.at[A.pos], gk.at[A.dec]) : media(gk.at[A.um], gk.at[A.vel], gk.at[A.pos])) - f.at[A.vel]) / 50))))) {
            recebe(c.criador); evento(1 - i, "posse", comTrilha(`${nm(c.criador)} lança ${nm(f)} nas costas da zaga, mas ${nm(gk)} sai da área e corta.`)); if (CONFIG.grade) reposicao(1 - i, "maos"); return;
          }
          c.goleiroSaiu = true; c.defesa = G.vazio;
        }
      }
      const { resultado, xg, chanceDeGol, noAlvo, falha } = chutar(c, def.goleiro);
      e.chances++; e.xg += xg; e.finalizacoes++;
      if (e.grade) { // transição (spec 10): o chute que nasce de perda do adversário nas faixas 1–2; o corredor do chute de contra-ataque
        if (aposPerda === i) { estat[1 - i].grade.perdasAtrasChute++; aposPerda = null; }
        if (c.contra && c.zona) e.grade.contraPorCorredor[c.zona[1]]++;
      }
      if (resultado === "gol" || resultado === "defesa") e.noGol++;
      if (resultado === "gol") { e.gols++; sujo = true; saida = 1 - i; if (c.rebote) e.grade.rebotes[1]++; }
      const sf = jogadores[c.finalizador.j.id];
      sf.finalizacoes++; sf.xg += xg; if (resultado === "gol") sf.gols++;
      if (c.tipo === "cutback" && e.grade) { e.grade.cutbacks[0]++; if (resultado === "gol" || resultado === "defesa") e.grade.cutbacks[1]++; }
      if (c.tipo === "escanteio" || c.tipo === "falta" || c.tipo === "penalti") portador = null; else recebe(c.criador);
      empurrar(lances, { n: seq++, min, ...(ac ? { ac } : {}), time: i, tipo: c.tipo, lado: c.lado, ...(c.zona ? { zona: c.zona } : {}), xg, xgGk: def.goleiro && (resultado === "gol" || resultado === "defesa") ? chanceDeGol(CONFIG.goleiroReferencia) : undefined, resultado, ...(c.contra ? { contra: c.contra.origem } : {}), finalizador: c.finalizador.j.id, criador: c.criador.j.id, quem: c.finalizador.j.nome, assist: c.criador !== c.finalizador ? c.criador.j.nome : null, goleiro: def.goleiro ? def.goleiro.j.id : null, rota: rota.length ? rota : undefined, texto: comTrilha(narrar(c, resultado, def.goleiro, nm, noAlvo, falha, seq), true), ...(fases ? { fases } : {}), p: parcial() });
      if ((resultado === "defesa" || resultado === "bloqueado") && c.tipo !== "penalti" && rng.chance(CONFIG.escanteio[resultado])) { evento(i, "canto", `Escanteio para o ${tm(i)}.`); bolaParada(i, "escanteio", "C"); }
      else if (CONFIG.grade) {
        const RB = CONFIG.gradeValores.rebote, gk = def.goleiro; // o rebote de um rebote fica de fora: a chance do rebote é de um lance só
        const solta = !c.rebote && (resultado === "trave" ? RB.trave : resultado === "defesa" && gk && !c.goleiroSaiu ? RB.defesa * RB.referencia / Math.max(5, gk.at[A.enc]) * (c.tipo === "longe" ? RB.longe : 1) : 0);
        if (solta && rng.chance(solta) && rebote(i, c, resultado === "trave")) return;
        if (gk && (resultado === "fora" || resultado === "defesa")) reposicao(1 - i, resultado === "fora" ? "meta" : "maos"); // o bloqueado e a trave seguem em jogo
      }
    }

    function cobrador(t, tipo, nota) {
      for (const id of t.instr.cobradores[tipo] || []) { const jog = t.emCampo.find(x => x.j.id === id); if (jog) return jog; }
      const linha = t.emCampo.filter(x => x.pos !== "GK");
      return linha.length ? linha.reduce((m, x) => nota(x.at) > nota(m.at) ? x : m) : null;
    }
    // Bola levantada na área em escanteio ou falta: os melhores no jogo aéreo sobem, zagueiros inclusive.
    function bolaAlcada(i, tipo, quem) {
      const atk = times[i], def = times[1 - i], k = CONFIG.inclinacaoXg;
      // contra-ataque do escanteio (R5, regras da T1): quem joga no contra-ataque deixa o mais adiantado lá na frente
      const R5 = CONFIG.escanteioContra, frente = R5 && tipo === "escanteio" && def.instr.contraAtaque && def.naFrente && def.emCampo.includes(def.naFrente) ? def.naFrente : null;
      if (!rng.chance(CONFIG.cabecadaEscanteio)) {
        if (CONFIG.grade && tipo === "escanteio") { // a zaga desvia para o próprio gol (bola no meio de todo mundo)
          const GC = CONFIG.gradeValores.golContra, zg = sortearPeso(rng, def.emCampo.filter(x => x.pos !== "GK"), x => x.at[A.cab] + x.at[A.mar]);
          if (zg && rng.chance(GC.escanteio * GC.referencia / Math.max(5, zg.at[A.pos]))) return golSemChute(i, zg, "golcontra", `${nm(quem)} cobra o escanteio e ${nm(zg)} desvia contra o próprio gol: GOL contra!`);
        }
        portador = null; evento(i, "posse", comTrilha(`${nm(quem)} ${tipo === "escanteio" ? "cobra o escanteio" : "levanta a falta na área"} e a zaga afasta.`));
        if (frente && rng.chance(R5.chance)) sairNoContra(1 - i, { origem: "E", razao: R5.razao }, `A bola sobra para ${nm(frente)}, que tinha ficado lá na frente, e o ${tm(1 - i)} sai em contra-ataque.`);
        return;
      }
      const sobem = atk.emCampo.filter(x => x.pos !== "GK" && x !== quem), marcam = def.emCampo.filter(x => x.pos !== "GK" && x !== frente);
      if (!sobem.length) return;
      const alvo = sortearPeso(rng, sobem, x => Math.pow(x.at[A.cab] + x.at[A.for], 2) * (x.j.id === atk.instr.alvo ? CONFIG.pesoAlvo : 1));
      const zag = sortearPeso(rng, marcam, x => x.at[A.cab] + x.at[A.mar]), gk = def.goleiro ? def.goleiro.at : null;
      const c = { tipo, lado: "C", criador: quem, finalizador: alvo, zagueiro: zag };
      c.xg = limitar(CONFIG.xgBase.escanteio * Math.pow(mod(quem.at[A.cru], 28, k), 0.6) * mod(media(alvo.at[A.cab], alvo.at[A.for]), zag ? media(zag.at[A.cab], zag.at[A.mar], zag.at[A.for]) : 12, k) * (frente ? R5.custo : 1), 0.01, 0.6);
      c.chute = alvo.at[A.cab]; c.defesa = gk ? media(gk[A.enc], gk[A.pos]) : 5;
      finalizar(i, c);
    }
    function bolaParada(i, tipo, lado, penal = false) {
      const atk = times[i], def = times[1 - i], gk = def.goleiro ? def.goleiro.at : null;
      if (tipo === "escanteio") {
        estat[i].escanteios++;
        const quem = cobrador(atk, "escanteio", at => at[A.cru]);
        // ponytail: o olímpico não olha o pé de quem cobra; o que entra é a bola fechada, de pé trocado, se a calibragem pedir
        if (CONFIG.grade && quem && rng.chance(CONFIG.gradeValores.olimpico * (quem.at[A.cru] / 25) ** 2)) return golSemChute(i, quem, "olimpico", `${nm(quem)} cobra o escanteio direto, a bola faz a curva e entra: GOL olímpico!`);
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

    // contra: { origem: linha em que o adversário perdeu a bola (A, M) ou E (escanteio afastado), razao: a conta da R1, 1 sem as regras da T1 }
    function sairNoContra(j, contra, texto) { estat[j].contraAtaques++; evento(j, "contra", texto); emContra = true; atacar(j, contra); emContra = false; if (proximo) proximo.zona = "D"; }
    function atacar(i, contra = false, inicio = "D") {
      const atk = times[i], def = times[1 - i], dz = defesas[i].C, e = estat[i];
      const bonus = contra ? CONFIG.contraAtaque.logit + (atk.instr.contraAtaque ? CONFIG.contraAtaque.logitPorMentalidade * Math.max(0, def.instr.mentalidade) : 0) + (contra.logit || 0) : 0;
      aposPerda = perdaAtras === i ? i : null; perdaAtras = null; // o ataque logo depois da perda do adversário nas faixas 1–2
      // quem recupera a bola pode sair em contra-ataque, mais ainda contra time que joga para a frente
      // embalo de um duelo: quanto da folga segue para o lance seguinte (de 0 ao teto); a da defesa vale para o contra-ataque
      const embalo = d => Math.min(CONFIG.embalo.teto, Math.max(0, CONFIG.embalo.parte * d.folga));
      const embaloDaDefesa = d => Math.min(CONFIG.embalo.teto, Math.max(0, -CONFIG.embalo.parte * d.folga)) / CONFIG.embalo.teto;
      let roubada = 0, roubadaFacil = false, expor = 1; // expor: × no contra-ataque (a volta do terceiro homem perdida, na grade); roubada, de 0 a 1: com quanta folga a defesa ganhou o duelo que encerrou o ataque
      const perdeu = zona => {
        if (contra) return;
        const T = CONFIG.transicao, ao = CONFIG.regrasT1 ? atk.instr.aoPerder : "misto";
        // pressionar: a retomada na hora, na zona em que perdeu, pela pressão do time ali contra quem ficou com a bola
        const grade = ehGrade(zona), G = CONFIG.gradeValores;
        if (ao === "pressionar" && !impedido) { // impedimento é falta para a defesa: não dá para retomar na hora
          // na grade, a zona da perda e as vizinhas (média: a zona 1, cada vizinha metade, o meio-espaço ocupado × pressionarMeio)
          let nossa = atk.def[zona];
          if (grade) { let w = 1; for (const z of vizinhas(zona)) { const f = 0.5 * ((z[1] === "e" || z[1] === "d") && atk.def[z] > 0 ? G.pressionarMeio : 1); nossa += f * atk.def[z]; w += f; } nossa /= w; }
          const forca = (nossa + CONFIG.zonaVazia) / (def.atk[espelho(zona)] + CONFIG.zonaVazia);
          if (rng.chance(limitar(T.pressionar.retomada * Math.sqrt(forca), 0.05, 0.5))) {
            e.retomadas = (e.retomadas || 0) + 1; evento(i, "posse", `${tm(i)} pressiona logo e recupera a bola ${ondeDe(zona)}.`);
            proximo = { time: i, zona: ehGrade(zona) ? zona : zona[0] }; bola = null; return;
          }
        }
        const K = CONFIG.contraAtaque, m = atk.instr.mentalidade;
        // quem perde a bola jogando para a frente ou com a linha alta fica mais exposto; time montado para o contra-ataque aproveita mais
        const fator = def.instr.contraAtaque ? (m > 0 ? 1 + K.porMentalidade * m : Math.max(0.3, 1 + K.porRetranca * m)) : 1 + K.semInstrucao * Math.max(0, m);
        // contra-ataque é arma de quem espera atrás: rende mais com mentalidade defensiva e menos com o próprio time adiantado
        const eu = def.instr.mentalidade, postura = !def.instr.contraAtaque ? 1 : eu < 0 ? 1 - K.porPostura * eu : Math.max(0.4, 1 - K.posturaOfensiva * eu);
        // R1: quem ficou atrás contra o que o adversário deixou na frente, mais um
        const razao = CONFIG.regrasT1 ? (def.saida + T.reserva.mais) / Math.max(1, atk.reserva) : 1;
        const p = (def.instr.contraAtaque ? K.com : K.sem) * fator * postura * (atk.instr.impedimento ? K.linhaAlta * atk.linhaAlta : 1) * (1 + CONFIG.embalo.contra * roubada)
          * (CONFIG.regrasT1 ? Math.pow(razao, T.reserva.expoente) * (ao === "pressionar" ? T.pressionar.falha : ao === "recompor" ? T.recompor.contra : 1) : 1) * expor;
        if (rng.chance(p)) {
          // na grade (spec 10): o contra nasce na zona da roubada; quem roubou recicla se não vê espaço (o mau decisor às vezes sai mesmo assim)
          const zc = grade ? espelhoGrade(zona) : null, ladrao = ultimaPerda.marcador;
          if (grade && espacoNoContra(1 - i, zc) < G.reciclar && rng.chance(limitar((ladrao ? decisao(ladrao.at) : 25) / 35, 0.3, 1))) {
            estat[1 - i].grade.reciclagens++; proximo = { time: 1 - i, zona: zc }; bola = null;
            evento(1 - i, "posse", RECICLA[seq % RECICLA.length](ladrao ? nm(ladrao) : null, tm(1 - i))); return;
          }
          // bola perdida pelo lado do meio com o lateral que tinha subido (Apoiador ou Invertido): o contra-ataque vai pelas costas dele.
          // Na grade: faixas 2–4 do lado dele (lado ou meio-espaço), onde o Apoiador ataca e o Invertido fecha por dentro
          const ladoPerda = ehGrade(zona) ? (faixaDe(zona) >= 2 && faixaDe(zona) <= 4 ? { E: "E", e: "E", d: "D", D: "D" }[zona[1]] : null) : linhaDaZona(zona) === "M" && ladoDaZona(zona) !== "C" ? ladoDaZona(zona) : null;
          const lateral = ladoPerda ? atk.emCampo.find(x => POSICOES[x.pos].lado === ladoPerda && ["defesa", "ala"].includes(POSICOES[x.pos].linha) && temPapel(x, "apoiador", "invertido")) : null;
          const costas = lateral ? ` pelas costas de ${nm(lateral)}, que tinha subido` : "";
          // roubada no centro ou interceptação: contra melhor; contra a linha alta, quem recebe no meio-espaço sai livre (entre o zagueiro e o lateral)
          const naGrade = grade ? { zona: zc, logit: zona[1] === "C" || ultimaPerda.causa === "corte" ? G.contra.centro : 0, livre: !!atk.instr.impedimento } : {};
          sairNoContra(1 - i, { origem: linhaDaZona(zona), razao, ...naGrade }, impedido ? `${tm(1 - i)} cobra a falta rápido e sai em contra-ataque.` : roubadaFacil ? `${tm(1 - i)} toma a bola com facilidade e dispara no contra-ataque${costas}.` : `${tm(1 - i)} recupera a bola e sai em contra-ataque${costas}.`); }
      };
      e.ataques++; trilha = []; rota = []; portador = null; bola = null; aposFalta = false; superados.clear();
      if (cobranca && cobranca.time === i && !contra) { portador = cobranca.jog; aposFalta = true; } // recomeço depois de falta: quem sofreu cobra
      cobranca = null;
      const recomecar = (zona, d) => { if (d.pivo) passo(i, zona, d); cobranca = { time: i, jog: d.pivo }; proximo = { time: i, zona: ehGrade(zona) ? zona : zona[0] }; };

      // A jogada na grade 5×5 (spec 7): de passo em passo, quem tem a bola escolhe o destino pela Decisão (escolherPasso), e o passo é um duelo na zona
      // de destino com a dificuldade do tipo. Termina em chance (quem tem a bola decide finalizar na faixa 5, ou o passo perdido ali), perda, falta, lesão ou no LIMITE_DE_PASSOS.
      function atacarNaGrade() {
        const G = CONFIG.gradeValores, D = defesas[i], P = def.instr.pressao, eg = e.grade, gols0 = e.gols, Zv = CONFIG.zonaVazia;
        // opcoes.registro (régua da calibragem, sim_grade): cada passo [time, de, para, tipo, passador, receptor, venceu, conduziu, "espaco"/"entre"/false, marcador] e o fim do ataque [time, "fim", xG, chutes, minuto]
        const reg = opcoes.registro, xg0 = e.xg, fin0 = e.finalizacoes;
        // as contas das opções vão por vetores na posição da zona em ZONAS_GRADE (k = 5 × (faixa − 1) + coluna; o espelho é 24 − k)
        const PESO = new Float64Array(25), AT = new Float64Array(25), OPC = {}; // OPC: as opções de cada zona neste ataque
        ZONAS_GRADE.forEach((z, k) => { AT[k] = atk.atk[z] + Zv; for (const o of atk.zonas[z]) PESO[k] += o.w; });
        const BASE = [G.baseDuelo.D, G.baseDuelo.M, G.baseDuelo.M, G.baseDuelo.A, G.baseDuelo.A], trans = naTransicao(i, contra), V = D.vetor, rap = D.rapidez;
        // a defesa bascula com um passo de atraso (A4): a arrumação do corredor onde a bola está misturada com a do destino; o arrasto (A5) só no passo seguinte
        let atual = inicio, ka = 0, fraca = null, kFraca = -1, imp = { logit: 0, prende: false }, certos = 0, conduz = 0, livre = !!(contra && contra.livre);
        const defesaNo = k => (trans ? V.T[k] : rap * V.col[k % 5][k] + (1 - rap) * V.col[ka % 5][k]) * (k === kFraca ? fraca.fator : 1);
        // começo: a zona do recomeço, ou a linha antiga (D faixa 1; M, o meio e o contra-ataque, faixa 2; A, a roubada no ataque, faixa 4) no corredor mais forte
        if (!ehGrade(atual)) {
          const f = { D: 1, M: 2, A: 4 }[inicio], pref = atk.instr.lado;
          atual = sortearPeso(rng, ZONA_EM[f], z => { const c = z[1], k = 5 * f - 5 + colunaDe(z); return Math.pow(AT[k] / (V.col[2][k] + Zv), CONFIG.expoenteCorredor)
            * (c === "C" ? CONFIG.pesoCentro : 1) * (atk.zonas[z].length ? 1 : 0.15) * (pref === c ? CONFIG.ladoPreferido : pref === "lados" && (c === "E" || c === "D") ? CONFIG.ladosPreferidos : 1); }) || ZONA_EM[f][2];
        }
        if (!portador) portador = (sortearPeso(rng, atk.zonas[atual], x => x.p) || {}).jog || null;
        ka = ZONAS_GRADE.indexOf(atual);
        let dif = difDe(atual);
        // terceiro homem (spec 7.6): th 1 = passo para a frente ganho apertado (parA passou), 2 = a volta ganha (o próximo para a frente leva thBonus)
        const T3 = G.terceiro, ent = entrosamento(atk.emCampo), mDes = [];
        const fatorTerceiro = T3.bonus * (1 + T3.pressao * P) * (def.instr.agressividade > 0 ? T3.agressivo : 1) * (def.instr.mentalidade <= -1 ? T3.retranca : 1);
        const PV = G.pivo, AC = G.atrair;
        let th = 0, parA = null, thBonus = 0, lanc = 0, seg = 0, entrada = null; // lanc: o Passe longo de quem tem a bola no lançamento, na virada e na inversão
        // Desarme e Agressividade médios de quem marca na zona (a volta do terceiro homem é disputada)
        const marcaEm = k => mDes[k] ?? (mDes[k] = (l => { let s = 0, w = 0; for (const x of l) { s += x.w * (x.jog.at[A.des] + x.jog.at[A.agr]); w += x.w; } return w ? s / (2 * w) : 25; })(def.zonasDef[espelho(ZONAS_GRADE[k])]));
        // a virada e a inversão: pelo Passe longo de quem passa e pelas instruções (passe longo e lados a pedem, o curto a evita)
        const VI = G.viradaInstrucao, vir = (atk.instr.passe === "longo" ? VI.longo : atk.instr.passe === "curto" ? VI.curto : 1) * (atk.instr.lado === "lados" ? VI.lados : 1);
        const buracos = { ...D[corredorDe(atual)].buracos }; // o que a cobertura emprestada e o arrasto abriram: a chance lê
        // logit do passo além do duelo: contra-ataque, impulso, dificuldade, pressão na volta (pela metade dividindo o marcador), armadilha do lado (A1:
        // só no duelo; quem passa não a vê, senão não seria armadilha), marcação das faixas atravessadas e a condução de quem leva a bola
        const logitDe = (o, armadilha = false) => {
          const k = o.i, c = k % 5;
          let l = bonus + imp.logit + (o.goleiro ? G.goleiro.dificuldade : dif[o.k]);
          if (o.tipo === "voltar") l -= G.pressaoNaVolta * P * (c > 0 && c < 4 && PESO[k - 1] >= G.dividir && PESO[k + 1] >= G.dividir ? 0.5 : 1);
          if (armadilha && (c === 0 || c === 4)) l -= G.armadilhaLado * P;
          for (let x = ka - ka % 5 + 5 + c; x < k; x += 5) l -= G.atravessa * Math.log(1 + defesaNo(x) / Zv); // as faixas atravessadas, no corredor do destino
          if (o.conduzir) l += conduz;
          if (livre && (c === 1 || c === 3)) l += G.impulso.deFrente; // contra a linha alta, o 1º passo do contra para o meio-espaço sai livre
          if (th) l += terceiro(o, k, c);
          if (o.tipo === "pular" || o.tipo === "virada" || o.tipo === "inversao") l += lanc;
          return l;
        };
        // terceiro homem: a volta disputada (th 1) e o bônus do próximo passo para a frente (th 2, vale o maior com o impulso), fora do logitDe (custo)
        function terceiro(o, k, c) {
          if (th === 1) return o.tipo === "voltar" ? PV.segura * seg - T3.disputa * (P + (marcaEm(k) - 25) / 25) : 0;
          return k - c > ka - ka % 5 && PESO[k] >= G.presenca ? Math.max(0, thBonus * ent[linhaDaZona(ZONAS_GRADE[k])] - imp.logit) : 0;
        }
        // valor da opção: chance de ganhar × o xT do destino, menos a de perder × o xT que o adversário ganha ali (× risco); pular faixa cresce contra a
        // pressão e a linha alta; quem recebeu de costas (prende) avança menos; a preferência do papel (neutra nesta entrega)
        const tat = [], taticoEm = k => tat[k] ?? (tat[k] = tatico(i, ZONAS_GRADE[k], contra)); // só muda com a zona
        const pular = 1 + G.pularPressao * P + G.pularLinha * (def.instr.impedimento || def.instr.mentalidade > 0 ? 1 : 0);
        // fim na faixa 4 (Tarefa 7): o cruzamento antecipado do lado (melhor no contra-ataque e contra linha alta) e o chute de longe da zona 14
        const AN = CONFIG.gradeValores.chance.antecipado, fimCruzar = AN.valor * (contra ? AN.contra : 1) * (def.instr.impedimento || def.instr.mentalidade > 0 ? AN.linhaAlta : 1);
        const fimChutar = CONFIG.gradeValores.chance.chutar * ((CONFIG.finalizar[atk.instr.finalizar] || {}).longe || 1);
        // passe no espaço (Tarefa 9b): quem pode chegar ao destino k (faixa de baixo, mesmo corredor ou vizinho), a chegada esperada (sem quem passa)
        // e a Velocidade média de quem marca ali
        const ES = G.espaco, CHEGA = [], VDEF = [];
        const quemChega = k => CHEGA[k] ?? (CHEGA[k] = (() => { const f = (k / 5) | 0, c = k % 5, l = []; if (f < 1) return l;
          for (let x = Math.max(0, c - 1); x <= Math.min(4, c + 1); x++) for (const o of atk.zonas[ZONAS_GRADE[5 * f - 5 + x]]) l.push(o); return l; })());
        const velDef = k => VDEF[k] ?? (VDEF[k] = (l => { let s = 0, w = 0; for (const x of l) { s += x.w * x.jog.at[A.vel]; w += x.w; } return w ? s / w : 25; })(def.zonasDef[espelho(ZONAS_GRADE[k])]));
        const chegadaDe = (jog, k) => ES.peso * habilidadeAtaque(jog.at, ZONAS_GRADE[k]) * chegada(jog.at) / 25;
        const corrida = (vel, k) => ES.dificuldade + ES.corrida * (vel - velDef(k)) / 25;
        // entrelinhas: quem pode aparecer na zona k da faixa 4 (faixas 3 a 5, mesmo corredor ou vizinho, menos a própria zona) e a chegada esperada
        const EL = G.entrelinhas, APARECE = [], ENTRE = new Set([16, 17, 18]); // 4e, 4C, 4d
        const quemAparece = k => APARECE[k] ?? (APARECE[k] = (() => { const c = k % 5, l = [];
          for (const f of [2, 3, 4]) for (let x = Math.max(0, c - 1); x <= Math.min(4, c + 1); x++) { const z = 5 * f + x; if (z !== k) for (const o of atk.zonas[ZONAS_GRADE[z]]) l.push({ ...o, z }); } return l; })());
        const apareceEsperado = k => { let a = 0, w = 0; for (const x of quemAparece(k)) if (x.jog !== portador) { const p = x.w * media(x.jog.at[A.dom], x.jog.at[A.mov]); a += p * EL.peso * habilidadeAtaque(x.jog.at, ZONAS_GRADE[k]); w += p; } return w ? a / w : 0; };
        const chegadaEsperada = k => { let a = 0, v = 0, w = 0; for (const x of quemChega(k)) if (x.jog !== portador) { const c = chegada(x.jog.at), p = x.w * c; a += p * chegadaDe(x.jog, k); v += p * c; w += p; } return w ? { az: a / w, vel: v / w } : null; };
        // atrair conduzindo: o companheiro mais forte ao lado ou à frente de k (-1: ninguém) e quanto há de marcação para puxar em k
        const vizinhoLivre = k => { const b = k - k % 5, c = k % 5; let m = -1, w = G.presenca; for (const x of [c > 0 ? b + c - 1 : -1, c < 4 ? b + c + 1 : -1, b < 20 ? b + 5 + c : -1]) if (x >= 0 && PESO[x] >= w) { w = PESO[x]; m = x; } return m; };
        const atracao = k => Math.min(1, defesaNo(k) / AC.marcador);
        const valorDe = o => {
          if (o.fim && o.tipo === "finalizar") { // vale mais quanto melhor quem tem a bola para aquilo e quanto menos gente em cima dele
            const q = (ka % 5 === 0 || ka % 5 === 4 ? portador.at[A.cru] : portador.at[A.fin]) / 25, livre = AT[ka] / (AT[ka] + defesaNo(ka) + Zv);
            return G.area.chute * XT[ka] * q * (G.area.piso + (1 - G.area.piso) * 2 * livre);
          }
          if (o.fim) return o.tipo === "cruzar" ? fimCruzar * portador.at[A.cru] / 25 * Math.max(Math.min(1, PESO[21] + PESO[22] + PESO[23]), CONFIG.gradeValores.chance.cruzamento.cego * cegueira(portador.at))
            : fimChutar * portador.at[A.lon] / 25;
          const k = o.i, ch = o.espaco ? chegadaEsperada(k) : null, ap = o.entre ? apareceEsperado(k) : 0;
          if ((o.espaco && !ch) || (o.entre && !ap)) return null;
          const ext = ch ? corrida(ch.vel, k) : o.entre ? EL.dificuldade : 0, az = ch ? ch.az + Zv : o.entre ? ap + Zv : AT[k];
          const p = 1 / (1 + Math.exp(-(BASE[(k / 5) | 0] + logitDe(o) + taticoEm(k) + ext + CONFIG.inclinacaoDuelo * Math.log(az / (defesaNo(k) + Zv)))));
          const v = o.conduzir ? vizinhoLivre(k) : -1;
          return p * (XT[k] + (v >= 0 ? AC.ganho * atracao(k) * XT[v] : 0)) - (1 - p) * (G.risco * XT[24 - k] + G.posse[(ka / 5) | 0]);
        };
        // o que multiplica a nota da opção (a nota já é positiva; no valor, que pode ser negativo, o multiplicador trocaria de sentido)
        const OU = G.ousadia, dificil = o => o.conduzir ? o.tipo !== "lado" : o.espaco || o.entre || o.tipo === "pular" || o.tipo === "virada" || o.tipo === "inversao";
        const multDe = o => o.fim ? 1 : (o.goleiro ? G.goleiro.vontade + G.goleiro.pressao * P : 1) * (o.espaco ? ES.vontade : 1) * (o.tipo === "pular" ? pular : o.tipo === "virada" || o.tipo === "inversao" ? vir : 1)
          * (portador && dificil(o) ? 1 + OU.peso * OU.faixas[(ka / 5) | 0] * (portador.at[A.exc] - 25) / 25 : 1)
          * (o.conduzir && portador && portador.mancha && !portador.mancha.com[o.para] && (portador.papel || PAPEL_PADRAO[portador.pos]) === "fixo" ? G.conduzir.fora : 1) * (seg && o.tipo === "voltar" ? 1 + PV.vontade * seg : 1)
          * (imp.prende && o.i - o.i % 5 > ka - ka % 5 ? G.impulso.prende : 1) * preferenciaDoPasso(portador && portador.papel, o.tipo, !!o.conduzir);
        // narra o passo ganho (a frase leva o tipo para o texto enxuto) e o guarda na rota: [de, para, tipo, passador, receptor, venceu, marcador?]
        function passoGrade(o, d) {
          const p = d.pivo, m = d.marcador, de = portador, Z = o.para;
          const r = [atual, Z, o.tipo, de ? de.j.id : null, p ? p.j.id : null, d.venceu, ...(m ? [m.j.id] : [])];
          if (!p) { portador = null; rota.push(r); trilha.push(Object.assign([`${tm(i)} avança ${naZona(Z, "pel")}`], { passo: { tipo: o.tipo } })); return; }
          if (d.falta && m) { evento(i, "falta", comTrilha(`Falta de ${nm(m)} em ${nm(p)} ${ondeDe(Z)}.`)); rota.push(r); portador = p; aposFalta = true; return; }
          // o lateral Invertido que recebe por dentro sai da lateral e fecha (a narração dos papéis só conta o que não é o padrão)
          const facil = comFolga(d), deNovo = d.recuperou ? " de novo" : "", P = de && nm(de), dentro = p !== de && "eCd".includes(Z[1]) && temPapel(p, "invertido");
          const R = nm(p) + (dentro ? ", que sai da lateral e fecha por dentro" : ""), leva = o.conduzir || p === de;
          if (m) superados.set(m, facil ? CONFIG.recuperacao.facil : CONFIG.recuperacao.normal);
          const supera = !m ? null : leva && facil && dribleNarrado(p.at, nm(m), seq) || (facil ? `deixa ${nm(m)} para trás${deNovo} com facilidade` : `passa por ${nm(m)}${deNovo}`);
          const cobra = aposFalta ? (leva ? "cobra a falta rápido e " : "cobra a falta e ") : "";
          const escora = th === 1 && o.tipo === "voltar" && p !== de; // a volta de primeira depois do passe apertado: tabela, ou o terceiro homem
          const N = G.narrar, efeito = escora && de.at[A.exc] >= N.alto && de.at[A.dom] >= N.alto - 3 && seq % 2 ? `dá de calcanhar para ${R}` : escora && p !== parA && seq % 3 === 0 ? `faz o corta-luz e a bola chega a ${R}` : null;
          const t = !de ? `${R} recebe ${naZona(Z)}` : o.frase ? `${P} ${o.frase} ${R}` : o.entre ? (o.recuou ? `${R} recua entre as linhas e recebe de ${P} ${naZona(Z)}` : `${P} ${cobra}acha ${R} entre as linhas ${naZona(Z)}`) : o.espaco ? `${P} ${cobra}lança ${R} no espaço, ${naZona(Z)}` : leva ? `${P} ${cobra}${o.conduzir ? "conduz" : "segue com a bola"} ${naZona(Z, "pel")}`
            : `${P} ${cobra}` + ({ voltar: !escora ? `recua para ${R}` : seg ? `segura de costas e escora para a passagem de ${R}` : efeito || (p === parA ? `tabela com ${R}` : `deixa de primeira para ${R}`), lado: `toca de lado para ${R}`, virada: `vira o jogo para ${R}, ${naZona(Z)}`, pular: `lança por cima da linha para ${R}, ${naZona(Z)}`, inversao: `inverte para ${R}, ${naZona(Z)}` }[o.tipo] || `acha ${R} ${naZona(Z)}`);
          // quebrou linha: o lançamento, a virada e a inversão; a subida e a diagonal ganhas com folga
          const quebra = ["pular", "virada", "inversao"].includes(o.tipo) || ((o.tipo === "subir" || o.tipo === "diagonal") && facil) || dentro || escora || !!o.espaco || !!o.entre || !!o.frase; // o papel também se conta
          // quem leva a bola: o drible é outra oração ("conduz…, passa por M e toca para…"); no passe, quem recebe ("acha R…, que passa por M")
          trilha.push(Object.assign(!supera ? [t] : leva || dentro || o.recuou ? [t, supera] : [`${t}, que ${supera}`], { passo: { tipo: o.tipo, quebra, de: P || null, para: nm(p) } })); // quem recuou é o sujeito: outra oração
          rota.push(r); portador = p; aposFalta = false;
        }
        // Segunda bola (spec 7.7) na zona de queda: presença dos dois times ali e nas vizinhas; quem ganhou o 1º toque (cab: true nosso, false deles)
        // leva a presença do time dele × a direção (Cabeceio). Devolve quem fica com a bola, do nosso time, ou null. conta: [disputadas, ganhas]
        function sobra(queda, cab, direcao, conta) {
          const SB = G.segundaBola, zonas = [queda, ...vizinhas(queda)];
          let nossa = 0, deles = 0;
          for (const z of zonas) { const f = z === queda ? 1 : SB.vizinhas; for (const x of atk.zonas[z]) nossa += f * x.w; for (const x of def.zonasDef[espelho(z)]) deles += f * x.w; }
          if (cab === true) nossa *= direcao; else if (cab === false) deles *= direcao;
          conta[0]++;
          if (!segundaBola(rng, nossa, deles, G)) return null;
          const quem = sortearPeso(rng, zonas.flatMap(z => atk.zonas[z].map(x => ({ jog: x.jog, w: x.w * (z === queda ? 1 : SB.vizinhas) }))), x => x.w);
          if (quem) conta[1]++;
          return quem ? quem.jog : null;
        }
        // a chance da grade: o cruzamento conta [tentados, certos]; o errado é perda de bola, às vezes escanteio; o afastado pela zaga cai na zona 14,
        // onde os meias disputam a segunda bola (fontes de cruzamento: Mastering, Early crosses). Devolve { zona, jog } se a jogada segue
        function fimDaChance(c) {
          if (c.tipo === "cruzamento") { eg.cruzamentos[0]++; if (!c.errado) eg.cruzamentos[1]++; }
          if (!c.errado) return finalizar(i, c);
          const cr = nm(c.criador), ld = NOME_LADO[c.lado], zg = c.zagueiro ? nm(c.zagueiro) : "a zaga", gk = def.goleiro;
          if (!c.vazia && rng.chance(CONFIG.gradeValores.chance.cruzamento.escanteio)) { recebe(c.criador); evento(1 - i, "canto", comTrilha(`${cr} cruza da ${ld}, ${zg} corta e cede o escanteio.`)); return bolaParada(i, "escanteio", c.lado); }
          const GC = G.golContra;
          if (!c.vazia && c.zagueiro && rng.chance(GC.cruzamento * GC.referencia / Math.max(5, c.zagueiro.at[A.pos]))) { recebe(c.criador); return golSemChute(i, c.zagueiro, "golcontra", `${cr} cruza da ${ld}, ${zg} tenta cortar e manda contra o próprio gol: GOL contra!`); }
          const n = c.vazia ? 0 : rng.int(0, 2), afasta = c.vazia || n === 0 || (n === 1 && !gk);
          const fim = c.vazia ? "mas não tem ninguém na área e a zaga afasta" : [`e ${zg} afasta`, gk ? `e ${nm(gk)} sai para ficar com a bola` : `e ${zg} afasta`, "e a bola passa por todo mundo"][n];
          const texto = `${cr} ${temPapel(c.criador, "apoiador") ? (c.antecipado ? "sobe pela lateral e " : "chega ao fundo e ") : ""}${c.antecipado ? "cruza cedo" : "cruza"} da ${ld}, ${fim}`;
          const p = afasta ? sobra("4C", c.zagueiro ? false : null, c.zagueiro ? 1 + G.aereo.direcao * c.zagueiro.at[A.cab] / 25 : 1, eg.sobras) : null;
          if (p) { trilha.push(Object.assign([texto, `a sobra fica com ${nm(p)} ${naZona("4C")}`], { de: cr })); return { zona: "4C", jog: p }; }
          recebe(c.criador); evento(1 - i, "posse", comTrilha(`${texto}.`));
          if (n === 1 && gk) reposicao(1 - i, "maos");
        }
        // Bola longa (spec 7.7): 1º toque, duelo aéreo pelo pacote aéreo (Posicionamento + Força; o Passe longo de quem lança ajuda o nosso); 2º toque,
        // a segunda bola na faixa 4 do mesmo corredor (a ajeitada ou o rebote, na frente da área). Devolve { zona, jog, cabeceou } se a jogada segue
        function bolaLonga(o) {
          const zl = o.para, AE = G.aereo, alto = j => j.at[A.pos] + j.at[A.for], lanca = portador;
          // ponytail: sem o atributo Altura (o pacote aéreo o pede); entra aqui se for criado
          const nosso = sortearPeso(rng, atk.zonas[zl], x => x.w * alto(x.jog)).jog, deles = (sortearPeso(rng, def.zonasDef[espelho(zl)], x => x.w * alto(x.jog)) || {}).jog;
          const l = AE.base + AE.lancador * (lanca.at[A.plo] - 25) / 25 + (atual === "1E" || atual === "1D" ? G.longa.ladoZagueiro : 0)
            + AE.inclinacao * Math.log((alto(nosso) + AE.vazio) / ((deles ? alto(deles) : 0) + AE.vazio));
          const p1 = 1 / (1 + Math.exp(-l)), ganhou = !deles || rng.chance(p1);
          eg.longas[0]++; eg.aereos[0]++; if (ganhou) eg.aereos[1]++;
          e.zonas[zl][ganhou ? 0 : 1]++; registrar(nosso, ganhou, p1); if (deles) registrar(deles, !ganhou, 1 - p1);
          rota.push([atual, zl, "pular", lanca.j.id, nosso.j.id, ganhou, ...(deles ? [deles.j.id] : [])]);
          const frase = Object.assign([`${nm(lanca)} ${o.abre || "lança para"} ${nm(nosso)} ${naZona(zl)}` + (!deles ? ", que ajeita de cabeça" : ganhou ? `, que ganha pelo alto de ${nm(deles)}` : `, mas ${nm(deles)} sobe mais`)], { passo: { tipo: "pular", quebra: true, de: nm(lanca) } });
          trilha.push(frase);
          const queda = ZONA_EM[faixaDe(zl) - 1][colunaDe(zl)], quem = ganhou ? nosso : deles;
          const p = sobra(queda, ganhou, 1 + AE.direcao * quem.at[A.cab] / 25, eg.segundas);
          const k = eg.passos.pular = eg.passos.pular || [0, 0]; k[0]++;
          if (reg) reg.push([i, atual, queda, "longa", lanca.j.id, p ? p.j.id : null, !!p, false]);
          if (p) { k[1]++; certos++; eg.longas[1]++; frase.push(`a segunda bola fica com ${nm(p)}`); frase.passo.para = nm(p); return { zona: queda, jog: p, cabeceou: ganhou }; }
          portador = null;
          if (perdaDePosse(i, queda, { pivo: null, marcador: null })) perdeu(queda);
        }
        // Reposição do goleiro (Tarefa 9c): curta, para quem está na faixa 1 (o primeiro passe pode ser roubado pela pressão, com a bola perto do nosso gol);
        // longa, a bola longa para as faixas 4–5. Devolve { zona, jog } se a jogada segue; null se não há como repor (a jogada começa normal); undefined se acabou
        function reposicaoDoGoleiro(tipo) {
          const R = G.reposicao, gk = atk.goleiro, meta = tipo === "meta", tem = l => l.filter(z => atk.zonas[z].length), perto = gk ? tem(ZONA_EM[1]) : [], longe = gk ? tem(["4e", "4C", "4d", "5e", "5C", "5d"]) : [];
          if (!perto.length && !longe.length) return null;
          const pes = R.goleiro * (gk.at[A.plo] - R.referencia) / 25, c = meta ? eg.tiros : eg.maos;
          const vai = R.base + R.instr[atk.instr.passe] + R.pressao * (P - 1) + pes + (meta ? 0 : R.maos), pesoDe = z => PESO[ZONAS_GRADE.indexOf(z)];
          const longa = !perto.length || (longe.length > 0 && rng.chance(1 / (1 + Math.exp(-vai))));
          c[0]++; atual = "1C"; ka = 2; portador = gk;
          if (longa) return bolaLonga({ para: sortearPeso(rng, longe, pesoDe), abre: meta ? "cobra o tiro de meta longo para" : "repõe longe para" });
          c[1]++;
          const z = sortearPeso(rng, perto, pesoDe), k = ZONAS_GRADE.indexOf(z), quem = sortearPeso(rng, atk.zonas[z], x => x.p).jog;
          const d = duelo(i, z, pes - (meta ? R.roubo * P : 0), false, { dz: defesaNo(k), quem });
          if (d.recomeca) return recomecar(z, d);
          if (!d.falta) { const q = eg.passos.repor = eg.passos.repor || [0, 0]; q[0]++; if (d.venceu) { q[1]++; certos++; } if (reg) reg.push([i, atual, z, "repor", gk.j.id, d.pivo ? d.pivo.j.id : null, d.venceu, false, false, d.marcador ? d.marcador.j.id : null]); }
          if (!d.venceu) { if (meta) eg.tiros[2]++; roubada = embaloDaDefesa(d); roubadaFacil = -d.folga >= CONFIG.embalo.narrar; if (perdaDePosse(i, z, { ...d, passador: gk })) perdeu(z); return; }
          passoGrade({ para: z, tipo: "repor", frase: meta ? "cobra o tiro de meta curto para" : "repõe com a mão para" }, d);
          return { zona: z, jog: quem };
        }
        // a jogada segue depois da segunda bola: da zona de queda, com quem ficou com ela (de frente se foi a ajeitada do nosso)
        const seguir = ({ zona, jog, cabeceou }) => { atual = zona; ka = ZONAS_GRADE.indexOf(zona); dif = difDe(zona); portador = jog; aposFalta = false;
          imp = { logit: cabeceou ? G.impulso.deFrente : 0, prende: false }; th = 0; seg = 0; fraca = null; kFraca = -1; };
        const rep = !contra && repor && repor.time === i ? repor.tipo : null; repor = null;
        try {
          if (rep) { const z = reposicaoDoGoleiro(rep); if (z) seguir(z); else if (z === undefined) return; }
          for (let n = rep ? 1 : 0; ; n++) { // a reposição é o 1º passo
            // o passe precisa de alguém nosso no destino; a condução (só com quem leva a bola) pode ir para o espaço vazio
            lanc = portador ? G.lancamento * (portador.at[A.plo] - 25) / 25 : 0;
            if (portador) conduz = G.conduzir.base + G.conduzir.peso * (media(portador.at[A.dri], portador.at[A.vel], portador.at[A.dom]) - 25) / 25;
            // a zona sem ninguém nosso, para a frente (Tarefa 9b): na faixa 4 por dentro, passe entrelinhas para quem aparece ali (no pé); no resto, passe
            // no espaço para quem chega correndo
            const ehGk = portador === atk.goleiro, chave = atual + !!portador + ehGk, lista = OPC[chave] || (OPC[chave] = opcoesDoPasso(atual).flatMap(x => x.conduzir ? (portador && !ehGk ? [x] : []) : PESO[x.i] > 0 ? [x]
              : !portador || x.i - x.i % 5 <= ka - ka % 5 ? [] : ENTRE.has(x.i) ? (quemAparece(x.i).length ? [{ ...x, entre: true }] : []) : quemChega(x.i).length ? [{ ...x, espaco: true }] : [])
              .concat(portador && (atual === "4E" || atual === "4D") && PESO[21] + PESO[22] + PESO[23] > 0 ? [{ tipo: "cruzar", fim: true, i: ka }] : portador && atual === "4C" ? [{ tipo: "chutar", fim: true, i: ka }] : portador && ka >= 20 ? [{ tipo: "finalizar", fim: true, i: ka }] : portador && atk.goleiro && !ehGk && ka < 5 ? [{ tipo: "voltar", goleiro: true, para: "1C", i: 2, k: -1 }] : []));
            let o = n < LIMITE_DE_PASSOS && escolherPasso(rng, lista, valorDe, decisaoSobPressao(portador ? decisao(portador.at) : 25, P * (1 - G.calma.pressao * atk.calma), G), G, sortearPeso, multDe);
            // rede de segurança (ou opção nenhuma): não acha espaço, perde a bola ou roda, como nas 9 zonas
            if (!o) { if (perdaDePosse(i, atual, { pivo: portador, marcador: null })) perdeu(atual); return; }
            if (o.fim) { e.corredor[ladoDaZona(atual)]++; const ch = criarChance(rng, atk, def, ladoDaZona(atual), portador, { contra, superados, zona: atual, buracos, marcacao: defesaNo(ka) }); if (ch && ch.tipo === "area" && (ka === 21 || ka === 23)) ch.xg *= G.chance.xgMeio; // da área, mas de lado para o gol
              if (o.tipo === "finalizar" && entrada && ch && ch.xg) ch.xg = limitar(ch.xg * (1 + CONFIG.embalo.chance * embalo(entrada) / CONFIG.embalo.teto), 0.01, CONFIG.xgMaximo); entrada = null; const z = fimDaChance(ch); if (!z) return; seguir(z); continue; }
            // o lançamento para o 9 ou o meio-espaço da faixa 5 vai pelo alto: com o passe longo sempre; senão, pelo Passe longo de quem lança
            if (o.tipo === "pular" && !o.espaco && o.i >= 21 && o.i <= 23 && portador && (atk.instr.passe === "longo" || rng.chance(G.longa.alto * portador.at[A.plo] / 25))) {
              const z = bolaLonga(o); if (!z) return; seguir(z); continue;
            }
            const para = o.para, lado = ladoDaZona(para), naFaixa5 = faixaDe(para) === 5;
            if (naFaixa5) e.corredor[lado]++;
            // passe no espaço: quem chega (peso × Velocidade, sem quem passa); nas faixas 4–5, o impedimento
            const corre = o.espaco ? (sortearPeso(rng, quemChega(o.i).filter(x => x.jog !== portador), x => x.w * chegada(x.jog.at)) || {}).jog : null;
            if (o.espaco && !corre) { if (perdaDePosse(i, atual, { pivo: portador, marcador: null })) perdeu(atual); return; }
            if (corre && faixaDe(para) >= 4 && rng.chance(chanceDeImpedimento(atk, def, contra) * G.espaco.impedimento)) {
              eg.espaco[0]++; e.impedimentos++; recebe(portador); evento(i, "impedimento", comTrilha(`${nm(portador)} lança ${nm(corre)} no espaço, mas ele está impedido.`)); return;
            }
            // entrelinhas: quem aparece (peso × Domínio, sem quem passa); o 9 que recuou da faixa 5 recebe de costas
            const aparece = o.entre ? sortearPeso(rng, quemAparece(o.i).filter(x => x.jog !== portador), x => x.w * media(x.jog.at[A.dom], x.jog.at[A.mov])) : null;
            if (o.entre && !aparece) { if (perdaDePosse(i, atual, { pivo: portador, marcador: null })) perdeu(atual); return; }
            if (aparece) o = { ...o, recuou: aparece.z >= 20 };
            const chega = seg && o.tipo === "voltar" && !o.goleiro ? (sortearPeso(rng, atk.zonas[para].filter(x => x.jog !== portador), x => x.w * x.jog.at[A.mov]) || {}).jog : null; // a escora: quem chega, pela Movimentação
            // o passe para a área: quem chega é quem se movimenta melhor, e ela o solta do marcador (dono, 01/11)
            const naArea5 = naFaixa5 && !o.conduzir && !corre && !aparece ? (sortearPeso(rng, atk.zonas[para].filter(x => x.jog !== portador), x => x.w * x.jog.at[A.mov]) || {}).jog : null;
            const quemVai = o.goleiro ? atk.goleiro : o.conduzir ? portador : corre || (aparece && aparece.jog) || chega || naArea5;
            const d = duelo(i, para, logitDe(o, true) + (naArea5 ? G.area.mov * (naArea5.at[A.mov] - 25) / 25 : 0) + (corre ? corrida(chegada(corre.at), o.i) : aparece ? EL.dificuldade + EL.mov * (aparece.jog.at[A.mov] - 25) / 25 : 0), contra,
              { dz: defesaNo(o.i), quem: quemVai, ...(corre ? { az: chegadaDe(corre, o.i) } : aparece ? { az: EL.peso * habilidadeAtaque(aparece.jog.at, para) } : {}) });
            const passador = portador, subiu = faixaDe(para) > faixaDe(atual), era2 = th === 2 && subiu;
            livre = false;
            fraca = null; kFraca = -1;
            if (d.recomeca && !d.pivo) return recomecar(para, d); // lesão: o time recomeça dali
            if (d.parada) {
              const penal = naFaixa5 && lado === "C" && rng.chance(CONFIG.penalti); // pênalti só dentro da área (faixa 5 por dentro)
              if (d.pivo && d.marcador) { recebe(d.pivo); evento(i, "falta", comTrilha(penal ? `Pênalti! ${nm(d.marcador)} derruba ${nm(d.pivo)} na área.` : `Falta de ${nm(d.marcador)} em ${nm(d.pivo)} ${ondeDe(para)}.`)); }
              else if (penal) evento(i, "falta", "A falta foi dentro da área: pênalti!");
              return bolaParada(i, "falta", lado, penal);
            }
            if (!d.venceu && d.recomeca) return recomecar(para, d);
            if (!d.falta) {
              const k = o.conduzir ? eg.conducoes : (eg.passos[o.tipo] = eg.passos[o.tipo] || [0, 0]);
              k[0]++; if (d.venceu) { k[1]++; certos++; }
              if (o.espaco) { eg.espaco[0]++; if (d.venceu) eg.espaco[1]++; }
              if (o.entre) { eg.entrelinhas[0]++; if (d.venceu) eg.entrelinhas[1]++; }
              if (reg) reg.push([i, atual, para, o.tipo, passador ? passador.j.id : null, d.pivo ? d.pivo.j.id : null, d.venceu, !!o.conduzir, o.espaco ? "espaco" : o.entre ? "entre" : false, d.marcador ? d.marcador.j.id : null]);
              // depois da volta ganha: tabela se a volta foi para quem tinha passado; terceiro homem se chega às faixas 4–5
              if (era2) { if (passador === parA) { eg.tabelas[0]++; if (d.venceu) eg.tabelas[1]++; } if (faixaDe(para) >= 4) { eg.terceiros[0]++; if (d.venceu) eg.terceiros[1]++; } }
            }
            if (!d.venceu && th === 1 && o.tipo === "voltar") expor = T3.contra; // a volta roubada: contra-ataque contra a defesa desarrumada
            // a perda na volta conta na zona de origem
            const perda = z => { roubada = embaloDaDefesa(d); roubadaFacil = -d.folga >= CONFIG.embalo.narrar; if (perdaDePosse(i, z, d.pivo ? { ...d, passador: portador } : { ...d, pivo: portador })) perdeu(z); };
            if (!d.venceu && !naFaixa5) return perda(o.tipo === "voltar" ? atual : para);
            if (d.venceu && passador && dificil(o)) d.folga += OU.folga * Math.max(0, passador.at[A.exc] - 25) / 25; // deu certo: mais folga
            if (d.venceu) { passoGrade(o, d); if (naFaixa5) eg.toquesArea++; }
            if (naFaixa5) {
              if (!d.pivo || !atk.emCampo.includes(d.pivo)) { if (trilha.length) evento(1 - i, "posse", comTrilha(`${tm(1 - i)} fica com a bola ${ondeDe(para)}.`)); return; }
              // ganhou: a jogada segue, e quem recebeu escolhe entre finalizar, tocar, conduzir, ir ao fundo ou voltar (ações da área, dono 01/11). Só o passo perdido vira chute forçado
              if (d.venceu) entrada = d;
            }
            if (naFaixa5 && !d.venceu) {
              if (lado !== "C" && rng.chance(CONFIG.escanteioDuelo)) { recebe(d.pivo); evento(1 - i, "canto", comTrilha(`${d.marcador ? nm(d.marcador) : tm(1 - i)} corta ${nm(d.pivo)} e cede o escanteio.`)); return bolaParada(i, "escanteio", lado); }
              if (!rng.chance(CONFIG.chuteForcado * ((CONFIG.finalizar[atk.instr.finalizar] || {}).forcado || 1))) return perda(para);
              const chance = criarChance(rng, atk, def, lado, d.pivo, { forcado: true, contra, superados, zona: para, buracos, marcacao: defesaNo(o.i) });
              const z = fimDaChance(chance); if (!z) return; seguir(z); continue;
            }
            // o que o passo ganho deixa para o seguinte: impulso (embalo, de frente, atrair a pressão) e o arrasto do cobridor
            const fz = faixaDe(para) + 1, cz = colunaDe(para);
            imp = proximoImpulso({ folga: d.folga, tipo: o.tipo, de: atual, temVizinho: fz <= 5 && [cz - 1, cz + 1].some(c => c >= 0 && c <= 4 && PESO[5 * fz - 5 + c] >= G.presenca), pressaoAdv: P, mentalidadeAdv: def.instr.mentalidade, V: G });
            if (o.goleiro) imp = { ...imp, logit: Math.max(imp.logit, G.goleiro.superioridade * P) };
            if (era2 || o.espaco) imp = { ...imp, logit: Math.max(imp.logit, G.impulso.deFrente), prende: false, deFrente: true }; // o terceiro homem e quem chega no espaço recebem de frente
            else if (o.recuou && d.folga < G.impulso.giro) imp = { ...imp, logit: 0, prende: true, deFrente: false }; // o 9 que recuou recebe de costas (gira só com folga)
            // o pivô: quem recebeu de costas nas faixas 4–5 segura com Força e Domínio, e a escora dele vale como a volta do terceiro homem
            const segura = imp.prende && faixaDe(para) >= 4 && d.pivo && !(th === 1 && o.tipo === "voltar") ? PV.peso * Math.max(0, (media(d.pivo.at[A.for], d.pivo.at[A.dom]) - 25) / 25) : 0;
            const dobra = seg && chega ? 1 + PV.mov * (chega.at[A.mov] - 25) / 25 : 1; seg = segura;
            th = th === 1 && o.tipo === "voltar" ? 2 : segura > 0 || (subiu && d.folga < T3.apertado) ? 1 : 0;
            if (th === 1) parA = passador;
            if (th === 2) thBonus = fatorTerceiro * dobra * (colunaDe(para) !== colunaDe(atual) ? T3.diagonal : 1);
            const ar = arrasto({ zona: para, folga: d.folga, V: G });
            if (ar && ar.profundidade) buracos.profundidade *= ar.profundidade;
            if (ar && ar.zonaFraca) { fraca = ar; kFraca = ZONAS_GRADE.indexOf(ar.zonaFraca); }
            // atrair conduzindo: o marcador foi em quem leva a bola e deixou o companheiro do lado mais livre
            if (o.conduzir && !fraca && portador) { const x = vizinhoLivre(o.i); if (x >= 0) { fraca = { fator: Math.max(0.5, 1 - AC.fator * atracao(o.i) * (1 + AC.drible * (portador.at[A.dri] - 25) / 25)) }; kFraca = x; } }
            atual = para; ka = o.i;
            dif = difDe(atual);
          }
        } finally {
          eg.passosPorAtaque.push(certos);
          if (certos >= 10) eg.posses10++;
          if (e.gols > gols0) eg.passosNoGol.push(certos);
          if (reg) reg.push([i, "fim", e.xg - xg0, e.finalizacoes - fin0, min]);
        }
      }
      soltarCartoes();
      if (!contra && ultimoNarrado === i && !rodou) trilha.push(Object.assign([RETOMA[seq % RETOMA.length](tm(i))], { fechada: true }));
      atacante = i;
      ultimoAtaque = i; if (!contra) rodou = false;
      if (contra) inicio = contra.zona || "M"; // na grade, a zona da roubada (contraInicio: linha antiga da perda + faixa do começo)
      if (contra && contra.zona && e.grade) e.grade.contraInicio[contra.origem + contra.zona[0]] = (e.grade.contraInicio[contra.origem + contra.zona[0]] || 0) + 1;
      if (CONFIG.grade) return atacarNaGrade();
      let lado = escolherLado(rng, atk, dz, inicio);
      let d0 = null, levado = 0; // levado: embalo que o duelo do meio deixa para o do ataque
      if (inicio === "D") { d0 = duelo(i, "D" + lado); if (!d0.venceu) return d0.recomeca ? recomecar("D" + lado, d0) : perdaDePosse(i, "D" + lado, d0); passo(i, "D" + lado, d0); }
      if (inicio !== "A") {
        if (inicio === "D") lado = escolherLado(rng, atk, dz, "M", lado);
        const d1 = duelo(i, "M" + lado, bonus + (d0 ? embalo(d0) : 0), contra);
        if (!d1.venceu && d1.recomeca) return recomecar("M" + lado, d1);
        if (!d1.venceu) { roubada = embaloDaDefesa(d1); roubadaFacil = -d1.folga >= CONFIG.embalo.narrar; if (perdaDePosse(i, "M" + lado, d1)) perdeu("M" + lado); return; }
        levado = embalo(d1);
        passo(i, "M" + lado, d1);
        lado = escolherLado(rng, atk, dz, "A", lado);
      }
      e.corredor[lado]++;
      const d = duelo(i, "A" + lado, bonus + levado, contra);
      if (d.recomeca && !d.pivo) return recomecar("A" + lado, d); // lesão no duelo do ataque: o time recomeça dali
      if (d.parada) {
        const penal = lado === "C" && rng.chance(CONFIG.penalti); // decidido aqui (era dentro de bolaParada), para o texto da falta já dizer se foi pênalti
        if (d.pivo && d.marcador) { recebe(d.pivo); evento(i, "falta", comTrilha(penal ? `Pênalti! ${nm(d.marcador)} derruba ${nm(d.pivo)} na área.` : `Falta de ${nm(d.marcador)} em ${nm(d.pivo)} ${ONDE.A(lado)}.`)); }
        else if (penal) evento(i, "falta", "A falta foi dentro da área: pênalti!"); // quem sofreu se machucou (a falta já foi narrada na lesão)
        return bolaParada(i, "falta", lado, penal);
      }
      if (!d.pivo || !atk.emCampo.includes(d.pivo)) { if (trilha.length) evento(1 - i, "posse", comTrilha(`${tm(1 - i)} fica com a bola ${ONDE.A(lado)}.`)); return; }
      const forcado = !d.venceu;
      if (forcado && lado !== "C" && rng.chance(CONFIG.escanteioDuelo)) { recebe(d.pivo); evento(1 - i, "canto", comTrilha(`${d.marcador ? nm(d.marcador) : tm(1 - i)} corta ${nm(d.pivo)} e cede o escanteio.`)); return bolaParada(i, "escanteio", lado); }
      if (forcado && !rng.chance(CONFIG.chuteForcado * ((CONFIG.finalizar[atk.instr.finalizar] || {}).forcado || 1))) { roubada = embaloDaDefesa(d); roubadaFacil = -d.folga >= CONFIG.embalo.narrar; if (perdaDePosse(i, "A" + lado, d)) perdeu("A" + lado); return; }
      const chance = criarChance(rng, atk, def, lado, d.pivo, { forcado, contra, superados });
      // duelo do ataque vencido com folga: a finalização sai em melhor condição
      if (!forcado && chance && chance.xg) chance.xg = limitar(chance.xg * (1 + CONFIG.embalo.chance * embalo(d) / CONFIG.embalo.teto), 0.01, CONFIG.xgMaximo);
      // flanco aberto: a chance pelo lado vale mais quando quem ataca tem gente e qualidade na ponta, contra a defesa daquele lado
      if (lado !== "C" && chance && chance.xg) { const F = CONFIG.flancoAberto, r = atk.atk["A" + lado] / (dz["A" + lado] + CONFIG.zonaVazia); chance.xg = limitar(chance.xg * limitar(Math.pow(r / F.referencia, F.expoente), F.min, F.max), 0.01, CONFIG.xgMaximo); }
      finalizar(i, chance);
    }

    // cera: vale enquanto o time estiver ganhando; o rng só é usado com ela ligada, para não mudar a reprise dos jogos sem cera
    const naCera = [false, false];
    let minutosDeCera = 0;
    function cera() {
      const g = gols(), C = CONFIG.cera;
      for (const i of [0, 1]) {
        const agora = !!times[i].instr.cera && g[i] > g[1 - i];
        if (agora && !naCera[i]) evento(i, "ordem", `${tm(i)} passa a fazer cera.`);
        naCera[i] = agora;
        if (!agora || !rng.chance(C.amarelo)) continue;
        const jog = sortearPeso(rng, times[i].emCampo, x => (x.pos === "GK" ? C.pesoGoleiro : 1) * (x.amarelos ? CONFIG.cuidadoComAmarelo : 1));
        if (!jog) continue;
        jog.amarelos++; jogadores[jog.j.id].amarelos++; estat[i].amarelos++;
        if (jog.amarelos >= 2) expulsar(i, jog, `Segundo amarelo para ${nm(jog)} por retardar o reinício: está expulso!`);
        else cartao(i, "amarelo", `Cartão amarelo para ${nm(jog)} por retardar o reinício.`);
        soltarCartoes();
      }
      if (naCera[0] || naCera[1]) minutosDeCera++;
    }

    const minuto = () => {
      ordensESubstituicoes(0); ordensESubstituicoes(1); cera();
      for (const t of times) for (const jog of t.emCampo) {
        const gasto = CONFIG.gastoEnergia * (1 - (jog.j.at[A.res] - 25) / 100) * (1 + CONFIG.pressaoGasto * t.instr.pressao) * (1 + 0.04 * Math.abs(t.instr.mentalidade)) * (jog.pos === "GK" ? CONFIG.gastoGoleiro : gastoDoPapel(jog.pos, jog.papel)) * calor
          * (CONFIG.regrasT1 && t.instr.aoPerder === "pressionar" ? 1 + CONFIG.transicao.pressionar.gasto : 1);
        jog.energia = Math.max(0, jog.energia - gasto);
      }
      const ritmo = CONFIG.ataquesPorMinuto * (1 + times.reduce((s, t) => s + t.instr.mentalidade * (t.instr.mentalidade < 0 ? CONFIG.ritmoPorRetranca : CONFIG.ritmoPorMentalidade), 0)) * (naCera[0] || naCera[1] ? CONFIG.cera.ritmo : 1);
      const n = (rng.chance(Math.min(1, ritmo)) ? 1 : 0) + (rng.chance(Math.max(0, ritmo - 1)) ? 1 : 0);
      for (let k = 0; k <= n; k++) {
        if (sujo || (k === 0 && min % CONFIG.recalcularACada === 1)) {
          const g = gols();
          recalcular(times[0], g[0] - g[1]); recalcular(times[1], g[1] - g[0]);
          defesas = [defesaDoCorredor(times[0], times[1]), defesaDoCorredor(times[1], times[0])];
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
          else if (proximo && !reinicio(min)) { i = proximo.time; zona = proximo.zona; }
          else if (cadeia === null || reinicio(min)) i = rng.chance(posseCasa) ? 0 : 1;
          else {
            const p = cadeia === 0 ? posseCasa : 1 - posseCasa;
            i = rng.chance((1 - p) / Math.max(p, 1 - p)) ? 1 - cadeia : cadeia;
          }
          cadeia = i; // o contra-ataque é um ataque a mais de quem recuperou a bola: não conta como a vez dele na cadeia
          if (zona === null) zona = bola && bola.time === i && !reinicio(min) ? bola.zona : "D";
          proximo = null;
          atacar(i, false, zona);
        }
      }
      somaPosse += posseCasa; jogados++;
    };
    const jogar = (de, ate) => { for (min = de; min <= ate; min++) minuto(); };
    // acréscimos: proporcionais às faltas do tempo e 30 s por substituição, gol e lesão; jogados com o relógio parado no 45 (ou 90)
    const acrescimos = [], antes = { faltas: 0, subs: 0, gols: 0, lesoes: 0, cera: 0 };
    const acrescimo = fim => {
      min = fim; // o for de jogar() sai com min um à frente
      const C = CONFIG, agora = { faltas: estat[0].faltas + estat[1].faltas, subs: estat[0].substituicoes + estat[1].substituicoes, gols: estat[0].gols + estat[1].gols, lesoes: lesoes.length, cera: minutosDeCera };
      const d = k => agora[k] - antes[k];
      const a = Math.max(1, Math.ceil(C.acrescimoPorFalta * d("faltas") + C.acrescimoPorSubstituicao * d("subs") + C.acrescimoPorGol * d("gols") + C.acrescimoPorLesao * d("lesoes") + C.cera.acrescimo * d("cera") - 1e-9));
      Object.assign(antes, agora); acrescimos.push(a);
      soltarCartoes(); evento(0, "acrescimo", `A arbitragem dá ${a} ${a > 1 ? "minutos" : "minuto"} de acréscimo.`);
      for (ac = 1; ac <= a; ac++) minuto();
      ac = 0;
    };
    jogar(1, 45); acrescimo(45);
    jogar(46, 90); acrescimo(90);
    let duracao = 90;
    if (opcoes.prorrogacao && gols()[0] === gols()[1]) {
      soltarCartoes(); min = 91; saida = null; proximo = null;
      evento(0, "prorrogacao", "Fim do tempo normal com tudo igual. Vamos à prorrogação: mais 30 minutos.");
      jogar(91, 120); duracao = 120;
    }
    min = duracao;
    // Disputa de pênaltis, se o mata-mata segue empatado depois da prorrogação: cinco cobranças alternadas, parando quando um time não alcança
    // mais o outro, e depois uma para cada lado até desempatar. Batem os que terminaram em campo: primeiro os cobradores de pênalti da tática,
    // depois os de melhor finalização e o goleiro por último; acabada a fila, ela recomeça. Cada cobrança é um pênalti do jogo (quem bate
    // contra o goleiro), mas fica fora das estatísticas, do placar e das notas.
    let penaltis = null;
    if (opcoes.prorrogacao && gols()[0] === gols()[1]) {
      soltarCartoes();
      const filas = times.map(t => {
        const primeiros = (t.instr.cobradores.penalti || []).map(id => t.emCampo.find(x => x.j.id === id)).filter(Boolean);
        return [...primeiros, ...t.emCampo.filter(x => !primeiros.includes(x)).sort((a, b) => (a.pos === "GK") - (b.pos === "GK") || b.at[A.fin] - a.at[A.fin])];
      });
      // com um a menos (expulsão ou lesão sem substituição), o outro time tira da fila os piores batedores de linha até igualar, como na regra
      const iguais = Math.min(filas[0].length, filas[1].length);
      filas.forEach(f => { for (let k = f.length - 1; f.length > iguais && k >= 0; k--) if (f[k].pos !== "GK") f.splice(k, 1); });
      const placar = [0, 0], batidas = [0, 0], cobrancas = [];
      const FIM = { gol: "GOL!", fora: "para fora!", trave: "na trave!" };
      const bater = i => {
        const quem = filas[i][batidas[i]++ % filas[i].length], gk = times[1 - i].goleiro;
        const { resultado } = chutar({ tipo: "penalti", xg: CONFIG.xgBase.penalti, chute: quem.at[A.fin], defesa: gk ? gk.at[A.um] : 5 }, gk);
        if (resultado === "gol") placar[i]++;
        const fim = FIM[resultado] || (gk ? `${nm(gk)} defende!` : "a bola é defendida!");
        cobrancas.push({ time: i, id: quem.j.id, quem: quem.j.nome, goleiro: gk ? gk.j.nome : null, resultado, placar: placar.slice(), texto: `${nm(quem)} cobra: ${fim} Pênaltis: ${placar[0]} x ${placar[1]}.` });
      };
      for (let k = 0; k < 10; k++) { bater(k % 2); if (placar[0] > placar[1] + 5 - batidas[1] || placar[1] > placar[0] + 5 - batidas[0]) break; }
      while (placar[0] === placar[1]) { bater(0); bater(1); }
      penaltis = { placar, cobrancas };
    }
    times.forEach(t => t.emCampo.forEach(jog => { jogadores[jog.j.id].energia = Math.round(jog.energia); if (jog.mancha) jogadores[jog.j.id].mancha = jog.mancha; }));
    estat[0].posse = Math.round(somaPosse / jogados * 100); estat[1].posse = 100 - estat[0].posse;
    soltarCartoes();
    const narracao = [...lances, ...eventos].sort((a, b) => a.n - b.n);
    // segundo de cada lance dentro do seu minuto, para a transmissão soltar um por vez em vez de todos no minuto cheio
    const porMinuto = {};
    narracao.forEach(l => (porMinuto[l.min + "+" + (l.ac || 0)] = porMinuto[l.min + "+" + (l.ac || 0)] || []).push(l));
    Object.values(porMinuto).forEach(g => g.forEach((l, k) => { l.s = Math.floor((k + 0.5) / g.length * 60); }));
    // o que aconteceu com cada substituição e ordem planejada (só para as telas do próprio dirigente: não vai para o relatório público)
    const motivoSub = (t, s) => t.subs >= CONFIG.maxSubstituicoes ? `o time já tinha feito ${CONFIG.maxSubstituicoes} trocas` : !t.banco.some(j => j.id === s.entra) ? "o reserva já tinha entrado" : "a condição não chegou a valer";
    const ordens = times.map(t => ({
      subs: t.instr.substituicoes.map((s, k) => ({ ...s, saiNome: t.nomes[s.sai] || "?", entraNome: t.nomes[s.entra] || "?", ...(t.cumpridas["s" + k] || { motivo: motivoSub(t, s) }) })),
      ordens: t.instr.ordens.map((o, k) => ({ ...o, ...(t.cumpridas["o" + k] || { motivo: "a condição não chegou a valer" }) })),
    }));
    return { duracao, acrescimos, placar: gols(), xg: [estat[0].xg, estat[1].xg], estat, lances, eventos, narracao, jogadores, lesoes, ordens, penaltis };
  }
  return { CONFIG, INSTRUCOES_PADRAO, ZONAS, espelho, COBERTURA, prepararTime, setorDaPosicao, entrosamento, defesaPorCorredor, desenhoDoTime, defesaNaTransicao, avaliarZonas, defesaVistaNaGrade, simularPartida };
})();

const __bot = (() => {
  // Tática de bot: vale para clubes sem dono e para dirigentes há 21 dias sem acessar.
  // O bot joga certo, mas sem ler o adversário: escolhe a formação que melhor aproveita o elenco e instruções neutras.
  const { IDX, notaNaPosicao, notaComPe } = __modelo;
  const { fatorDeMomento } = __saude;
  // nota na posição já com o pé, a forma, a moral e a experiência do jogador: é com ela que o bot (e o botão de escalar os melhores) escolhe
  const notaDoMomento = (j, pos) => notaComPe(j, pos) * fatorDeMomento(j);
  const { FORMACOES, escalar, TAMANHO_DO_BANCO } = __escalacao;
  const { avaliarZonas, setorDaPosicao } = __motor;
  const { papeisDaPosicao, notaNoPapel, PAPEL_PADRAO } = __papeis;
  const FORMACOES_BOT = ["4-4-2", "4-3-3 com pontas", "4-2-3-1", "3-5-2 com alas", "4-5-1", "4-1-4-1", "4-4-1-1", "4-3-2-1 (árvore de Natal)", "5-4-1", "5-3-2", "4-4-2 losango"]; // todas menos o 4-3-3 do Dugout
  // Jeito de jogar do bot conforme o perfil do clube. É o que o dirigente pode ler no adversário para escolher a resposta.
  const ESTILO_DO_PERFIL = {
    equilibrado: { nome: "sem estilo marcado", instrucoes: {} },
    tecnico: { nome: "passe curto e posse de bola", instrucoes: { passe: "curto" } },
    fisico: { nome: "pressão alta", instrucoes: { pressao: 2 } },
    veloz: { nome: "contra-ataque", instrucoes: { contraAtaque: true } },
    tatico: { nome: "linha de impedimento", instrucoes: { impedimento: true } },
  };
  const FAVORITO = 2; // diferença de nota média a partir da qual o bot se considera favorito ou azarão
  const A = IDX;

  // Papéis do bot: em cada vaga com papéis, o que o jogador faz melhor, se render ao menos GANHO_DO_PAPEL a mais que o padrão (senão fica no padrão,
  // gravado como null). Nunca dois Apoiadores nos laterais com menos de dois volantes: as duas costas ficam abertas; o de menor ganho volta ao padrão.
  const GANHO_DO_PAPEL = 2;
  function papeisDoBot(escalacao) {
    const esc = escalacao.map(x => {
      const lista = papeisDaPosicao(x.pos);
      if (!lista.length) return { ...x, papel: null };
      const padrao = notaNoPapel(x.j, x.pos, PAPEL_PADRAO[x.pos]);
      const melhor = lista.reduce((m, p) => { const n = notaNoPapel(x.j, x.pos, p); return n > m.n ? { p, n } : m; }, { p: PAPEL_PADRAO[x.pos], n: padrao });
      return { ...x, papel: melhor.p !== PAPEL_PADRAO[x.pos] && melhor.n >= padrao + GANHO_DO_PAPEL ? melhor.p : null, ganho: melhor.n - padrao };
    });
    const apoiadores = esc.filter(x => x.papel === "apoiador" && POSICOES_LATERAL.includes(x.pos)).sort((a, b) => a.ganho - b.ganho);
    if (apoiadores.length >= 2 && esc.filter(x => x.pos === "DMC").length < 2) apoiadores[0].papel = null;
    return esc.map(({ ganho, ...x }) => x);
  }
  const POSICOES_LATERAL = ["DR", "DL"];

  const mediaNotas = escalacao => escalacao.reduce((s, x) => s + notaDoMomento(x.j, x.pos), 0) / escalacao.length;
  const melhores = (lista, nota, n) => lista.slice().sort((a, b) => nota(b) - nota(a)).slice(0, n).map(x => x.j.id);

  // elenco: jogadores disponíveis (sem lesionados e suspensos). forcaAdversario: nota média do onze do adversário, se conhecida.
  // chuva: 0, 1 ou 2 (previsão do jogo). Com chuva forte, o bot de passe curto joga com passe misto.
  function taticaBot(elenco, { mandante = false, forcaAdversario = null, perfil = null, chuva = 0 } = {}) {
    let estilo = (ESTILO_DO_PERFIL[perfil] || ESTILO_DO_PERFIL.equilibrado).instrucoes;
    if (chuva >= 2 && estilo.passe === "curto") estilo = {};
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

    // banco: um goleiro, os melhores reservas de cada setor (um para cada 4 titulares do setor, arredondando para cima)
    // e os melhores que sobraram, até completar o banco
    const fora = elenco.filter(j => !escalacao.some(x => x.j === j)).sort((a, b) => notaDoMomento(b, b.pos) - notaDoMomento(a, a.pos));
    const linhaFora = fora.filter(j => j.pos !== "GK");
    const porSetor = ["D", "M", "A"].flatMap(s => {
      const titulares = escalacao.filter(x => x.pos !== "GK" && setorDaPosicao(x.pos) === s).length;
      return linhaFora.filter(j => setorDaPosicao(j.pos) === s).slice(0, Math.ceil(titulares / 4));
    });
    const banco = [...fora.filter(j => j.pos === "GK").slice(0, 1), ...porSetor, ...linhaFora.filter(j => !porSetor.includes(j)).slice(0, TAMANHO_DO_BANCO - 1 - porSetor.length)];

    // mentalidade: normal; um nível acima se é favorito, um abaixo se é azarão (o mando já pesa no motor)
    const dif = forcaAdversario == null ? 0 : forca - forcaAdversario;
    const mentalidade = dif <= -FAVORITO ? -1 : dif >= FAVORITO ? 1 : 0;

    // lado: o próprio corredor mais forte, se houver um claramente melhor
    const { atk } = avaliarZonas(escalacao);
    const lado = atk.AE > atk.AD * 1.25 ? "E" : atk.AD > atk.AE * 1.25 ? "D" : "misto";

    const linha = escalacao.filter(x => x.pos !== "GK");
    // até três trocas, aos 60, 70 e 80: saem os de menor Resistência que tenham reserva à altura para a posição.
    // "À altura" compara a qualidade sem forma e moral: o reserva que não joga perde moral e, pela nota do momento, nunca entraria.
    // Primeiro as de reserva com 85% da nota (entram sempre); depois, com 75%, só se o titular estiver cansado
    // (energia < 55 rende ~0,82 no motor e cai até ~0,7).
    const livres = banco.filter(j => j.pos !== "GK"), substituicoes = [];
    const porResistencia = linha.slice().sort((a, b) => a.j.at[A.res] - b.j.at[A.res]);
    for (const [minimo, cond] of [[0.85, "sempre"], [0.75, "cansado"]]) for (const x of porResistencia) {
      if (substituicoes.length === 3 || !livres.length) break;
      if (substituicoes.some(s => s.sai === x.j.id)) continue;
      livres.sort((a, b) => notaComPe(b, x.pos) - notaComPe(a, x.pos));
      if (notaComPe(livres[0], x.pos) < minimo * notaComPe(x.j, x.pos)) continue; // sem reserva à altura para a posição
      substituicoes.push({ min: 60 + 10 * substituicoes.length, sai: x.j.id, entra: livres.shift().id, cond });
    }

    const porInfluencia = melhores(escalacao, x => x.j.at[A.inf], 2);
    const meias = linha.filter(x => ["MC", "AMC", "DMC", "AMR", "AML", "MR", "ML"].includes(x.pos));
    const atacantes = linha.filter(x => ["SC", "FC"].includes(x.pos));
    const instrucoes = {
      mentalidade, agressividade: 0, pressao: 0, passe: "misto", lado, contraAtaque: false, impedimento: false, ...estilo,
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
        { min: 0, cond: "umAMenos", muda: { mentalidade: Math.max(-2, mentalidade - 1) } }, // com 10, recuar uma casa: mesmos pontos (sim_mental, com posseNumerica 2), menos gols sofridos
        { min: 70, cond: "perdendo", muda: { mentalidade: Math.min(2, mentalidade + 1) } },
        { min: 80, cond: "ganhando", muda: { mentalidade: Math.max(-2, mentalidade - 1), cera: true } }, // a cera só vale enquanto estiver ganhando
      ],
    };
    return { formacao, escalacao: papeisDoBot(escalacao), banco, instrucoes, forca };
  }
  return { FORMACOES_BOT, ESTILO_DO_PERFIL, papeisDoBot, taticaBot };
})();

const __relatorio = (() => {
  // Relatório da partida: resultado esperado pelo xG, notas dos jogadores, mapa de zonas e comentário do analista.
  const { ehGrade, nomeDaZona, espelhoGrade, faixaDe, corredorDe, CORREDORES } = __grade;
  const { POSICOES } = __modelo;
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
        if (l.resultado === "gol" || l.resultado === "defesa") g.xgContra += l.xgGk ?? l.xg;
      }
    }
    return Object.entries(partida.jogadores).map(([id, j]) => {
      const x = de(id), minutos = (j.saiu === null ? partida.duracao || 90 : j.saiu) - j.entrou;
      let nota = 6;
      if (j.pos === "GK") nota += 0.3 * x.defesas - 0.4 * x.sofridos + 0.6 * (x.xgContra - x.sofridos);
      else nota += limitar(0.4 * (j.duelosGanhos - j.duelosEsperados), -2, 2) + 1.1 * j.gols - 0.8 * (j.golsContra || 0) + 0.6 * x.assistencias + 0.5 * (j.xg - j.gols * 0.5) - 0.08 * j.faltas;
      nota -= 0.3 * Math.min(1, j.amarelos) + (j.vermelho ? 1.5 : 0);
      return { id, ...j, ...x, minutos, nota: limitar(Math.round(nota * 10) / 10, 1, 10) };
    });
  }

  const NOME_ZONA = { DE: "defesa esquerda", DC: "centro da defesa", DD: "defesa direita", ME: "meio esquerdo", MC: "centro do meio", MD: "meio direito", AE: "ataque pela esquerda", AC: "ataque pelo centro", AD: "ataque pela direita" };
  const pc = v => Math.round(v * 100) + "%";
  const f2 = v => v.toFixed(2).replace(".", ",");

  // Analista num jogo da grade: o melhor caminho e por onde o adversário passou, pela zona das faixas 4–5 com duelos suficientes
  // (ou, sem nenhuma, pelo corredor nas faixas 3–5); o meio-campo pelas faixas 2–3.
  const por = n => n.replace(/^a /, "pela ").replace(/^o /, "pelo ");
  const NOME_CORREDOR = { E: "pelo lado esquerdo", e: "pelo meio-espaço esquerdo", C: "pelo centro", d: "pelo meio-espaço direito", D: "pelo lado direito" };
  const NOSSO_LADO = { E: " (o nosso lado esquerdo)", e: " (o nosso meio-espaço esquerdo)", d: " (o nosso meio-espaço direito)", D: " (o nosso lado direito)", C: "" };
  function melhorCaminho(zonas) {
    const soma = zs => zs.reduce((s, z) => [s[0] + zonas[z][0], s[1] + zonas[z][1]], [0, 0]);
    const taxa = ([g, p]) => g + p >= 6 ? g / (g + p) : null, melhor = l => l.filter(x => x[1] !== null).sort((a, b) => b[1] - a[1])[0];
    const zona = melhor(Object.keys(zonas).filter(z => faixaDe(z) >= 4).map(z => [z, taxa(zonas[z])]));
    if (zona) return { nome: por(nomeDaZona(zona[0])), corredor: corredorDe(zona[0]), taxa: zona[1] };
    const c = melhor(CORREDORES.map(c => [c, taxa(soma([3, 4, 5].map(f => f + c)))]));
    return c ? { nome: NOME_CORREDOR[c[0]], corredor: c[0], taxa: c[1] } : null;
  }
  function zonasDaGrade(eu, ele) {
    const frases = [], nosso = melhorCaminho(eu.zonas), deles = melhorCaminho(ele.zonas);
    if (nosso) frases.push(`Nosso melhor caminho foi ${nosso.nome}: ${pc(nosso.taxa)} dos duelos vencidos.`);
    // o lado deles é o oposto do nosso (o lado esquerdo do ataque deles chega na nossa direita)
    if (deles && deles.taxa > 0.5) frases.push(`O adversário passou mais ${deles.nome}${NOSSO_LADO[CORREDORES[4 - CORREDORES.indexOf(deles.corredor)]]}: venceu ${pc(deles.taxa)} dos duelos ali.`);
    const meio = Object.keys(eu.zonas).filter(z => faixaDe(z) === 2 || faixaDe(z) === 3).reduce((s, z) => [s[0] + eu.zonas[z][0], s[1] + eu.zonas[z][1]], [0, 0]);
    if (meio[0] + meio[1] >= 10) frases.push(`No meio-campo vencemos ${pc(meio[0] / (meio[0] + meio[1]))} dos duelos com a bola e tivemos ${eu.posse}% de posse.`);
    return frases;
  }

  // Mapa do jogador num jogo da grade (participação, não posição: no motor ele fica na mancha do papel), pelos passos do registro
  // do motor ([time, de, para, tipo, passador, receptor, venceu, conduziu, espaço, marcador]): com = o time atacando (onde ele passou,
  // pela zona de saída, e recebeu ou conduziu, pela de chegada); sem = o time defendendo (duelos como marcador, na zona dele, o espelho);
  // lado = passos do adversário nos dois corredores do lado dele (null para quem joga por dentro). Tudo nas coordenadas do time dele.
  function mapaDoJogador(passos, id, time, pos) {
    const com = {}, sem = {}, mais = (m, z) => { m[z] = (m[z] || 0) + 1; }, ld = POSICOES[pos] && POSICOES[pos].lado;
    const doLado = ld === "E" ? "Ee" : ld === "D" ? "Dd" : null;
    let lado = doLado ? 0 : null;
    for (const x of passos) {
      if (x[1] === "fim") continue;
      if (x[0] === time) { if (x[4] === id) mais(com, x[1]); if (x[5] === id) mais(com, x[2]); continue; }
      const z = espelhoGrade(x[2]);
      if (x[9] === id) mais(sem, z);
      if (doLado && doLado.includes(z[1])) lado++;
    }
    return { com, sem, lado };
  }

  // Comentário do analista para o time i. nivel 1 a 3: quanto melhor o analista, mais ele enxerga.
  function analise(partida, esperado, jogadores, i, nivel) {
    const eu = partida.estat[i], ele = partida.estat[1 - i], frases = [];
    const saldo = eu.gols - ele.gols, difXg = eu.xg - ele.xg;
    // 1. o resultado foi justo?
    if (saldo < 0 && difXg > 0.4) frases.push(`Resultado injusto: criamos ${f2(eu.xg)} de xG contra ${f2(ele.xg)} e perdemos. Com as mesmas chances, venceríamos ${pc(i === 0 ? esperado.vitoria : esperado.derrota)} das vezes.`);
    else if (saldo > 0 && difXg < -0.4) frases.push(`Vencemos, mas o adversário criou mais: ${f2(ele.xg)} de xG contra ${f2(eu.xg)}. Não dá para contar com isso sempre.`);
    else if (saldo === 0 && Math.abs(difXg) > 0.6) frases.push(difXg > 0 ? `O empate ficou barato para o adversário: tivemos ${f2(eu.xg)} de xG contra ${f2(ele.xg)}.` : `O empate foi bom negócio: o adversário teve ${f2(ele.xg)} de xG contra ${f2(eu.xg)}.`);
    else if (saldo >= 2 && difXg < 0.7) frases.push(`O placar ficou mais largo do que o jogo: ${f2(eu.xg)} de xG nosso contra ${f2(ele.xg)} do adversário. A diferença esteve na pontaria, não nas chances.`);
    else if (saldo <= -2 && difXg > -0.7) frases.push(`O placar foi mais pesado do que o jogo: criamos ${f2(eu.xg)} de xG contra ${f2(ele.xg)} do adversário. A diferença esteve na pontaria, não nas chances.`);
    else if (saldo !== 0 && Math.abs(difXg) < 0.3) frases.push(`Jogo parelho decidido no detalhe: ${f2(eu.xg)} de xG nosso contra ${f2(ele.xg)} do adversário.`);
    else frases.push(`O placar reflete o jogo: ${f2(eu.xg)} de xG nosso contra ${f2(ele.xg)} do adversário.`);
    // 2. pontaria
    if (eu.gols - eu.xg <= -1) frases.push(`Faltou pontaria: ${eu.finalizacoes} finalizações e ${eu.gols} ${eu.gols === 1 ? "gol" : "gols"} para ${f2(eu.xg)} de xG.`);
    else if (eu.gols - eu.xg >= 1) frases.push(`Aproveitamento acima do normal: ${eu.gols} gols com ${f2(eu.xg)} de xG.`);
    if (nivel < 2) return frases;
    // 3. zonas: onde atacamos melhor e onde o adversário passou
    if (ehGrade(Object.keys(eu.zonas)[0])) frases.push(...zonasDaGrade(eu, ele));
    else {
      const taxa = (e, z) => { const [g, p] = e.zonas[z]; return g + p >= 6 ? g / (g + p) : null; };
      const ataque = ["AE", "AC", "AD"].map(z => [z, taxa(eu, z)]).filter(x => x[1] !== null).sort((a, b) => b[1] - a[1]);
      if (ataque.length) frases.push(`Nosso melhor caminho foi o ${NOME_ZONA[ataque[0][0]]}: ${pc(ataque[0][1])} dos duelos vencidos.`);
      const espelho = { AE: "DD", AC: "DC", AD: "DE" };
      const sofrido = ["AE", "AC", "AD"].map(z => [espelho[z], taxa(ele, z)]).filter(x => x[1] !== null).sort((a, b) => b[1] - a[1]);
      if (sofrido.length && sofrido[0][1] > 0.5) frases.push(`O adversário passou mais ${sofrido[0][0] === "DC" ? "pelo centro da nossa defesa" : "pela nossa " + NOME_ZONA[sofrido[0][0]]}: venceu ${pc(sofrido[0][1])} dos duelos ali.`);
      const meio = ["ME", "MC", "MD"].reduce((s, z) => { s[0] += eu.zonas[z][0]; s[1] += eu.zonas[z][1]; return s; }, [0, 0]);
      if (meio[0] + meio[1] >= 10) frases.push(`No meio-campo vencemos ${pc(meio[0] / (meio[0] + meio[1]))} dos duelos com a bola e tivemos ${eu.posse}% de posse.`);
    }
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

  // nivelAnalista: [nível do analista do mandante, do visitante], de 1 a 3. passos: o opcoes.registro do motor (só a grade o preenche):
  // com ele, cada jogador ganha o mapa (mapaDoJogador). Zonas: as que o jogo tiver (25 na grade, 9 nas 9 zonas); quem lê 9 usa paraNoveZonas.
  function montarRelatorio(partida, nivelAnalista = [3, 3], passos = null) {
    const esperado = resultadoEsperado(partida.lances), jogadores = notas(partida);
    if (passos && passos.length) for (const j of jogadores) if (j.pos !== "GK") j.mapa = mapaDoJogador(passos, j.id, j.time, j.pos);
    return {
      placar: partida.placar, xg: partida.xg, esperado,
      jogadores,
      melhor: jogadores.filter(j => j.minutos >= 30).sort((a, b) => b.nota - a.nota)[0] || null,
      zonas: partida.estat.map(e => Object.fromEntries(Object.keys(e.zonas).map(z => { const [g, p] = e.zonas[z]; return [z, { ganhos: g, total: g + p }]; }))),
      analise: [0, 1].map(i => analise(partida, esperado, jogadores, i, nivelAnalista[i])),
      estat: partida.estat, narracao: partida.narracao,
    };
  }
  return { resultadoEsperado, mapaDoJogador, montarRelatorio };
})();

const __rodada = (() => {
  // Calendário, cálculo de uma partida da liga e classificação.
  // Não depende do navegador nem do banco: recebe os dados e devolve o que deve ser gravado.
  const { criarRng } = __rng;
  const { notaNaPosicao, notaBruta, LISTA_POSICOES, PAISES, PE_FRACO_DESDE } = __modelo;
  const { prepararTime, simularPartida, CONFIG } = __motor;
  const { taticaBot } = __bot;
  const { notaDoMomento, TAMANHO_DO_BANCO } = __escalacao;
  const { montarRelatorio } = __relatorio;
  const { papelValido, PAPEIS_DESDE, PAPEL_PADRAO } = __papeis;
  const { momentoDepois, experienciaDe, experienciaDepois } = __saude;
  const AMARELOS_PARA_SUSPENSAO = 4; // o quarto amarelo acumulado suspende por um jogo (era o terceiro até a temporada 1; em teste na temporada 2)
  // A lesão sai do motor em dias; na liga ela vira jogos fora.
  const jogosFora = dias => dias <= 3 ? 1 : dias <= 10 ? 2 : dias <= 20 ? 3 : 4;
  const DIAS_PARA_BOT = 21; // dirigente sem acessar por tantos dias: o clube joga com a tática de bot
  // Time sem técnico na temporada 0: bot, ou dono que não entrou desde a virada. Contra o time de um dono ativo, os jogadores dele rendem `fator`
  // (perder para quem nem joga é chato, 30/10/2026); bot contra bot fica igual, e a liga de base não muda.
  // ponytail: data da virada fixa, só vale para a T0; para repetir em toda virada, gravar a hora da virada na liga
  const SEM_TECNICO = { temporada: 0, desde: "2026-10-27T00:00:00Z", fator: 0.8 };
  const semTecnico = (clube, temporada) => temporada === SEM_TECNICO.temporada && !clube.extra
    && (!clube.dono || !clube.ultimo_acesso || new Date(clube.ultimo_acesso) < new Date(SEM_TECNICO.desde));
  const rendeMenos = j => ({ ...j, at: j.at.map(a => a * SEM_TECNICO.fator) });

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
      if (new Set(dados.jog).size !== 11) return null;
      // titular lesionado ou suspenso é trocado pelo melhor disponível para a posição que não esteja escalado,
      // pela mesma nota do botão "Escalar os melhores" (com pé, forma, moral e experiência)
      // quem saiu do clube (vendido, aposentado) conta como indisponível, igual a lesionado ou suspenso
      const jog = dados.jog.slice(), fora = id => !porId[id] || porId[id].fora > 0;
      const livres = elenco.filter(j => !(j.fora > 0) && !jog.includes(j.id));
      for (let i = 0; i < 11; i++) {
        if (!fora(jog[i])) continue;
        const pos = dados.vagas[i], candidatos = livres.filter(j => (j.pos === "GK") === (pos === "GK"));
        if (!candidatos.length) return null;
        const melhor = candidatos.reduce((m, j) => notaDoMomento(j, pos) > notaDoMomento(m, pos) ? j : m);
        livres.splice(livres.indexOf(melhor), 1); jog[i] = melhor.id;
      }
      const emCampo = new Set(jog);
      const banco = [...new Set((dados.banco || []).filter(id => porId[id] && !emCampo.has(id) && !fora(id)))].slice(0, TAMANHO_DO_BANCO);
      // banco desfalcado (lesão, suspensão, saída ou titular que foi para o campo): completa com os melhores que sobraram,
      // garantindo um goleiro reserva se houver
      const sobra = elenco.filter(j => !(j.fora > 0) && !emCampo.has(j.id) && !banco.includes(j.id)).sort((a, b) => notaDoMomento(b, b.pos) - notaDoMomento(a, a.pos));
      if (banco.length < TAMANHO_DO_BANCO && !banco.some(id => porId[id].pos === "GK")) { const g = sobra.find(j => j.pos === "GK"); if (g) { banco.push(g.id); sobra.splice(sobra.indexOf(g), 1); } }
      for (const j of sobra) { if (banco.length >= TAMANHO_DO_BANCO) break; if (j.pos !== "GK") banco.push(j.id); }
      const noBanco = new Set(banco), I = dados.instr || {};
      const num = (v, min, max) => Math.max(min, Math.min(max, Math.round(+v) || 0));
      const um = (v, lista, padrao) => lista.includes(v) ? v : padrao;
      const titular = id => emCampo.has(id) ? id : null;
      const lista = (l, n) => (Array.isArray(l) ? l : []).filter(id => emCampo.has(id)).slice(0, n);
      const conv = v => v === "true" ? true : v === "false" ? false : isNaN(+v) ? v : +v;
      const condicoes = ["sempre", "ganhando", "empatando", "perdendo", "umAMenos", "umAMais", "cansado", "amarelo", "mal", "naoBem"];
      const instrucoes = {
        mentalidade: num(I.mentalidade, -2, 2), agressividade: num(I.agressividade, -2, 2), pressao: num(I.pressao, 0, 2),
        passe: um(I.passe, ["misto", "curto", "longo"], "misto"), lado: um(I.lado, ["misto", "E", "C", "D", "lados"], "misto"), finalizar: um(I.finalizar, ["misto", "longe", "area"], "misto"), cruzamento: um(I.cruzamento, ["misto", "alto", "rasteiro"], "misto"),
        contraAtaque: I.contraAtaque === true, impedimento: I.impedimento === true, cera: I.cera === true, aoPerder: um(I.aoPerder, ["misto", "pressionar", "recompor"], "misto"),
        capitao: titular(I.capitao), vice: titular(I.vice), armador: titular(I.armador), alvo: titular(I.alvo),
        cobradores: { escanteio: lista(I.cobradores && I.cobradores.escanteio, 3), falta: lista(I.cobradores && I.cobradores.falta, 3), penalti: lista(I.cobradores && I.cobradores.penalti, 5) },
        substituicoes: (dados.subs || []).filter(s => emCampo.has(s.sai) && noBanco.has(s.entra)).slice(0, CONFIG.maxSubstituicoes)
          .map(s => ({ min: num(s.min, 0, 89), sai: s.sai, entra: s.entra, cond: um(s.cond, condicoes, "sempre"), ...(LISTA_POSICOES.includes(s.pos) && s.pos !== "GK" ? { pos: s.pos } : {}) })), // pos: onde o substituto entra (sem ela, na posição de quem sai)
        ordens: (dados.ordens || []).slice(0, 30).map(o => { // sem limite na tela; o 30 só protege a função de uma tática adulterada
          const [k, v] = String(o.muda || "").split(":");
          if (!["mentalidade", "pressao", "contraAtaque", "passe", "finalizar", "cruzamento", "cera"].includes(k)) return null;
          return { min: num(o.min, 0, 89), cond: um(o.cond, condicoes.slice(0, 6), "sempre"), muda: { [k]: conv(v) } };
        }).filter(Boolean),
      };
      const papeis = Array.isArray(dados.papeis) ? dados.papeis : []; // papel de cada vaga (src/papeis.js); o que não vale na posição cai
      return { escalacao: dados.vagas.map((pos, i) => ({ j: porId[jog[i]], pos, papel: papelValido(pos, papeis[i]) ? papeis[i] : null })), banco: banco.map(id => porId[id]), instrucoes };
    } catch (e) { return null; }
  }

  // Adversário do amistoso: o dirigente joga com a escalação do último jogo oficial (observada: escalacaoObservada, pública desde o apito;
  // a tática salva é segredo), com banco e instruções automáticos. Bot, ou dirigente sem jogo, joga com a tática de bot (opcoes: as do taticaBot).
  function taticaDoAmistoso(elenco, observada, opcoes) {
    const t = observada && observada.vagas.length === 11 && taticaDoDirigente({ vagas: observada.vagas.map(v => v.pos), jog: observada.vagas.map(v => v.j.id) }, elenco);
    if (!t) return { ...taticaBot(elenco, opcoes), origem: "tática de bot" };
    return { ...t, forca: t.escalacao.reduce((s, x) => s + notaNaPosicao(x.j, x.pos), 0) / 11, origem: "escalação do último jogo" };
  }

  const forcaDoOnze = escalacao => escalacao.reduce((s, x) => s + notaNaPosicao(x.j, x.pos), 0) / escalacao.length;

  // Instante em que um minuto de jogo passa a ser visível, com 15 minutos de intervalo, na escala da transmissão.
  // acr: acréscimos dos dois tempos, que empurram o que vem depois; meio: minuto inteiro do lance (diz de que tempo ele é)
  function horaDoMinuto(inicio, min, minutosTransmissao, acr = [0, 0], meio = min) {
    // intervalo de 15 minutos; antes da prorrogação, mais 5 de pausa
    const reais = (min + (meio <= 45 ? 0 : meio <= 90 ? 15 + acr[0] : 20 + acr[0] + acr[1])) * minutosTransmissao / 105;
    return new Date(new Date(inicio).getTime() + reais * 60000);
  }

  // O que muda em cada jogador do elenco depois da partida: quem estava fora cumpre um jogo; vermelho suspende por um jogo;
  // o quarto amarelo acumulado suspende por um jogo; lesão deixa fora por alguns jogos. Devolve só quem mudou.
  // medico: { reducao, vagas } do clube, ou null. A lesão nova de quem pega uma vaga livre do departamento médico dura menos:
  // a skill do médico é o corte (skill 50, metade do tempo), com mínimo de 1 jogo. As vagas são dos que ainda estão lesionados.
  function situacaoDepois(elenco, p, medico = null) {
    let vagas = medico ? medico.vagas - elenco.filter(j => j.fora > 1 && j.motivo === "lesão").length : 0; // quem volta no próximo jogo já liberou a vaga
    const lesao = Object.fromEntries(p.lesoes.map(l => [l.id, l.dias])), mudancas = [];
    for (const j of elenco) {
      let fora = j.fora || 0, motivo = j.motivo || null, amarelos = j.amarelos || 0;
      if (fora > 0) { fora--; if (!fora) motivo = null; }
      const s = p.jogadores[j.id];
      if (s) {
        if (s.vermelho) { fora = 1; motivo = "suspensão"; }
        else if (s.amarelos) { amarelos++; if (amarelos >= AMARELOS_PARA_SUSPENSAO) { amarelos = 0; fora = 1; motivo = "suspensão"; } }
        if (lesao[j.id]) {
          let n = jogosFora(lesao[j.id]);
          if (medico && vagas > 0) { vagas--; n = Math.max(1, Math.round(n * (1 - medico.reducao))); }
          if (n >= fora) { fora = n; motivo = "lesão"; }
        }
      }
      if (fora !== (j.fora || 0) || amarelos !== (j.amarelos || 0) || motivo !== (j.motivo || null)) mudancas.push({ id: j.id, fora, motivo, amarelos });
    }
    return mudancas;
  }
  // Aplica as mudanças ao elenco em memória (para quando o mesmo clube tem mais de uma partida calculada em seguida).
  function aplicarSituacao(elenco, mudancas) {
    const porId = Object.fromEntries(elenco.map(j => [j.id, j]));
    for (const m of mudancas) if (porId[m.id]) Object.assign(porId[m.id], { fora: m.fora, motivo: m.motivo, amarelos: m.amarelos });
  }

  // lado: { clube: { id, nome, dono, ultimo_acesso }, elenco, tatica: dados salvos ou null, saude: saída de saudeDoClube (opcional) , pronta: { escalacao, banco, instrucoes } (opcional) }
  // Cada jogador do elenco pode trazer fora (jogos que ainda fica fora), motivo e amarelos.
  // Devolve as linhas de lances, o resultado a gravar e a situação nova dos jogadores que mudaram.
  const CLIMAS = [["Ensolarado", 24, 34], ["Céu limpo", 18, 28], ["Nublado", 16, 26], ["Chuva fraca", 14, 24], ["Chuva forte", 12, 22], ["Frio de doer", 4, 12], ["Calor forte", 32, 38]];
  // O clima sai do número da partida, para a previsão poder aparecer antes do jogo e ser a mesma no servidor e na tela.
  // chuva: 0, 1 (fraca) ou 2 (forte) e calor (calor forte): é o que o motor lê (CONFIG.chuva e CONFIG.calor em motor.js).
  // efeitoDoClima: a frase da previsão, ou "" quando o clima não mexe no jogo.
  function climaDaPartida(id) {
    const rng = criarRng((id >>> 0) * 7919 + 13), c = rng.pick(CLIMAS);
    return { nome: c[0], temp: rng.int(c[1], c[2]), chuva: c[0] === "Chuva forte" ? 2 : c[0] === "Chuva fraca" ? 1 : 0, calor: c[0] === "Calor forte" };
  }
  const efeitoDoClima = c => c.chuva > 1 ? "campo pesado: o passe curto sofre bastante, o misto um pouco, a bola longa nada" : c.chuva ? "campo molhado: o passe curto sofre um pouco" : c.calor ? "todo mundo cansa 20% mais rápido" : "";
  // Jogo grande: Libertadores, playoffs de acesso, final da Copa do Brasil e Supercopa. Nele a experiência pesa mais (CONFIG_EXPERIENCIA.jogoGrande).
  const jogoGrande = p => ["lib", "pre", "semi", "final"].includes(p.fase) || (p.fase === "copa" && (!p.copa_fase || p.copa_fase === 6));
  // Copa do Brasil: regras próprias da partida de copa.
  const COPA = { amarelosParaSuspensao: 2, faseQueZeraCartoes: 4, experiencia: 1.5 };
  // Quem não joga a copa: lesionado, suspenso na copa, ou quem já jogou a copa desta temporada por outro clube.
  const foraDaCopa = (j, clubeId) => (j.fora > 0 && j.motivo === "lesão") || j.foraCopa > 0 || (j.copaClube != null && j.copaClube !== clubeId);
  // Libertadores e Sul-Americana (fase "lib"): cartões contados à parte, como na copa (vermelho e segundo amarelo suspendem por um jogo
  // continental; depois das quartas os amarelos zeram). A Recopa, jogo único, não mexe neles.
  const CONTINENTAL = { amarelosParaSuspensao: 2, faseQueZeraCartoes: 4 };
  const foraDoContinental = j => (j.fora > 0 && j.motivo === "lesão") || j.foraLib > 0;
  // Situação dos jogadores depois de um jogo de copa: lesões valem para tudo; cartões e suspensões são só da copa
  // (segundo amarelo suspende; depois das quartas os amarelos zeram, para ninguém perder a final por acúmulo).
  // continental: Libertadores ou Sul-Americana, com os campos amarelosLib e foraLib e sem trava de clube
  function situacaoDaCopa(elenco, p, clubeId, fase, medico = null, continental = false) {
    const R = continental ? CONTINENTAL : COPA;
    const lesao = Object.fromEntries(p.lesoes.map(l => [l.id, l.dias])), situacao = [], copa = [];
    let vagas = medico ? medico.vagas - elenco.filter(j => j.fora > 1 && j.motivo === "lesão").length : 0;
    for (const j of elenco) {
      let fora = j.fora || 0, motivo = j.motivo || null, amarelos = (continental ? j.amarelosLib : j.amarelosCopa) || 0, foraCopa = (continental ? j.foraLib : j.foraCopa) || 0, copaClube = j.copaClube == null ? null : j.copaClube;
      if (fora > 0 && motivo === "lesão") { fora--; if (!fora) motivo = null; }
      if (foraCopa > 0) foraCopa--;
      const s = p.jogadores[j.id];
      if (s) {
        if (!continental) copaClube = clubeId;
        if (s.vermelho) foraCopa = 1;
        else if (s.amarelos) { amarelos++; if (amarelos >= R.amarelosParaSuspensao) { amarelos = 0; foraCopa = 1; } }
        if (lesao[j.id]) {
          let n = jogosFora(lesao[j.id]);
          if (medico && vagas > 0) { vagas--; n = Math.max(1, Math.round(n * (1 - medico.reducao))); }
          if (n >= fora) { fora = n; motivo = "lesão"; }
        }
      }
      if (fase === R.faseQueZeraCartoes) amarelos = 0;
      if (fora !== (j.fora || 0) || motivo !== (j.motivo || null)) situacao.push({ id: j.id, fora, motivo, amarelos: j.amarelos || 0 });
      if (continental) { if (amarelos !== (j.amarelosLib || 0) || foraCopa !== (j.foraLib || 0)) copa.push({ id: j.id, amarelos, fora: foraCopa }); }
      else if (amarelos !== (j.amarelosCopa || 0) || foraCopa !== (j.foraCopa || 0) || copaClube !== (j.copaClube == null ? null : j.copaClube)) copa.push({ id: j.id, amarelos, fora: foraCopa, clube: copaClube });
    }
    return { situacao, copa: fase === 0 ? [] : copa }; // Supercopa e Recopa (fase 0): cartões e trava de clube não contam
  }

  // temporada: a da liga; antes de PE_FRACO_DESDE (ou sem ela) os jogadores entram sem a nota do pé fraco e o motor joga como antes
  // Narração em fases (só nos jogos da grade): cada frase fica na tela pelo tempo de ler, e o desfecho vem depois de uma pausa.
  //   minimo, maximo, base, porLetra: segundos por frase; pausa: antes do desfecho; folga: depois dele, antes do próximo lance;
  //   antecedencia: a jogada chega antes de começar, porque a tela busca a cada 10 s (ela não traz o resultado)
  const FASES = { minimo: 2.5, maximo: 7, base: 1.5, porLetra: 0.045, pausa: 1, folga: 3, antecedencia: 12 };
  const tempoDaFrase = t => Math.min(FASES.maximo, Math.max(FASES.minimo, FASES.base + t.replace(/\{[01?]:([^}]*)\}/g, "$1").length * FASES.porLetra));
  // separa o que vem antes do desfecho ("… finaliza: GOL!" vira "… finaliza…" e "GOL!"); sem o que separar, a última frase inteira é o desfecho
  function desdobrarFases(fases) {
    const antes = fases.slice(0, -1), u = fases[fases.length - 1], k = u.lastIndexOf(": "), m = k < 0 ? u.lastIndexOf(", mas ") : -1, corte = k >= 0 ? k : m;
    if (corte < 0) return { antes, desfecho: u };
    const fim = u.slice(corte + 2);
    return { antes: [...antes, u.slice(0, corte) + "…"], desfecho: fim[0] === "{" ? fim : fim[0].toUpperCase() + fim.slice(1) };
  }
  const fasesNoAr = (d, agora) => d.tempos.filter(t => d.comeca + t <= agora).length;
  // As linhas da tabela lances. O lance em fases vira duas: a jogada, sem o resultado, e o lance inteiro na hora em que a jogada termina; o banco esconde
  // essa linha até lá, então nenhuma tela vê o gol antes. O lance seguinte espera. hora(l) e limite(l): em ms; limite é o apito do tempo em que o lance cai.
  // A hora nunca volta de uma ordem para a seguinte: a transmissão busca só as ordens maiores que a última que tem.
  function lancesDaTransmissao(narracao, partida_id, hora, limite, inicio = 0) {
    const ls = [], poe = (min, ms, dados) => { ls.push({ partida_id, ordem: ls.length, min, libera_em: new Date(ms).toISOString(), dados }); ultimo = ms; };
    let livre = 0, ultimo = inicio;
    for (const l of narracao) {
      const t = Math.max(hora(l), livre), antes = l.fases ? desdobrarFases(l.fases).antes : [];
      if (!antes.length) { poe(l.min, t, l); continue; }
      const esperas = antes.map((f, i) => tempoDaFrase(f) + (i === antes.length - 1 ? FASES.pausa : 0)), total = esperas.reduce((a, b) => a + b, 0) * 1000;
      const escala = t + total > limite(l) ? Math.max(0, (limite(l) - t) / total) : 1, fim = Math.round(t + total * escala);
      let soma = 0;
      const tempos = esperas.map(e => { const x = Math.round(soma * 1000 * escala); soma += e; return x; });
      poe(l.min, Math.max(t - FASES.antecedencia * 1000, ultimo), { n: l.n, min: l.min, s: l.s, ...(l.ac ? { ac: l.ac } : {}), time: l.time, tipo: "jogada", fases: antes, comeca: t, tempos, fim });
      poe(l.min, fim, l);
      livre = fim + FASES.folga * 1000;
    }
    return ls;
  }

  function calcularPartida({ partida, casa, fora, minutosTransmissao = 105, semente, temporada }) {
    const semPf = j => j.pf == null || temporada >= PE_FRACO_DESDE ? j : { ...j, pf: null };
    const agora = new Date(partida.inicio).getTime(), lib = partida.fase === "lib", copa = lib || partida.fase === "copa"; // copa e Libertadores: campo neutro, prorrogação e pênaltis
    const clima = climaDaPartida(partida.id == null ? semente : partida.id);
    const lados = [casa, fora].map(l => {
      l = { ...l, elenco: l.elenco.map(semPf), pronta: l.pronta && { ...l.pronta, escalacao: l.pronta.escalacao.map(e => ({ ...e, j: semPf(e.j) })), banco: (l.pronta.banco || []).map(semPf) } };
      const inativo = !l.clube.dono || (!l.clube.extra && (!l.clube.ultimo_acesso || agora - new Date(l.clube.ultimo_acesso).getTime() > DIAS_PARA_BOT * 86400000)); // clube extra (96) nunca fica com o bot
      // na copa, "fora" passa a ser a indisponibilidade da copa (a suspensão da liga não vale; a da copa e a trava de clube, sim);
      // na Libertadores e na Sul-Americana, a lesão e a suspensão continental (na Recopa só a lesão: foraLib é da Libertadores ou da Sul-Americana)
      const elenco = lib ? l.elenco.map(j => ({ ...j, fora: (partida.grupo === "REC" ? j.fora > 0 && j.motivo === "lesão" : foraDoContinental(j)) ? 1 : 0 })) : copa ? l.elenco.map(j => ({ ...j, fora: foraDaCopa(j, l.clube.id) ? 1 : 0 })) : l.elenco;
      const humana = l.pronta || (inativo ? null : taticaDoDirigente(l.tatica, elenco)); // pronta: tática já montada (liga de base)
      const disponiveis = elenco.filter(j => !(j.fora > 0));
      return { ...l, disponiveis, humana, previa: humana ? forcaDoOnze(humana.escalacao) : taticaBot(disponiveis).forca };
    });
    // antes de PAPEIS_DESDE (ou sem temporada) ninguém joga com papel, nem o dirigente, nem o bot
    const semPapel = t => temporada >= PAPEIS_DESDE ? t : { ...t, escalacao: t.escalacao.map(({ papel, ...e }) => e) };
    const taticas = lados.map((l, i) => semPapel(l.humana || taticaBot(l.disponiveis, { mandante: i === 0 && !copa, forcaAdversario: lados[1 - i].previa, perfil: l.clube.perfil, chuva: clima.chuva })));
    const sem = lados.map(l => partida.fase !== "base" && semTecnico(l.clube, temporada));
    const times = lados.map((l, i) => {
      let t = taticas[i];
      if (sem[i] && !sem[1 - i]) t = { ...t, escalacao: t.escalacao.map(e => ({ ...e, j: rendeMenos(e.j) })), banco: (t.banco || []).map(rendeMenos) };
      return prepararTime({ nome: l.clube.nome, escalacao: t.escalacao, banco: t.banco, instrucoes: t.instrucoes, mandante: i === 0 && !copa, prevencao: l.saude ? l.saude.prevencao : 0 });
    });
    const registro = []; // os passos da grade (só a T1 preenche), para o mapa de cada jogador no relatório; não muda o jogo
    const p = simularPartida(criarRng(semente), times[0], times[1], { prorrogacao: copa, chuva: clima.chuva, calor: clima.calor, jogoGrande: jogoGrande(partida), regrasT1: temporada >= PAPEIS_DESDE, registro });
    // o comentário de cada time vem do analista dele; sem os dados da comissão (amistoso, teste), vale o nível máximo
    const r = montarRelatorio(p, [casa, fora].map(l => l.saude ? l.saude.analista || 1 : 3), registro);
    const acr = p.acrescimos || [0, 0];
    const apito = horaDoMinuto(partida.inicio, p.duracao + (p.duracao > 90 ? 0 : acr[1]), minutosTransmissao, acr, p.duracao).getTime(), meioTempo = horaDoMinuto(partida.inicio, 45 + acr[0], minutosTransmissao, acr, 45).getTime();
    const lances = lancesDaTransmissao(p.narracao, partida.id, l => horaDoMinuto(partida.inicio, (l.s === undefined ? l.min : l.min - 1 + l.s / 60) + (l.ac || 0), minutosTransmissao, acr, l.min).getTime(), l => l.min <= 45 ? meioTempo : apito, new Date(partida.inicio).getTime());
    // abertura da transmissão, liberada no apito inicial: escalações, clima e cara ou coroa (a moeda não mexe no jogo)
    const extra = criarRng((semente >>> 0) + 7919);
    lances.unshift({ partida_id: partida.id, ordem: -1, min: 0, libera_em: new Date(partida.inicio).toISOString(), dados: {
      n: -1, min: 0, tipo: "inicio", acrescimos: acr, moeda: extra.int(0, 1), clima: { nome: clima.nome, temp: clima.temp }, grande: jogoGrande(partida),
      escalacoes: taticas.map(t => ({ titulares: t.escalacao.map(e => ({ nome: e.j.nome, pos: e.pos, ...(e.j.numero ? { numero: e.j.numero } : {}), ...(e.papel ? { papel: e.papel } : {}) })), banco: (t.banco || []).map(j => ({ nome: j.nome, pos: j.pos, ...(j.numero ? { numero: j.numero } : {}) })) })),
    } });
    // Copa: empate nos 90 minutos vai à prorrogação, jogada pelo motor como o resto da partida; persistindo, aos pênaltis, que o motor também
    // bate um a um. Com prorrogação, a transmissão e o resultado terminam depois do horário de fim da partida; com pênaltis, depois da última cobrança.
    const placar = p.placar.slice(), fimDoJogo = Math.max(apito, ...lances.map(l => new Date(l.libera_em).getTime())); // a fila pode passar uns segundos do apito
    let fimReal = new Date(fimDoJogo).toISOString(), penaltis = null, vencedor = null;
    if (copa) {
      const nomes = [casa.clube.nome, fora.clube.nome];
      if (p.penaltis) {
        penaltis = p.penaltis.placar;
        // na transmissão: o aviso no apito da prorrogação, a primeira cobrança 2 minutos depois e as outras a cada 30 segundos de verdade, seja qual for
        // a escala da transmissão (a página ao vivo usa esse tempo para o batedor se preparar, correr e o desfecho dar para ler)
        const passo = 30000, hora = k => new Date(fimDoJogo + (k < 0 ? 0 : 4 * passo + k * passo)).toISOString();
        const lance = (k, dados) => lances.push({ partida_id: partida.id, ordem: lances.length, min: 120, libera_em: hora(k), dados: { n: 99000 + k, min: 120, ...dados } });
        lance(-1, { time: 0, tipo: "penaltis", texto: "A prorrogação termina empatada. A vaga vai ser decidida nos pênaltis." });
        p.penaltis.cobrancas.forEach((c, k) => lance(k, { time: c.time, tipo: "cobranca", pen: c.resultado, quem: c.quem, ...(c.goleiro ? { goleiro: c.goleiro } : {}), placar: c.placar, texto: c.texto }));
        const v = penaltis[0] > penaltis[1] ? 0 : 1, n = p.penaltis.cobrancas.length;
        lance(n, { n: 99999, time: v, tipo: "penaltis", texto: `Fim da disputa: ${nomes[0]} ${penaltis[0]} x ${penaltis[1]} ${nomes[1]} nos pênaltis. Passa o {${v}:${nomes[v]}}.` });
        fimReal = hora(n);
      }
      vencedor = (penaltis ? penaltis[0] > penaltis[1] : placar[0] > placar[1]) ? casa.clube.id : fora.clube.id;
      r.vencedor = vencedor; if (p.duracao > 90) r.prorrogacao = true; if (penaltis) r.penaltis = penaltis;
    }
    const { narracao, ...semNarracao } = r; // a narração já está nos lances
    // forma e moral de todo mundo depois do jogo; o preparador de forma atende os de pior forma entre os que não estão fora
    const doJogo = Object.fromEntries(r.jogadores.map(j => [j.id, j])), momento = [];
    [casa, fora].forEach((l, i) => {
      const S = l.saude || {}, resultado = copa ? (vencedor === l.clube.id ? 1 : -1) : Math.sign(p.placar[i] - p.placar[1 - i]);
      const atendidos = new Set(S.forma ? l.elenco.filter(j => !(j.fora > 0)).sort((a, b) => (a.forma == null ? 50 : a.forma) - (b.forma == null ? 50 : b.forma)).slice(0, S.forma.vagas).map(j => j.id) : []);
      for (const j of l.elenco) {
        const x = doJogo[j.id], m = momentoDepois(j, { nota: x ? x.nota : null, minutos: x ? x.minutos : 0, resultado, fora: j.fora > 0 ? j.motivo : null, ganho: atendidos.has(j.id) ? S.forma.ganho : 0, psicologo: S.psicologo || 0 });
        const exp = experienciaDepois(j, x ? x.minutos : 0, copa ? COPA.experiencia : 1); // experiência: só sobe para quem entrou em campo; vale mais na copa
        if (m.forma !== (j.forma == null ? 50 : j.forma) || m.moral !== (j.moral == null ? 50 : j.moral) || exp !== j.exp) momento.push({ id: j.id, ...m, exp });
      }
    });
    return {
      lances,
      resultado: {
        partida_id: partida.id, libera_em: fimReal, gols_casa: placar[0], gols_fora: placar[1], xg_casa: p.xg[0], xg_fora: p.xg[1],
        pts_esp_casa: r.esperado.pontos[0], pts_esp_fora: r.esperado.pontos[1],
        relatorio: { ...semNarracao, comandados: lados.map(l => l.humana ? "dirigente" : "bot") },
      },
      // "Suas ordens" de cada clube com dirigente: tabela privada (90_ordens_privadas.sql), o relatório é público
      ordens: [casa, fora].map((l, i) => lados[i].humana && l.clube.dono ? { partida_id: partida.id, clube_id: l.clube.id, libera_em: fimReal, itens: p.ordens[i] } : null).filter(Boolean),
      ...(() => { // na copa, cartões e suspensões vão para os campos da copa, e sai também quem passou de fase
        if (!copa) return { situacao: [...situacaoDepois(casa.elenco, p, casa.saude && casa.saude.medico), ...situacaoDepois(fora.elenco, p, fora.saude && fora.saude.medico)] };
        // Libertadores e Sul-Americana: cartões continentais (lib); Recopa: como a Supercopa (fase 0), não mexe em cartão nenhum
        const fase = lib && partida.grupo === "REC" ? 0 : partida.copa_fase;
        const a = situacaoDaCopa(casa.elenco, p, casa.clube.id, fase, casa.saude && casa.saude.medico, lib), b = situacaoDaCopa(fora.elenco, p, fora.clube.id, fase, fora.saude && fora.saude.medico, lib);
        return { situacao: [...a.situacao, ...b.situacao], ...(lib ? { copa: [], lib: [...a.copa, ...b.copa] } : { copa: [...a.copa, ...b.copa] }), vencedor };
      })(),
      momento,
      minutos: Object.fromEntries(Object.entries(p.jogadores).map(([id, x]) => [id, (x.saiu === null ? p.duracao || 90 : x.saiu) - x.entrou])), // para o bônus de treino de quem jogou
      // papel em que cada titular jogou, só nas posições com papéis e a partir de PAPEIS_DESDE: trocar custa entrosamento (164). O padrão grava "padrao" e não
      // o nome, para mudar de formação sem escolher papel (DR, Fixo, para WBR, Apoiador) não contar como troca
      papeis: temporada >= PAPEIS_DESDE ? taticas.flatMap(t => t.escalacao.filter(e => PAPEL_PADRAO[e.pos]).map(e => ({ id: e.j.id, papel: e.papel && e.papel !== PAPEL_PADRAO[e.pos] ? e.papel : "padrao" }))) : [],
      posicoes: Object.fromEntries(Object.entries(p.jogadores).map(([id, x]) => [id, x.pos])), // posição em que cada um começou a jogar: acelera a posição nova
    };
  }

  // Tabela de um grupo a partir das partidas com resultado visível. Desempate: pontos, saldo, gols pró, gols contra.
  function classificacao(clubes, partidas, resultados) {
    const t = Object.fromEntries(clubes.map(c => [c.id, { clube: c, j: 0, v: 0, e: 0, d: 0, gp: 0, gc: 0, pts: 0, esp: 0 }]));
    const res = Object.fromEntries(resultados.map(r => [r.partida_id, r]));
    for (const p of partidas) {
      const r = res[p.id], a = t[p.casa], b = t[p.fora];
      if (!r || !a || !b || (p.fase && p.fase !== "liga")) continue;
      a.j++; b.j++; a.gp += r.gols_casa; a.gc += r.gols_fora; b.gp += r.gols_fora; b.gc += r.gols_casa; a.esp += r.pts_esp_casa; b.esp += r.pts_esp_fora;
      if (r.gols_casa > r.gols_fora) { a.v++; b.d++; a.pts += 3; } else if (r.gols_casa < r.gols_fora) { b.v++; a.d++; b.pts += 3; } else { a.e++; b.e++; a.pts++; b.pts++; }
    }
    return Object.values(t).sort((x, y) => y.pts - x.pts || (y.gp - y.gc) - (x.gp - x.gc) || y.gp - x.gp || x.gc - y.gc || x.clube.nome.localeCompare(y.clube.nome));
  }

  // ---------- playoff de acesso da segunda divisão (desde a T14, grupos de 8): seis classificados por grupo ----------
  // Preliminar em jogo único na casa do melhor (3º x 6º e 4º x 5º; empate classifica o mandante); 1º e 2º folgam.
  // Semifinal (1º x vencedor do 4x5, 2º x vencedor do 3x6) e final em ida e volta, a volta na casa da melhor campanha;
  // empate no agregado classifica a melhor campanha (sem prorrogação nem pênaltis). O vencedor da final sobe.
  // Rodadas, contadas depois das R rodadas de liga do grupo: preliminar R+1, semifinal R+2 e R+3, final R+4 e R+5.
  // etapa = rodada − R − 1 (0 a 4): o calendário reserva uma data para cada etapa (ligas.copa.playoffs).
  const DESCENSO_DA_PRIMEIRA = 3;
  const CLASSIFICADOS_DO_PLAYOFF = 6;
  const daLiga = p => !p.fase || p.fase === "liga";
  // Empate classifica o mandante, que é sempre o de melhor campanha.
  const vencedorDoPlayoff = (p, r) => r.gols_casa >= r.gols_fora ? p.casa : p.fora;
  // Confronto de um ou dois jogos: soma dos gols; empate classifica o mandante do último jogo (a melhor campanha). Sem resultado: null.
  function vencedorDoConfronto(jogos, res) {
    if (!jogos.length || jogos.some(p => !res[p.id])) return null;
    const ultimo = jogos.reduce((a, b) => b.rodada > a.rodada ? b : a), gols = { [ultimo.casa]: 0, [ultimo.fora]: 0 };
    for (const p of jogos) { gols[p.casa] += res[p.id].gols_casa; gols[p.fora] += res[p.id].gols_fora; }
    return gols[ultimo.fora] > gols[ultimo.casa] ? ultimo.fora : ultimo.casa;
  }
  // confrontos de uma fase do grupo: jogos agrupados pelo par de clubes
  const confrontos = jogos => Object.values(jogos.reduce((m, p) => { const k = [p.casa, p.fora].sort((a, b) => a - b).join("x"); (m[k] = m[k] || []).push(p); return m; }, {}));
  const rodadasDeLiga = (partidas, g) => Math.max(0, ...partidas.filter(p => p.grupo === g && daLiga(p)).map(p => p.rodada));
  // quem venceu o playoff do grupo (a final de ida e volta), ou null
  function vencedorDoGrupo(partidas, resultados, g) {
    const res = Object.fromEntries(resultados.map(r => [r.partida_id, r]));
    return vencedorDoConfronto(partidas.filter(p => p.grupo === g && p.fase === "final"), res);
  }

  // ---------- fim da temporada: tabela final e prêmios ----------
  // O servidor fecha a temporada sozinho uma hora depois do último jogo (145_fechamento_da_temporada.sql) e a virada (virada.js) usa as mesmas contas.
  // prêmio da liga por divisão: [campeão, lanterna], em degraus iguais entre as posições
  // pela metade desde o 68_economia.sql (antes: 10 a 4 mi na A, 6 a 2,4 na B e 3,5 a 1,2 na C): entrava dinheiro demais e os caixas só cresciam
  const PREMIOS = { 1: [5000, 2000], 2: [3000, 1200] };
  const PREMIOS_DE_FORA = [9000, 5000]; // campeonato de outro país (REGUA_DE_FORA, em virada.js)
  const premioDaLiga = (divisao, posicao, clubes = 10, fora = false) => {
    const [topo, fundo] = fora ? PREMIOS_DE_FORA : PREMIOS[divisao] || PREMIOS[2];
    return Math.round(topo - (topo - fundo) * (posicao - 1) / Math.max(1, clubes - 1));
  };
  // Clube GUARDADO fica no grupo "X": sem partidas, fora de liga, copa, base e mercado; envelhece na virada e volta numa expansão.
  const GUARDADO = "X";
  // tabela final de cada grupo, com o prêmio da liga (as linhas do histórico, sem o destino)
  function classificacaoFinal(clubes, partidas, resultados) {
    const linhas = [];
    for (const g of [...new Set(clubes.map(c => c.grupo))].filter(g => g !== GUARDADO).sort()) { // guardado não tem tabela nem histórico
      const doGrupo = clubes.filter(c => c.grupo === g);
      classificacao(doGrupo, partidas.filter(p => p.grupo === g), resultados).forEach((t, i) => linhas.push({ clube_id: t.clube.id, divisao: t.clube.divisao, grupo: g, posicao: i + 1,
        pontos: t.pts, vitorias: t.v, empates: t.e, derrotas: t.d, gols_pro: t.gp, gols_contra: t.gc, premio: premioDaLiga(t.clube.divisao, i + 1, doGrupo.length, !!PAISES[g]) }));
    }
    return linhas;
  }
  // fundo da liga: bônus de mérito da Série C (campeão do grupo, 2º, 3º e 4º, e quem sobe pelo playoff sem ter sido o campeão)
  const BONUS_DA_C = [0, 800, 400, 300, 200];
  const BONUS_DO_ACESSO_NA_C = 600;
  function meritoDaSerieC(linhas, subiram = []) {
    const merito = linhas.filter(x => x.divisao === 3 && x.posicao <= 4).map(x => ({ clube_id: x.clube_id, valor: BONUS_DA_C[x.posicao], descricao: `Fundo da liga: bônus pelo ${x.posicao}º lugar na Série C` }));
    for (const id of subiram) { const x = linhas.find(c => c.clube_id === id); if (x && x.divisao === 3 && x.posicao !== 1) merito.push({ clube_id: id, valor: BONUS_DO_ACESSO_NA_C, descricao: "Fundo da liga: bônus pelo acesso no playoff" }); }
    return merito;
  }
  // técnico do ano de cada série: quem mais superou a colocação esperada pela força do elenco (média dos 11 melhores), só de honra
  const mediaDosOnze = (elenco = []) => { const n = elenco.map(j => notaBruta(j.at, j.pos)).sort((a, b) => b - a).slice(0, 11); return n.length ? n.reduce((s, x) => s + x, 0) / n.length : 0; };
  // quanto cada clube superou, na sua série, a colocação esperada pela força do elenco: { clube_id: posições }
  function superacaoNaSerie(linhas, elencos) {
    const s = {};
    for (const g of new Set(linhas.map(x => x.grupo))) {
      const l = linhas.filter(x => x.grupo === g), forca = Object.fromEntries(l.map(x => [x.clube_id, mediaDosOnze(elencos[x.clube_id])]));
      [...l].sort((a, b) => forca[b.clube_id] - forca[a.clube_id]).forEach((x, i) => { s[x.clube_id] = i + 1 - x.posicao; });
    }
    return s;
  }
  function tecnicosDoAno(linhas, elencos) {
    const s = superacaoNaSerie(linhas, elencos);
    return [...new Set(linhas.map(x => x.grupo))].map(g => {
      const t = linhas.filter(x => x.grupo === g).sort((a, b) => s[b.clube_id] - s[a.clube_id] || a.posicao - b.posicao)[0];
      return { grupo: g, clube_id: t.clube_id, numero: s[t.clube_id] };
    });
  }
  // Técnico do ano geral, só entre dirigentes: pontos da temporada inteira (spec 2026-10-26-tecnico-geral). Mata-mata: campeão, vice, semi, quartas.
  const PESOS_DO_TECNICO_GERAL = { A: [10, 8, 7, 6, 5, 4, 3, 3, 2, 1, 0, 0], B: [4, 3, 2, 1, 1, 1], playoff: { campeao: 6, vice: 4, semi: 3 }, LIB: [11, 7, 4, 2], COPA: [6, 4, 2, 1], SUL: [5, 3, 2, 1], SUPER: 1, REC: 1 };
  // partidas: liga, playoff ("semi", "final"), copa e "lib" (com copa_fase e vencedor); donos: Set dos ids com dirigente
  function pontosDoTecnicoGeral({ linhas, partidas, resultados, donos }) {
    const P = PESOS_DO_TECNICO_GERAL, pts = {}, dar = (id, v) => { if (donos.has(id) && v) pts[id] = (pts[id] || 0) + v; };
    // liga; na Série B vale o maior entre a posição e o playoff (sem final no grupo, o 1º é o campeão)
    for (const x of linhas) {
      if (!donos.has(x.clube_id)) continue;
      pts[x.clube_id] = pts[x.clube_id] || 0;
      if (x.divisao === 1 && !PAISES[x.grupo]) dar(x.clube_id, P.A[x.posicao - 1] || 0);
      else if (x.divisao === 2 && !PAISES[x.grupo]) {
        const final = partidas.filter(p => p.grupo === x.grupo && p.fase === "final"), naFinal = final.some(p => p.casa === x.clube_id || p.fora === x.clube_id);
        const campeao = final.length ? vencedorDoGrupo(partidas, resultados, x.grupo) === x.clube_id : x.posicao === 1;
        const semi = partidas.some(p => p.grupo === x.grupo && p.fase === "semi" && (p.casa === x.clube_id || p.fora === x.clube_id));
        dar(x.clube_id, Math.max(P.B[x.posicao - 1] || 0, campeao ? P.playoff.campeao : naFinal ? P.playoff.vice : semi ? P.playoff.semi : 0));
      }
    }
    // mata-mata: a fase mais adiantada de cada clube (6 = final; final sem vencedor ainda: os dois como vice)
    const mataMata = (jogos, regua) => {
      const chegou = {};
      for (const p of jogos) for (const id of [p.casa, p.fora]) chegou[id] = Math.max(chegou[id] || 0, p.copa_fase);
      const final = jogos.find(p => p.copa_fase === 6 && p.vencedor);
      for (const [id, f] of Object.entries(chegou)) dar(+id, final && final.vencedor === +id ? regua[0] : regua[6 - f + 1] || 0);
    };
    mataMata(partidas.filter(p => p.fase === "copa" && p.copa_fase > 0), P.COPA);
    for (const g of ["LIB", "SUL"]) mataMata(partidas.filter(p => p.fase === "lib" && p.grupo === g), P[g]);
    for (const p of partidas) {
      if (p.fase === "copa" && p.copa_fase === 0 && p.vencedor) dar(p.vencedor, P.SUPER);
      if (p.fase === "lib" && p.grupo === "REC" && p.vencedor) dar(p.vencedor, P.REC);
    }
    return pts;
  }
  // o vencedor ({ grupo: "TODOS", clube_id, numero: pontos }) ou null; empate: maior superação na série, depois a melhor posição
  function tecnicoGeral({ linhas, partidas, resultados, elencos, donos }) {
    const pts = pontosDoTecnicoGeral({ linhas, partidas, resultados, donos }), s = superacaoNaSerie(linhas, elencos);
    const pos = Object.fromEntries(linhas.map(x => [x.clube_id, x.posicao]));
    const t = Object.keys(pts).map(Number).filter(id => pts[id] > 0).sort((a, b) => pts[b] - pts[a] || (s[b] || 0) - (s[a] || 0) || (pos[a] || 99) - (pos[b] || 99))[0];
    return t ? { grupo: "TODOS", clube_id: t, numero: pts[t] } : null;
  }
  // Devolve os jogos a criar agora, de todos os grupos da segunda divisão em diante, cada um na fase em que está:
  // { jogos: [{ grupo, rodada, fase, etapa, casa, fora }] } ou { erro }. O grupo avança quando a liga DELE termina.
  function proximaFaseDosPlayoffs({ clubes, partidas, resultados }) {
    const res = Object.fromEntries(resultados.map(r => [r.partida_id, r]));
    const grupos = [...new Set(clubes.filter(c => c.divisao > 1).map(c => c.grupo))].filter(g => partidas.some(p => p.grupo === g && daLiga(p))).sort();
    if (!grupos.length) return { erro: "Nenhum grupo disputa playoff (só as divisões abaixo da primeira)." };
    const jogos = [], esperando = [];
    for (const g of grupos) {
      const doGrupo = partidas.filter(p => p.grupo === g), R = rodadasDeLiga(partidas, g);
      if (doGrupo.some(p => daLiga(p) && !res[p.id])) { esperando.push(g); continue; }
      const t = classificacao(clubes.filter(c => c.grupo === g), doGrupo, resultados).map(x => x.clube.id);
      if (t.length < CLASSIFICADOS_DO_PLAYOFF) continue;
      const melhor = (a, b) => t.indexOf(a) <= t.indexOf(b) ? [a, b] : [b, a];
      // ida e volta: ida na casa da pior campanha, volta na da melhor
      const idaEVolta = (fase, rodada, a, b) => { const [m, p] = melhor(a, b);
        jogos.push({ grupo: g, rodada, fase, etapa: rodada - R - 1, casa: p, fora: m }, { grupo: g, rodada: rodada + 1, fase, etapa: rodada - R, casa: m, fora: p }); };
      const pre = doGrupo.filter(p => p.fase === "pre"), semis = doGrupo.filter(p => p.fase === "semi"), finais = doGrupo.filter(p => p.fase === "final");
      if (!pre.length) {
        jogos.push({ grupo: g, rodada: R + 1, fase: "pre", etapa: 0, casa: t[2], fora: t[5] }, { grupo: g, rodada: R + 1, fase: "pre", etapa: 0, casa: t[3], fora: t[4] });
        continue;
      }
      if (!semis.length) {
        const v = pre.map(p => res[p.id] ? vencedorDoPlayoff(p, res[p.id]) : null);
        if (v.includes(null)) { esperando.push(g); continue; }
        const de = casa => v[pre.findIndex(p => p.casa === casa)]; // vencedor do jogo em que o casa foi mandante
        idaEVolta("semi", R + 2, t[0], de(t[3])); idaEVolta("semi", R + 2, t[1], de(t[2]));
        continue;
      }
      if (finais.length) continue; // playoff do grupo completo
      const v = confrontos(semis).map(c => vencedorDoConfronto(c, res));
      if (v.includes(null) || v.length !== 2) { esperando.push(g); continue; }
      idaEVolta("final", R + 4, v[0], v[1]);
    }
    if (!jogos.length) return { erro: esperando.length ? `Ainda em jogo: ${esperando.join(", ")}.` : "Os playoffs já foram todos criados." };
    return { jogos };
  }
  return { AMARELOS_PARA_SUSPENSAO, jogosFora, DIAS_PARA_BOT, SEM_TECNICO, semTecnico, gerarTabela, taticaDoDirigente, taticaDoAmistoso, horaDoMinuto, aplicarSituacao, climaDaPartida, efeitoDoClima, jogoGrande, COPA, foraDaCopa, CONTINENTAL, foraDoContinental, FASES, tempoDaFrase, desdobrarFases, fasesNoAr, lancesDaTransmissao, calcularPartida, classificacao, DESCENSO_DA_PRIMEIRA, CLASSIFICADOS_DO_PLAYOFF, vencedorDoPlayoff, vencedorDoConfronto, rodadasDeLiga, vencedorDoGrupo, PREMIOS, PREMIOS_DE_FORA, premioDaLiga, GUARDADO, classificacaoFinal, BONUS_DA_C, BONUS_DO_ACESSO_NA_C, meritoDaSerieC, mediaDosOnze, superacaoNaSerie, tecnicosDoAno, PESOS_DO_TECNICO_GERAL, pontosDoTecnicoGeral, tecnicoGeral, proximaFaseDosPlayoffs };
})();

const __treino = (() => {
  // Treino: cada sessão dá pontos aos atributos dos focos do jogador; a cada 100 pontos o atributo sobe 1.
  // O foco principal fica com 70% dos pontos e o complementar (3 atributos à escolha) com 30%.
  // O talento oculto define o teto da nota do jogador. A velocidade é proporcional ao CAMINHO dele (da nota de partida, igual para todos, até o teto):
  // todo jogador percorre a mesma fração do caminho por temporada, então teto alto e teto baixo chegam na mesma idade. Sobre isso entram a idade,
  // o centro de treinamento, o trabalho em equipe, ter jogado e os treinadores (cada atributo pertence a uma área de treino, e a qualidade da área
  // depende de quem trabalha nela). Não há empurrão para quem está atrasado nem freio para quem está adiantado.
  // A temporada rende o mesmo em qualquer grupo: a sessão vale rodadasDeReferencia / rodadas do grupo (fatorDaTemporada).
  // Módulo puro: usado pela função do servidor (uma sessão por partida de liga) e pelas páginas (focos, sugestão e previsão).
  const { ATRIBUTOS, ATR_MIN, ATR_MAX, IDX, POSICOES, PESOS, VIZINHAS, notaDeTeto, TETO_DO_TALENTO, pesosDe } = __modelo;
  const { criarRng } = __rng;
  const CONFIG_TREINO = {
    pontosPorNivel: 100,
    rodadasDeReferencia: 22,    // rodadas da Série A: a temporada de treino é medida nelas
    pontosPorSessao: 130,       // antes dos fatores; com tudo em 100% e caminho igual ao divisor, 1,3 ponto de atributo por sessão (era 150 antes do reinício)
    partePrincipal: 0.7,
    ct: [0.9, 0.04],            // sem centro de treinamento, 90%; cada nível soma 4% (110% no nível 5)
    equipe: [0.95, 1.05],       // do menor ao maior Trabalho em equipe
    bonusPorJogar: 0.1, minutosParaBonus: 45,
    teto: TETO_DO_TALENTO,      // teto da nota = 23 + 0,20 × talento (1 a 100): de 23 a 43 (liga madura: titulares em 37–38 / 36–37 / 33–34 em A / B / países)
    // caminho: os pontos da sessão são multiplicados por (teto − partida) / divisor. Sem saber o teto (tela sem olheiro), vale o teto típico.
    caminho: { partida: 15, divisor: 26, minimo: 6, tetoTipico: 36 },
    folga: [1 / 3, 1 / 18],     // teto que cede: fração dos jogadores que passa do teto em 1 ponto ou mais, e em 2
    // treinadores: a qualidade da área (0 a 50) vira um multiplicador dos pontos dos atributos dela
    treinador: [0.9, 0.25],     // área sem treinador, 90%; qualidade 50, 115%
    parteDoGeral: 0.6,          // treinador "geral" soma 60% de cada skill nas quatro áreas com treinador designado, por cima do designado
    coletivas: ["fis", "tat"], divisorDaSoma: 2.5, // físico e tática: soma da skill de TODOS os treinadores, dividida por 2,5 (teto 50)
    // perdaPorExcesso em 0: a punição por elenco inflado (mais de 7 jogadores acima de 21 anos por treinador) foi desligada
    // quando o elenco ganhou o limite de 35 jogadores com mais de 21 anos; para religar, voltar a 0.1
    maximoDeTreinadores: 5, jogadoresPorTreinador: 7, perdaPorExcesso: 0,
    idadeSemContar: 21,         // jogador até esta idade não entra no limite de 35 do elenco
    ctSemDono: { 1: 4, 2: 2 }, // clube sem dirigente treina como se tivesse este centro de treinamento, conforme a divisão: é o que separa as séries com o tempo
    qualidadeSemDono: 20,       // clube sem dono treina como se tivesse qualidade 20 em tudo (100%)
  };

  // Áreas de treino e os atributos de cada uma. Goleiros, defesa, meio e ataque têm treinador designado; físico e tática são coletivas.
  const AREAS = {
    gol: { nome: "Goleiros", at: ["ref", "um", "enc"] },
    def: { nome: "Defesa", at: ["des", "mar", "cab"] },
    mei: { nome: "Meio", at: ["pas", "cri", "dom", "cru", "plo"] },
    ata: { nome: "Ataque", at: ["fin", "lon", "dri"] },
    fis: { nome: "Físico", at: ["vel", "for", "res"] },
    tat: { nome: "Tática", at: ["com", "pos", "equ", "agr", "inf", "exc", "mov", "dec"] },
  };
  const AREA_DO_ATRIBUTO = ATRIBUTOS.map(a => Object.keys(AREAS).find(k => AREAS[k].at.includes(a.k)) || "tat");
  const multDaQualidade = q => CONFIG_TREINO.treinador[0] + CONFIG_TREINO.treinador[1] * Math.min(50, Math.max(0, q)) / 50;
  // Multiplicador de cada área para um clube. treinadores: [{ area, skills }] (só os contratados); null = sem o sistema de treinadores (tudo 100%).
  // jogadores: quantos do elenco têm mais de 21 anos. O excesso só reduz o que os treinadores acrescentam: nenhuma área fica abaixo da base (área sem treinador).
  function qualidadeDoTreino(treinadores, jogadores, semDono = false) {
    const C = CONFIG_TREINO, areas = {};
    if (!treinadores) { for (const k in AREAS) areas[k] = 1; return areas; }
    if (semDono) { for (const k in AREAS) areas[k] = multDaQualidade(C.qualidadeSemDono); return areas; }
    const lista = treinadores.slice(0, C.maximoDeTreinadores), capacidade = lista.length * C.jogadoresPorTreinador;
    const excesso = capacidade && jogadores > capacidade ? 1 - C.perdaPorExcesso * Math.min(1, (jogadores - capacidade) / capacidade) : 1;
    for (const k in AREAS) {
      const q = C.coletivas.includes(k) ? lista.reduce((s, t) => s + (t.skills[k] || 0), 0) / C.divisorDaSoma
        // o melhor treinador designado da área, mais 60% da skill de cada treinador geral (sempre soma); teto 50
        : Math.min(50, lista.reduce((m, t) => Math.max(m, t.area === k ? (t.skills[k] || 0) : 0), 0) + lista.reduce((s, t) => s + (t.area === "geral" ? C.parteDoGeral * (t.skills[k] || 0) : 0), 0));
      areas[k] = C.treinador[0] + (multDaQualidade(q) - C.treinador[0]) * excesso;
    }
    return areas;
  }
  // nível do centro de treinamento que vale para o treino: o do clube, ou o da divisão quando ele não tem dirigente
  const ctDoClube = c => !c ? 0 : c.dono ? (c.ct_nivel || 0) : (CONFIG_TREINO.ctSemDono[c.divisao] || 0);
  const multDoAtributo = (areas, i) => areas ? (areas[AREA_DO_ATRIBUTO[i]] || 1) : 1;
  // ritmo por idade: cheio até os 23, caindo até parar depois dos 30
  const ritmoDaIdade = idade => idade <= 23 ? 1 : idade <= 25 ? 0.85 : idade <= 27 ? 0.7 : idade <= 30 ? 0.5 : 0;

  // Focos principais: os atributos de cada função.
  const FOCOS = {
    goleiro: { nome: "Goleiro", at: ["ref", "um", "enc", "com", "pos"] },
    zagueiro: { nome: "Zagueiro", at: ["des", "mar", "cab", "pos", "com"] },
    lateral: { nome: "Lateral e ala", at: ["des", "mar", "pos", "com", "cru"] },
    volante: { nome: "Volante", at: ["pas", "mar", "des", "pos", "cri"] },
    meia: { nome: "Meia", at: ["pas", "cri", "pos", "dom", "lon"] },
    ponta: { nome: "Ponta", at: ["fin", "cru", "dri", "pos", "dom"] },
    atacante: { nome: "Atacante", at: ["fin", "cab", "dri", "pos", "dom"] },
    fisico: { nome: "Físico", at: ["vel", "for", "res"] },
  };
  const FOCO_DA_LINHA = { gol: "goleiro", defesa: "zagueiro", ala: "lateral", volante: "volante", meio: "meia", meia: "meia", ataque: "atacante" };
  function focoDaPosicao(pos) {
    const p = POSICOES[pos]; if (!p) return "meia";
    if (p.linha === "defesa" && p.lado !== "C") return "lateral";
    if (p.lado !== "C" && (p.linha === "meio" || p.linha === "meia" || p.linha === "ataque")) return "ponta";
    return FOCO_DA_LINHA[p.linha] || "meia";
  }
  // atributos que o jogador pode treinar: os de goleiro só para goleiro
  const treinavel = (pos, i) => ATRIBUTOS[i].grupo !== "gol" || pos === "GK";
  // Foco automático: a função da posição e, como complemento, os 3 atributos que mais pesam na posição e não estão no foco principal.
  // Com o at do jogador, lê os pesos do vetor dele: quem tem 25 recebe os atributos novos que mais pesam.
  function focoAutomatico(pos, at = null) {
    const p = focoDaPosicao(pos), doFoco = new Set(FOCOS[p].at), papel = (POSICOES[pos] || {}).papel, pesos = (at ? pesosDe(at, papel) : PESOS[papel]) || {};
    const c = Object.keys(pesos).filter(k => !doFoco.has(k) && treinavel(pos, IDX[k])).sort((a, b) => pesos[b] - pesos[a]).slice(0, 3).map(k => IDX[k]);
    for (const k of ["vel", "for", "res", "equ"]) if (c.length < 3 && !doFoco.has(k) && !c.includes(IDX[k])) c.push(IDX[k]);
    return { p, c };
  }
  // Foco em uso: o salvo pelo dirigente, se for válido; senão, o automático.
  function focoDoJogador(j) {
    const t = j.treino, auto = focoAutomatico(j.pos, j.at);
    // goleiro só treina o foco de goleiro ou o físico; jogador de linha não treina o foco de goleiro
    if (!t || !FOCOS[t.p] || ((t.p === "goleiro") !== (j.pos === "GK") && t.p !== "fisico")) return auto;
    const c = Array.isArray(t.c) ? [...new Set(t.c.map(Number))].filter(i => i >= 0 && i < j.at.length && treinavel(j.pos, i)).slice(0, 3) : [];
    return { p: t.p, c: c.length ? c : auto.c };
  }

  // Posição nova: o dirigente manda o jogador aprender UMA posição além das que ele já tem. Enquanto aprende, o treino de atributos rende 20% menos.
  // O custo por degrau (improvisado → competente → natural) depende da distância até uma posição em que ele já é natural: vizinha 900,
  // vizinha de vizinha 1800, o resto 2700. Até competente, cada sessão de treino dá pontos e jogar na posição acelera; de competente a natural,
  // só jogando: cada jogo de 45 minutos ou mais na posição (liga ou liga de base) dá os pontos de "treinou e jogou", e o treino não rende nada
  // nem custa os 20%. A idade freia. Goleiro não aprende posição de linha, nem o contrário.
  const CONFIG_POSICAO = { custoDoTreino: 0.2, porSessao: 100, vizinha: 900, proxima: 1800, distante: 2700, bonusPorJogar: 0.5 };
  const ritmoDaPosicao = idade => idade <= 23 ? 1 : idade <= 27 ? 0.7 : 0.4;
  // posição que o jogador está aprendendo agora (nula quando não há, ou quando ele já virou natural nela)
  const posicaoEmEstudo = j => { const p = j.aprende && j.aprende.pos; return p && POSICOES[p] && p !== "GK" && j.pos !== "GK" && (j.fam || {})[p] !== "N" ? p : null; };
  function distanciaDaPosicao(j, pos) {
    const naturais = Object.keys(j.fam || {}).filter(p => j.fam[p] === "N"), perto = (de, p) => (VIZINHAS[de] || []).includes(p);
    return naturais.some(p => perto(p, pos)) ? "vizinha" : naturais.some(p => (VIZINHAS[p] || []).some(v => perto(v, pos))) ? "proxima" : "distante";
  }
  const custoDaPosicao = (j, pos) => CONFIG_POSICAO[distanciaDaPosicao(j, pos)];
  // treino de atributos paga os 20% só enquanto a sessão ainda ensina a posição (até competente)
  const treinandoPosicao = j => { const p = posicaoEmEstudo(j); return !!p && (j.fam || {})[p] !== "C"; };
  const pontosDePosicao = (j, jogouNa = false) => Math.round(CONFIG_POSICAO.porSessao * ritmoDaPosicao(j.idade) * (jogouNa ? 1 + CONFIG_POSICAO.bonusPorJogar : 1));
  // Uma sessão de estudo da posição. Devolve { fam, aprende } ou null (não está aprendendo nada).
  // soBonus: só a parte de "jogou na posição", sem a sessão (jogo da liga de base).
  // subiu: { para: "C" ou "N", em: data } do último degrau conquistado, para o mural do clube avisar por AVISO_DE_DEGRAU_DIAS.
  function aprenderPosicao(j, { jogouNa = false, soBonus = false, em = new Date().toISOString() } = {}) {
    const pos = posicaoEmEstudo(j); if (!pos) return null;
    const custo = custoDaPosicao(j, pos), fam = { ...j.fam }; let pts = (+j.aprende.pts || 0) + (fam[pos] === "C" ? (jogouNa || soBonus ? pontosDePosicao(j, true) : 0) // de competente a natural, só jogando
      : soBonus ? pontosDePosicao(j, true) - pontosDePosicao(j) : pontosDePosicao(j, jogouNa));
    while (pts >= custo && fam[pos] !== "N") { pts -= custo; fam[pos] = fam[pos] === "C" ? "N" : "C"; }
    if (fam[pos] === "N") pts = 0;
    const subiu = fam[pos] !== (j.fam || {})[pos] ? { para: fam[pos], em } : j.aprende.subiu;
    return { fam, aprende: { pos, pts, ...(subiu ? { subiu } : {}) } };
  }
  const AVISO_DE_DEGRAU_DIAS = 3;
  // degrau de posição conquistado há pouco: { pos, para } ou null
  const degrauRecente = (j, agora = Date.now()) => { const s = j.aprende && j.aprende.subiu; return s && agora - Date.parse(s.em) < AVISO_DE_DEGRAU_DIAS * 864e5 ? { pos: j.aprende.pos, para: s.para } : null; };
  // competente: sessões de treino que faltam para virar competente (0 se já é; sem jogar na posição); jogos: jogos de 45 minutos na posição, depois disso, para virar natural
  function prazoDaPosicao(j, pos, pts = 0) {
    const custo = custoDaPosicao(j, pos), jaC = (j.fam || {})[pos] === "C", porJogo = pontosDePosicao(j, true);
    return { competente: jaC ? 0 : Math.max(1, Math.ceil((custo - pts) / pontosDePosicao(j))), jogos: Math.max(1, Math.ceil((custo - (jaC ? pts : 0)) / porJogo)) };
  }

  // Teto que cede: um em cada três jogadores passa 1 ponto do teto do talento, e um em cada dezoito passa 2 (CONFIG_TREINO.folga).
  // A sorte é do jogador e não muda: sai do número dele misturado com o talento, que só o servidor conhece.
  function folgaDoTeto(id, tal) {
    if (tal == null || id == null) return 0;
    const r = criarRng((+String(id).replace(/\D/g, "") || 0) * 101 + tal).n(), F = CONFIG_TREINO.folga;
    return r < F[1] ? 2 : r < F[0] ? 1 : 0;
  }
  const tetoDaNota = tal => CONFIG_TREINO.teto[0] + CONFIG_TREINO.teto[1] * (tal == null ? 50 : tal);
  // Chegou ao limite: ainda treinaria pela idade, mas a nota já bateu o teto (com a folga dele). Só o servidor sabe (precisa do talento).
  const chegouAoTeto = (j, tal) => tal != null && ritmoDaIdade(j.idade) > 0 && notaDeTeto(j) >= tetoDaNota(tal) + folgaDoTeto(j.id, tal);

  // Fração de sessão que vale cada rodada: o grupo com menos rodadas treina mais por rodada e soma o mesmo na temporada (1 sem rodadas)
  const fatorDaTemporada = rodadas => rodadas > 0 ? CONFIG_TREINO.rodadasDeReferencia / rodadas : 1;
  // Multiplicador do caminho: proporcional ao tamanho do caminho do jogador. teto: o teto da nota.
  function fatorDoCaminho(j, teto) {
    const C = CONFIG_TREINO;
    return Math.max(C.caminho.minimo, teto - C.caminho.partida) / C.caminho.divisor;
  }
  // Pontos de uma sessão para o jogador, antes de dividir pelos focos. tal: talento (só o servidor sabe); teto: estimativa do teto, para as telas
  // (meio da faixa do olheiro). Sem nenhum dos dois, a conta usa o teto típico e serve só de referência.
  function pontosDaSessao(j, { ct = 0, jogou = false, tal = null, teto = null } = {}) {
    const C = CONFIG_TREINO, equ = (j.at[IDX.equ] - ATR_MIN) / (ATR_MAX - ATR_MIN);
    return C.pontosPorSessao * ritmoDaIdade(j.idade) * (C.ct[0] + C.ct[1] * (ct || 0)) * (C.equipe[0] + (C.equipe[1] - C.equipe[0]) * equ) * (jogou ? 1 + C.bonusPorJogar : 1)
      * (treinandoPosicao(j) ? 1 - CONFIG_POSICAO.custoDoTreino : 1)
      * fatorDoCaminho(j, teto != null ? teto : tal != null ? tetoDaNota(tal) : C.caminho.tetoTipico);
  }
  // Quanto de cada sessão vai para cada atributo: { índice: fração }. Atributo cheio (50) passa a vez aos outros do foco; com o foco todo cheio,
  // os pontos vão para os demais atributos que pesam na posição, na proporção do peso.
  function partilha(j) {
    const f = focoDoJogador(j), C = CONFIG_TREINO, principal = FOCOS[f.p].at.map(k => IDX[k]), comp = f.c.filter(i => !principal.includes(i));
    const bruta = {}, pp = comp.length ? C.partePrincipal : 1;
    principal.forEach(i => { bruta[i] = pp / principal.length; });
    comp.forEach(i => { bruta[i] = (1 - pp) / comp.length; });
    const vivos = Object.entries(bruta).filter(([i]) => j.at[i] < ATR_MAX);
    if (vivos.length === Object.keys(bruta).length) return bruta;
    const partes = {}, soma = vivos.reduce((t, [, v]) => t + v, 0);
    if (soma > 0) { vivos.forEach(([i, v]) => { partes[i] = v / soma; }); return partes; }
    const pesos = pesosDe(j.at, (POSICOES[j.pos] || {}).papel) || {}, resto = Object.keys(pesos).filter(k => j.at[IDX[k]] < ATR_MAX && treinavel(j.pos, IDX[k]));
    const total = resto.reduce((t, k) => t + pesos[k], 0);
    resto.forEach(k => { partes[IDX[k]] = pesos[k] / total; });
    return partes;
  }

  // Uma sessão de treino. j: { idade, pos, at, treino, pts }. tal: talento oculto (só o servidor sabe).
  // areas: multiplicadores de qualidadeDoTreino (sem eles, tudo 100%).
  // Devolve { at, pts, subiu: [índices] } quando algo mudou, ou null (velho demais, ou já no teto).
  // fator: fração de uma sessão (a liga de base dá um bônus de 20% de sessão a quem jogou).
  function treinar(j, { tal = null, ct = 0, jogou = false, areas = null, fator = 1 } = {}) {
    const total = pontosDaSessao(j, { ct, jogou, tal }) * fator;
    if (total <= 0 || chegouAoTeto(j, tal) || (tal == null && notaDeTeto(j) >= tetoDaNota(tal))) return null;
    const at = j.at.slice(), pts = at.map((_, i) => (j.pts && j.pts[i]) || 0), subiu = [], C = CONFIG_TREINO;
    for (const [i, parte] of Object.entries(partilha(j))) {
      if (at[i] >= ATR_MAX) continue;
      pts[i] += Math.round(total * parte * multDoAtributo(areas, i));
      while (pts[i] >= C.pontosPorNivel && at[i] < ATR_MAX) { pts[i] -= C.pontosPorNivel; at[i]++; subiu.push(+i); }
      if (at[i] >= ATR_MAX) pts[i] = 0;
    }
    return { at, pts, subiu };
  }
  return { CONFIG_TREINO, AREAS, AREA_DO_ATRIBUTO, qualidadeDoTreino, ctDoClube, multDoAtributo, ritmoDaIdade, FOCOS, focoDaPosicao, treinavel, focoAutomatico, focoDoJogador, CONFIG_POSICAO, ritmoDaPosicao, posicaoEmEstudo, distanciaDaPosicao, custoDaPosicao, treinandoPosicao, pontosDePosicao, aprenderPosicao, AVISO_DE_DEGRAU_DIAS, degrauRecente, prazoDaPosicao, folgaDoTeto, tetoDaNota, chegouAoTeto, fatorDaTemporada, fatorDoCaminho, pontosDaSessao, partilha, treinar };
})();

const __ligabase = (() => {
  // Liga de base: os juvenis de cada grupo jogam um turno único (9 rodadas), espelhando o primeiro turno da liga principal.
  // O time é montado sozinho: entram os juvenis de verdade e, só nas vagas que faltarem para completar onze (goleiro incluso), garotos da escolinha,
  // que não existem fora da partida. Não há lesão, cartão, experiência, forma, moral nem bilheteria: ficam o placar, os gols e as notas,
  // e quem jogou 45 minutos ganha um bônus de treino. Módulo puro: usado pela função do servidor.
  // Rodízio: quem jogou menos minutos na temporada da base tem a preferência para começar, e os juvenis que não começam são sugeridos para entrar
  // no intervalo (até cinco), no lugar dos garotos da escolinha, depois dos profissionais e depois de quem mais jogou. Assim até 16 juvenis jogam 45 minutos.
  // O dirigente pode montar o banco (até nove, como no time principal) e as substituições dele no lugar das sugeridas.
  const { ATRIBUTOS_DA_T0, LISTA_POSICOES, notaBruta, notaNaPosicao } = __modelo;
  const { limitar } = __rng;
  const { FORMACOES, TAMANHO_DO_BANCO } = __escalacao;
  const { taticaBot, FORMACOES_BOT } = __bot;
  const CONFIG_LIGA_DE_BASE = {
    escolinha: [13, 1.2], // nota do garoto da escolinha: 13 + 1,2 por nível da base (o juvenil de verdade chega com 15 + 1,5 por nível e treina)
    nivelDoBot: 2,        // clube sem dirigente não tem juvenis: os garotos dele valem os de uma base de nível 2
    nivelDeFora: 4,       // na Libertadores Juvenil, o clube de fora sem dirigente joga com garotos de uma base de nível 4 (101_libertadores_juvenil.sql)
    bonusDeTreino: 0.2,   // fração de uma sessão de treino para quem jogou: equivale ao bônus de 10% por jogar em duas rodadas da liga
    minutos: 45,
    idadeMaxima: 21,      // profissional joga a base até esta idade (só em clube com dirigente)
    contratados: 3,       // contratados (nem formados no clube nem do elenco inicial) que entram por partida da base
    premio: 200,          // mil, ao campeão de cada grupo, pagos pelo fundo da liga
    trocas: 5,            // juvenis que entram no intervalo (as cinco substituições do motor)
    estudo: 10,           // pontos de nota a mais, na escolha da vaga, para a posição que o jogador está aprendendo (jogar nela acelera o estudo)
    rodizio: 10,          // pontos de nota a menos, na escolha de quem começa, por partida inteira (90 minutos) já jogada na base
  };
  const FORMACOES_DA_BASE = FORMACOES_BOT; // as mesmas que o bot usa
  // Profissional contratado, para a base: chegou por contratação (chegou_temporada preenchido) e não é formado no clube.
  // O elenco inicial nunca passou por contratação (chegou_temporada vazio) e joga a base como o formado.
  const contratadoNaBase = (formador, chegou, clubeId) => chegou != null && String(formador) !== String(clubeId);

  function garotoDaEscolinha(rng, pos, nivel, id) {
    const at = ATRIBUTOS_DA_T0.map(a => limitar(Math.round((a.grupo === "gol" && pos !== "GK" ? 3 : nivel) + rng.normal(0, 2)), 1, 50));
    return { id, nome: "Garoto da escolinha", pais: "Brasil", idade: 16, pos, fam: { [pos]: "N" }, at, pe: "D", escolinha: true };
  }

  // Escolhe o esquema e distribui as vagas. A ordem de preferência: juvenil numa posição que conhece (natural ou competente); juvenil improvisado
  // numa vaga de linha (ele não tem outro jogo para jogar); profissional de até 21 anos (contratado: true conta no limite de contratados), numa posição que conhece;
  // e só então garoto da escolinha. Entre os esquemas, vale o que encaixa mais juvenis, depois mais profissionais, depois a maior soma de notas.
  // Quem está aprendendo uma posição joga nela sempre que o esquema tiver a vaga: conta como posição conhecida e tem a preferência.
  // minutos: { id: minutos já jogados na base nesta temporada }, para o rodízio (o juvenil que jogou menos tem a preferência para começar).
  // Tática da base (100_tatica_da_base.sql): formacao = as 11 posições do time principal (sem ela, vale o esquema que melhor encaixa);
  // fixos = { índice da vaga: id do jogador } que o dirigente pôs na vaga (só não vale goleiro na linha nem jogador de linha no gol);
  // as vagas abertas são preenchidas como sempre, e o fixado não sai no intervalo.
  // trocas = [{ entra: id, vaga: índice ou null }]: quem o dirigente põe para entrar no intervalo (vaga nula = a que o rodízio escolheria);
  // valem antes das automáticas, e as automáticas completam as cinco. Não vale quem já começa, vaga fixada nem goleiro fora do gol.
  // { entra: null, vaga }: troca tirada pelo dirigente; quem começa nessa vaga joga os 90 e o intervalo tem uma troca a menos.
  // Essas trocas do intervalo são as sugeridas. banco = [ids] que o dirigente pôs no banco, fora = [ids] que ele tirou (o rodízio não os senta) (até TAMANHO_DO_BANCO; não começam, a não ser fixados); o rodízio completa, primeiro com
  // quem entra nas sugeridas, depois com os juvenis que jogaram menos e por fim com os profissionais. subs = [{ min, vaga, entra: id, pos, cond }]: as substituições do dirigente, como na
  // tática principal, com a vaga (índice) no lugar de quem sai, porque o rodízio muda quem começa; sem subs (nem a lista vazia), valem as sugeridas.
  // Só vale quem está no banco, uma vez cada, até cinco, e o contratado dentro do limite.
  // Devolve { nome, vagas: [{ pos, j, fixo }] (j nulo = vaga de garoto), trocas: [{ vaga (índice), entra, manual }] no intervalo, semTroca: [vagas sem troca], fora: [juvenis sem jogo],
  // banco: [jogador], sugeridas e subs: [{ min, vaga, entra: jogador, pos, cond }] (subs = as que valem), propria: o dirigente montou as subs }.
  function escalacaoDaBase(juvenis, profissionais = [], minutos = {}, { formacao = null, fixos = null, trocas: manuais = null, banco: escolhidos = null, fora: tirados = null, subs: minhas = null } = {}) {
    const C = CONFIG_LIGA_DE_BASE, jogou = j => minutos[j.id] || 0;
    const estuda = (j, pos) => !!j.aprende && j.aprende.pos === pos && (j.fam || {})[pos] !== "N";
    const valor = (j, pos) => notaNaPosicao(j, pos) + (estuda(j, pos) ? C.estudo : 0) - (j.juvenil === false ? 0 : C.rodizio * jogou(j) / 90);
    const encaixar = (vagas, lista, contratados = 0) => { // cada jogador na vaga conhecida de maior valor; devolve [quantos entraram, soma dos valores, quem sobrou]
      const livres = new Set(lista); let soma = 0, n = 0;
      for (;;) {
        let m = null;
        for (const v of vagas) if (!v.j) for (const j of livres) {
          if (j.contratado && contratados >= C.contratados) continue;
          const f = (j.fam || {})[v.pos]; if (f !== "N" && f !== "C" && !estuda(j, v.pos)) continue;
          const nota = valor(j, v.pos); if (!m || nota > m.nota) m = { v, j, nota };
        }
        if (!m) break;
        m.v.j = m.j; livres.delete(m.j); soma += m.nota; n++; if (m.j.contratado) contratados++;
      }
      return [n, soma, [...livres]];
    };
    const doClube = vagasValidas(formacao);
    const esquemas = doClube ? [["do time principal", formacao]] : FORMACOES_DA_BASE.map(nome => [nome, FORMACOES[nome]]);
    const mesmoId = (j, id) => String(j.id).replace(/^j/, "") === String(id);
    const reserva = j => Array.isArray(escolhidos) && escolhidos.some(id => mesmoId(j, id)); // quem o dirigente pôs no banco não começa (só se estiver fixado numa vaga)
    let melhor = null;
    for (const [nome, posicoes] of esquemas) {
      const vagas = posicoes.map(pos => ({ pos, j: null })), fixados = new Set();
      let contratados = 0;
      for (const [i, id] of Object.entries(fixos || {})) {
        const v = vagas[i], j = [...juvenis, ...profissionais].find(x => mesmoId(x, id));
        if (j && j.contratado && contratados >= C.contratados) continue;
        if (v && !v.j && j && !fixados.has(j) && (v.pos === "GK") === (j.pos === "GK")) { v.j = j; v.fixo = true; fixados.add(j); if (j.contratado) contratados++; }
      }
      const [nJ, somaJ, fora] = encaixar(vagas, juvenis.filter(j => !fixados.has(j) && !reserva(j)));
      for (const j of fora.slice().sort((a, b) => valor(b, b.pos) - valor(a, a.pos))) { // improvisados: nunca no gol, e goleiro nunca na linha
        if (j.pos === "GK") continue;
        const v = vagas.filter(x => !x.j && x.pos !== "GK").sort((a, b) => notaNaPosicao(j, b.pos) - notaNaPosicao(j, a.pos))[0];
        if (v) { v.j = j; fora.splice(fora.indexOf(j), 1); }
      }
      fora.push(...juvenis.filter(j => !fixados.has(j) && reserva(j)));
      const [nP, somaP] = encaixar(vagas, profissionais.filter(j => !fixados.has(j) && !reserva(j)), contratados), pontos = nJ * 1e6 + nP * 1e4 + somaJ + somaP;
      if (!melhor || pontos > melhor.pontos) melhor = { nome, vagas, fora, pontos };
    }
    // intervalo: os que ficaram de fora entram, primeiro quem jogou menos; cada um na vaga de um garoto, depois na de um profissional e por fim
    // na do juvenil que mais jogou, de preferência numa posição que conhece (goleiro só no gol, e ninguém de linha no gol)
    const reservas = melhor.fora.slice().sort((a, b) => jogou(a) - jogou(b) || notaBruta(b.at, b.pos) - notaBruta(a.at, a.pos));
    const trocas = [], usadas = new Set(), entram = new Set(), emCampo = new Set(melhor.vagas.map(v => v.j).filter(Boolean));
    let contratados = melhor.vagas.filter(v => v.j && v.j.contratado).length;
    const podeEm = (j, i) => { const v = melhor.vagas[i]; return !!v && !usadas.has(i) && !v.fixo && (v.pos === "GK") === (j.pos === "GK"); };
    const melhorVaga = j => {
      const conhece = pos => estuda(j, pos) ? 2 : +["N", "C"].includes((j.fam || {})[pos]), tipo = v => !v.j ? 0 : v.j.juvenil ? 2 : 1;
      const cand = melhor.vagas.map((v, i) => ({ v, i })).filter(({ i }) => podeEm(j, i))
        .sort((a, b) => conhece(b.v.pos) - conhece(a.v.pos) || tipo(a.v) - tipo(b.v) || (a.v.j && b.v.j ? jogou(b.v.j) - jogou(a.v.j) : 0) || notaNaPosicao(j, b.v.pos) - notaNaPosicao(j, a.v.pos));
      return cand.length ? cand[0].i : null;
    };
    const entrar = (j, i, manual) => { usadas.add(i); entram.add(j); trocas.push({ vaga: i, entra: j, manual }); if (j.contratado) contratados++; };
    const semTroca = [], cheio = () => trocas.length + semTroca.length >= C.trocas;
    for (const { entra: id, vaga } of Array.isArray(manuais) ? manuais : []) {
      if (id == null) { const v = melhor.vagas[vaga]; if (vaga != null && v && !v.fixo && !usadas.has(+vaga) && !cheio()) { usadas.add(+vaga); semTroca.push(+vaga); } continue; }
      const j = [...juvenis, ...profissionais].find(x => mesmoId(x, id));
      if (cheio() || !j || emCampo.has(j) || entram.has(j) || (j.contratado && contratados >= C.contratados)) continue;
      const i = vaga == null ? melhorVaga(j) : +vaga;
      if (i != null && podeEm(j, i)) entrar(j, i, true);
    }
    for (const j of reservas) {
      if (cheio()) break;
      if (entram.has(j) || (j.contratado && contratados >= C.contratados)) continue;
      const i = melhorVaga(j); if (i != null) entrar(j, i, false);
    }
    const todos = [...juvenis, ...profissionais], porId = id => todos.find(x => mesmoId(x, id)), banco = [];
    const sentar = j => { if (j && !emCampo.has(j) && !banco.includes(j) && banco.length < TAMANHO_DO_BANCO) banco.push(j); };
    for (const id of Array.isArray(escolhidos) ? escolhidos : []) sentar(porId(id));
    const completar = j => { if (!(Array.isArray(tirados) && tirados.some(id => mesmoId(j, id)))) sentar(j); }; // quem o dirigente tirou do banco o rodízio não põe de volta
    trocas.forEach(x => completar(x.entra)); reservas.forEach(completar);
    profissionais.slice().sort((a, b) => notaNaPosicao(b, b.pos) - notaNaPosicao(a, a.pos)).forEach(completar); // depois dos juvenis, os profissionais que sobraram
    const sugeridas = trocas.filter(x => banco.includes(x.entra)).map(x => ({ min: 45, vaga: x.vaga, entra: x.entra, pos: melhor.vagas[x.vaga].pos, cond: "sempre" }));
    const propria = Array.isArray(minhas), subs = [];
    let nContratados = melhor.vagas.filter(v => v.j && v.j.contratado).length;
    for (const s of propria ? minhas : sugeridas) {
      const j = propria ? porId(s.entra) : s.entra, vaga = +s.vaga;
      if (subs.length >= C.trocas || !j || !banco.includes(j) || !melhor.vagas[vaga] || subs.some(x => x.entra === j) || (j.contratado && nContratados >= C.contratados)) continue;
      if (j.contratado) nContratados++;
      subs.push({ min: Math.max(0, Math.min(89, +s.min || 0)), vaga, entra: j, pos: s.pos || melhor.vagas[vaga].pos, cond: s.cond || "sempre" });
    }
    return { nome: melhor.nome, vagas: melhor.vagas, trocas, semTroca, fora: reservas.filter(j => !entram.has(j)), banco, sugeridas, subs, propria };
  }

  // juvenis e profissionais: os de verdade, no formato do motor. Devolve a tática pronta da partida: { escalacao: [{ j, pos }], banco, instrucoes },
  // com um garoto da escolinha em cada vaga que sobrou, o banco e as substituições (as do dirigente ou as sugeridas).
  // 11 posições conhecidas, um goleiro só
  const vagasValidas = f => Array.isArray(f) && f.length === 11 && f.every(p => LISTA_POSICOES.includes(p)) && f.filter(p => p === "GK").length === 1;
  // Esquema da base: as vagas que o dirigente montou para ela (tatica.vagas, livres como na tática principal), um esquema pronto (tatica.esquema,
  // nome de FORMACOES, das versões antigas) ou, sem nada, o do time principal.
  const esquemaDaBase = (tatica, principal) => (tatica && vagasValidas(tatica.vagas) ? tatica.vagas : tatica && FORMACOES[tatica.esquema]) || principal || null;

  function timeDaBase(rng, { juvenis = [], profissionais = [], nivel: nivelDaBase = 0, prefixo = "", minutos = {}, perfil = null, formacao = null, tatica = null } = {}) {
    const nivel = CONFIG_LIGA_DE_BASE.escolinha[0] + CONFIG_LIGA_DE_BASE.escolinha[1] * (nivelDaBase || 0);
    const e = escalacaoDaBase(juvenis.map(j => ({ ...j, juvenil: true })), profissionais.map(j => ({ ...j, juvenil: false })), minutos, { formacao: esquemaDaBase(tatica, formacao), fixos: tatica && tatica.fixos, trocas: tatica && tatica.trocas, banco: tatica && tatica.banco, fora: tatica && tatica.fora, subs: tatica && tatica.subs });
    const escalacao = e.vagas.map((v, i) => ({ j: v.j || garotoDaEscolinha(rng, v.pos, nivel, "e" + prefixo + "_" + i), pos: v.pos }));
    const instrucoes = { ...taticaBot(escalacao.map(x => x.j), { perfil }).instrucoes, ...instrucoesDaBase(tatica && tatica.instr) }; // capitão, cobradores e estilo, como o bot faria com estes onze; o estilo escolhido pelo dirigente vale por cima
    instrucoes.substituicoes = e.subs.map(s => ({ min: s.min, sai: escalacao[s.vaga].j.id, entra: s.entra.id, pos: s.pos, cond: s.cond }));
    return { escalacao, banco: e.banco, instrucoes };
  }

  // Instruções que o dirigente pode escolher para a base, com as opções de cada uma (as mesmas da tática principal).
  const INSTRUCOES_DA_BASE = {
    mentalidade: [-2, -1, 0, 1, 2], agressividade: [-2, -1, 0, 1, 2], pressao: [0, 1, 2],
    passe: ["misto", "curto", "longo"], lado: ["misto", "E", "C", "D", "lados"], finalizar: ["misto", "longe", "area"], cruzamento: ["misto", "alto", "rasteiro"],
    contraAtaque: [false, true], impedimento: [false, true], cera: [false, true],
  };
  // Só o que é válido passa; o que faltar fica como o bot faria.
  function instrucoesDaBase(instr) {
    const r = {};
    for (const [k, opcoes] of Object.entries(INSTRUCOES_DA_BASE)) if (instr && opcoes.includes(instr[k])) r[k] = instr[k];
    return r;
  }
  return { CONFIG_LIGA_DE_BASE, contratadoNaBase, garotoDaEscolinha, escalacaoDaBase, vagasValidas, esquemaDaBase, timeDaBase, INSTRUCOES_DA_BASE, instrucoesDaBase };
})();

const __economia = (() => {
  // Economia: salários, cláusula e contratos. Valores em milhares por temporada.
  const { melhorPosicao } = __modelo;
  const MULTIPLO_DA_CLAUSULA = 5;   // cláusula de saída = 5 vezes o salário da temporada
  const MAXIMO_INDIVIDUAL = 0.15;   // um jogador ganha no máximo 15% do teto de folha
  const PESO_DO_FORMADO = 0.85;    // jogador formado no clube conta 85% do salário no teto (87_formado_no_teto.sql); o salário pago é cheio
  const MAXIMO_DE_TEMPORADAS = 3;

  // O mínimo que o jogador aceita: cresce 14% a cada ponto de nota, com a nota 41 no mesmo valor da curva antiga de 12% (reinício,
  // docs/superpowers/specs/2026-10-24-calibragem-do-reinicio.md); jovem pede 20% menos e veterano 10% menos.
  // Nota 25 → 190 mil; 30 → 360 mil; 35 → 700 mil; 38 → 1,03 mi; 41 → 1,535 mi; 43 → 1,99 mi.
  const SALARIO_DA_NOTA_41 = 250 * Math.pow(1.12, 16), CURVA_DO_SALARIO = 1.14;
  function salarioDeMercado(j) {
    const nota = melhorPosicao(j).nota, idade = j.idade <= 21 ? 0.8 : j.idade >= 31 ? 0.9 : 1;
    return Math.max(50, Math.round(SALARIO_DA_NOTA_41 * Math.pow(CURVA_DO_SALARIO, nota - 41) * idade / 5) * 5);
  }
  const clausula = salario => salario * MULTIPLO_DA_CLAUSULA;
  // Valor de hoje do jogador: o maior entre o salário do contrato, o salário de mercado gravado e o de mercado pela nota atual.
  // A multa rescisória e o salário mínimo de quem compra pela multa partem dele (66_multa_e_bots.sql).
  const valorDeHoje = j => Math.max(j.salario || 0, j.salario_mercado || j.mercado || 0, j.at ? salarioDeMercado(j) : 0);
  const multaDe = j => clausula(valorDeHoje(j));
  // Contrato mais longo pede mais: 2 temporadas, salário de mercado + 10%; 3 temporadas, + 20% (52_pacote_da_economia.sql).
  const ADICIONAL_POR_TEMPORADA = 0.1;
  const minimoPelaDuracao = (mercado, temporadas) => Math.round((mercado || 0) * (1 + ADICIONAL_POR_TEMPORADA * (Math.max(1, temporadas) - 1)));
  // Luvas (68_economia.sql): na renovação, o clube paga de uma vez, fora da folha, para o jogador aceitar um salário menor que o pedido.
  // Cada mil a menos por temporada custa 1,5 mil de luvas por temporada de contrato, e o salário fica em no mínimo 70% do pedido.
  const LUVAS = { fator: 1.5, piso: 0.7 };
  const salarioMinimoComLuvas = pede => Math.round(pede * LUVAS.piso);
  const luvasDaRenovacao = (pede, salario, temporadas) => Math.max(0, Math.ceil((pede - salario) * LUVAS.fator * Math.max(1, temporadas)));
  // Manutenção por temporada (68_economia.sql): 20% do que foi gasto nas quatro estruturas e 4% do que foi gasto no estádio (era 10% e 2%)
  const MANUTENCAO = { estruturas: 0.2, estadio: 0.04 };
  // Estádio: níveis 1 a 5 de 10 a 30 mil lugares; 6, 7 e 8 com 40, 50 e 60 mil (55_estadio_torcida_e_publico.sql)
  const NIVEL_MAXIMO_DO_ESTADIO = 8;
  const lugaresDoEstadio = nivel => { const n = Math.max(1, nivel || 1); return n <= 5 ? 5000 + 5000 * n : [40000, 50000, 60000][Math.min(8, n) - 6]; };
  // Refletores (a partir do nível 4) e estacionamento (nível 0 a 3, a cada dois níveis do estádio): fixos, com bônus de público e manutenção (117_refletores_e_estacionamento.sql)
  const EXTRAS_DO_ESTADIO = { nivelDosRefletores: 4, publicoRefletores: 0.03, publicoPorEstacionamento: 0.02, manutRefletores: 60, manutPorEstacionamento: 40 };
  const temRefletores = nivel => (nivel || 1) >= EXTRAS_DO_ESTADIO.nivelDosRefletores;
  const estacionamentoDoEstadio = nivel => Math.floor((Math.min(8, Math.max(1, nivel || 1)) - 1) / 2);
  const bonusDoEstadio = nivel => 1 + (temRefletores(nivel) ? EXTRAS_DO_ESTADIO.publicoRefletores : 0) + EXTRAS_DO_ESTADIO.publicoPorEstacionamento * estacionamentoDoEstadio(nivel);
  // Comida e bebida em dia de jogo (118_comida_no_estadio.sql): R$ 4 + 0,50 por nível, vezes 0,8 a 1,2 pelo humor; todo o público, sem taxa do fundo; bares custam 20 mil por nível na manutenção
  const COMIDA = { base: 4, porNivel: 0.5, manutPorNivel: 20 };
  const nivelDoEstadio = nivel => Math.min(8, Math.max(1, nivel || 1));
  const comidaPorTorcedor = (nivel, humor = 8) => Math.round((COMIDA.base + COMIDA.porNivel * nivelDoEstadio(nivel)) * (0.8 + 0.4 * Math.min(16, Math.max(0, humor ?? 8)) / 16) * 100) / 100;
  // Operação do jogo (122): segurança, staff e limpeza, R$ 0,10 × nível² por torcedor; o mandante paga, na copa meio a meio
  const OPERACAO = { porNivel2: 0.10 };
  const custoDeOperacao = nivel => Math.round(OPERACAO.porNivel2 * nivelDoEstadio(nivel) ** 2 * 100) / 100;
  const manutencaoExtraDoEstadio = nivel => (temRefletores(nivel) ? EXTRAS_DO_ESTADIO.manutRefletores : 0) + EXTRAS_DO_ESTADIO.manutPorEstacionamento * estacionamentoDoEstadio(nivel) + COMIDA.manutPorNivel * nivelDoEstadio(nivel);
  // Prestígio (clubes.torcida_fator): multiplica a torcida-base da divisão; a torcida oscila entre 80% e 140% do resultado
  const PRESTIGIO_MAXIMO = 2.15;
  // Teto de folha por divisão (em milhares por temporada), para quem não lê a tabela de divisões
  const TETO_DE_FOLHA = { 1: 19000, 2: 15000 };

  // Contrato inicial de um jogador gerado: salário de mercado, duração sorteada de 1 a 3 temporadas (contando a atual)
  // e proteção contra a cláusula até o fim da primeira temporada.
  function contratoInicial(rng, j, temporada) {
    const mercado = salarioDeMercado(j);
    return { salario: mercado, mercado, contrato_ate: temporada + rng.int(0, 2), protegido_ate: temporada };
  }

  // Regras do fim de temporada e do clube no vermelho (as mesmas do 18_fim_de_temporada.sql).
  const PREMIO_MINIMO = { 1: 2000, 2: 1200 };         // prêmio do lanterna: é o que dá para antecipar (o mesmo de PREMIOS em virada.js)
  // Imposto em faixas (122_imposto_em_faixas_e_operacao.sql): isento até 1/4 do teto; 20% até 1/2; 35% até o teto; 50% acima
  const FAIXAS_DO_IMPOSTO = [[0.25, 0.2], [0.5, 0.35], [1, 0.5]];
  const impostoDoLucro = (lucro, teto) => Math.round(FAIXAS_DO_IMPOSTO.reduce((t, [de, taxa], i) => {
    const ate = FAIXAS_DO_IMPOSTO[i + 1] ? FAIXAS_DO_IMPOSTO[i + 1][0] * teto : Infinity;
    return t + taxa * Math.max(0, Math.min(lucro, ate) - de * teto); }, 0));
  const LIMITE_DA_DIVIDA = 0.10; // abaixo de 10% do teto no negativo...
  const RODADAS_DE_PRAZO = 3;    // ...3 rodadas para agir
  const valorNoBanco = salario => 3 * (salario || 0);          // clube no vermelho: o agente paga 3 vezes o salário de mercado
  const VENDAS_PELO_AGENTE = 6;                                // por temporada, fora do vermelho (150)
  // O agente paga com o fundo da liga (150). cotacao (0 a 1) diz quanto do preço cheio dá para pagar: de 1 vez o salário de mercado
  // (fundo vazio) a 2,5 vezes (fundo com 2 mi por dirigente); para clube no vermelho, de 1 a 3 vezes.
  // vendidas: vendas pelo agente já feitas na temporada; o extra cai na 3ª e na 5ª (109_agente_decrescente.sql). O vermelho não muda.
  const AGENTE_POR_VENDA = [1.5, 1.5, 1, 1, 0.5];
  const extraDoAgente = (vendidas = 0, vermelho = false) => vermelho ? 2 : AGENTE_POR_VENDA[Math.min(vendidas, AGENTE_POR_VENDA.length - 1)];
  const valorNoAgente = (mercado, vermelho = false, cotacao = 1, vendidas = 0) => Math.round((mercado || 0) * (1 + extraDoAgente(vendidas, vermelho) * Math.max(0, Math.min(1, cotacao == null ? 1 : cotacao))));
  // Venda negociada: o valor fica entre 60% e 150% da multa rescisória (3 a 7,5 vezes o salário), como no 22_travas_da_negociacao.sql.
  const faixaDaNegociacao = salario => ({ minimo: 3 * (salario || 0), maximo: Math.round(7.5 * (salario || 0)) });
  // 440 → "440 mil"; 1370 → "1,37 mi"
  const dinheiro = mil => mil == null ? "—" : Math.abs(mil) >= 1000 ? (mil / 1000).toFixed(2).replace(".", ",") + " mi" : mil + " mil"; // espaço que não quebra: "7,97 mi" nunca se parte em duas linhas
  return { MULTIPLO_DA_CLAUSULA, MAXIMO_INDIVIDUAL, PESO_DO_FORMADO, MAXIMO_DE_TEMPORADAS, SALARIO_DA_NOTA_41, salarioDeMercado, clausula, valorDeHoje, multaDe, ADICIONAL_POR_TEMPORADA, minimoPelaDuracao, LUVAS, salarioMinimoComLuvas, luvasDaRenovacao, MANUTENCAO, NIVEL_MAXIMO_DO_ESTADIO, lugaresDoEstadio, EXTRAS_DO_ESTADIO, temRefletores, estacionamentoDoEstadio, bonusDoEstadio, COMIDA, comidaPorTorcedor, OPERACAO, custoDeOperacao, manutencaoExtraDoEstadio, PRESTIGIO_MAXIMO, TETO_DE_FOLHA, contratoInicial, PREMIO_MINIMO, FAIXAS_DO_IMPOSTO, impostoDoLucro, LIMITE_DA_DIVIDA, RODADAS_DE_PRAZO, valorNoBanco, VENDAS_PELO_AGENTE, AGENTE_POR_VENDA, extraDoAgente, valorNoAgente, faixaDaNegociacao, dinheiro };
})();

const __mercadobots = (() => {
  // Mercado entre bots: uma vez por janela, clubes sem dono compram reservas de outros clubes sem dono que melhoram o time titular.
  // Não depende do banco: recebe clubes e elencos e devolve os negócios; quem grava (e confere tudo de novo) é transferir_entre_bots,
  // do 66_multa_e_bots.sql, chamado pela função "rodada".
  // - O talento sobe: o bot só compra de clubes da mesma divisão ou de uma abaixo, e as divisões de cima escolhem primeiro.
  // - Quem vende tem critério: só reserva com mais de 21 anos, e primeiro o que sobra (posição com reservas de sobra, veterano).
  // - Bot no vermelho vende mais barato e para quem ganha menos com o reforço, até dois jogadores por janela.
  const { notaNaPosicao, notaComPe, POSICOES } = __modelo;
  const { taticaBot } = __bot;
  const { salarioDeMercado } = __economia;
  const CONFIG_MERCADO_BOTS = {
    porJanela: 10,          // negócios por janela na liga inteira, no máximo
    precoEmSalarios: 4,     // preço = 4 vezes o salário de mercado do jogador (entre a venda pelo agente, 2,5, e a multa, 5)
    precoNoVermelho: 3,     // quem está no vermelho vende por 3 vezes
    ganhoMinimo: 1.5,       // o reforço precisa render pelo menos 1,5 ponto de nota a mais que o titular que ele substitui
    ganhoNoVermelho: 0.5,   // comprando de quem está no vermelho, basta 0,5
    bonusDaSobra: 1,        // entre reforços parecidos, o comprador prefere o que sobra no vendedor
    idadeMinima: 22,        // jovem de até 21 anos não é vendido
    idadeMaxima: 31,        // bot não compra veterano
    veterano: 30,           // a partir dos 30, o reserva conta como sobra
    reserva: 0.10,          // depois da compra, o caixa precisa ficar acima de 10% do teto de folha (168; era 25%)
    maximoIndividual: 0.15, // ninguém ganha mais de 15% do teto
    elencoMinimo: 19,       // quem vende fica com pelo menos 19 jogadores profissionais
    divisoesAbaixo: 1,      // compra da mesma divisão ou de até uma abaixo
    estrangeiros: 5,        // jogadores de outra nacionalidade por clube (82_mercado_entre_paises.sql)
    livresPorJanela: 8,     // livres contratados por bots por janela na liga inteira (113_bots_contratam_livres.sql): o resto fica para os dirigentes
  };

  // quantos jogadores do elenco têm nacionalidade diferente do país do clube, e se este jogador seria mais um
  const estrangeirosDe = (c, el) => (el || []).filter(j => estrangeiroEm(j, c)).length;
  const estrangeiroEm = (j, c) => !!j.pais && j.pais !== (c.pais || "Brasil");

  // clubes: [{ id, divisao, pais, caixa, teto }] (só os sem dono); elencos: { clube: [jogador no formato do motor, com salario, juvenil e aposentaEm] }
  // Devolve [{ jogador (id numérico), para, valor, salario, de, ganho }].
  function negociosEntreBots(rng, { clubes, elencos }, C = CONFIG_MERCADO_BOTS) {
    const num = id => +String(id).replace(/^\D+/, "");
    const porId = Object.fromEntries(clubes.map(c => [c.id, { ...c, folha: (elencos[c.id] || []).reduce((s, j) => s + (j.salario || 0), 0), vendas: 0, vermelho: (c.caixa || 0) < 0, estr: estrangeirosDe(c, elencos[c.id]) }]));
    const linha = j => (POSICOES[j.pos] || {}).linha || j.pos;
    // titulares de cada clube pela tática do bot; quem não é titular pode ser vendido
    const titulares = {}, vitrine = [];
    for (const c of clubes) {
      const el = (elencos[c.id] || []).filter(j => !j.juvenil);
      const t = el.length >= 11 ? taticaBot(el) : { escalacao: [] };
      titulares[c.id] = t.escalacao.map(x => ({ j: x.j, pos: x.pos, nota: notaNaPosicao(x.j, x.pos) }));
      const naEscalacao = new Set(t.escalacao.map(x => x.j.id)), goleiros = el.filter(j => j.pos === "GK").length;
      const reservas = el.filter(j => !naEscalacao.has(j.id)), reservasDaLinha = {};
      reservas.forEach(j => { reservasDaLinha[linha(j)] = (reservasDaLinha[linha(j)] || 0) + 1; });
      for (const j of reservas) {
        if (j.salario == null || j.aposentaEm != null || j.idade < C.idadeMinima || j.idade > C.idadeMaxima) continue;
        if (j.pos === "GK" && goleiros <= 2) continue; // não vende o segundo goleiro
        const sobra = j.idade >= C.veterano || reservasDaLinha[linha(j)] >= 3;
        // fora do vermelho, o clube só vende quem sobra ou quem deixa outro reserva na mesma linha
        if (!porId[c.id].vermelho && !sobra && reservasDaLinha[linha(j)] < 2) continue;
        vitrine.push({ j, de: c.id, mercado: salarioDeMercado(j), sobra });
      }
    }
    const negocios = [];
    // as divisões de cima escolhem primeiro; dentro da divisão, a ordem é sorteada
    const compradores = rng.embaralhar(clubes.map(c => c.id)).sort((a, b) => (porId[a].divisao || 3) - (porId[b].divisao || 3));
    for (const id of compradores) {
      if (negocios.length >= C.porJanela) break;
      const b = porId[id];
      let melhor = null;
      // goleiro: o bot só procura outro se o dele for pior que a média dos titulares de linha (senão os bons goleiros sobem todos de divisão)
      const deLinha = (titulares[id] || []).filter(x => x.pos !== "GK"), mediaDaLinha = deLinha.length ? deLinha.reduce((s, x) => s + x.nota, 0) / deLinha.length : 0;
      for (const vaga of titulares[id] || []) {
        if (vaga.pos === "GK" && vaga.nota >= mediaDaLinha) continue;
        for (const o of vitrine) {
          const v = porId[o.de];
          if (o.de === id || o.vendido || v.vendas >= (v.vermelho ? 2 : 1) || (vaga.pos === "GK") !== (o.j.pos === "GK")) continue;
          if (estrangeiroEm(o.j, b) && b.estr >= C.estrangeiros) continue;
          const dv = (v.divisao || 3) - (b.divisao || 3);
          if (dv < 0 || dv > C.divisoesAbaixo) continue; // o talento só sobe ou fica na mesma divisão
          const ganho = notaNaPosicao(o.j, vaga.pos) - vaga.nota;
          if (ganho < (v.vermelho ? C.ganhoNoVermelho : C.ganhoMinimo)) continue;
          const pontos = ganho + (o.sobra ? C.bonusDaSobra : 0);
          if (melhor && pontos <= melhor.pontos) continue;
          const valor = Math.round((v.vermelho ? C.precoNoVermelho : C.precoEmSalarios) * o.mercado), salario = Math.max(o.mercado, o.j.salario || 0);
          if (b.caixa - valor < C.reserva * b.teto || b.folha + salario > b.teto || salario > C.maximoIndividual * b.teto) continue;
          if ((elencos[o.de] || []).filter(j => !j.juvenil).length - v.vendas <= C.elencoMinimo) continue;
          melhor = { o, ganho, pontos, valor, salario };
        }
      }
      if (!melhor) continue;
      melhor.o.vendido = true; b.caixa -= melhor.valor; b.folha += melhor.salario; if (estrangeiroEm(melhor.o.j, b)) b.estr++;
      const v = porId[melhor.o.de]; v.vendas++; v.caixa += melhor.valor; v.folha -= melhor.o.j.salario || 0;
      negocios.push({ jogador: num(melhor.o.j.id), para: id, valor: melhor.valor, salario: melhor.salario, de: melhor.o.de, ganho: +melhor.ganho.toFixed(1), sobra: melhor.o.sobra, vermelho: v.vermelho });
    }
    return negocios;
  }

  // Bots compram da lista de transferência dos dirigentes (72_bots_compram_listados.sql). Pelo preço pedido, sem pechincha:
  // só se o preço couber na conta do bot (precoEmSalarios), se o jogador reforçar o time titular (ganhoMinimo) e um por bot por janela.
  // O banco só entrega em `listados` quem já esperou o prazo na lista sem proposta de dirigente; quem fecha (e confere tudo de novo) é bot_compra_listado.
  // listados: [{ j (formato do motor, com salario, juvenil e aposentaEm), preco }]; jaCompraram: ids dos bots que já compraram nesta janela.
  // Devolve [{ jogador (id numérico), para, valor, salario, ganho }].
  function comprasDeListados({ clubes, elencos, listados, jaCompraram = [] }, C = CONFIG_MERCADO_BOTS) {
    const usados = new Set(jaCompraram), compras = [];
    const bots = clubes.map(c => { const el = (elencos[c.id] || []).filter(j => !j.juvenil);
      const onze = (el.length >= 11 ? taticaBot(el).escalacao : []).map(x => ({ pos: x.pos, nota: notaNaPosicao(x.j, x.pos) })), linha = onze.filter(x => x.pos !== "GK");
      return { ...c, onze, contratados: el.length, estr: estrangeirosDe(c, elencos[c.id]), folha: el.reduce((s, j) => s + (j.salario || 0), 0), mediaDaLinha: linha.length ? linha.reduce((s, x) => s + x.nota, 0) / linha.length : 0 }; });
    for (const { j, preco } of listados) {
      if (j.juvenil || j.aposentaEm != null || j.idade > C.idadeMaxima) continue;
      const mercado = salarioDeMercado(j), salario = Math.max(mercado, j.salario || 0);
      if (!(preco > 0) || preco > C.precoEmSalarios * mercado) continue; // acima da conta do bot: ele não paga
      let melhor = null;
      for (const b of bots) {
        if (usados.has(b.id) || b.contratados >= 30 || (estrangeiroEm(j, b) && b.estr >= C.estrangeiros)) continue;
        if (b.caixa - preco < C.reserva * b.teto || b.folha + salario > b.teto || salario > C.maximoIndividual * b.teto) continue;
        // goleiro: mesmo freio do mercado entre bots (só troca se o dele for pior que a média da linha)
        const ganho = Math.max(-99, ...b.onze.filter(v => (v.pos === "GK") === (j.pos === "GK") && !(v.pos === "GK" && v.nota >= b.mediaDaLinha)).map(v => notaNaPosicao(j, v.pos) - v.nota));
        if (ganho >= C.ganhoMinimo && (!melhor || ganho > melhor.ganho)) melhor = { b, ganho };
      }
      if (!melhor) continue;
      const b = melhor.b; usados.add(b.id); b.caixa -= preco; b.folha += salario; if (estrangeiroEm(j, b)) b.estr++;
      compras.push({ jogador: +String(j.id).replace(/^\D+/, ""), para: b.id, valor: preco, salario, ganho: +melhor.ganho.toFixed(1) });
    }
    return compras;
  }

  // Bots tapam buracos no banco com jogadores livres (113_bots_contratam_livres.sql). Buraco: titular sem reserva no elenco com 85% da nota
  // dele na posição (a mesma régua das trocas do bot). O livre precisa ter essa nota; o maior buraco escolhe primeiro, um livre por bot por janela.
  // O banco só entrega em `livres` quem está livre há o prazo, sem leilão; quem contrata (e confere tudo de novo) é bot_contrata_livre.
  // livres: [{ j (formato do motor), salario }]; jaContrataram: ids dos bots que já contrataram livre nesta janela.
  // Devolve [{ jogador (id numérico), para, salario, buraco, fica }] (buraco e fica: reserva antes e depois, em fração da nota do titular).
  function livresParaOsBots({ clubes, elencos, livres, jaContrataram = [] }, C = CONFIG_MERCADO_BOTS) {
    const usados = new Set(jaContrataram), pedidos = [];
    for (const b of clubes) {
      const el = (elencos[b.id] || []).filter(j => !j.juvenil);
      if (usados.has(b.id) || el.length < 11 || el.length >= 30 || (b.caixa || 0) < C.reserva * b.teto) continue;
      const t = taticaBot(el), naEscalacao = new Set(t.escalacao.map(x => x.j.id)), reservas = el.filter(j => !naEscalacao.has(j.id));
      const folha = el.reduce((s, j) => s + (j.salario || 0), 0), estr = estrangeirosDe(b, elencos[b.id]);
      for (const x of t.escalacao) {
        const titular = notaComPe(x.j, x.pos), goleiro = x.pos === "GK";
        const buraco = Math.max(0, ...reservas.filter(r => (r.pos === "GK") === goleiro).map(r => notaComPe(r, x.pos))) / titular;
        if (buraco >= 0.85) continue;
        for (const { j, salario } of livres) {
          if ((j.pos === "GK") !== goleiro || j.aposentaEm != null || folha + salario > b.teto || salario > C.maximoIndividual * b.teto) continue;
          if (estrangeiroEm(j, b) && estr >= C.estrangeiros) continue;
          const fica = notaComPe(j, x.pos) / titular;
          if (fica >= 0.85) pedidos.push({ b, j, salario, buraco, fica });
        }
      }
    }
    // o maior buraco escolhe primeiro (e, nele, o melhor livre); quem perdeu o preferido fica com a opção seguinte
    const tomados = new Set(), contratos = [];
    for (const p of pedidos.sort((a, b) => a.buraco - b.buraco || b.fica - a.fica)) {
      if (jaContrataram.length + contratos.length >= C.livresPorJanela) break;
      if (tomados.has(p.j.id) || usados.has(p.b.id)) continue;
      tomados.add(p.j.id); usados.add(p.b.id);
      contratos.push({ jogador: +String(p.j.id).replace(/^\D+/, ""), para: p.b.id, salario: p.salario, buraco: +p.buraco.toFixed(2), fica: +p.fica.toFixed(2) });
    }
    return contratos;
  }
  return { CONFIG_MERCADO_BOTS, negociosEntreBots, comprasDeListados, livresParaOsBots };
})();
// <<< motor embutido
const { calcularPartida, aplicarSituacao, proximaFaseDosPlayoffs, DIAS_PARA_BOT, CLASSIFICADOS_DO_PLAYOFF, vencedorDoGrupo, classificacaoFinal, meritoDaSerieC, tecnicosDoAno, tecnicoGeral } = __rodada;
const { treinar, chegouAoTeto, CONFIG_TREINO, qualidadeDoTreino, aprenderPosicao, ctDoClube, fatorDaTemporada } = __treino;
const { saudeDoClube } = __saude;
const { CONFIG } = __motor;
const { timeDaBase, contratadoNaBase, CONFIG_LIGA_DE_BASE } = __ligabase;
const { negociosEntreBots, comprasDeListados, livresParaOsBots } = __mercadobots;

// Mercado entre bots (66_multa_e_bots.sql): uma vez por janela, monta os negócios entre clubes sem dono e manda gravar.
async function mercadoDosBots(sb, ligaId, janela) {
  if (!janela) return;
  const { data: liga } = await sb.from("ligas").select("id, temporada, pausada, bots_mercado").eq("id", ligaId).maybeSingle();
  if (!liga || liga.pausada || liga.bots_mercado === liga.temporada + ":" + janela) return;
  const { clubes, elencos } = await botsDaLiga(sb, ligaId);
  const negocios = negociosEntreBots(__rng.criarRng(Math.floor(Math.random() * 2147483647)), { clubes, elencos });
  await sb.rpc("transferir_entre_bots", { p_liga: ligaId, p_lista: negocios.map(n => ({ jogador: n.jogador, para: n.para, valor: n.valor, salario: n.salario })) });
}

// jogador do banco no formato que o mercado dos bots usa
const jogadorDoMercado = l => ({ id: "j" + l.id, nome: l.nome, pais: l.pais, idade: l.idade, pos: l.pos, fam: l.fam, at: l.at,
  forma: l.forma, moral: l.moral, exp: l.exp == null ? null : +l.exp, pe: l.pe || null, salario: l.salario, juvenil: !!l.juvenil, aposentaEm: l.aposenta_em == null ? null : l.aposenta_em });

const PAIS_DO_GRUPO = { ARG: "Argentina", URU: "Uruguai", COL: "Colômbia", CHI: "Chile" }; // o mesmo de src/banco.js
// clubes sem dono da liga, com caixa e teto, e os elencos deles
// inativos: inclui os clubes de dirigente sem acesso há DIAS_PARA_BOT dias (menos o clube extra), que também jogam com a tática de bot
// clube guardado (grupo "X", desde a T14) fica fora do mercado: não compra, não vende, não contrata
async function botsDaLiga(sb, ligaId, inativos = false) {
  const limite = Date.now() - DIAS_PARA_BOT * 86400000;
  const cs = inativos
    ? ((await sb.from("clubes").select("id, divisao, grupo, dono, extra, ultimo_acesso").eq("liga_id", ligaId).neq("grupo", "X")).data || [])
        .filter(c => !c.dono || (!c.extra && (!c.ultimo_acesso || new Date(c.ultimo_acesso).getTime() < limite)))
    : (await sb.from("clubes").select("id, divisao, grupo").eq("liga_id", ligaId).is("dono", null).neq("grupo", "X")).data || [];
  const tetos = Object.fromEntries(((await sb.from("divisoes").select("divisao, teto_folha").eq("liga_id", ligaId)).data || []).map(d => [d.divisao, d.teto_folha]));
  const caixas = Object.fromEntries(((await sb.from("financas").select("clube_id, caixa").in("clube_id", cs.map(c => c.id))).data || []).map(f => [f.clube_id, f.caixa]));
  const elencos = {};
  for (let i = 0; i < cs.length; i += 20) {
    const linhas = (await sb.from("jogadores").select("*").in("clube_id", cs.slice(i, i + 20).map(c => c.id)).order("id")).data || [];
    for (const l of linhas) if (!l.emprestado_de) (elencos[l.clube_id] = elencos[l.clube_id] || []).push(jogadorDoMercado(l)); // emprestado não é do bot: fora do mercado
  }
  return { clubes: cs.map(c => ({ id: c.id, divisao: c.divisao, pais: PAIS_DO_GRUPO[c.grupo] || "Brasil", caixa: caixas[c.id] || 0, teto: PAIS_DO_GRUPO[c.grupo] ? 20000 : tetos[c.divisao] || tetos[2] || 14000 })), elencos };
}

// Bots compram da lista de transferência dos dirigentes (72_bots_compram_listados.sql): o banco entrega a fila (quem já esperou o prazo sem
// proposta de dirigente), cada listado é olhado uma vez por janela e o negócio é fechado pelo preço pedido. Sem efeito antes do SQL 72.
async function botsCompramListados(sb, ligaId, janela) {
  if (!janela) return;
  const { data: fila, error } = await sb.rpc("listados_para_os_bots", { p_liga: ligaId });
  if (error || !fila || !fila.length) return;
  const { data: liga } = await sb.from("ligas").select("temporada").eq("id", ligaId).maybeSingle();
  if (!janela || !liga) return;
  const { clubes, elencos } = await botsDaLiga(sb, ligaId);
  const jaCompraram = ((await sb.from("transferencias").select("para_clube").eq("liga_id", ligaId).eq("temporada", liga.temporada).eq("janela", janela).eq("tipo", "negociada")
    .in("para_clube", clubes.map(c => c.id))).data || []).map(t => t.para_clube);
  const compras = comprasDeListados({ clubes, elencos, listados: fila.map(l => ({ j: jogadorDoMercado(l), preco: l.preco_pedido })), jaCompraram });
  for (const c of compras) await sb.rpc("bot_compra_listado", { p_jogador: c.jogador, p_para: c.para, p_valor: c.valor, p_salario: c.salario }); // o que esbarra numa regra é pulado
  await sb.from("jogadores").update({ bots_viram: liga.temporada + ":" + janela }).in("id", fila.map(l => l.id));
}

// Bots (e clubes de dirigente inativo) tapam buracos no banco com jogadores livres (113_bots_contratam_livres.sql): o banco entrega a fila (livres sem leilão há 48 h),
// cada livre é olhado uma vez por janela e quem contrata (conferindo tudo de novo) é bot_contrata_livre. Sem efeito antes do SQL 113.
async function botsContratamLivres(sb, ligaId, janela) {
  if (!janela) return;
  const { data: fila, error } = await sb.rpc("livres_para_os_bots", { p_liga: ligaId });
  if (error || !fila || !fila.length) return;
  const { data: liga } = await sb.from("ligas").select("temporada").eq("id", ligaId).maybeSingle();
  if (!janela || !liga) return;
  const { clubes, elencos } = await botsDaLiga(sb, ligaId, true); // só contratar: o clube inativo de dirigente entra aqui, não nas vendas
  const jaContrataram = ((await sb.from("transferencias").select("para_clube").eq("liga_id", ligaId).eq("temporada", liga.temporada).eq("janela", janela).eq("tipo", "livre")
    .in("para_clube", clubes.map(c => c.id))).data || []).map(t => t.para_clube);
  const contratos = livresParaOsBots({ clubes, elencos, livres: fila.map(l => ({ j: jogadorDoMercado(l), salario: l.salario_mercado || 0 })), jaContrataram });
  for (const c of contratos) await sb.rpc("bot_contrata_livre", { p_jogador: c.jogador, p_para: c.para, p_salario: c.salario }); // o que esbarra numa regra é pulado
  await sb.from("jogadores").update({ bots_viram: liga.temporada + ":" + janela }).in("id", fila.map(l => l.id));
}

// Playoffs de acesso da Série B: quando a liga de um grupo (ou uma fase do playoff dele) termina, a fase seguinte é criada sozinha, nas datas
// reservadas pelo calendário (ligas.copa.playoffs, uma por etapa); sem elas, um intervalo depois do último jogo do grupo.
async function avancarPlayoffs(sb) {
  for (const liga of (await sb.from("ligas").select("id, pausada, minutos_transmissao, copa")).data || []) {
    if (liga.pausada || (liga.copa || {}).sem_playoffs) continue; // sem_playoffs: temporada sem playoffs (a virada zera ligas.copa)
    const todas = (await sb.from("partidas").select("id, grupo, rodada, fase, casa, fora, inicio, processada").eq("liga_id", liga.id).in("fase", ["liga", "pre", "semi", "final"]).order("id").limit(2000)).data || [];
    const clubes = (await sb.from("clubes").select("id, nome, grupo, divisao").eq("liga_id", liga.id)).data || [];
    // só os grupos com playoff que têm tudo calculado e ainda não chegaram à final: o resto da liga não precisa ser lido
    const comPlayoff = new Set(clubes.filter(c => c.divisao > 1).map(c => c.grupo));
    const prontos = new Set([...comPlayoff].filter(g => { const l = todas.filter(p => p.grupo === g); return l.length && l.every(p => p.processada) && !l.some(p => p.fase === "final"); }));
    if (!prontos.size) continue;
    const partidas = todas.filter(p => prontos.has(p.grupo)), resultados = [], agora = new Date().toISOString(), ids = partidas.map(p => p.id);
    for (let i = 0; i < ids.length; i += 200) resultados.push(...((await sb.from("resultados").select("partida_id, gols_casa, gols_fora").in("partida_id", ids.slice(i, i + 200)).lte("libera_em", agora)).data || []));
    const r = proximaFaseDosPlayoffs({ clubes: clubes.filter(c => prontos.has(c.grupo)), partidas, resultados });
    if (r.erro || !r.jogos.length) continue;
    // sem data reservada: um intervalo do calendário (o que separa as duas primeiras rodadas) depois do último jogo do grupo, por etapa
    const hora = p => new Date(p.inicio).getTime(), daLiga = todas.filter(p => p.fase === "liga"), reservadas = (liga.copa || {}).playoffs || [];
    const r1 = Math.min(...daLiga.filter(p => p.rodada === 1).map(hora)), r2 = Math.min(...daLiga.filter(p => p.rodada === 2).map(hora));
    const intervalo = isFinite(r2 - r1) && r2 > r1 ? r2 - r1 : 86400000;
    const inicio = j => { if (reservadas[j.etapa]) return Math.max(new Date(reservadas[j.etapa].inicio).getTime(), Date.now() + 60000);
      const doGrupo = partidas.filter(p => p.grupo === j.grupo), primeira = Math.min(...r.jogos.filter(x => x.grupo === j.grupo).map(x => x.etapa));
      return Math.max(Math.max(...doGrupo.map(hora)) + intervalo, Date.now() + 60000) + (j.etapa - primeira) * intervalo; };
    // um insert por grupo: com o índice único (63/69, e o 114 com a preliminar), a criação em dobro de duas chamadas juntas é barrada sem travar os outros grupos
    for (const g of new Set(r.jogos.map(j => j.grupo)))
      await sb.from("partidas").insert(r.jogos.filter(j => j.grupo === g).map(j => { const ini = inicio(j);
        return { liga_id: liga.id, grupo: j.grupo, rodada: j.rodada, fase: j.fase, copa_fase: null, casa: j.casa, fora: j.fora, inicio: new Date(ini).toISOString(), fim: new Date(ini + (liga.minutos_transmissao || 0) * 60000).toISOString() }; }));
  }
}

// Fechamento da temporada (145_fechamento_da_temporada.sql): uma hora depois do fim do último jogo, com todos os playoffs jogados, a tabela final
// vai para o histórico (a lista de campeões) e os prêmios são pagos: o da liga, os do fundo, seleção, técnico do ano e bônus de patrocínio.
// A virada, depois, só completa quem sobe e quem cai (e cobra o imposto). Sem o 145, a leitura de temporada_fechada falha e nada acontece.
const ESPERA_DO_FECHAMENTO = 3600000;
async function fecharTemporadas(sb) {
  for (const liga of (await sb.from("ligas").select("id, temporada, temporada_fechada, pausada, copa")).data || []) {
    if (liga.pausada || liga.temporada_fechada === liga.temporada) continue;
    const ultima = (await sb.from("partidas").select("fim").eq("liga_id", liga.id).order("fim", { ascending: false, nullsFirst: false }).limit(1)).data || [];
    if (!ultima.length || Date.now() - new Date(ultima[0].fim).getTime() < ESPERA_DO_FECHAMENTO) continue;
    const { count, error } = await sb.from("partidas").select("id", { count: "exact", head: true }).eq("liga_id", liga.id).eq("processada", false);
    if (error || count) continue;
    const partidas = [];
    for (let de = 0; ; de += 1000) { // em páginas: o banco devolve no máximo mil linhas por consulta
      const l = (await sb.from("partidas").select("id, grupo, rodada, fase, casa, fora").eq("liga_id", liga.id).or("fase.is.null,fase.in.(liga,pre,semi,final)").order("id").range(de, de + 999)).data || [];
      partidas.push(...l); if (l.length < 1000) break;
    }
    const clubes = (await sb.from("clubes").select("id, nome, grupo, divisao, dono").eq("liga_id", liga.id)).data || [];
    // playoff de acesso: sem a final criada em todo grupo que disputa, a temporada ainda não acabou (avancarPlayoffs cria a fase seguinte)
    const semPlayoffs = !!(liga.copa || {}).sem_playoffs;
    const comPlayoff = [...new Set(clubes.filter(c => c.divisao > 1).map(c => c.grupo))].filter(g => clubes.filter(c => c.grupo === g).length >= CLASSIFICADOS_DO_PLAYOFF && partidas.some(p => p.grupo === g));
    if (!semPlayoffs && comPlayoff.some(g => !partidas.some(p => p.grupo === g && p.fase === "final"))) continue;
    const resultados = [], ids = partidas.map(p => p.id), agora = new Date().toISOString();
    for (let i = 0; i < ids.length; i += 200) resultados.push(...((await sb.from("resultados").select("partida_id, gols_casa, gols_fora").in("partida_id", ids.slice(i, i + 200)).lte("libera_em", agora)).data || []));
    const elencos = {};
    for (let i = 0; i < clubes.length; i += 10) for (const j of (await sb.from("jogadores").select("clube_id, at, pos").in("clube_id", clubes.slice(i, i + 10).map(c => c.id))).data || []) (elencos[j.clube_id] = elencos[j.clube_id] || []).push(j);
    const linhas = classificacaoFinal(clubes, partidas, resultados);
    // técnico do ano geral (só dirigentes): também a copa e os continentais, que a classificação não lê
    const copas = [];
    for (let de = 0; ; de += 1000) {
      const l = (await sb.from("partidas").select("id, grupo, rodada, fase, copa_fase, casa, fora, vencedor").eq("liga_id", liga.id).in("fase", ["copa", "lib"]).order("id").range(de, de + 999)).data || [];
      copas.push(...l); if (l.length < 1000) break;
    }
    const geral = tecnicoGeral({ linhas, partidas: [...partidas, ...copas], resultados, elencos, donos: new Set(clubes.filter(c => c.dono).map(c => c.id)) });
    await sb.rpc("fechar_temporada", { p_liga: liga.id, p_temporada: liga.temporada, p_classificacao: linhas, p_merito: meritoDaSerieC(linhas), p_tecnicos: [...tecnicosDoAno(linhas, elencos), ...(geral ? [geral] : [])] });
  }
}

// Liga de base (61_liga_de_base.sql): joga as partidas cuja hora chegou. Ficam o placar, os gols, as notas e o relatório completo (136); o juvenil que jogou ganha um bônus de treino.
async function jogarBase(sb) {
  const r = await sb.from("base_jogos").select("*").eq("processada", false).lte("inicio", new Date().toISOString()).order("inicio").order("id").limit(25);
  if (r.error || !r.data || !r.data.length) return 0;
  const jogos = r.data, ids = [...new Set(jogos.flatMap(p => [p.casa, p.fora]))];
  const clubes = Object.fromEntries(((await sb.from("clubes").select("id, nome, perfil, dono, base_nivel, ct_nivel, pais").in("id", ids)).data || []).map(c => [c.id, c]));
  // jogam a base: os juvenis e, nos clubes com dirigente, o profissional de até 21 anos que não esteja lesionado (o contratado, até CONFIG_LIGA_DE_BASE.contratados por partida)
  const juvenis = {}, profs = {};
  for (const l of (await sb.from("jogadores").select("*").in("clube_id", ids).lte("idade", CONFIG_LIGA_DE_BASE.idadeMaxima).order("id")).data || [])
    if (l.juvenil || ((clubes[l.clube_id] || {}).dono && !(l.fora_jogos > 0 && l.fora_motivo === "lesão")))
    ((l.juvenil ? juvenis : profs)[l.clube_id] = (l.juvenil ? juvenis : profs)[l.clube_id] || []).push({ id: "j" + l.id, contratado: !l.juvenil && contratadoNaBase(l.formador, l.chegou_temporada, l.clube_id), nome: l.nome, pais: l.pais, idade: l.idade, pos: l.pos, fam: l.fam, at: l.at, pe: l.pe || null, pf: l.pe_fraco == null ? null : l.pe_fraco, treino: l.treino || null, pts: l.treino_pts || null, aprende: l.aprende || null, exp: l.exp == null ? null : +l.exp });
  const todos = [...Object.values(juvenis).flat(), ...Object.values(profs).flat()].map(j => +String(j.id).slice(1)), talentos = {};
  if (todos.length) for (const t of (await sb.from("jogadores_ocultos").select("jogador_id, tal").in("jogador_id", todos)).data || []) talentos["j" + t.jogador_id] = t.tal;
  const comissoes = {};
  for (const x of (await sb.from("treinadores").select("*").eq("contratado", true).in("clube_id", ids)).data || []) if ((x.funcao || "treinador") === "treinador") (comissoes[x.clube_id] = comissoes[x.clube_id] || []).push(x);
  // tática da base (100_tatica_da_base.sql): o esquema do time principal e o que o dirigente fixou; sem a tabela, a leitura falha e tudo segue automático
  const donos = ids.filter(id => (clubes[id] || {}).dono), formacoes = {}, taticasDaBase = {};
  if (donos.length) {
    for (const t of (await sb.from("taticas").select("clube_id, dados").in("clube_id", donos)).data || []) formacoes[t.clube_id] = t.dados && t.dados.vagas;
    for (const t of (await sb.from("taticas_base").select("clube_id, dados").in("clube_id", donos)).data || []) taticasDaBase[t.clube_id] = t.dados;
  }
  // rodízio: minutos que cada um já jogou na base nesta temporada
  const minutosNaBase = {}, chave = (liga, t) => liga + ":" + t;
  for (const k of new Set(jogos.map(p => chave(p.liga_id, p.temporada)))) {
    const [liga, t] = k.split(":").map(Number), m = minutosNaBase[k] = {};
    for (const q of (await sb.from("base_jogos").select("jogadores:dados->jogadores").eq("liga_id", liga).eq("temporada", t).eq("processada", true).not("gols_casa", "is", null)).data || [])
      for (const x of q.jogadores || []) if (String(x.id).startsWith("j")) m[x.id] = (m[x.id] || 0) + (x.min || 0);
  }
  let n = 0;
  for (const p of jogos) {
    const reserva = await sb.from("base_jogos").update({ processada: true }).eq("id", p.id).eq("processada", false).select("id");
    if (reserva.error || !reserva.data.length) continue;
    try {
      const semente = Math.floor(Math.random() * 2147483647), rng = __rng.criarRng(semente);
      const jaJogou = minutosNaBase[chave(p.liga_id, p.temporada)];
      const lado = id => { const c = clubes[id] || {};
        const t = timeDaBase(rng, { juvenis: juvenis[id] || [], profissionais: profs[id] || [], nivel: c.dono ? (c.base_nivel || 0) : p.fase === "libjuv" && c.pais && c.pais !== "Brasil" ? CONFIG_LIGA_DE_BASE.nivelDeFora : CONFIG_LIGA_DE_BASE.nivelDoBot, prefixo: id, minutos: jaJogou, perfil: c.perfil, formacao: formacoes[id], tatica: taticasDaBase[id] });
        return { clube: { id, nome: c.nome || "", dono: null, perfil: c.perfil }, elenco: [...t.escalacao.map(x => x.j), ...t.banco], tatica: null, pronta: t }; };
      const { resultado, minutos, lances } = calcularPartida({ partida: { id: p.id, inicio: p.inicio, fase: "base", casa: p.casa, fora: p.fora }, casa: lado(p.casa), fora: lado(p.fora), semente, temporada: p.temporada });
      const dados = { jogadores: resultado.relatorio.jogadores.filter(x => x.minutos > 0).map(x => ({ id: x.id, n: x.nome, t: x.time, p: x.pos, g: x.gols || 0, a: x.assistencias || 0, nota: x.nota, min: x.minutos })) };
      // relatório curto: as estatísticas principais de cada lado e as frases do analista (sem os lances, para não pesar no banco)
      const R = resultado.relatorio;
      dados.est = R.estat.map(e => ({ po: e.posse, f: e.finalizacoes, ng: e.noGol, xg: Math.round(e.xg * 100) / 100, es: e.escanteios, fa: e.faltas, am: e.amarelos, vm: e.vermelhos }));
      dados.an = R.analise;
      // Copinha (70_copinha.sql) e Libertadores Juvenil (101): mata-mata; empate vai direto aos pênaltis
      const extra = {};
      if (p.fase === "copinha" || p.fase === "libjuv") {
        extra.vencedor = resultado.gols_casa > resultado.gols_fora ? p.casa : resultado.gols_fora > resultado.gols_casa ? p.fora : null;
        if (!extra.vencedor) { const pen = [0, 0];
          for (let k = 0; k < 5; k++) { if (rng.chance(0.76)) pen[0]++; if (rng.chance(0.76)) pen[1]++; }
          while (pen[0] === pen[1]) { if (rng.chance(0.76)) pen[0]++; if (rng.chance(0.76)) pen[1]++; }
          dados.penaltis = pen; extra.vencedor = pen[0] > pen[1] ? p.casa : p.fora; }
      }
      // relatório completo com a narração (136_relatorio_da_base.sql): coluna à parte, lida só quando alguém abre a partida; sem a coluna, grava o curto
      const relatorio = { ...R, narracao: lances.map(l => l.dados), ...(dados.penaltis ? { penaltis: dados.penaltis } : {}) };
      let g = await sb.from("base_jogos").update({ gols_casa: resultado.gols_casa, gols_fora: resultado.gols_fora, dados, relatorio, ...extra }).eq("id", p.id);
      if (g.error && /relatorio/.test(g.error.message)) g = await sb.from("base_jogos").update({ gols_casa: resultado.gols_casa, gols_fora: resultado.gols_fora, dados, ...extra }).eq("id", p.id);
      if (g.error) throw new Error(g.error.message);
      const treinos = [];
      for (const id of [p.casa, p.fora]) {
        const c = clubes[id] || {}, areas = qualidadeDoTreino(comissoes[id] || [], 0, !c.dono);
        for (const j of [...(juvenis[id] || []), ...(profs[id] || [])]) {
          if ((minutos[j.id] || 0) < CONFIG_LIGA_DE_BASE.minutos) continue;
          const t = treinar(j, { tal: talentos[j.id], ct: c.ct_nivel || 0, areas, fator: CONFIG_LIGA_DE_BASE.bonusDeTreino });
          const jogouEm = (resultado.relatorio.jogadores.find(x => x.id === j.id) || {}).pos;
          const a = c.dono && j.aprende && jogouEm === j.aprende.pos ? aprenderPosicao(j, { soBonus: true }) : null; // jogar na posição em estudo acelera, como na liga
          if (t || a) { treinos.push({ id: +String(j.id).slice(1), at: t ? t.at : j.at, pts: t ? t.pts : (j.pts || j.at.map(() => 0)), ...(a ? { fam: a.fam, aprende: a.aprende } : {}) });
            if (t) { j.at = t.at; j.pts = t.pts; } if (a) { j.fam = a.fam; j.aprende = a.aprende; } }
        }
      }
      if (treinos.length) await sb.rpc("aplicar_treino", { p_lista: treinos });
      for (const [id, m] of Object.entries(minutos)) if (id.startsWith("j")) jaJogou[id] = (jaJogou[id] || 0) + m;
      n++;
    } catch (e) { await sb.from("base_jogos").update({ processada: false }).eq("id", p.id); }
  }
  // Copinha: com a fase toda jogada, o banco sorteia a seguinte (ou paga o campeão)
  for (const liga of new Set(jogos.filter(p => p.fase === "copinha").map(p => p.liga_id))) await sb.rpc("copinha_avancar", { p_liga: liga });
  for (const liga of new Set(jogos.filter(p => p.fase === "libjuv").map(p => p.liga_id))) await sb.rpc("libertadores_juvenil_avancar", { p_liga: liga });
  return n;
}

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-segredo",
};
const json = (corpo, status = 200) => new Response(JSON.stringify(corpo), { status, headers: { ...cors, "Content-Type": "application/json" } });
const MAXIMO_POR_CHAMADA = 40;

// Quem pode disparar a função. Sem o segredo SEGREDO_DO_CRON cadastrado no Supabase, qualquer chamada vale.
// Com ele cadastrado, só vale a chamada que traz o segredo (o agendamento) ou a de um administrador logado.
async function autorizado(req, sb) {
  const segredo = Deno.env.get("SEGREDO_DO_CRON");
  if (!segredo) return true;
  if (req.headers.get("x-segredo") === segredo) return true;
  const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  if (!token) return false;
  const { data } = await sb.auth.getUser(token);
  if (!data || !data.user) return false;
  const { data: admin } = await sb.from("admins").select("user_id").eq("user_id", data.user.id).maybeSingle();
  return !!admin;
}

// Grava nos jogadores o que a partida mudou: situação (lesão, suspensão, amarelos), forma e moral, e treino.
async function gravarEfeitos(sb, e, partida = null) {
  if (e && e.caixa && partida) { await sb.rpc("lancar_rodada", { p_partida: partida }); await sb.rpc("lancar_treinadores", { p_partida: partida }); }
  // situação em lote numa chamada só (67_cron_enxuto.sql); sem a função, um jogador por vez, como antes
  const situacao = (e && e.situacao) || [];
  if (situacao.length && (await sb.rpc("aplicar_situacao", { p_lista: situacao })).error)
    for (const m of situacao) await sb.from("jogadores").update({ fora_jogos: m.fora, fora_motivo: m.motivo, amarelos: m.amarelos }).eq("id", m.id);
  if (e && e.momento && e.momento.length) await sb.rpc("aplicar_momento", { p_lista: e.momento });
  if (e && e.treinos && e.treinos.length) await sb.rpc("aplicar_treino", { p_lista: e.treinos });
  if (e && e.copa && e.copa.length) await sb.rpc("aplicar_copa", { p_lista: e.copa });
  if (e && e.lib && e.lib.length) await sb.rpc("aplicar_lib", { p_lista: e.lib }); // sem efeito antes do 141_cartoes_continentais.sql
  if (e && e.vencedor && partida) await sb.from("partidas").update({ vencedor: e.vencedor }).eq("id", partida);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const url = Deno.env.get("SUPABASE_URL"), chave = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !chave) return json({ erro: "Função sem acesso ao banco: faltam SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY." }, 500);
    const sb = createClient(url, chave, { auth: { persistSession: false } });
    if (!(await autorizado(req, sb))) return json({ erro: "Não autorizado." }, 401);
    const ok = ({ data, error }) => { if (error) throw new Error(error.message); return data; };
    // Leilões, aposentadorias, sorteio da copa e obras dos bots rodam no próprio banco, todo minuto, em tarefas_do_minuto()
    // (67_cron_enxuto.sql): repetir aqui só gastava log de API.
    // Lesões, suspensões, amarelos, forma, moral e treino de cada partida só são gravados no apito final (33_efeitos_no_apito_final.sql):
    // ficam guardados no resultado até lá, para a página do clube não entregar o que ainda está passando na transmissão.
    const adiar = true; // o SQL 33 já rodou: a coluna efeitos existe
    {
      const vencidos = (await sb.from("resultados").select("partida_id, efeitos").not("efeitos", "is", null).lte("libera_em", new Date().toISOString()).order("libera_em").limit(200)).data || [];
      for (const r of vencidos) { await gravarEfeitos(sb, r.efeitos, r.partida_id); await sb.from("resultados").update({ efeitos: null }).eq("partida_id", r.partida_id); }
    }

    // bots: uma vez por janela, negócios entre clubes sem dono, compra de listados e contratação de livres (sem efeito antes do 66_multa_e_bots.sql);
    // fora da janela de mercado nenhum dos três faz nada, então nem pergunta
    try {
      for (const l of (await sb.from("ligas").select("id")).data || []) {
        const { data: janela } = await sb.rpc("janela_do_mercado", { p_liga: l.id });
        if (!janela) continue;
        await mercadoDosBots(sb, l.id, janela); await botsCompramListados(sb, l.id, janela); await botsContratamLivres(sb, l.id, janela);
      }
    } catch (e) { /* segue */ }
    try { await avancarPlayoffs(sb); } catch (e) { /* segue */ }
    try { await fecharTemporadas(sb); } catch (e) { /* segue */ }
    try { await jogarBase(sb); } catch (e) { /* liga de base: sem efeito antes do 61_liga_de_base.sql */ }
    // reserva órfã: a chamada morreu (tempo limite) entre reservar e gravar o resultado, e a partida ficou "processada" sem resultado.
    // 10 min depois do início ela volta para a fila. Só falharia com fila atrasada em mais de 10 min e duas chamadas ao mesmo tempo.
    try {
      const presas = ok(await sb.from("partidas").select("id").eq("processada", true)
        .lte("inicio", new Date(Date.now() - 600000).toISOString()).gte("inicio", new Date(Date.now() - 86400000).toISOString()).limit(500)).map(p => p.id);
      const comResultado = new Set(presas.length ? ok(await sb.from("resultados").select("partida_id").in("partida_id", presas)).map(r => r.partida_id) : []);
      for (const id of presas.filter(id => !comResultado.has(id))) {
        await sb.from("lances").delete().eq("partida_id", id);
        await sb.from("partidas").update({ processada: false }).eq("id", id);
      }
    } catch (e) { /* segue */ }
    const pendentes = ok(await sb.from("partidas").select("*").eq("processada", false).lte("inicio", new Date().toISOString())
      .order("inicio").order("id").limit(MAXIMO_POR_CHAMADA));
    if (!pendentes.length) return json({ calculadas: 0, erros: [] });
    const todasAsLigas = Object.fromEntries(ok(await sb.from("ligas").select("*")).map(l => [l.id, l]));
    const jogaveis = pendentes.filter(p => !todasAsLigas[p.liga_id].pausada); // liga pausada não tem partida calculada
    if (!jogaveis.length) return json({ calculadas: 0, erros: [], pausada: true });
    pendentes.length = 0; pendentes.push(...jogaveis);

    const ids = [...new Set(pendentes.flatMap(p => [p.casa, p.fora]))];
    const ligas = Object.fromEntries(ok(await sb.from("ligas").select("*").in("id", [...new Set(pendentes.map(p => p.liga_id))])).map(l => [l.id, l]));
    const clubes = Object.fromEntries(ok(await sb.from("clubes").select("*").in("id", ids)).map(c => [c.id, c]));
    const taticas = Object.fromEntries(ok(await sb.from("taticas").select("clube_id, dados").in("clube_id", ids)).map(t => [t.clube_id, t.dados]));
    const elencos = {}, rodadasDoGrupo = {};
    for (let i = 0; i < ids.length; i += 20) { // em blocos, para não passar do limite de linhas por consulta
      const linhas = ok(await sb.from("jogadores").select("*").in("clube_id", ids.slice(i, i + 20)).order("id"));
      for (const l of linhas) (elencos[l.clube_id] = elencos[l.clube_id] || []).push({ id: "j" + l.id, nome: l.nome, numero: l.numero || null, pais: l.pais, idade: l.idade, pos: l.pos, fam: l.fam, at: l.at, titular: l.principal, fora: l.fora_jogos || 0, motivo: l.fora_motivo || null, amarelos: l.amarelos || 0, entrosar: l.entrosar || 0, papelJogado: l.papel_jogado || null, treino: l.treino || null, pts: l.treino_pts || null, aprende: l.aprende || null, juvenil: !!l.juvenil, forma: l.forma == null ? null : l.forma, moral: l.moral == null ? null : l.moral, exp: l.exp == null ? null : +l.exp, pe: l.pe || null, pf: l.pe_fraco == null ? null : l.pe_fraco, amarelosCopa: l.amarelos_copa || 0, foraCopa: l.fora_copa || 0, copaClube: l.copa_clube == null ? null : l.copa_clube, amarelosLib: l.amarelos_lib || 0, foraLib: l.fora_lib || 0 });
    }
    // treinadores contratados de cada clube (sem a tabela, antes do 28_treinadores.sql, o treino segue sem eles)
    // "comissoes" guarda só os treinadores; médico e preparador de prevenção (29_saude.sql) vão para "saude"
    let comissoes = null; const saude = {};
    try { const t = await sb.from("treinadores").select("*").eq("contratado", true).in("clube_id", ids); if (!t.error) { comissoes = {}; for (const x of t.data) { const alvo = (x.funcao || "treinador") === "treinador" ? comissoes : saude; (alvo[x.clube_id] = alvo[x.clube_id] || []).push(x); } } } catch (e) { /* segue sem treinadores */ }
    // talento oculto de cada jogador: define o teto do treino
    const talentos = {};
    const todos = Object.values(elencos).flat().map(j => +String(j.id).slice(1));
    for (let i = 0; i < todos.length; i += 300) for (const t of ok(await sb.from("jogadores_ocultos").select("jogador_id, tal").in("jogador_id", todos.slice(i, i + 300)))) talentos["j" + t.jogador_id] = t.tal;

    let calculadas = 0;
    const erros = [];
    for (const p of pendentes) {
      // reserva a partida; se outra chamada já pegou, pula
      const reserva = ok(await sb.from("partidas").update({ processada: true }).eq("id", p.id).eq("processada", false).select("id"));
      if (!reserva.length) continue;
      try {
        // juvenil (60_juvenis_e_formador.sql) não joga partida oficial: fica fora da escalação, da forma e da moral, mas treina mais abaixo
        const lado = id => ({ clube: clubes[id], elenco: (elencos[id] || []).filter(j => !j.juvenil), tatica: taticas[id] || null, saude: saudeDoClube(saude[id], clubes[id]) });
        const { lances, resultado, situacao, minutos, posicoes, momento, copa, lib, vencedor, ordens, papeis } = calcularPartida({
          partida: p, casa: lado(p.casa), fora: lado(p.fora),
          minutosTransmissao: ligas[p.liga_id].minutos_transmissao, semente: Math.floor(Math.random() * 2147483647), temporada: ligas[p.liga_id].temporada,
        });
        ok(await sb.from("lances").insert(lances));
        ok(await sb.from("resultados").insert(resultado));
        if (ordens && ordens.length) await sb.from("ordens_partida").upsert(ordens); // sem o 90_ordens_privadas.sql só falha em silêncio
        // lesões, suspensões e amarelos para os próximos jogos
        const efeitos = { situacao: situacao.map(m => ({ id: +String(m.id).slice(1), fora: m.fora, motivo: m.motivo, amarelos: m.amarelos })), momento: [], treinos: [] };
        // copa: cartões e suspensões próprios, a trava de clube e quem passou de fase (só aparecem no apito final)
        if (copa) {
          efeitos.copa = copa.map(m => ({ id: +String(m.id).slice(1), amarelos: m.amarelos, fora: m.fora, clube: m.clube })); efeitos.vencedor = vencedor;
          const novoC = Object.fromEntries(copa.map(m => [m.id, m]));
          for (const lado of [p.casa, p.fora]) for (const j of elencos[lado] || []) if (novoC[j.id]) { j.amarelosCopa = novoC[j.id].amarelos; j.foraCopa = novoC[j.id].fora; j.copaClube = novoC[j.id].clube; }
        }
        // Libertadores e Sul-Americana: cartões e suspensões continentais
        if (lib && lib.length) {
          efeitos.lib = lib.map(m => ({ id: +String(m.id).slice(1), amarelos: m.amarelos, fora: m.fora }));
          const novoL = Object.fromEntries(lib.map(m => [m.id, m]));
          for (const lado of [p.casa, p.fora]) for (const j of elencos[lado] || []) if (novoL[j.id]) { j.amarelosLib = novoL[j.id].amarelos; j.foraLib = novoL[j.id].fora; }
        }
        aplicarSituacao(elencos[p.casa] || [], situacao); aplicarSituacao(elencos[p.fora] || [], situacao);
        // recém-chegados: um jogo a menos para entrosar (sem efeito antes do 86_entrosamento.sql)
        await sb.rpc("entrosar_partida", { p_partida: p.id });
        for (const lado of [p.casa, p.fora]) for (const j of elencos[lado] || []) if (j.entrosar > 0) j.entrosar--;
        // trocar de papel custa entrosamento (sem efeito antes do 164_papel_jogado.sql; antes da temporada 1, papeis vem vazio)
        if (papeis && papeis.length) {
          const r = await sb.rpc("marcar_papeis", { p_partida: p.id, p_papeis: papeis.map(x => ({ id: +String(x.id).slice(1), papel: x.papel })), p_jogos: CONFIG.papeis.entrosarTroca });
          if (!r.error) { const antes = Object.fromEntries(papeis.map(x => [x.id, x.papel]));
            for (const lado of [p.casa, p.fora]) for (const j of elencos[lado] || []) if (antes[j.id]) { if (j.papelJogado && j.papelJogado !== antes[j.id]) j.entrosar = Math.max(j.entrosar || 0, CONFIG.papeis.entrosarTroca); j.papelJogado = antes[j.id]; } }
        }
        // forma e moral depois do jogo (sem efeito antes do 30_forma_e_moral.sql)
        if (momento.length) {
          efeitos.momento = momento.map(m => ({ id: +String(m.id).slice(1), forma: m.forma, moral: m.moral, exp: m.exp }));
          const novo = Object.fromEntries(momento.map(m => [m.id, m]));
          for (const lado of [p.casa, p.fora]) for (const j of elencos[lado] || []) if (novo[j.id]) { j.forma = novo[j.id].forma; j.moral = novo[j.id].moral; j.exp = novo[j.id].exp; }
        }
        // caixa da rodada (TV, patrocínio, salários, bilheteria, obras, humor da torcida): com o 34_caixa_no_apito_final.sql, só o público
        // é sorteado agora (ele aparece na abertura da transmissão) e o resto fica para o apito final, junto dos outros efeitos
        let caixaAdiado = false;
        if (adiar) caixaAdiado = !(await sb.rpc("definir_publico", { p_partida: p.id })).error;
        if (!caixaAdiado) await sb.rpc("lancar_rodada", { p_partida: p.id });
        efeitos.caixa = caixaAdiado;
        // sessão de treino dos dois elencos, só em partida de liga; lesionado não treina (sem efeito antes do 27_treino.sql)
        if (!p.fase || p.fase === "liga") {
          const treinos = [], chaveG = p.liga_id + ":" + p.grupo;
          // a sessão vale 22 / rodadas do grupo (2 × (clubes − 1)): A, B e países somam o mesmo na temporada
          if (!rodadasDoGrupo[chaveG]) { const { count } = await sb.from("clubes").select("id", { count: "exact", head: true }).eq("liga_id", p.liga_id).eq("grupo", p.grupo); rodadasDoGrupo[chaveG] = 2 * ((count || 0) - 1); }
          const fatorDoGrupo = fatorDaTemporada(rodadasDoGrupo[chaveG]);
          for (const lado of [p.casa, p.fora]) { const areas = qualidadeDoTreino(comissoes ? comissoes[lado] || [] : null, (elencos[lado] || []).filter(j => j.idade > CONFIG_TREINO.idadeSemContar).length, !(clubes[lado] || {}).dono); for (const j of elencos[lado] || []) {
            if (j.fora > 0 && j.motivo === "lesão") continue;
            const jogou = (minutos[j.id] || 0) >= CONFIG_TREINO.minutosParaBonus;
            const r = treinar(j, { tal: talentos[j.id], ct: ctDoClube(clubes[lado]), jogou, areas, fator: fatorDoGrupo });
            // posição nova (59_posicao_nova_e_safra.sql): só em clube com dirigente; jogar na posição acelera
            const a = (clubes[lado] || {}).dono && j.aprende ? aprenderPosicao(j, { jogouNa: jogou && posicoes && posicoes[j.id] === j.aprende.pos }) : null;
            // no limite (163_no_teto.sql): a sessão não rendeu porque a nota bateu o teto; quem treinou sai da marca
            const teto = !r && chegouAoTeto(j, talentos[j.id]);
            if (r || a || teto) { treinos.push({ id: +String(j.id).slice(1), at: r ? r.at : j.at, pts: r ? r.pts : (j.pts || j.at.map(() => 0)), teto, ...(a ? { fam: a.fam, aprende: a.aprende } : {}) });
              if (r) { j.at = r.at; j.pts = r.pts; } if (a) { j.fam = a.fam; j.aprende = a.aprende; } }
          } }
          efeitos.treinos = treinos;
          if (!caixaAdiado) await sb.rpc("lancar_treinadores", { p_partida: p.id }); // salário dos treinadores; sem efeito antes do 28_treinadores.sql
        }
        // os efeitos ficam guardados até o apito final; sem a coluna (antes do SQL 33), são gravados na hora, como antes
        if (adiar) ok(await sb.from("resultados").update({ efeitos }).eq("partida_id", p.id)); else await gravarEfeitos(sb, efeitos);
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
