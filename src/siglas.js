import { POSICOES } from "./modelo.js";
// Siglas das posições na tela. Por dentro (motor, táticas salvas, banco) o jogo usa sempre os códigos do Dugout;
// aqui só se escolhe como eles aparecem. A escolha de cada dirigente fica guardada no aparelho.
// As siglas em português ainda são provisórias: a turma vai fechar a lista.
export const SIGLAS_PT = {
  GK: "GOL", DC: "ZAG", SW: "LIB", DR: "LD", DL: "LE", WBR: "AD", WBL: "AE", DMC: "VOL",
  MC: "MC", MR: "MD", ML: "ME", AMC: "MEI", AMR: "MAD", AML: "MAE", RW: "PD", LW: "PE", FC: "ATA", SC: "CA",
};
export function formatoDasSiglas() {
  try { return localStorage.getItem("mo_siglas") === "pt" ? "pt" : "en"; } catch (e) { return "en"; }
}
export function definirSiglas(formato) {
  try { localStorage.setItem("mo_siglas", formato === "pt" ? "pt" : "en"); } catch (e) {}
}
// sigla de uma posição no formato escolhido (RES, do banco, e textos desconhecidos passam como estão)
export const sg = pos => formatoDasSiglas() === "pt" ? (SIGLAS_PT[pos] || pos) : pos;
// pastilha da posição: a sigla no formato escolhido e, ao passar o mouse, o nome completo
export const pp = pos => `<span class="pp" title="${POSICOES[pos] ? POSICOES[pos].nome : ""}">${sg(pos || "")}</span>`;
