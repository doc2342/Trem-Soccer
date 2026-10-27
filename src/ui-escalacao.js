// Tela de escalação e tática. Montada dentro de um elemento: na página escalacao.html (sozinha) e em Clube, Tática, de jogo.html.
// online: usa o elenco e a tática do clube no banco; sessao: { user } de quem está logado; cabecalho: desenha o topo com as abas (só na página sozinha).
import { criarRng } from "./rng.js";
import { experienciaDe, nivelDoAnalista, saudeDoClube } from "./saude.js";
import { ATRIBUTOS, PESOS, POSICOES, LISTA_POSICOES, IDX, FAMILIARIDADE, NOME_FAMILIARIDADE, notaNaPosicao, familiaridade, NOME_DO_PE, peNaPosicao } from "./modelo.js";
import { gerarElenco, PERFIS } from "./gerador.js";
import { FORMACOES, escalar, notaDoMomento, TAMANHO_DO_BANCO } from "./escalacao.js";
import { foraDaCopa, foraDoContinental, climaDaPartida, efeitoDoClima, jogoGrande, taticaDoAmistoso } from "./rodada.js";
import { prepararTime, simularPartida, entrosamento, setorDaPosicao, avaliarZonas, COBERTURA, ZONAS, CONFIG } from "./motor.js";
import { taticaBot } from "./bot.js";
import { montarRelatorio } from "./relatorio.js";
import { htmlRelatorio } from "./ui-relatorio.js";
import { sg, pp, corDoSetor, filasDoCampo, TIRAS } from "./siglas.js";
import { SEDES, sedeDoJogo, chaveDaFinal, configDaSede, desenharEstadio } from "./estadio.js";
import { rotulo, ALTURA_DA_FAIXA } from "./ui-trem.js";
import { svgCamisa, numerosDaCamisa } from "./camisa.js";

const NOVO = typeof document !== "undefined" && document.documentElement.dataset.visual === "novo"; // visual novo (mo_visual): prévia vira faixa de foco, instruções em botões

