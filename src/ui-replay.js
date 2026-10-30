// Replay acelerado de um jogo já calculado (amistoso): placar e minuto correndo, a narração lance a lance no minuto dela,
// velocidade ajustável e "pular para o relatório". O jogo inteiro leva ~segundos (1×); no fim aparece o relatório completo.
import { htmlLance, htmlRelatorio } from "./ui-relatorio.js";
import { ligarGraficos } from "./ui-graficos.js";

const FIM_DO_PERIODO = [45, 90, 105, 120];
// minuto corrido do jogo, contando os acréscimos dos períodos anteriores (o 46' vem depois do 45+3')
const corrido = (l, acrescimos) => {
  const p = Math.max(0, FIM_DO_PERIODO.findIndex(f => l.min <= f));
  return l.min + (l.ac || 0) + acrescimos.slice(0, p).reduce((s, a) => s + a, 0);
};

// opcoesDoRelatorio: o que htmlRelatorio recebe além dos nomes (analistas, ordens, clubes)
export function abrirReplay(raiz, { partida, relatorio, nomes, segundos = 60, ...opcoesDoRelatorio }) {
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const acr = partida.acrescimos || [], total = (partida.duracao || 90) + acr.reduce((s, a) => s + a, 0);
  const lances = (partida.narracao || []).filter(l => l.tipo !== "inicio").map(l => ({ l, x: corrido(l, acr) })).sort((a, b) => a.x - b.x);
  raiz.innerHTML = `<dialog class="replay" style="width:min(760px,96vw);max-height:92vh;padding:0;border:0;border-radius:12px;background:var(--card);color:var(--tx)">
    <div style="position:sticky;top:0;background:inherit;padding:12px 14px;border-bottom:1px solid var(--line);z-index:1">
      <div style="display:flex;align-items:center;gap:10px;font-size:20px;font-weight:800"><span style="flex:1;text-align:right">${esc(nomes[0])}</span>
        <span data-r="placar" style="font-variant-numeric:tabular-nums">0 × 0</span><span style="flex:1">${esc(nomes[1])}</span></div>
      <div style="display:flex;align-items:center;gap:8px;margin-top:8px;flex-wrap:wrap"><span data-r="min" class="mut" style="font-variant-numeric:tabular-nums;min-width:52px">0'</span>
        <span role="group" aria-label="Velocidade">${[0.5, 1, 2].map(v => `<button type="button" class="sec" data-vel="${v}" aria-pressed="${v === 1}">${String(v).replace(".", ",")}×</button>`).join(" ")}</span>
        <button type="button" data-r="pular" style="margin-left:auto">Pular para o relatório</button><button type="button" class="sec" data-r="fechar" aria-label="Fechar">×</button></div></div>
    <div data-r="corpo" style="padding:10px 14px"><div data-r="lances"></div></div></dialog>`;
  const dlg = raiz.querySelector("dialog"), q = k => raiz.querySelector(`[data-r="${k}"]`);
  let t = 0, vel = 1, mostrados = 0, gols = [0, 0], relogio = null;
  const mostrarRelatorio = () => {
    clearInterval(relogio); relogio = null;
    q("placar").textContent = `${partida.placar[0]} × ${partida.placar[1]}`; q("min").textContent = "Fim de jogo"; q("pular").hidden = true;
    raiz.querySelectorAll("[data-vel]").forEach(b => { b.hidden = true; });
    q("corpo").innerHTML = htmlRelatorio(relatorio, { nomes, ...opcoesDoRelatorio });
    ligarGraficos(q("corpo"));
  };
  const passo = () => {
    t += 0.1 * vel;
    const agora = t / segundos * total;
    let novos = "";
    while (mostrados < lances.length && lances[mostrados].x <= agora) {
      const { l } = lances[mostrados++];
      if (l.resultado === "gol" && l.tipo !== "cobranca") gols[l.time]++;
      novos = htmlLance(l, nomes) + novos; // o mais novo em cima
    }
    if (novos) q("lances").insertAdjacentHTML("afterbegin", novos);
    q("placar").textContent = `${gols[0]} × ${gols[1]}`;
    q("min").textContent = Math.min(Math.floor(agora), total) + "'";
    if (agora >= total && mostrados >= lances.length) mostrarRelatorio();
  };
  raiz.onclick = e => {
    const v = e.target.closest("[data-vel]");
    if (v) { vel = +v.dataset.vel; raiz.querySelectorAll("[data-vel]").forEach(b => b.setAttribute("aria-pressed", b === v)); }
    else if (e.target.closest('[data-r="pular"]')) mostrarRelatorio();
    else if (e.target.closest('[data-r="fechar"]')) dlg.close();
  };
  const parar = () => { clearInterval(relogio); relogio = null; };
  dlg.addEventListener("close", parar);
  dlg.showModal();
  relogio = setInterval(passo, 100);
  return { parar };
}
