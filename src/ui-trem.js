// Peças do visual novo (docs/superpowers/specs/2026-10-24-redesign-identidade-design.md): cada uma devolve HTML em texto,
// como as telas já montam. O estilo está no trem.css. Todo texto recebido é escapado; só `lado` (faixa) entra como HTML.
import { ATRIBUTOS } from "./modelo.js";

export const esc = s => s == null ? "" : String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

export const rotulo = texto => `<div class="t-rotulo">${esc(texto)}</div>`;

// faixa de foco: UMA por tela. titulo + apagado ("4º lugar ·" / "8 rodadas"); destaque em negrito antes da frase; lado: HTML (gráfico, números)
// carimbo: [texto, linha de baixo] — o estado decidido (campeão, vaga, queda) carimbado à direita do título, no lugar do destaque e da frase
export function faixa({ rotulo: r, titulo, apagado, destaque, frase, lado, numeros, carimbo }) { // numeros: HTML (a linha de números embaixo da frase)
  const texto = carimbo ? "" : [destaque ? `<b>${esc(destaque)}</b>` : "", esc(frase || "")].filter(Boolean).join(" ");
  return `<section class="t-faixa t-sangra"><div class="t-faixa-texto${carimbo ? " t-com-carimbo" : ""}">${rotulo(r)}<h1 class="t-faixa-titulo">${esc(titulo)}${apagado ? ` <span class="t-apagado">${esc(apagado)}</span>` : ""}</h1>`
    + `${carimbo ? `<div class="t-carimbo t-faixa-carimbo">${esc(carimbo[0])}${carimbo[1] ? `<small>${esc(carimbo[1])}</small>` : ""}</div>` : ""}`
    + `${texto ? `<p class="t-faixa-frase">${texto}</p>` : ""}${numeros ? `<div class="t-faixa-numeros">${numeros}</div>` : ""}</div>${lado ? `<div class="t-faixa-lado">${lado}</div>` : ""}</section>`;
}

export const numero = ({ rotulo: r, valor, sufixo, legenda, tom }) => `<div class="t-numero">${r ? `<div class="t-numero-rotulo">${esc(r)}</div>` : ""}` // tom: "ok" | "bad" (valor em verde ou vermelho)
  + `<div class="t-numero-valor${tom ? " " + tom : ""}">${esc(valor)}${sufixo ? `<small>${esc(sufixo)}</small>` : ""}</div>${legenda ? `<div class="t-numero-legenda">${esc(legenda)}</div>` : ""}</div>`;

// tipo: "principal" (cor do clube), "normal" (tinta) ou "link" (sublinhado na marca). abaIr → botão; href → link
export function botao({ texto, abaIr, href, tipo = "normal" }) {
  const classe = "t-botao" + (tipo === "principal" ? " t-botao-principal" : tipo === "link" ? " t-botao-link" : "");
  return href ? `<a class="${classe}" href="${esc(href)}">${esc(texto)}</a>`
    : `<button type="button" class="${classe}"${abaIr ? ` data-aba-ir="${esc(abaIr)}"` : ""}>${esc(texto)}</button>`;
}

// destaque de jornal: os números da frase em negrito (63%, 2,03, 2 jogos, 3 pontos); escapa antes, então não abre brecha para HTML
export const destacar = texto => esc(texto).replace(/\d+(?:[.,]\d+)?%?(?: (?:jogos?|pontos?|rodadas?|mi|mil)\b)?/g, n => `<b>${n}</b>`);

