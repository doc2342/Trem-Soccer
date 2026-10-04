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

// Desenho do campinho: cada fila é uma faixa do campo (ataque, meia, meio, volantes e alas juntos, defesa, gol).
// Quem joga pelo lado fica na ponta da fila e os de centro no meio, numa grade de 10 colunas em que cada jogador ocupa 2.
// Devolve [{ grade, itens: [{ x, col }] }]; com mais de 3 jogadores de centro (ou 2 do mesmo lado) a fila volta a ser distribuída por igual.
const FAIXA_DO_CAMPO = { ataque: 0, meia: 1, meio: 2, volante: 3, ala: 3, defesa: 4, gol: 5 };
export function filasDoCampo(itens, posDe) {
  const filas = [[], [], [], [], [], []];
  itens.forEach(x => { const p = POSICOES[posDe(x)]; filas[p ? FAIXA_DO_CAMPO[p.linha] : 2].push(x); });
  const lado = x => (POSICOES[posDe(x)] || {}).lado || "C";
  return filas.filter(f => f.length).map(f => {
    const E = f.filter(x => lado(x) === "E"), C = f.filter(x => lado(x) === "C"), D = f.filter(x => lado(x) === "D");
    if (C.length > 3 || E.length > 1 || D.length > 1) return { grade: false, itens: [...E, ...C, ...D].map(x => ({ x, col: 0 })) };
    const centro = C.length === 3 ? [3, 5, 7] : C.length === 2 ? [4, 6] : [5];
    return { grade: true, itens: [...E.map(x => ({ x, col: 1 })), ...C.map((x, k) => ({ x, col: centro[k] })), ...D.map(x => ({ x, col: 9 }))] };
  });
}
