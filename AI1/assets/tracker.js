(function () {
  "use strict";
  var cfg = window.W99_CONFIG;
  var redirected = false;
  var progress = 8;
  var startedAt = Date.now();
  var redirectAfter = 4500;
  var hardDeadline = 5200;

  function randomId() {
    try {
      if (window.crypto && typeof window.crypto.randomUUID === "function") return window.crypto.randomUUID();
    } catch (_) {}
    return Date.now().toString(36) + "-" + Math.random().toString(36).slice(2) + "-" + Math.random().toString(36).slice(2);
  }

  function safeGet(store, key) { try { return store.getItem(key); } catch (_) { return null; } }
  function safeSet(store, key, value) { try { store.setItem(key, value); return true; } catch (_) { return false; } }

  function getClickKey() {
    var params = new URLSearchParams(location.search);
    var fbclid = params.get("fbclid");
    if (fbclid) return "fbclid:" + fbclid;
    var key = "w99-session:" + cfg.campaign;
    var value = safeGet(window.sessionStorage, key);
    if (!value) { value = randomId(); safeSet(window.sessionStorage, key, value); }
    return "session:" + value;
  }

  function getVisit() {
    var clickKey = getClickKey();
    var storageKey = "w99-visit:" + cfg.campaign + ":" + clickKey;
    var now = Date.now();
    var raw = safeGet(window.localStorage, storageKey);
    if (raw) {
      try {
        var saved = JSON.parse(raw);
        if (saved.id && now - saved.createdAt < 30 * 60 * 1000) return saved;
      } catch (_) {}
    }
    var visit = { id: randomId(), createdAt: now };
    safeSet(window.localStorage, storageKey, JSON.stringify(visit));
    return visit;
  }

  function cookie(name) {
    var match = document.cookie.match(new RegExp("(?:^|; )" + name.replace(/([.$?*|{}()[\]\\/+^])/g, "\\$1") + "=([^;]*)"));
    return match ? decodeURIComponent(match[1]) : "";
  }

  function destinationUrl() {
    var target = new URL(cfg.destination);
    new URLSearchParams(location.search).forEach(function (value, key) {
      if (!target.searchParams.has(key)) target.searchParams.set(key, value);
    });
    return target.toString();
  }

  var visit = getVisit();
  var ids = {
    PageView: cfg.campaign + "-pv-" + visit.id,
    Contact: cfg.campaign + "-ct-" + visit.id,
    Lead: cfg.campaign + "-ld-" + visit.id
  };

  function sendPixel() {
    try {
      !function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version="2.0";n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,"script","https://connect.facebook.net/en_US/fbevents.js");
      fbq("init", cfg.pixelId);
      fbq("track", "PageView", {}, { eventID: ids.PageView });
      fbq("track", "Contact", {}, { eventID: ids.Contact });
      fbq("track", "Lead", {}, { eventID: ids.Lead });
    } catch (_) {}
  }

  function capiPayload() {
    var params = new URLSearchParams(location.search);
    return {
      eventIds: ids,
      eventTime: Math.floor(Date.now() / 1000),
      eventSourceUrl: location.href,
      fbp: cookie("_fbp"),
      fbc: cookie("_fbc") || (params.get("fbclid") ? "fb.1." + Date.now() + "." + params.get("fbclid") : ""),
      visitId: visit.id
    };
  }

  function sendCapi(attempt) {
    return fetch(cfg.workerEndpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(capiPayload()),
      keepalive: true,
      cache: "no-store"
    }).then(function (response) {
      if (!response.ok) throw new Error("CAPI " + response.status);
      return response.json();
    }).catch(function (error) {
      if (attempt < 2 && Date.now() - startedAt < 2000) {
        return new Promise(function (resolve) { setTimeout(resolve, 300 * (attempt + 1)); }).then(function () { return sendCapi(attempt + 1); });
      }
      return { ok: false, error: String(error) };
    });
  }

  function go() {
    if (redirected) return;
    redirected = true;
    clearInterval(progressTimer);
    document.getElementById("bar").style.width = "100%";
    document.getElementById("percent").textContent = "100%";
    document.getElementById("copy").textContent = "連線完成，正在前往";
    location.replace(destinationUrl());
  }

  sendPixel();
  var capiRequest = sendCapi(0);
  var progressTimer = setInterval(function () {
    progress = Math.min(progress + 7, 94);
    document.getElementById("bar").style.width = progress + "%";
    document.getElementById("percent").textContent = progress + "%";
  }, 150);
  setTimeout(function () { document.getElementById("copy").textContent = "即將為您開啟活動頁面"; }, 1050);
  setTimeout(function () { capiRequest.then(go); }, redirectAfter);
  setTimeout(go, hardDeadline);
})();
