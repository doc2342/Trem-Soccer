// Aba Amistoso (jogo.html): desafiar um bot de estilo ou um clube da liga com a tática de amistoso, parceiros de treino e o histórico.
// Contra dirigente o banco confere as regras e sorteia a semente (165_amistosos.sql) e o jogo fica gravado para os dois;
// contra bot de estilo e clube sem dirigente o jogo roda só aqui, com semente local, e nada é gravado.
import * as B from "./banco.js";
import { taticaParaAmistoso, elencoDoBot, ESTILOS_DE_BOT, jogarAmistoso, partidaParaGravar, limparGravado } from "./amistoso.js";
import { ESTILO_DO_PERFIL } from "./bot.js";
import { notaNaPosicao } from "./modelo.js";
import { abrirReplay } from "./ui-replay.js";
import { montarEscalacao } from "./ui-escalacao.js";

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

export async function montarAbaAmistoso(raiz, { sessao }) {
  raiz.innerHTML = `<div class="card" id="amPainel"><div class="mut">Carregando os amistosos…</div></div><div id="amTatica"></div><div id="amReplay"></div>`;
  const $ = id => raiz.querySelector("#" + id);
  const clube = await B.meuClube();
  const [liga, elencoTodo] = await Promise.all([B.ligaAtual(), B.elencoDoClube(clube.id)]);
  const clubes = await B.clubesDaLiga(liga.id), cPor = Object.fromEntries(clubes.map(c => [c.id, c]));
  const meuElenco = disponiveis(elencoTodo);
  let nomes = null, aviso = "", jogando = false, mando = "casa";
  let tela = null;
  montarEscalacao($("amTatica"), { online: true, sessao, cabecalho: false, amistoso: true }).then(t => { tela = t; })
    .catch(e => { $("amTatica").innerHTML = `<div class="card bad">Não consegui abrir a tática de amistoso: ${esc(e.message)}</div>`; });

  async function desenhar() {
    const [adv, parcerias, hist] = await Promise.all([B.adversariosDeAmistoso(clube.id), B.parceriasDoClube(clube.id), B.amistososDoClube(clube.id)]);
    const semSql = adv === undefined;
    const aceita = !!(await B.meuClube()).aceita_amistoso;
    const parDe = outro => (parcerias || []).find(p => (p.clube_a === clube.id && p.clube_b === outro) || (p.clube_b === clube.id && p.clube_a === outro)) || null;
    const linhaClube = a => {
      const c = cPor[a.clube_id]; if (!c) return "";
      const p = parDe(c.id);
      const parceria = !c.dono ? "" : a.parceiro ? `<span class="ok" title="Parceiro de treino: sem limite, mesmo com a opção desmarcada">parceiro</span>`
        : p && p.pedida_por === clube.id ? `<span class="mut">pedido enviado</span> <button type="button" class="sec" data-desfazer="${c.id}">cancelar</button>`
        : p ? "" : `<button type="button" class="sec" data-pedir="${c.id}" title="Parceiros jogam quantos amistosos quiserem, até contra o próximo adversário">pedir parceria</button>`;
      return `<div class="row" style="align-items:center;gap:8px;padding:4px 0;border-top:1px solid var(--line)">
        <span style="flex:1;min-width:160px">${esc(c.nome)} <span class="mut">· ${esc(B.nomeDoGrupo(c.grupo))}${c.dono ? "" : " · sem dirigente"}</span></span>
        ${a.motivo ? `<span class="mut">${esc(B.MOTIVO_AMISTOSO[a.motivo] || a.motivo)}</span>` : `<button type="button" data-jogar-clube="${c.id}">Jogar</button>`}${parceria}</div>`;
    };
    const dirigentes = semSql ? [] : adv.filter(a => cPor[a.clube_id] && cPor[a.clube_id].dono), semDono = semSql ? [] : adv.filter(a => cPor[a.clube_id] && !cPor[a.clube_id].dono);
    const pedidos = (parcerias || []).filter(p => !p.aceita_em && p.pedida_por !== clube.id);
    // histórico por adversário: placar para sempre; "ver" enquanto o replay existe (7 dias)
    const porAdv = {};
    for (const a of hist || []) { const o = a.desafiante === clube.id ? a.desafiado : a.desafiante; (porAdv[o] = porAdv[o] || []).push(a); }
    const historico = Object.entries(porAdv).map(([o, lista]) => {
      const pl = lista.map(a => placarDe(a, clube.id)).filter(Boolean), v = pl.filter(([m, d]) => m > d).length, e = pl.filter(([m, d]) => m === d).length;
      return `<details style="padding:4px 0;border-top:1px solid var(--line)"><summary>${esc((cPor[o] || {}).nome || "?")} <span class="mut">· ${lista.length} ${lista.length === 1 ? "jogo" : "jogos"}: ${v}V ${e}E ${pl.length - v - e}D</span></summary>
        ${lista.map(a => { const p = placarDe(a, clube.id), quando = new Date(a.criado_em).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
          return `<div class="row" style="gap:8px;align-items:center;margin:3px 0 3px 14px"><span class="mut">${quando}</span><span>${a.desafiante === clube.id ? "você desafiou" : "desafiou você"}</span>
            ${p ? `<b>${p[0]} × ${p[1]}</b>${a.tem_relatorio ? ` <button type="button" class="sec" data-ver="${a.id}">ver</button>` : ""}` : `<span class="mut">não terminou</span>`}</div>`; }).join("")}</details>`;
    }).join("");
    $("amPainel").innerHTML = `<h2 style="margin-top:0">Amistoso <span class="tag">não vale nada · sai na hora · com papéis e regras da T1</span></h2>
      ${aviso ? `<div style="margin-bottom:8px">${aviso}</div>` : ""}
      <div class="row" style="align-items:center;gap:14px">
        <label><input type="checkbox" id="amAceita" ${aceita ? "checked" : ""} ${semSql ? "disabled" : ""}> Aceitar amistosos</label>
        <label>Mando <select id="amMando"><option value="casa">Em casa</option><option value="fora" ${mando === "fora" ? "selected" : ""}>Fora</option></select></label></div>
      <div class="mut" style="font-size:13px;margin:4px 0 10px">Com a opção marcada, outros dirigentes que também marcaram podem desafiar você (1 por dia contra o mesmo clube, nunca contra o próximo adversário oficial). Você vê os jogos na Central. Parceiros de treino jogam sem limite. Quem desafia você joga contra a sua tática de amistoso; sem ela, contra a do campeonato.</div>
      ${semSql ? `<div class="aviso" style="margin-bottom:8px">Falta rodar o 165_amistosos.sql: por enquanto, só contra os bots de estilo.</div>` : ""}
      <h3>Bots de estilo</h3>
      ${ESTILOS_DE_BOT.map(e => `<div class="row" style="align-items:center;gap:8px;padding:4px 0;border-top:1px solid var(--line)"><span style="flex:1">${esc(NOME_DO_BOT(e))}</span><button type="button" data-jogar-bot="${e}">Jogar</button></div>`).join("")}
      ${pedidos.length ? `<h3>Pedidos de parceria</h3>${pedidos.map(p => { const o = p.pedida_por; return `<div class="row" style="align-items:center;gap:8px"><span style="flex:1">${esc((cPor[o] || {}).nome || "?")}</span><button type="button" data-aceitar="${o}">Aceitar</button><button type="button" class="sec" data-recusar="${o}">Recusar</button></div>`; }).join("")}` : ""}
      ${dirigentes.length ? `<h3>Clubes com dirigente</h3>${dirigentes.map(a => linhaClube(a) + (a.parceiro ? `<div style="text-align:right"><button type="button" class="sec" data-desfazer="${a.clube_id}">desfazer parceria</button></div>` : "")).join("")}` : ""}
      ${semDono.length ? `<details style="margin-top:10px"><summary><b>Clubes sem dirigente</b> <span class="mut">(${semDono.length}, jogam com a tática de bot)</span></summary>${semDono.map(linhaClube).join("")}</details>` : ""}
      ${historico ? `<h3>Histórico</h3>${historico}` : ""}`;
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
    if (e.target.id === "amMando") { mando = e.target.value; return; }
    if (e.target.id !== "amAceita") return;
    try { await B.aceitarAmistosos(clube.id, e.target.checked); aviso = ""; } catch (err) { aviso = `<span class="bad">${esc(err.message)}</span>`; }
    await desenhar();
  };
  await desenhar();
  return { sujo: () => !!tela && tela.sujo() };
}
