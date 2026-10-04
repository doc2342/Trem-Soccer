// Tela de escalação e tática. Montada dentro de um elemento: na página escalacao.html (sozinha) e na aba Tática de jogo.html.
// online: usa o elenco e a tática do clube no banco; sessao: { user } de quem está logado; cabecalho: desenha o topo com as abas (só na página sozinha).
import { criarRng } from "./rng.js";
import { experienciaDe } from "./saude.js";
import { ATRIBUTOS, PESOS, POSICOES, LISTA_POSICOES, IDX, NOME_FAMILIARIDADE, notaNaPosicao, familiaridade } from "./modelo.js";
import { gerarElenco, PERFIS } from "./gerador.js";
import { FORMACOES, escalar } from "./escalacao.js";
import { prepararTime, simularPartida, avaliarZonas, COBERTURA, ZONAS, CONFIG } from "./motor.js";
import { taticaBot } from "./bot.js";
import { montarRelatorio } from "./relatorio.js";
import { htmlRelatorio } from "./ui-relatorio.js";
import { sg, pp, filasDoCampo } from "./siglas.js";

const HTML = `  <div id="cabecalho"></div>
  <h1 class="soLocal">Escalação e tática</h1>
  <div class="mut soLocal">Monte o time nas 18 posições, escolha as instruções e jogue contra um clube comandado pelo bot.</div>

  <div class="card" id="online" hidden>
    <div class="row"><b>Escalação e tática</b><b id="nomeOnline" hidden></b><button id="salvarOnline" style="margin-left:auto">Salvar para o próximo jogo</button></div>
    <div id="avisoOnline" class="mut" style="margin-top:6px"></div>
    <div class="mut" style="margin-top:4px">Para testar a tática, salve e jogue um amistoso na página do clube.</div>
  </div>
  <div class="card row">
    <label class="soLocal">Elenco (semente)<input id="semente" type="number" value="1" style="width:90px"></label>
    <label class="soLocal">Nível<input id="nivel" type="number" min="15" max="42" value="30" style="width:80px"></label>
    <label class="soLocal">Perfil<select id="perfil"></select></label>
    <label>Formação pronta<select id="formacao"></select></label>
    <button class="sec" id="auto">Escalar os melhores</button>
    <button class="sec" id="bot">Deixar o bot montar tudo</button>
  </div>

  <div class="duas">
    <div>
      <div class="card"><h2>Time <span class="tag">arraste um jogador para uma vaga ou para o banco, ou clique na vaga para escolher; arrastando um titular aparecem as outras posições: solte numa delas para mudar a posição dele</span></h2><div class="gramado" id="gramado"></div>
        <h2 style="margin-top:12px">Banco <span class="tag">até 7</span></h2><div class="chips" id="banco"></div>
        <div id="validacao" style="margin-top:10px"></div></div>
      <details class="card dobra" open><summary><h2>Cobertura das zonas <span class="tag">o time ataca para cima; ataque · defesa</span></h2></summary><div class="campo" id="zonas" style="max-width:none"></div></details>
    </div>
    <div>
      <div class="card" id="escolha"></div>
      <div class="card"><h2>Instruções</h2><div class="row" id="instrucoes"></div></div>
      <details class="card dobra" open><summary><h2>Capitão, armador e cobradores</h2></summary><div id="papeis"></div></details>
      <details class="card dobra" open><summary><h2>Substituições <span class="tag">até 5</span></h2></summary><div id="subs"></div><button class="sec" id="maisSub">Adicionar substituição</button></details>
      <details class="card dobra" open><summary><h2>Ordens condicionais <span class="tag">até 3</span></h2></summary><div id="ordens"></div><button class="sec" id="maisOrdem">Adicionar ordem</button></details>
      <div class="card"><h2>Escalações salvas</h2><div class="row"><input id="nomeSalva" placeholder="Nome da escalação" style="flex:1;min-width:140px"><button class="sec" id="salvar">Salvar</button></div><div class="chips" id="salvas" style="margin-top:8px"></div></div>
    </div>
  </div>

  <div class="card row soLocal">
    <label class="soLocal">Nível do adversário<input id="nivelAdv" type="number" min="15" max="42" value="30" style="width:90px"></label>
    <label class="soLocal">Elenco do adversário<input id="sementeAdv" type="number" value="7" style="width:90px"></label>
    <label id="rotuloAdv" hidden>Adversário<select id="advOnline"></select></label>
    <label>Mando<select id="mando"><option value="casa">Jogo em casa</option><option value="fora">Jogo fora</option></select></label>
    <label>Analista<select id="analista"><option value="1">Nível 1</option><option value="2">Nível 2</option><option value="3" selected>Nível 3</option></select></label>
    <button id="jogar">Jogar amistoso</button>
    <span class="mut" id="infoAdv"></span>
  </div>
  <div id="rel"></div>`;

export async function montarEscalacao(raiz, { online = false, sessao = null, cabecalho = true } = {}) {
raiz.innerHTML = HTML;

const $ = id => raiz.querySelector("#" + id);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const f1 = v => v.toFixed(1).replace(".", ",");
const nomes = await (await fetch("./dados/nomes.json")).json();
const guardar = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };
const ler = k => { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } };

const INSTR = { mentalidade: 0, pressao: 0, agressividade: 0, passe: "misto", lado: "misto", contraAtaque: false, impedimento: false, capitao: null, vice: null, armador: null, alvo: null, cobradores: { escanteio: [], falta: [], penalti: [] } };
const OPCOES = {
  mentalidade: ["Mentalidade", [[-2, "Muito defensiva"], [-1, "Defensiva"], [0, "Normal"], [1, "Ofensiva"], [2, "Muito ofensiva"]]],
  pressao: ["Pressão", [[0, "Sem pressão"], [1, "Média"], [2, "Alta"]]],
  agressividade: ["Agressividade", [[-2, "Muito baixa"], [-1, "Baixa"], [0, "Normal"], [1, "Alta"], [2, "Muito alta"]]],
  passe: ["Passe", [["misto", "Misto"], ["curto", "Curto"], ["longo", "Bola longa"]]],
  lado: ["Lado do ataque", [["misto", "Livre"], ["E", "Esquerda"], ["C", "Centro"], ["D", "Direita"], ["lados", "Os dois lados"]]],
  contraAtaque: ["Contra-ataque", [[false, "Não"], [true, "Sim"]]],
  impedimento: ["Linha de impedimento", [[false, "Não"], [true, "Sim"]]],
};
const CONDICOES = [["sempre", "sempre"], ["ganhando", "se estiver ganhando"], ["empatando", "se estiver empatando"], ["perdendo", "se estiver perdendo"]];
const CONDICOES_SUB = [...CONDICOES, ["cansado", "se ele estiver cansado"], ["amarelo", "se ele tiver amarelo"]];
const MUDANCAS = [["mentalidade:2", "Mentalidade muito ofensiva"], ["mentalidade:1", "Mentalidade ofensiva"], ["mentalidade:0", "Mentalidade normal"], ["mentalidade:-1", "Mentalidade defensiva"], ["mentalidade:-2", "Mentalidade muito defensiva"],
  ["pressao:2", "Pressão alta"], ["pressao:1", "Pressão média"], ["pressao:0", "Sem pressão"], ["contraAtaque:true", "Ligar o contra-ataque"], ["contraAtaque:false", "Desligar o contra-ataque"], ["passe:longo", "Bola longa"], ["passe:curto", "Passe curto"]];
const LINHAS = ["ataque", "meia", "meio", "volante", "ala", "defesa", "gol"], ORDEM_LADO = { E: 0, C: 1, D: 2 };
const NOME_ZONA = { DE: "defesa esquerda", DC: "centro da defesa", DD: "defesa direita", ME: "meio esquerdo", MC: "centro do meio", MD: "meio direito", AE: "ataque pela esquerda", AC: "centro do ataque", AD: "ataque pela direita" };

let elenco = [], porId = {}, E = null, sel = null, clubeOnline = null, adversarioOnline = null;
const ONLINE = online; // online: a tela usa o elenco e a tática do clube no banco
const chaveElenco = () => ONLINE ? "online_" + (clubeOnline ? clubeOnline.id : 0) : `${$("semente").value}_${$("nivel").value}_${$("perfil").value}`;
const jogDe = id => porId[id] || null;
const momento = v => { const n = v == null ? 50 : v; return n >= 65 ? "ok" : n <= 35 ? "bad" : ""; }; // cor da forma e da moral
const GRUPOS = [["Técnica", "tec"], ["Defesa", "def"], ["Físico", "fis"], ["Mental", "men"], ["Goleiro", "gol"]];
let skillsDe = null; // jogador com os atributos abertos na lista de escolha
let salvoComo = null; // a tática como foi lida ou salva pela última vez, para saber se há mudança sem salvar
const escalacaoAtual = () => E.vagas.map((pos, i) => E.jog[i] ? { j: jogDe(E.jog[i]), pos } : null).filter(Boolean);
const titulares = () => E.jog.filter(Boolean).map(jogDe);