const HTML = `  <div id="cabecalho"></div>
  <h1 class="soLocal">Escalação e tática</h1>
  <div class="mut soLocal">Monte o time nas 18 posições, escolha as instruções e jogue contra um clube comandado pelo bot.</div>

  <div class="card" id="online" hidden>
    <div class="row" style="align-items:center"><h2 style="margin:0">Escalação e tática</h2><b id="nomeOnline" hidden></b><button id="salvarOnline" style="margin-left:auto">Salvar para o próximo jogo</button></div>
    <div id="avisoOnline" class="mut" style="margin-top:6px"></div>
    <div class="mut soNovoNao" style="margin-top:4px">Para testar a tática, salve e jogue um amistoso na página do clube.</div>
  </div>
  <div class="card" id="previa" hidden></div>
  <div class="card row">
    <label class="soLocal">Elenco (semente)<input id="semente" type="number" value="1" style="width:90px"></label>
    <label class="soLocal">Nível<input id="nivel" type="number" min="15" max="42" value="30" style="width:80px"></label>
    <label class="soLocal">Perfil<select id="perfil"></select></label>
    <label>Formação pronta<select id="formacao"></select></label>
    <button class="sec" id="auto">Escalar os melhores</button>
    <button class="sec" id="bot">Deixar o assistente escolher</button>
    <span class="row" style="margin-left:auto"><input id="nomeSalva" placeholder="Nome da escalação" style="width:150px"><button class="sec" id="salvar">Salvar</button></span>
    <div class="chips" id="salvas" style="flex-basis:100%"></div>
  </div>

  <div class="duas">
    <div>
      <div class="card"><h2>Time <span class="tag" title="Arraste um jogador para uma vaga ou para o banco, ou clique na vaga para escolher. Arrastando um titular aparecem as outras posições: solte numa delas para mudar a posição dele.">arraste ou clique na vaga</span></h2><div class="gramado" id="gramado"></div>
        <h2 style="margin-top:12px">Banco <span class="tag">até ${TAMANHO_DO_BANCO}</span></h2><div class="chips" id="banco"></div>
        <div id="validacao" style="margin-top:10px"></div></div>
      <div class="card"><h2>Instruções</h2><div class="row" id="instrucoes"></div></div>
      <div class="card"><h2>Mapa do time <span class="tag" title="Força do time em cada zona do campo, com os jogadores e a mentalidade escolhidos. Mais claro = mais gente e mais qualidade ali.">força por zona</span></h2><div id="minimapa"></div></div>
      <details class="card dobra" open><summary><h2>Ordens condicionais <span class="tag" id="nOrdens"></span></h2></summary><div id="ordens"></div><button class="sec" id="maisOrdem">Adicionar ordem</button></details>
    </div>
    <div>
      <div class="card" id="escolha"></div>
      <details class="card dobra" open><summary><h2>Capitão, armador e cobradores <span class="tag" id="nPapeis"></span></h2></summary><div id="papeis"></div></details>
      <details class="card dobra" open><summary><h2>Substituições <span class="tag" id="nSubs"></span></h2></summary><div id="subs"></div><button class="sec" id="maisSub">Adicionar substituição</button></details>
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

// visual novo: o adversário numa faixa curta em cima; embaixo, a tática inteira num bloco só (campo, banco, instruções, papéis, substituições, ordens e o salvar)
const HTML_NOVO = `<div id="cabecalho"></div>
  <div id="online" hidden><b id="nomeOnline" hidden></b></div>
  <section id="previa" class="t-faixa t-sangra t-tatica-adv" hidden></section>
  <section class="t-faixa t-tatica">
    <div class="t-tatica-time"><div class="t-tatica-cab"><div class="t-rotulo" id="rotTatica">Tática</div><div class="t-tatica-forca" id="forcaCampo"></div></div>
      <div class="t-tatica-grade"><div class="gramado" id="gramado"></div><div class="t-banco"><div class="t-numero-rotulo" id="nBanco">Banco</div><div id="banco"></div></div></div></div>
    <div class="t-tatica-lado"><div class="t-rotulo">Elenco e formação</div>
      <div class="t-tatica-montar"><div class="t-formacoes" id="formacao"></div>
        <div class="t-tatica-botoes"><button type="button" class="t-botao" id="auto">Escalar os melhores</button><button type="button" class="t-botao" id="bot">Deixar o assistente escolher</button></div></div>
      <div id="escolha"></div>
      <div class="t-tatica-salvas"><input id="nomeSalva" placeholder="Guardar esta escalação como…"><button type="button" class="t-botao" id="salvar">Guardar</button></div><div class="chips" id="salvas"></div>
      <div class="t-tatica-fim"><div id="validacao"></div><div class="t-tatica-acao"><span id="avisoOnline"></span><span class="t-tatica-prazo" id="prazoTatica"></span><button id="salvarOnline" class="t-botao t-botao-principal">Salvar para o próximo jogo</button></div></div></div>
    <div class="t-tatica-baixo" id="instrucoes"></div>
    <div class="t-tatica-baixo t-tatica-extras">
      <section><div class="t-rotulo">Capitão e cobradores <span id="nPapeis"></span></div><div id="papeis"></div></section>
      <section><div class="t-rotulo">Substituições <span id="nSubs"></span></div><div id="subs"></div><button class="sec" id="maisSub">Adicionar substituição</button></section>
      <section><div class="t-rotulo">Ordens condicionais <span id="nOrdens"></span></div><div id="ordens"></div><button class="sec" id="maisOrdem">Adicionar ordem</button></section>
    </div>
  </section>
  <div class="soLocal t-tatica-local"><label>Elenco (semente)<input id="semente" type="number" value="1" style="width:90px"></label><label>Nível<input id="nivel" type="number" min="15" max="42" value="30" style="width:80px"></label><label>Perfil<select id="perfil"></select></label></div>
  <div class="card row soLocal">
    <label class="soLocal">Nível do adversário<input id="nivelAdv" type="number" min="15" max="42" value="30" style="width:90px"></label>
    <label class="soLocal">Elenco do adversário<input id="sementeAdv" type="number" value="7" style="width:90px"></label>
    <label id="rotuloAdv" hidden>Adversário<select id="advOnline"></select></label>
    <label>Mando<select id="mando"><option value="casa">Jogo em casa</option><option value="fora">Jogo fora</option></select></label>
    <label>Analista<select id="analista"><option value="1">Nível 1</option><option value="2">Nível 2</option><option value="3" selected>Nível 3</option></select></label>
    <button id="jogar">Jogar amistoso</button><span class="mut" id="infoAdv"></span>
  </div>
  <div id="rel"></div>`;
// instruções na faixa, todas abertas, em três grupos lado a lado; embaixo, o rodapé com os avisos e o salvar. Rótulos longos encurtam no botão (o inteiro fica no title)
const GRUPOS_INSTR = [["Postura", ["mentalidade", "pressao", "agressividade"]], ["Com a bola", ["passe", "finalizar", "cruzamento", "lado"]], ["Estratégia", ["contraAtaque", "impedimento", "cera"]]];
const CURTO = { "Muito defensiva": "Muito def.", "Muito ofensiva": "Muito of.", "Os dois lados": "Dois lados", "Sem pressão": "Sem", "Trabalhar até a área": "Até a área", "Resolver rápido (chute de fora e cruzamento)": "Rápido" };

export async function montarEscalacao(raiz, { online = false, sessao = null, cabecalho = true } = {}) {
raiz.innerHTML = NOVO ? HTML_NOVO : HTML;

const $ = id => raiz.querySelector("#" + id);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const f1 = v => v.toFixed(1).replace(".", ",");
const nomes = online ? null : await (await fetch("./dados/nomes.json")).json(); // só o modo local gera elencos
const guardar = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };
const ler = k => { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } };

const INSTR = { mentalidade: 0, pressao: 0, agressividade: 0, passe: "misto", finalizar: "misto", cruzamento: "misto", lado: "misto", contraAtaque: false, impedimento: false, cera: false, capitao: null, vice: null, armador: null, alvo: null, cobradores: { escanteio: [], falta: [], penalti: [] } };
const OPCOES = {
  mentalidade: ["Mentalidade", [[-2, "Muito defensiva"], [-1, "Defensiva"], [0, "Normal"], [1, "Ofensiva"], [2, "Muito ofensiva"]]],
  pressao: ["Pressão", [[0, "Sem pressão"], [1, "Média"], [2, "Alta"]]],
  agressividade: ["Agressividade", [[-2, "Muito baixa"], [-1, "Baixa"], [0, "Normal"], [1, "Alta"], [2, "Muito alta"]]],
  passe: ["Passe", [["curto", "Curto"], ["misto", "Misto"], ["longo", "Bola longa"]]], // o neutro fica no meio
  finalizar: ["Finalização", [["longe", "Resolver rápido (chute de fora e cruzamento)"], ["misto", "Misto"], ["area", "Trabalhar até a área"]]],
  cruzamento: ["Cruzamentos", [["alto", "Altos (cabeceio)"], ["misto", "Misto"], ["rasteiro", "Rasteiros"]]],
  lado: ["Lado do ataque", [["misto", "Livre"], ["E", "Esquerda"], ["C", "Centro"], ["D", "Direita"], ["lados", "Os dois lados"]]],
  contraAtaque: ["Contra-ataque", [[false, "Não"], [true, "Sim"]]],
  impedimento: ["Linha de impedimento", [[false, "Não"], [true, "Sim"]]],
  cera: ["Cera quando estiver ganhando", [[false, "Não"], [true, "Sim"]]],
};
const CONDICOES = [["sempre", "sempre"], ["ganhando", "se estiver ganhando"], ["empatando", "se estiver empatando"], ["perdendo", "se estiver perdendo"], ["umAMenos", "se estiver com um a menos"], ["umAMais", "se estiver com um a mais"]];
const CONDICOES_SUB = [...CONDICOES, ["cansado", "se ele estiver cansado"], ["amarelo", "se ele tiver amarelo"], ["mal", "só se ele estiver jogando mal"], ["naoBem", "a não ser que ele esteja jogando bem"]];
const MUDANCAS = [["mentalidade:2", "Mentalidade muito ofensiva"], ["mentalidade:1", "Mentalidade ofensiva"], ["mentalidade:0", "Mentalidade normal"], ["mentalidade:-1", "Mentalidade defensiva"], ["mentalidade:-2", "Mentalidade muito defensiva"],
  ["pressao:2", "Pressão alta"], ["pressao:1", "Pressão média"], ["pressao:0", "Sem pressão"], ["contraAtaque:true", "Ligar o contra-ataque"], ["contraAtaque:false", "Desligar o contra-ataque"], ["cera:true", "Fazer cera (se estiver ganhando)"], ["cera:false", "Parar a cera"], ["passe:longo", "Bola longa"], ["passe:curto", "Passe curto"], ["finalizar:longe", "Resolver rápido"], ["finalizar:area", "Trabalhar até a área"], ["cruzamento:alto", "Cruzamentos altos"], ["cruzamento:rasteiro", "Cruzamentos rasteiros"]];
const LINHAS = ["ataque", "meia", "meio", "volante", "ala", "defesa", "gol"], ORDEM_LADO = { E: 0, C: 1, D: 2 };
// papéis e cobradores: chave → [rótulo, só jogador de linha?, quantos]
const PAPEIS = { capitao: ["Capitão", false, 1], vice: ["Vice", false, 1], armador: ["Armador", true, 1], alvo: ["Homem-alvo", true, 1], escanteio: ["Escanteios", true, 3], falta: ["Faltas", true, 3], penalti: ["Pênaltis", true, 5] };
const ehCobranca = k => k in INSTR.cobradores;
// nome de campo, como no Brasil: o primeiro nome; se outro da lista (o elenco) tiver o mesmo, primeiro e último
const curto = (j, lista = elenco) => { if (!j) return ""; const n = j.nome.split(" "), p = n[0]; return n.length > 1 && lista.some(o => o.id !== j.id && o.nome.split(" ")[0] === p) ? `${p} ${n[n.length - 1]}` : p; };
const NOME_ZONA = { DE: "defesa esquerda", DC: "centro da defesa", DD: "defesa direita", ME: "meio esquerdo", MC: "centro do meio", MD: "meio direito", AE: "ataque pela esquerda", AC: "centro do ataque", AD: "ataque pela direita" };

// Libertadores e Sul-Americana (rodada.js): tiram do jogo a lesão e a suspensão continental; a da liga e a da copa não valem.
// Na Recopa (grupo "REC") só a lesão.
const paraALib = (lista, jogo) => lista.map(j => {
  if (j.fora > 0 && j.motivo === "lesão") return j;
  if (jogo.grupo === "REC" || !foraDoContinental(j)) return j.fora > 0 ? { ...j, fora: 0, motivo: null } : j;
  return { ...j, fora: j.foraLib, motivo: "suspensão continental" };
});
let prazoDaTatica = null; // visual novo: hora em que a tática fecha (início do jogo menos o prazo da liga)
setInterval(() => { const el = $("prazoTatica"); if (!el || prazoDaTatica == null) return; const ms = prazoDaTatica - Date.now(), z = n => String(n).padStart(2, "0");
  const d = Math.floor(ms / 864e5), h = Math.floor(ms / 36e5) % 24, mi = Math.floor(ms / 6e4) % 60, se = Math.floor(ms / 1e3) % 60;
  el.innerHTML = ms <= 0 ? "Tática fechada" : `Fecha em <b>${d ? `${d}d ${h}h ${z(mi)}min` : `${z(h)}:${z(mi)}:${z(se)}`}</b>`; el.classList.toggle("t-urgente", ms < 36e5); }, 1000);
let elenco = [], porId = {}, E = null, sel = null, clubeOnline = null, adversarioOnline = null, proximoJogo = null;
// elenco visto pela copa: "fora" passa a ser a indisponibilidade na copa, com o motivo certo
const paraACopa = (lista, clubeId) => lista.map(j => {
  const lesionado = j.fora > 0 && j.motivo === "lesão";
  if (lesionado) return j;
  if (!foraDaCopa(j, clubeId)) return { ...j, fora: 0, motivo: null };
  return { ...j, fora: j.foraCopa > 0 ? j.foraCopa : 1, motivo: j.foraCopa > 0 ? "suspensão na copa" : "jogou a copa por outro clube" };
});
const ONLINE = online; // online: a tela usa o elenco e a tática do clube no banco
const chaveElenco = () => ONLINE ? "online_" + (clubeOnline ? clubeOnline.id : 0) : `${$("semente").value}_${$("nivel").value}_${$("perfil").value}`;
const jogDe = id => porId[id] || null;
const momento = v => { const n = v == null ? 50 : v; return n >= 65 ? "ok" : n <= 35 ? "bad" : ""; }; // cor da forma e da moral
const GRUPOS = [["Técnica", "tec"], ["Defesa", "def"], ["Físico", "fis"], ["Mental", "men"], ["Goleiro", "gol"]];
let skillsDe = null; // jogador com os atributos abertos na lista de escolha
let editaSub = null, editaOrdem = null; // índice da substituição/ordem aberta para edição (as outras aparecem numa linha só)
let setorVisto = null; // visual novo: o setor escolhido na lista do elenco
let salvoComo = null; // a tática como foi lida ou salva pela última vez, para saber se há mudança sem salvar
let tirados = []; // quem a tática salva escalava mas está fora do próximo jogo: { j, i (vaga) ou null (banco) }
const motivoCurto = j => j.motivo === "lesão" ? "lesionado" : /suspens/.test(j.motivo || "") ? "suspenso" : "fora deste jogo";
const escalacaoAtual = () => E.vagas.map((pos, i) => jogDe(E.jog[i]) ? { j: jogDe(E.jog[i]), pos } : null).filter(Boolean);
const titulares = () => E.jog.filter(Boolean).map(jogDe).filter(Boolean);
// visual novo: a camisa do clube, de costas e com o número, no lugar da bolinha; o goleiro com uma camisa própria
const CAMISAS = NOVO;
const GOLEIRO = { padrao: "liso", cor1: "#2b2f36", cor2: "#f0c35a" };
let numeros = new Map();
const numerar = () => { const l = j => ({ nome: j.nome, pos: j.pos, numero: j.numero });
  numeros = numerosDaCamisa({ titulares: escalacaoAtual().map(x => ({ ...l(x.j), pos: x.pos })), banco: E.banco.map(jogDe).filter(Boolean).map(l) }); };
const camisa = (j, pos) => svgCamisa(pos === "GK" ? GOLEIRO : (clubeOnline && clubeOnline.uniforme) || {}, 44, false, { numero: numeros.get(j.nome) || "" });
// a prévia do adversário compara o onze deles com o seu; render() refaz essa parte a cada mudança na escalação
let forcaAdv = null;
const forcaMinha = () => { const l = escalacaoAtual(); return l.length ? l.reduce((s, x) => s + notaNaPosicao(x.j, x.pos), 0) / l.length : 0; };
const comparaOnze = () => { const minha = forcaMinha();
  return `· o seu onze de agora: ${f1(minha)} (${minha >= forcaAdv + 0.5 ? "você é mais forte" : minha <= forcaAdv - 0.5 ? "eles são mais fortes" : "times parelhos"})`; };

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
// Prévia do próximo adversário, feita pelo analista do clube. Quanto maior a skill dele, mais a prévia mostra:
// qualquer analista dá a formação provável e a força do onze; com skill 20, o estilo de jogo; com 35, como enfrentar.
// O adversário comandado por bot é previsto com o mesmo código que o bot usa; o de dirigente pode jogar diferente.
// final em sede real: o 3D da sede embaixo da prévia (uma cena só; a anterior é destruída)
let cenaDaSede = null;
function sedeNaPrevia() {
  const jogo = proximoJogo, el = $("previa"), a = el && el.querySelector('a[href^="sede.html"]'); if (cenaDaSede) { cenaDaSede.destruir(); cenaDaSede = null; }
  if (!jogo || !a) return;
  const d = document.createElement("div"); d.style.cssText = "height:240px;border-radius:8px;overflow:hidden;margin-top:8px"; el.appendChild(d);
  desenharEstadio(d, configDaSede(new URLSearchParams(a.search).get("s"), chaveDaFinal(jogo))).then(v => { cenaDaSede = v; }).catch(() => d.remove());
}
// visual novo: a prévia abre a aba como faixa de foco (adversário, como enfrentar, seu onze × o deles); o resto vai para o relatório dobrável
const ladoDoDuelo = () => { const m = forcaMinha(); return forcaAdv == null ? "" : m >= forcaAdv + 0.5 ? "mais forte" : m <= forcaAdv - 0.5 ? "mais fraco" : "parelho"; };
const faixaDaTatica = ({ rot, adv, formacao, dica, clima, semAnalista, pendurados }) => `<div><div class="t-rotulo">Próximo adversário · ${esc(rot)}</div>
  <h3 class="t-adv-nome">${esc(adv.nome)} <span>${formacao ? `${formacao} provável` : adv.dono ? "comandado por dirigente" : "comandado pelo bot"}</span></h3>
  <p class="t-adv-frase">${dica ? `<b>Como enfrentar:</b> ${esc(dica)}.` : semAnalista ? "<b>Sem analista,</b> você só conhece o time do último jogo." : "Nada no jeito deles pede uma resposta especial."}</p>${pendurados || ""}</div>
  <div class="t-duelo"><div class="t-numero"><div class="t-numero-rotulo">Seu onze</div><div class="t-numero-valor" id="nossoOnze">${f1(forcaMinha())}</div><div class="t-numero-legenda" id="nossoOnzeLeg">${ladoDoDuelo()}</div></div>
    ${forcaAdv == null ? "" : `<div class="t-numero"><div class="t-numero-rotulo">O deles</div><div class="t-numero-valor">${f1(forcaAdv)}</div><div class="t-numero-legenda">nota média do onze</div></div>`}
    <div class="t-numero"><div class="t-numero-rotulo">Tempo</div><div class="t-duelo-tempo">${esc(clima.nome)}, ${clima.temp} °C</div><div class="t-numero-legenda">${esc(efeitoDoClima(clima) || "")}</div></div></div>`;
// visual novo: a nota do seu onze também em cima do campo, onde se mexe no time
const mostrarForca = () => { if ($("forcaCampo")) $("forcaCampo").innerHTML = `<span>Seu onze</span><b>${f1(forcaMinha())}</b>`; };
// relatório em três colunas para bater o olho: quem joga, como jogam, como enfrentar
const relatorioNovo = ({ onze, obs, formacao, tracos, deOnde, dicas, fonte }) => `<div class="t-rel">
  <div><div class="t-numero-rotulo">Time provável · ${formacao}${obs && obs.jogos > 1 ? ` · últimos ${obs.jogos} jogos` : ""}</div><ol class="t-rel-onze">${onze.map(v => `<li><span class="t-bola ${corDoSetor(v.pos)}">${sg(v.pos)}</span><span class="t-rel-nome" title="${esc(v.j.nome)}">${esc(curto(v.j, onze.map(x => x.j)))}</span><b>${f1(notaNaPosicao(v.j, v.pos))}</b><em>${v.substituto ? "subst." : obs && v.vezes < v.de ? `${v.vezes}/${v.de}` : ""}</em></li>`).join("")}</ol>
    ${obs ? "" : `<div class="t-rel-pe">O que o bot escalaria: eles ainda não jogaram.</div>`}</div>
  <div><div class="t-numero-rotulo">Como jogam${deOnde ? ` · ${esc(deOnde)}` : ""}</div>${tracos ? `<dl class="t-rel-tracos">${tracos.map(([r, v, n]) => `<div><dt>${r}</dt><dd><b>${esc(v)}</b>${n ? `<span>${esc(n)}</span>` : ""}</dd></div>`).join("")}</dl>` : `<div class="t-rel-pe">O analista ainda não lê o estilo (precisa de skill 20).</div>`}</div>
  <div><div class="t-numero-rotulo">Como enfrentar</div>${dicas ? (dicas.length ? `<ul class="t-rel-dicas">${dicas.map(d => `<li>${esc(d[0].toUpperCase() + d.slice(1))}.</li>`).join("")}</ul>` : `<div class="t-rel-pe">Nada no jeito deles pede uma resposta especial: jogue o seu jogo.</div>`) : `<div class="t-rel-pe">O analista ainda não diz como enfrentar (precisa de skill 35).</div>`}</div>
  <div class="t-rel-fonte">${fonte}</div></div>`;
const relatorioDobrado = corpo => `<details class="t-dobra"><summary>${rotulo("Relatório do analista")}</summary><div class="t-relatorio">${corpo}</div></details>`;
async function previaDoAdversario(B) {
  const el = $("previa"), comissao = await B.treinadoresDoClube(clubeOnline.id);
  if (comissao == null) return; // comissão técnica ainda não ligada no banco
  const analista = comissao.find(t => t.funcao === "analista");
  const jogo = proximoJogo, copa = B.ehCopa(jogo);
  el.hidden = false;
  if (!jogo) { el.innerHTML = NOVO ? `<div><div class="t-rotulo">Próximo adversário</div><p class="t-adv-frase">Nenhuma partida marcada.</p></div>` : `<h2>Próximo adversário</h2><div class="mut">Nenhuma partida marcada.</div>`; return; }
  const clima = climaDaPartida(jogo.id), emCasa = jogo.casa === clubeOnline.id, adv = await B.clubePorId(emCasa ? jogo.fora : jogo.casa);
  const dia = new Date(jogo.inicio).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
  // pendurados (liga): quem leva o próximo amarelo fica fora do jogo de liga seguinte a este
  const penduradosJ = copa ? [] : elenco.filter(j => j.amarelos >= 3 && !(j.fora > 0));
  let pendurados = "";
  if (penduradosJ.length) {
    const prox = ((await B.sb.from("partidas").select("id, rodada, fase, casa, fora, inicio").or(`casa.eq.${clubeOnline.id},fora.eq.${clubeOnline.id}`).eq("processada", false).order("inicio").limit(8)).data || [])
      .find(p => p.id !== jogo.id && !B.ehCopa(p) && new Date(p.inicio) > new Date(jogo.inicio));
    const advDepois = prox && await B.clubePorId(prox.casa === clubeOnline.id ? prox.fora : prox.casa).catch(() => null);
    pendurados = `<p class="t-adv-pendurados"><b>Pendurados:</b> ${penduradosJ.map(j => esc(curto(j))).join(", ")}. Com mais um amarelo, ${penduradosJ.length > 1 ? "ficam" : "fica"} fora ${advDepois ? `da rodada ${prox.rodada}, contra o ${esc(advDepois.nome)}` : "do jogo de liga seguinte"}.</p>`;
  }
  const sd = copa ? sedeDoJogo(jogo, await B.ligaAtual()) : null; // final em sede real (132_estadio_real.sql)
  const rot = `${copa ? (B.FASES_DA_COPA[jogo.copa_fase] || "Copa") + (jogo.fase === "lib" ? " · " + B.nomeDoGrupo(jogo.grupo) : "") : jogo.fase === "liga" ? "Rodada " + jogo.rodada : B.nomeDoPlayoff(jogo)} · ${dia} · ${sd ? SEDES[sd].nome : copa ? "campo neutro" : emCasa ? "em casa" : "fora"}`;
  const linhaDaSede = sd ? `<div><a href="sede.html?s=${sd}" style="color:var(--ac)">${SEDES[sd].nome}</a>, ${SEDES[sd].cidade} · ${SEDES[sd].lugares.toLocaleString("pt-BR")} lugares · público das duas torcidas, renda meio a meio</div>` : "";
  const topo = NOVO ? linhaDaSede : `<h2>Próximo adversário <span class="tag">${copa ? (B.FASES_DA_COPA[jogo.copa_fase] || "copa").toLowerCase() + (jogo.fase === "lib" ? " da " + B.nomeDoGrupo(jogo.grupo) : " da copa") : jogo.fase === "liga" ? "rodada " + jogo.rodada : B.nomeDoPlayoff(jogo).toLowerCase()} · ${dia} · ${sd ? `final no ${SEDES[sd].nome}` : copa ? "campo neutro" : emCasa ? "em casa" : "fora"}</span></h2>
    ${sd ? `<div><a href="sede.html?s=${sd}" style="color:var(--ac)">${SEDES[sd].nome}</a>, ${SEDES[sd].cidade} · ${SEDES[sd].lugares.toLocaleString("pt-BR")} lugares · público das duas torcidas, renda meio a meio</div>` : ""}
    <div><b>${esc(adv.nome)}</b> <span class="mut">· ${adv.dono ? "comandado por dirigente" : "comandado pelo bot"}</span></div>
    <div>Previsão do tempo: <b>${clima.nome.toLowerCase()}</b>, ${clima.temp} °C${efeitoDoClima(clima) ? ` <span class="aviso">· ${efeitoDoClima(clima)}</span>` : ""}</div>
    ${jogoGrande(jogo) ? `<div>Jogo grande: <span class="mut">jogador sem experiência oscila mais e rende até 3% menos.</span></div>` : ""}`;
  const elencoAdv = await B.elencoDoClube(adv.id), disponiveis = (jogo.fase === "lib" ? paraALib(elencoAdv, jogo) : copa ? paraACopa(elencoAdv, adv.id) : elencoAdv).filter(j => !(j.fora > 0));
  // o time que eles escalaram nos últimos jogos: 1 sem analista; 2 ou 3 com ele (nivelDoAnalista). Quem não pode jogar dá lugar a um substituto.
  const partidasAdv = jogo.liga_id ? await B.partidasDoClube(jogo.liga_id, adv.id) : null;
  const obs = partidasAdv ? B.escalacaoObservada(await B.escalacoesRecentes(partidasAdv, adv.id, nivelDoAnalista(analista && analista.skill)), disponiveis, notaNaPosicao) : null;
  const onzeVisto = obs ? `<div style="margin-top:6px">Time provável <span class="mut">(${obs.jogos === 1 ? "o do último jogo" : `quem mais jogou nos últimos ${obs.jogos} jogos`})</span>: ${obs.vagas.map(v => `${esc(v.j.nome)} <span class="mut">${sg(v.pos)}${v.substituto ? ", substituto" : obs.jogos > 1 ? ` ${v.vezes}/${v.de}` : ""}</span>`).join(" · ")}</div>` : "";
  if (!analista && NOVO) { el.innerHTML = faixaDaTatica({ rot, adv, clima, semAnalista: true, pendurados }) + relatorioDobrado(topo + onzeVisto); return; }
  if (!analista) { el.innerHTML = topo + onzeVisto + `<div class="aviso" style="margin-top:6px">Sem analista, é só isso que você sabe${obs ? ": o time do último jogo" : ""}. Com um analista na comissão (Estruturas, Treinamento, "Ver candidatos"), a prévia acompanha 2 ou 3 jogos e mostra o estilo de jogo e como enfrentar.</div>`; return; }
  const t = taticaBot(disponiveis, { mandante: !emCasa && !copa, perfil: adv.perfil, chuva: clima.chuva }), I = t.instrucoes, sk = analista.skill || 0;
  const onze = obs ? obs.vagas : t.escalacao;
  const conta = linhas => onze.filter(x => linhas.includes(POSICOES[x.pos].linha)).length;
  const media = lista => lista.length ? lista.reduce((s, x) => s + notaNaPosicao(x.j, x.pos), 0) / lista.length : 0;
  forcaAdv = media(onze); const forca = forcaAdv;
  const formacao = `${conta(["defesa", "ala"])}-${conta(["volante", "meio", "meia"])}-${conta(["ataque"])}`; let dica = null, dicas = null, tracos = null, deOnde = "";
  let h = topo + `<div style="margin-top:6px">Formação provável: <b>${conta(["defesa", "ala"])}-${conta(["volante", "meio", "meia"])}-${conta(["ataque"])}</b> <span class="mut">(${onze.map(x => sg(x.pos)).join(" · ")})</span></div>${onzeVisto}
    <div>Nota média do onze deles: <b class="nota">${f1(forca)}</b> <span class="mut" id="comparaOnze">${comparaOnze()}</span></div>`;
  // estilo: o que eles mostraram nos mesmos jogos (relatório público e narração); sem jogos ainda, o que o bot faria com esse elenco
  const est = sk >= 20 && partidasAdv ? await B.estiloObservado(partidasAdv, adv.id, nivelDoAnalista(sk)).catch(() => null) : null;
  if (est) {
    const L = B.LIMITES_DO_ESTILO, f = x => x.toLocaleString("pt-BR", { maximumFractionDigits: 1 }), { E, D } = est.corredor;
    const ladoForte = E > D * L.lado ? "esquerda" : D > E * L.lado ? "direita" : null, longa = est.lancamentos >= L.lancamentos;
    deOnde = est.jogos === 1 ? "no último jogo" : `por jogo, nos últimos ${est.jogos}`;
    tracos = [["Posse", f(est.posse) + "%", est.posse >= L.posse[1] ? "gosta da bola" : est.posse <= L.posse[0] ? "abre mão da bola" : ""],
      ["Finalizações", f(est.finalizacoes), est.finalizacoes >= L.finalizacoes[1] ? "ataca muito" : est.finalizacoes <= L.finalizacoes[0] ? "cria pouco" : ""],
      ["Contra-ataques", f(est.contra), est.contra >= L.contra ? "joga no contra-ataque" : ""],
      ["Faltas", f(est.faltas), est.faltas >= L.faltas[1] ? "marca duro" : est.faltas <= L.faltas[0] ? "marca leve" : ""],
      ["Ataca pela", ladoForte || "os dois lados", ""], ...(longa ? [["Saída", "bola longa", "desde a defesa"]] : [])];
    const frases = [
      `posse de <b>${f(est.posse)}%</b>${est.posse >= L.posse[1] ? " (gosta de ficar com a bola)" : est.posse <= L.posse[0] ? " (abre mão da bola)" : ""}`,
      `<b>${f(est.finalizacoes)}</b> finalizações por jogo${est.finalizacoes >= L.finalizacoes[1] ? " (ataca muito)" : est.finalizacoes <= L.finalizacoes[0] ? " (cria pouco)" : ""}`,
      `<b>${f(est.contra)}</b> contra-ataques por jogo${est.contra >= L.contra ? " (<b>joga no contra-ataque</b>)" : ""}`,
      `<b>${f(est.faltas)}</b> faltas por jogo${est.faltas >= L.faltas[1] ? " (marca duro)" : est.faltas <= L.faltas[0] ? " (marca leve)" : ""}`,
      ladoForte ? `ataca mais pela <b>${ladoForte}</b>` : "ataca pelos dois lados", ...(longa ? ["usa a <b>bola longa</b> desde a defesa"] : [])];
    h += `<div>${est.jogos === 1 ? "No último jogo" : `Nos últimos ${est.jogos} jogos`}: ${frases.join(" · ")}</div>`;
    if (sk >= 35) {
      dicas = [];
      if (est.contra >= L.contra) dicas.push("eles jogam no contra-ataque: mentalidade muito ofensiva é arriscada, e a linha de impedimento também");
      if (longa) dicas.push("a linha de impedimento atrapalha a bola longa deles");
      if (est.posse <= L.posse[0] && est.finalizacoes <= L.finalizacoes[0]) dicas.push("contra retranca, resolva rápido (chute de fora) ou cruze alto: a área lotada não deixa o passe curto entrar, e trabalhar até a área rende pouco");
      if (est.finalizacoes >= L.finalizacoes[1]) dicas.push("time que ataca muito deixa espaço atrás: o contra-ataque e a bola trabalhada até a área rendem mais");
      if (ladoForte) dicas.push(`o ataque deles cai mais pela ${ladoForte}: é o seu lado ${ladoForte === "esquerda" ? "direito" : "esquerdo"} que vai ser mais exigido`);
      if (est.faltas >= L.faltas[1]) dicas.push("eles fazem muita falta: bola parada pode decidir");
      dica = dicas[0] || null;
      h += `<div style="margin-top:4px">💡 ${dicas.length ? "Como enfrentar: " + dicas.join("; ") + "." : "Nada no jeito deles pede uma resposta especial: jogue o seu jogo."}</div>`;
    }
  } else {
    if (sk >= 20) { deOnde = "o que o bot faria com esse elenco"; tracos = [["Pressão", ["baixa", "média", "alta"][I.pressao] || "média", ""], ["Passe", { curto: "curto", longo: "longo", misto: "misto" }[I.passe] || "misto", ""], ["Mentalidade", I.mentalidade > 0 ? "ofensiva" : I.mentalidade < 0 ? "defensiva" : "normal", ""], ...(I.contraAtaque ? [["Contra-ataque", "sim", ""]] : []), ...(I.impedimento ? [["Impedimento", "faz a linha", ""]] : [])]; }
    if (sk >= 20) h += `<div>Estilo provável: pressão <b>${["baixa", "média", "alta"][I.pressao] || "média"}</b> · passe <b>${{ curto: "curto", longo: "longo", misto: "misto" }[I.passe] || "misto"}</b> · mentalidade <b>${I.mentalidade > 0 ? "ofensiva" : I.mentalidade < 0 ? "defensiva" : "normal"}</b>${I.contraAtaque ? " · joga no <b>contra-ataque</b>" : ""}${I.impedimento ? " · faz <b>linha de impedimento</b>" : ""}</div>`;
    if (sk >= 35) {
      dicas = [];
      if (I.pressao >= 2) dicas.push("contra pressão alta, a bola longa rende mais e o passe curto sofre"); else if (I.pressao <= 0) dicas.push("sem pressão do outro lado, o passe curto funciona bem");
      if (I.passe === "longo") dicas.push("a linha de impedimento atrapalha a bola longa deles");
      if (I.mentalidade >= 2) dicas.push("time muito ofensivo deixa espaço para o contra-ataque");
      if (I.mentalidade < 0) dicas.push("contra retranca, resolva rápido (chute de fora) ou cruze alto: a área lotada não deixa o passe curto entrar, e trabalhar até a área rende pouco");
      if (I.mentalidade > 0) dicas.push("time ofensivo deixa a área livre: trabalhar a bola até a área rende mais");
      if (I.contraAtaque) dicas.push("eles jogam no contra-ataque: mentalidade muito ofensiva é arriscada, e a linha de impedimento também");
      dica = dicas[0] || null;
      h += `<div style="margin-top:4px">💡 ${dicas.length ? "Como enfrentar: " + dicas.join("; ") + "." : "Nada no estilo deles pede uma resposta especial: jogue o seu jogo."}</div>`;
    }
  }
  const fonte = `Prévia de ${esc(analista.nome)} (analista, skill ${sk})${sk < 20 ? "; com skill 20 ele aponta o estilo de jogo, e com 35 diz como enfrentar" : sk < 35 ? "; com skill 35 ele diz como enfrentar" : ""}. ${obs ? `A escalação${est ? " e o estilo são o que eles mostraram em campo" : " é a que eles usaram"}${sk < 25 ? "; com skill 25 ele acompanha 3 jogos" : ""}${est ? "" : "; o estilo ainda é o que o bot faria com esse elenco"}.` : adv.dono ? "Eles ainda não jogaram nesta temporada: é o que o bot faria com esse elenco, e o dirigente pode escalar e jogar diferente." : "Quem está suspenso ou lesionado já ficou de fora."}`;
  h += `<div class="mut" style="font-size:12px;margin-top:6px">${fonte}</div>`;
  if (NOVO) { el.innerHTML = faixaDaTatica({ rot, adv, formacao, dica, clima, pendurados }) + relatorioDobrado(relatorioNovo({ onze, obs, formacao, tracos, deOnde, dicas, fonte })); mostrarForca(); return; }
  el.innerHTML = h;
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
      <div class="card topo">${V.svgEscudo(clubeOnline.escudo, clubeOnline.sigla, 72)}${V.svgUniforme({ ...clubeOnline.uniforme, escudo: clubeOnline.escudo, sigla: clubeOnline.sigla }, 52)}
        <div><h2 style="margin:0;font-size:22px">${esc(clubeOnline.nome)}</h2>
          ${clubeOnline.dirigente ? `<div style="font-size:15px">${esc(clubeOnline.dirigente)}</div>` : ""}
          <div class="mut">${esc(ligaC.nome)} · temporada ${ligaC.temporada} · ${esc(B.nomeDoGrupo(clubeOnline.grupo))}</div></div>
        ${admin ? `<a href="admin.html" style="color:var(--ac);margin-left:auto">Administração</a>` : ""}</div>
      <div class="abas" id="abas">${[["inicio", "Central", "🏠"], ["clube", "Clube", "👥"], ["mercado", "Mercado", "🛒"], ["classificacao", "Competições", "🏆", "Compet."], ["estruturas", "Estruturas", "🏗️", "Obras"], ["config", "Ajustes", "⚙️"]]
        .map(([k, n, ic, curto]) => `<button class="aba ${k === "clube" ? "ativa" : ""}" data-aba="${k}" title="${n}"><span class="ai">${ic}</span><span class="at at-l">${n}</span><span class="at at-c">${curto || n}</span></button>`).join("")}</div>`;
    $("abas").onclick = e => {
      const b = e.target.closest("[data-aba]"); if (!b) return;
      try { localStorage.setItem("mo_aba", b.dataset.aba); } catch (err) {}
      location.href = "jogo.html";
    };
  } catch (e) { $("cabecalho").innerHTML = `<div class="row" style="margin-bottom:10px"><a href="jogo.html" style="color:var(--ac)">← Voltar ao clube</a></div>`; }
  // tudo de uma vez: em sequência eram oito idas ao banco antes de a tela aparecer
  const [todos, prox, [liga, clubes], salva, fechada] = await Promise.all([B.elencoDoClube(clubeOnline.id),
    B.sb.from("partidas").select("id, liga_id, grupo, rodada, fase, copa_fase, casa, fora, inicio").or(`casa.eq.${clubeOnline.id},fora.eq.${clubeOnline.id}`).eq("processada", false).order("inicio").limit(1).maybeSingle(),
    B.ligaAtual().then(l => Promise.all([l, B.clubesDaLiga(l.id)])), B.minhaTatica(clubeOnline.id), B.taticaFechada(clubeOnline.id)]);
  elenco = todos.filter(j => !j.juvenil); // juvenil não joga partida oficial
  // próximo jogo: se for de copa, quem está fora é quem não pode jogar a copa (lesão, suspensão da copa ou trava de clube);
  // a suspensão da liga não vale na copa
  proximoJogo = prox.data || null;
  // teste de tela (?simular na URL): sem jogo marcado, finge uma rodada de liga amanhã contra o último adversário. Só na tela, nada vai ao banco.
  if (!proximoJogo && new URLSearchParams(location.search).has("simular")) {
    const ult = (await B.sb.from("partidas").select("id, liga_id, rodada, casa, fora").or(`casa.eq.${clubeOnline.id},fora.eq.${clubeOnline.id}`).eq("processada", true).order("inicio", { ascending: false }).limit(1).maybeSingle()).data;
    if (ult) proximoJogo = { ...ult, id: ult.id + 1e6, fase: "liga", grupo: null, copa_fase: null, rodada: (ult.rodada || 0) + 1, casa: ult.fora, fora: ult.casa, inicio: new Date(Date.now() + 864e5).toISOString() };
  }
  if (proximoJogo) { const seg = liga && liga.prazo_escalacao_seg != null ? liga.prazo_escalacao_seg : 900; prazoDaTatica = new Date(proximoJogo.inicio).getTime() - seg * 1000; }
  if (proximoJogo && proximoJogo.fase === "copa") elenco = paraACopa(elenco, clubeOnline.id);
  if (proximoJogo && proximoJogo.fase === "lib") elenco = paraALib(elenco, proximoJogo);
  porId = Object.fromEntries(elenco.map(j => [j.id, j]));
  E = salva && salva.dados && salva.dados.vagas ? salva.dados : daTatica(taticaBot(elenco, { mandante: true }));
  salvoComo = JSON.stringify(E); tirados = [];
  limparReferencias(); // a tática salva pode citar quem já saiu do clube ou quem está fora do jogo
  const quando = d => new Date(d).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" });
  $("avisoOnline").innerHTML = fechada ? `<span class="aviso">A tática está fechada: há um jogo começando ou em cálculo. O que você salvar agora só vale depois dele.</span>`
    : salva ? `Tática salva em ${quando(salva.atualizada_em)}.` : "Você ainda não salvou uma tática: enquanto não salvar, seu time é escalado como se fosse um bot.";
  previaDoAdversario(B).then(sedeNaPrevia).catch(() => { $("previa").hidden = true; }); // sem esperar: a prévia aparece quando ficar pronta
  $("salvarOnline").onclick = async () => {
    const V = validar();
    if (V.erros.length) { $("avisoOnline").innerHTML = `<span class="bad">${esc(V.erros[0])}</span>`; return; }
    $("salvarOnline").disabled = true;
    try { await B.salvarTatica(clubeOnline.id, E); salvoComo = JSON.stringify(E); tirados = []; dispatchEvent(new Event("taticaSalva")); $("avisoOnline").innerHTML = `<span class="ok">Tática salva às ${new Date().toLocaleTimeString("pt-BR")}.</span>`; }
    catch (e) { $("avisoOnline").innerHTML = `<span class="bad">${/row-level security/.test(e.message) ? "Não deu para salvar: a tática está fechada para o jogo que vai começar." : esc(e.message)}</span>`; }
    $("salvarOnline").disabled = false;
  };
  // amistosos: contra qualquer clube da liga, quantas vezes quiser; o adversário com dirigente repete a escalação do último jogo oficial,
  // o bot joga com a tática de bot (taticaDoAmistoso), e nada fica gravado
  const outros = clubes.filter(c => c.id !== clubeOnline.id);
  $("rotuloAdv").hidden = false;
  $("advOnline").innerHTML = outros.map(c => `<option value="${c.id}">${esc(B.nomeDoGrupo(c.grupo))} · ${esc(c.nome)}${c.dono ? " (dirigente)" : ""}</option>`).join("");
  const mesmoGrupo = outros.find(c => c.grupo === clubeOnline.grupo); if (mesmoGrupo) $("advOnline").value = mesmoGrupo.id;
  const guardados = {}, observadas = {};
  adversarioOnline = async () => { const id = +$("advOnline").value, c = outros.find(x => x.id === id); guardados[id] = guardados[id] || await B.elencoDoClube(id);
    if (c.dono && !(id in observadas)) observadas[id] = B.escalacaoObservada(await B.escalacoesRecentes(await B.partidasDoClube(liga.id, id), id, 1), guardados[id], notaNaPosicao);
    return { elenco: guardados[id], nome: c.nome, perfil: c.perfil, observada: observadas[id] || null }; };
  sel = null; limparReferencias(); render();
}
function aplicarFormacao(nome) {
  const esc11 = escalar(elenco.filter(j => !(j.fora > 0)), FORMACOES[nome]);
  E.vagas = esc11.map(x => x.pos); E.jog = esc11.map(x => x.j.id);
  E.banco = E.banco.filter(id => !E.jog.includes(id));
  limparReferencias(); render();
}
// Tira das instruções quem saiu do time ou do banco.
function limparReferencias() {
  // quem saiu do clube (vendido, dispensado, comprado pela multa) some da escalação guardada: a vaga fica vazia e o banco encolhe.
  // Quem está fora do próximo jogo (lesão, suspensão, trava de copa) também sai: não dá para escalar; a vaga fica vazia e avisada
  E.jog = E.jog.map((id, i) => { if (id && porId[id] && porId[id].fora > 0) { tirados.push({ j: porId[id], i }); return null; } return id && porId[id] ? id : null; });
  E.banco = E.banco.filter(id => { if (porId[id] && porId[id].fora > 0) tirados.push({ j: porId[id], i: null }); return porId[id] && !(porId[id].fora > 0); });
  const emCampo = new Set(E.jog.filter(Boolean)), noBanco = new Set(E.banco);
  for (const k of ["capitao", "vice", "armador", "alvo"]) if (!emCampo.has(E.instr[k])) E.instr[k] = null;
  for (const k in E.instr.cobradores) E.instr.cobradores[k] = E.instr.cobradores[k].filter(id => emCampo.has(id));
  E.subs = E.subs.filter(s => emCampo.has(s.sai) && noBanco.has(s.entra));
}

