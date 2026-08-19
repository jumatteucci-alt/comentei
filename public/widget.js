/**
 * Comentei Widget v1.1
 */
(function (global) {
  "use strict";

  var API_BASE = "https://comentei.vercel.app/api/comments";
  var PAGE_SIZE = 10;

  var PALETTE = [
    ["#e0e7ff","#3730a3"],["#ede9fe","#6d28d9"],["#d1fae5","#065f46"],
    ["#fef3c7","#92400e"],["#fce7f3","#9d174d"],["#dbeafe","#1e40af"],
  ];

  function colorFor(name) {
    var h = 0;
    for (var i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h);
    return PALETTE[Math.abs(h) % PALETTE.length];
  }

  function initials(name) {
    return name.trim().split(/\s+/).slice(0, 2).map(function (w) { return w[0].toUpperCase(); }).join("");
  }

  function esc(s) {
    return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
  }

  function fmtDate(ts) {
    return new Date(ts).toLocaleDateString("pt-BR", { day: "numeric", month: "short", year: "numeric" });
  }

  function injectCSS(color) {
    if (document.getElementById("cfl-css")) return;
    var s = document.createElement("style");
    s.id = "cfl-css";
    s.textContent = [
      ".cfl{font-family:system-ui,-apple-system,sans-serif;max-width:680px;line-height:1.6;color:#111}",
      ".cfl-title{font-size:17px;font-weight:600;margin:0 0 1.25rem;color:#111}",
      ".cfl-count{font-size:13px;font-weight:400;color:#999;margin-left:6px}",
      ".cfl-card{background:#f9f9f7;border:0.5px solid #e4e4e0;border-radius:12px;padding:1.1rem 1.25rem;margin-bottom:1.5rem}",
      ".cfl-row{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:8px}",
      ".cfl-card input,.cfl-card textarea,.cfl-rf input,.cfl-rf textarea{width:100%;box-sizing:border-box;padding:8px 11px;border:0.5px solid #ddd;border-radius:8px;font-size:13px;background:#fff;color:#111;font-family:inherit}",
      ".cfl-card input:focus,.cfl-card textarea:focus,.cfl-rf input:focus,.cfl-rf textarea:focus{outline:none;border-color:"+color+"}",
      ".cfl-card textarea{min-height:76px;resize:vertical}",
      ".cfl-rf textarea{min-height:56px;resize:vertical}",
      ".cfl-btn{margin-top:8px;padding:7px 18px;background:"+color+";color:#fff;border:none;border-radius:8px;font-size:13px;cursor:pointer;font-family:inherit}",
      ".cfl-btn:hover{opacity:.88}",
      ".cfl-rbtn{padding:5px 14px;background:"+color+";color:#fff;border:none;border-radius:7px;font-size:12px;cursor:pointer;font-family:inherit;margin-top:7px}",
      ".cfl-err{font-size:12px;color:#b91c1c;margin-top:5px}",
      ".cfl-ok{font-size:12px;color:#166534;margin-top:5px}",
      ".cfl-spin{display:inline-block;width:14px;height:14px;border:2px solid #ddd;border-top-color:"+color+";border-radius:50%;animation:cfl-spin 0.7s linear infinite}",
      "@keyframes cfl-spin{to{transform:rotate(360deg)}}",
      ".cfl-list{display:flex;flex-direction:column;gap:14px}",
      ".cfl-cm{background:#fff;border:0.5px solid #e4e4e0;border-radius:12px;padding:1rem 1.25rem}",
      ".cfl-ch{display:flex;align-items:center;gap:9px;margin-bottom:7px}",
      ".cfl-av{width:34px;height:34px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:600;flex-shrink:0}",
      ".cfl-rav{width:26px;height:26px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:600;flex-shrink:0;margin-top:1px}",
      ".cfl-nm{font-size:13px;font-weight:600;color:#111}",
      ".cfl-dt{font-size:11px;color:#aaa}",
      ".cfl-tx{font-size:13px;color:#222;white-space:pre-wrap;word-break:break-word}",
      ".cfl-rp-btn{background:none;border:none;font-size:11px;color:"+color+";cursor:pointer;padding:3px 0;margin-top:6px;font-family:inherit}",
      ".cfl-rps{margin-top:11px;padding-top:11px;border-top:0.5px solid #eee;display:flex;flex-direction:column;gap:10px}",
      ".cfl-rp{display:flex;gap:8px}",
      ".cfl-rpb{flex:1}",
      ".cfl-rpnm{font-size:12px;font-weight:600;color:#222}",
      ".cfl-rptx{font-size:12px;color:#444;white-space:pre-wrap}",
      ".cfl-rpdt{font-size:10px;color:#bbb;margin-top:1px}",
      ".cfl-rf{margin-top:11px;padding-top:11px;border-top:0.5px solid #eee;display:none}",
      ".cfl-rf.open{display:block}",
      ".cfl-rf .cfl-row{margin-bottom:6px}",
      ".cfl-more{margin-top:16px;text-align:center}",
      ".cfl-more-btn{padding:7px 22px;background:transparent;border:0.5px solid "+color+";color:"+color+";border-radius:8px;font-size:13px;cursor:pointer;font-family:inherit;transition:background 0.15s,color 0.15s}",
      ".cfl-more-btn:hover{background:"+color+";color:#fff}",
      "@media(max-width:480px){.cfl-row{grid-template-columns:1fr}}",
    ].join("");
    document.head.appendChild(s);
  }

  function avatar(name, sm) {
    var c = colorFor(name);
    return '<div class="'+(sm?"cfl-rav":"cfl-av")+'" style="background:'+c[0]+';color:'+c[1]+'">'+esc(initials(name))+'</div>';
  }

  function renderComment(c) {
    var rps = (c.replies || []).map(function (r) {
      return '<div class="cfl-rp">'+avatar(r.name,true)+'<div class="cfl-rpb"><div class="cfl-rpnm">'+esc(r.name)+'</div><div class="cfl-rptx">'+esc(r.text)+'</div><div class="cfl-rpdt">'+fmtDate(r.createdAt)+'</div></div></div>';
    }).join("");

    return '<div class="cfl-cm" id="cfl-c-'+esc(c.id)+'">' +
      '<div class="cfl-ch">'+avatar(c.name,false)+'<div><div class="cfl-nm">'+esc(c.name)+'</div><div class="cfl-dt">'+fmtDate(c.createdAt)+'</div></div></div>' +
      '<div class="cfl-tx">'+esc(c.text)+'</div>' +
      '<button class="cfl-rp-btn" data-toggle="cfl-rf-'+esc(c.id)+'">↩ Responder</button>' +
      (rps ? '<div class="cfl-rps">'+rps+'</div>' : '') +
      '<div class="cfl-rf" id="cfl-rf-'+esc(c.id)+'">' +
        '<div class="cfl-row"><input placeholder="Seu nome" data-f="name"/><input placeholder="seu@email.com" data-f="email"/></div>' +
        '<textarea placeholder="Sua resposta..." data-f="text"></textarea>' +
        '<div class="cfl-err" id="cfl-re-'+esc(c.id)+'" style="display:none"></div>' +
        '<button class="cfl-rbtn" data-parent="'+esc(c.id)+'">Responder</button>' +
      '</div>' +
    '</div>';
  }

  function Commentful() {
    this._cfg = null;
    this._el = null;
    this._all = [];
    this._shown = 0;
  }

  Commentful.prototype.init = function (opts) {
    this._cfg = {
      widgetId: opts.widgetId,
      pageId: opts.pageId || window.location.pathname,
      primaryColor: opts.primaryColor || "#4f46e5",
      container: opts.container || "#commentful-widget",
      title: opts.title || "Comentários",
    };

    injectCSS(this._cfg.primaryColor);

    this._el = typeof this._cfg.container === "string"
      ? document.querySelector(this._cfg.container)
      : this._cfg.container;

    if (!this._el) { console.error("[Comentei] Container não encontrado."); return; }
    this._el.innerHTML = this._shell();
    this._bindForm();
    this._load();
  };

  Commentful.prototype._shell = function () {
    return '<div class="cfl">' +
      '<h3 class="cfl-title">'+esc(this._cfg.title)+'<span class="cfl-count" id="cfl-count"></span></h3>' +
      '<div class="cfl-card">' +
        '<div class="cfl-row"><input id="cfl-name" placeholder="Seu nome"/><input id="cfl-email" placeholder="seu@email.com"/></div>' +
        '<textarea id="cfl-text" placeholder="Deixe seu comentário..."></textarea>' +
        '<div class="cfl-err" id="cfl-msg" style="display:none"></div>' +
        '<button class="cfl-btn" id="cfl-submit">Enviar comentário</button>' +
      '</div>' +
      '<div id="cfl-loading" style="font-size:13px;color:#aaa;padding:4px 0"><span class="cfl-spin"></span> Carregando...</div>' +
      '<div class="cfl-list" id="cfl-list" style="display:none"></div>' +
      '<div class="cfl-more" id="cfl-more" style="display:none"><button class="cfl-more-btn" id="cfl-more-btn">Mostrar mais</button></div>' +
    '</div>';
  };

  Commentful.prototype._load = function () {
    var self = this;
    var url = API_BASE + "?widgetId=" + encodeURIComponent(self._cfg.widgetId) + "&pageId=" + encodeURIComponent(self._cfg.pageId);
    fetch(url)
      .then(function (r) { return r.json(); })
      .then(function (data) {
        var loading = document.getElementById("cfl-loading");
        var list = document.getElementById("cfl-list");
        if (loading) loading.style.display = "none";
        if (!list) return;
        list.style.display = "";

        if (!data.ok || !data.data || !data.data.length) {
          list.innerHTML = '<p style="font-size:13px;color:#aaa;margin:0">Seja o primeiro a comentar!</p>';
          document.getElementById("cfl-count").textContent = "";
          document.getElementById("cfl-more").style.display = "none";
          return;
        }

        // mais recentes primeiro
        self._all = data.data.slice().reverse();
        self._shown = 0;

        var total = self._all.reduce(function(s,c){ return s + 1 + (c.replies||[]).length; }, 0);
        document.getElementById("cfl-count").textContent = total + " comentário" + (total !== 1 ? "s" : "");

        list.innerHTML = "";
        self._showMore();

        var moreBtn = document.getElementById("cfl-more-btn");
        if (moreBtn) moreBtn.addEventListener("click", function () { self._showMore(); });
      })
      .catch(function () {
        var loading = document.getElementById("cfl-loading");
        if (loading) loading.textContent = "Erro ao carregar comentários.";
      });
  };

  Commentful.prototype._showMore = function () {
    var list = document.getElementById("cfl-list");
    var moreWrap = document.getElementById("cfl-more");
    if (!list) return;

    var next = this._all.slice(this._shown, this._shown + PAGE_SIZE);
    next.forEach(function (c) {
      var div = document.createElement("div");
      div.innerHTML = renderComment(c);
      list.appendChild(div.firstChild);
    });
    this._shown += next.length;

    if (this._shown < this._all.length) {
      moreWrap.style.display = "";
      var remaining = this._all.length - this._shown;
      document.getElementById("cfl-more-btn").textContent = "Mostrar mais (" + remaining + ")";
    } else {
      moreWrap.style.display = "none";
    }

    this._bindReplies();
  };

  Commentful.prototype._bindForm = function () {
    var self = this;
    var btn = document.getElementById("cfl-submit");
    if (btn) btn.addEventListener("click", function () { self._submit(); });
  };

  Commentful.prototype._bindReplies = function () {
    var self = this;
    document.querySelectorAll(".cfl-rp-btn").forEach(function (btn) {
      if (btn._cflBound) return;
      btn._cflBound = true;
      btn.addEventListener("click", function () {
        var id = btn.getAttribute("data-toggle");
        var rf = document.getElementById(id);
        if (rf) rf.classList.toggle("open");
      });
    });
    document.querySelectorAll(".cfl-rbtn").forEach(function (btn) {
      if (btn._cflBound) return;
      btn._cflBound = true;
      btn.addEventListener("click", function () { self._submitReply(btn); });
    });
  };

  Commentful.prototype._showMsg = function (elId, text, isErr) {
    var el = document.getElementById(elId);
    if (!el) return;
    el.textContent = text;
    el.className = isErr ? "cfl-err" : "cfl-ok";
    el.style.display = text ? "" : "none";
  };

  Commentful.prototype._submit = function () {
    var name = (document.getElementById("cfl-name")||{}).value||"";
    var email = (document.getElementById("cfl-email")||{}).value||"";
    var text = (document.getElementById("cfl-text")||{}).value||"";
    var self = this;

    name = name.trim(); email = email.trim(); text = text.trim();
    if (!name) { self._showMsg("cfl-msg","Informe seu nome.",true); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { self._showMsg("cfl-msg","E-mail inválido.",true); return; }
    if (!text) { self._showMsg("cfl-msg","Escreva um comentário.",true); return; }
    self._showMsg("cfl-msg","",false);

    var btn = document.getElementById("cfl-submit");
    if (btn) { btn.disabled = true; btn.textContent = "Enviando..."; }

    fetch(API_BASE, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ widgetId: self._cfg.widgetId, pageId: self._cfg.pageId, name: name, email: email, text: text })
    })
    .then(function (r) { return r.json(); })
    .then(function (data) {
      if (!data.ok) throw new Error(data.error || "Erro ao salvar.");
      self._showMsg("cfl-msg","Comentário publicado!",false);
      document.getElementById("cfl-name").value = "";
      document.getElementById("cfl-email").value = "";
      document.getElementById("cfl-text").value = "";
      setTimeout(function(){ self._showMsg("cfl-msg","",false); }, 3000);
      self._load();
    })
    .catch(function (err) { self._showMsg("cfl-msg", err.message || "Erro. Tente novamente.", true); })
    .finally(function () { if (btn) { btn.disabled = false; btn.textContent = "Enviar comentário"; } });
  };

  Commentful.prototype._submitReply = function (btn) {
    var parentId = btn.getAttribute("data-parent");
    var form = document.getElementById("cfl-rf-" + parentId);
    var name = (form.querySelector('[data-f="name"]')||{}).value||"";
    var email = (form.querySelector('[data-f="email"]')||{}).value||"";
    var text = (form.querySelector('[data-f="text"]')||{}).value||"";
    var self = this;
    var errId = "cfl-re-" + parentId;

    name = name.trim(); email = email.trim(); text = text.trim();
    if (!name || !email || !text) { self._showMsg(errId,"Preencha todos os campos.",true); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { self._showMsg(errId,"E-mail inválido.",true); return; }
    self._showMsg(errId,"",false);

    btn.disabled = true; btn.textContent = "Enviando...";

    fetch(API_BASE, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ widgetId: self._cfg.widgetId, pageId: self._cfg.pageId, parentId: parentId, name: name, email: email, text: text })
    })
    .then(function (r) { return r.json(); })
    .then(function (data) {
      if (!data.ok) throw new Error(data.error || "Erro.");
      form.classList.remove("open");
      self._load();
    })
    .catch(function (err) { self._showMsg(errId, err.message || "Erro.", true); })
    .finally(function () { btn.disabled = false; btn.textContent = "Responder"; });
  };

  global.Commentful = new Commentful();
})(window);