function daTatica(t) {
  const I = t.instrucoes;
  return {
    vagas: t.escalacao.map(x => x.pos), jog: t.escalacao.map(x => x.j.id), banco: t.banco.map(j => j.id),
    instr: { ...INSTR, mentalidade: I.mentalidade, lado: I.lado, capitao: I.capitao, vice: I.vice, armador: I.armador, alvo: I.alvo, cobradores: JSON.parse(JSON.stringify(I.cobradores)) },
    subs: I.substituicoes.map(s => ({ ...s })), ordens: I.ordens.map(o => ({ min: o.min, cond: o.cond, muda: Object.entries(o.muda).map(([k, v]) => k + ":" + v)[0] })),
  };
}
function novoElenco() {
  elenco = gerarElenco(criarRng(5000 + +$("semente").value), { nivel: +$("nivel").value, perfil: $("perfil").value, nomes, prefixoId: "m" });
  porId = Object.fromEntries(elenco.map(j => [j.id, j]));
  const salvo = ler("mo_trabalho_" + chaveElenco());
  E = salvo && salvo.vagas ? salvo : daTatica(taticaBot(elenco, { mandante: $("mando").value === "casa" }));
  sel = null; render();
}
async function iniciarOnline(sessaoDeTeste) {
  const B = await import("./banco.js"), s = sessaoDeTeste || await B.sessao();
  raiz.querySelectorAll(".soLocal").forEach(e => { e.hidden = true; });
  $("online").hidden = false;
  const parar = t => { $("avisoOnline").innerHTML = t; $("salvarOnline").hidden = true; };
  if (!s) return parar(`Você não está na conta. <a href="jogo.html" style="color:var(--ac)">Entrar</a>`);
  clubeOnline = await B.meuClube(s.user.id);
  if (!clubeOnline) return parar(`Você ainda não tem clube. <a href="jogo.html" style="color:var(--ac)">Criar o clube</a>`);
  $("nomeOnline").textContent = clubeOnline.nome;
  // mesmo cabeçalho e mesmas abas da página do clube; as outras abas levam de volta a ela, já na aba escolhida
  if (cabecalho) try {
    const [V, ligaC, admin] = await Promise.all([import("./escudo.js"), B.ligaAtual(), B.ehAdmin().catch(() => false)]);
    $("cabecalho").innerHTML = `<div class="topo"><h1 style="margin:0">Trem Soccer</h1><span class="relogio" title="Hora deste aparelho"></span><span class="mut" style="margin-left:auto">${esc(s.user.email || "")}</span></div>
      <div class="card topo">${V.svgEscudo(clubeOnline.escudo, clubeOnline.sigla, 72)}${V.svgUniforme(clubeOnline.uniforme, 52)}
        <div><h2 style="margin:0;font-size:22px">${esc(clubeOnline.nome)}</h2>
          ${clubeOnline.dirigente ? `<div style="font-size:15px">${esc(clubeOnline.dirigente)}</div>` : ""}
          <div class="mut">${esc(ligaC.nome)} · temporada ${ligaC.temporada} · ${esc(B.nomeDoGrupo(clubeOnline.grupo))}</div></div>
        ${admin ? `<a href="admin.html" style="color:var(--ac);margin-left:auto">Administração</a>` : ""}</div>
      <div class="abas" id="abas">${[["inicio", "Central", "🏠"], ["elenco", "Elenco", "👥"], ["tatica", "Tática", "📋"], ["mercado", "Mercado", "🛒"], ["classificacao", "Classificação", "🏆", "Tabela"], ["financas", "Finanças", "💰"], ["config", "Configurações", "⚙️", "Ajustes"]]
        .map(([k, n, ic, curto]) => `<button class="aba ${k === "tatica" ? "ativa" : ""}" data-aba="${k}" title="${n}"><span class="ai">${ic}</span><span class="at at-l">${n}</span><span class="at at-c">${curto || n}</span></button>`).join("")}</div>`;
    $("abas").onclick = e => {
      const b = e.target.closest("[data-aba]"); if (!b || b.dataset.aba === "tatica") return;
      try { localStorage.setItem("mo_aba", b.dataset.aba); } catch (err) {}
      location.href = "jogo.html";
    };
  } catch (e) { $("cabecalho").innerHTML = `<div class="row" style="margin-bottom:10px"><a href="jogo.html" style="color:var(--ac)">← Voltar ao clube</a></div>`; }
  elenco = await B.elencoDoClube(clubeOnline.id);
  porId = Object.fromEntries(elenco.map(j => [j.id, j]));
  const salva = await B.minhaTatica(clubeOnline.id);
  E = salva && salva.dados && salva.dados.vagas ? salva.dados : daTatica(taticaBot(elenco, { mandante: true }));
  salvoComo = JSON.stringify(E);
  const quando = d => new Date(d).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" });
  const situacao = async () => {
    const fechada = await B.taticaFechada(clubeOnline.id);
    $("avisoOnline").innerHTML = fechada ? `<span class="aviso">A tática está fechada: há um jogo começando ou em cálculo. O que você salvar agora só vale depois dele.</span>`
      : salva ? `Tática salva em ${quando(salva.atualizada_em)}.` : "Você ainda não salvou uma tática: enquanto não salvar, o bot escala o seu time.";
  };
  await situacao();
  $("salvarOnline").onclick = async () => {
    const V = validar();
    if (V.erros.length) { $("avisoOnline").innerHTML = `<span class="bad">${esc(V.erros[0])}</span>`; return; }
    $("salvarOnline").disabled = true;
    try { await B.salvarTatica(clubeOnline.id, E); salvoComo = JSON.stringify(E); $("avisoOnline").innerHTML = `<span class="ok">Tática salva às ${new Date().toLocaleTimeString("pt-BR")}.</span>`; }
    catch (e) { $("avisoOnline").innerHTML = `<span class="bad">${/row-level security/.test(e.message) ? "Não deu para salvar: a tática está fechada para o jogo que vai começar." : esc(e.message)}</span>`; }
    $("salvarOnline").disabled = false;
  };
  // amistosos: contra qualquer clube da liga, quantas vezes quiser; o adversário joga com a tática de bot e nada fica gravado
  const liga = await B.ligaAtual(), outros = (await B.clubesDaLiga(liga.id)).filter(c => c.id !== clubeOnline.id);
  $("rotuloAdv").hidden = false;
  $("advOnline").innerHTML = outros.map(c => `<option value="${c.id}">${esc(B.nomeDoGrupo(c.grupo))} · ${esc(c.nome)}${c.dono ? " (dirigente)" : ""}</option>`).join("");
  const mesmoGrupo = outros.find(c => c.grupo === clubeOnline.grupo); if (mesmoGrupo) $("advOnline").value = mesmoGrupo.id;
  const guardados = {};
  adversarioOnline = async () => { const id = +$("advOnline").value, c = outros.find(x => x.id === id); guardados[id] = guardados[id] || await B.elencoDoClube(id); return { elenco: guardados[id], nome: c.nome, perfil: c.perfil }; };
  sel = null; limparReferencias(); render();
}
function aplicarFormacao(nome) {
  const esc11 = escalar(elenco, FORMACOES[nome]);
  E.vagas = esc11.map(x => x.pos); E.jog = esc11.map(x => x.j.id);
  E.banco = E.banco.filter(id => !E.jog.includes(id));
  limparReferencias(); render();
}
// Tira das instruções quem saiu do time ou do banco.
function limparReferencias() {
  const emCampo = new Set(E.jog.filter(Boolean)), noBanco = new Set(E.banco);
  for (const k of ["capitao", "vice", "armador", "alvo"]) if (!emCampo.has(E.instr[k])) E.instr[k] = null;
  for (const k in E.instr.cobradores) E.instr.cobradores[k] = E.instr.cobradores[k].filter(id => emCampo.has(id));
  E.subs = E.subs.filter(s => emCampo.has(s.sai) && noBanco.has(s.entra));
}