// Titular fora da posição natural (Improvisado ×0,8, Competente ×0,93): quanto perde e quem do elenco (fora do onze) renderia mais ali.
function foraDePosicao(j, pos) {
  const fam = familiaridade(j, pos);
  if (fam === "N" || pos === "GK") return null;
  const nota = notaNaPosicao(j, pos), perda = nota / FAMILIARIDADE[fam] - nota, usados = new Set(E.jog);
  const melhor = elenco.filter(x => !usados.has(x.id) && !(x.fora > 0)).map(x => ({ x, n: notaDoMomento(x, pos) })).filter(o => o.n > notaDoMomento(j, pos)).sort((a, b) => b.n - a.n)[0];
  return { fam, perda, melhor: melhor && melhor.x, ganho: melhor ? notaNaPosicao(melhor.x, pos) : 0 };
}

function validar() {
  const esc11 = escalacaoAtual(), erros = [], avisos = [];
  if (esc11.length < 11 && !tirados.some(t => t.i !== null && !E.jog[t.i])) erros.push(`Faltam ${11 - esc11.length} jogadores no time.`);
  for (const t of tirados) if (t.i === null || !E.jog[t.i]) erros.unshift(`${t.j.nome} está ${motivoCurto(t.j)} e saiu ${t.i === null ? "do banco" : `do time: escolha quem joga de ${sg(E.vagas[t.i])}`}.`);
  const goleiros = E.vagas.filter(p => p === "GK").length;
  if (goleiros !== 1) erros.push(goleiros ? "O time só pode ter um goleiro." : "O time precisa de um goleiro.");
  const cob = Object.fromEntries(ZONAS.map(z => [z, 0]));
  esc11.forEach(x => { for (const [z, w] of Object.entries(COBERTURA[x.pos])) cob[z] += w; });
  for (const z of ["DE", "DC", "DD", "ME", "MC", "MD"]) if (cob[z] < 0.2) avisos.push(`Quase ninguém cobre: ${NOME_ZONA[z]}.`);
  if (cob.DC < 1) avisos.push("Centro da defesa com pouca gente: menos de dois zagueiros.");
  if (cob.AC < 0.5) avisos.push("Pouca presença na área: cruzamentos e bolas em profundidade ficam sem alvo.");
  // cruzamento escolhido sem quem o aproveite na área
  const naArea = esc11.filter(x => (COBERTURA[x.pos].AC || 0) > 0), melhorNaArea = f => Math.max(0, ...naArea.map(x => f(x.j.at)));
  if (E.instr.cruzamento === "alto" && melhorNaArea(at => (at[IDX.cab] + at[IDX.for]) / 2) < 25) avisos.push("Cruzamentos altos sem ninguém forte de cabeça na área.");
  if (E.instr.cruzamento === "rasteiro" && melhorNaArea(at => (at[IDX.fin] + at[IDX.vel]) / 2) < 25) avisos.push("Cruzamentos rasteiros sem ninguém rápido e bom de finalização na área.");
  if (cob.AE + cob.AD < 0.3) avisos.push("Sem jogo pelos lados no ataque: a defesa adversária fecha o centro.");
  if (!NOVO) esc11.filter(x => x.j.fora > 0).forEach(x => avisos.push(`${x.j.nome} está fora por ${x.j.motivo || "indisponibilidade"} (${x.j.fora} ${x.j.fora === 1 ? "jogo" : "jogos"}): no jogo ele será trocado pelo melhor disponível para a posição.`));
  esc11.forEach(x => { const f = foraDePosicao(x.j, x.pos); if (f) avisos.push(`${x.j.nome} está ${f.fam === "I" ? "improvisado" : "competente (não natural)"} de ${sg(x.pos)} e perde ${f1(f.perda)} de nota (rende ${f.fam === "I" ? "80" : "93"}%).${f.melhor ? ` ${f.melhor.nome} renderia mais ali (${f1(f.ganho)}).` : ""}`); });
  if (E.banco.length && !E.banco.some(id => (jogDe(id) || {}).pos === "GK")) avisos.push("Banco sem goleiro reserva.");
  const ent = entrosamento(esc11), NOME_SETOR = { D: "a defesa", M: "o meio", A: "o ataque" };
  for (const s of ["D", "M", "A"]) if (ent[s] < 0.999) avisos.push(`Entrosamento: ${NOME_SETOR[s]} rende ${(100 * (1 - ent[s])).toFixed(1).replace(".", ",")}% menos por causa de ${esc11.filter(x => x.j.entrosar > 0 && setorDaPosicao(x.pos) === s).map(x => `${x.j.nome} (faltam ${x.j.entrosar} ${x.j.entrosar === 1 ? "jogo" : "jogos"})`).join(", ")}.`);
  return { erros, avisos, cob, esc11 };
}

