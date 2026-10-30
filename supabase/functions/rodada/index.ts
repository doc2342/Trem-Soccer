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
  // Modelo de jogador: 22 atributos (os 21 do Dugout + Resistência), 18 posições e nota por posição.
  // Os pesos e os fatores de familiaridade são ponto de partida; a calibragem do motor pode mexer neles.

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
  return { ATR_MIN, ATR_MAX, ATRIBUTOS, IDX, POSICOES, LISTA_POSICOES, PESOS, FAMILIARIDADE, NOME_FAMILIARIDADE, VIZINHAS, familiaridade, notaBruta, NOME_DO_PE, CONFIG_PE, ajusteDoPe, NIVEIS_PE_FRACO, nomeDoPeFraco, JEITO_DO_PE, textoDoPe, fraquezaDoPe, PE_FRACO_DESDE, notaComPe, peNaPosicao, notaNaPosicao, TETO_DO_TALENTO, talentoMinimo, notaDeTeto, melhorPosicao, PAISES, paisDoGrupo };
})();

const __papeis = (() => {
  // Papéis dos jogadores (plano fase 2): dentro da posição, o técnico escolhe o jeito de jogar. Cada papel tem os pesos da ficha (a nota no papel),
  // um mapa de zonas com a bola e outro sem a bola (motor.js) e um ritmo de gasto de energia. Os mapas são do lado direito; o esquerdo é o espelho.
  // O papel padrão de cada posição usa as zonas de hoje (COBERTURA do motor) nas duas fases e o gasto de hoje: sem escolha, nada muda.
  // Primeira fatia: laterais e alas. Os números vêm da página do plano (seções 03 e 04, aprovados em 28 e 29/10).
  const { IDX, FAMILIARIDADE, familiaridade } = __modelo;
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
      mapas: { WBR: { com: { AD: 0.10, MD: 0.40, DC: 0.05, DD: 0.45 }, sem: { MD: 0.35, DC: 0.10, DD: 0.55 } } },
      gasto: { DR: 0.95, WBR: 0.95 },
    },
    apoiador: {
      nome: "Apoiador", faz: "Chega ao fundo e cruza: soma ataque pelo lado.", custa: "As costas ficam abertas para o contra-ataque, e cansa mais.",
      pesos: { vel: 17, cru: 14, dri: 11, res: 11, pas: 10, des: 10, pos: 7, cri: 5, dom: 5, equ: 5, mar: 5 },
      mapas: { DR: { com: { AD: 0.35, MD: 0.35, DC: 0.05, DD: 0.25 }, sem: { AD: 0.10, MD: 0.40, DC: 0.05, DD: 0.45 } } },
      gasto: { DR: 1.10, WBR: 1.15 },
    },
    construtor: {
      nome: "Construtor", faz: "Leva a bola da defesa ao meio pelo lado, com passe e criatividade.", custa: "Não chega ao fundo para cruzar e marca menos que o Fixo.",
      pesos: { pas: 17, vel: 14, des: 13, pos: 11, dom: 10, mar: 10, cri: 9, res: 7, cru: 3, equ: 3, dri: 3 },
      mapas: {
        DR: { com: { AD: 0.05, MD: 0.40, DC: 0.10, DD: 0.45 }, sem: { MD: 0.30, DC: 0.15, DD: 0.55 } },
        WBR: { com: { AD: 0.10, MC: 0.10, MD: 0.50, DD: 0.30 }, sem: { MD: 0.45, DC: 0.10, DD: 0.45 } },
      },
      gasto: { DR: 1, WBR: 1 },
    },
    invertido: {
      nome: "Invertido", faz: "Com a bola, fecha por dentro e vira um volante a mais; sem ela, volta para o lado.", custa: "Na perda da bola, o corredor fica vazio até ele voltar, e cruza pouco.",
      pesos: { pas: 17, des: 15, pos: 13, dom: 11, mar: 10, equ: 9, cri: 8, vel: 8, res: 4, agr: 3, for: 2 },
      mapas: {
        DR: { com: { MC: 0.35, MD: 0.10, DC: 0.15, DD: 0.40 }, sem: { MC: 0.10, MD: 0.20, DC: 0.15, DD: 0.55 } },
        WBR: { com: { AC: 0.10, MC: 0.40, MD: 0.25, DD: 0.25 }, sem: { MC: 0.15, MD: 0.40, DD: 0.45 } },
      },
      gasto: { DR: 1, WBR: 1 },
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

  // { com, sem } do papel na posição, já espelhado na esquerda; null quando o motor deve usar a COBERTURA da posição (padrão, sem papel ou papel inválido)
  function mapasDoPapel(pos, papel) {
    if (!papelValido(pos, papel) || papel === PAPEL_PADRAO[pos]) return null;
    const m = PAPEIS[papel].mapas[base(pos)];
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
  const { IDX, POSICOES, FAMILIARIDADE, familiaridade, notaNaPosicao, ajusteDoPe, fraquezaDoPe } = __modelo;
  const { fatorDeMomento, diaDoJogador } = __saude;
  const { mapasDoPapel, gastoDoPapel, papelValido, espelharLado } = __papeis;
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
    variacaoChance: { profundidade: 0.4, area: 0.55, cruzamento: 0.45, corte: 0.35, longe: 0.35 }, // dispersão da qualidade de cada chance (0 = todas parecidas); a média não muda
    ajusteGol: { cruzamento: 0.97, corte: 1.28, profundidade: 0.93, area: 0.89, longe: 1.26, escanteio: 0.99, falta: 1, penalti: 0.98 }, // acerto fino para o xG de cada tipo bater com os gols
    xgMaximo: 0.75,
    // chance pelo lado multiplicada por (ataque na ponta / defesa daquele lado) / referência, elevado ao expoente, entre min e max (ver ferramentas/sim_formacoes.mjs)
    flancoAberto: { referencia: 0.38, expoente: 0.7, min: 0.7, max: 1.4 }, // max era 2,2: o bônus premiava os times fortes e a média passou de 3,4 gols na liga (18/10/2026)
    chuteForcado: 0.14, // chance de sair um chute de longe, pior, quando o duelo no ataque é perdido
    fatorChuteForcado: 0.7,
    // chute em etapas: bloqueado pela zaga; senão vai no gol com a chance `alvo` (para quem chuta no nível do goleiroReferencia, sobe com o pé dele);
    // no gol, o que sobra da chance de gol decide entre gol e defesa (aí só contam a chance e o goleiro). Fora: `trave` é a parte que bate na trave.
    semGol: {
      area: { bloqueado: 0.16, alvo: 0.46 }, longe: { bloqueado: 0.18, alvo: 0.4 }, corte: { bloqueado: 0.16, alvo: 0.4 }, cruzamento: { bloqueado: 0.12, alvo: 0.4 },
      escanteio: { bloqueado: 0.14, alvo: 0.4 }, falta: { bloqueado: 0.16, alvo: 0.38 }, profundidade: { bloqueado: 0.1, alvo: 0.55 }, penalti: { bloqueado: 0, alvo: 0.88 }, trave: 0.08,
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
    falta: 0.147, // por duelo (alvo: 22 faltas por jogo, com os acréscimos); era 0,12 com 0,85 ataque por minuto
    faltaPorAgressividade: 0.2, // por nível: 0,6x a 1,4x faltas entre -2 e +2
    // Quem faz a falta: sem isto, quem cobre uma zona sozinho (meia e lateral) levava mais cartão que volante e zagueiro, ao contrário do futebol
    // real (volante, zagueiro e meio-campo na frente; ponta e meia de lado atrás). Ajustado com ferramentas/sim_cartoes.mjs.
    faltaPorPosicao: { DC: 1.6, SW: 1.6, DMC: 1.3, MC: 1.2, DR: 0.83, DL: 0.83, WBR: 0.8, WBL: 0.8, MR: 0.53, ML: 0.53, AMC: 0.77, AMR: 0.71, AML: 0.71, RW: 0.71, LW: 0.71, FC: 0.83, SC: 1.3 },
    // T14 com 0,47 e 0,003: 4,9 amarelos e 0,23 vermelho por jogo; meta agora de 4 amarelos e 0,2 vermelho (ferramentas/sim_jogo.mjs, 26/10/2026)
    amarelo: 0.37, amareloPorAgressividade: 0.1, vermelhoDireto: 0.004,
    cuidadoComAmarelo: 0.12, // quem já tem amarelo se segura: multiplicador da chance do segundo
    amareloPrimeiraFalta: 0.35, amareloPorFaltaAntes: 0.5, // o juiz pune a repetição: a chance cresce com as faltas que o jogador já fez (0,35 na 1ª, 0,85 na 2ª, 1,35 na 3ª…)
    segundoAmareloPrimeiroTempo: 0.5, // e segura a expulsão cedo
    lesao: 0.0026, // era 0,0023 com 0,85 ataque por minuto; por duelo, para quem tem a bola (alvo: 3 a 4 lesões por clube por temporada de 18 rodadas)
    maxSubstituicoes: 5,
    acrescimoPorFalta: 0.1, acrescimoPorSubstituicao: 0.5, acrescimoPorGol: 0.5, acrescimoPorLesao: 0.5, // minutos de acréscimo em cada tempo (arredondados para cima, mínimo 1)
    // Cera (instrução, só vale com o time ganhando): o jogo tem menos ataques, a arbitragem devolve parte do tempo no acréscimo
    // e cada minuto de cera arrisca um amarelo por retardar o reinício (goleiro mais que os outros; quem já tem amarelo se segura).
    cera: { ritmo: 0.7, acrescimo: 0.07, amarelo: 0.01, pesoGoleiro: 3 }, // ferramentas/sim_cera.mjs: +0,05 ponto por jogo, ~0,5 amarelo nos jogos em que é usada
    escanteio: 0.53, // chance de escanteio depois de defesa ou bloqueio (0,45 e 0,2 com 0,85 ataque por minuto; ~8 escanteios por jogo)
    escanteioDuelo: 0.25, // chance de escanteio quando a defesa corta uma jogada pelo lado
    cabecadaEscanteio: 0.4, // chance de o escanteio ou a falta alçada virar finalização
    penalti: 0.072, // das faltas no centro do ataque
    faltaDireta: 0.15, // das faltas no ataque que não são pênalti (0,27 até 29/10/2026: quase 2 cobranças diretas por jogo, o dobro do futebol real)
    // Papéis (src/papeis.js), valores iniciais a calibrar (ferramentas/sim_papeis_laterais.mjs):
    //   passagemPorDentro: o que muda no mapa com a bola do Apoiador do DR quando há um ponta aberto (RW ou MR) na frente dele (no DL, o espelho);
    //   alaPorLado: parte do peso no fundo do lado do ala (de papel que não é o Apoiador) que sobe para o meio do lado com a bola do lado dele,
    //     ou fecha o centro da defesa com a bola do outro lado; entrosarTroca: jogos de entrosamento de quem troca de papel (supabase/164)
    //   transicao: no contra-ataque do adversário, quanto da defesa de quem tem papel sai do mapa com a bola (ele ainda não voltou) em vez do mapa sem a bola
    papeis: { passagemPorDentro: { AD: -0.20, AC: 0.10, MD: 0.10 }, alaPorLado: 0.3, entrosarTroca: 3, transicao: 1 },
    faltaRecomeca: true,
    // Regras da T1 (adendo de 30/10 ao plano dos papéis): só valem com simularPartida(..., { regrasT1: true }), o padrão; calcularPartida liga a partir
    // de PAPEIS_DESDE. regrasT1 é a chave que o motor lê durante a partida; t1: valores do CONFIG que mudam com as regras (aplicados e devolvidos).
    //   reserva: defesa de reserva, a soma dos pesos nas zonas D do mapa com a bola (quem fica atrás quando o time ataca); ao perder a bola, a chance de
    //     contra-ataque do adversário vai por (referencia / reserva) ^ expoente (a referência é a média das formações prontas);
    //   pressionar ("ao perder a bola"): retomada = chance de recuperar na hora, vezes a pressão do time na zona contra quem tem a bola ali;
    //     falha = quanto o contra-ataque fica mais provável quando a pressão não pega; gasto = energia a mais por minuto;
    //   recompor: contra = quanto do contra-ataque sobra (e o time não é pego fora do lugar); posse = o que fica do controle do meio
    regrasT1: false,
    transicao: { reserva: { referencia: 3.8, expoente: 2 }, pressionar: { retomada: 0.25, falha: 1.4, gasto: 0.1 }, recompor: { contra: 0.35, posse: 0.95 } },
    t1: {}, // falta fora do ataque em quem perdia o duelo: o time recomeça do mesmo setor, em vez de ganhar o duelo
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
  const PONTA_ABERTO = ["RW", "LW", "MR", "ML"]; // na frente do Apoiador, quem fica aberto (padrões Agudo e Garçom); AMR/AML (Condutor) corta para dentro
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
    const moral = saldo < 0 && cap ? 1 + (cap.j.at[A.inf] - 25) * CONFIG.capitao : 1;
    const base = (t.mandante ? CONFIG.mando : 1) * moral;
    const mAtk = { D: 1, M: 1 + CONFIG.mentalidadeAtaque * I.mentalidade, A: 1 + CONFIG.mentalidadeAtaque * I.mentalidade };
    const agr = 1 + CONFIG.agressividadeDefesa * I.agressividade, pre = 1 + CONFIG.pressaoDefesa * I.pressao, abre = I.mentalidade > 0 ? 1 - CONFIG.mentalidadeDefesa * I.mentalidade : 1 - CONFIG.mentalidadeRetranca * I.mentalidade;
    const mDef = { D: agr * abre, M: agr * abre * pre, A: agr * pre };
    const ent = entrosamento(t.emCampo);
    t.goleiro = null; t.temLibero = false;
    for (const z of ZONAS) { t.atk[z] = 0; t.def[z] = 0; t.zonas[z] = []; t.zonasDef[z] = []; }
    const alas = []; // alas de papel que não é o Apoiador: mudam com o lado da bola
    t.reserva = 0; // defesa de reserva: peso nas zonas D com a bola
    const transicao = {}; let naTransicao = false; // o que muda na defesa quando o adversário sai em contra-ataque (quem tem papel ainda está no mapa com a bola)
    for (const jog of t.emCampo) {
      const f = jog.fam * base * eficacia(jog) * fatorDeMomento(jog.j) * (jog.dia || 1) * ent[setorDaPosicao(jog.pos)]; // forma e moral do jogador (1 quando as duas estão em 50)
      jog.at = jog.j.at.map(v => v * f); // atributos efetivos neste momento da partida
      const pe = ajusteDoPe(jog.j.pe, jog.pos, jog.j.pf); // pé dominante: pesa no cruzamento, no passe e na finalização de quem joga pelos lados
      if (pe) for (const k in pe) jog.at[k] *= pe[k];
      if (jog.pos === "GK") { t.goleiro = jog; continue; }
      if (jog.pos === "SW") t.temLibero = true;
      const p = jog.j.id === I.armador ? CONFIG.pesoArmador : 1;
      // zonas: quem tem a bola (mapa com a bola do papel); zonasDef: quem marca (mapa sem a bola). Sem papel, as duas são a COBERTURA da posição
      const m = mapasDoPapel(jog.pos, jog.papel), sem = m ? m.sem : COBERTURA[jog.pos], P = POSICOES[jog.pos];
      let com = m ? m.com : COBERTURA[jog.pos];
      // passagem do Apoiador: com um ponta que fica aberto no mesmo lado (lido do lugar de cada um no campo), passa por dentro
      if (m && jog.papel === "apoiador" && P.linha === "defesa" && t.emCampo.some(o => o !== jog && PONTA_ABERTO.includes(o.pos) && POSICOES[o.pos].lado === P.lado)) {
        const pd = P.lado === "D" ? CONFIG.papeis.passagemPorDentro : espelharLado(CONFIG.papeis.passagemPorDentro);
        com = { ...com }; for (const z in pd) com[z] = (com[z] || 0) + pd[z];
      }
      if (m && P.linha === "ala") alas.push({ jog, lado: P.lado, w: sem["D" + P.lado] || 0 });
      for (const [z, w] of Object.entries(com)) {
        if (z[0] === "D") t.reserva += w;
        t.atk[z] += w * habilidadeAtaque(jog.at, z) * mAtk[z[0]];
        t.zonas[z].push({ jog, w, p: w * p });
      }
      for (const [z, w] of Object.entries(sem)) {
        t.def[z] += w * habilidadeDefesa(jog.at, z) * mDef[z[0]];
        t.zonasDef[z].push({ jog, w });
      }
      if (m) for (const z of ZONAS) {
        const dw = (com[z] || 0) - (sem[z] || 0);
        if (dw) { transicao[z] = (transicao[z] || 0) + CONFIG.papeis.transicao * dw * habilidadeDefesa(jog.at, z) * mDef[z[0]]; naTransicao = true; }
      }
    }
    if (t.goleiro) t.def.DC *= 1 + (t.goleiro.j.at[A.com] - 25) * CONFIG.comunicacaoGoleiro;
    // defesa com a bola em cada corredor (lado do próprio time): o ala do lado da bola sobe para pressionar, o do outro lado fecha a linha
    t.defTransicao = naTransicao ? Object.fromEntries(ZONAS.map(z => [z, Math.max(0, t.def[z] + (transicao[z] || 0))])) : t.def;
    t.defLado = { E: t.def, C: t.def, D: t.def };
    if (alas.length) for (const l of ["E", "D"]) {
      const d = { ...t.def };
      for (const a of alas) {
        const f = CONFIG.papeis.alaPorLado * a.w, fundo = "D" + a.lado, para = a.lado === l ? "M" + a.lado : "DC";
        d[fundo] -= f * habilidadeDefesa(a.jog.at, fundo) * mDef.D; d[para] += f * habilidadeDefesa(a.jog.at, para) * mDef[para[0]];
      }
      t.defLado[l] = d;
    }
    const linha = t.zonasDef.DC, peso = linha.reduce((s, o) => s + o.w, 0);
    t.comDefesa = peso ? linha.reduce((s, o) => s + o.w * o.jog.j.at[A.com], 0) / peso : 10;
    t.controle = LADOS.reduce((s, l) => s + (t.atk["M" + l] + t.def["M" + l]) * (l === "C" ? CONFIG.pesoCentroPosse : 1), 0)
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
  function avaliarZonas(escalacao, instrucoes = {}) {
    const t = iniciar(prepararTime({ nome: "", escalacao, instrucoes }));
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
  function defesaDoCorredor(atk, def) {
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

  // Monta a chance depois de vencido o duelo na zona de ataque.
  function criarChance(rng, atk, def, lado, pivo, { forcado = false, contra = false } = {}) {
    const area = atk.zonas.AC, x = CONFIG.xgBase, k = CONFIG.inclinacaoXg, I = atk.instr;
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
    const opcoes = lado === "C"
      ? [["profundidade", pt.profundidade * alvoVeloz * estilo.profundidade], ["area", pt.area * presenca * estilo.area], ["longe", pt.longe * estilo.longe * pe(pivo.at[A.lon])]]
      : [["cruzamento", pt.cruzamento * alvoCruz * estilo.cruzamento], ["corte", pt.corte * pe(media(pivo.at[A.fin], pivo.at[A.lon]))], ["longe", pt.longeLado * estilo.longe * pe(pivo.at[A.lon])]];
    const tipo = !forcado ? sortearPeso(rng, opcoes, o => o[1])[0] : lado !== "C" && fin && fin.cruzaForcado && rng.chance(fin.cruzaForcado) ? "cruzamento" : "longe";
    // chute forçado: quem chuta mal rola para quem chuta melhor (ele mesmo ou um atacante da área)
    if (forcado && D && tipo === "longe") { const quem = sortearPeso(rng, [{ jog: pivo }, ...area.filter(o => o.jog !== pivo)], o => Math.pow(pe(o.jog.at[A.lon]), 2)); if (quem) pivo = quem.jog; }
    const zagueiro = (sortearPeso(rng, def.zonasDef.DC, o => o.w) || {}).jog;
    const zag = zagueiro ? zagueiro.at : null, gk = def.goleiro ? def.goleiro.at : null;
    const semZaga = 12, semGoleiro = 5; // valores usados quando não há zagueiro na zona ou goleiro em campo
    const c = { tipo, lado, criador: pivo, finalizador: pivo, zagueiro, contra };
    // quem recebe o passe ou o cruzamento não é quem o fez, a não ser que esteja sozinho na área
    const outros = area.filter(o => o.jog !== pivo), alvos = outros.length ? outros : area;
    const ehAlvo = o => o.jog.j.id === I.alvo ? CONFIG.pesoAlvo : 1;

    if (tipo === "cruzamento") {
      // alto ou rasteiro: o escolhido na instrução; no misto, sorteado pela força da área no alto e no chão
      c.rasteiro = I.cruzamento === "rasteiro" || I.cruzamento !== "alto" && rng.chance(alvoRasteiro / (alvoAereo + alvoRasteiro || 1));
      const Cz = CONFIG.cruzamento;
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
    // chute da área e do cruzamento rasteiro: parte sai com o pé ruim; a divisão devolve a média, então só quem tem o pé pior que a liga perde
    const PF = CONFIG.peFraco.chute, pf = c.finalizador.j.pf;
    if ((tipo === "area" || c.rasteiro) && pf != null) {
      const ruim = rng.chance(PF.parte);
      c.xg *= (ruim ? 1 - PF.perda * fraquezaDoPe(pf) : 1) / (1 - PF.parte * PF.perda * CONFIG.peFraco.media);
      if (ruim) c.peRuim = pf; // a narração conta o chute com o pé ruim
    }
    // nem toda chance do mesmo tipo vale o mesmo: umas saem limpas, outras apertadas
    const v = CONFIG.variacaoChance[tipo] || 0;
    if (v) c.xg *= Math.exp(rng.normal(0, v) - v * v / 2);
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
  function narrar(c, resultado, goleiro, nm) {
    const f = nm(c.finalizador), cr = nm(c.criador), lado = NOME_LADO[c.lado];
    const inicio = {
      cruzamento: c.rasteiro ? `${cr} cruza rasteiro da ${lado} e ${f} bate de primeira` : `${cr} cruza da ${lado} e ${f} cabeceia`,
      corte: `${f} vem da ${lado} em diagonal e chuta`,
      profundidade: `${cr} lança em profundidade e ${f} sai na cara do gol`,
      area: c.criador === c.finalizador ? `${f} recebe na área e finaliza` : `${cr} acha ${f} na área, que finaliza`,
      longe: `${f} arrisca de fora da área`,
      escanteio: `${cr} cobra o escanteio e ${f} cabeceia`,
      falta: c.criador === c.finalizador ? `${f} cobra a falta direto no gol` : `${cr} levanta a falta na área e ${f} cabeceia`,
      penalti: `${f} cobra o pênalti`,
    }[c.tipo] + peRuimNarrado(c);
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
  // minutos em que a bola volta ao centro: segundo tempo e os dois tempos da prorrogação
  const reinicio = min => min === 46 || min === 91 || min === 106;
  // opcoes.prorrogacao: jogo de mata-mata; empate nos 90 minutos leva a mais 30, jogados como o resto da partida
  // opcoes.calor: calor forte, todos cansam mais rápido. opcoes.chuva: 0, 1 (fraca) ou 2 (forte). opcoes.jogoGrande: a experiência pesa mais no dia de cada jogador
  // opcoes.regrasT1 (padrão true): as regras da T1 (CONFIG.t1 e CONFIG.regrasT1); calcularPartida desliga antes de PAPEIS_DESDE.
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
    const evento = (i, tipo, texto) => empurrar(eventos, { n: seq++, min, ...(ac ? { ac } : {}), time: i, tipo, texto, p: parcial() });
    const cartao = (i, tipo, texto) => pendentes.push({ i, tipo, texto });
    // Ataque que termina sem finalização: desarme, passe interceptado, domínio errado ou passe errado, conforme os atributos dos dois.
    const ONDE = { D: () => "na saída de bola", M: l => l === "C" ? "no meio-campo" : `pela ${NOME_LADO[l]} do meio-campo`, A: l => l === "C" ? "na entrada da área" : `no ataque pela ${NOME_LADO[l]}` };
    // Todo ataque é narrado passo a passo: os duelos vencidos (saída de bola, meio-campo) ficam na trilha e entram no texto do desfecho.
    // A trilha é uma lista de frases, cada uma com suas orações; "portador" é quem está com a bola, para a narração ligar um
    // jogador ao outro com o passe ("... e toca para Fulano") em vez de a bola mudar de pé sem explicação.
    let atacante = null, ultimoNarrado = null, aposFalta = false, impedido = false; // aposFalta: a jogada recomeça com a cobrança de uma falta // time do ataque em andamento e do último ataque que foi narrado
    let trilha = [], rota = [], portador = null, ultimoAtaque = null, saida = null, cadeia = null, bola = null, proximo = null, rodou = false, emContra = false, cobranca = null; // bola: quem a recuperou e em que linha do seu ataque; proximo: ataque seguinte já decidido
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
    const comTrilha = texto => { const t = trilha.length ? trilha.map(frase).join(". ") + ". " + texto : texto; trilha = []; rota = []; portador = null; ultimoNarrado = atacante; return t; };
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
      const p = d.pivo, m = d.marcador, lado = zona[1], facil = comFolga(d);
      if (!p) { portador = null; rota.push([zona]); trilha.push([`${tm(i)} ${zona[0] === "D" ? "sai jogando" : "avança"} ${PELO[lado]}`]); return; }
      const depoisDeFalta = aposFalta, mesmo = recebe(p), nome = nm(p);
      // falta fora da zona de ataque: o time fica com a bola e recomeça dali, cobrando a falta (não é lei da vantagem)
      if (d.falta && m) { evento(i, "falta", comTrilha(`Falta de ${nm(m)} em ${nome} ${ONDE[zona[0]](lado)}.`)); rota.push([zona, p.j.id]); portador = p; aposFalta = true; return; }
      rota.push(m ? [zona, p.j.id, m.j.id] : [zona, p.j.id]);
      if (zona[0] === "D") trilha.push(times[i].instr.passe === "longo" ? [`${nome} domina no campo de defesa ${PELO[lado]}`, "prepara o lançamento"] : [`${nome} sai jogando ${PELO[lado]}`, ...(m ? [facil ? `passa fácil por ${nm(m)}` : `passa por ${nm(m)}`] : facil ? ["sem ser incomodado"] : [])]);
      else trilha.push([`${mesmo ? (depoisDeFalta ? nome + " cobra a falta rápido e segue" : trilha.length ? "Segue" : nome + " segue") : nome + " carrega"} ${lado === "C" ? "pelo centro do meio-campo" : `pela ${NOME_LADO[lado]} do meio-campo`}`, ...(m ? [facil ? `deixa ${nm(m)} para trás com facilidade` : `supera ${nm(m)}`] : facil ? ["com todo o espaço do mundo"] : [])]);
    }
    function perdaDePosse(i, zona, d) {
      impedido = false;
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
      if (zona[0] === "A") { // o passe para quem estava adiantado: impedimento, falta indireta para a defesa (a bola vai para ela como em qualquer perda)
        const K = CONFIG.impedimento.naPerda, I = times[i].instr, alvo = sortearPeso(rng, times[i].zonas.AC.filter(o => o.jog !== p), o => o.w);
        if (alvo && rng.chance(K.base * (times[1 - i].instr.impedimento ? K.linha : 1) * (I.passe === "longo" ? K.longo : I.passe === "curto" ? K.curto : 1))) {
          estat[i].impedimentos++; impedido = true; evento(i, "impedimento", comTrilha(IMPEDIDO[seq % IMPEDIDO.length](nm(p), nm(alvo.jog)))); return true;
        }
      }
      const molhado = 1 + CONFIG.chuva.erros * chuva, causas = [["dominio", (60 - p.at[A.dom]) * molhado], ["passe", (60 - p.at[A.pas]) * molhado]];
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
      if (marcador.amarelos >= 2) return expulsar(i, marcador, `Segundo amarelo para ${nm(marcador)} pela falta${em}: está expulso!`);
      cartao(i, "amarelo", `Cartão amarelo para ${nm(marcador)} pela falta${em}.`);
    }
    function expulsar(i, jog, texto) {
      estat[i].vermelhos++; jogadores[jog.j.id].vermelho = true;
      sair(i, jog); cartao(i, "vermelho", texto);
    }

    // Duelo de zona: força de ataque de um time contra a força de defesa do outro na zona espelhada.
    function duelo(i, zona, logit = 0, contra = false) {
      const atk = times[i], def = times[1 - i], dz = contra && !(CONFIG.regrasT1 && def.instr.aoPerder === "recompor") ? defesas[i].T : defesas[i][zona[1]], e = estat[i]; // no contra-ataque, a defesa pega fora do lugar (transição)
      const a = atk.atk[zona] + CONFIG.zonaVazia, d = dz[zona] + CONFIG.zonaVazia;
      // confronto tático: passe contra pressão (só no ataque construído), custo de jogar no contra-ataque e lado ensaiado
      const pref = atk.instr.lado, ensaiado = pref === zona[1] || (pref === "lados" && zona[1] !== "C");
      const tatico = (contra ? 0 : chuva * CONFIG.chuva[atk.instr.passe] + CONFIG.passeXpressao[atk.instr.passe][def.instr.pressao][zona[0]] + (atk.instr.passe === "curto" && zona[0] === "A" ? CONFIG.curtoXretranca * Math.min(0, def.instr.mentalidade) : 0) +(atk.instr.contraAtaque && zona[0] === "M" ? CONFIG.contraAtaque.construcao : 0))
        + (ensaiado && zona[0] !== "D" ? CONFIG.ensaio : 0);
      // quem disputa a jogada, um de cada lado, e o confronto de pés entre os dois (regra do FMP): mesmo pé dominante favorece quem ataca,
      // e o ambidestro leva vantagem maior sobre quem só tem um pé; pés opostos, ou dois ambidestros, não mudam nada.
      // A compensação tira de todo duelo o ganho médio, para a regra não aumentar os gols da liga. Sem pé definido, nada acontece.
      const pivo = (sortearPeso(rng, atk.zonas[zona], x => x.p) || {}).jog, marcador = (sortearPeso(rng, def.zonasDef[espelho(zona)], x => x.w) || {}).jog;
      const pa = pivo && pivo.j.pe, pd = marcador && marcador.j.pe;
      const PF = CONFIG.peFraco, pf = pivo && pivo.j.pf;
      const pes = !pa || !pd ? 0 : (pa === "A" ? (pd === "A" ? 0 : CONFIG.pe.ambidestro * (pf == null ? 1 : (pf - 12) / PF.ambidestro)) : pa === pd ? CONFIG.pe.mesmo : 0) - CONFIG.pe.compensacao;
      // pé fraco de quem tem a bola: no ataque, o marcador o força para o pé ruim; atrás e no meio, a pressão pega quem só sai jogando com um pé
      const fraco = pf == null ? 0 : (PF.media - fraquezaDoPe(pf)) * (zona[0] === "A" ? PF.tempo * (marcador ? marcador.at[A.mar] / 25 : 1) : PF.pressao * def.instr.pressao);
      // folga: a vantagem de quem ataca acima do normal da zona (negativa quando a vantagem é da defesa); o embalo que veio do duelo anterior não conta
      const folga = tatico + fraco + CONFIG.inclinacaoDuelo * Math.log(a * (1 + pes) / d);
      const p = 1 / (1 + Math.exp(-(CONFIG.baseDuelo[zona[0]] + logit + folga)));
      let venceu = rng.chance(p), parada = false, comFalta = false, recomeca = false;
      if (marcador && rng.chance(CONFIG.falta * (1 + CONFIG.faltaPorAgressividade * def.instr.agressividade) * Math.sqrt(marcador.j.at[A.agr] / 25) * (CONFIG.faltaPorPosicao[marcador.pos] || 1))) {
        falta(1 - i, marcador, pivo); comFalta = true;
        // falta no ataque vira bola parada; atrás, quem ganhava segue, e quem perdia fica com a bola e recomeça do mesmo setor (sem faltaRecomeca, a falta dava o duelo)
        if (zona[0] === "A") parada = true; else if (!venceu && CONFIG.faltaRecomeca) recomeca = true; else venceu = true;
      } else {
        e.zonas[zona][venceu ? 0 : 1]++;
        if (pivo) registrar(pivo, venceu, p);
        if (marcador) registrar(marcador, !venceu, 1 - p);
      }
      if (pivo && rng.chance(CONFIG.lesao * (1 + 0.2 * def.instr.agressividade) * (1 - (times[i].prevencao || 0)))) {
        const r = rng.n(), dias = r < 0.5 ? rng.int(1, 3) : r < 0.8 ? rng.int(4, 10) : rng.int(11, 30);
        jogadores[pivo.j.id].lesionado = true; lesoes.push({ id: pivo.j.id, time: i, dias });
        sair(i, pivo); recebe(pivo); evento(i, "lesao", comTrilha(`${nm(pivo)} se machuca e não continua.`)); reporLesionado(i, pivo);
        return { venceu: false, pivo: null, marcador, parada: false };
      }
      return { venceu, pivo, marcador, parada, falta: comFalta, folga, recomeca };
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
      return { resultado, xg, chanceDeGol };
    }

    function finalizar(i, c) {
      const atk = times[i], def = times[1 - i], e = estat[i];
      if (c.tipo === "profundidade") {
        const K = CONFIG.impedimento;
        const p = def.instr.impedimento ? limitar((K.porPasse[atk.instr.passe] + (def.comDefesa - 25) * K.porComunicacao + (def.temLibero ? K.libero : 0)) * (c.contra ? K.noContraAtaque : 1), 0.05, 0.65) : K.semLinha;
        if (rng.chance(p)) { e.impedimentos++; recebe(c.criador); evento(i, "impedimento", comTrilha(`${nm(c.criador)} lança e ${nm(c.finalizador)} é pego em impedimento.`)); return; }
        if (def.instr.impedimento) c.xg = limitar(c.xg * (c.contra ? K.furouNoContraAtaque : K.furou), 0.01, 0.6);
      }
      const { resultado, xg, chanceDeGol } = chutar(c, def.goleiro);
      e.chances++; e.xg += xg; e.finalizacoes++;
      if (resultado === "gol" || resultado === "defesa") e.noGol++;
      if (resultado === "gol") { e.gols++; sujo = true; saida = 1 - i; }
      const sf = jogadores[c.finalizador.j.id];
      sf.finalizacoes++; sf.xg += xg; if (resultado === "gol") sf.gols++;
      if (c.tipo === "escanteio" || c.tipo === "falta" || c.tipo === "penalti") portador = null; else recebe(c.criador);
      empurrar(lances, { n: seq++, min, ...(ac ? { ac } : {}), time: i, tipo: c.tipo, lado: c.lado, xg, xgGk: def.goleiro && (resultado === "gol" || resultado === "defesa") ? chanceDeGol(CONFIG.goleiroReferencia) : undefined, resultado, finalizador: c.finalizador.j.id, criador: c.criador.j.id, quem: c.finalizador.j.nome, assist: c.criador !== c.finalizador ? c.criador.j.nome : null, goleiro: def.goleiro ? def.goleiro.j.id : null, rota: rota.length ? rota : undefined, texto: comTrilha(narrar(c, resultado, def.goleiro, nm)), p: parcial() });
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
      const atk = times[i], def = times[1 - i], dz = defesas[i].C, e = estat[i];
      const bonus = contra ? CONFIG.contraAtaque.logit + (atk.instr.contraAtaque ? CONFIG.contraAtaque.logitPorMentalidade * Math.max(0, def.instr.mentalidade) : 0) : 0;
      // quem recupera a bola pode sair em contra-ataque, mais ainda contra time que joga para a frente
      // embalo de um duelo: quanto da folga segue para o lance seguinte (de 0 ao teto); a da defesa vale para o contra-ataque
      const embalo = d => Math.min(CONFIG.embalo.teto, Math.max(0, CONFIG.embalo.parte * d.folga));
      const embaloDaDefesa = d => Math.min(CONFIG.embalo.teto, Math.max(0, -CONFIG.embalo.parte * d.folga)) / CONFIG.embalo.teto;
      let roubada = 0, roubadaFacil = false; // roubada, de 0 a 1: com quanta folga a defesa ganhou o duelo que encerrou o ataque
      const perdeu = zona => {
        if (contra) return;
        const T = CONFIG.transicao, ao = CONFIG.regrasT1 ? atk.instr.aoPerder : "misto";
        // pressionar: a retomada na hora, na zona em que perdeu, pela pressão do time ali contra quem ficou com a bola
        if (ao === "pressionar") {
          const forca = (atk.def[zona] + CONFIG.zonaVazia) / (def.atk[espelho(zona)] + CONFIG.zonaVazia);
          if (rng.chance(limitar(T.pressionar.retomada * Math.sqrt(forca), 0.05, 0.5))) {
            e.retomadas = (e.retomadas || 0) + 1; evento(i, "posse", `${tm(i)} pressiona logo e recupera a bola ${ONDE[zona[0]](zona[1])}.`);
            proximo = { time: i, zona: zona[0] }; bola = null; return;
          }
        }
        const K = CONFIG.contraAtaque, m = atk.instr.mentalidade;
        // quem perde a bola jogando para a frente ou com a linha alta fica mais exposto; time montado para o contra-ataque aproveita mais
        const fator = def.instr.contraAtaque ? (m > 0 ? 1 + K.porMentalidade * m : Math.max(0.3, 1 + K.porRetranca * m)) : 1 + K.semInstrucao * Math.max(0, m);
        // contra-ataque é arma de quem espera atrás: rende mais com mentalidade defensiva e menos com o próprio time adiantado
        const eu = def.instr.mentalidade, postura = !def.instr.contraAtaque ? 1 : eu < 0 ? 1 - K.porPostura * eu : Math.max(0.4, 1 - K.posturaOfensiva * eu);
        const p = (def.instr.contraAtaque ? K.com : K.sem) * fator * postura * (atk.instr.impedimento ? K.linhaAlta : 1) * (1 + CONFIG.embalo.contra * roubada)
          * (CONFIG.regrasT1 ? Math.pow(T.reserva.referencia / Math.max(1, atk.reserva), T.reserva.expoente) * (ao === "pressionar" ? T.pressionar.falha : ao === "recompor" ? T.recompor.contra : 1) : 1);
        if (rng.chance(p)) { estat[1 - i].contraAtaques++; evento(1 - i, "contra", impedido ? `${tm(1 - i)} cobra a falta rápido e sai em contra-ataque.` : roubadaFacil ? `${tm(1 - i)} toma a bola com facilidade e dispara no contra-ataque.` : `${tm(1 - i)} recupera a bola e sai em contra-ataque.`); emContra = true; atacar(1 - i, true); emContra = false; if (proximo) proximo.zona = "D"; }
      };
      e.ataques++; trilha = []; rota = []; portador = null; bola = null; aposFalta = false;
      if (cobranca && cobranca.time === i && !contra) { portador = cobranca.jog; aposFalta = true; } // recomeço depois de falta: quem sofreu cobra
      cobranca = null;
      const recomecar = (zona, d) => { passo(i, zona, d); cobranca = { time: i, jog: d.pivo }; proximo = { time: i, zona: zona[0] }; };
      soltarCartoes();
      if (!contra && ultimoNarrado === i && !rodou) trilha.push(Object.assign([RETOMA[seq % RETOMA.length](tm(i))], { fechada: true }));
      atacante = i;
      ultimoAtaque = i; if (!contra) rodou = false;
      if (contra) inicio = "M";
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
      if (d.parada) {
        const penal = lado === "C" && rng.chance(CONFIG.penalti); // decidido aqui (era dentro de bolaParada), para o texto da falta já dizer se foi pênalti
        if (d.pivo && d.marcador) { recebe(d.pivo); evento(i, "falta", comTrilha(penal ? `Pênalti! ${nm(d.marcador)} derruba ${nm(d.pivo)} na área.` : `Falta de ${nm(d.marcador)} em ${nm(d.pivo)} ${ONDE.A(lado)}.`)); }
        return bolaParada(i, "falta", lado, penal);
      }
      if (!d.pivo || !atk.emCampo.includes(d.pivo)) { if (trilha.length) evento(1 - i, "posse", comTrilha(`${tm(1 - i)} fica com a bola ${ONDE.A(lado)}.`)); return; }
      const forcado = !d.venceu;
      if (forcado && lado !== "C" && rng.chance(CONFIG.escanteioDuelo)) { recebe(d.pivo); evento(1 - i, "canto", comTrilha(`${d.marcador ? nm(d.marcador) : tm(1 - i)} corta ${nm(d.pivo)} e cede o escanteio.`)); return bolaParada(i, "escanteio", lado); }
      if (forcado && !rng.chance(CONFIG.chuteForcado * ((CONFIG.finalizar[atk.instr.finalizar] || {}).forcado || 1))) { roubada = embaloDaDefesa(d); roubadaFacil = -d.folga >= CONFIG.embalo.narrar; if (perdaDePosse(i, "A" + lado, d)) perdeu("A" + lado); return; }
      const chance = criarChance(rng, atk, def, lado, d.pivo, { forcado, contra });
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
    times.forEach(t => t.emCampo.forEach(jog => { jogadores[jog.j.id].energia = Math.round(jog.energia); }));
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
  return { CONFIG, INSTRUCOES_PADRAO, ZONAS, espelho, COBERTURA, prepararTime, setorDaPosicao, entrosamento, defesaPorCorredor, desenhoDoTime, defesaNaTransicao, avaliarZonas, simularPartida };
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
        if (l.resultado === "gol" || l.resultado === "defesa") g.xgContra += l.xgGk ?? l.xg;
      }
    }
    return Object.entries(partida.jogadores).map(([id, j]) => {
      const x = de(id), minutos = (j.saiu === null ? partida.duracao || 90 : j.saiu) - j.entrou;
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
    else if (saldo >= 2 && difXg < 0.7) frases.push(`O placar ficou mais largo do que o jogo: ${f2(eu.xg)} de xG nosso contra ${f2(ele.xg)} do adversário. A diferença esteve na pontaria, não nas chances.`);
    else if (saldo <= -2 && difXg > -0.7) frases.push(`O placar foi mais pesado do que o jogo: criamos ${f2(eu.xg)} de xG contra ${f2(ele.xg)} do adversário. A diferença esteve na pontaria, não nas chances.`);
    else if (saldo !== 0 && Math.abs(difXg) < 0.3) frases.push(`Jogo parelho decidido no detalhe: ${f2(eu.xg)} de xG nosso contra ${f2(ele.xg)} do adversário.`);
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
    if (sofrido.length && sofrido[0][1] > 0.5) frases.push(`O adversário passou mais ${sofrido[0][0] === "DC" ? "pelo centro da nossa defesa" : "pela nossa " + NOME_ZONA[sofrido[0][0]]}: venceu ${pc(sofrido[0][1])} dos duelos ali.`);
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
    const times = lados.map((l, i) => {
      const t = taticas[i];
      return prepararTime({ nome: l.clube.nome, escalacao: t.escalacao, banco: t.banco, instrucoes: t.instrucoes, mandante: i === 0 && !copa, prevencao: l.saude ? l.saude.prevencao : 0 });
    });
    const p = simularPartida(criarRng(semente), times[0], times[1], { prorrogacao: copa, chuva: clima.chuva, calor: clima.calor, jogoGrande: jogoGrande(partida), regrasT1: temporada >= PAPEIS_DESDE });
    // o comentário de cada time vem do analista dele; sem os dados da comissão (amistoso, teste), vale o nível máximo
    const r = montarRelatorio(p, [casa, fora].map(l => l.saude ? l.saude.analista || 1 : 3));
    const acr = p.acrescimos || [0, 0];
    const lances = p.narracao.map((l, ordem) => ({ partida_id: partida.id, ordem, min: l.min, libera_em: horaDoMinuto(partida.inicio, (l.s === undefined ? l.min : l.min - 1 + l.s / 60) + (l.ac || 0), minutosTransmissao, acr, l.min).toISOString(), dados: l }));
    // abertura da transmissão, liberada no apito inicial: escalações, clima e cara ou coroa (a moeda não mexe no jogo)
    const extra = criarRng((semente >>> 0) + 7919);
    lances.unshift({ partida_id: partida.id, ordem: -1, min: 0, libera_em: new Date(partida.inicio).toISOString(), dados: {
      n: -1, min: 0, tipo: "inicio", acrescimos: acr, moeda: extra.int(0, 1), clima: { nome: clima.nome, temp: clima.temp }, grande: jogoGrande(partida),
      escalacoes: taticas.map(t => ({ titulares: t.escalacao.map(e => ({ nome: e.j.nome, pos: e.pos, ...(e.j.numero ? { numero: e.j.numero } : {}), ...(e.papel ? { papel: e.papel } : {}) })), banco: (t.banco || []).map(j => ({ nome: j.nome, pos: j.pos, ...(j.numero ? { numero: j.numero } : {}) })) })),
    } });
    // Copa: empate nos 90 minutos vai à prorrogação, jogada pelo motor como o resto da partida; persistindo, aos pênaltis, que o motor também
    // bate um a um. Com prorrogação, a transmissão e o resultado terminam depois do horário de fim da partida; com pênaltis, depois da última cobrança.
    const placar = p.placar.slice(), fimDoJogo = horaDoMinuto(partida.inicio, p.duracao + (p.duracao > 90 ? 0 : acr[1]), minutosTransmissao, acr, p.duracao).getTime();
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
      // papel em que cada titular jogou (o padrão quando não escolheu), só nas posições com papéis e a partir de PAPEIS_DESDE: trocar custa entrosamento (164)
      papeis: temporada >= PAPEIS_DESDE ? taticas.flatMap(t => t.escalacao.filter(e => PAPEL_PADRAO[e.pos]).map(e => ({ id: e.j.id, papel: e.papel || PAPEL_PADRAO[e.pos] }))) : [],
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
  return { AMARELOS_PARA_SUSPENSAO, jogosFora, DIAS_PARA_BOT, gerarTabela, taticaDoDirigente, taticaDoAmistoso, horaDoMinuto, aplicarSituacao, climaDaPartida, efeitoDoClima, jogoGrande, COPA, foraDaCopa, CONTINENTAL, foraDoContinental, calcularPartida, classificacao, DESCENSO_DA_PRIMEIRA, CLASSIFICADOS_DO_PLAYOFF, vencedorDoPlayoff, vencedorDoConfronto, rodadasDeLiga, vencedorDoGrupo, PREMIOS, PREMIOS_DE_FORA, premioDaLiga, GUARDADO, classificacaoFinal, BONUS_DA_C, BONUS_DO_ACESSO_NA_C, meritoDaSerieC, mediaDosOnze, superacaoNaSerie, tecnicosDoAno, PESOS_DO_TECNICO_GERAL, pontosDoTecnicoGeral, tecnicoGeral, proximaFaseDosPlayoffs };
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
  const { ATRIBUTOS, ATR_MIN, ATR_MAX, IDX, POSICOES, PESOS, VIZINHAS, notaDeTeto, TETO_DO_TALENTO } = __modelo;
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
    mei: { nome: "Meio", at: ["pas", "cri", "dom", "cru"] },
    ata: { nome: "Ataque", at: ["fin", "lon", "dri"] },
    fis: { nome: "Físico", at: ["vel", "for", "res"] },
    tat: { nome: "Tática", at: ["com", "pos", "equ", "agr", "inf", "exc"] },
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
  function focoAutomatico(pos) {
    const p = focoDaPosicao(pos), doFoco = new Set(FOCOS[p].at), pesos = PESOS[(POSICOES[pos] || {}).papel] || {};
    const c = Object.keys(pesos).filter(k => !doFoco.has(k) && treinavel(pos, IDX[k])).sort((a, b) => pesos[b] - pesos[a]).slice(0, 3).map(k => IDX[k]);
    for (const k of ["vel", "for", "res", "equ"]) if (c.length < 3 && !doFoco.has(k) && !c.includes(IDX[k])) c.push(IDX[k]);
    return { p, c };
  }
  // Foco em uso: o salvo pelo dirigente, se for válido; senão, o automático.
  function focoDoJogador(j) {
    const t = j.treino, auto = focoAutomatico(j.pos);
    // goleiro só treina o foco de goleiro ou o físico; jogador de linha não treina o foco de goleiro
    if (!t || !FOCOS[t.p] || ((t.p === "goleiro") !== (j.pos === "GK") && t.p !== "fisico")) return auto;
    const c = Array.isArray(t.c) ? [...new Set(t.c.map(Number))].filter(i => i >= 0 && i < ATRIBUTOS.length && treinavel(j.pos, i)).slice(0, 3) : [];
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
    const pesos = PESOS[(POSICOES[j.pos] || {}).papel] || {}, resto = Object.keys(pesos).filter(k => j.at[IDX[k]] < ATR_MAX && treinavel(j.pos, IDX[k]));
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
    const at = j.at.slice(), pts = ATRIBUTOS.map((_, i) => (j.pts && j.pts[i]) || 0), subiu = [], C = CONFIG_TREINO;
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
  const { ATRIBUTOS, LISTA_POSICOES, notaBruta, notaNaPosicao } = __modelo;
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
    const at = ATRIBUTOS.map(a => limitar(Math.round((a.grupo === "gol" && pos !== "GK" ? 3 : nivel) + rng.normal(0, 2)), 1, 50));
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
    reserva: 0.25,          // depois da compra, o caixa precisa ficar acima de 25% do teto de folha
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