function validar() {
  const esc11 = escalacaoAtual(), erros = [], avisos = [];
  if (esc11.length < 11) erros.push(`Faltam ${11 - esc11.length} jogadores no time.`);
  const goleiros = E.vagas.filter(p => p === "GK").length;
  if (goleiros !== 1) erros.push(goleiros ? "O time só pode ter um goleiro." : "O time precisa de um goleiro.");
  const cob = Object.fromEntries(ZONAS.map(z => [z, 0]));
  esc11.forEach(x => { for (const [z, w] of Object.entries(COBERTURA[x.pos])) cob[z] += w; });
  for (const z of ["DE", "DC", "DD", "ME", "MC", "MD"]) if (cob[z] < 0.2) avisos.push(`Quase ninguém cobre: ${NOME_ZONA[z]}.`);
  if (cob.DC < 1) avisos.push("Centro da defesa com pouca gente: menos de dois zagueiros.");
  if (cob.AC < 0.5) avisos.push("Pouca presença na área: cruzamentos e bolas em profundidade ficam sem alvo.");
  if (cob.AE + cob.AD < 0.3) avisos.push("Sem jogo pelos lados no ataque: a defesa adversária fecha o centro.");
  esc11.filter(x => x.j.fora > 0).forEach(x => avisos.push(`${x.j.nome} está fora por ${x.j.motivo || "indisponibilidade"} (${x.j.fora} ${x.j.fora === 1 ? "jogo" : "jogos"}): na liga ele será trocado pelo melhor disponível para a posição.`));
  esc11.filter(x => familiaridade(x.j, x.pos) === "I").forEach(x => avisos.push(`${x.j.nome} está improvisado de ${sg(x.pos)} (rende 80%).`));
  if (E.banco.length && !E.banco.some(id => jogDe(id).pos === "GK")) avisos.push("Banco sem goleiro reserva.");
  return { erros, avisos, cob, esc11 };
}

