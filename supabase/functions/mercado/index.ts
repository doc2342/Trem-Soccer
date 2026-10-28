// @ts-nocheck
// ARQUIVO GERADO por ferramentas/empacotar_funcao.py. Não editar à mão: mudar os módulos de src/ e gerar de novo.
//
// Trem Soccer · função do servidor do mercado. Recebe o pedido de compra pela multa rescisória de um dirigente logado,
// gera o jogador de reposição quando o vendedor é um clube sem dono e manda o banco fazer a transferência
// (as regras e os limites são conferidos lá, em comprar_pela_multa, do 19_mercado.sql).
//
// Como publicar: painel do Supabase → Edge Functions → Deploy a new function → Via Editor → nome "mercado" →
// colar este arquivo inteiro → Deploy. Depois, nas configurações da função, desligar "Verify JWT".
import { createClient } from "npm:@supabase/supabase-js@2";

// >>> módulos embutidos
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

const __gerador = (() => {
  // Gerador de jogadores e de elencos iniciais.
  // Perfil equilibrado: atributos principais da posição altos, secundários médios, o resto variado.
  const { criarRng, limitar } = __rng;
  const { ATRIBUTOS, ATR_MIN, ATR_MAX, IDX, POSICOES, PESOS, VIZINHAS, notaBruta, talentoMinimo } = __modelo;
  // Elenco inicial: 16 jogadores de nível titular (um 4-4-2 mais zagueiro, volante, meia-atacante e duas pontas),
  // para o dirigente ter variação tática desde o primeiro dia, e 6 reservas mais fracos.
  const VAGAS_TITULARES = ["GK", "DR", "DC", "DC", "DL", "MR", "MC", "MC", "ML", "FC", "SC", "DC", "DMC", "AMC", "RW", "LW"];
  const VAGAS_RESERVAS = ["GK", "SW", "WBR", "WBL", "AML", "SC"];
  const FOLGA_RESERVA = 5; // quanto a nota-alvo do reserva fica abaixo da do titular

  // Cada perfil puxa alguns atributos para cima; o gerador tira o mesmo tanto de outros.
  const PERFIS = {
    equilibrado: { nome: "Equilibrado", bonus: {} },
    veloz: { nome: "Veloz", bonus: { vel: 6, res: 3 } },
    tecnico: { nome: "Técnico", bonus: { dom: 3, dri: 3, pas: 3 } },
    fisico: { nome: "Físico", bonus: { for: 6, cab: 3, res: 2 } },
    tatico: { nome: "Tático", bonus: { pos: 4, equ: 5, com: 4 } },
  };

  const arredondar = v => limitar(Math.round(v), ATR_MIN, ATR_MAX);

  function sortearAtributos(rng, pos, nivel) {
    const papel = POSICOES[pos].papel, pesos = PESOS[papel];
    return ATRIBUTOS.map(({ k, grupo }) => {
      const peso = pesos[k] || 0;
      if (peso >= 14) return arredondar(rng.normal(nivel + 7, 2.5));
      if (peso >= 8) return arredondar(rng.normal(nivel + 2, 3.5));
      if (peso > 0) return arredondar(rng.normal(nivel - 4, 4.5));
      if (grupo === "gol") return arredondar(rng.normal(4, 2));
      if (papel === "GK" && (grupo === "tec" || grupo === "def")) return arredondar(rng.normal(k === "pas" ? 12 : 6, 3));
      if (grupo === "fis" || grupo === "men") return arredondar(rng.normal(16 + nivel * 0.3, 7));
      return arredondar(rng.normal(nivel - 12, 6));
    });
  }

  function aplicarPerfil(rng, at, pos, perfil) {
    const bonus = PERFIS[perfil].bonus, chaves = Object.keys(bonus);
    if (!chaves.length || pos === "GK") return;
    let aTirar = 0;
    for (const k of chaves) { const antes = at[IDX[k]]; at[IDX[k]] = arredondar(antes + bonus[k]); aTirar += at[IDX[k]] - antes; }
    const outros = ATRIBUTOS.filter(a => a.grupo !== "gol" && !(a.k in bonus)).map(a => IDX[a.k]);
    for (let guarda = 0; aTirar > 0 && guarda < 200; guarda++) {
      const i = rng.pick(outros);
      if (at[i] > ATR_MIN + 2) { at[i]--; aTirar--; }
    }
  }

  // Sobe ou desce atributos que contam para a posição até a nota bater no alvo.
  function ajustarNota(rng, at, pos, alvo) {
    const pesos = PESOS[POSICOES[pos].papel], chaves = Object.keys(pesos);
    for (let guarda = 0; guarda < 400; guarda++) {
      const dif = alvo - notaBruta(at, pos);
      if (Math.abs(dif) <= 0.2) return;
      const i = IDX[rng.pick(chaves)];
      if (dif > 0 && at[i] < ATR_MAX) at[i]++;
      else if (dif < 0 && at[i] > ATR_MIN) at[i]--;
    }
  }

  function sortearFamiliaridade(rng, pos) {
    const fam = { [pos]: "N" };
    for (const v of VIZINHAS[pos]) {
      const r = rng.n();
      if (r < 0.06) fam[v] = "N";
      else if (r < 0.3) fam[v] = "C";
    }
    return fam;
  }

  // Nome de camisa (o que aparece em listas, campo e narração) e nome completo (só na ficha). Brasil: apelido, primeiro nome, sobrenome
  // ou os dois, nas chances abaixo; outros países: o sobrenome. A camisa não se repete em usados (guardada sem acento nem caixa).
  const CONFIG_NOMES = { apelido: 0.20, primeiro: 0.50, sobrenome: 0.20 }; // o resto (10%): "Nome Sobrenome"
  const semAcento = t => t.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
  function sortearNome(rng, nomes, pais, usados) {
    const base = nomes.paises[pais] || nomes.paises.Brasil, C = CONFIG_NOMES;
    let nome, sobrenome;
    for (let i = 0; i < 20; i++) {
      nome = rng.pickPeso(base.p, base.pp); sobrenome = rng.pickPeso(base.s, base.ps);
      let camisa = sobrenome;
      if (base.a) {
        const r = rng.n();
        if (r < C.apelido) {
          const apelido = rng.pickPeso(base.a, base.pa);
          camisa = [nome, sobrenome].some(x => semAcento(x) === semAcento(apelido)) ? null : apelido;
        } else camisa = r < C.apelido + C.primeiro ? nome : r < C.apelido + C.primeiro + C.sobrenome ? sobrenome : nome + " " + sobrenome;
      }
      if (camisa && !(usados && usados.has(semAcento(camisa)))) { if (usados) usados.add(semAcento(camisa)); return { nome: camisa[0].toUpperCase() + camisa.slice(1), completo: nome + " " + sobrenome }; } // "de Luca" vira "De Luca" na camisa
    }
    if (usados) usados.add(semAcento(nome + " " + sobrenome));
    return { nome: nome + " " + sobrenome, completo: nome + " " + sobrenome };
  }

  // alvo: nota que o jogador deve ter na posição natural (escala 1 a 50)
  // Pé dominante, puxado pelo lado da posição: quem joga pela esquerda costuma ser canhoto. No geral, perto de 70% destros, 22% canhotos e 8% ambidestros.
  function sortearPe(rng, pos) {
    const lado = (POSICOES[pos] || {}).lado, r = rng.n();
    if (lado === "E") return r < 0.75 ? "E" : r < 0.85 ? "A" : "D";
    if (lado === "D") return r < 0.88 ? "D" : r < 0.95 ? "A" : "E";
    return r < 0.72 ? "D" : r < 0.92 ? "E" : "A";
  }
  // Pé fraco, de 1 a 20: o ambidestro de 13 a 20, os outros de 1 a 12 (no banco, quem sorteia é o gatilho do 162_pe_fraco.sql).
  // Sai de um sorteio à parte, semeado pelo nome e pelos atributos (o id muitas vezes ainda é null), para não mudar o resto do jogador gerado com a mesma semente.
  function sortearPeFraco(chave, pe) {
    const rng = criarRng([...String(chave)].reduce((h, c) => Math.imul(h, 31) + c.charCodeAt(0) | 0, 162));
    return pe === "A" ? rng.int(13, 20) : rng.int(1, 12);
  }
  // Talento comum vai até 92 (teto de nota 41). Os raros (teto 42 e 43) só nascem na safra de cada temporada (virada.js);
  // raro: true libera o sorteio inteiro, e só a criação dos elencos de uma liga nova usa.
  const TALENTO_COMUM = 92;
  function gerarJogador(rng, { id, pos, alvo, idade, pais = "Brasil", perfil = "equilibrado", nomes, usados, raro = false }) {
    const at = sortearAtributos(rng, pos, alvo);
    aplicarPerfil(rng, at, pos, perfil);
    ajustarNota(rng, at, pos, alvo);
    const { nome, completo } = sortearNome(rng, nomes, pais, usados);
    const j = {
      id,
      nome, // nome de camisa
      nome_completo: completo,
      pais,
      idade,
      pos, // posição principal
      fam: sortearFamiliaridade(rng, pos),
      at,
      tal: limitar(Math.round(rng.normal(idade <= 21 ? 58 : 48, 17)), 1, raro ? 100 : TALENTO_COMUM), // talento oculto, 1 a 100
      pe: sortearPe(rng, pos),
    };
    j.pf = sortearPeFraco(j.nome_completo + j.at, j.pe);
    j.tal = Math.max(j.tal, talentoMinimo(j)); // reposição forte (nota do aposentado ou do vendido) com talento sorteado baixo nascia acima do teto
    return j;
  }

  // Desvios em torno do alvo que somam zero, para todo elenco ter a mesma média.
  function desvios(rng, n, desvio) {
    const d = Array.from({ length: n }, () => rng.normal(0, desvio));
    const media = d.reduce((a, b) => a + b, 0) / n;
    return d.map(v => v - media);
  }

  // nivel: nota média dos 16 de nível titular. Todos os elencos gerados com o mesmo nível têm a mesma força média.
  function gerarElenco(rng, { nivel = 30, perfil = "equilibrado", pais = "Brasil", nomes, prefixoId = "j" }) {
    const usados = new Set(), elenco = [];
    const dTit = desvios(rng, VAGAS_TITULARES.length, 1.5), dRes = desvios(rng, VAGAS_RESERVAS.length, 1.5);
    const jovens = new Set(rng.embaralhar(VAGAS_RESERVAS.map((_, i) => i)).slice(0, 4));
    VAGAS_TITULARES.forEach((pos, i) => elenco.push({
      ...gerarJogador(rng, { id: prefixoId + elenco.length, pos, alvo: nivel + dTit[i], idade: rng.int(23, 30), pais, perfil, nomes, usados, raro: true }),
      titular: true,
    }));
    VAGAS_RESERVAS.forEach((pos, i) => elenco.push({
      ...gerarJogador(rng, { id: prefixoId + elenco.length, pos, alvo: nivel - FOLGA_RESERVA + dRes[i], idade: jovens.has(i) ? rng.int(18, 21) : rng.int(24, 33), pais, perfil, nomes, usados, raro: true }),
      titular: false,
    }));
    return elenco;
  }

  // Onze sob medida para uma formação: cada vaga recebe um jogador natural dela, todos em torno do mesmo nível.
  // Serve para comparar formações em condições iguais (calibragem) e para montar times da IA.
  function gerarOnze(rng, vagas, { nivel = 30, perfil = "equilibrado", pais = "Brasil", nomes, prefixoId = "j" }) {
    const d = desvios(rng, vagas.length, 1.5), usados = new Set();
    return vagas.map((pos, i) => ({
      j: gerarJogador(rng, { id: prefixoId + i, pos, alvo: nivel + d[i], idade: rng.int(23, 30), pais, perfil, nomes, usados }),
      pos,
    }));
  }
  return { VAGAS_TITULARES, VAGAS_RESERVAS, PERFIS, CONFIG_NOMES, semAcento, sortearNome, sortearPe, sortearPeFraco, TALENTO_COMUM, gerarJogador, gerarElenco, gerarOnze };
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

const __base = (() => {
  // Base: os jovens que o clube revela. Chegam na virada da temporada (promoção) e numa peneira a partir da rodada 9.
  // O nível da base dá quantidade e nota de chegada (15 + 1,5 por nível); o talento não depende dele. Os talentos raros vêm da safra (virada.js).
  // Módulo puro: usado pela virada (página do administrador) e pela função "mercado" do servidor (peneira).
  const { limitar } = __rng;
  const { gerarJogador, TALENTO_COMUM } = __gerador;
  const { talentoMinimo } = __modelo;
  const { salarioDeMercado } = __economia;
  const CONFIG_BASE = {
    promocao: [[1, 1], [1, 2], [2, 2], [2, 3], [3, 3], [3, 4]], // por nível da base (0 a 5): mínimo e máximo de jovens na virada
    peneira: [[0, 0], [0, 1], [0, 1], [0, 2], [1, 2], [1, 3]],  // idem, na peneira do meio da temporada
    rodadaDaPeneira: 9,
    nota: [15, 1.5, 1.5, 13, 25], // nota de chegada: 15 + 1,5 por nível, com desvio de 1,5, entre 13 e 25
    idade: [16, 18], contrato: 3,
    idadeDeJuvenil: 21,           // juvenil que chega à virada com esta idade sem contrato fica livre; o formado no clube fica protegido até ela
  };
  // Reinício (relatório da calibragem): os jovens da base dos dirigentes nascem com 12 de talento a menos (média 46 em vez de 58), sem descer
  // do mínimo que a nota de chegada pede; o raro da safra (acima de TALENTO_COMUM) não muda.
  const TALENTO_DA_BASE = -12;
  const LIMITE_DE_CONTRATADOS = 30;
  const LIMITE_DE_JUVENIS = 25;
  // posições sorteadas para os jovens: mais gente de linha do que goleiro
  const POSICOES_DA_BASE = ["GK", "DC", "DC", "DR", "DL", "DMC", "MC", "MC", "MR", "ML", "AMC", "AMR", "AML", "FC", "SC", "RW", "LW"];
  const faixaDeJovens = (nivel, momento) => CONFIG_BASE[momento === "peneira" ? "peneira" : "promocao"][limitar(nivel || 0, 0, 5)];

  // Devolve os jovens prontos para gravar: { nome, pais, idade, pos, fam, at, tal, salario, salario_mercado, contrato_ate, protegido_ate }.
  // temporada: a temporada em que eles começam a jogar. usados: nomes que não podem se repetir.
  // jaTem: posições dos jovens que o clube já tem; cada um na posição divide por mais um a chance de vir outro igual (os desta leva também contam).
  // usa: as 11 posições da tática salva do clube; cada vaga soma um ao peso da posição (e traz líbero e alas, que fora disso a base não revela).
  // extra: jovens a mais além do sorteio (prêmio da diretoria de 95+ na peneira, 153_premios_da_diretoria.sql).
  // juvenis (60_juvenis_e_formador.sql): chegam sem contrato nem salário e com a multa travada até os 21 anos; sem isso, contrato de 3 temporadas como antes.
  function jovensDaBase(rng, { nivel = 0, momento = "promocao", perfil = "equilibrado", nomes, usados, temporada, juvenis = false, jaTem = [], usa = [], extra = 0 }) {
    const C = CONFIG_BASE, [min, max] = faixaDeJovens(nivel, momento), n = rng.int(min, max) + extra, lista = [], tem = {};
    for (const p of jaTem) tem[p] = (tem[p] || 0) + 1;
    const sortearPosicao = () => {
      const opcoes = [...POSICOES_DA_BASE, ...new Set(usa.filter(p => !POSICOES_DA_BASE.includes(p)))];
      const pesos = opcoes.map(p => (1 + usa.filter(u => u === p).length) / (1 + (tem[p] || 0))); let r = rng.n() * pesos.reduce((a, b) => a + b, 0);
      const pos = opcoes[Math.max(0, pesos.findIndex(w => (r -= w) < 0))];
      tem[pos] = (tem[pos] || 0) + 1; return pos;
    };
    for (let k = 0; k < n; k++) {
      const j = gerarJogador(rng, { id: null, pos: sortearPosicao(), alvo: limitar(C.nota[0] + C.nota[1] * (nivel || 0) + rng.normal(0, C.nota[2]), C.nota[3], C.nota[4]),
        idade: rng.int(C.idade[0], C.idade[1]), perfil, nomes, usados });
      if (j.tal <= TALENTO_COMUM) j.tal = Math.max(talentoMinimo(j), limitar(j.tal + TALENTO_DA_BASE, 1, TALENTO_COMUM));
      const mercado = salarioDeMercado(j);
      lista.push({ nome: j.nome, nome_completo: j.nome_completo, pais: j.pais, idade: j.idade, pos: j.pos, fam: j.fam, at: j.at, tal: j.tal,
        ...(juvenis ? { salario: null, salario_mercado: mercado, contrato_ate: null, protegido_ate: temporada + C.idadeDeJuvenil - j.idade, juvenil: true }
          : { salario: mercado, salario_mercado: mercado, contrato_ate: temporada + C.contrato - 1, protegido_ate: temporada }) });
    }
    return lista;
  }

  // Reinício (155_garotos_da_escolinha.sql): cada clube com dirigente começa com um onze de 16 anos da escolinha, de teto ~25 (talento 10),
  // que não assina contrato e sai da liga aos 21, e com 2 juvenis comuns de talento de Série A (60 a 75: teto 35 a 38), para o time da base
  // não ser só de garotos anônimos enquanto a base de nível 0 revela um por temporada. Chegam com a nota da base de nível 0.
  const JUVENIS_DO_REINICIO = { escolinha: ["GK", "DR", "DC", "DC", "DL", "DMC", "MC", "MC", "AMR", "AML", "FC"], talentoDaEscolinha: 10, talentosos: 2, talento: [60, 75] };
  function juvenisDoReinicio(rng, { nomes, usados, escolinha = true, talentosos = JUVENIS_DO_REINICIO.talentosos }) {
    const R = JUVENIS_DO_REINICIO, C = CONFIG_BASE;
    const jovem = (pos, tal, daEscolinha) => {
      const j = gerarJogador(rng, { id: null, pos, alvo: limitar(C.nota[0] + rng.normal(0, C.nota[2]), C.nota[3], C.nota[4]), idade: 16, nomes, usados });
      return { nome: j.nome, nome_completo: j.nome_completo, pais: j.pais, idade: 16, pos, fam: j.fam, at: j.at, tal: Math.max(talentoMinimo(j), tal),
        salario: null, salario_mercado: salarioDeMercado(j), contrato_ate: null, protegido_ate: C.idadeDeJuvenil - 16, juvenil: true, escolinha: daEscolinha };
    };
    return [...(escolinha ? R.escolinha : []).map(pos => jovem(pos, R.talentoDaEscolinha, true)),
      ...Array.from({ length: talentosos }, () => jovem(rng.pick(POSICOES_DA_BASE), rng.int(R.talento[0], R.talento[1]), false))];
  }
  return { CONFIG_BASE, TALENTO_DA_BASE, LIMITE_DE_CONTRATADOS, LIMITE_DE_JUVENIS, faixaDeJovens, jovensDaBase, JUVENIS_DO_REINICIO, juvenisDoReinicio };
})();
// <<< módulos embutidos
const { criarRng } = __rng, { notaBruta, paisDoGrupo } = __modelo, { gerarJogador, semAcento } = __gerador, { contratoInicial, salarioDeMercado } = __economia, { jovensDaBase } = __base;

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (corpo, status = 200) => new Response(JSON.stringify(corpo), { status, headers: { ...cors, "Content-Type": "application/json" } });
const NOMES = "https://doc2342.github.io/Trem-Soccer/dados/nomes.json";
let nomes = null; // base de nomes, buscada uma vez e guardada enquanto a função fica no ar

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const url = Deno.env.get("SUPABASE_URL"), chave = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !chave) return json({ erro: "Função sem acesso ao banco: faltam SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY." }, 500);
    const sb = createClient(url, chave, { auth: { persistSession: false } });
    const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
    const { data: quem } = token ? await sb.auth.getUser(token) : { data: null };
    if (!quem || !quem.user) return json({ erro: "É preciso entrar na conta." });
    const pedido = await req.json().catch(() => ({}));
    // peneira da base: os jovens são gerados aqui, conforme o nível da base do clube, e gravados pelo banco (35_base_e_dispensa.sql)
    if (pedido.acao === "peneira") {
      const { data: ativo } = await sb.rpc("meu_clube_de", { p_user: quem.user.id }); // o clube ativo (100_clube_ativo_no_servidor.sql): com dois clubes, a busca por dono traria os dois
      const { data: meu } = ativo ? await sb.from("clubes").select("id, perfil, liga_id, base_nivel").eq("id", ativo).maybeSingle() : { data: null };
      if (!meu) return json({ erro: "Você não tem clube." });
      const { data: lg } = await sb.from("ligas").select("temporada").eq("id", meu.liga_id).maybeSingle();
      if (!nomes) nomes = await (await fetch(NOMES)).json();
      const { data: premio } = await sb.rpc("premio_da_diretoria", { p_clube: meu.id, p_temporada: lg ? lg.temporada : 0 }); // 153: com 95+, um garoto a mais (antes do 153, nada)
      const jovens = jovensDaBase(criarRng(Math.floor(Math.random() * 2147483647)), { nivel: meu.base_nivel || 0, momento: "peneira", perfil: meu.perfil, nomes, temporada: lg ? lg.temporada : 0, extra: (premio || 0) >= 95 ? 1 : 0,
        usa: ((((await sb.from("taticas").select("dados").eq("clube_id", meu.id).maybeSingle()).data || {}).dados || {}).vagas || []),
        jaTem: ((await sb.from("jogadores").select("*").eq("clube_id", meu.id).lte("idade", 21)).data || []).filter(j => !j.escolinha).map(j => j.pos), // o da escolinha (155) não conta
        usados: new Set(((await sb.from("jogadores").select("nome").eq("clube_id", meu.id)).data || []).map(j => semAcento(j.nome))), // camisa sem repetir no elenco
        juvenis: !(await sb.from("jogadores").select("juvenil").limit(1)).error }); // juvenis sem contrato só depois do 60_juvenis_e_formador.sql
      const r = await sb.rpc("receber_jovens", { p_user: quem.user.id, p_lista: jovens });
      if (r.error) return json({ erro: r.error.message });
      return json({ ok: true, mensagem: r.data });
    }
    const idJogador = +String(pedido.jogador || "").replace(/^j/, "");
    if (!idJogador) return json({ erro: "Jogador não informado." });
    // juvenil assina o primeiro contrato: o salário de mercado sai dos atributos de hoje (60_juvenis_e_formador.sql)
    if (pedido.acao === "profissionalizar") {
      const { data: jv } = await sb.from("jogadores").select("id, idade, pos, fam, at, juvenil").eq("id", idJogador).maybeSingle();
      if (!jv || !jv.juvenil) return json({ erro: "Esse jogador não é juvenil." });
      const r = await sb.rpc("profissionalizar_jogador", { p_user: quem.user.id, p_jogador: idJogador, p_mercado: salarioDeMercado(jv), p_temporadas: Math.round(+pedido.temporadas) || 1 });
      if (r.error) return json({ erro: r.error.message });
      return json({ ok: true, mensagem: r.data });
    }

    const { data: j } = await sb.from("jogadores").select("*").eq("id", idJogador).maybeSingle();
    if (!j) return json({ erro: "Jogador não encontrado." });
    const { data: clube } = await sb.from("clubes").select("id, dono, perfil, liga_id, grupo").eq("id", j.clube_id).maybeSingle();
    let reposicao = null;
    if (clube && !clube.dono) { // clube sem dono: entra no lugar um jogador gerado da mesma nota, para o clube não enfraquecer
      const { data: liga } = await sb.from("ligas").select("temporada").eq("id", clube.liga_id).maybeSingle();
      if (!nomes) nomes = await (await fetch(NOMES)).json();
      const rng = criarRng(Math.floor(Math.random() * 2147483647));
      const novo = gerarJogador(rng, { id: null, pos: j.pos, alvo: notaBruta(j.at, j.pos), idade: rng.int(20, 28), pais: paisDoGrupo(clube.grupo), perfil: clube.perfil, nomes,
        usados: new Set(((await sb.from("jogadores").select("nome").eq("clube_id", clube.id)).data || []).map(x => semAcento(x.nome))) }); // da nacionalidade do clube: não ocupa vaga de estrangeiro
      const c = contratoInicial(rng, novo, liga ? liga.temporada : 0);
      reposicao = { nome: novo.nome, nome_completo: novo.nome_completo, pais: novo.pais, idade: novo.idade, pos: novo.pos, fam: novo.fam, at: novo.at, tal: novo.tal,
        salario: c.salario, salario_mercado: c.mercado, contrato_ate: c.contrato_ate, protegido_ate: c.protegido_ate };
    }
    const { data, error } = await sb.rpc("comprar_pela_multa", { p_user: quem.user.id, p_jogador: idJogador,
      p_salario: Math.round(+pedido.salario), p_temporadas: Math.round(+pedido.temporadas), p_reposicao: reposicao, p_mercado: salarioDeMercado(j) }); // valor de hoje: a multa e o salário mínimo partem dele (66_multa_e_bots.sql)
    if (error) return json({ erro: error.message });
    return json({ ok: true, mensagem: data });
  } catch (e) {
    return json({ erro: e.message }, 500);
  }
});
