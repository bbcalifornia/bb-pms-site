// bb_pms_cloudsimple.js — OneDrive (no MSAL) — configurato con il tuo URL di download
// Carica i dati dal file OneDrive pubblico bb_pms_data.json.
// Per il salvataggio automatico vedi le note in fondo (CLOUD_SAVE_URL con proxy).

(function () {
  // =======================
  // CONFIGURAZIONE
  // =======================

  // URL DIRETTO DI DOWNLOAD (quello che hai appena fornito):
  const CLOUD_LOAD_URL =
    "https://onedrive.live.com/personal/48f91d8953b1c702/_layouts/15/download.aspx?UniqueId=f35ca301%2Df821%2D4980%2D8700%2Dd34eb369b868";

  // Lasciamo vuoto: OneDrive pubblico non accetta PUT dal browser.
  // Se vuoi il salvataggio automatico, ti fornisco un endpoint proxy e lo incolliamo qui.
  const CLOUD_SAVE_URL = ""; // es: "https://bbpms-proxy.tuodominio.workers.dev/save"

  // =======================
  // UI SEMPLICE CLOUD
  // =======================
  function ensureToolbar() {
    let bar = document.getElementById("cloudToolbar");
    if (!bar) {
      const anchor =
        document.querySelector("#topbar") || document.body.firstElementChild;
      bar = document.createElement("div");
      bar.id = "cloudToolbar";
      bar.className = "d-flex align-items-center gap-2 p-2 border-bottom";
      bar.style.background = "rgba(255,255,255,.9)";
      bar.style.backdropFilter = "blur(6px)";
      (anchor && anchor.parentNode ? anchor.parentNode : document.body).insertBefore(
        bar,
        anchor ? anchor.nextSibling : null
      );
    }

    bar.innerHTML = [
      '<span class="small text-muted">Cloud (OneDrive): <b id="cloudSimpleStatus">pronto</b></span>',
      '<button id="btnSimpleSave" class="btn btn-sm btn-outline-primary">Sincronizza ora</button>',
      '<div class="btn-group">',
      '  <button class="btn btn-sm btn-outline-secondary dropdown-toggle" data-bs-toggle="dropdown">Avanzate</button>',
      '  <ul class="dropdown-menu dropdown-menu-end">',
      '    <li>#Carica dal cloud (forza)</a></li>',
      '    <li>#Esporta backup JSON</a></li>',
      "  </ul>",
      "</div>",
      '<span class="small text-muted ms-2">Ultimo cloud: <span id="cloudLast">—</span></span>',
    ].join("");

    document.getElementById("btnSimpleSave").onclick = async () => {
      try {
        await cloudSaveSimple();
        alert("Sync completata");
      } catch (e) {
        alert("Errore sync: " + e.message);
      }
    };
    document.getElementById("btnSimpleLoad").onclick = async (e) => {
      e.preventDefault();
      try {
        await cloudLoadSimple();
        fullRerenderSafe();
        alert("Dati caricati dal cloud");
      } catch (err) {
        alert("Errore cloud load: " + err.message);
      }
    };
    document.getElementById("btnSimpleExport").onclick = (e) => {
      e.preventDefault();
      exportLocalBackup();
    };
  }

  function setStatus(t) {
    const el = document.getElementById("cloudSimpleStatus");
    if (el) el.textContent = t;
  }
  function setLast(ts) {
    const el = document.getElementById("cloudLast");
    if (el) el.textContent = ts || "—";
  }

  // Serializza solo ciò che serve (robusto, non dipende da state “strano”)
  function getPayload() {
    try {
      return {
        rooms: Array.isArray(window.state?.rooms) ? window.state.rooms : [],
        guests: Array.isArray(window.state?.guests) ? window.state.guests : [],
        bookings: Array.isArray(window.state?.bookings)
          ? window.state.bookings
          : [],
      };
    } catch {
      return { rooms: [], guests: [], bookings: [] };
    }
  }

  // ==============
  // LOAD (GET)
  // ==============
  async function cloudLoadSimple() {
    if (!CLOUD_LOAD_URL) throw new Error("Configura CLOUD_LOAD_URL");

    setStatus("caricamento…");
    // Importante: fetch dell’URL diretto di download. Deve restituire JSON puro.
    const r = await fetch(CLOUD_LOAD_URL, {
      method: "GET",
      headers: { Accept: "application/json, text/plain, */*" },
    });

    if (!r.ok) {
      // Se vedi 200 ma la risposta è HTML, significa che non è il link “download diretto”
      const text = await r.text().catch(() => "");
      throw new Error("Download " + r.status + (text ? " — " + text.slice(0, 60) : ""));
    }

    // Prova a interpretare come JSON
    const json = await r.json().catch(async () => {
      // Se fallisce il parse, forse OneDrive sta inviando text/plain con JSON: riprova con text() e JSON.parse
      const t = await r.text();
      return JSON.parse(t);
    });

    // Alcuni backup potrebbero essere un “envelope” {version, updatedAt, payload}
    const payload = json?.payload || json;

    // NON-distruttivo: se il cloud è vuoto, preserva i dati locali
    window.state = window.state || {};
    if (Array.isArray(payload.rooms) && payload.rooms.length > 0) {
      window.state.rooms = payload.rooms;
    } else {
      window.state.rooms = window.state.rooms || [];
    }
    if (Array.isArray(payload.guests) && payload.guests.length > 0) {
      window.state.guests = payload.guests;
    } else {
      window.state.guests = window.state.guests || [];
    }
    if (Array.isArray(payload.bookings) && payload.bookings.length > 0) {
      window.state.bookings = payload.bookings;
    } else {
      window.state.bookings = window.state.bookings || [];
    }

    if (typeof window.saveState === "function") window.saveState(window.state);
    setStatus("sincronizzato");
    setLast(new Date().toISOString());
  }

  // ==============
  // SAVE (opzionale)
  // ==============
  async function cloudSaveSimple() {
    if (!CLOUD_SAVE_URL) {
      // Fallback: esporta il backup e spiega cosa fare
      exportLocalBackup();
      throw new Error(
        'Salvataggio diretto non attivo. Ho esportato un backup JSON: caricalo manualmente su OneDrive come "bb_pms_data.json" (sostituisci).'
      );
    }
    // Se inseriamo un proxy in futuro:
    const envelope = {
      version: 1,
      updatedAt: new Date().toISOString(),
      payload: getPayload(),
    };
    setStatus("salvataggio…");
    const r = await fetch(CLOUD_SAVE_URL, {
      method: "POST", // o PUT secondo il proxy
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(envelope),
    });
    if (!r.ok) throw new Error("Upload " + r.status);
    setStatus("sincronizzato");
    setLast(envelope.updatedAt);
  }

  // ==============
  // Export locale (sempre utile)
  // ==============
  function exportLocalBackup() {
    const envelope = {
      version: 1,
      exportedAt: new Date().toISOString(),
      payload: getPayload(),
    };
    const blob = new Blob([JSON.stringify(envelope, null, 2)], {
      type: "application/json",
    });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download =
      "bb_pms_backup_" +
      new Date().toISOString().replace(/[:]/g, "-").slice(0, 19) +
      ".json";
    a.click();
  }

  // ==============
  // Rerender sicuro
  // ==============
  function fullRerenderSafe() {
    try {
      if (typeof renderCalendar === "function") renderCalendar();
    } catch {}
    try {
      if (typeof renderDashboard === "function") renderDashboard();
    } catch {}
    try {
      if (typeof renderRooms === "function") renderRooms();
    } catch {}
    try {
      if (typeof renderBookingsTable === "function") renderBookingsTable();
    } catch {}
  }

  // bootstrap
  document.addEventListener("DOMContentLoaded", () => {
    try {
      ensureToolbar();
    } catch (e) {
      console.error(e);
    }
  });
})();