// Faixas do campo e as posições de cada uma, para as tiras que aparecem ao arrastar um titular (coluna inicial numa grade de 10).
const TIRAS = [[["LW", 1], ["FC", 4], ["SC", 6], ["RW", 9]], [["AML", 1], ["AMC", 5], ["AMR", 9]], [["ML", 1], ["MC", 5], ["MR", 9]], [["WBL", 1], ["DMC", 5], ["WBR", 9]], [["DL", 1], ["DC", 4], ["SW", 6], ["DR", 9]]];
const FAIXA = { ataque: 0, meia: 1, meio: 2, volante: 3, ala: 3, defesa: 4, gol: 5 };
// mapa: índice da vaga que está sendo arrastada (mostra as tiras de posições), ou null
function htmlGramado(mapa = null) {
  const filas = filasDoCampo(E.vagas.map((_, i) => i), i => E.vagas[i]).map(fila => ({ faixa: FAIXA[POSICOES[E.vagas[fila.itens[0].x]].linha], html: `<div class="fila ${fila.grade ? "grade" : ""}">${fila.itens.map(({ x: i, col }) => {
    const j = jogDe(E.jog[i]), pos = E.vagas[i];
    return `<div class="vaga ${sel && sel.tipo === "vaga" && sel.i === i ? "sel" : ""} ${j ? "fam-" + familiaridade(j, pos) : "vazia"}" data-vaga="${i}" data-arrasta="${j ? j.id : ""}" ${col ? `style="grid-column:${col} / span 2"` : ""}>
      <span class="pp vpos" title="${POSICOES[pos].nome}">${sg(pos)}</span><select data-pos="${i}" title="Posição da vaga">${LISTA_POSICOES.map(p => `<option value="${p}" ${p === pos ? "selected" : ""}>${sg(p)}</option>`).join("")}</select>
      <div class="nome" title="${j ? esc(j.nome) : ""}">${j ? `<span class="nc">${esc(j.nome)}</span><span class="ns">${esc(j.nome.split(" ").slice(-1)[0])}</span>` : "vazio"}</div><div class="det">${j ? `<span class="nota">${f1(notaNaPosicao(j, pos))}</span><span class="fam"> · ${NOME_FAMILIARIDADE[familiaridade(j, pos)]}</span>` : "&nbsp;"}</div></div>`;
  }).join("")}</div>` }));
  if (mapa === null) return filas.map(f => f.html).join("");
  const j = jogDe(E.jog[mapa]);
  const tira = k => `<div class="fila fant">${TIRAS[k].map(([p, col]) => `<div class="gh" data-novapos="${p}" style="grid-column-start:${col}" title="${POSICOES[p].nome}">${sg(p)}${j ? ` ${f1(notaNaPosicao(j, p))}` : ""}</div>`).join("")}</div>`;
  return TIRAS.map((_, k) => tira(k) + filas.filter(f => f.faixa === k).map(f => f.html).join("")).join("") + filas.filter(f => f.faixa === 5).map(f => f.html).join("");
}
function render() {
  guardar("mo_trabalho_" + chaveElenco(), E);
  const V = validar();
  // gramado
  $("gramado").innerHTML = htmlGramado();
  // banco
  $("banco").innerHTML = Array.from({ length: 7 }, (_, i) => { const j = jogDe(E.banco[i]); return `<span class="chip ${j ? "" : "vazio"}" data-banco="${i}" data-arrasta="${j ? j.id : ""}" style="${sel && sel.tipo === "banco" && sel.i === i ? "border-color:var(--ac)" : ""}">${j ? `<b>${sg(j.pos)}</b> ${esc(j.nome)}` : "vazio"}</span>`; }).join("");
  // validação
  $("validacao").innerHTML = [...V.erros.map(t => `<div class="bad">${esc(t)}</div>`), ...V.avisos.map(t => `<div class="aviso">${esc(t)}</div>`)].join("") || `<div class="ok">Escalação válida, sem avisos.</div>`;
  $("jogar").disabled = V.erros.length > 0;
  // zonas
  const z9 = V.esc11.length ? avaliarZonas(V.esc11) : null;
  $("zonas").innerHTML = ["A", "M", "D"].map(l => ["E", "C", "D"].map(s => { const z = l + s; return `<div><b>${f1(V.cob[z])}</b> <span class="tag">jogadores</span><br>${z9 ? `${Math.round(z9.atk[z])} · ${Math.round(z9.def[z])}` : "—"}</div>`; }).join("")).join("");
  renderEscolha();
  // instruções
  $("instrucoes").innerHTML = Object.entries(OPCOES).map(([k, [nome, ops]]) => `<label>${nome}<select data-instr="${k}">${ops.map(([v, t]) => `<option value="${v}" ${String(E.instr[k]) === String(v) ? "selected" : ""}>${t}</option>`).join("")}</select></label>`).join("");
  // papéis
  const tit = titulares(), linha = tit.filter(j => E.vagas[E.jog.indexOf(j.id)] !== "GK");
  const opJog = (lista, atual) => `<option value="">automático</option>${lista.map(j => `<option value="${j.id}" ${j.id === atual ? "selected" : ""}>${esc(j.nome)}</option>`).join("")}`;
  // um grupo por linha: quem lidera, quem arma as jogadas e a ordem dos cobradores de cada bola parada
  const papel = (k, n, lista) => `<label class="pl"><span>${n}</span><select data-papel="${k}">${opJog(lista, E.instr[k])}</select></label>`;
  const cobradores = (k, q) => Array.from({ length: q }, (_, i) => `<label class="pl"><span>${i + 1}º</span><select data-cob="${k}" data-i="${i}">${opJog(linha, E.instr.cobradores[k][i])}</select></label>`).join("");
  $("papeis").innerHTML = `<div class="papeis">
    <b>Liderança</b><div>${papel("capitao", "Capitão", tit)}${papel("vice", "Vice", tit)}</div>
    <b>Jogadas</b><div>${papel("armador", "Armador", linha)}${papel("alvo", "Homem-alvo", linha)}</div></div>
    <div class="cobradores">
      <div><b>Escanteios</b>${cobradores("escanteio", 3)}</div>
      <div><b>Faltas</b>${cobradores("falta", 3)}</div>
      <div><b>Pênaltis</b>${cobradores("penalti", 5)}</div></div>
    <div class="mut" style="font-size:12px;margin-top:6px">Em automático, o jogo escolhe o melhor em campo para a função. Nos cobradores, vale a ordem: se o 1º não estiver em campo, cobra o 2º.</div>`;
  // substituições e ordens
  const reservas = E.banco.map(jogDe).filter(Boolean);
  const sele = (attr, ops, atual) => `<select ${attr}>${ops.map(([v, t]) => `<option value="${v}" ${String(v) === String(atual) ? "selected" : ""}>${esc(t)}</option>`).join("")}</select>`;
  $("subs").innerHTML = E.subs.map((s, i) => `<div class="linhaSub">aos <input type="number" min="0" max="89" value="${s.min}" data-sub="${i}" data-campo="min"> min, sai ${sele(`data-sub="${i}" data-campo="sai"`, tit.map(j => [j.id, j.nome]), s.sai)} entra ${sele(`data-sub="${i}" data-campo="entra"`, reservas.map(j => [j.id, j.nome]), s.entra)} ${sele(`data-sub="${i}" data-campo="cond"`, CONDICOES_SUB, s.cond)} <button class="sec" data-tirasub="${i}">×</button></div>`).join("") || `<div class="mut" style="margin-bottom:6px">Nenhuma. Jogador lesionado é trocado sozinho pelo melhor do banco para a posição.</div>`;
  $("maisSub").disabled = E.subs.length >= CONFIG.maxSubstituicoes || !reservas.length || !tit.length;
  $("ordens").innerHTML = E.ordens.map((o, i) => `<div class="linhaSub">a partir dos <input type="number" min="0" max="89" value="${o.min}" data-ordem="${i}" data-campo="min"> min, ${sele(`data-ordem="${i}" data-campo="cond"`, CONDICOES, o.cond)}: ${sele(`data-ordem="${i}" data-campo="muda"`, MUDANCAS, o.muda)} <button class="sec" data-tiraordem="${i}">×</button></div>`).join("") || `<div class="mut" style="margin-bottom:6px">Nenhuma.</div>`;
  $("maisOrdem").disabled = E.ordens.length >= 3;
  // salvas
  const salvas = ler("mo_salvas_" + chaveElenco()) || {};
  $("salvas").innerHTML = Object.keys(salvas).map(n => `<span class="chip" data-carrega="${esc(n)}">${esc(n)} <b data-apaga="${esc(n)}" title="Apagar">×</b></span>`).join("") || `<span class="mut">Nenhuma escalação salva para este elenco.</span>`;
}

