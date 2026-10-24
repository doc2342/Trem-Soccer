// Peças do visual novo (docs/superpowers/specs/2026-10-24-redesign-identidade-design.md): cada uma devolve HTML em texto,
// como as telas já montam. O estilo está no trem.css. Todo texto recebido é escapado; só `lado` (faixa) entra como HTML.

export const esc = s => s == null ? "" : String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

export const rotulo = texto => `<div class="t-rotulo">${esc(texto)}</div>`;

// faixa de foco: UMA por tela. titulo + apagado ("4º lugar ·" / "8 rodadas"); destaque em negrito antes da frase; lado: HTML (gráfico, números)
export function faixa({ rotulo: r, titulo, apagado, destaque, frase, lado }) {
  const texto = [destaque ? `<b>${esc(destaque)}</b>` : "", esc(frase || "")].filter(Boolean).join(" ");
  return `<section class="t-faixa t-sangra"><div>${rotulo(r)}<h1 class="t-faixa-titulo">${esc(titulo)}${apagado ? ` <span class="t-apagado">${esc(apagado)}</span>` : ""}</h1>`
    + `${texto ? `<p class="t-faixa-frase">${texto}</p>` : ""}</div>${lado ? `<div class="t-faixa-lado">${lado}</div>` : ""}</section>`;
}

export const numero = ({ rotulo: r, valor, sufixo, legenda }) => `<div class="t-numero">${r ? `<div class="t-numero-rotulo">${esc(r)}</div>` : ""}`
  + `<div class="t-numero-valor">${esc(valor)}${sufixo ? `<small>${esc(sufixo)}</small>` : ""}</div>${legenda ? `<div class="t-numero-legenda">${esc(legenda)}</div>` : ""}</div>`;

// tipo: "principal" (cor do clube), "normal" (tinta) ou "link" (sublinhado na marca). abaIr → botão; href → link
export function botao({ texto, abaIr, href, tipo = "normal" }) {
  const classe = "t-botao" + (tipo === "principal" ? " t-botao-principal" : tipo === "link" ? " t-botao-link" : "");
  return href ? `<a class="${classe}" href="${esc(href)}">${esc(texto)}</a>`
    : `<button type="button" class="${classe}"${abaIr ? ` data-aba-ir="${esc(abaIr)}"` : ""}>${esc(texto)}</button>`;
}

const NOME_DO_TIPO = { funcionou: "Funcionou", falhou: "Falhou", atencao: "Atenção", desfalque: "Desfalque", resultado: "O jogo", bloqueada: "Analista" };
// leitura: dado → frase → ação. Mesmo formato que src/leituras.js devolve
export const leitura = ({ tipo, titulo, frase, acao }) => `<article class="t-leitura" data-tipo="${esc(tipo)}"><div class="t-leitura-tipo">${esc(NOME_DO_TIPO[tipo] || tipo)}</div>`
  + `<h3 class="t-leitura-titulo">${esc(titulo)}</h3><p class="t-leitura-frase">${esc(frase)}</p>${acao ? botao(acao) : ""}</article>`;

export const leituras = lista => lista && lista.length ? `<div class="t-leituras">${lista.map(leitura).join("")}</div>` : "";

// as abas do jogo como estações de uma linha; Ajustes fica fora (abre pelo nome do clube no topo)
export const ESTACOES = [
  { aba: "inicio", nome: "Central" }, { aba: "elenco", nome: "Elenco" }, { aba: "tatica", nome: "Tática" }, { aba: "base", nome: "Base" },
  { aba: "mercado", nome: "Mercado", curto: "Merc." }, { aba: "clube", nome: "Clube" }, { aba: "classificacao", nome: "Liga" },
];
export const linhaDeEstacoes = (estacoes, atual) => `<nav class="t-linha" id="abas" aria-label="Abas do clube">${estacoes.map(e =>
  `<button type="button" class="t-estacao${e.aba === atual ? " ativa" : ""}" data-aba="${esc(e.aba)}"${e.aba === atual ? ' aria-current="page"' : ""}>`
  + (e.curto ? `<span class="t-longo">${esc(e.nome)}</span><span class="t-curto">${esc(e.curto)}</span>` : esc(e.nome)) + `</button>`).join("")}</nav>`;

// posição rodada a rodada (1º no alto). total: clubes no grupo; linha: última posição da zona boa (tracejada), se houver
export function graficoDePosicoes(posicoes, total, linha) {
  if (!posicoes || !posicoes.length) return "";
  const L = 320, A = 150, m = { e: 28, d: 46, t: 12, b: 22 }, n = posicoes.length;
  const x = i => m.e + (n === 1 ? (L - m.e - m.d) / 2 : i * (L - m.e - m.d) / (n - 1)), y = p => m.t + (p - 1) * (A - m.t - m.b) / Math.max(1, total - 1);
  const marcas = [1, Math.ceil(total / 2), total].filter((v, i, a) => a.indexOf(v) === i);
  const ultimo = posicoes[n - 1];
  return `<svg class="t-grafico" viewBox="0 0 ${L} ${A}" role="img" aria-label="Posição rodada a rodada: ${ultimo}º agora">`
    + marcas.map(p => `<line class="t-grafico-grade" x1="${m.e}" x2="${L - m.d}" y1="${y(p)}" y2="${y(p)}"/><text x="0" y="${y(p) + 4}">${p}º</text>`).join("")
    + (linha ? `<line class="t-grafico-zona" x1="${m.e}" x2="${L - m.d}" y1="${y(linha)}" y2="${y(linha)}"/>` : "")
    + (n > 1 ? `<polyline class="t-grafico-linha" points="${posicoes.map((p, i) => `${x(i).toFixed(1)},${y(p).toFixed(1)}`).join(" ")}"/>` : "")
    + `<circle class="t-grafico-ponto" cx="${x(n - 1).toFixed(1)}" cy="${y(ultimo).toFixed(1)}" r="5"/><text x="${(x(n - 1) + 9).toFixed(1)}" y="${(y(ultimo) + 4).toFixed(1)}">${ultimo}º</text>`
    + `<text x="${m.e}" y="${A - 4}">R1</text><text x="${(L - m.d - 18).toFixed(0)}" y="${A - 4}">R${n}</text></svg>`;
}
