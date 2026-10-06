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
  const NOME_DO_PE = { D: "direito", E: "esquerdo", A: "ambidestro" };
  const CONFIG_PE = { cruzaBem: 1.04, cruzaMal: 0.90, passaMal: 0.97, finalizaBem: 1.05 };
  function ajusteDoPe(pe, pos) {
    const p = POSICOES[pos];
    if (!p || p.lado === "C" || !pe || pe === "A") return null;
    if (pe === p.lado) return { [IDX.cru]: CONFIG_PE.cruzaBem };
    return p.linha === "ataque" || p.linha === "meia"
      ? { [IDX.cru]: CONFIG_PE.cruzaMal, [IDX.fin]: CONFIG_PE.finalizaBem, [IDX.lon]: CONFIG_PE.finalizaBem }
      : { [IDX.cru]: CONFIG_PE.cruzaMal, [IDX.pas]: CONFIG_PE.passaMal };
  }
  // nota na posição já com o efeito do pé: é a que o bot (e o botão de escalar os melhores) usa para escolher quem joga em cada lado
  function notaComPe(j, pos) {
    const a = ajusteDoPe(j.pe, pos);
    if (!a) return notaNaPosicao(j, pos);
    const at = j.at.slice();
    for (const k in a) at[k] *= a[k];
    return notaBruta(at, pos) * FAMILIARIDADE[familiaridade(j, pos)];
  }
  // como o pé cai numa posição de lado: "natural", "trocado" ou "" (centro, ambidestro ou sem pé definido)
  const peNaPosicao = (pe, pos) => { const p = POSICOES[pos]; return !p || p.lado === "C" || !pe || pe === "A" ? "" : pe === p.lado ? "natural" : "trocado"; };

  const notaNaPosicao = (jogador, pos) => notaBruta(jogador.at, pos) * FAMILIARIDADE[familiaridade(jogador, pos)];

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
  return { ATR_MIN, ATR_MAX, ATRIBUTOS, IDX, POSICOES, LISTA_POSICOES, PESOS, FAMILIARIDADE, NOME_FAMILIARIDADE, VIZINHAS, familiaridade, notaBruta, NOME_DO_PE, CONFIG_PE, ajusteDoPe, notaComPe, peNaPosicao, notaNaPosicao, notaDeTeto, melhorPosicao };
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
    forma: { jogou: 3, porNota: 2.5, entrou: 1, parado: -2, lesionado: -4, volta: 0.1 },   // volta: quanto puxa de volta para 50 a cada rodada
    moral: { vitoria: 3, derrota: -3, jogou: 2, entrou: 1, banco: -2, volta: 0.1 },
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
  const CONFIG_EXPERIENCIA = { jogou: 1, entrou: 0.5, porIdade: [17, 8], desvio: [0.05, 0.01], limiteDoDia: 0.12, bonus: 0.03 };
  // vale a maior entre a gravada e a estimativa pela idade: quem demora a estrear não fica para trás de quem nunca jogou
  const experienciaPelaIdade = j => Math.max(0, Math.min(100, (j.idade - CONFIG_EXPERIENCIA.porIdade[0]) * CONFIG_EXPERIENCIA.porIdade[1]));
  const experienciaDe = j => j.exp != null ? Math.max(+j.exp, experienciaPelaIdade(j)) : experienciaPelaIdade(j);
  const desvioDoDia = exp => CONFIG_EXPERIENCIA.desvio[0] + (CONFIG_EXPERIENCIA.desvio[1] - CONFIG_EXPERIENCIA.desvio[0]) * Math.max(0, Math.min(100, exp)) / 100;
  // multiplicador do jogador nesta partida; sem sorteio (rng nulo), 1
  const diaDoJogador = (rng, j) => rng ? Math.max(1 - CONFIG_EXPERIENCIA.limiteDoDia, Math.min(1 + CONFIG_EXPERIENCIA.limiteDoDia, 1 + rng.normal(0, desvioDoDia(experienciaDe(j))))) : 1;
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
    let df = fora === "lesão" ? F.lesionado : jogou ? F.jogou + F.porNota * ((nota == null ? 6 : nota) - 6) : entrou ? F.entrou : F.parado;
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
  return { notaDoMomento, FORMACOES, escalar };
})();

