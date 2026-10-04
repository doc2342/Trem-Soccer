// Evita que o navegador misture arquivos novos e antigos do jogo depois de uma atualização.
// 1. A cada abertura, confere versao.txt; se mudou, baixa de novo todos os arquivos e recarrega a página.
// 2. Se mesmo assim um módulo falhar ao carregar (arquivo antigo no cache), faz o mesmo uma vez.
(function () {
  // "Tela de computador" no celular: a página é desenhada com 1100 px de largura e o aparelho reduz o zoom para caber, como no Dugout.
  try { if (localStorage.getItem("mo_tela") === "pc") { var mv = document.querySelector('meta[name="viewport"]'); if (mv) mv.setAttribute("content", "width=1100"); } } catch (e) {}
  window.moTela = function (pc) { try { localStorage.setItem("mo_tela", pc ? "pc" : "cel"); } catch (e) {} location.reload(); };
  var ARQUIVOS = ["estilo.css", "jogo.html", "admin.html", "aovivo.html", "escalacao.html", "index.html",
    "src/rng.js", "src/modelo.js", "src/gerador.js", "src/escalacao.js", "src/motor.js", "src/bot.js", "src/relatorio.js", "src/rodada.js", "src/economia.js", "src/virada.js",
    "src/banco.js", "src/escudo.js", "src/ui-login.js", "src/ui-relatorio.js"];
  var ja = sessionStorage.getItem("mo_recarregou");
  function renovar() {
    if (ja) return;
    ja = "1"; sessionStorage.setItem("mo_recarregou", "1");
    Promise.all(ARQUIVOS.map(function (f) { return fetch(f, { cache: "reload" }).catch(function () {}); })).then(function () { location.reload(); });
  }
  fetch("versao.txt", { cache: "no-store" }).then(function (r) { return r.ok ? r.text() : ""; }).then(function (v) {
    v = v.trim(); if (!v) return;
    var antes = localStorage.getItem("mo_versao");
    localStorage.setItem("mo_versao", v);
    if (antes && antes !== v) renovar();
  }).catch(function () {});
  window.addEventListener("error", function (e) {
    if (/export|import|module/i.test(String(e.message || ""))) renovar();
  });
  window.addEventListener("load", function () { setTimeout(function () { sessionStorage.removeItem("mo_recarregou"); }, 8000); });

  // relógio: preenche todo elemento com a classe "relogio" com a hora deste aparelho, a cada segundo
  function dois(n) { return (n < 10 ? "0" : "") + n; }
  function tique() {
    var d = new Date(), t = dois(d.getHours()) + ":" + dois(d.getMinutes()) + ":" + dois(d.getSeconds());
    var els = document.querySelectorAll(".relogio");
    for (var i = 0; i < els.length; i++) els[i].textContent = t;
  }
  setInterval(tique, 1000);
  document.addEventListener("DOMContentLoaded", tique);
})();
