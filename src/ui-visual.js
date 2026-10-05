// Editor do escudo e dos uniformes (titular e reserva), usado na criação do clube e nas Configurações.
// F: { escudo, uniforme } (alterado no lugar); opcoes.sigla(): sigla para a prévia; opcoes.aoMudar(): avisa que algo mudou.
import { svgEscudo, svgUniforme, FORMAS, PADROES, SIMBOLOS, GOLAS, CORES } from "./escudo.js";

const esc = s => String(s == null ? "" : s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const hex = c => /^#[0-9a-fA-F]{6}$/.test(c || "");

export function editorVisual(raiz, F, opcoes = {}) {
  const sigla = () => (opcoes.sigla ? opcoes.sigla() : "") || "ABC";
  let qual = "titular"; // uniforme que está sendo editado
  F.uniforme = F.uniforme || {}; F.escudo = F.escudo || {};
  const alvo = a => a === "escudo" ? F.escudo : qual === "reserva" ? (F.uniforme.reserva = F.uniforme.reserva || { padrao: "liso", cor1: F.uniforme.cor2 || "#ffffff", cor2: F.uniforme.cor1 || "#0b3d91" }) : F.uniforme;
  const opc = (obj, atual) => Object.entries(obj).map(([k, n]) => `<option value="${k}" ${k === atual ? "selected" : ""}>${n}</option>`).join("");
  // paleta: cores prontas, uma cor livre e, nos campos opcionais, a opção automática
  const paleta = (a, campo, rotulo, automatico) => { const atual = alvo(a)[campo];
    return `<label class="ev-cor">${rotulo}<div class="cores">${automatico ? `<span data-cor="" data-alvo="${a}" data-campo="${campo}" class="${!hex(atual) ? "sel" : ""}" title="${esc(automatico)}" style="background:repeating-linear-gradient(45deg,#2a3542 0 4px,#1a222c 4px 8px)"></span>` : ""}
      ${CORES.map(c => `<span data-cor="${c}" data-alvo="${a}" data-campo="${campo}" class="${atual === c ? "sel" : ""}" style="background:${c}"></span>`).join("")}
      <input type="color" data-livre="1" data-alvo="${a}" data-campo="${campo}" value="${hex(atual) ? atual : "#888888"}" title="Outra cor" style="width:28px;height:24px;padding:0;border:none;background:none"></div></label>`; };
  const previa = () => `${svgEscudo({ ...F.escudo, img: null }, sigla(), 110)}<div style="text-align:center">${svgUniforme(F.uniforme, 74)}<div class="mut" style="font-size:11px">titular</div></div>
    <div style="text-align:center">${svgUniforme(F.uniforme.reserva || {}, 74)}<div class="mut" style="font-size:11px">reserva</div></div>`;
  const desenhar = () => {
    const u = alvo("uniforme"), e = F.escudo;
    raiz.innerHTML = `<div class="previa ev-previa">${previa()}</div>
      <details open style="margin-top:10px"><summary><b>Escudo</b></summary>
        <div class="row" style="margin-top:6px"><label>Forma<select data-alvo="escudo" data-campo="forma">${opc(FORMAS, e.forma || "escudo")}</select></label>
          <label>Desenho<select data-alvo="escudo" data-campo="padrao">${opc(PADROES, e.padrao || "liso")}</select></label>
          <label>Símbolo<select data-alvo="escudo" data-campo="simbolo">${opc(SIMBOLOS, e.simbolo || "sigla")}</select></label>
          <label>Estrelas<select data-alvo="escudo" data-campo="estrelas">${[0, 1, 2, 3, 4, 5].map(n => `<option value="${n}" ${(+e.estrelas || 0) === n ? "selected" : ""}>${n || "nenhuma"}</option>`).join("")}</select></label></div>
        <div class="row" style="margin-top:6px">${paleta("escudo", "cor1", "Cor principal")}${paleta("escudo", "cor2", "Segunda cor")}${paleta("escudo", "cor3", "Cor do símbolo e das estrelas", "automática")}</div>
      </details>
      <details open style="margin-top:10px"><summary><b>Uniforme</b></summary>
        <div class="subabas" style="margin:6px 0">${[["titular", "Titular"], ["reserva", "Reserva"]].map(([k, n]) => `<button type="button" class="sub ${qual === k ? "ativa" : ""}" data-qual="${k}">${n}</button>`).join("")}</div>
        ${qual === "reserva" ? `<div class="mut" style="font-size:12px;margin-bottom:6px">O reserva entra quando a sua camisa titular se parece com a do adversário.</div>` : ""}
        <div class="row"><label>Desenho da camisa<select data-alvo="uniforme" data-campo="padrao">${opc(Object.fromEntries(Object.entries(PADROES).filter(([k]) => k !== "borda")), u.padrao || "liso")}</select></label>
          <label>Gola<select data-alvo="uniforme" data-campo="golaTipo">${opc(GOLAS, u.golaTipo || "redonda")}</select></label></div>
        <div class="row" style="margin-top:6px">${paleta("uniforme", "cor1", "Cor principal")}${paleta("uniforme", "cor2", "Segunda cor")}${paleta("uniforme", "manga", "Mangas", "iguais à camisa")}</div>
        <div class="row" style="margin-top:6px">${paleta("uniforme", "gola", "Gola", "automática")}${paleta("uniforme", "calcao", "Calção")}${paleta("uniforme", "meiao", "Meião", "igual ao calção")}</div>
      </details>`;
  };
  const mudou = () => { if (opcoes.aoMudar) opcoes.aoMudar(); };
  const definir = (a, campo, valor) => { const o = alvo(a); if (valor === "" || valor == null) delete o[campo]; else o[campo] = campo === "estrelas" ? +valor : valor; mudou(); desenhar(); };
  raiz.onclick = ev => { const t = ev.target, d = t.dataset;
    if (d.qual) { qual = d.qual; desenhar(); return; }
    if (d.cor !== undefined && d.alvo) definir(d.alvo, d.campo, d.cor); };
  raiz.onchange = ev => { const t = ev.target, d = t.dataset;
    if (d.alvo && (t.tagName === "SELECT" || d.livre)) definir(d.alvo, d.campo, t.value); };
  raiz.oninput = ev => { const t = ev.target; if (t.dataset.livre) { const o = alvo(t.dataset.alvo); o[t.dataset.campo] = t.value; raiz.querySelector(".ev-previa").innerHTML = previa(); } };
  desenhar();
  return { atualizarPrevia: () => { const p = raiz.querySelector(".ev-previa"); if (p) p.innerHTML = previa(); } };
}

// Reduz a imagem escolhida para 128 x 128 (cabendo inteira, fundo transparente) e devolve um WebP (ou PNG) de até 100 KB.
export async function reduzirImagem(arquivo, lado = 128, limite = 100 * 1024) {
  if (!/^image\//.test(arquivo.type)) throw new Error("Escolha uma imagem (PNG, JPG ou WebP).");
  if (arquivo.size > 8 * 1024 * 1024) throw new Error("Imagem grande demais (mais de 8 MB).");
  const img = await new Promise((ok, falha) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => falha(new Error("Não consegui abrir a imagem.")); i.src = URL.createObjectURL(arquivo); });
  const tela = document.createElement("canvas"); tela.width = tela.height = lado;
  const k = Math.min(lado / img.naturalWidth, lado / img.naturalHeight), w = img.naturalWidth * k, h = img.naturalHeight * k;
  const ctx = tela.getContext("2d"); ctx.imageSmoothingQuality = "high"; ctx.drawImage(img, (lado - w) / 2, (lado - h) / 2, w, h);
  URL.revokeObjectURL(img.src);
  const blob = (tipo, q) => new Promise(ok => tela.toBlob(ok, tipo, q));
  for (const q of [0.92, 0.8, 0.6]) { const b = await blob("image/webp", q); if (b && b.type === "image/webp" && b.size <= limite) return b; }
  const png = await blob("image/png"); // navegador sem WebP
  if (png && png.size <= limite) return png;
  throw new Error("A imagem passou de 100 KB mesmo reduzida. Tente outra mais simples.");
}