const __motor = (() => {
  // Motor da partida.
  // Campo em 9 zonas: 3 linhas (D defesa, M meio, A ataque) x 3 lados (E, C, D), sempre vistas pelo time que as ocupa.
  // Cada ataque passa por três duelos de zona (saída de bola, construção, criação) e, se vencer, vira uma chance com xG.
  // Passo D: instruções, energia, substituições e ordens condicionais, faltas, cartões, lesões e bola parada.
  // As constantes saíram da calibragem (calibragem.html).
  const { limitar } = __rng;
  const { IDX, FAMILIARIDADE, familiaridade, notaNaPosicao, ajusteDoPe } = __modelo;
  const { fatorDeMomento, diaDoJogador } = __saude;
  const CONFIG = {
    ataquesPorMinuto: 0.84, /* era 0,9; baixou quando o embalo entrou, para os gols da liga ficarem onde estavam */ // ataques iniciados por minuto, somando os dois times
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
    // Embalo: quem vence um duelo em que tinha folga (vantagem acima do normal naquela zona) leva parte dela para o lance seguinte.
    //   parte: fração da folga que segue adiante; teto: limite, em logit (0,28 dá uns 7 pontos percentuais);
    //   chance: quanto a folga no último duelo melhora a qualidade da finalização, no teto;
    //   contra: quanto a folga da defesa, quando ela rouba a bola, aumenta a chance de contra-ataque, no teto.
    embalo: { parte: 0.5, teto: 0.28, chance: 0.12, contra: 0.5, narrar: 0.85 },
    pe: { mesmo: 0.03, ambidestro: 0.06, compensacao: 0.02 }, // confronto de pés no duelo: bônus de quem ataca e o desconto que zera o efeito médio
    desempenhoRuim: -1.5, desempenhoBom: 1.5, // condições de substituição "jogando mal" e "jogando bem": duelos vencidos além do esperado, mais 2 por gol
    recalcularACada: 5, // minutos
    narrarPerda: { D: 0.12, M: 0.18, A: 0.6 }, // fração das perdas de posse que entra na narração, por linha do campo

    // faltas, cartões, lesões e bola parada
    falta: 0.1, // por duelo
    faltaPorAgressividade: 0.3,
    amarelo: 0.19, amareloPorAgressividade: 0.15, vermelhoDireto: 0.003,
    cuidadoComAmarelo: 0.3, // quem já tem amarelo se segura: multiplicador da chance do segundo
    lesao: 0.0023, // por duelo, para quem tem a bola (alvo: 3 a 4 lesões por clube por temporada de 18 rodadas)
    maxSubstituicoes: 5,
    escanteio: 0.45, // chance de escanteio depois de defesa ou bloqueio
    escanteioDuelo: 0.2, // chance de escanteio quando a defesa corta uma jogada pelo lado
    cabecadaEscanteio: 0.4, // chance de o escanteio ou a falta alçada virar finalização
    penalti: 0.13, // das faltas no centro do ataque
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
  // prevencao: fração a menos na chance de lesão dos jogadores deste time (preparador de prevenção), de 0 a 1
  function prepararTime({ nome, escalacao, banco = [], instrucoes = {}, mandante = false, prevencao = 0 }) {
    return {
      nome, mandante, escalacao, banco, prevencao,
      instrucoes: { ...INSTRUCOES_PADRAO, ...instrucoes, cobradores: { ...INSTRUCOES_PADRAO.cobradores, ...(instrucoes.cobradores || {}) } },
    };
  }

  // dia: o multiplicador do jogador nesta partida (varia menos em quem tem mais experiência); sem sorteio, 1
  const novoJog = (j, pos, rng = null) => ({ j, pos, fam: FAMILIARIDADE[familiaridade(j, pos)], energia: 100, amarelos: 0, at: j.at, dia: diaDoJogador(rng, j) });

  // Estado do time durante a partida.
  function iniciar(time, rng = null) {
    return {
      nome: time.nome, mandante: time.mandante, prevencao: time.prevencao || 0,
      instr: { ...time.instrucoes },
      emCampo: time.escalacao.map(({ j, pos }) => novoJog(j, pos, rng)),
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
      const f = jog.fam * base * eficacia(jog) * fatorDeMomento(jog.j) * (jog.dia || 1); // forma e moral do jogador (1 quando as duas estão em 50)
      jog.at = jog.j.at.map(v => v * f); // atributos efetivos neste momento da partida
      const pe = ajusteDoPe(jog.j.pe, jog.pos); // pé dominante: pesa no cruzamento, no passe e na finalização de quem joga pelos lados
      if (pe) for (const k in pe) jog.at[k] *= pe[k];
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
  // minutos em que a bola volta ao centro: segundo tempo e os dois tempos da prorrogação
  const reinicio = min => min === 46 || min === 91 || min === 106;
  // opcoes.prorrogacao: jogo de mata-mata; empate nos 90 minutos leva a mais 30, jogados como o resto da partida
  function simularPartida(rng, casa, fora, opcoes = {}) {
    const times = [iniciar(casa, rng), iniciar(fora, rng)], estat = [novaEstatistica(), novaEstatistica()];
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
    // duelo vencido com folga de sobra (bem acima do teto do embalo, para não virar bordão): a narração diz que foi fácil
    const comFolga = d => (d.folga || 0) >= CONFIG.embalo.narrar;
    function passo(i, zona, d) {
      const p = d.pivo, m = d.marcador, lado = zona[1], facil = comFolga(d);
      if (!p) { portador = null; trilha.push([`${tm(i)} ${zona[0] === "D" ? "sai jogando" : "avança"} ${PELO[lado]}`]); return; }
      const depoisDeFalta = aposFalta, mesmo = recebe(p), nome = nm(p);
      // falta fora da zona de ataque: o time fica com a bola e recomeça dali, cobrando a falta (não é lei da vantagem)
      if (d.falta && m) { evento(i, "falta", comTrilha(`Falta de ${nm(m)} em ${nome} ${ONDE[zona[0]](lado)}.`)); portador = p; aposFalta = true; return; }
      if (zona[0] === "D") trilha.push(times[i].instr.passe === "longo" ? [`${nome} domina no campo de defesa ${PELO[lado]}`, "prepara o lançamento"] : [`${nome} sai jogando ${PELO[lado]}`, ...(m ? [facil ? `passa fácil por ${nm(m)}` : `passa por ${nm(m)}`] : facil ? ["sem ser incomodado"] : [])]);
      else trilha.push([`${mesmo ? (depoisDeFalta ? nome + " cobra a falta rápido e segue" : trilha.length ? "Segue" : nome + " segue") : nome + " carrega"} ${lado === "C" ? "pelo centro do meio-campo" : `pela ${NOME_LADO[lado]} do meio-campo`}`, ...(m ? [facil ? `deixa ${nm(m)} para trás com facilidade` : `supera ${nm(m)}`] : facil ? ["com todo o espaço do mundo"] : [])]);
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
      const t = times[i], jog = novoJog(j, pos, rng);
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
      // quem disputa a jogada, um de cada lado, e o confronto de pés entre os dois (regra do FMP): mesmo pé dominante favorece quem ataca,
      // e o ambidestro leva vantagem maior sobre quem só tem um pé; pés opostos, ou dois ambidestros, não mudam nada.
      // A compensação tira de todo duelo o ganho médio, para a regra não aumentar os gols da liga. Sem pé definido, nada acontece.
      const pivo = (sortearPeso(rng, atk.zonas[zona], x => x.p) || {}).jog, marcador = (sortearPeso(rng, def.zonas[espelho(zona)], x => x.w) || {}).jog;
      const pa = pivo && pivo.j.pe, pd = marcador && marcador.j.pe;
      const pes = !pa || !pd ? 0 : (pa === "A" ? (pd === "A" ? 0 : CONFIG.pe.ambidestro) : pa === pd ? CONFIG.pe.mesmo : 0) - CONFIG.pe.compensacao;
      // folga: a vantagem de quem ataca acima do normal da zona (negativa quando a vantagem é da defesa); o embalo que veio do duelo anterior não conta
      const folga = tatico + CONFIG.inclinacaoDuelo * Math.log(a * (1 + pes) / d);
      const p = 1 / (1 + Math.exp(-(CONFIG.baseDuelo[zona[0]] + logit + folga)));
      let venceu = rng.chance(p), parada = false, comFalta = false;
      if (marcador && rng.chance(CONFIG.falta * (1 + CONFIG.faltaPorAgressividade * def.instr.agressividade) * Math.sqrt(marcador.j.at[A.agr] / 25))) {
        falta(1 - i, marcador, pivo); comFalta = true;
        if (zona[0] === "A") parada = true; else venceu = true; // falta no ataque vira bola parada; atrás, a jogada segue
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
      return { venceu, pivo, marcador, parada, falta: comFalta, folga };
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
      empurrar(lances, { n: seq++, min, time: i, tipo: c.tipo, lado: c.lado, xg: c.xg, resultado, finalizador: c.finalizador.j.id, criador: c.criador.j.id, quem: c.finalizador.j.nome, assist: c.criador !== c.finalizador ? c.criador.j.nome : null, goleiro: def.goleiro ? def.goleiro.j.id : null, texto: comTrilha(narrar(c, resultado, def.goleiro, nm)), p: parcial() });
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
      // embalo de um duelo: quanto da folga segue para o lance seguinte (de 0 ao teto); a da defesa vale para o contra-ataque
      const embalo = d => Math.min(CONFIG.embalo.teto, Math.max(0, CONFIG.embalo.parte * d.folga));
      const embaloDaDefesa = d => Math.min(CONFIG.embalo.teto, Math.max(0, -CONFIG.embalo.parte * d.folga)) / CONFIG.embalo.teto;
      let roubada = 0, roubadaFacil = false; // roubada, de 0 a 1: com quanta folga a defesa ganhou o duelo que encerrou o ataque
      const perdeu = () => {
        if (contra) return;
        const K = CONFIG.contraAtaque, m = atk.instr.mentalidade;
        // quem perde a bola jogando para a frente ou com a linha alta fica mais exposto; time montado para o contra-ataque aproveita mais
        const fator = def.instr.contraAtaque ? (m > 0 ? 1 + K.porMentalidade * m : Math.max(0.3, 1 + K.porRetranca * m)) : 1 + K.semInstrucao * Math.max(0, m);
        // contra-ataque é arma de quem espera atrás: rende mais com mentalidade defensiva e menos com o próprio time adiantado
        const eu = def.instr.mentalidade, postura = !def.instr.contraAtaque ? 1 : eu < 0 ? 1 - K.porPostura * eu : Math.max(0.4, 1 - K.posturaOfensiva * eu);
        const p = (def.instr.contraAtaque ? K.com : K.sem) * fator * postura * (atk.instr.impedimento ? K.linhaAlta : 1) * (1 + CONFIG.embalo.contra * roubada);
        if (rng.chance(p)) { estat[1 - i].contraAtaques++; evento(1 - i, "contra", roubadaFacil ? `${tm(1 - i)} toma a bola com facilidade e dispara no contra-ataque.` : `${tm(1 - i)} recupera a bola e sai em contra-ataque.`); emContra = true; atacar(1 - i, true); emContra = false; if (proximo) proximo.zona = "D"; }
      };
      e.ataques++; trilha = []; portador = null; bola = null; aposFalta = false;
      soltarCartoes();
      if (!contra && ultimoNarrado === i && !rodou) trilha.push(Object.assign([RETOMA[seq % RETOMA.length](tm(i))], { fechada: true }));
      atacante = i;
      ultimoAtaque = i; if (!contra) rodou = false;
      if (contra) inicio = "M";
      let lado = escolherLado(rng, atk, dz, inicio);
      let d0 = null, levado = 0; // levado: embalo que o duelo do meio deixa para o do ataque
      if (inicio === "D") { d0 = duelo(i, "D" + lado); if (!d0.venceu) return perdaDePosse(i, "D" + lado, d0); passo(i, "D" + lado, d0); }
      if (inicio !== "A") {
        if (inicio === "D") lado = escolherLado(rng, atk, dz, "M", lado);
        const d1 = duelo(i, "M" + lado, bonus + (d0 ? embalo(d0) : 0), contra);
        if (!d1.venceu) { roubada = embaloDaDefesa(d1); roubadaFacil = -d1.folga >= CONFIG.embalo.narrar; if (perdaDePosse(i, "M" + lado, d1)) perdeu(); return; }
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
      if (forcado && !rng.chance(CONFIG.chuteForcado)) { roubada = embaloDaDefesa(d); roubadaFacil = -d.folga >= CONFIG.embalo.narrar; if (perdaDePosse(i, "A" + lado, d)) perdeu(); return; }
      const chance = criarChance(rng, atk, def, lado, d.pivo, { forcado, contra });
      // duelo do ataque vencido com folga: a finalização sai em melhor condição
      if (!forcado && chance && chance.xg) chance.xg = limitar(chance.xg * (1 + CONFIG.embalo.chance * embalo(d) / CONFIG.embalo.teto), 0.01, CONFIG.xgMaximo);
      finalizar(i, chance);
    }

    const jogar = (de, ate) => { for (min = de; min <= ate; min++) {
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
      somaPosse += posseCasa;
    } };
    jogar(1, 90);
    let duracao = 90;
    if (opcoes.prorrogacao && gols()[0] === gols()[1]) {
      soltarCartoes(); min = 91; saida = null; proximo = null;
      evento(0, "prorrogacao", "Fim do tempo normal com tudo igual. Vamos à prorrogação: mais 30 minutos.");
      jogar(91, 120); duracao = 120;
    }
    min = duracao;
    times.forEach(t => t.emCampo.forEach(jog => { jogadores[jog.j.id].energia = Math.round(jog.energia); }));
    estat[0].posse = Math.round(somaPosse / duracao * 100); estat[1].posse = 100 - estat[0].posse;
    soltarCartoes();
    const narracao = [...lances, ...eventos].sort((a, b) => a.n - b.n);
    // segundo de cada lance dentro do seu minuto, para a transmissão soltar um por vez em vez de todos no minuto cheio
    const porMinuto = {};
    narracao.forEach(l => (porMinuto[l.min] = porMinuto[l.min] || []).push(l));
    Object.values(porMinuto).forEach(g => g.forEach((l, k) => { l.s = Math.floor((k + 0.5) / g.length * 60); }));
    return { duracao, placar: gols(), xg: [estat[0].xg, estat[1].xg], estat, lances, eventos, narracao, jogadores, lesoes };
  }
  return { CONFIG, INSTRUCOES_PADRAO, ZONAS, espelho, COBERTURA, prepararTime, avaliarZonas, simularPartida };
})();

const __bot = (() => {
  // Tática de bot: vale para clubes sem dono e para dirigentes há 21 dias sem acessar.
  // O bot joga certo, mas sem ler o adversário: escolhe a formação que melhor aproveita o elenco e instruções neutras.
  const { IDX, notaNaPosicao, notaComPe } = __modelo;
  const { fatorDeMomento } = __saude;
  // nota na posição já com o pé, a forma, a moral e a experiência do jogador: é com ela que o bot (e o botão de escalar os melhores) escolhe
  const notaDoMomento = (j, pos) => notaComPe(j, pos) * fatorDeMomento(j);
  const { FORMACOES, escalar } = __escalacao;
  const { avaliarZonas } = __motor;
  const FORMACOES_BOT = ["4-4-2", "4-3-3 com pontas", "4-2-3-1", "3-5-2 com alas", "4-5-1"];
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

  const mediaNotas = escalacao => escalacao.reduce((s, x) => s + notaDoMomento(x.j, x.pos), 0) / escalacao.length;
  const melhores = (lista, nota, n) => lista.slice().sort((a, b) => nota(b) - nota(a)).slice(0, n).map(x => x.j.id);

  // elenco: jogadores disponíveis (sem lesionados e suspensos). forcaAdversario: nota média do onze do adversário, se conhecida.
  function taticaBot(elenco, { mandante = false, forcaAdversario = null, perfil = null } = {}) {
    const estilo = (ESTILO_DO_PERFIL[perfil] || ESTILO_DO_PERFIL.equilibrado).instrucoes;
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
    const fora = elenco.filter(j => !escalacao.some(x => x.j === j)).sort((a, b) => notaDoMomento(b, b.pos) - notaDoMomento(a, a.pos));
    const banco = [...fora.filter(j => j.pos === "GK").slice(0, 1), ...fora.filter(j => j.pos !== "GK").slice(0, 6)];

    // mentalidade: normal; um nível acima se é favorito, um abaixo se é azarão (o mando já pesa no motor)
    const dif = forcaAdversario == null ? 0 : forca - forcaAdversario;
    const mentalidade = dif <= -FAVORITO ? -1 : dif >= FAVORITO ? 1 : 0;

    // lado: o próprio corredor mais forte, se houver um claramente melhor
    const { atk } = avaliarZonas(escalacao);
    const lado = atk.AE > atk.AD * 1.25 ? "E" : atk.AD > atk.AE * 1.25 ? "D" : "misto";

    const linha = escalacao.filter(x => x.pos !== "GK");
    // até três trocas, aos 60, 70 e 80: saem os de menor Resistência que tenham reserva à altura para a posição
    const livres = banco.filter(j => j.pos !== "GK"), substituicoes = [];
    for (const x of linha.slice().sort((a, b) => a.j.at[A.res] - b.j.at[A.res])) {
      if (substituicoes.length === 3 || !livres.length) break;
      livres.sort((a, b) => notaDoMomento(b, x.pos) - notaDoMomento(a, x.pos));
      if (notaDoMomento(livres[0], x.pos) < 0.85 * notaDoMomento(x.j, x.pos)) continue; // sem reserva à altura para a posição
      substituicoes.push({ min: 60 + 10 * substituicoes.length, sai: x.j.id, entra: livres.shift().id, cond: "sempre" });
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
        { min: 70, cond: "perdendo", muda: { mentalidade: Math.min(2, mentalidade + 1) } },
        { min: 80, cond: "ganhando", muda: { mentalidade: Math.max(-2, mentalidade - 1) } },
      ],
    };
    return { formacao, escalacao, banco, instrucoes, forca };
  }
  return { FORMACOES_BOT, ESTILO_DO_PERFIL, taticaBot };
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
  const { notaDoMomento } = __escalacao;
  const { montarRelatorio } = __relatorio;
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
      const banco = [...new Set((dados.banco || []).filter(id => porId[id] && !emCampo.has(id) && !fora(id)))].slice(0, 7);
      // banco desfalcado (lesão, suspensão, saída ou titular que foi para o campo): completa com os melhores que sobraram,
      // garantindo um goleiro reserva se houver
      const sobra = elenco.filter(j => !(j.fora > 0) && !emCampo.has(j.id) && !banco.includes(j.id)).sort((a, b) => notaDoMomento(b, b.pos) - notaDoMomento(a, a.pos));
      if (banco.length < 7 && !banco.some(id => porId[id].pos === "GK")) { const g = sobra.find(j => j.pos === "GK"); if (g) { banco.push(g.id); sobra.splice(sobra.indexOf(g), 1); } }
      for (const j of sobra) { if (banco.length >= 7) break; if (j.pos !== "GK") banco.push(j.id); }
      const noBanco = new Set(banco), I = dados.instr || {};
      const num = (v, min, max) => Math.max(min, Math.min(max, Math.round(+v) || 0));
      const um = (v, lista, padrao) => lista.includes(v) ? v : padrao;
      const titular = id => emCampo.has(id) ? id : null;
      const lista = (l, n) => (Array.isArray(l) ? l : []).filter(id => emCampo.has(id)).slice(0, n);
      const conv = v => v === "true" ? true : v === "false" ? false : isNaN(+v) ? v : +v;
      const condicoes = ["sempre", "ganhando", "empatando", "perdendo", "cansado", "amarelo", "mal", "naoBem"];
      const instrucoes = {
        mentalidade: num(I.mentalidade, -2, 2), agressividade: num(I.agressividade, -2, 2), pressao: num(I.pressao, 0, 2),
        passe: um(I.passe, ["misto", "curto", "longo"], "misto"), lado: um(I.lado, ["misto", "E", "C", "D", "lados"], "misto"),
        contraAtaque: I.contraAtaque === true, impedimento: I.impedimento === true,
        capitao: titular(I.capitao), vice: titular(I.vice), armador: titular(I.armador), alvo: titular(I.alvo),
        cobradores: { escanteio: lista(I.cobradores && I.cobradores.escanteio, 3), falta: lista(I.cobradores && I.cobradores.falta, 3), penalti: lista(I.cobradores && I.cobradores.penalti, 5) },
        substituicoes: (dados.subs || []).filter(s => emCampo.has(s.sai) && noBanco.has(s.entra)).slice(0, CONFIG.maxSubstituicoes)
          .map(s => ({ min: num(s.min, 0, 89), sai: s.sai, entra: s.entra, cond: um(s.cond, condicoes, "sempre"), ...(LISTA_POSICOES.includes(s.pos) && s.pos !== "GK" ? { pos: s.pos } : {}) })), // pos: onde o substituto entra (sem ela, na posição de quem sai)
        ordens: (dados.ordens || []).slice(0, 3).map(o => {
          const [k, v] = String(o.muda || "").split(":");
          if (!["mentalidade", "pressao", "contraAtaque", "passe"].includes(k)) return null;
          return { min: num(o.min, 0, 89), cond: um(o.cond, condicoes.slice(0, 4), "sempre"), muda: { [k]: conv(v) } };
        }).filter(Boolean),
      };
      return { escalacao: dados.vagas.map((pos, i) => ({ j: porId[jog[i]], pos })), banco: banco.map(id => porId[id]), instrucoes };
    } catch (e) { return null; }
  }

  const forcaDoOnze = escalacao => escalacao.reduce((s, x) => s + notaNaPosicao(x.j, x.pos), 0) / escalacao.length;

  // Instante em que um minuto de jogo passa a ser visível, com 15 minutos de intervalo, na escala da transmissão.
  function horaDoMinuto(inicio, min, minutosTransmissao) {
    // intervalo de 15 minutos; antes da prorrogação, mais 5 de pausa
    const reais = (min <= 45 ? min : min <= 90 ? min + 15 : min + 20) * minutosTransmissao / 105;
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

  // lado: { clube: { id, nome, dono, ultimo_acesso }, elenco, tatica: dados salvos ou null, saude: saída de saudeDoClube (opcional) }
  // Cada jogador do elenco pode trazer fora (jogos que ainda fica fora), motivo e amarelos.
  // Devolve as linhas de lances, o resultado a gravar e a situação nova dos jogadores que mudaram.
  const CLIMAS = [["Ensolarado", 24, 34], ["Céu limpo", 18, 28], ["Nublado", 16, 26], ["Chuva fraca", 14, 24], ["Chuva forte", 12, 22], ["Frio de doer", 4, 12], ["Calor forte", 32, 38]];
  // Copa do Brasil: regras próprias da partida de copa.
  const COPA = { amarelosParaSuspensao: 2, faseQueZeraCartoes: 4, experiencia: 1.5, penalti: 0.76 };
  // Quem não joga a copa: lesionado, suspenso na copa, ou quem já jogou a copa desta temporada por outro clube.
  const foraDaCopa = (j, clubeId) => (j.fora > 0 && j.motivo === "lesão") || j.foraCopa > 0 || (j.copaClube != null && j.copaClube !== clubeId);
  // Situação dos jogadores depois de um jogo de copa: lesões valem para tudo; cartões e suspensões são só da copa
  // (segundo amarelo suspende; depois das quartas os amarelos zeram, para ninguém perder a final por acúmulo).
  function situacaoDaCopa(elenco, p, clubeId, fase, medico = null) {
    const lesao = Object.fromEntries(p.lesoes.map(l => [l.id, l.dias])), situacao = [], copa = [];
    let vagas = medico ? medico.vagas - elenco.filter(j => j.fora > 1 && j.motivo === "lesão").length : 0;
    for (const j of elenco) {
      let fora = j.fora || 0, motivo = j.motivo || null, amarelos = j.amarelosCopa || 0, foraCopa = j.foraCopa || 0, copaClube = j.copaClube == null ? null : j.copaClube;
      if (fora > 0 && motivo === "lesão") { fora--; if (!fora) motivo = null; }
      if (foraCopa > 0) foraCopa--;
      const s = p.jogadores[j.id];
      if (s) {
        copaClube = clubeId;
        if (s.vermelho) foraCopa = 1;
        else if (s.amarelos) { amarelos++; if (amarelos >= COPA.amarelosParaSuspensao) { amarelos = 0; foraCopa = 1; } }
        if (lesao[j.id]) {
          let n = jogosFora(lesao[j.id]);
          if (medico && vagas > 0) { vagas--; n = Math.max(1, Math.round(n * (1 - medico.reducao))); }
          if (n >= fora) { fora = n; motivo = "lesão"; }
        }
      }
      if (fase === COPA.faseQueZeraCartoes) amarelos = 0;
      if (fora !== (j.fora || 0) || motivo !== (j.motivo || null)) situacao.push({ id: j.id, fora, motivo, amarelos: j.amarelos || 0 });
      if (amarelos !== (j.amarelosCopa || 0) || foraCopa !== (j.foraCopa || 0) || copaClube !== (j.copaClube == null ? null : j.copaClube)) copa.push({ id: j.id, amarelos, fora: foraCopa, clube: copaClube });
    }
    return { situacao, copa };
  }

  function calcularPartida({ partida, casa, fora, minutosTransmissao = 105, semente }) {
    const agora = new Date(partida.inicio).getTime(), copa = partida.fase === "copa"; // copa: campo neutro, prorrogação, pênaltis e cartões próprios
    const lados = [casa, fora].map(l => {
      const inativo = !l.clube.dono || !l.clube.ultimo_acesso || agora - new Date(l.clube.ultimo_acesso).getTime() > DIAS_PARA_BOT * 86400000;
      // na copa, "fora" passa a ser a indisponibilidade da copa (a suspensão da liga não vale; a da copa e a trava de clube, sim)
      const elenco = copa ? l.elenco.map(j => ({ ...j, fora: foraDaCopa(j, l.clube.id) ? 1 : 0 })) : l.elenco;
      const humana = inativo ? null : taticaDoDirigente(l.tatica, elenco);
      const disponiveis = elenco.filter(j => !(j.fora > 0));
      return { ...l, disponiveis, humana, previa: humana ? forcaDoOnze(humana.escalacao) : taticaBot(disponiveis).forca };
    });
    const taticas = lados.map((l, i) => l.humana || taticaBot(l.disponiveis, { mandante: i === 0 && !copa, forcaAdversario: lados[1 - i].previa, perfil: l.clube.perfil }));
    const times = lados.map((l, i) => {
      const t = taticas[i];
      return prepararTime({ nome: l.clube.nome, escalacao: t.escalacao, banco: t.banco, instrucoes: t.instrucoes, mandante: i === 0 && !copa, prevencao: l.saude ? l.saude.prevencao : 0 });
    });
    const p = simularPartida(criarRng(semente), times[0], times[1], { prorrogacao: copa });
    // o comentário de cada time vem do analista dele; sem os dados da comissão (amistoso, teste), vale o nível máximo
    const r = montarRelatorio(p, [casa, fora].map(l => l.saude ? l.saude.analista || 1 : 3));
    const lances = p.narracao.map((l, ordem) => ({ partida_id: partida.id, ordem, min: l.min, libera_em: horaDoMinuto(partida.inicio, l.s === undefined ? l.min : l.min - 1 + l.s / 60, minutosTransmissao).toISOString(), dados: l }));
    // abertura da transmissão, liberada no apito inicial: escalações, clima e cara ou coroa (clima e moeda ainda não mexem no jogo)
    const extra = criarRng((semente >>> 0) + 7919), clima = extra.pick(CLIMAS);
    lances.unshift({ partida_id: partida.id, ordem: -1, min: 0, libera_em: new Date(partida.inicio).toISOString(), dados: {
      n: -1, min: 0, tipo: "inicio", moeda: extra.int(0, 1), clima: { nome: clima[0], temp: extra.int(clima[1], clima[2]) },
      escalacoes: taticas.map(t => ({ titulares: t.escalacao.map(e => ({ nome: e.j.nome, pos: e.pos })), banco: (t.banco || []).map(j => ({ nome: j.nome, pos: j.pos })) })),
    } });
    // Copa: empate nos 90 minutos vai à prorrogação, jogada pelo motor como o resto da partida; persistindo, aos pênaltis
    // (cinco para cada lado e, depois, alternados). Com prorrogação, a transmissão e o resultado terminam depois do horário de fim da partida.
    const placar = p.placar.slice(), fimReal = p.duracao > 90 ? horaDoMinuto(partida.inicio, p.duracao, minutosTransmissao).toISOString() : partida.fim;
    let penaltis = null, vencedor = null;
    if (copa) {
      const nomes = [casa.clube.nome, fora.clube.nome];
      if (placar[0] === placar[1]) {
        penaltis = [0, 0];
        // cinco cobranças alternadas, parando quando um time não alcança mais o outro; depois, uma para cada lado até desempatar
        const batidas = [0, 0];
        for (let k = 0; k < 10; k++) { const i = k % 2; batidas[i]++; if (extra.chance(COPA.penalti)) penaltis[i]++;
          if (penaltis[0] > penaltis[1] + 5 - batidas[1] || penaltis[1] > penaltis[0] + 5 - batidas[0]) break; }
        while (penaltis[0] === penaltis[1]) { const a = extra.chance(COPA.penalti), b = extra.chance(COPA.penalti); if (a) penaltis[0]++; if (b) penaltis[1]++; }
        const v = penaltis[0] > penaltis[1] ? 0 : 1;
        lances.push({ partida_id: partida.id, ordem: lances.length, min: 120, libera_em: fimReal, dados: { n: 99999, min: 120, time: v, tipo: "penaltis", texto: `A prorrogação não resolveu. Pênaltis: ${nomes[0]} ${penaltis[0]} x ${penaltis[1]} ${nomes[1]}. Passa o {${v}:${nomes[v]}}.` } });
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
      ...(() => { // na copa, cartões e suspensões vão para os campos da copa, e sai também quem passou de fase
        if (!copa) return { situacao: [...situacaoDepois(casa.elenco, p, casa.saude && casa.saude.medico), ...situacaoDepois(fora.elenco, p, fora.saude && fora.saude.medico)] };
        const a = situacaoDaCopa(casa.elenco, p, casa.clube.id, partida.copa_fase, casa.saude && casa.saude.medico), b = situacaoDaCopa(fora.elenco, p, fora.clube.id, partida.copa_fase, fora.saude && fora.saude.medico);
        return { situacao: [...a.situacao, ...b.situacao], copa: [...a.copa, ...b.copa], vencedor };
      })(),
      momento,
      minutos: Object.fromEntries(Object.entries(p.jogadores).map(([id, x]) => [id, (x.saiu === null ? p.duracao || 90 : x.saiu) - x.entrou])), // para o bônus de treino de quem jogou
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
  return { AMARELOS_PARA_SUSPENSAO, jogosFora, DIAS_PARA_BOT, gerarTabela, taticaDoDirigente, horaDoMinuto, aplicarSituacao, COPA, foraDaCopa, calcularPartida, classificacao };
})();

const __treino = (() => {
  // Treino: cada sessão dá pontos aos atributos dos focos do jogador; a cada 100 pontos o atributo sobe 1.
  // O foco principal fica com 70% dos pontos e o complementar (3 atributos à escolha) com 30%.
  // O talento oculto define o teto da nota do jogador. A velocidade é proporcional ao CAMINHO dele (da nota de partida, igual para todos, até o teto):
  // todo jogador percorre a mesma fração do caminho por temporada, então teto alto e teto baixo chegam na mesma idade. Sobre isso entram a idade,
  // o centro de treinamento, o trabalho em equipe, ter jogado e os treinadores (cada atributo pertence a uma área de treino, e a qualidade da área
  // depende de quem trabalha nela). Não há empurrão para quem está atrasado; há só um freio: ninguém anda mais rápido que a curva do melhor caso.
  // Módulo puro: usado pela função do servidor (uma sessão por partida de liga) e pelas páginas (focos, sugestão e previsão).
  const { ATRIBUTOS, ATR_MIN, ATR_MAX, IDX, POSICOES, PESOS, VIZINHAS, notaDeTeto } = __modelo;
  const CONFIG_TREINO = {
    pontosPorNivel: 100,
    pontosPorSessao: 150,       // antes dos fatores; com tudo em 100% e caminho igual ao divisor, 1,5 ponto de atributo por sessão
    partePrincipal: 0.7,
    ct: [0.9, 0.04],            // sem centro de treinamento, 90%; cada nível soma 4% (110% no nível 5)
    equipe: [0.95, 1.05],       // do menor ao maior Trabalho em equipe
    bonusPorJogar: 0.1, minutosParaBonus: 45,
    teto: [23, 0.20],           // teto da nota = 23 + 0,20 × talento (1 a 100): de 23 a 43 (liga madura: titulares em 38 / 35 / 32 em A / B / C)
    // caminho: os pontos da sessão são multiplicados por (teto − partida) / divisor. Sem saber o teto (tela sem olheiro), vale o teto típico.
    caminho: { partida: 15, divisor: 26, minimo: 6, tetoTipico: 36 },
    // freio: fração do caminho que o melhor caso tem feito em cada idade; quem passa dela treina mais devagar (até o piso), nunca mais rápido
    freio: { curva: [[16, 0.05], [18, 0.36], [20, 0.62], [22, 0.82], [24, 0.96], [25, 1.03], [31, 1.06]], forca: 6, piso: 0.3 },
    // treinadores: a qualidade da área (0 a 50) vira um multiplicador dos pontos dos atributos dela
    treinador: [0.9, 0.25],     // área sem treinador, 90%; qualidade 50, 115%
    parteDoGeral: 0.4,          // treinador "geral" vale 40% de cada skill nas quatro áreas com treinador designado
    coletivas: ["fis", "tat"], divisorDaSoma: 2.5, // físico e tática: soma da skill de TODOS os treinadores, dividida por 2,5 (teto 50)
    // perdaPorExcesso em 0: a punição por elenco inflado (mais de 7 jogadores acima de 21 anos por treinador) foi desligada
    // quando o elenco ganhou o limite de 35 jogadores com mais de 21 anos; para religar, voltar a 0.1
    maximoDeTreinadores: 5, jogadoresPorTreinador: 7, perdaPorExcesso: 0,
    idadeSemContar: 21,         // jogador até esta idade não entra no limite de 35 do elenco
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
        : lista.reduce((m, t) => Math.max(m, t.area === k ? (t.skills[k] || 0) : t.area === "geral" ? C.parteDoGeral * (t.skills[k] || 0) : 0), 0);
      areas[k] = C.treinador[0] + (multDaQualidade(q) - C.treinador[0]) * excesso;
    }
    return areas;
  }
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
  // Cada sessão dá pontos de posição; a posição vizinha de uma em que ele já é natural custa 1800 pontos por degrau (improvisado → competente → natural:
  // perto de uma temporada cada) e a distante, o dobro. Jogar na posição acelera; a idade freia. Goleiro não aprende posição de linha, nem o contrário.
  const CONFIG_POSICAO = { custoDoTreino: 0.2, porSessao: 100, vizinha: 1800, distante: 3600, bonusPorJogar: 0.5 };
  const ritmoDaPosicao = idade => idade <= 23 ? 1 : idade <= 27 ? 0.7 : 0.4;
  // posição que o jogador está aprendendo agora (nula quando não há, ou quando ele já virou natural nela)
  const posicaoEmEstudo = j => { const p = j.aprende && j.aprende.pos; return p && POSICOES[p] && p !== "GK" && j.pos !== "GK" && (j.fam || {})[p] !== "N" ? p : null; };
  const custoDaPosicao = (j, pos) => Object.keys(j.fam || {}).some(p => j.fam[p] === "N" && (VIZINHAS[p] || []).includes(pos)) ? CONFIG_POSICAO.vizinha : CONFIG_POSICAO.distante;
  const pontosDePosicao = (j, jogouNa = false) => Math.round(CONFIG_POSICAO.porSessao * ritmoDaPosicao(j.idade) * (jogouNa ? 1 + CONFIG_POSICAO.bonusPorJogar : 1));
  // Uma sessão de estudo da posição. Devolve { fam, aprende } ou null (não está aprendendo nada).
  function aprenderPosicao(j, { jogouNa = false } = {}) {
    const pos = posicaoEmEstudo(j); if (!pos) return null;
    const custo = custoDaPosicao(j, pos), fam = { ...j.fam }; let pts = (+j.aprende.pts || 0) + pontosDePosicao(j, jogouNa);
    while (pts >= custo && fam[pos] !== "N") { pts -= custo; fam[pos] = fam[pos] === "C" ? "N" : "C"; }
    if (fam[pos] === "N") pts = 0;
    return { fam, aprende: { pos, pts } };
  }
  // quantas sessões faltam para o próximo degrau e para virar natural (sem jogar na posição)
  function prazoDaPosicao(j, pos, pts = 0) {
    const custo = custoDaPosicao(j, pos), porSessao = pontosDePosicao(j), degraus = (j.fam || {})[pos] === "C" ? 1 : 2;
    return { proximo: Math.max(1, Math.ceil((custo - pts) / porSessao)), natural: Math.max(1, Math.ceil((custo * degraus - pts) / porSessao)) };
  }

  const tetoDaNota = tal => CONFIG_TREINO.teto[0] + CONFIG_TREINO.teto[1] * (tal == null ? 50 : tal);

  // Fração do caminho que o melhor caso tem feito na idade (interpolação da curva do freio). A idade é contada no meio da temporada.
  function alvoDaIdade(idade) {
    const c = CONFIG_TREINO.freio.curva, a = idade + 0.5;
    if (a <= c[0][0]) return c[0][1];
    for (let k = 1; k < c.length; k++) if (a <= c[k][0]) return c[k - 1][1] + (c[k][1] - c[k - 1][1]) * (a - c[k - 1][0]) / (c[k][0] - c[k - 1][0]);
    return c[c.length - 1][1];
  }
  // Multiplicador do caminho: proporcional ao tamanho do caminho do jogador e freado quando ele está adiante da curva. teto: o teto da nota.
  function fatorDoCaminho(j, teto) {
    const C = CONFIG_TREINO, cam = Math.max(C.caminho.minimo, teto - C.caminho.partida), feito = (notaDeTeto(j) - C.caminho.partida) / cam;
    return cam / C.caminho.divisor * Math.max(C.freio.piso, Math.min(1, 1 + C.freio.forca * (alvoDaIdade(j.idade) - feito)));
  }
  // Pontos de uma sessão para o jogador, antes de dividir pelos focos. tal: talento (só o servidor sabe); teto: estimativa do teto, para as telas
  // (meio da faixa do olheiro). Sem nenhum dos dois, a conta usa o teto típico e serve só de referência.
  function pontosDaSessao(j, { ct = 0, jogou = false, tal = null, teto = null } = {}) {
    const C = CONFIG_TREINO, equ = (j.at[IDX.equ] - ATR_MIN) / (ATR_MAX - ATR_MIN);
    return C.pontosPorSessao * ritmoDaIdade(j.idade) * (C.ct[0] + C.ct[1] * (ct || 0)) * (C.equipe[0] + (C.equipe[1] - C.equipe[0]) * equ) * (jogou ? 1 + C.bonusPorJogar : 1)
      * (posicaoEmEstudo(j) ? 1 - CONFIG_POSICAO.custoDoTreino : 1)
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
    if (total <= 0 || notaDeTeto(j) >= tetoDaNota(tal)) return null;
    const at = j.at.slice(), pts = ATRIBUTOS.map((_, i) => (j.pts && j.pts[i]) || 0), subiu = [], C = CONFIG_TREINO;
    for (const [i, parte] of Object.entries(partilha(j))) {
      if (at[i] >= ATR_MAX) continue;
      pts[i] += Math.round(total * parte * multDoAtributo(areas, i));
      while (pts[i] >= C.pontosPorNivel && at[i] < ATR_MAX) { pts[i] -= C.pontosPorNivel; at[i]++; subiu.push(+i); }
      if (at[i] >= ATR_MAX) pts[i] = 0;
    }
    return { at, pts, subiu };
  }
  return { CONFIG_TREINO, AREAS, AREA_DO_ATRIBUTO, qualidadeDoTreino, multDoAtributo, ritmoDaIdade, FOCOS, focoDaPosicao, treinavel, focoAutomatico, focoDoJogador, CONFIG_POSICAO, ritmoDaPosicao, posicaoEmEstudo, custoDaPosicao, pontosDePosicao, aprenderPosicao, prazoDaPosicao, tetoDaNota, alvoDaIdade, fatorDoCaminho, pontosDaSessao, partilha, treinar };
})();

const __ligabase = (() => {
  // Liga de base: os juvenis de cada grupo jogam um turno único (9 rodadas), espelhando o primeiro turno da liga principal.
  // O time é montado sozinho: entram os juvenis de verdade e, só nas vagas que faltarem para completar onze (goleiro incluso), garotos da escolinha,
  // que não existem fora da partida. Não há lesão, cartão, experiência, forma, moral nem bilheteria: ficam o placar, os gols e as notas,
  // e quem jogou 45 minutos ganha um bônus de treino. Módulo puro: usado pela função do servidor.
  const { ATRIBUTOS, notaBruta } = __modelo;
  const { limitar } = __rng;
  const CONFIG_LIGA_DE_BASE = {
    escolinha: [13, 1.2], // nota do garoto da escolinha: 13 + 1,2 por nível da base (o juvenil de verdade chega com 15 + 1,5 por nível e treina)
    nivelDoBot: 3,        // clube sem dirigente não tem juvenis: os garotos dele valem os de uma base de nível 3, para a liga não ser um passeio
    bonusDeTreino: 0.2,   // fração de uma sessão de treino para quem jogou: equivale ao bônus de 10% por jogar em duas rodadas da liga
    minutos: 45,
    premio: 200,          // mil, ao campeão de cada grupo, pagos pelo fundo da liga
  };
  const VAGAS = ["GK", "DC", "DC", "DR", "DL", "MC", "MC", "MR", "ML", "FC", "SC"];

  function garotoDaEscolinha(rng, pos, nivel, id) {
    const at = ATRIBUTOS.map(a => limitar(Math.round((a.grupo === "gol" && pos !== "GK" ? 3 : nivel) + rng.normal(0, 2)), 1, 50));
    return { id, nome: "Garoto da escolinha", pais: "Brasil", idade: 16, pos, fam: { [pos]: "N" }, at, pe: "D", escolinha: true };
  }

  // juvenis: os de verdade, no formato do motor. Devolve o elenco da partida: todos eles mais os garotos necessários para haver onze e um goleiro.
  function timeDaBase(rng, juvenis, nivelDaBase = 0, prefixo = "") {
    const nivel = CONFIG_LIGA_DE_BASE.escolinha[0] + CONFIG_LIGA_DE_BASE.escolinha[1] * (nivelDaBase || 0), livres = VAGAS.slice(), garotos = [];
    for (const j of juvenis.slice().sort((a, b) => notaBruta(b.at, b.pos) - notaBruta(a.at, a.pos))) {
      let i = livres.indexOf(j.pos);
      if (i < 0 && j.pos !== "GK") i = livres.findIndex(p => p !== "GK");
      if (i >= 0) livres.splice(i, 1);
    }
    const novo = pos => garotos.push(garotoDaEscolinha(rng, pos, nivel, "e" + prefixo + "_" + garotos.length));
    if (!juvenis.some(j => j.pos === "GK")) novo("GK");
    const deLinha = livres.filter(p => p !== "GK");
    while (juvenis.length + garotos.length < 11) novo(deLinha.shift() || "MC");
    return [...juvenis, ...garotos];
  }
  return { CONFIG_LIGA_DE_BASE, garotoDaEscolinha, timeDaBase };
})();
// <<< motor embutido
const { calcularPartida, aplicarSituacao } = __rodada;
const { treinar, CONFIG_TREINO, qualidadeDoTreino, aprenderPosicao } = __treino;
const { saudeDoClube } = __saude;
const { timeDaBase, CONFIG_LIGA_DE_BASE } = __ligabase;

// Liga de base (61_liga_de_base.sql): joga as partidas cuja hora chegou. Só fica o placar, os gols e as notas; o juvenil que jogou ganha um bônus de treino.
async function jogarBase(sb) {
  const r = await sb.from("base_jogos").select("*").eq("processada", false).lte("inicio", new Date().toISOString()).order("inicio").order("id").limit(25);
  if (r.error || !r.data || !r.data.length) return 0;
  const jogos = r.data, ids = [...new Set(jogos.flatMap(p => [p.casa, p.fora]))];
  const clubes = Object.fromEntries(((await sb.from("clubes").select("id, nome, perfil, dono, base_nivel, ct_nivel").in("id", ids)).data || []).map(c => [c.id, c]));
  const juvenis = {};
  for (const l of (await sb.from("jogadores").select("*").in("clube_id", ids).eq("juvenil", true).order("id")).data || [])
    (juvenis[l.clube_id] = juvenis[l.clube_id] || []).push({ id: "j" + l.id, nome: l.nome, pais: l.pais, idade: l.idade, pos: l.pos, fam: l.fam, at: l.at, pe: l.pe || null, treino: l.treino || null, pts: l.treino_pts || null, aprende: l.aprende || null, exp: l.exp == null ? null : +l.exp });
  const todos = Object.values(juvenis).flat().map(j => +String(j.id).slice(1)), talentos = {};
  if (todos.length) for (const t of (await sb.from("jogadores_ocultos").select("jogador_id, tal").in("jogador_id", todos)).data || []) talentos["j" + t.jogador_id] = t.tal;
  const comissoes = {};
  for (const x of (await sb.from("treinadores").select("*").eq("contratado", true).in("clube_id", ids)).data || []) if ((x.funcao || "treinador") === "treinador") (comissoes[x.clube_id] = comissoes[x.clube_id] || []).push(x);
  let n = 0;
  for (const p of jogos) {
    const reserva = await sb.from("base_jogos").update({ processada: true }).eq("id", p.id).eq("processada", false).select("id");
    if (reserva.error || !reserva.data.length) continue;
    try {
      const semente = Math.floor(Math.random() * 2147483647), rng = __rng.criarRng(semente);
      const lado = id => ({ clube: { id, nome: (clubes[id] || {}).nome || "", dono: null, perfil: (clubes[id] || {}).perfil }, elenco: timeDaBase(rng, juvenis[id] || [], (clubes[id] || {}).dono ? (clubes[id].base_nivel || 0) : CONFIG_LIGA_DE_BASE.nivelDoBot, id), tatica: null });
      const { resultado, minutos } = calcularPartida({ partida: { id: p.id, inicio: p.inicio, fase: "base", casa: p.casa, fora: p.fora }, casa: lado(p.casa), fora: lado(p.fora), semente });
      const dados = { jogadores: resultado.relatorio.jogadores.filter(x => x.minutos > 0).map(x => ({ id: x.id, n: x.nome, t: x.time, p: x.pos, g: x.gols || 0, a: x.assistencias || 0, nota: x.nota, min: x.minutos })) };
      const g = await sb.from("base_jogos").update({ gols_casa: resultado.gols_casa, gols_fora: resultado.gols_fora, dados }).eq("id", p.id);
      if (g.error) throw new Error(g.error.message);
      const treinos = [];
      for (const id of [p.casa, p.fora]) {
        const c = clubes[id] || {}, areas = qualidadeDoTreino(comissoes[id] || [], 0, !c.dono);
        for (const j of juvenis[id] || []) {
          if ((minutos[j.id] || 0) < CONFIG_LIGA_DE_BASE.minutos) continue;
          const t = treinar(j, { tal: talentos[j.id], ct: c.ct_nivel || 0, areas, fator: CONFIG_LIGA_DE_BASE.bonusDeTreino });
          if (t) { treinos.push({ id: +String(j.id).slice(1), at: t.at, pts: t.pts }); j.at = t.at; j.pts = t.pts; }
        }
      }
      if (treinos.length) await sb.rpc("aplicar_treino", { p_lista: treinos });
      n++;
    } catch (e) { await sb.from("base_jogos").update({ processada: false }).eq("id", p.id); }
  }
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
  for (const m of (e && e.situacao) || []) await sb.from("jogadores").update({ fora_jogos: m.fora, fora_motivo: m.motivo, amarelos: m.amarelos }).eq("id", m.id);
  if (e && e.momento && e.momento.length) await sb.rpc("aplicar_momento", { p_lista: e.momento });
  if (e && e.treinos && e.treinos.length) await sb.rpc("aplicar_treino", { p_lista: e.treinos });
  if (e && e.copa && e.copa.length) await sb.rpc("aplicar_copa", { p_lista: e.copa });
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
    // leilões de jogadores livres e ofertas à liga que venceram (sem efeito antes do 21_jogadores_livres.sql)
    try { for (const l of (await sb.from("ligas").select("id")).data || []) { await sb.rpc("resolver_leiloes", { p_liga: l.id }); await sb.rpc("anunciar_aposentadorias", { p_liga: l.id }); } } catch (e) { /* segue para as partidas */ }
    // Lesões, suspensões, amarelos, forma, moral e treino de cada partida só são gravados no apito final (33_efeitos_no_apito_final.sql):
    // ficam guardados no resultado até lá, para a página do clube não entregar o que ainda está passando na transmissão.
    const adiar = !(await sb.from("resultados").select("efeitos").limit(1)).error;
    if (adiar) {
      const vencidos = (await sb.from("resultados").select("partida_id, efeitos").not("efeitos", "is", null).lte("libera_em", new Date().toISOString()).order("libera_em").limit(200)).data || [];
      for (const r of vencidos) { await gravarEfeitos(sb, r.efeitos, r.partida_id); await sb.from("resultados").update({ efeitos: null }).eq("partida_id", r.partida_id); }
    }

    // copa: com os vencedores já gravados, sorteia a fase seguinte quando a atual terminou (sem efeito antes do 47_copa_calendario_e_chave.sql)
    try { for (const l of (await sb.from("ligas").select("id")).data || []) await sb.rpc("copa_avancar", { p_liga: l.id }); } catch (e) { /* segue */ }
    try { await jogarBase(sb); } catch (e) { /* liga de base: sem efeito antes do 61_liga_de_base.sql */ }
    const pendentes = ok(await sb.from("partidas").select("*").eq("processada", false).lte("inicio", new Date().toISOString())
      .order("inicio").order("id").limit(MAXIMO_POR_CHAMADA));
    if (!pendentes.length) return json({ calculadas: 0, erros: [] });
    const todasAsLigas = Object.fromEntries(ok(await sb.from("ligas").select("*")).map(l => [l.id, l]));
    const jogaveis = pendentes.filter(p => !todasAsLigas[p.liga_id].pausada); // liga pausada não tem partida calculada
    if (!jogaveis.length) return json({ calculadas: 0, erros: [], pausada: true });
    pendentes.length = 0; pendentes.push(...jogaveis);

    const ids = [...new Set(pendentes.flatMap(p => [p.casa, p.fora]))];
    const ligas = Object.fromEntries(ok(await sb.from("ligas").select("*").in("id", [...new Set(pendentes.map(p => p.liga_id))])).map(l => [l.id, l]));
    const clubes = Object.fromEntries(ok(await sb.from("clubes").select("id, nome, dono, perfil, ultimo_acesso, ct_nivel, medico_nivel, fisio_nivel").in("id", ids)).map(c => [c.id, c]));
    const taticas = Object.fromEntries(ok(await sb.from("taticas").select("clube_id, dados").in("clube_id", ids)).map(t => [t.clube_id, t.dados]));
    const elencos = {};
    for (let i = 0; i < ids.length; i += 20) { // em blocos, para não passar do limite de linhas por consulta
      const linhas = ok(await sb.from("jogadores").select("*").in("clube_id", ids.slice(i, i + 20)).order("id"));
      for (const l of linhas) (elencos[l.clube_id] = elencos[l.clube_id] || []).push({ id: "j" + l.id, nome: l.nome, pais: l.pais, idade: l.idade, pos: l.pos, fam: l.fam, at: l.at, titular: l.principal, fora: l.fora_jogos || 0, motivo: l.fora_motivo || null, amarelos: l.amarelos || 0, treino: l.treino || null, pts: l.treino_pts || null, aprende: l.aprende || null, juvenil: !!l.juvenil, forma: l.forma == null ? null : l.forma, moral: l.moral == null ? null : l.moral, exp: l.exp == null ? null : +l.exp, pe: l.pe || null, amarelosCopa: l.amarelos_copa || 0, foraCopa: l.fora_copa || 0, copaClube: l.copa_clube == null ? null : l.copa_clube });
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
        const { lances, resultado, situacao, minutos, posicoes, momento, copa, vencedor } = calcularPartida({
          partida: p, casa: lado(p.casa), fora: lado(p.fora),
          minutosTransmissao: ligas[p.liga_id].minutos_transmissao, semente: Math.floor(Math.random() * 2147483647),
        });
        ok(await sb.from("lances").insert(lances));
        ok(await sb.from("resultados").insert(resultado));
        // lesões, suspensões e amarelos para os próximos jogos
        const efeitos = { situacao: situacao.map(m => ({ id: +String(m.id).slice(1), fora: m.fora, motivo: m.motivo, amarelos: m.amarelos })), momento: [], treinos: [] };
        // copa: cartões e suspensões próprios, a trava de clube e quem passou de fase (só aparecem no apito final)
        if (copa) {
          efeitos.copa = copa.map(m => ({ id: +String(m.id).slice(1), amarelos: m.amarelos, fora: m.fora, clube: m.clube })); efeitos.vencedor = vencedor;
          const novoC = Object.fromEntries(copa.map(m => [m.id, m]));
          for (const lado of [p.casa, p.fora]) for (const j of elencos[lado] || []) if (novoC[j.id]) { j.amarelosCopa = novoC[j.id].amarelos; j.foraCopa = novoC[j.id].fora; j.copaClube = novoC[j.id].clube; }
        }
        aplicarSituacao(elencos[p.casa] || [], situacao); aplicarSituacao(elencos[p.fora] || [], situacao);
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
          const treinos = [];
          for (const lado of [p.casa, p.fora]) { const areas = qualidadeDoTreino(comissoes ? comissoes[lado] || [] : null, (elencos[lado] || []).filter(j => j.idade > CONFIG_TREINO.idadeSemContar).length, !(clubes[lado] || {}).dono); for (const j of elencos[lado] || []) {
            if (j.fora > 0 && j.motivo === "lesão") continue;
            const jogou = (minutos[j.id] || 0) >= CONFIG_TREINO.minutosParaBonus;
            const r = treinar(j, { tal: talentos[j.id], ct: (clubes[lado] || {}).ct_nivel || 0, jogou, areas });
            // posição nova (59_posicao_nova_e_safra.sql): só em clube com dirigente; jogar na posição acelera
            const a = (clubes[lado] || {}).dono && j.aprende ? aprenderPosicao(j, { jogouNa: jogou && posicoes && posicoes[j.id] === j.aprende.pos }) : null;
            if (r || a) { treinos.push({ id: +String(j.id).slice(1), at: r ? r.at : j.at, pts: r ? r.pts : (j.pts || j.at.map(() => 0)), ...(a ? { fam: a.fam, aprende: a.aprende } : {}) });
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