// Faixas do campo e as posições de cada uma, para as tiras que aparecem ao arrastar um titular (coluna inicial numa grade de 10).
const FAIXA = { ataque: 0, meia: 1, meio: 2, volante: 3, ala: 3, defesa: 4, gol: 5 };
// mapa: índice da vaga que está sendo arrastada ou escolhida (mostra as posições para onde ela pode ir), ou null
const selo = (j, pos) => { const f = foraDePosicao(j, pos); return f ? ` <span class="${f.fam === "I" ? "bad" : "mut"}" title="${f.fam === "I" ? "Improvisado" : "Competente"} nessa vaga: perde ${f1(f.perda)} de nota.${f.melhor ? ` ${esc(f.melhor.nome)} renderia ${f1(f.ganho)}.` : ""}">⚠ −${f1(f.perda)}</span>` : ""; };
function htmlGramado(mapa = null) {
  if (CAMISAS) numerar();
  const filas = filasDoCampo(E.vagas.map((_, i) => i), i => E.vagas[i]).map(fila => ({ faixa: FAIXA[POSICOES[E.vagas[fila.itens[0].x]].linha], html: `<div class="fila ${fila.grade ? "grade" : ""}"${NOVO ? ` style="top:${ALTURA_DA_FAIXA[FAIXA[POSICOES[E.vagas[fila.itens[0].x]].linha]]}%"` : ""}>${fila.itens.map(({ x: i, col }) => {
    const j = jogDe(E.jog[i]), pos = E.vagas[i];
    return `<div class="vaga ${sel && sel.tipo === "vaga" && sel.i === i ? "sel" : ""} ${j ? "fam-" + familiaridade(j, pos) : "vazia"} ${j && j.fora > 0 ? "fora" : ""} ${!j && tirados.some(t => t.i === i) ? "falta" : ""}" data-vaga="${i}" data-arrasta="${j ? j.id : ""}" ${col ? `style="grid-column:${col} / span 2"` : ""}>
      <span class="pp vpos ${corDoSetor(pos)}${CAMISAS && j ? " camisa" : ""}" title="${POSICOES[pos].nome}">${CAMISAS && j ? camisa(j, pos) : sg(pos)}</span>${NOVO && j && j.amarelos >= 3 && !(j.fora > 0) ? `<i class="t-pendurado" title="Pendurado: o próximo amarelo suspende"></i>` : ""}${NOVO ? "" : `<select class="${corDoSetor(pos)}" data-pos="${i}" title="Posição da vaga">${LISTA_POSICOES.map(p => `<option value="${p}" ${p === pos ? "selected" : ""}>${sg(p)}</option>`).join("")}</select>`}
      <div class="nome" title="${j ? esc(j.nome) : ""}">${j ? (NOVO ? esc(curto(j)) : `<span class="nc">${esc(j.nome)}</span><span class="ns">${esc(j.nome.split(" ").slice(-1)[0])}</span>`) : tirados.some(t => t.i === i) ? "escolher" : "vazio"}</div><div class="det">${j ? (j.fora > 0 ? `<span class="bad" title="Não joga a próxima partida: na liga será trocado pelo melhor disponível">${NOVO ? (j.motivo === "lesão" ? "lesionado" : "suspenso") : `${j.motivo === "lesão" ? "🩹 lesão" : "⛔ suspenso"} ${j.fora}j`}</span>` : `${CAMISAS ? `<span class="pp vsig ${corDoSetor(pos)}">${sg(pos)}</span>` : ""}<span class="nota">${f1(notaNaPosicao(j, pos))}</span>${j.amarelos >= 3 ? (NOVO ? "" : ` <span title="Pendurado: o próximo amarelo suspende">🟨</span>`) : ""}<span class="fam"> · ${NOME_FAMILIARIDADE[familiaridade(j, pos)]}</span>${selo(j, pos)}`) : "&nbsp;"}</div></div>`;
  }).join("")}</div>` }));
  if (mapa === null) return filas.map(f => f.html).join("");
  const j = jogDe(E.jog[mapa]);
  // visual novo: as posições possíveis num mapa fixo por cima do campo (círculos tracejados, a nota do jogador embaixo); o campo não muda de altura
  if (NOVO) return filas.map(f => f.html).join("") + `<div class="t-posmapa">${TIRAS.flatMap((t, k) => t.map(([p, col]) => `<div class="t-pos${p === E.vagas[mapa] ? " atual" : ""}${CAMISAS && j ? " camisa" : ""}" data-novapos="${p}" style="left:${col * 10}%;top:${ALTURA_DA_FAIXA[k]}%" title="${POSICOES[p].nome}"><span class="t-pos-bola">${CAMISAS && j ? camisa(j, p) : sg(p)}</span>${j ? `<span class="t-pos-nota">${CAMISAS ? `<span class="pp vsig ${corDoSetor(p)}">${sg(p)}</span>` : ""}${p === E.vagas[mapa] ? esc(curto(j)) + " · " : ""}${f1(notaNaPosicao(j, p))}</span>` : ""}</div>`)).join("")}</div>`;
  const tira = k => `<div class="fila fant">${TIRAS[k].map(([p, col]) => `<div class="gh${p === E.vagas[mapa] ? " atual" : ""}" data-novapos="${p}" style="grid-column-start:${col}" title="${POSICOES[p].nome}">${sg(p)}${j ? ` ${f1(notaNaPosicao(j, p))}` : ""}</div>`).join("")}</div>`;
  return TIRAS.map((_, k) => tira(k) + filas.filter(f => f.faixa === k).map(f => f.html).join("")).join("") + filas.filter(f => f.faixa === 5).map(f => f.html).join("");
}
// Mapa do time: força de ataque e de defesa em cada uma das 9 zonas, e as zonas em que o time está acima ou abaixo de um 4-4-2
// (comparando a fatia de cada zona na força total, para o nível do elenco não importar).
const ORDEM_MAPA = ["AE", "AC", "AD", "ME", "MC", "MD", "DE", "DC", "DD"];
const PERFIL_442 = (() => { const c = Object.fromEntries(ZONAS.map(z => [z, 0])); FORMACOES["4-4-2"].forEach(p => { for (const [z, w] of Object.entries(COBERTURA[p])) c[z] += w; }); const t = ZONAS.reduce((s, z) => s + c[z], 0); return Object.fromEntries(ZONAS.map(z => [z, c[z] / t])); })();
function htmlMiniMapa(esc11) {
  if (esc11.length < 11) return `<div class="mut">Complete o time para ver o mapa.</div>`;
  const I = instrucoesParaOMotor(), { atk, def } = avaliarZonas(esc11, { mentalidade: +I.mentalidade || 0, pressao: +I.pressao || 0, agressividade: +I.agressividade || 0 });
  const topo = Math.max(...ZONAS.map(z => Math.max(atk[z], def[z]))) || 1;
  const campo = (o, rot) => `<div><div class="mut" style="font-size:12px;margin-bottom:4px">${rot}</div><div class="minimapa">${ORDEM_MAPA.map(z => { const t = o[z] / topo; return `<div title="${NOME_ZONA[z]}" style="background:rgba(255,255,255,${(0.08 + 0.8 * t).toFixed(2)});color:${t > 0.5 ? "#12331f" : "#dfe9e2"}">${Math.round(o[z])}</div>`; }).join("")}</div></div>`;
  const total = ZONAS.reduce((s, z) => s + atk[z] + def[z], 0), dif = ZONAS.map(z => [z, (atk[z] + def[z]) / total - PERFIL_442[z]]).sort((a, b) => b[1] - a[1]);
  const nomes = l => l.map(d => NOME_ZONA[d[0]]).join(", ");
  return `<div class="row" style="align-items:flex-start;gap:16px">${campo(atk, "Com a bola")}${campo(def, "Sem a bola")}
    <div style="flex:1;min-width:150px"><div><span class="ok">Forte:</span> ${nomes(dif.slice(0, 2))}</div><div><span class="bad">Exposto:</span> ${nomes(dif.slice(-2).reverse())}</div>
    <div class="mut" style="font-size:12px;margin-top:6px">Comparado a um 4-4-2. O ataque fica no alto do mapa.</div></div></div>`;
}
function render() {
  guardar("mo_trabalho_" + chaveElenco(), E);
  const V = validar();
  // gramado
  $("gramado").innerHTML = htmlGramado(NOVO && sel && sel.tipo === "vaga" && E.vagas[sel.i] !== "GK" ? sel.i : null); // visual novo: vaga escolhida mostra no campo as posições para onde ela pode ir
  // banco
  if (NOVO) { $("banco").innerHTML = Array.from({ length: TAMANHO_DO_BANCO }, (_, i) => { const j = jogDe(E.banco[i]); return `<div class="t-reserva${j ? "" : " vazia"}${j && j.fora > 0 ? " fora" : ""}${sel && sel.tipo === "banco" && sel.i === i ? " sel" : ""}" data-banco="${i}" data-arrasta="${j ? j.id : ""}">${j ? `${CAMISAS ? `<span class="t-bola camisa">${camisa(j, j.pos)}</span>` : `<span class="t-bola ${corDoSetor(j.pos)}">${sg(j.pos)}</span>`}<span class="t-reserva-nome" title="${esc(j.nome)}">${esc(curto(j))}</span><span class="t-reserva-nota">${f1(notaNaPosicao(j, j.pos))}</span>` : `<span class="t-bola"></span><span class="t-reserva-nome">vazio</span>`}</div>`; }).join("");
    $("nBanco").textContent = `Banco · ${E.banco.filter(jogDe).length} de ${TAMANHO_DO_BANCO}`;
    const fil = ["defesa", "ala"], meio = ["volante", "meio", "meia"], c = l => E.vagas.filter(p => l.includes(POSICOES[p].linha)).length;
    $("rotTatica").textContent = `Tática${proximoJogo ? " para " + new Date(proximoJogo.inicio).toLocaleDateString("pt-BR", { weekday: "long" }).replace("-feira", "") : ""} · ${c(fil)}-${c(meio)}-${c(["ataque"])}`; }
  else $("banco").innerHTML = Array.from({ length: TAMANHO_DO_BANCO }, (_, i) => { const j = jogDe(E.banco[i]); return `<span class="chip ${j ? "" : "vazio"} ${j && j.fora > 0 ? "fora" : ""}" data-banco="${i}" data-arrasta="${j ? j.id : ""}" style="${sel && sel.tipo === "banco" && sel.i === i ? "border-color:var(--ac)" : ""}">${j ? `${pp(j.pos)} ${esc(j.nome)}` : "vazio"}</span>`; }).join("");
  // validação
  $("validacao").innerHTML = NOVO ? [...V.erros.map(t => `<div class="t-alerta erro">${esc(t)}</div>`), ...V.avisos.map(t => `<div class="t-alerta">${esc(t)}</div>`)].join("")
    : [...V.erros.map(t => `<div class="bad">${esc(t)}</div>`), ...V.avisos.map(t => `<div class="aviso">${esc(t)}</div>`)].join("") || `<div class="ok">Escalação válida, sem avisos.</div>`;
  $("jogar").disabled = V.erros.length > 0;
  renderEscolha();
  // instruções
  const segmentos = ([k, [nome, ops]]) => `<div class="t-instr"><div class="t-numero-rotulo">${nome}</div><div class="t-segmentos">${ops.map(([v, t]) =>
    `<button type="button" data-instrv="${k}:${v}" aria-pressed="${String(E.instr[k]) === String(v)}" title="${t}">${CURTO[t] || t.split(" (")[0]}</button>`).join("")}</div></div>`;
  if (NOVO) { $("instrucoes").innerHTML = GRUPOS_INSTR.map(([g, ks]) => `<div class="t-instr-grupo"><div class="t-rotulo">${g}</div>${ks.map(k => segmentos([k, OPCOES[k]])).join("")}</div>`).join("");
    raiz.querySelector(".t-tatica-lado").classList.toggle("escolhendo", !!sel);
    const atual = [...E.vagas].sort().join(); // formação marcada: a que tem as mesmas posições do time
    $("formacao").innerHTML = Object.keys(FORMACOES).map(k => `<button type="button" data-forma="${esc(k)}" title="${esc(k)}" aria-pressed="${[...FORMACOES[k]].sort().join() === atual}">${esc(k.split(" (")[0].replace(/ (com|do) /, " "))}</button>`).join(""); }
  else $("instrucoes").innerHTML = Object.entries(OPCOES).map(([k, [nome, ops]]) => `<label>${nome}<select data-instr="${k}">${ops.map(([v, t]) => `<option value="${v}" ${String(E.instr[k]) === String(v) ? "selected" : ""}>${t}</option>`).join("")}</select></label>`).join("");
  if ($("minimapa")) $("minimapa").innerHTML = htmlMiniMapa(V.esc11); // o visual novo não tem o mapa do time
  if (forcaAdv != null && $("comparaOnze")) $("comparaOnze").innerHTML = comparaOnze();
  mostrarForca();
  if ($("nossoOnze")) { $("nossoOnze").textContent = f1(forcaMinha()); $("nossoOnzeLeg").textContent = ladoDoDuelo(); }
  // papéis
  const tit = titulares(), linha = tit.filter(j => E.vagas[E.jog.indexOf(j.id)] !== "GK");
  const ficha = (k, i) => {
    const id = ehCobranca(k) ? E.instr.cobradores[k][i] : E.instr[k], j = jogDe(id), marcada = sel && sel.tipo === "papel" && sel.k === k && sel.i === i;
    const rot = ehCobranca(k) ? `${i + 1}º` : PAPEIS[k][0];
    return `<span class="chip ${j ? "" : "vazio"}" data-papslot="${k}:${i}" style="${marcada ? "border-color:var(--ac)" : ""}"><span class="mut">${rot}</span> ${j ? `${esc(curto(j))} <b data-tirapapel="${k}:${i}" title="Tirar">×</b>` : "auto"}</span>`;
  };
  const cobs = k => { const l = E.instr.cobradores[k]; return l.map((_, i) => ficha(k, i)).join("") + (l.length < PAPEIS[k][2] ? ficha(k, l.length).replace("auto", "+") : ""); };
  $("papeis").innerHTML = `<div class="papeis">
    <b>Liderança</b><div class="chips">${ficha("capitao", 0)}${ficha("vice", 0)}</div>
    <b>Jogadas</b><div class="chips">${ficha("armador", 0)}${ficha("alvo", 0)}</div>
    <b>Escanteios</b><div class="chips">${cobs("escanteio")}</div>
    <b>Faltas</b><div class="chips">${cobs("falta")}</div>
    <b>Pênaltis</b><div class="chips">${cobs("penalti")}</div></div>
    <div class="mut soNovoNao" style="font-size:12px;margin-top:6px">Clique numa ficha e escolha o jogador, ou arraste um titular até ela. Em "auto" o jogo escolhe o melhor em campo; nos cobradores vale a ordem.</div>`;
  // substituições e ordens
  const reservas = E.banco.map(jogDe).filter(Boolean), posDe = id => E.vagas[E.jog.indexOf(id)] || null;
  const sele = (attr, ops, atual) => `<select ${attr}>${ops.map(([v, t]) => `<option value="${v}" ${String(v) === String(atual) ? "selected" : ""}>${esc(t)}</option>`).join("")}</select>`;
  const nomeCond = (lista, c) => (lista.find(x => x[0] === c) || [, c])[1];
  const linhaCurta = (txt, k, i) => `<div class="linhaSub curta"><span>${txt}</span><button class="sec" data-edita${k}="${i}" title="Editar">✎</button><button class="sec" data-tira${k}="${i}" title="Tirar">×</button></div>`;
  $("subs").innerHTML = E.subs.map((s, i) => editaSub !== i ? linhaCurta(`<b>${s.min}'</b> sai ${esc(curto(jogDe(s.sai)))} → entra ${esc(curto(jogDe(s.entra)))}${s.pos ? ` (${sg(s.pos)})` : ""} <span class="mut">${nomeCond(CONDICOES_SUB, s.cond)}</span>`, "sub", i) : `<div class="linhaSub">aos <input type="number" min="0" max="89" value="${s.min}" data-sub="${i}" data-campo="min"> min, sai ${sele(`data-sub="${i}" data-campo="sai"`, tit.map(j => [j.id, j.nome]), s.sai)} entra ${sele(`data-sub="${i}" data-campo="entra"`, reservas.map(j => [j.id, j.nome]), s.entra)} de ${sele(`data-sub="${i}" data-campo="pos" title="Posição em que o substituto entra"`, [["", "mesma posição" + (posDe(s.sai) ? " (" + sg(posDe(s.sai)) + ")" : "")], ...LISTA_POSICOES.filter(p => p !== "GK").map(p => [p, sg(p) + (jogDe(s.entra) ? " · " + f1(notaNaPosicao(jogDe(s.entra), p)) : "")])], s.pos || "")} ${sele(`data-sub="${i}" data-campo="cond"`, CONDICOES_SUB, s.cond)} <button data-editasub="${i}">ok</button><button class="sec" data-tirasub="${i}" title="Tirar">×</button></div>`).join("") || `<div class="mut" style="margin-bottom:6px">Nenhuma. Jogador lesionado é trocado sozinho pelo melhor do banco para a posição.</div>`;
  if (editaSub !== null) $("subs").insertAdjacentHTML("beforeend", `<div class="mut" style="font-size:12px;margin-bottom:6px">Em "de", escolha a posição em que o substituto entra (ao lado, a nota dele ali). "Jogando mal" e "jogando bem" olham os duelos que ele venceu além do esperado e os gols até aquele minuto.</div>`);
  $("maisSub").disabled = E.subs.length >= CONFIG.maxSubstituicoes || !reservas.length || !tit.length;
  $("ordens").innerHTML = E.ordens.map((o, i) => editaOrdem !== i ? linhaCurta(`<b>${o.min}'</b> ${nomeCond(CONDICOES, o.cond)}: ${nomeCond(MUDANCAS, o.muda).toLowerCase()}`, "ordem", i) : `<div class="linhaSub">a partir dos <input type="number" min="0" max="89" value="${o.min}" data-ordem="${i}" data-campo="min"> min, ${sele(`data-ordem="${i}" data-campo="cond"`, CONDICOES, o.cond)}: ${sele(`data-ordem="${i}" data-campo="muda"`, MUDANCAS, o.muda)} <button data-editaordem="${i}">ok</button><button class="sec" data-tiraordem="${i}" title="Tirar">×</button></div>`).join("") || `<div class="mut" style="margin-bottom:6px">Nenhuma.</div>`;
  // resumo no título das seções fechadas
  const nPapeis = ["capitao", "vice", "armador", "alvo"].filter(k => E.instr[k]).length + Object.values(E.instr.cobradores).flat().filter(Boolean).length;
  $("nPapeis").textContent = nPapeis ? `${nPapeis} de 15 escolhidos` : "tudo automático";
  $("nSubs").textContent = `${E.subs.length} de ${CONFIG.maxSubstituicoes}`;
  $("nOrdens").textContent = E.ordens.length ? `${E.ordens.length}` : "nenhuma";
  // salvas
  const salvas = ler("mo_salvas_" + chaveElenco()) || {};
  $("salvas").innerHTML = Object.keys(salvas).map(n => `<span class="chip" data-carrega="${esc(n)}">${esc(n)} <b data-apaga="${esc(n)}" title="Apagar">×</b></span>`).join("") || "";
}