function renderEscolha() {
  const el = $("escolha");
  const pos = sel && sel.tipo === "vaga" ? E.vagas[sel.i] : null;
  const nota = j => pos ? notaNaPosicao(j, pos) : notaNaPosicao(j, j.pos);
  const lista = elenco.filter(j => !sel || sel.tipo === "vaga" || !E.jog.includes(j.id)).sort((a, b) => nota(b) - nota(a));
  const onde = j => { const i = E.jog.indexOf(j.id); return i >= 0 ? `joga de ${sg(E.vagas[i])}` : E.banco.includes(j.id) ? "banco" : ""; };
  const situacao = j => E.jog.includes(j.id) ? "titular" : E.banco.includes(j.id) ? "reserva" : "";
  document.body.classList.toggle("escolhendo", !!sel);
  el.innerHTML = `${sel ? `<button class="sec fechaEscolha" data-fechaescolha="1">✕</button>` : ""}<h2>${pos ? `Quem joga de ${sg(pos)} (${POSICOES[pos].nome.toLowerCase()})` : sel ? "Quem vai para o banco" : "Elenco"} <span class="tag">${sel ? "clique para escolher ou arraste" : "arraste para uma vaga ou para o banco"} · ordenado pela nota ${pos ? "na posição" : "na posição natural"}</span></h2>
    ${pos ? `<label class="posDaVaga">Posição <select data-pos="${sel.i}">${LISTA_POSICOES.map(p => `<option value="${p}" ${p === pos ? "selected" : ""}>${sg(p)} · ${POSICOES[p].nome}</option>`).join("")}</select></label>` : ""}
    <div class="legenda"><span class="titular">titular</span><span class="reserva">no banco</span><span>fora da lista</span></div>
    <div class="cabl"><span>forma</span><span>moral</span><span>nota</span><span style="width:24px"></span></div>
    <div class="lista" style="max-height:340px;overflow:auto">${lista.map(j => { const fam = pos ? familiaridade(j, pos) : "N", p = pos || j.pos;
      return `<div class="item ${situacao(j)}" data-escolhe="${j.id}" data-arrasta="${j.id}"><span class="pega" title="Arrastar">⠿</span>${pp(j.pos)}<span class="nm">${esc(j.nome)} <span class="tag">${j.idade}</span>${j.fora > 0 ? ` <span class="bad">${j.motivo || "fora"} ${j.fora}j</span>` : ""}${j.amarelos ? " " + "🟨".repeat(j.amarelos) : ""}${onde(j) ? ` <span class="tag">${onde(j)}</span>` : ""}${fam !== "N" ? ` <span class="${fam === "I" ? "bad" : "aviso"}" style="font-size:12px">${NOME_FAMILIARIDADE[fam].toLowerCase()}</span>` : ""}</span>
        <span class="dir"><span class="mo ${momento(j.forma)}" title="Forma">${j.forma == null ? 50 : j.forma}</span><span class="mo ${momento(j.moral)}" title="Moral">${j.moral == null ? 50 : j.moral}</span><span class="nota" style="min-width:34px;text-align:right">${f1(nota(j))}</span><button class="info" data-skills="${j.id}" title="Atributos">i</button></span></div>
        ${skillsDe === j.id ? `<div class="skills">${(j.pos === "GK" ? [GRUPOS[4], ...GRUPOS.slice(0, 4)] : GRUPOS.slice(0, 4)).map(([nome, g]) => `<div class="grupo"><h4>${nome}</h4>${ATRIBUTOS.map((a, k) => a.grupo !== g ? "" : `<div class="${(PESOS[POSICOES[p].papel] || {})[a.k] ? "conta" : ""}"><span>${a.nome}</span><span>${j.at[k]}</span></div>`).join("")}</div>`).join("")}
          <div class="mut" style="column-span:all;font-size:12px;margin-top:4px">Em destaque, os atributos que contam para ${sg(p)}. Experiência ${Math.round(experienciaDe(j))} de 100: quanto mais alta, menos ele oscila de um jogo para o outro.</div></div>` : ""}`; }).join("")}
    ${sel ? `<div class="item" data-escolhe=""><span class="mut">Deixar vazio</span></div>` : ""}</div>`;
}

function escolher(id) {
  if (!sel) return;
  if (sel.tipo === "vaga") {
    const antes = E.jog[sel.i], outra = id ? E.jog.indexOf(id) : -1;
    if (outra >= 0) E.jog[outra] = antes; // troca de vaga entre dois titulares
    else if (id && E.banco.includes(id)) E.banco = E.banco.map(b => b === id ? antes : b).filter(Boolean); // vem do banco; quem saiu vai para lá
    E.jog[sel.i] = id || null;
  } else {
    const b = E.banco.slice(); while (b.length < 7) b.push(null);
    const vaga = id ? E.jog.indexOf(id) : -1;
    if (vaga >= 0) E.jog[vaga] = b[sel.i]; // titular vai para o banco; o reserva daquela vaga do banco assume o lugar dele
    for (let i = 0; i < 7; i++) if (b[i] === id) b[i] = null;
    b[sel.i] = id || null; E.banco = b.filter(Boolean);
  }
  sel = null; limparReferencias(); render();
}

