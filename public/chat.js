/**
 * Comentei Chat IA v1.0
 *
 * Modo flutuante:
 *   <script src="https://comentei.vercel.app/chat.js"></script>
 *   <script>ComenteiChat.init({ widgetId: "SEU_ID", mode: "floating" });</script>
 *
 * Modo embutido:
 *   <div id="comentei-chat"></div>
 *   <script src="https://comentei.vercel.app/chat.js"></script>
 *   <script>ComenteiChat.init({ widgetId: "SEU_ID", mode: "inline", container: "#comentei-chat" });</script>
 */
(function (global) {
  "use strict";

  var API = "https://comentei.vercel.app/api/chat";
  var CONFIG_API = "https://comentei.vercel.app/api/chat-config";

  function esc(s) { return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;"); }

  function ComenteiChat() {
    this._cfg = null;
    this._remoteCfg = null;
    this._messages = [];
    this._open = false;
  }

  ComenteiChat.prototype.init = function (opts) {
    var self = this;
    self._cfg = {
      widgetId: opts.widgetId,
      mode: opts.mode || "floating",
      container: opts.container || null,
    };
    // Fetch remote config (assistant name, color, welcome message)
    fetch(CONFIG_API + "?widgetId=" + encodeURIComponent(opts.widgetId))
      .then(function (r) { return r.json(); })
      .then(function (data) {
        self._remoteCfg = data.ok ? data.config : {};
        self._boot();
      })
      .catch(function () { self._remoteCfg = {}; self._boot(); });
  };

  ComenteiChat.prototype._boot = function () {
    var cfg = this._remoteCfg || {};
    this._color = cfg.primaryColor || "#4f46e5";
    this._name = cfg.assistantName || "Assistente";
    this._welcome = cfg.welcomeMessage || "Olá! Como posso te ajudar?";
    this._injectCSS();
    if (this._cfg.mode === "floating") this._mountFloating();
    else this._mountInline();
  };

  ComenteiChat.prototype._injectCSS = function () {
    if (document.getElementById("cmc-css")) return;
    var c = this._color;
    var s = document.createElement("style");
    s.id = "cmc-css";
    s.textContent = [
      ".cmc-fab{position:fixed;bottom:24px;right:24px;z-index:99998;width:56px;height:56px;border-radius:50%;background:"+c+";border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;box-shadow:0 4px 16px rgba(0,0,0,.2);transition:transform .2s}",
      ".cmc-fab:hover{transform:scale(1.08)}",
      ".cmc-fab svg{pointer-events:none}",
      ".cmc-box{position:fixed;bottom:92px;right:24px;z-index:99997;width:360px;max-height:520px;background:#fff;border-radius:16px;box-shadow:0 8px 40px rgba(0,0,0,.15);display:flex;flex-direction:column;overflow:hidden;transition:opacity .2s,transform .2s}",
      ".cmc-box.hidden{opacity:0;pointer-events:none;transform:translateY(12px)}",
      ".cmc-inline{width:100%;max-height:520px;background:#fff;border-radius:16px;border:.5px solid #e4e4e0;display:flex;flex-direction:column;overflow:hidden}",
      ".cmc-head{background:"+c+";padding:14px 16px;display:flex;align-items:center;gap:10px;flex-shrink:0}",
      ".cmc-head-av{width:32px;height:32px;border-radius:50%;background:rgba(255,255,255,.25);display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:600;color:#fff}",
      ".cmc-head-name{color:#fff;font-size:14px;font-weight:600;font-family:system-ui,sans-serif}",
      ".cmc-head-sub{color:rgba(255,255,255,.75);font-size:11px;font-family:system-ui,sans-serif}",
      ".cmc-msgs{flex:1;overflow-y:auto;padding:16px;display:flex;flex-direction:column;gap:10px;background:#f9f9f7}",
      ".cmc-msg{max-width:82%;padding:9px 13px;border-radius:12px;font-size:13px;line-height:1.5;font-family:system-ui,sans-serif;word-break:break-word;white-space:pre-wrap}",
      ".cmc-msg.bot{background:#fff;border:.5px solid #e4e4e0;color:#222;align-self:flex-start;border-radius:4px 12px 12px 12px}",
      ".cmc-msg.user{background:"+c+";color:#fff;align-self:flex-end;border-radius:12px 4px 12px 12px}",
      ".cmc-msg.typing{color:#aaa;font-style:italic}",
      ".cmc-footer{padding:10px 12px;border-top:.5px solid #eee;display:flex;gap:8px;background:#fff;flex-shrink:0}",
      ".cmc-input{flex:1;border:.5px solid #e0e0dc;border-radius:10px;padding:8px 12px;font-size:13px;font-family:system-ui,sans-serif;resize:none;max-height:80px;outline:none;color:#111}",
      ".cmc-input:focus{border-color:"+c+"}",
      ".cmc-send{width:36px;height:36px;border-radius:10px;background:"+c+";border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0;align-self:flex-end}",
      ".cmc-send:hover{opacity:.88}",
      ".cmc-send:disabled{opacity:.4;cursor:default}",
      "@media(max-width:400px){.cmc-box{right:8px;left:8px;width:auto}.cmc-fab{right:16px;bottom:16px}}",
    ].join("");
    document.head.appendChild(s);
  };

  ComenteiChat.prototype._chatHTML = function (inline) {
    var cls = inline ? "cmc-inline" : "cmc-box hidden";
    var id = inline ? "cmc-inline-box" : "cmc-float-box";
    return '<div class="'+cls+'" id="'+id+'">' +
      '<div class="cmc-head">' +
        '<div class="cmc-head-av">'+esc(this._name[0].toUpperCase())+'</div>' +
        '<div><div class="cmc-head-name">'+esc(this._name)+'</div><div class="cmc-head-sub">Chat IA</div></div>' +
      '</div>' +
      '<div class="cmc-msgs" id="cmc-msgs-'+id+'"><div class="cmc-msg bot">'+esc(this._welcome)+'</div></div>' +
      '<div class="cmc-footer">' +
        '<textarea class="cmc-input" id="cmc-input-'+id+'" placeholder="Digite sua mensagem..." rows="1"></textarea>' +
        '<button class="cmc-send" id="cmc-send-'+id+'">' +
          '<svg width="16" height="16" fill="none" viewBox="0 0 16 16"><path d="M2 8l12-6-5 6 5 6L2 8z" fill="white"/></svg>' +
        '</button>' +
      '</div>' +
    '</div>';
  };

  ComenteiChat.prototype._mountFloating = function () {
    var self = this;
    var wrap = document.createElement("div");
    wrap.innerHTML = this._chatHTML(false) +
      '<button class="cmc-fab" id="cmc-fab" aria-label="Abrir chat">' +
        '<svg width="24" height="24" fill="none" viewBox="0 0 24 24"><path d="M4 4h16v12H8l-4 3V4z" fill="white" fill-opacity=".9"/></svg>' +
      '</button>';
    document.body.appendChild(wrap);
    this._boxId = "cmc-float-box";
    document.getElementById("cmc-fab").addEventListener("click", function () { self._toggle(); });
    this._bindInput(this._boxId);
  };

  ComenteiChat.prototype._mountInline = function () {
    var container = typeof this._cfg.container === "string"
      ? document.querySelector(this._cfg.container)
      : this._cfg.container;
    if (!container) { console.error("[ComenteiChat] Container não encontrado."); return; }
    container.innerHTML = this._chatHTML(true);
    this._boxId = "cmc-inline-box";
    this._bindInput(this._boxId);
  };

  ComenteiChat.prototype._toggle = function () {
    var box = document.getElementById("cmc-float-box");
    if (!box) return;
    this._open = !this._open;
    box.classList.toggle("hidden", !this._open);
    if (this._open) document.getElementById("cmc-input-" + this._boxId)?.focus();
  };

  ComenteiChat.prototype._bindInput = function (boxId) {
    var self = this;
    var input = document.getElementById("cmc-input-" + boxId);
    var send = document.getElementById("cmc-send-" + boxId);
    if (!input || !send) return;

    send.addEventListener("click", function () { self._send(boxId); });
    input.addEventListener("keydown", function (e) {
      if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); self._send(boxId); }
    });
    input.addEventListener("input", function () {
      input.style.height = "auto";
      input.style.height = Math.min(input.scrollHeight, 80) + "px";
    });
  };

  ComenteiChat.prototype._send = function (boxId) {
    var self = this;
    var input = document.getElementById("cmc-input-" + boxId);
    var send = document.getElementById("cmc-send-" + boxId);
    var msgs = document.getElementById("cmc-msgs-" + boxId);
    if (!input || !send || !msgs) return;

    var text = input.value.trim();
    if (!text) return;

    input.value = ""; input.style.height = "auto";
    send.disabled = true;

    // Add user message
    self._messages.push({ role: "user", text: text });
    var userEl = document.createElement("div");
    userEl.className = "cmc-msg user";
    userEl.textContent = text;
    msgs.appendChild(userEl);

    // Typing indicator
    var typing = document.createElement("div");
    typing.className = "cmc-msg bot typing";
    typing.textContent = "Digitando...";
    msgs.appendChild(typing);
    msgs.scrollTop = msgs.scrollHeight;

    fetch(API, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ widgetId: self._cfg.widgetId, messages: self._messages }),
    })
    .then(function (r) { return r.json(); })
    .then(function (data) {
      typing.remove();
      var reply = data.ok ? data.reply : "Desculpe, ocorreu um erro. Tente novamente.";
      self._messages.push({ role: "assistant", text: reply });
      var botEl = document.createElement("div");
      botEl.className = "cmc-msg bot";
      botEl.textContent = reply;
      msgs.appendChild(botEl);
      msgs.scrollTop = msgs.scrollHeight;
    })
    .catch(function () {
      typing.remove();
      var errEl = document.createElement("div");
      errEl.className = "cmc-msg bot";
      errEl.textContent = "Erro de conexão. Tente novamente.";
      msgs.appendChild(errEl);
      msgs.scrollTop = msgs.scrollHeight;
    })
    .finally(function () { send.disabled = false; });
  };

  global.ComenteiChat = new ComenteiChat();
})(window);
