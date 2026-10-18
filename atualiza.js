// Evita que o navegador misture arquivos novos e antigos do jogo depois de uma atualização.
// 1. A cada abertura, confere versao.txt; se mudou, baixa de novo todos os arquivos e recarrega a página.
// 2. Se mesmo assim um módulo falhar ao carregar (arquivo antigo no cache), faz o mesmo uma vez.
(function () {
  // "Tela de computador" no celular: a página é desenhada com 1100 px de largura e o aparelho reduz o zoom para caber, como no Dugout.
  try { if (localStorage.getItem("mo_tela") === "pc") { var mv = document.querySelector('meta[name="viewport"]'); if (mv) mv.setAttribute("content", "width=1100"); } } catch (e) {}
  window.moTela = function (pc) { try { localStorage.setItem("mo_tela", pc ? "pc" : "cel"); } catch (e) {} location.reload(); };
  var ARQUIVOS = ["estilo.css", "jogo.html", "admin.html", "aovivo.html", "jogador.html", "escalacao.html", "index.html",
    "src/rng.js", "src/modelo.js", "src/gerador.js", "src/escalacao.js", "src/motor.js", "src/bot.js", "src/relatorio.js", "src/rodada.js", "src/economia.js", "src/virada.js", "src/siglas.js", "src/treino.js", "src/saude.js", "src/base.js",
    "src/banco.js", "src/escudo.js", "src/bandeiras.js", "src/ui-login.js", "src/ui-relatorio.js", "src/ui-escalacao.js", "src/estadio.js"];
  var ja = sessionStorage.getItem("mo_recarregou");
  function renovar() {
    if (ja) return;
    ja = "1"; sessionStorage.setItem("mo_recarregou", "1");
    Promise.all(ARQUIVOS.map(function (f) { return fetch(f, { cache: "reload" }).catch(function () {}); })).then(function () { location.reload(); });
  }
  function conferir(aoVoltar) {
    fetch("versao.txt", { cache: "no-store" }).then(function (r) { return r.ok ? r.text() : ""; }).then(function (v) {
      v = v.trim(); if (!v) return;
      var antes = localStorage.getItem("mo_versao");
      if (!antes || antes === v) { localStorage.setItem("mo_versao", v); return; }
      if (!aoVoltar) { localStorage.setItem("mo_versao", v); renovar(); return; }
      // aba que ficou aberta: não recarrega sozinha (pode haver escalação sem salvar); mostra um aviso para tocar
      if (document.getElementById("moVersaoNova")) return;
      var b = document.createElement("button"); b.id = "moVersaoNova"; b.textContent = "Versão nova do jogo: toque para atualizar";
      b.style.cssText = "position:fixed;left:50%;bottom:16px;transform:translateX(-50%);z-index:9999;padding:10px 16px;border-radius:999px;border:0;background:#f2c200;color:#1a1300;font-weight:700;box-shadow:0 4px 16px rgba(0,0,0,.4)";
      b.onclick = function () { localStorage.setItem("mo_versao", v); ja = null; renovar(); };
      document.body.appendChild(b);
    }).catch(function () {});
  }
  conferir(false);
  // o celular (Safari principalmente) guarda a aba aberta por dias sem recarregar: confere de novo quando a aba volta a aparecer
  document.addEventListener("visibilitychange", function () { if (document.visibilityState === "visible") conferir(true); });
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
