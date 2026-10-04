// Entrada por código enviado ao e-mail, compartilhada pelas telas.
import { sb, sessao, enviarCodigo, confirmarCodigo } from "./banco.js";

const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

// Desenha o formulário em `el` e chama aoMudar(sessão ou null) sempre que a pessoa entra ou sai.
export async function montarLogin(el, aoMudar) {
  let email = "", etapa = "email", aviso = "";
  const desenhar = () => {
    el.innerHTML = etapa === "email"
      ? `<h2>Entrar</h2><div class="mut" style="margin-bottom:8px">Sem senha: você recebe um código no e-mail.</div>
         <form class="row" id="fEmail"><label style="flex:1;min-width:200px">E-mail<input id="lEmail" type="email" required autocomplete="email" value="${esc(email)}"></label><button>Enviar código</button></form>`
      : `<h2>Digite o código</h2><div class="mut" style="margin-bottom:8px">Enviamos um código para ${esc(email)}. Ele vale por alguns minutos.</div>
         <form class="row" id="fCodigo"><label>Código<input id="lCodigo" inputmode="numeric" autocomplete="one-time-code" required style="width:160px;letter-spacing:3px"></label><button>Entrar</button><button type="button" class="sec" id="lVoltar">Usar outro e-mail</button></form>`;
    if (aviso) el.insertAdjacentHTML("beforeend", `<div class="bad" style="margin-top:8px">${esc(aviso)}</div>`);
    const fe = el.querySelector("#fEmail"), fc = el.querySelector("#fCodigo");
    if (fe) fe.onsubmit = async ev => {
      ev.preventDefault(); email = el.querySelector("#lEmail").value.trim(); aviso = "";
      const b = fe.querySelector("button"); b.disabled = true; b.textContent = "Enviando…";
      try { await enviarCodigo(email); etapa = "codigo"; } catch (e) { aviso = traduzir(e.message); }
      desenhar();
    };
    if (fc) {
      fc.onsubmit = async ev => {
        ev.preventDefault(); aviso = "";
        const b = fc.querySelector("button"); b.disabled = true; b.textContent = "Entrando…";
        try { await confirmarCodigo(email, el.querySelector("#lCodigo").value.trim()); } catch (e) { aviso = traduzir(e.message); desenhar(); }
      };
      el.querySelector("#lVoltar").onclick = () => { etapa = "email"; aviso = ""; desenhar(); };
    }
  };
  const traduzir = m => /rate limit|security purposes/i.test(m) ? "Muitos pedidos de código em pouco tempo. Espere um pouco e tente de novo." : /expired|invalid/i.test(m) ? "Código inválido ou vencido." : m;
  sb.auth.onAuthStateChange((_evento, s) => { el.hidden = !!s; if (!s) { etapa = "email"; desenhar(); } aoMudar(s); });
  const s = await sessao();
  el.hidden = !!s;
  if (!s) desenhar();
  return s;
}