const SETORES = { gol: "Goleiros", defesa: "Defesa", ala: "Defesa", volante: "Meio-campo", meio: "Meio-campo", meia: "Meio-campo", ataque: "Ataque" };
const htmlSkills = (j, p) => `<div class="skills">${(j.pos === "GK" ? [GRUPOS[4], ...GRUPOS.slice(0, 4)] : GRUPOS.slice(0, 4)).map(([nome, g]) => `<div class="grupo"><h4>${nome}</h4>${ATRIBUTOS.map((a, k) => a.grupo !== g ? "" : `<div class="${(PESOS[POSICOES[p].papel] || {})[a.k] ? "conta" : ""}"><span>${a.nome}</span><span>${j.at[k]}</span></div>`).join("")}</div>`).join("")}
  <div class="mut" style="column-span:all;font-size:12px;margin-top:4px">Em destaque, os atributos que contam para ${sg(p)}. Experiência ${Math.round(experienciaDe(j))} de 100: quanto mais alta, menos ele oscila de um jogo para o outro e mais rende (até 3%).</div></div>`;
const SETORES_DA_LISTA = [["Goleiros", "Goleiros"], ["Defesa", "Defesa"], ["Meio-campo", "Meio"], ["Ataque", "Ataque"]];
// visual novo: a lista mora na faixa escura, um setor por vez (sem rolagem); a posição da vaga muda no próprio campo
function renderEscolhaNova(el) {
  document.body.classList.toggle("escolhendo", !!sel);
  const fecha = `<button type="button" class="t-esc-fecha" data-fechaescolha="1" title="Fechar">✕</button>`;
  const vazio = rot => `<div class="t-esc" data-escolhe=""><span class="t-bola"></span><span class="t-esc-nome">${rot}</span></div>`;
  const onde = j => j.fora > 0 ? (j.motivo === "lesão" ? "lesionado" : "suspenso") : E.jog.includes(j.id) ? "em campo" : E.banco.includes(j.id) ? "banco" : "";
  const linha = (j, p) => { const fam = familiaridade(j, p), fora = j.fora > 0;
    return `<div class="t-esc${E.jog.includes(j.id) ? " titular" : E.banco.includes(j.id) ? " reserva" : ""}${fora ? " indisp" : ""}" ${fora ? `title="Fora do próximo jogo: não pode ser escalado"` : `data-escolhe="${j.id}" data-arrasta="${j.id}"`}>
      <span class="t-bola ${corDoSetor(j.pos)}">${sg(j.pos)}</span><span class="t-esc-nome" title="${esc(j.nome)}, ${j.idade} anos${j.pe ? ", pé " + NOME_DO_PE[j.pe] : ""}">${esc(j.nome)}</span><span class="t-esc-onde">${onde(j)}</span>
      <span class="t-esc-mo ${momento(j.forma)}" title="Forma">${j.forma == null ? 50 : j.forma}</span><span class="t-esc-mo ${momento(j.moral)}" title="Moral">${j.moral == null ? 50 : j.moral}</span>
      <span class="t-esc-nota${fam === "I" ? " bad" : fam === "C" ? " aviso" : ""}"${fam !== "N" ? ` title="${NOME_FAMILIARIDADE[fam]} de ${sg(p)}"` : ""}>${f1(notaNaPosicao(j, p))}</span><button type="button" class="t-esc-info" data-skills="${j.id}" title="Atributos">i</button></div>${skillsDe === j.id ? htmlSkills(j, p) : ""}`; };
  if (sel && sel.tipo === "papel") {
    const [rot, deLinha] = PAPEIS[sel.k], lista = escalacaoAtual().filter(x => !deLinha || x.pos !== "GK").sort((a, b) => notaNaPosicao(b.j, b.pos) - notaNaPosicao(a.j, a.pos));
    el.innerHTML = `<div class="t-esc-topo"><div class="t-numero-rotulo">${ehCobranca(sel.k) ? `${rot}: ${sel.i + 1}º cobrador` : rot}</div>${fecha}</div><div class="t-esc-lista">${lista.map(x => linha(x.j, x.pos)).join("")}${vazio("Automático")}</div>`;
    return;
  }
  const pos = sel && sel.tipo === "vaga" ? E.vagas[sel.i] : null;
  const setor = setorVisto || (pos ? SETORES[POSICOES[pos].linha] : "Defesa"), nota = j => notaNaPosicao(j, pos || j.pos);
  const lista = elenco.filter(j => SETORES[POSICOES[j.pos].linha] === setor && (!sel || pos || !E.jog.includes(j.id)))
    .sort((a, b) => (a.fora > 0) - (b.fora > 0) || (pos ? 0 : LISTA_POSICOES.indexOf(a.pos) - LISTA_POSICOES.indexOf(b.pos)) || nota(b) - nota(a));
  el.innerHTML = `${sel ? `<div class="t-esc-topo"><div class="t-numero-rotulo">${pos ? `Vaga de ${sg(pos)} · ${POSICOES[pos].nome.toLowerCase()}` : "Quem vai para o banco"}</div>${fecha}</div>` : ""}
    <div class="t-segmentos t-esc-setores">${SETORES_DA_LISTA.map(([s, r]) => `<button type="button" data-setor="${s}" aria-pressed="${s === setor}">${r}</button>`).join("")}</div>
    <div class="t-esc-lista"><div class="t-esc t-esc-cab"><span></span><span></span><span></span><span>forma</span><span>moral</span><span>${pos ? sg(pos) : "nota"}</span><span></span></div>
    ${lista.map(j => linha(j, pos || j.pos)).join("")}${sel ? vazio("Deixar vazio") : ""}</div>`;
}
function renderEscolha() {
  const el = $("escolha");
  if (NOVO) return renderEscolhaNova(el);
  if (sel && sel.tipo === "papel") return renderEscolhaPapel(el);
  const pos = sel && sel.tipo === "vaga" ? E.vagas[sel.i] : null;
  const nota = j => pos ? notaNaPosicao(j, pos) : notaNaPosicao(j, j.pos);
  // escolhendo para uma vaga: pela nota naquela posição; a lista geral, por setor e posição (gol, defesa, meio, ataque), o melhor primeiro
  const ordem = j => LISTA_POSICOES.indexOf(j.pos);
  // lesionado ou suspenso não pode ser escalado: aparece apagado e, na escolha de vaga ou banco, vai para o fim da lista
  const fora = j => j.fora > 0;
  const lista = elenco.filter(j => !sel || sel.tipo === "vaga" || !E.jog.includes(j.id)).sort((a, b) => (sel ? fora(a) - fora(b) : 0) || (pos ? 0 : ordem(a) - ordem(b)) || nota(b) - nota(a));
  const setorDe = j => SETORES[POSICOES[j.pos].linha];
  const onde = j => { const i = E.jog.indexOf(j.id); return i >= 0 ? `joga de ${sg(E.vagas[i])}` : E.banco.includes(j.id) ? "banco" : ""; };
  const situacao = j => E.jog.includes(j.id) ? "titular" : E.banco.includes(j.id) ? "reserva" : "";
  document.body.classList.toggle("escolhendo", !!sel);
  el.innerHTML = `${sel ? `<button class="sec fechaEscolha" data-fechaescolha="1">✕</button>` : ""}<h2>${pos ? `Quem joga de ${sg(pos)} (${POSICOES[pos].nome.toLowerCase()})` : sel ? "Quem vai para o banco" : "Elenco"} <span class="tag">${sel ? "clique ou arraste" : "arraste para a vaga"} · ${pos ? "pela nota na posição" : "por setor, pela nota na posição natural"}</span></h2>
    ${pos ? `<label class="posDaVaga">Posição <select data-pos="${sel.i}">${LISTA_POSICOES.map(p => `<option value="${p}" ${p === pos ? "selected" : ""}>${sg(p)} · ${POSICOES[p].nome}</option>`).join("")}</select></label>` : ""}
    <div class="legenda"><span class="titular">titular</span><span class="reserva">no banco</span><span>fora da lista</span></div>
    <div class="cabl"><span>forma</span><span>moral</span><span>nota</span><span style="width:24px"></span></div>
    <div class="lista" style="max-height:340px;overflow-y:auto;overflow-x:hidden">${lista.map((j, k) => { const fam = pos ? familiaridade(j, pos) : "N", p = pos || j.pos;
      return `${!pos && (k === 0 || setorDe(lista[k - 1]) !== setorDe(j)) ? `<div class="setor">${setorDe(j)}</div>` : ""}<div class="item ${situacao(j)}${fora(j) ? " indisp" : ""}" ${fora(j) ? `title="Fora do próximo jogo: não pode ser escalado"` : `data-escolhe="${j.id}" data-arrasta="${j.id}"`}><span class="pega" title="Arrastar">⠿</span>${pp(j.pos)}<span class="nm">${esc(j.nome)} <span class="tag">${j.idade}</span>${j.fora > 0 ? ` <span class="bad">${j.motivo || "fora"} ${j.fora}j</span>` : ""}${j.amarelos ? " " + "🟨".repeat(j.amarelos) : ""}${onde(j) ? ` <span class="tag">${onde(j)}</span>` : ""}${fam !== "N" ? ` <span class="${fam === "I" ? "bad" : "aviso"}" style="font-size:12px">${NOME_FAMILIARIDADE[fam].toLowerCase()}</span>` : ""}${j.pe ? ` <span class="${peNaPosicao(j.pe, p) === "trocado" ? "aviso" : "mut"}" style="font-size:12px" title="Pé ${NOME_DO_PE[j.pe]}${peNaPosicao(j.pe, p) === "trocado" ? ": pé trocado para este lado. Cruza pior; se for ponta ou meia-atacante, finaliza melhor" : peNaPosicao(j.pe, p) === "natural" ? ": no lado do pé bom, cruza melhor" : ""}">pé ${j.pe === "A" ? "E/D" : j.pe}${peNaPosicao(j.pe, p) === "trocado" ? " ⇄" : ""}</span>` : ""}</span>
        <span class="dir"><span class="mo ${momento(j.forma)}" title="Forma">${j.forma == null ? 50 : j.forma}</span><span class="mo ${momento(j.moral)}" title="Moral">${j.moral == null ? 50 : j.moral}</span><span class="nota" style="min-width:34px;text-align:right">${f1(nota(j))}</span><button class="info" data-skills="${j.id}" title="Atributos">i</button></span></div>
        ${skillsDe === j.id ? htmlSkills(j, p) : ""}`; }).join("")}
    ${sel ? `<div class="item" data-escolhe=""><span class="mut">Deixar vazio</span></div>` : ""}</div>`;
}

