// Aba Amistoso (jogo.html): desafiar um bot de estilo ou um clube da liga com a tática de amistoso, parceiros de treino e o histórico.
// Contra dirigente o banco confere as regras e sorteia a semente (165_amistosos.sql) e o jogo fica gravado para os dois;
// contra bot de estilo e clube sem dirigente o jogo roda só aqui, com semente local, e nada é gravado.
import * as B from "./banco.js";
import { taticaParaAmistoso, elencoDoBot, ESTILOS_DE_BOT, jogarAmistoso, partidaParaGravar, limparGravado } from "./amistoso.js";
import { ESTILO_DO_PERFIL } from "./bot.js";
import { notaNaPosicao } from "./modelo.js";
import { abrirReplay } from "./ui-replay.js";
import { montarEscalacao } from "./ui-escalacao.js";
import { faixa, rotulo } from "./ui-trem.js";

const esc = s => String(s == null ? "" : s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const NOME_DO_BOT = e => "Bot · " + ESTILO_DO_PERFIL[e].nome;
// amistoso não tem lesão nem suspensão; juvenil não joga
const disponiveis = elenco => elenco.filter(j => !j.juvenil).map(j => ({ ...j, fora: 0, motivo: null }));
// placar de uma linha gravada visto por um dos clubes: [meus, deles]
export const placarDe = (a, clubeId) => {
  if (!a.placar) return null;
  const desafianteEmCasa = a.mando === "casa", euEmCasa = a.desafiante === clubeId ? desafianteEmCasa : !desafianteEmCasa;
  return euEmCasa ? [a.placar[0], a.placar[1]] : [a.placar[1], a.placar[0]];
};
// abre um amistoso gravado (replay + relatório) para qualquer um dos dois clubes
export async function verAmistoso(raiz, id, clubeId, cPor) {
  const a = limparGravado(await B.amistosoCompleto(id));
  if (!a || !a.partida) throw new Error("O replay deste amistoso já saiu do ar (fica 7 dias).");
  const desafianteEmCasa = a.mando === "casa", ids = desafianteEmCasa ? [a.desafiante, a.desafiado] : [a.desafiado, a.desafiante];
  const clubes = ids.map(i => cPor[i] || { nome: "?" });
  return abrirReplay(raiz, { partida: a.partida, relatorio: a.relatorio, nomes: clubes.map(c => c.nome), clubes, analistas: [ids.indexOf(clubeId)], ordens: a.desafiante === clubeId ? a.partida.ordens : null });
}

// Central do desafiado: um cartão por desafiante com os amistosos de hoje (dia de Brasília) que ele ainda não viu; "ok" some com o cartão
const inicioDoDia = () => new Date(new Date().toLocaleString("sv-SE", { timeZone: "America/Sao_Paulo" }).slice(0, 10) + "T00:00:00-03:00").toISOString();
export async function cartaoDosAmistosos(el, clubeId, cPor) {
  const hoje = await B.amistososDoClube(clubeId, { desde: inicioDoDia() });
  const porDesafiante = {};
  for (const a of (hoje || []).filter(a => a.desafiado === clubeId && !a.visto_em)) (porDesafiante[a.desafiante] = porDesafiante[a.desafiante] || []).push(a);
  el.innerHTML = Object.entries(porDesafiante).map(([o, lista]) => {
    const c = cPor[o] || {}, pl = lista.map(a => placarDe(a, clubeId)).filter(Boolean);
    const v = pl.filter(([m, d]) => m > d).length, e = pl.filter(([m, d]) => m === d).length;
    return `<div class="card" data-amistosos="${lista.map(a => a.id).join(",")}" style="margin-bottom:10px">🤝 <b>${esc(c.dirigente || c.nome || "?")}</b> jogou ${lista.length} ${lista.length === 1 ? "amistoso" : "amistosos"} contra você hoje: ${v}V ${e}E ${pl.length - v - e}D
      <div class="row" style="gap:8px;margin-top:6px;align-items:center">${lista.slice().reverse().map(a => { const p = placarDe(a, clubeId);
        return p ? (a.tem_relatorio ? `<button type="button" class="sec" data-ver-amistoso="${a.id}">${p[0]} × ${p[1]}</button>` : `<span>${p[0]} × ${p[1]}</span>`) : `<span class="mut">não terminou</span>`; }).join("")}
        <button type="button" data-amistosos-ok style="margin-left:auto">ok</button></div></div>`;
  }).join("");
  el.onclick = async e => {
    const ver = e.target.closest("[data-ver-amistoso]"), ok = e.target.closest("[data-amistosos-ok]");
    if (ver) {
      let caixa = el.querySelector(".amReplayCentral"); if (!caixa) { caixa = document.createElement("div"); caixa.className = "amReplayCentral"; el.append(caixa); }
      try { await verAmistoso(caixa, +ver.dataset.verAmistoso, clubeId, cPor); } catch (err) { alert(err.message); }
    } else if (ok) {
      const cartao = ok.closest("[data-amistosos]");
      ok.disabled = true;
      try { await B.marcarAmistososVistos(clubeId, cartao.dataset.amistosos.split(",").map(Number)); cartao.remove(); } catch (err) { ok.disabled = false; alert(err.message); }
    }
  };
}

// salvar a tática de amistoso libera a opção "Aceitar amistosos": o painel montado por último se redesenha (um ouvinte só)
let redesenharPainel = null;
addEventListener("taticaDeAmistosoSalva", () => { if (redesenharPainel) redesenharPainel(); });

export async function montarAbaAmistoso(raiz, { sessao }) {
  raiz.innerHTML = `<div id="amPainel" class="t-am"><div class="mut">Carregando os amistosos…</div></div><div id="amTatica"></div><div id="amReplay"></div>`;
  const $ = id => raiz.querySelector("#" + id);
  const clube = await B.meuClube();
  const [liga, elencoTodo] = await Promise.all([B.ligaAtual(), B.elencoDoClube(clube.id)]);
  const clubes = await B.clubesDaLiga(liga.id), cPor = Object.fromEntries(clubes.map(c => [c.id, c]));
  const meuElenco = disponiveis(elencoTodo);
  let nomes = null, aviso = "", jogando = false, mando = "casa", divisao = /^[A-E]$/.test(clube.grupo) ? clube.grupo : "EXT";
  let tela = null;
  montarEscalacao($("amTatica"), { online: true, sessao, cabecalho: false, amistoso: true }).then(t => { tela = t; })
    .catch(e => { $("amTatica").innerHTML = `<div class="card bad">Não consegui abrir a tática de amistoso: ${esc(e.message)}</div>`; });

  async function desenhar() {
    const [adv, parcerias, hist, salva] = await Promise.all([B.adversariosDeAmistoso(clube.id), B.parceriasDoClube(clube.id), B.amistososDoClube(clube.id), B.minhaTaticaDeAmistoso(clube.id)]);
    const semSql = adv === undefined;
    const aceita = !!(await B.meuClube()).aceita_amistoso;
    const parDe = outro => (parcerias || []).find(p => (p.clube_a === clube.id && p.clube_b === outro) || (p.clube_b === clube.id && p.clube_a === outro)) || null;
    // um cartão por adversário: nome, linha miúda (divisão, estilo ou motivo) e a ação; sem motivo = dá para jogar agora
    const cartao = ({ nome, linha, jogar, rodape = "", cls = "" }) => `<div class="t-am-c${jogar ? "" : " t-am-fora"}${cls}">
      <div class="t-am-nome">${esc(nome)}</div><div class="t-am-linha">${linha}${!jogar && rodape ? ` · ${rodape}` : ""}</div>${jogar ? `<button type="button" class="t-botao t-botao-principal" ${jogar}>Jogar</button>` : ""}${jogar && rodape ? `<div class="t-am-rodape">${rodape}</div>` : ""}</div>`;
    const cartaoClube = a => {
      const c = cPor[a.clube_id]; if (!c) return "";
      const p = parDe(c.id), divisao = esc(B.nomeDoGrupo(c.grupo).replace(/^Brasileiro\s+/, ""));
      const rodape = !c.dono ? "" : a.parceiro ? `<button type="button" class="t-am-acao" data-desfazer="${c.id}">desfazer parceria</button>`
        : p && p.pedida_por === clube.id ? `pedido enviado <button type="button" class="t-am-acao" data-desfazer="${c.id}">(cancelar)</button>`
        : p ? "" : `<button type="button" class="t-am-acao" data-pedir="${c.id}" title="Pedir parceria de treino: parceiros jogam quantos amistosos quiserem, até contra o próximo adversário">+ parceria</button>`;
      const linha = divisao + (a.parceiro ? ` · <b class="t-am-par">parceiro</b>` : ""); // o motivo vai no título do grupo
      return cartao({ nome: c.nome, linha, jogar: a.motivo ? "" : `data-jogar-clube="${c.id}"`, rodape });
    };
    const chipPreso = a => {
      const c = cPor[a.clube_id], p = parDe(c.id), titulo = esc(B.nomeDoGrupo(c.grupo));
      return p && p.pedida_por === clube.id ? `<span class="t-am-chip t-am-enviado" title="${titulo}">${esc(c.nome)} · pedido enviado<button type="button" data-desfazer="${c.id}" title="Cancelar o pedido de parceria">×</button></span>`
        : `<span class="t-am-chip" title="${titulo}">${esc(c.nome)}${p ? "" : `<button type="button" data-pedir="${c.id}" title="Pedir parceria de treino: parceiros jogam quantos amistosos quiserem, até contra o próximo adversário">+</button>`}</span>`;
    };
    const dirigentes = semSql ? [] : adv.filter(a => cPor[a.clube_id] && cPor[a.clube_id].dono), semDono = semSql ? [] : adv.filter(a => cPor[a.clube_id] && !cPor[a.clube_id].dono);
    // quem dá para jogar agora sobe (parceiros primeiro); quem não dá fica numa grade miúda embaixo
    const livres = dirigentes.filter(a => !a.motivo).sort((x, y) => !!y.parceiro - !!x.parceiro), presos = dirigentes.filter(a => a.motivo);
    const pedidos = (parcerias || []).filter(p => !p.aceita_em && p.pedida_por !== clube.id);
    // histórico por adversário: placar para sempre; "ver" enquanto o replay existe (7 dias)
    const porAdv = {};
    for (const a of hist || []) { const o = a.desafiante === clube.id ? a.desafiado : a.desafiante; (porAdv[o] = porAdv[o] || []).push(a); }
    let tv = 0, te = 0, tj = 0;
    const historico = Object.entries(porAdv).map(([o, lista]) => {
      const pl = lista.map(a => placarDe(a, clube.id)).filter(Boolean), v = pl.filter(([m, d]) => m > d).length, e = pl.filter(([m, d]) => m === d).length;
      tv += v; te += e; tj += pl.length;
      return `<details class="t-am-h"><summary><span class="t-am-nome">${esc((cPor[o] || {}).nome || "?")}</span><span class="t-am-ved"><b class="ok">${v}</b>V · <b>${e}</b>E · <b class="bad">${pl.length - v - e}</b>D</span></summary>
        ${lista.map(a => { const p = placarDe(a, clube.id), quando = new Date(a.criado_em).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
          return `<div class="t-am-jogo"><span>${quando}</span><span>${a.desafiante === clube.id ? "você desafiou" : "desafiou você"}</span>
            ${p ? `<b>${p[0]} × ${p[1]}</b>${a.tem_relatorio ? `<button type="button" class="t-am-acao" data-ver="${a.id}">ver</button>` : ""}` : `<span>não terminou</span>`}</div>`; }).join("")}</details>`;
    }).join("");
    const nParceiros = dirigentes.filter(a => a.parceiro).length;
    // quem não dá para jogar, agrupado pelo motivo (o mesmo motivo não se repete em cada cartão)
    const porMotivo = {};
    for (const a of presos) (porMotivo[a.motivo] = porMotivo[a.motivo] || []).push(a);
    const gruposPresos = Object.entries(porMotivo).sort((x, y) => y[1].length - x[1].length)
      .map(([m, lista]) => `<div class="t-am-motivo">${esc(B.MOTIVO_AMISTOSO[m] || m)} · ${lista.length}</div><div class="t-am-chips">${lista.map(chipPreso).join("")}</div>`).join("");
    // clubes sem dirigente: chips que já jogam, filtrados por divisão (abre na sua)
    // A..E = divisões daqui (rótulo A, B1…); ligas estrangeiras juntas em "Exterior"; guardados por último
    const div = g => /^[A-E]$/.test(g) ? g : g === "X" ? "X" : "EXT", ORDEM = ["A", "B", "C", "D", "E", "EXT", "X"];
    const ROTULO_DIV = { A: "Série A", B: "B1", C: "B2", D: "B3", E: "B4", EXT: "Exterior", X: "Guardados" };
    const divisoes = [...new Set(semDono.map(a => div(cPor[a.clube_id].grupo)))].sort((x, y) => ORDEM.indexOf(x) - ORDEM.indexOf(y));
    if (!divisoes.includes(divisao)) divisao = divisoes[0];
    const curto = g => B.nomeDoGrupo(g).replace(/^Brasileiro\s+/, "");
    const blocoSemDono = divisoes.length ? `<div class="t-segmentos t-am-divs" role="group" aria-label="Divisão">${divisoes.map(g => `<button type="button" data-div="${g}" aria-pressed="${g === divisao}">${ROTULO_DIV[g]} <small>${semDono.filter(a => div(cPor[a.clube_id].grupo) === g).length}</small></button>`).join("")}</div>`
      + divisoes.map(g => `<div class="t-am-chips" data-div-lista="${g}"${g === divisao ? "" : " hidden"}>${semDono.filter(a => div(cPor[a.clube_id].grupo) === g).map(a => { const c = cPor[a.clube_id];
          return a.motivo ? `<span class="t-am-chip t-am-chip-fora" title="${esc(B.MOTIVO_AMISTOSO[a.motivo] || a.motivo)}">${esc(c.nome)}</span>` : `<button type="button" class="t-am-chip t-am-chip-jogar" data-jogar-clube="${c.id}" title="${esc(curto(c.grupo))}: jogar agora">${esc(c.nome)} <b>▸</b></button>`; }).join("")}</div>`).join("") : "";
    $("amPainel").innerHTML = faixa({ rotulo: "Amistoso · não vale nada · sai na hora", titulo: "Amistosos",
        frase: "Já no motor novo (grade 5×5, papéis e regras da T1), ainda em ajuste: placares e estatísticas podem mudar. A liga e as copas seguem no motor atual.",
        numeros: `<span><b>${livres.length + ESTILOS_DE_BOT.length}</b>dá para jogar agora</span><span><b>${nParceiros}</b>${nParceiros === 1 ? "parceiro" : "parceiros"}</span>${tj ? `<span><b>${tv}·${te}·${tj - tv - te}</b>V·E·D no total</span>` : ""}` })
      + `<div class="t-am-barra">
        <div class="t-segmentos" id="amMando" role="group" aria-label="Mando"><button type="button" data-mando="casa" aria-pressed="${mando === "casa"}">Em casa</button><button type="button" data-mando="fora" aria-pressed="${mando === "fora"}">Fora</button></div>
        <label class="t-am-aceita"><input type="checkbox" id="amAceita" ${aceita ? "checked" : ""} ${semSql || !salva ? "disabled" : ""}> Aceitar desafios de outros dirigentes</label>
        ${semSql || salva ? "" : `<span class="t-am-alerta">Salve a tática de amistoso (abaixo) para poder aceitar.</span>`}
        <details class="t-am-ajuda"><summary>como funciona</summary>Com a opção marcada, outros dirigentes que também marcaram podem desafiar você (1 por dia contra o mesmo clube, nunca contra o próximo adversário oficial). Você vê os jogos na Central. Parceiros de treino jogam sem limite. Quem desafia você joga contra a sua tática de amistoso, nunca contra a do campeonato: sem ela salva, ninguém desafia você.</details></div>
      ${aviso ? `<div class="t-am-aviso">${aviso}</div>` : ""}
      ${semSql ? `<div class="aviso">Falta rodar o 165_amistosos.sql: por enquanto, só contra os bots de estilo.</div>` : ""}
      ${pedidos.length ? `<div class="t-am-pedidos">${rotulo("Pedidos de parceria")}${pedidos.map(p => { const o = p.pedida_por; return `<div class="t-am-pedido"><b>${esc((cPor[o] || {}).nome || "?")}</b> quer ser seu parceiro de treino<button type="button" class="t-botao t-botao-principal" data-aceitar="${o}">Aceitar</button><button type="button" class="t-am-acao" data-recusar="${o}">recusar</button></div>`; }).join("")}</div>` : ""}
      <section class="t-am-secao">${rotulo("Jogar agora")}<div class="t-am-grade">
        ${livres.map(cartaoClube).join("")}
        ${ESTILOS_DE_BOT.map(e => cartao({ nome: ESTILO_DO_PERFIL[e].nome, linha: "bot de estilo", jogar: `data-jogar-bot="${e}"`, cls: " t-am-bot" })).join("")}</div></section>
      ${semDono.length ? `<section class="t-am-secao">${rotulo(`Clubes sem dirigente · jogam com a tática de bot`)}${blocoSemDono}</section>` : ""}
      ${presos.length ? `<section class="t-am-secao">${rotulo(`Outros dirigentes · não dá para jogar agora`)}<p class="t-am-dica">O <b>+</b> pede parceria de treino: parceiros jogam sem limite, até contra o próximo adversário.</p>${gruposPresos}</section>` : ""}
      ${historico ? `<section class="t-am-secao">${rotulo("Histórico")}<div class="t-am-grade t-am-hist">${historico}</div></section>` : ""}`;
  }

  async function jogar({ bot, clubeId }) {
    if (jogando) return; jogando = true; aviso = "";
    const casa = mando === "casa";
    try {
      const [a, l] = await Promise.all([B.minhaTaticaDeAmistoso(clube.id), B.minhaTatica(clube.id)]);
      // joga com a tática de amistoso como está na tela (salva ou não); sem a tela, com a salva. Tática da tela com erro não joga
      const erro = tela && tela.validar().erros[0];
      if (erro) throw new Error(`a tática de amistoso tem um problema: ${erro}`);
      const minha = taticaParaAmistoso((tela && tela.estado()) || (a && a.dados), l && l.dados, meuElenco, { mandante: casa });
      const forca = minha.escalacao.reduce((s, x) => s + notaNaPosicao(x.j, x.pos), 0) / minha.escalacao.length;
      const opcoes = perfil => ({ mandante: !casa, forcaAdversario: forca, perfil });
      let dele, outro, linha = null, semente = Math.floor(Math.random() * 2147483647); // a semente local só vale contra bot e clube sem dirigente
      if (bot) {
        nomes = nomes || await (await fetch("./dados/nomes.json")).json();
        dele = taticaParaAmistoso(null, null, elencoDoBot(bot, forca, nomes), opcoes(bot));
        outro = { nome: NOME_DO_BOT(bot), escudo: {}, sigla: "BOT" };
      } else {
        outro = cPor[clubeId];
        const elencoDele = disponiveis(await B.elencoDoClube(clubeId));
        if (outro.dono) { linha = await B.iniciarAmistoso(clube.id, clubeId, casa ? "casa" : "fora"); semente = linha.semente; }
        dele = taticaParaAmistoso(linha && linha.tatica, null, elencoDele, opcoes(outro.perfil));
      }
      const eu = { nome: clube.nome, tatica: minha }, ele = { nome: outro.nome, tatica: dele };
      const r = jogarAmistoso({ casa: casa ? eu : ele, fora: casa ? ele : eu, semente });
      if (linha) await B.gravarAmistoso(linha.id, { placar: r.placar, resumo: r.resumo, partida: partidaParaGravar(r.partida), relatorio: r.relatorio })
        .catch(e => { aviso = `<span class="bad">O jogo não foi gravado (${esc(e.message)}): ${esc(outro.nome)} não vai ver.</span>`; });
      const clubesDoJogo = casa ? [clube, outro] : [outro, clube];
      // o que cada lado usou (a tática pode ter caído para a do campeonato ou a de bot)
      if (!aviso) aviso = `<span class="mut">Último jogo: ${esc(clube.nome)} com a ${esc(minha.origem)}; ${esc(outro.nome)} com a ${esc(dele.origem)}.</span>`;
      abrirReplay($("amReplay"), { partida: r.partida, relatorio: r.relatorio, nomes: clubesDoJogo.map(c => c.nome), clubes: clubesDoJogo, analistas: [casa ? 0 : 1], ordens: r.partida.ordens });
    } catch (e) { aviso = `<span class="bad">Não deu para jogar: ${esc(e.message)}</span>`; }
    jogando = false;
    await desenhar();
  }

  $("amPainel").onclick = async e => {
    const b = e.target.closest("button"); if (!b) return;
    if (b.dataset.div) { divisao = b.dataset.div; for (const x of b.parentNode.children) x.setAttribute("aria-pressed", x === b); for (const l of $("amPainel").querySelectorAll("[data-div-lista]")) l.hidden = l.dataset.divLista !== divisao; return; }
    if (b.dataset.mando) { mando = b.dataset.mando; for (const x of b.parentNode.children) x.setAttribute("aria-pressed", x === b); return; }
    const d = b.dataset, acao = async f => { b.disabled = true; aviso = ""; try { await f(); } catch (err) { aviso = `<span class="bad">${esc(err.message)}</span>`; } await desenhar(); };
    if (d.jogarBot) { b.disabled = true; return jogar({ bot: d.jogarBot }); }
    if (d.jogarClube) { b.disabled = true; return jogar({ clubeId: +d.jogarClube }); }
    if (d.pedir) return acao(() => B.pedirParceria(clube.id, +d.pedir));
    if (d.aceitar) return acao(() => B.responderParceria(clube.id, +d.aceitar, true));
    if (d.recusar) return acao(() => B.responderParceria(clube.id, +d.recusar, false));
    if (d.desfazer) return acao(() => B.desfazerParceria(clube.id, +d.desfazer));
    if (d.ver) { b.disabled = true; try { await verAmistoso($("amReplay"), +d.ver, clube.id, cPor); } catch (err) { aviso = `<span class="bad">${esc(err.message)}</span>`; await desenhar(); } b.disabled = false; }
  };
  $("amPainel").onchange = async e => {
    if (e.target.id !== "amAceita") return;
    try { await B.aceitarAmistosos(clube.id, e.target.checked); aviso = ""; } catch (err) { aviso = `<span class="bad">${esc(err.message)}</span>`; }
    await desenhar();
  };
  redesenharPainel = () => desenhar();
  await desenhar();
  return { sujo: () => !!tela && tela.sujo() };
}
