/**
 * Comentei Popup v1.0
 * Uso:
 *   <script src="https://comentei.vercel.app/popup.js"></script>
 *   <script>ComenteiPopup.init({ widgetId: "SEU_WIDGET_ID" });</script>
 */
(function (global) {
  "use strict";

  var API = "https://comentei.vercel.app/api/popups";

  function ComenteiPopup() { this._widgetId = null; }

  ComenteiPopup.prototype.init = function (opts) {
    this._widgetId = opts.widgetId;
    var self = this;
    fetch(API + "?widgetId=" + encodeURIComponent(this._widgetId))
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (!data.ok || !data.data) return;
        data.data.forEach(function (popup) { self._schedule(popup); });
      })
      .catch(function () {});
  };


  // ── Segmentation evaluator ──
  ComenteiPopup.prototype._matchesSegmentation = function (popup) {
    var seg = popup.segmentation;
    if (!seg || !seg.conditions || seg.conditions.length === 0) return true;

    var url = window.location.href;
    var params = new URLSearchParams(window.location.search);

    function getCookie(name) {
      var match = document.cookie.match(new RegExp("(?:^|; )" + name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "=([^;]*)"));
      return match ? decodeURIComponent(match[1]) : null;
    }

    function getDevice() {
      var w = window.innerWidth;
      if (w <= 768) return "mobile";
      if (w <= 1024) return "tablet";
      return "desktop";
    }

    function evalCondition(cond) {
      switch (cond.type) {
        case "url_contains":      return url.includes(cond.value);
        case "url_equals":        return url === cond.value;
        case "url_starts_with":   return url.startsWith(cond.value);
        case "url_not_contains":  return !url.includes(cond.value);
        case "cookie_equals":     return getCookie(cond.key) === cond.value;
        case "cookie_contains":   { var v = getCookie(cond.key); return v !== null && v.includes(cond.value); }
        case "cookie_exists":     return getCookie(cond.key) !== null;
        case "cookie_not_exists": return getCookie(cond.key) === null;
        case "utm_source":        return params.get("utm_source") === cond.value;
        case "utm_medium":        return params.get("utm_medium") === cond.value;
        case "utm_campaign":      return params.get("utm_campaign") === cond.value;
        case "device_is":         return getDevice() === cond.value;
        default:                  return true;
      }
    }

    var results = seg.conditions.map(evalCondition);
    return seg.operator === "or"
      ? results.some(Boolean)
      : results.every(Boolean);
  };

  ComenteiPopup.prototype._schedule = function (popup) {
    var self = this;
    var key = "cmt_popup_" + popup.id;
    if (popup.showOncePerSession && sessionStorage.getItem(key)) return;
    if (!self._matchesSegmentation(popup)) return;

    var show = function () { self._render(popup); };

    if (popup.trigger.type === "delay") {
      setTimeout(show, (popup.trigger.delaySeconds || 5) * 1000);
    } else if (popup.trigger.type === "scroll") {
      var pct = popup.trigger.scrollPercent || 50;
      var onScroll = function () {
        var scrolled = (window.scrollY / (document.body.scrollHeight - window.innerHeight)) * 100;
        if (scrolled >= pct) { window.removeEventListener("scroll", onScroll); show(); }
      };
      window.addEventListener("scroll", onScroll, { passive: true });
    } else if (popup.trigger.type === "exit") {
      var onMouseLeave = function (e) {
        if (e.clientY <= 0) { document.removeEventListener("mouseleave", onMouseLeave); show(); }
      };
      document.addEventListener("mouseleave", onMouseLeave);
    }
  };

  ComenteiPopup.prototype._render = function (popup) {
    var key = "cmt_popup_" + popup.id;
    if (document.getElementById(key)) return;

    // Overlay
    var overlay = document.createElement("div");
    overlay.id = key;
    overlay.style.cssText = "position:fixed;inset:0;z-index:99999;display:flex;align-items:center;justify-content:center;background:" + popup.overlayColor;

    // Modal
    var modal = document.createElement("div");
    modal.style.cssText = [
      "background:" + popup.backgroundColor,
      "max-width:" + popup.maxWidth,
      "width:calc(100% - 2rem)",
      "padding:" + popup.padding,
      "border-radius:" + popup.borderRadius,
      "position:relative",
      "box-shadow:0 20px 60px rgba(0,0,0,0.2)",
      "max-height:90vh",
      "overflow-y:auto",
    ].join(";");

    // Close button
    if (popup.showCloseButton) {
      var close = document.createElement("button");
      close.textContent = "×";
      close.style.cssText = "position:absolute;top:12px;right:16px;background:none;border:none;font-size:22px;cursor:pointer;color:#888;line-height:1;padding:0;";
      close.onclick = function () { overlay.remove(); };
      modal.appendChild(close);
    }

    // Close on overlay click
    overlay.addEventListener("click", function (e) { if (e.target === overlay) overlay.remove(); });

    // Rows
    var body = document.createElement("div");
    body.style.cssText = "display:flex;flex-direction:column;gap:12px;";

    (popup.rows || []).forEach(function (row) {
      var rowEl = document.createElement("div");
      rowEl.style.cssText = "display:grid;grid-template-columns:repeat(" + row.layout + ",1fr);gap:12px;";
      (row.columns || []).forEach(function (col) {
        var colEl = document.createElement("div");
        colEl.style.cssText = "display:flex;flex-direction:column;gap:8px;";
        (col.blocks || []).forEach(function (block) {
          var el = renderBlock(block);
          if (el) colEl.appendChild(el);
        });
        rowEl.appendChild(colEl);
      });
      body.appendChild(rowEl);
    });

    modal.appendChild(body);
    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    if (popup.showOncePerSession) sessionStorage.setItem(key, "1");
  };

  function renderBlock(block) {
    switch (block.type) {
      case "image": {
        if (!block.src) return null;
        var img = document.createElement("img");
        img.src = block.src; img.alt = block.alt || "";
        img.style.cssText = "width:" + block.width + ";border-radius:" + block.borderRadius + ";display:block;margin:0 auto;";
        return img;
      }
      case "title": {
        var el = document.createElement("p");
        el.textContent = block.text;
        el.style.cssText = "margin:0;font-size:" + block.fontSize + ";color:" + block.color + ";text-align:" + block.align + ";font-weight:" + block.fontWeight + ";line-height:1.3;";
        return el;
      }
      case "text": {
        var el = document.createElement("p");
        el.textContent = block.text;
        el.style.cssText = "margin:0;font-size:" + block.fontSize + ";color:" + block.color + ";text-align:" + block.align + ";line-height:1.6;white-space:pre-wrap;";
        return el;
      }
      case "button": {
        var wrap = document.createElement("div");
        wrap.style.textAlign = block.align;
        var btn = document.createElement("a");
        btn.href = block.url; btn.textContent = block.label;
        if (block.openInNewTab) btn.target = "_blank";
        btn.style.cssText = [
          "display:" + (block.fullWidth ? "block" : "inline-block"),
          "background:" + block.backgroundColor,
          "color:" + block.color,
          "font-size:" + block.fontSize,
          "border-radius:" + block.borderRadius,
          "padding:10px 24px",
          "text-decoration:none",
          "text-align:center",
          "cursor:pointer",
          "font-family:inherit",
        ].join(";");
        wrap.appendChild(btn);
        return wrap;
      }
      case "countdown": {
        var wrap = document.createElement("div");
        wrap.style.cssText = "font-size:" + block.fontSize + ";color:" + block.color + ";text-align:" + block.align + ";font-family:monospace;font-weight:600;";
        var target = new Date(block.targetDate).getTime();
        var update = function () {
          var diff = target - Date.now();
          if (diff <= 0) { wrap.textContent = block.expiredText; return; }
          var h = Math.floor(diff/3600000), m = Math.floor((diff%3600000)/60000), s = Math.floor((diff%60000)/1000);
          wrap.textContent = pad(h) + " : " + pad(m) + " : " + pad(s);
        };
        function pad(n) { return n < 10 ? "0"+n : ""+n; }
        update();
        setInterval(update, 1000);
        return wrap;
      }
      case "email-input": {
        var form = document.createElement("div");
        form.style.cssText = "display:flex;gap:8px;flex-wrap:wrap;";
        var inp = document.createElement("input");
        inp.type = "email"; inp.placeholder = block.placeholder;
        inp.style.cssText = "flex:1;min-width:140px;padding:8px 12px;border:1px solid #ddd;border-radius:8px;font-size:14px;font-family:inherit;";
        var btn = document.createElement("button");
        btn.textContent = block.buttonLabel;
        btn.style.cssText = "padding:8px 16px;background:" + block.buttonColor + ";color:" + block.buttonTextColor + ";border:none;border-radius:8px;font-size:14px;cursor:pointer;font-family:inherit;white-space:nowrap;";
        var msg = document.createElement("p");
        msg.style.cssText = "display:none;width:100%;margin:4px 0 0;font-size:13px;color:#166534;";
        btn.onclick = function () {
          var email = inp.value.trim();
          if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { inp.style.borderColor = "#ef4444"; return; }
          inp.style.borderColor = "#ddd";
          if (block.webhookUrl) {
            fetch(block.webhookUrl, { method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify({ email: email }) }).catch(function(){});
          }
          form.style.display = "none";
          msg.style.display = "block";
          msg.textContent = block.successMessage;
        };
        form.appendChild(inp); form.appendChild(btn);
        var wrap = document.createElement("div");
        wrap.appendChild(form); wrap.appendChild(msg);
        return wrap;
      }
    }
    return null;
  }

  global.ComenteiPopup = new ComenteiPopup();
})(window);
