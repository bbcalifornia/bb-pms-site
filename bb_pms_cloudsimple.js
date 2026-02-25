// bb_pms_cloudsimple.js — client per il Worker su Cloudflare (Sincronizzazione PMS)

// ========================================================
// CONFIGURAZIONE (il tuo Worker + token)
// ========================================================
const WORKER_BASE = "https://silent-mode-68f2.bbcalifornia.workers.dev";
const API_TOKEN   = "california"; // Secret che hai inserito su Cloudflare

const CLOUD_LOAD_URL = WORKER_BASE + "/load";
const CLOUD_SAVE_URL = WORKER_BASE + "/save";

// ========================================================
// TOOLBAR UI
// ========================================================
(function(){
  function ensureToolbar(){
    let bar = document.getElementById("cloudToolbar");
    if(!bar){
      const anchor = document.querySelector("#topbar") || document.body.firstElementChild;
      bar = document.createElement("div");
      bar.id = "cloudToolbar";
      bar.className = "d-flex align-items-center gap-2 p-2 border-bottom";
      bar.style.background = "rgba(255,255,255,.9)";
      bar.style.backdropFilter = "blur(6px)";
      (anchor && anchor.parentNode ? anchor.parentNode : document.body)
        .insertBefore(bar, anchor ? anchor.nextSibling : null);
    }

    bar.innerHTML = [
      '<span class="small text-muted">Cloud (Worker): <b id="cloudSimpleStatus">pronto</b></span>',
      '<button id="btnSimpleSave" class="btn btn-sm btn-outline-primary">Sincronizza ora</button>',
      '<div class="btn-group">',
      '  <button class="btn btn-sm btn-outline-secondary dropdown-toggle" data-bs-toggle="dropdown">Avanzate</button>',
      '  <ul class="dropdown-menu dropdown-menu-end">',
      '    <li>#Carica dal cloud (forza)</a></li>',
      '    <li>#Esporta backup JSON</a></li>',
      "  </ul>",
      "</div>",
      '<span class="small text-muted ms-2">Ultimo cloud: <span id="cloudLast">—</span></span>'
    ].join("");

    document.getElementById("btnSimpleSave").onclick = async () => {
      try{ await cloudSaveSimple(); alert("Sync completata"); }
      catch(e){ alert("Errore sync: " + e.message); }
    };

    document.getElementById("btnSimpleLoad").onclick = async (e) => {
      e.preventDefault();
      try{
        await cloudLoadSimple();
        fullRerenderSafe();
        alert("Dati caricati dal cloud");
      }catch(err){
        alert("Errore cloud load: " + err.message);
      }
    };

    document.getElementById("btnSimpleExport").onclick = (e) => {
      e.preventDefault();
      exportLocalBackup();
    };
  }

  function setStatus(t){
    const el = document.getElementById("cloudSimpleStatus");
    if(el) el.textContent = t;
  }

  function setLast(ts){
    const el = document.getElementById("cloudLast");
    if(el) el.textContent = ts || "—";
  }

  function getHeaders(){
    const h = { "Content-Type": "application/json" };
    if(API_TOKEN) h["Authorization"] = "Bearer " + API_TOKEN;
    return h;
  }

  function getPayload(){
    return {
      rooms: Array.isArray(window.state?.rooms) ? window.state.rooms : [],
      guests: Array.isArray(window.state?.guests) ? window.state.guests : [],
      bookings: Array.isArray(window.state?.bookings) ? window.state.bookings : []
    };
  }

  // =======================
  // LOAD (GET)
  // =======================
  async function cloudLoadSimple(){
    setStatus("caricamento…");

    const r = await fetch(CLOUD_LOAD_URL, {
      method: "GET",
      headers: API_TOKEN ? { "Authorization": "Bearer " + API_TOKEN } : {}
    });

    if(!r.ok) throw new Error("Errore cloud load: " + r.status);

    const json = await r.json();
    const payload = json?.payload || json;

    window.state = window.state || {};

    if(Array.isArray(payload.rooms) && payload.rooms.length > 0)
      window.state.rooms = payload.rooms;

    if(Array.isArray(payload.guests) && payload.guests.length > 0)
      window.state.guests = payload.guests;

    if(Array.isArray(payload.bookings) && payload.bookings.length > 0)
      window.state.bookings = payload.bookings;

    if(typeof window.saveState === "function")
      window.saveState(window.state);

    setStatus("sincronizzato");
    setLast(new Date().toISOString());
  }

  // =======================
  // SAVE (POST)
  // =======================
  async function cloudSaveSimple(){
    const envelope = {
      version: 1,
      updatedAt: new Date().toISOString(),
      payload: getPayload()
    };

    setStatus("salvataggio…");

    const r = await fetch(CLOUD_SAVE_URL, {
      method: "POST",
      headers: getHeaders(),
      body: JSON.stringify(envelope)
    });

    if(!r.ok) throw new Error("Errore save: " + r.status);

    setStatus("sincronizzato");
    setLast(envelope.updatedAt);
  }

  function exportLocalBackup(){
    const envelope = {
      version: 1,
      exportedAt: new Date().toISOString(),
      payload: getPayload()
    };

    const blob = new Blob([JSON.stringify(envelope,null,2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "bb_pms_backup_" + new Date().toISOString().replace(/[:]/g,"-") + ".json";
    a.click();
  }

  function fullRerenderSafe(){
    try{ if(typeof renderCalendar==="function") renderCalendar(); }catch{}
    try{ if(typeof renderDashboard==="function") renderDashboard(); }catch{}
    try{ if(typeof renderRooms==="function") renderRooms(); }catch{}
    try{ if(typeof renderBookingsTable==="function") renderBookingsTable(); }catch{}
  }

  document.addEventListener("DOMContentLoaded", () => {
    ensureToolbar();
  });
})();