function instrucoesParaOMotor() {
  const I = E.instr, conv = v => v === "true" ? true : v === "false" ? false : isNaN(+v) ? v : +v;
  return { ...I, substituicoes: E.subs.map(s => ({ ...s, min: +s.min })), ordens: E.ordens.map(o => { const [k, v] = o.muda.split(":"); return { min: +o.min, cond: o.cond, muda: { [k]: conv(v) } }; }) };
}

async function jogar() {
  const V = validar(); if (V.erros.length) return;
  const casa = $("mando").value === "casa", eu = casa ? 0 : 1;
  const online = adversarioOnline ? await adversarioOnline() : null;
  const adv = online ? online.elenco : gerarElenco(criarRng(8000 + +$("sementeAdv").value), { nivel: +$("nivelAdv").value, nomes, prefixoId: "a" });
  const nomeMeu = clubeOnline ? clubeOnline.nome : "Meu time", nomeAdv = online ? online.nome : "Bot";
  const minhaForca = V.esc11.reduce((s, x) => s + notaNaPosicao(x.j, x.pos), 0) / 11;
  const t = taticaBot(adv, { mandante: !casa, forcaAdversario: minhaForca, perfil: online ? online.perfil : null });
  const meu = prepararTime({ nome: nomeMeu, escalacao: V.esc11, banco: E.banco.map(jogDe), instrucoes: instrucoesParaOMotor(), mandante: casa });
  const bot = prepararTime({ nome: nomeAdv, escalacao: t.escalacao, banco: t.banco, instrucoes: t.instrucoes, mandante: !casa });
  const n = +(ler("mo_partidas") || 0) + 1; guardar("mo_partidas", n);
  const partida = casa ? simularPartida(criarRng(n), meu, bot) : simularPartida(criarRng(n), bot, meu);
  const nivel = +$("analista").value, r = montarRelatorio(partida, [nivel, nivel]);
  $("infoAdv").textContent = `${nomeAdv} (tática de bot): ${t.formacao}, nota média ${f1(t.forca)}. ${nomeMeu}: nota média ${f1(minhaForca)}.`;
  $("rel").innerHTML = htmlRelatorio(r, { nomes: casa ? [nomeMeu, nomeAdv] : [nomeAdv, nomeMeu], analistas: [eu] });
  if (online) $("rel").scrollIntoView({ behavior: "smooth", block: "start" });
  return { r, partida };
}

// no celular, as seções secundárias começam fechadas para a página não ficar comprida
if (window.matchMedia && matchMedia("(max-width:620px)").matches) raiz.querySelectorAll("details.dobra").forEach(d => d.removeAttribute("open"));

// arrastar e soltar, com mouse ou dedo: de uma vaga, do banco ou da lista para uma vaga ou para o banco
let arrasto = null, ignorarClique = false;
const fimDoArrasto = () => { if (arrasto && arrasto.fantasma) arrasto.fantasma.remove(); document.querySelectorAll(".alvo").forEach(x => x.classList.remove("alvo")); document.body.classList.remove("arrastando"); arrasto = null; };
const alvoEm = (x, y) => { const el = document.elementFromPoint(x, y); return el && el.closest("[data-vaga], [data-banco], [data-novapos]"); };
raiz.addEventListener("pointerdown", e => {
  const h = e.target.closest("[data-arrasta]");
  if (!h || !h.dataset.arrasta || e.target.closest("select, input, button") || (e.pointerType === "mouse" && e.button !== 0)) return;
  arrasto = { id: h.dataset.arrasta, x0: e.clientX, y0: e.clientY, fantasma: null };
});
window.addEventListener("pointermove", e => {
  if (!arrasto) return;
  if (!arrasto.fantasma) {
    if (Math.hypot(e.clientX - arrasto.x0, e.clientY - arrasto.y0) < 8) return;
    const f = arrasto.fantasma = document.createElement("div"), j = jogDe(arrasto.id);
    f.className = "fantasma"; f.textContent = `${sg(j.pos)} ${j.nome}`; document.body.appendChild(f); document.body.classList.add("arrastando");
    // titular de linha: aparecem as posições para onde a vaga dele pode ir
    const vaga = E.jog.indexOf(arrasto.id);
    if (vaga >= 0 && E.vagas[vaga] !== "GK") { arrasto.mapa = vaga; $("gramado").innerHTML = htmlGramado(vaga); }
  }
  arrasto.fantasma.style.transform = `translate(${e.clientX + 10}px, ${e.clientY + 10}px)`;
  document.querySelectorAll(".alvo").forEach(x => x.classList.remove("alvo"));
  const alvo = alvoEm(e.clientX, e.clientY); if (alvo) alvo.classList.add("alvo");
});
window.addEventListener("pointerup", e => {
  if (!arrasto) return;
  const { id, fantasma, mapa } = arrasto;
  const alvo = fantasma ? alvoEm(e.clientX, e.clientY) : null; // antes de desfazer as tiras, que saem do lugar ao redesenhar
  fimDoArrasto();
  if (!fantasma) return; // foi só um clique
  ignorarClique = true; setTimeout(() => { ignorarClique = false; }, 0);
  if (!alvo) { if (mapa !== undefined) render(); return; }
  if (alvo.dataset.novapos !== undefined) { E.vagas[mapa] = alvo.dataset.novapos; limparReferencias(); sel = null; return render(); }
  sel = alvo.dataset.vaga !== undefined ? { tipo: "vaga", i: +alvo.dataset.vaga } : { tipo: "banco", i: Math.min(+alvo.dataset.banco, E.banco.length) };
  escolher(id);
});
window.addEventListener("pointercancel", () => { const tinhaMapa = arrasto && arrasto.mapa !== undefined; fimDoArrasto(); if (tinhaMapa) render(); });