// escolher quem faz um papel: só titulares (de linha, menos para capitão e vice), pela nota na posição em que jogam
function renderEscolhaPapel(el) {
  const [rot, linha] = PAPEIS[sel.k], lista = escalacaoAtual().filter(x => !linha || x.pos !== "GK").sort((a, b) => notaNaPosicao(b.j, b.pos) - notaNaPosicao(a.j, a.pos));
  document.body.classList.add("escolhendo");
  el.innerHTML = `<button class="sec fechaEscolha" data-fechaescolha="1">✕</button><h2>${ehCobranca(sel.k) ? `${rot}: ${sel.i + 1}º cobrador` : rot} <span class="tag">titulares · pela nota</span></h2>
    <div class="lista" style="max-height:340px;overflow-y:auto">${lista.map(({ j, pos }) => `<div class="item" data-escolhe="${j.id}">${pp(pos)}<span class="nm">${esc(j.nome)}</span><span class="dir"><span class="nota">${f1(notaNaPosicao(j, pos))}</span></span></div>`).join("")}
    <div class="item" data-escolhe=""><span class="mut">Automático</span></div></div>`;
}
function definirPapel(k, i, id) {
  if (!ehCobranca(k)) { E.instr[k] = id || null; return; }
  const l = E.instr.cobradores[k].slice();
  if (id) l[i] = id; else l.splice(i, 1);
  E.instr.cobradores[k] = l.filter(Boolean).filter((v, n, a) => a.indexOf(v) === n);
}

