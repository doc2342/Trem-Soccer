// Entrada sem senha, compartilhada pelas telas: a pessoa recebe um e-mail com um link (e, quando o modelo do e-mail
// tiver o código, também um código para digitar).
import { sb, sessao, enviarCodigo, confirmarCodigo } from "./banco.js";

const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

// Desenha o formulário em `el` e chama aoMudar(sessão ou null) sempre que a pessoa entra ou sai.
export async function montarLogin(el, aoMudar) {
  let email = "", etapa = "email", aviso = "";
  const desenhar = () => {
    el.innerHTML = etapa === "email"
      ? `<h2>Entrar</h2><div class="mut" style="margin-bottom:8px">Sem senha: você recebe um e-mail com um link para entrar.</div>
         <form class="row" id="fEmail"><label style="flex:1;min-width:200px">E-mail<input id="lEmail" type="email" required autocomplete="email" value="${esc(email)}"></label><button>Enviar e-mail</button></form>`
      : `<h2>Confira o seu e-mail</h2><div style="margin-bottom:8px">Enviamos um e-mail para <b>${esc(email)}</b>. Abra-o neste aparelho e clique no link para entrar. Ele vale por alguns minutos; olhe também a caixa de spam.</div>
         <form class="row" id="fCodigo"><label>Se o e-mail trouxer um código, digite aqui<input id="lCodigo" inputmode="numeric" autocomplete="one-time-code" required style="width:160px;letter-spacing:3px"></label><button>Entrar com o código</button><button type="button" class="sec" id="lVoltar">Usar outro e-mail</button></form>`;
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
  const traduzir = m => /rate limit|security purposes/i.test(m) ? "Muitos pedidos de e-mail em pouco tempo. Espere um pouco e tente de novo." : /expired|invalid/i.test(m) ? "Código inválido ou vencido." : m;
  // O Supabase repete o aviso de login toda vez que a aba do navegador volta a ficar visível e quando renova a sessão;
  // a página só é redesenhada quando muda quem está logado, para não perder o que o dirigente estava fazendo.
  let quem;
  sb.auth.onAuthStateChange((_evento, s) => {
    const id = s && s.user ? s.user.id : null;
    if (id === quem) return;
    quem = id; el.hidden = !!s; if (!s) { etapa = "email"; desenhar(); } aoMudar(s);
  });
  const s = await sessao();
  el.hidden = !!s;
  if (!s) desenhar();
  return s;
}
