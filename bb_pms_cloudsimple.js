// bb_pms_cloudsimple.js — OneDrive (no MSAL) — configured with your current share link
// IMPORTANT: Replace CLOUD_LOAD_URL with the *direct download* URL (see README), not the share page.
(function(){
  const CLOUD_SAVE_URL = ''; // optional: not available with plain OneDrive share (see README)
  const CLOUD_LOAD_URL = 'https://1drv.ms/u/c/48f91d8953b1c702/IQDaTlG-SUbPT5iyD2-TnjCOAaq6ocOi71BDuT1x4CxZV7k?e=imRdk2'; // <-- currently your share page; swap with direct download URL

  function ensureToolbar(){
    let bar = document.getElementById('cloudToolbar');
    if(!bar){
      const anchor = document.querySelector('#topbar') || document.body.firstElementChild;
      bar = document.createElement('div');
      bar.id = 'cloudToolbar';
      bar.className = 'd-flex align-items-center gap-2 p-2 border-bottom';
      bar.style.background='rgba(255,255,255,.9)';
      bar.style.backdropFilter='blur(6px)';
      (anchor&&anchor.parentNode?anchor.parentNode:document.body).insertBefore(bar, anchor?anchor.nextSibling:null);
    }
    bar.innerHTML = [
      '<span class="small text-muted">Cloud (OneDrive semplice): <b id="cloudSimpleStatus">pronto</b></span>',
      '<button id="btnSimpleSave" class="btn btn-sm btn-outline-primary">Sincronizza ora</button>',
      '<div class="btn-group">',
      '  <button class="btn btn-sm btn-outline-secondary dropdown-toggle" data-bs-toggle="dropdown">Avanzate</button>',
      '  <ul class="dropdown-menu dropdown-menu-end">',
      '    <li><a class="dropdown-item" href="#" id="btnSimpleLoad">Carica dal cloud (forza)</a></li>',
      '    <li><a class="dropdown-item" href="#" id="btnSimpleExport">Esporta backup JSON</a></li>',
      '  </ul>',
      '</div>',
      '<span class="small text-muted ms-2">Ultimo cloud: <span id="cloudLast">—</span></span>'
    ].join('');

    document.getElementById('btnSimpleSave').onclick = async ()=>{
      try{ await cloudSaveSimple(); alert('Sync completata (se configurato)'); }catch(e){ alert('Errore sync: '+e.message); }
    };
    document.getElementById('btnSimpleLoad').onclick = async (e)=>{ e.preventDefault(); try{ await cloudLoadSimple(); fullRerenderSafe(); alert('Dati caricati dal cloud'); }catch(err){ alert('Errore cloud load: '+err.message); } };
    document.getElementById('btnSimpleExport').onclick = (e)=>{ e.preventDefault(); exportLocalBackup(); };
  }

  function setStatus(t){ const el=document.getElementById('cloudSimpleStatus'); if(el) el.textContent=t; }
  function setLast(ts){ const el=document.getElementById('cloudLast'); if(el) el.textContent=ts||'—'; }

  function getPayload(){
    try{
      return {
        rooms   : Array.isArray(window.state?.rooms)    ? window.state.rooms    : [],
        guests  : Array.isArray(window.state?.guests)   ? window.state.guests   : [],
        bookings: Array.isArray(window.state?.bookings) ? window.state.bookings : []
      };
    }catch{ return { rooms:[], guests:[], bookings:[] }; }
  }

  async function cloudSaveSimple(){
    if(!CLOUD_SAVE_URL) throw new Error('Salvataggio diretto su OneDrive non disponibile senza Power Automate o proxy. Usa "Esporta backup JSON" e carica il file a mano su OneDrive, oppure chiedimi il proxy gratuito.');
    const envelope={ version:1, updatedAt:new Date().toISOString(), payload:getPayload() };
    setStatus('salvataggio…');
    const r=await fetch(CLOUD_SAVE_URL,{ method:'PUT', headers:{'Content-Type':'application/json'}, body:JSON.stringify(envelope) });
    if(!r.ok) throw new Error('Upload '+r.status);
    setStatus('sincronizzato'); setLast(envelope.updatedAt);
  }

  async function cloudLoadSimple(){
    if(!CLOUD_LOAD_URL) throw new Error('Configura CLOUD_LOAD_URL');
    setStatus('caricamento…');
    const r = await fetch(CLOUD_LOAD_URL, { method:'GET', headers:{'Accept':'application/json'} });
    // Nota: se CLOUD_LOAD_URL è il link di condivisione (pagina HTML) fallirà. Serve il link "download" diretto.
    if(!r.ok) throw new Error('Download '+r.status);
    const json = await r.json();
    const payload = json?.payload || json;
    window.state = window.state || {};
    if(Array.isArray(payload.rooms) && payload.rooms.length>0)      window.state.rooms    = payload.rooms;    else window.state.rooms    = window.state.rooms || [];
    if(Array.isArray(payload.guests) && payload.guests.length>0)    window.state.guests   = payload.guests;   else window.state.guests   = window.state.guests || [];
    if(Array.isArray(payload.bookings) && payload.bookings.length>0)window.state.bookings = payload.bookings; else window.state.bookings = window.state.bookings || [];
    if(typeof window.saveState==='function') window.saveState(window.state);
    setStatus('sincronizzato'); setLast(new Date().toISOString());
  }

  function exportLocalBackup(){
    const envelope={ version:1, exportedAt:new Date().toISOString(), payload:getPayload() };
    const blob=new Blob([JSON.stringify(envelope,null,2)],{type:'application/json'});
    const a=document.createElement('a'); a.href=URL.createObjectURL(blob);
    a.download='bb_pms_backup_'+new Date().toISOString().replace(/[:]/g,'-').slice(0,19)+'.json'; a.click();
  }

  function fullRerenderSafe(){
    try{ if(typeof renderCalendar==='function') renderCalendar(); }catch{}
    try{ if(typeof renderDashboard==='function') renderDashboard(); }catch{}
    try{ if(typeof renderRooms==='function') renderRooms(); }catch{}
    try{ if(typeof renderBookingsTable==='function') renderBookingsTable(); }catch{}
  }

  document.addEventListener('DOMContentLoaded', ()=>{ try{ ensureToolbar(); }catch(e){ console.error(e); } });
})();
