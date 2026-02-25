// bb_pms_cloud_client_min.js — client minimal per Cloudflare Worker (nessuna modifica UI)
// Espone due funzioni globali:
//   - cloudSave()  → POST /save  (rooms/guests/bookings)
//   - cloudLoad()  → GET  /load  (ricarica in modo NON distruttivo e rerender)
// Configura qui URL del Worker e API_TOKEN
(function(){
  const WORKER_BASE = 'https://silent-mode-68f2.bbcalifornia.workers.dev';
  const API_TOKEN   = 'california';

  function headers(json=false){
    const h={};
    if(json) h['Content-Type']='application/json';
    if(API_TOKEN) h['Authorization']='Bearer '+API_TOKEN;
    return h;
  }
  function getPayload(){
    return {
      rooms   : Array.isArray(window.state?.rooms)    ? window.state.rooms    : [],
      guests  : Array.isArray(window.state?.guests)   ? window.state.guests   : [],
      bookings: Array.isArray(window.state?.bookings) ? window.state.bookings : []
    };
  }
  async function cloudSave(){
    const envelope={ version:1, updatedAt:new Date().toISOString(), payload:getPayload() };
    const r=await fetch(WORKER_BASE+'/save',{ method:'POST', headers:headers(true), body:JSON.stringify(envelope) });
    if(!r.ok) throw new Error('Save error '+r.status);
    const js=await r.json().catch(()=>({ok:true}));
    console.log('[Cloud] SAVE OK', js);
    return js;
  }
  async function cloudLoad(){
    const r=await fetch(WORKER_BASE+'/load',{ headers:headers(false) });
    if(!r.ok) throw new Error('Load error '+r.status);
    const js=await r.json();
    const p=js?.payload||js;
    window.state=window.state||{};
    if(Array.isArray(p.rooms)    && p.rooms.length)    window.state.rooms=p.rooms;
    if(Array.isArray(p.guests)   && p.guests.length)   window.state.guests=p.guests;
    if(Array.isArray(p.bookings) && p.bookings.length) window.state.bookings=p.bookings;
    if(typeof window.saveState==='function') window.saveState(window.state);
    try{ if(typeof renderCalendar==='function') renderCalendar(); }catch{}
    try{ if(typeof renderDashboard==='function') renderDashboard(); }catch{}
    try{ if(typeof renderBookingsTable==='function') renderBookingsTable(); }catch{}
    console.log('[Cloud] LOAD OK', p);
    return p;
  }
  // Esporta in window
  window.cloudSave = cloudSave;
  window.cloudLoad = cloudLoad;
  console.log('[Cloud client minimal] pronto. Usa cloudSave() e cloudLoad() dalla Console.');
})();