function escolher(id) {
  if (!sel) return;
  if (sel.tipo === "papel") {
    const x = escalacaoAtual().find(x => x.j.id === id);
    if (id && (!x || (PAPEIS[sel.k][1] && x.pos === "GK"))) return; // só titular (e de linha, quando o papel pede)
    definirPapel(sel.k, sel.i, id); sel = null; return render();
  }
  if (id && porId[id] && porId[id].fora > 0) return; // lesionado ou suspenso não entra no time nem no banco
  if (sel.tipo === "vaga") {
    const antes = E.jog[sel.i], outra = id ? E.jog.indexOf(id) : -1;
    if (outra >= 0) E.jog[outra] = antes; // troca de vaga entre dois titulares
    else if (id && E.banco.includes(id)) E.banco = E.banco.map(b => b === id ? antes : b).filter(Boolean); // vem do banco; quem saiu vai para lá
    E.jog[sel.i] = id || null;
  } else {
    const b = E.banco.slice(); while (b.length < TAMANHO_DO_BANCO) b.push(null);
    const vaga = id ? E.jog.indexOf(id) : -1;
    if (vaga >= 0) E.jog[vaga] = b[sel.i]; // titular vai para o banco; o reserva daquela vaga do banco assume o lugar dele
    for (let i = 0; i < TAMANHO_DO_BANCO; i++) if (b[i] === id) b[i] = null;
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
  const t = taticaDoAmistoso(adv, online ? online.observada : null, { mandante: !casa, forcaAdversario: minhaForca, perfil: online ? online.perfil : null });
  // o preparador de prevenção vale no amistoso como no jogo oficial
  const prevencao = clubeOnline ? saudeDoClube(await B.treinadoresDoClube(clubeOnline.id)).prevencao : 0;
  const meu = prepararTime({ nome: nomeMeu, escalacao: V.esc11, banco: E.banco.map(jogDe), instrucoes: instrucoesParaOMotor(), mandante: casa, prevencao });
  const bot = prepararTime({ nome: nomeAdv, escalacao: t.escalacao, banco: t.banco, instrucoes: t.instrucoes, mandante: !casa });
  const n = +(ler("mo_partidas") || 0) + 1; guardar("mo_partidas", n);
  const partida = casa ? simularPartida(criarRng(n), meu, bot) : simularPartida(criarRng(n), bot, meu);
  const nivel = +$("analista").value, r = montarRelatorio(partida, [nivel, nivel]);
  $("infoAdv").textContent = `${nomeAdv} (${t.origem})${t.formacao ? `: ${t.formacao},` : ":"} nota média ${f1(t.forca)}. ${nomeMeu}: nota média ${f1(minhaForca)}.`;
  $("rel").innerHTML = htmlRelatorio(r, { nomes: casa ? [nomeMeu, nomeAdv] : [nomeAdv, nomeMeu], analistas: [eu], ordens: partida.ordens });
  if (online) $("rel").scrollIntoView({ behavior: "smooth", block: "start" });
  return { r, partida };
}

// arrastar e soltar, com mouse ou dedo: de uma vaga, do banco ou da lista para uma vaga ou para o banco
let arrasto = null, ignorarClique = false;
const fimDoArrasto = () => { if (arrasto && arrasto.fantasma) arrasto.fantasma.remove(); document.querySelectorAll(".alvo").forEach(x => x.classList.remove("alvo")); document.body.classList.remove("arrastando"); arrasto = null; };
const alvoEm = (x, y) => { const el = document.elementFromPoint(x, y); return el && el.closest("[data-vaga], [data-banco], [data-novapos], [data-papslot]"); };
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
    f.className = "fantasma"; f.textContent = `${sg(j.pos)} ${j.nome}`;
    if (CAMISAS) { f.className = "fantasma camisa"; f.innerHTML = camisa(j, j.pos) + `<span>${esc(curto(j))}</span>`; } document.body.appendChild(f); document.body.classList.add("arrastando");
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
  if (alvo.dataset.papslot) { const [k, i] = alvo.dataset.papslot.split(":"); sel = { tipo: "papel", k, i: +i }; return escolher(id); }
  sel = alvo.dataset.vaga !== undefined ? { tipo: "vaga", i: +alvo.dataset.vaga } : { tipo: "banco", i: Math.min(+alvo.dataset.banco, E.banco.length) };
  escolher(id);
});
window.addEventListener("pointercancel", () => { const tinhaMapa = arrasto && arrasto.mapa !== undefined; fimDoArrasto(); if (tinhaMapa) render(); });