// manchete: num item de mural (html já montado), o começo do texto em negrito, até os dois-pontos ou o fim da primeira frase.
// Só mexe quando esse trecho é texto ou link de clube (<a>); com outra tag no meio, devolve o item como veio
export const manchete = html => html.replace(/^(\s*<div[^>]*>(?:<span class="ic">[^<]*<\/span>)?<span class="[^"]*">)((?:[^<]|<a [^>]*>[^<]*<\/a>){3,200}?[:.])(?=\s|<\/span>)/, "$1<b>$2</b>");

const NOME_DO_TIPO = { funcionou: "Funcionou", falhou: "Falhou", atencao: "Atenção", desfalque: "Desfalque", resultado: "O jogo", bloqueada: "Analista" };
// leitura: dado → frase → ação. Mesmo formato que src/leituras.js devolve
export const leitura = ({ tipo, titulo, frase, acao }) => `<article class="t-leitura" data-tipo="${esc(tipo)}"><div class="t-leitura-tipo">${esc(NOME_DO_TIPO[tipo] || tipo)}</div>`
  + `<h3 class="t-leitura-titulo">${esc(titulo)}</h3><p class="t-leitura-frase">${destacar(frase)}</p>${acao ? botao(acao) : ""}</article>`;

export const leituras = lista => lista && lista.length ? `<div class="t-leituras">${lista.map(leitura).join("")}</div>` : "";

// as abas do jogo como estações de uma linha; Ajustes fica fora (abre pelo nome do clube no topo)
export const ESTACOES = [
  { aba: "inicio", nome: "Central" }, { aba: "clube", nome: "Clube" }, { aba: "elenco", nome: "Elenco" }, { aba: "tatica", nome: "Tática" }, { aba: "base", nome: "Base" },
  { aba: "mercado", nome: "Mercado", curto: "Merc." }, { aba: "classificacao", nome: "Competições", curto: "Compet." },
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

// campo do vestiário: as 9 zonas (ataque em cima, defesa embaixo). Ataque e meio: a taxa de duelos que vencemos ali (nossas zonas).
// Defesa: quanto seguramos o ataque deles na zona espelhada (o ataque pela esquerda deles chega na nossa defesa direita) — a mesma conta
// da leitura "falhou". nossas/deles: { AE: [ganhos, perdidos], ... } do relatório; destaques: zonas citadas pelas leituras. Menos de 6 duelos: sem número.
const NOMES_DAS_ZONAS = { AE: "ataque pela esquerda", AC: "ataque pelo centro", AD: "ataque pela direita", ME: "meio esquerdo", MC: "centro do meio", MD: "meio direito", DE: "defesa esquerda", DC: "centro da defesa", DD: "defesa direita" };
const ESPELHO_DA_DEFESA = { DD: "AE", DC: "AC", DE: "AD" };
export function campoDeZonas(nossas, deles, destaques = []) {
  if (!nossas) return "";
  const taxa = z => { if (ESPELHO_DA_DEFESA[z]) { const [g, p] = (deles || {})[ESPELHO_DA_DEFESA[z]] || [0, 0]; return g + p >= 6 ? p / (g + p) : null; }
    const [g, p] = nossas[z] || [0, 0]; return g + p >= 6 ? g / (g + p) : null; };
  return `<div class="t-campo" role="img" aria-label="Duelos vencidos por zona">${["AE", "AC", "AD", "ME", "MC", "MD", "DE", "DC", "DD"].map(z => {
    const t = taxa(z), nivel = t == null ? "pouco" : t >= 0.55 ? "bom" : t <= 0.45 ? "ruim" : "meio";
    return `<div class="t-zona${destaques.includes(z) ? " t-zona-destaque" : ""}" data-zona="${z}" data-nivel="${nivel}" title="${NOMES_DAS_ZONAS[z]}"><b>${t == null ? "—" : Math.round(t * 100) + "%"}</b></div>`;
  }).join("")}</div>`;
}

// régua do último jogo: uma linha por estatística, nós à esquerda e eles à direita, a barra dividida na proporção; o maior em negrito.
// nos/eles: a estatística do relatório (xg, posse, finalizacoes, noGol, faltas, escanteios)
const LINHAS_DA_REGUA = [["xg", "xG", v => v.toFixed(2).replace(".", ",")], ["posse", "Posse", v => Math.round(v) + "%"], ["finalizacoes", "Finalizações"], ["noGol", "No gol"], ["faltas", "Faltas"], ["escanteios", "Escanteios"]];
export function reguaDoJogo(nos, eles) {
  if (!nos || !eles) return "";
  return `<div class="t-regua">${LINHAS_DA_REGUA.filter(([k]) => nos[k] != null && eles[k] != null).map(([k, nome, f = v => String(Math.round(v))]) => {
    const a = +nos[k] || 0, b = +eles[k] || 0, pct = a + b ? Math.round(100 * a / (a + b)) : 50, lado = (v, maior) => maior ? `<b>${f(v)}</b>` : `<span>${f(v)}</span>`;
    return `<div class="t-regua-linha" style="--nos:${pct}%">${lado(a, a > b)}<span class="t-regua-nome">${nome}</span>${lado(b, b > a)}</div>`;
  }).join("")}</div>`;
}

// polígono com a média de cada grupo de atributos (1 a 50)
export const poligonoDeAtributos = j => {
  const grupos = (j.pos === "GK" ? [GRUPOS_DE_ATRIBUTOS[4], ...GRUPOS_DE_ATRIBUTOS.slice(0, 4)] : GRUPOS_DE_ATRIBUTOS.slice(0, 4)).map(([nome, g]) => { const v = ATRIBUTOS.map((a, k) => a.grupo === g ? j.at[k] : null).filter(x => x != null); return [nome, v.reduce((s, x) => s + x, 0) / v.length]; });
  const n = grupos.length, R = 44, pt = (k, r) => { const ang = -Math.PI / 2 + 2 * Math.PI * k / n; return [110 + r * Math.cos(ang), 68 + r * Math.sin(ang)]; }, xy = p => p.map(x => x.toFixed(1)).join(",");
  const aro = f => grupos.map((_, k) => xy(pt(k, R * f))).join(" ");
  return `<svg viewBox="0 0 220 136" width="220" height="136" style="display:block;margin:0 auto 6px" role="img" aria-label="Médias: ${grupos.map(([g, v]) => g + " " + Math.round(v)).join(", ")}">
    ${[0.25, 0.5, 0.75, 1].map(f => `<polygon points="${aro(f)}" fill="none" stroke="var(--line)" stroke-width="0.7"/>`).join("")}
    <polygon points="${grupos.map(([, v], k) => xy(pt(k, R * Math.max(0.04, v / 50)))).join(" ")}" fill="var(--ac)" fill-opacity="0.3" stroke="var(--ac)" stroke-width="1.5"/>
    ${grupos.map(([g, v], k) => { const [x, y] = pt(k, R + 8); return `<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" text-anchor="${x > 115 ? "start" : x < 105 ? "end" : "middle"}" dominant-baseline="middle" font-size="10" fill="var(--mut)">${g} <tspan font-weight="700" fill="currentColor">${Math.round(v)}</tspan></text>`; }).join("")}</svg>`;
};
export const GRUPOS_DE_ATRIBUTOS = [["Técnica", "tec"], ["Defesa", "def"], ["Físico", "fis"], ["Mental", "men"], ["Goleiro", "gol"]];
// campo do visual novo: altura (% do campo, de cima) de cada faixa: ataque, meia, meio, volante/ala, defesa, gol. O meio fica no círculo central
export const ALTURA_DA_FAIXA = [14, 31, 48, 63, 77, 94];