// eventos
raiz.addEventListener("click", e => {
  const t = e.target;
  if (ignorarClique || t.closest("select, input")) return;
  const d = k => { const el = t.closest(`[data-${k}]`); return el ? el.dataset[k] : undefined; };
  if (d("apaga") !== undefined) { const s = ler("mo_salvas_" + chaveElenco()) || {}; delete s[d("apaga")]; guardar("mo_salvas_" + chaveElenco(), s); return render(); }
  if (d("carrega") !== undefined) { const s = (ler("mo_salvas_" + chaveElenco()) || {})[d("carrega")]; if (s) { E = JSON.parse(JSON.stringify(s)); sel = null; render(); } return; }
  if (d("fechaescolha") !== undefined) { sel = null; return render(); }
  if (d("skills") !== undefined) { skillsDe = skillsDe === d("skills") ? null : d("skills"); return renderEscolha(); }
  if (d("escolhe") !== undefined) return escolher(d("escolhe"));
  if (d("vaga") !== undefined) { const i = +d("vaga"); sel = sel && sel.tipo === "vaga" && sel.i === i ? null : { tipo: "vaga", i }; return render(); }
  if (d("banco") !== undefined) { const i = +d("banco"); sel = sel && sel.tipo === "banco" && sel.i === i ? null : { tipo: "banco", i }; return render(); }
  if (d("tirasub") !== undefined) { E.subs.splice(+d("tirasub"), 1); return render(); }
  if (d("tiraordem") !== undefined) { E.ordens.splice(+d("tiraordem"), 1); return render(); }
});
raiz.addEventListener("change", e => {
  const t = e.target, ds = t.dataset, conv = v => v === "true" ? true : v === "false" ? false : isNaN(+v) || v === "" ? v : +v;
  if (ds.pos !== undefined) { E.vagas[+ds.pos] = t.value; limparReferencias(); return render(); }
  if (ds.instr) { E.instr[ds.instr] = conv(t.value); return render(); }
  if (ds.papel) { E.instr[ds.papel] = t.value || null; return render(); }
  if (ds.cob) { const l = E.instr.cobradores[ds.cob]; l[+ds.i] = t.value || null; E.instr.cobradores[ds.cob] = l.filter(Boolean).filter((v, i, a) => a.indexOf(v) === i); return render(); }
  if (ds.sub !== undefined) { E.subs[+ds.sub][ds.campo] = ds.campo === "min" ? +t.value : t.value; return render(); }
  if (ds.ordem !== undefined) { E.ordens[+ds.ordem][ds.campo] = ds.campo === "min" ? +t.value : t.value; return render(); }
});
$("maisSub").onclick = () => { const tit = titulares(), usados = new Set(E.subs.map(s => s.entra)), livre = E.banco.find(id => !usados.has(id)) || E.banco[0]; const sai = tit.find(j => E.vagas[E.jog.indexOf(j.id)] !== "GK"); if (sai && livre) { E.subs.push({ min: 60, sai: sai.id, entra: livre, cond: "sempre" }); render(); } };
$("maisOrdem").onclick = () => { E.ordens.push({ min: 70, cond: "perdendo", muda: "mentalidade:1" }); render(); };
$("salvar").onclick = () => { const n = $("nomeSalva").value.trim() || "Escalação " + (Object.keys(ler("mo_salvas_" + chaveElenco()) || {}).length + 1); const s = ler("mo_salvas_" + chaveElenco()) || {}; s[n] = JSON.parse(JSON.stringify(E)); guardar("mo_salvas_" + chaveElenco(), s); $("nomeSalva").value = ""; render(); };
$("auto").onclick = () => { const esc11 = escalar(elenco, E.vagas); E.jog = E.vagas.map(() => null); const livres = esc11.slice(); E.vagas.forEach((pos, i) => { const k = livres.findIndex(x => x.pos === pos); if (k >= 0) E.jog[i] = livres.splice(k, 1)[0].j.id; }); E.banco = E.banco.filter(id => !E.jog.includes(id)); limparReferencias(); render(); };
$("bot").onclick = () => { E = daTatica(taticaBot(elenco, { mandante: $("mando").value === "casa" })); sel = null; render(); };
$("formacao").onchange = () => { if ($("formacao").value) aplicarFormacao($("formacao").value); $("formacao").value = ""; };
["semente", "nivel", "perfil"].forEach(id => $(id).onchange = () => { if (!ONLINE) novoElenco(); });
$("jogar").onclick = jogar;

$("perfil").innerHTML = Object.entries(PERFIS).map(([k, p]) => `<option value="${k}">${p.nome}</option>`).join("");
$("formacao").innerHTML = `<option value="">escolher…</option>` + Object.keys(FORMACOES).map(k => `<option>${k}</option>`).join("");
if (ONLINE) await iniciarOnline(sessao); else novoElenco();
return { sujo: () => !!E && salvoComo !== null && JSON.stringify(E) !== salvoComo, iniciarOnline, estado: () => E, elenco: () => elenco, jogar, validar, escolher, selecionar: s => { sel = s; render(); }, aplicarFormacao, render };
}
