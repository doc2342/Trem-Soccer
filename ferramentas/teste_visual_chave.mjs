// Confere a chave do visual novo e o tema no atualiza.js (mo_visual → data-visual, trem.css, claro como padrão com a chave):
// node ferramentas/teste_visual_chave.mjs
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
const codigo = fs.readFileSync(new URL("../atualiza.js", import.meta.url), "utf8");

// roda o atualiza.js num navegador de mentira; armazenado: o localStorage inicial; claroDoAparelho e search: o aparelho e o endereço
function roda(armazenado, { claroDoAparelho = false, search = "" } = {}) {
  const loja = { ...armazenado }, raiz = {}, links = [], nada = () => {};
  const elemento = () => ({ style: {}, setAttribute(k, v) { this[k] = v; } });
  const localStorage = { getItem: k => k in loja ? loja[k] : null, setItem: (k, v) => { loja[k] = String(v); }, removeItem: k => { delete loja[k]; } };
  const document = {
    documentElement: { setAttribute: (k, v) => { raiz[k] = v; }, removeAttribute: k => { delete raiz[k]; }, style: { setProperty: nada, removeProperty: nada } },
    head: { appendChild: el => { if (el.rel === "stylesheet") links.push(el.href); } },
    createElement: elemento, querySelector: () => null, querySelectorAll: () => [], getElementById: () => null, addEventListener: nada, body: { appendChild: nada },
  };
  const window = { matchMedia: () => ({ matches: claroDoAparelho, addEventListener: nada }), addEventListener: nada };
  const contexto = { window, document, localStorage, sessionStorage: { getItem: () => null, setItem: nada, removeItem: nada }, matchMedia: window.matchMedia,
    location: { search, reload: nada }, fetch: () => new Promise(nada), setInterval: nada, setTimeout: nada, addEventListener: nada };
  vm.runInNewContext(codigo, contexto);
  return { raiz, links, armazenado: loja };
}

// sem a chave: como hoje (aparelho escuro e mo_tema vazio → escuro), sem data-visual e sem trem.css
assert.equal(roda({ mo_tema: "" }, { claroDoAparelho: false }).raiz["data-tema"], "escuro");
assert.equal(roda({}, {}).raiz["data-visual"], undefined);
assert.equal(roda({}, {}).links.length, 0);
// com a chave: claro por padrão, trem.css uma vez
const r = roda({ mo_visual: "novo" }, { claroDoAparelho: false });
assert.equal(r.raiz["data-visual"], "novo");
assert.equal(r.raiz["data-tema"], "claro");
assert.deepEqual(r.links, ["trem.css"]);
// com a chave: escuro escolhido e automático
assert.equal(roda({ mo_visual: "novo", mo_tema: "escuro" }, {}).raiz["data-tema"], "escuro");
assert.equal(roda({ mo_visual: "novo", mo_tema: "auto" }, { claroDoAparelho: false }).raiz["data-tema"], "escuro");
assert.equal(roda({ mo_visual: "novo", mo_tema: "auto" }, { claroDoAparelho: true }).raiz["data-tema"], "claro");
// sem a chave, "auto" também segue o aparelho
assert.equal(roda({ mo_tema: "auto" }, { claroDoAparelho: true }).raiz["data-tema"], "claro");
// pelo endereço
assert.equal(roda({}, { search: "?visual=novo" }).armazenado.mo_visual, "novo");
assert.equal(roda({}, { search: "?visual=novo" }).raiz["data-visual"], "novo");
assert.equal(roda({ mo_visual: "novo" }, { search: "?visual=velho" }).armazenado.mo_visual, undefined);
assert.equal(roda({ mo_visual: "novo" }, { search: "?visual=velho" }).raiz["data-visual"], undefined);