// eventos
window.addEventListener("keydown", e => { if (e.key === "Escape" && sel && !(e.target.closest && e.target.closest("input, select, textarea"))) { sel = null; render(); } });
raiz.addEventListener("click", e => {
  const t = e.target;
  if (ignorarClique || t.closest("select, input")) return;
  const d = k => { const el = t.closest(`[data-${k}]`); return el ? el.dataset[k] : undefined; };
  if (d("apaga") !== undefined) { const s = ler("mo_salvas_" + chaveElenco()) || {}; delete s[d("apaga")]; guardar("mo_salvas_" + chaveElenco(), s); return render(); }
  if (d("carrega") !== undefined) { const s = (ler("mo_salvas_" + chaveElenco()) || {})[d("carrega")]; if (s) { E = JSON.parse(JSON.stringify(s)); sel = null; render(); } return; }
  if (d("fechaescolha") !== undefined) { sel = null; return render(); }
  if (d("setor") !== undefined) { setorVisto = d("setor"); return renderEscolha(); }
  if (d("forma") !== undefined) return aplicarFormacao(d("forma"));
  if (d("novapos") !== undefined && sel && sel.tipo === "vaga" && d("novapos") === E.vagas[sel.i]) { sel = null; return render(); } // o próprio jogador: cancela
  if (d("novapos") !== undefined && sel && sel.tipo === "vaga") { E.vagas[sel.i] = d("novapos"); setorVisto = null; limparReferencias(); return render(); }
  if (NOVO && (d("vaga") !== undefined || d("banco") !== undefined || d("papslot") !== undefined)) {
    setorVisto = null;
    if (d("papslot") !== undefined) setTimeout(() => $("escolha").scrollIntoView({ behavior: "smooth", block: "nearest" }), 0); }
  if (d("skills") !== undefined) { skillsDe = skillsDe === d("skills") ? null : d("skills"); return renderEscolha(); }
  if (d("escolhe") !== undefined) return escolher(d("escolhe"));
  if (d("vaga") !== undefined) { const i = +d("vaga"); sel = sel && sel.tipo === "vaga" && sel.i === i ? null : { tipo: "vaga", i }; return render(); }
  if (d("banco") !== undefined) { const i = +d("banco"); sel = sel && sel.tipo === "banco" && sel.i === i ? null : { tipo: "banco", i }; return render(); }
  if (d("tirapapel") !== undefined) { const [k, i] = d("tirapapel").split(":"); definirPapel(k, +i, null); sel = null; return render(); }
  if (d("papslot") !== undefined) { const [k, i] = d("papslot").split(":"); sel = sel && sel.tipo === "papel" && sel.k === k && sel.i === +i ? null : { tipo: "papel", k, i: +i }; return render(); }
  if (NOVO && sel && t.closest("#gramado")) { sel = null; return render(); } // clique no gramado vazio cancela a escolha
  if (d("editasub") !== undefined) { editaSub = editaSub === +d("editasub") ? null : +d("editasub"); return render(); }
  if (d("editaordem") !== undefined) { editaOrdem = editaOrdem === +d("editaordem") ? null : +d("editaordem"); return render(); }
  if (d("tirasub") !== undefined) { E.subs.splice(+d("tirasub"), 1); editaSub = null; return render(); }
  if (d("instrv") !== undefined) { const [k, v] = d("instrv").split(/:(.*)/); E.instr[k] = v === "true" ? true : v === "false" ? false : isNaN(+v) ? v : +v; return render(); }
  if (d("tiraordem") !== undefined) { E.ordens.splice(+d("tiraordem"), 1); editaOrdem = null; return render(); }
});
raiz.addEventListener("change", e => {
  const t = e.target, ds = t.dataset, conv = v => v === "true" ? true : v === "false" ? false : isNaN(+v) || v === "" ? v : +v;
  if (ds.pos !== undefined) { E.vagas[+ds.pos] = t.value; limparReferencias(); return render(); }
  if (ds.instr) { E.instr[ds.instr] = conv(t.value); return render(); }
  if (ds.sub !== undefined) { E.subs[+ds.sub][ds.campo] = ds.campo === "min" ? +t.value : t.value; return render(); }
  if (ds.ordem !== undefined) { E.ordens[+ds.ordem][ds.campo] = ds.campo === "min" ? +t.value : t.value; return render(); }
});
$("maisSub").onclick = () => { const tit = titulares(), usados = new Set(E.subs.map(s => s.entra)), livre = E.banco.find(id => !usados.has(id)) || E.banco[0]; const sai = tit.find(j => E.vagas[E.jog.indexOf(j.id)] !== "GK"); if (sai && livre) { E.subs.push({ min: 60, sai: sai.id, entra: livre, cond: "sempre" }); editaSub = E.subs.length - 1; render(); } };
$("maisOrdem").onclick = () => { E.ordens.push({ min: 70, cond: "perdendo", muda: "mentalidade:1" }); editaOrdem = E.ordens.length - 1; render(); };
$("salvar").onclick = () => { const n = $("nomeSalva").value.trim() || "Escalação " + (Object.keys(ler("mo_salvas_" + chaveElenco()) || {}).length + 1); const s = ler("mo_salvas_" + chaveElenco()) || {}; s[n] = JSON.parse(JSON.stringify(E)); guardar("mo_salvas_" + chaveElenco(), s); $("nomeSalva").value = ""; render(); };
$("auto").onclick = () => { const disp = elenco.filter(j => !(j.fora > 0)), esc11 = escalar(disp, E.vagas); E.jog = E.vagas.map(() => null); const livres = esc11.slice(); E.vagas.forEach((pos, i) => { const k = livres.findIndex(x => x.pos === pos); if (k >= 0) E.jog[i] = livres.splice(k, 1)[0].j.id; }); E.banco = E.banco.filter(id => !E.jog.includes(id) && porId[id] && !(porId[id].fora > 0)); completarBanco(disp); limparReferencias(); render(); };
// banco cheio: mantém quem já estava (disponível) e completa com os melhores que sobraram, com um goleiro reserva se houver
function completarBanco(disp) {
  const sobra = disp.filter(j => !E.jog.includes(j.id) && !E.banco.includes(j.id)).sort((a, b) => notaDoMomento(b, b.pos) - notaDoMomento(a, a.pos));
  if (E.banco.length < TAMANHO_DO_BANCO && !E.banco.some(id => porId[id].pos === "GK")) { const g = sobra.find(j => j.pos === "GK"); if (g) { E.banco.push(g.id); sobra.splice(sobra.indexOf(g), 1); } }
  for (const j of sobra) { if (E.banco.length >= TAMANHO_DO_BANCO) break; if (j.pos !== "GK") E.banco.push(j.id); }
}
$("bot").onclick = () => { E = daTatica(taticaBot(elenco.filter(j => !(j.fora > 0)), { mandante: $("mando").value === "casa" })); sel = null; render(); };
$("formacao").onchange = () => { if ($("formacao").value) aplicarFormacao($("formacao").value); $("formacao").value = ""; };
["semente", "nivel", "perfil"].forEach(id => $(id).onchange = () => { if (!ONLINE) novoElenco(); });
$("jogar").onclick = jogar;

$("perfil").innerHTML = Object.entries(PERFIS).map(([k, p]) => `<option value="${k}">${p.nome}</option>`).join("");
if (!NOVO) $("formacao").innerHTML = `<option value="">escolher…</option>` + Object.keys(FORMACOES).map(k => `<option>${k}</option>`).join("");
if (ONLINE) await iniciarOnline(sessao); else novoElenco();
return { sujo: () => !!E && salvoComo !== null && JSON.stringify(E) !== salvoComo, iniciarOnline, estado: () => E, elenco: () => elenco, jogar, validar, escolher, selecionar: s => { sel = s; render(); }, aplicarFormacao, render };
}
