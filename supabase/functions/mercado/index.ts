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

const __gerador = (() => {
  // Gerador de jogadores e de elencos iniciais.
  // Perfil equilibrado: atributos principais da posição altos, secundários médios, o resto variado.
  const { limitar } = __rng;
  const { ATRIBUTOS, ATR_MIN, ATR_MAX, IDX, POSICOES, PESOS, VIZINHAS, notaBruta } = __modelo;
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

  function sortearNome(rng, nomes, pais, usados) {
    const base = nomes.paises[pais] || nomes.paises.Brasil;
    for (let i = 0; i < 20; i++) {
      const nome = rng.pick(base.p) + " " + rng.pick(base.s);
      if (!usados || !usados.has(nome)) { if (usados) usados.add(nome); return nome; }
    }
    return rng.pick(base.p) + " " + rng.pick(base.s);
  }

  // alvo: nota que o jogador deve ter na posição natural (escala 1 a 50)
  function gerarJogador(rng, { id, pos, alvo, idade, pais = "Brasil", perfil = "equilibrado", nomes, usados }) {
    const at = sortearAtributos(rng, pos, alvo);
    aplicarPerfil(rng, at, pos, perfil);
    ajustarNota(rng, at, pos, alvo);
    return {
      id,
      nome: sortearNome(rng, nomes, pais, usados),
      pais,
      idade,
      pos, // posição principal
      fam: sortearFamiliaridade(rng, pos),
      at,
      tal: limitar(Math.round(rng.normal(idade <= 21 ? 58 : 48, 17)), 1, 100), // talento oculto, 1 a 100
    };
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
      ...gerarJogador(rng, { id: prefixoId + elenco.length, pos, alvo: nivel + dTit[i], idade: rng.int(23, 30), pais, perfil, nomes, usados }),
      titular: true,
    }));
    VAGAS_RESERVAS.forEach((pos, i) => elenco.push({
      ...gerarJogador(rng, { id: prefixoId + elenco.length, pos, alvo: nivel - FOLGA_RESERVA + dRes[i], idade: jovens.has(i) ? rng.int(18, 21) : rng.int(24, 33), pais, perfil, nomes, usados }),
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
  return { VAGAS_TITULARES, VAGAS_RESERVAS, PERFIS, sortearNome, gerarJogador, gerarElenco, gerarOnze };
})();

const __economia = (() => {
  // Economia: salários, cláusula e contratos. Valores em milhares por temporada.
  const { melhorPosicao } = __modelo;
  const MULTIPLO_DA_CLAUSULA = 5;   // cláusula de saída = 5 vezes o salário da temporada
  const MAXIMO_INDIVIDUAL = 0.15;   // um jogador ganha no máximo 15% do teto de folha
  const MAXIMO_DE_TEMPORADAS = 3;

  // O mínimo que o jogador aceita: cresce 12% a cada ponto de nota; jovem pede 20% menos e veterano 10% menos.
  // Nota 25 → 250 mil; 30 → 440 mil; 35 → 780 mil; 40 → 1,37 mi; 45 → 2,4 mi.
  function salarioDeMercado(j) {
    const nota = melhorPosicao(j).nota, idade = j.idade <= 21 ? 0.8 : j.idade >= 31 ? 0.9 : 1;
    return Math.max(50, Math.round(250 * Math.pow(1.12, nota - 25) * idade / 5) * 5);
  }
  const clausula = salario => salario * MULTIPLO_DA_CLAUSULA;

  // Contrato inicial de um jogador gerado: salário de mercado, duração sorteada de 1 a 3 temporadas (contando a atual)
  // e proteção contra a cláusula até o fim da primeira temporada.
  function contratoInicial(rng, j, temporada) {
    const mercado = salarioDeMercado(j);
    return { salario: mercado, mercado, contrato_ate: temporada + rng.int(0, 2), protegido_ate: temporada };
  }

  // Regras do fim de temporada e do clube no vermelho (as mesmas do 18_fim_de_temporada.sql).
  const PREMIO_MINIMO = { 1: 4000, 2: 2400, 3: 1200 };        // prêmio do lanterna: é o que dá para antecipar
  const impostoDoLucro = (lucro, teto) => Math.max(0, Math.round(0.2 * (lucro - teto / 4)));
  const LIMITE_DA_DIVIDA = 0.10, RODADAS_DE_PRAZO = 3;         // abaixo de 10% do teto no negativo, 3 rodadas para agir
  const valorNoBanco = salario => 3 * (salario || 0);          // 60% da cláusula
  // Venda negociada: o valor fica entre 60% e 150% da multa rescisória (3 a 7,5 vezes o salário), como no 22_travas_da_negociacao.sql.
  const faixaDaNegociacao = salario => ({ minimo: 3 * (salario || 0), maximo: Math.round(7.5 * (salario || 0)) });
  // 440 → "440 mil"; 1370 → "1,37 mi"
  const dinheiro = mil => mil == null ? "—" : Math.abs(mil) >= 1000 ? (mil / 1000).toFixed(2).replace(".", ",") + " mi" : mil + " mil";
  return { MULTIPLO_DA_CLAUSULA, MAXIMO_INDIVIDUAL, MAXIMO_DE_TEMPORADAS, salarioDeMercado, clausula, contratoInicial, PREMIO_MINIMO, impostoDoLucro, LIMITE_DA_DIVIDA, valorNoBanco, faixaDaNegociacao, dinheiro };
})();
// <<< módulos embutidos
const { criarRng } = __rng, { notaBruta } = __modelo, { gerarJogador } = __gerador, { contratoInicial } = __economia;

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
    const idJogador = +String(pedido.jogador || "").replace(/^j/, "");
    if (!idJogador) return json({ erro: "Jogador não informado." });

    const { data: j } = await sb.from("jogadores").select("*").eq("id", idJogador).maybeSingle();
    if (!j) return json({ erro: "Jogador não encontrado." });
    const { data: clube } = await sb.from("clubes").select("id, dono, perfil, liga_id").eq("id", j.clube_id).maybeSingle();
    let reposicao = null;
    if (clube && !clube.dono) { // clube sem dono: entra no lugar um jogador gerado da mesma nota, para o clube não enfraquecer
      const { data: liga } = await sb.from("ligas").select("temporada").eq("id", clube.liga_id).maybeSingle();
      if (!nomes) nomes = await (await fetch(NOMES)).json();
      const rng = criarRng(Math.floor(Math.random() * 2147483647));
      const novo = gerarJogador(rng, { id: null, pos: j.pos, alvo: notaBruta(j.at, j.pos), idade: rng.int(20, 28), perfil: clube.perfil, nomes });
      const c = contratoInicial(rng, novo, liga ? liga.temporada : 0);
      reposicao = { nome: novo.nome, pais: novo.pais, idade: novo.idade, pos: novo.pos, fam: novo.fam, at: novo.at, tal: novo.tal,
        salario: c.salario, salario_mercado: c.mercado, contrato_ate: c.contrato_ate, protegido_ate: c.protegido_ate };
    }
    const { data, error } = await sb.rpc("comprar_pela_multa", { p_user: quem.user.id, p_jogador: idJogador,
      p_salario: Math.round(+pedido.salario), p_temporadas: Math.round(+pedido.temporadas), p_reposicao: reposicao });
    if (error) return json({ erro: error.message });
    return json({ ok: true, mensagem: data });
  } catch (e) {
    return json({ erro: e.message }, 500);
  }
});
