// Evita que o navegador misture arquivos novos e antigos do jogo depois de uma atualização.
// 1. A cada abertura, confere versao.txt; se mudou, baixa de novo todos os arquivos e recarrega a página.
// 2. Se mesmo assim um módulo falhar ao carregar (arquivo antigo no cache), faz o mesmo uma vez.
(function () {
  // "Tela de computador" no celular: a página é desenhada com 1100 px de largura e o aparelho reduz o zoom para caber, como no Dugout.
  try { if (localStorage.getItem("mo_tela") === "pc") { var mv = document.querySelector('meta[name="viewport"]'); if (mv) mv.setAttribute("content", "width=1100"); } } catch (e) {}
  // PC: a largura mínima da página (estilo.css) é a da tela, até 1280 px. O zoom do navegador não muda screen.availWidth no Chrome/Edge,
  // então notebook estreito fica sem rolagem lateral a 100% e, com zoom, a página só aumenta.
  try { document.documentElement.style.setProperty("--largura-min", Math.min(1280, screen.availWidth || 1280) + "px"); } catch (e) {}
  window.moTela = function (pc) { try { localStorage.setItem("mo_tela", pc ? "pc" : "cel"); } catch (e) {} location.reload(); };

  // Tema: "claro", "escuro" ou automático (segue o aparelho), em mo_tema. A cor de destaque vem do escudo do clube (mo_cor = "cor1,cor2"):
  // a primeira cor viva, clareada no tema escuro e escurecida no claro. Vermelho fica de fora (é a cor de perda e de cartão): vale a cor2 ou o dourado.
  function ler(k) { try { return localStorage.getItem(k) || ""; } catch (e) { return ""; } }
  function gravar(k, v) { try { if (v) localStorage.setItem(k, v); else localStorage.removeItem(k); } catch (e) {} }
  var claroDoAparelho = window.matchMedia ? matchMedia("(prefers-color-scheme: light)") : null;
  function hsl(hex) {
    var r = parseInt(hex.slice(1, 3), 16) / 255, g = parseInt(hex.slice(3, 5), 16) / 255, b = parseInt(hex.slice(5, 7), 16) / 255;
    var mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, d = mx - mn;
    if (!d) return [0, 0, l];
    var h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
    return [(h * 60 + 360) % 360, d / (1 - Math.abs(2 * l - 1)), l];
  }
  function luminancia(h, s, l) { // para decidir letra clara ou escura em cima do botão
    var a = s * Math.min(l, 1 - l);
    function f(n) { var k = (n + h / 30) % 12, c = l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)); return c <= .03928 ? c / 12.92 : Math.pow((c + .055) / 1.055, 2.4); }
    return .2126 * f(0) + .7152 * f(8) + .0722 * f(4);
  }
  function acento(cores, claro) {
    for (var i = 0; i < cores.length; i++) {
      if (!/^#[0-9a-f]{6}$/i.test(cores[i])) continue;
      var c = hsl(cores[i]), h = c[0], s = c[1], l = c[2];
      if (s <= .25 || l <= .1 || l >= .93 || h <= 20 || h >= 330) continue; // sem cor (preto, branco, cinza) ou vermelho
      s = Math.max(s, .55); l = claro ? Math.min(Math.max(l, .28), .40) : Math.min(Math.max(l, .58), .70);
      return ["hsl(" + Math.round(h) + " " + Math.round(s * 100) + "% " + Math.round(l * 100) + "%)", luminancia(h, s, l) > .4 ? "#1a1300" : "#ffffff"];
    }
    return null;
  }
  // Visual novo (V2), o padrão: põe data-visual="novo" no <html> e carrega o trem.css depois do estilo.css; mo_visual = "velho" fica na V1.
  // ?visual=novo e ?visual=velho no endereço ligam e desligam. Com ele, o tema padrão é o claro ("auto" segue o aparelho).
  // A partida ao vivo e o relatório (aovivo.html) seguem na V1 por enquanto.
  var pedido = /[?&]visual=(novo|velho)\b/.exec(location.search || "");
  if (pedido) gravar("mo_visual", pedido[1]);
  var visualNovo = ler("mo_visual") !== "velho" && !/aovivo\.html$/.test(location.pathname || "");
  if (visualNovo) {
    document.documentElement.setAttribute("data-visual", "novo");
    var css = document.createElement("link"); css.rel = "stylesheet"; css.href = "trem.css"; document.head.appendChild(css);
  }
  window.moVisual = function (v) { gravar("mo_visual", v); location.reload(); }; // "novo" ou "velho"
  function aplicarTema() {
    var raiz = document.documentElement, t = ler("mo_tema"), claro = t === "claro" || t !== "escuro" && (!t && visualNovo || !!(claroDoAparelho && claroDoAparelho.matches)), a = acento(ler("mo_cor").split(","), claro);
    raiz.setAttribute("data-tema", claro ? "claro" : "escuro");
    if (ler("mo_cores")) raiz.setAttribute("data-cores", ler("mo_cores")); else raiz.removeAttribute("data-cores");
    if (a) { raiz.style.setProperty("--ac", a[0]); raiz.style.setProperty("--ac-tx", a[1]); } else { raiz.style.removeProperty("--ac"); raiz.style.removeProperty("--ac-tx"); }
  }
  window.moTema = function (t) { gravar("mo_tema", t); aplicarTema(); }; // "claro", "escuro", "auto" ou "" (o padrão: automático, ou claro com o visual novo)
  window.moCores = function (c) { gravar("mo_cores", c); aplicarTema(); }; // cores de mandante × visitante: "" (turquesa × âmbar) ou "roxo"
  window.moCor = function (escudo) { var c = escudo ? [escudo.cor1, escudo.cor2].join(",") : ""; if (c !== ler("mo_cor")) { gravar("mo_cor", c); aplicarTema(); } };
  if (claroDoAparelho && claroDoAparelho.addEventListener) claroDoAparelho.addEventListener("change", aplicarTema);
  aplicarTema();
  var ARQUIVOS = ["atualiza.js", "estilo.css", "trem.css", "admin.html", "aovivo.html", "calibragem.html", "design.html", "elenco.html", "escalacao.html", "guia.html", "home.html", "index.html", "jogador.html", "jogo.html", "partida.html", "partida_base.html", "relatorio.html", "sede.html", "temporada.html", "src/banco.js", "src/bandeiras.js", "src/base.js", "src/bot.js", "src/camisa.js", "src/diretoria.js", "src/economia.js", "src/escalacao.js", "src/escudo.js", "src/estadio.js", "src/gerador.js", "src/leituras.js", "src/ligabase.js", "src/mercadobots.js", "src/modelo.js", "src/motor.js", "src/patrocinio.js", "src/relatorio.js", "src/rng.js", "src/rodada.js", "src/saude.js", "src/siglas.js", "src/treino.js", "src/ui-escalacao.js", "src/ui-graficos.js", "src/ui-login.js", "src/ui-relatorio.js", "src/ui-trem.js", "src/ui-visual.js", "src/virada.js"];
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

  // todo link que abre uma partida (aovivo.html?id=...) vai para uma aba nova: a página de onde se veio continua aberta
  document.addEventListener("click", function (e) {
    var a = e.target.closest && e.target.closest("a[href]");
    if (a && !a.target && /(^|\/)aovivo\.html\?/.test(a.getAttribute("href"))) { a.target = "_blank"; a.rel = "noopener"; }
    // página com parâmetros (jogador.html?id=…): o navegador guarda uma cópia por endereço, que o renovar() não alcança; a versão no endereço evita abrir a antiga
    if (a && a.origin === location.origin && /\.html\?/.test(a.getAttribute("href")) && ler("mo_versao")) { var u = new URL(a.href); if (u.searchParams.get("v") !== ler("mo_versao")) { u.searchParams.set("v", ler("mo_versao")); a.href = u.href; } }
  }, true);
})();
