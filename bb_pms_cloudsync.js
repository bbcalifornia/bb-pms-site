// bb_pms_cloudsync.js — FINAL PATCH: explicit payload (rooms/guests/bookings) + safe load
(function(){
  const CDN_JSDELIVR = "https://cdn.jsdelivr.net/npm/@azure/msal-browser@2.38.2/dist/msal-browser.min.js";
  const CDN_MS = "https://alcdn.msauth.net/browser/2.38.2/js/msal-browser.min.js"; // Microsoft CDN
  const GRAPH_BASE = "https://graph.microsoft.com/v1.0";
  const CLOUD_FILE_NAME = "bb_california_pms.json";
  const CLIENT_ID = "ce6bed56-eb99-4999-9fca-95ade258cc3a";
  const REDIRECT = "https://bbcalifornia.github.io/bb-pms-site/";

  let msalInstance = null;
  let msalReady = false;
  let cloudETag = null;
  let syncDebounceTimer = null;
  let autoRefreshTimer = null;

  function delay(ms){return new Promise(r=>setTimeout(r,ms));}
  function nowISO(){return new Date().toISOString();}

  function injectScript(src){
    return new Promise((res, rej)=>{
      if (document.querySelector(`script[src='${src}']`)) { res(); return; }
      const s=document.createElement('script');
      s.src=src; s.defer=true; s.onload=res; s.onerror=()=>rej(new Error('load_failed:'+src));
      document.head.appendChild(s);
    });
  }

  async function loadMsalFromAnyCdn(){
    const order=[CDN_JSDELIVR, CDN_MS];
    for (const url of order){
      try{
        await injectScript(url);
        for (let i=0;i<20;i++){ if (window.msal) return url; await delay(25); }
      }catch(e){ console.warn('MSAL load error:', e && e.message || e); }
    }
    return null;
  }

  function ensureToolbar(){
    if (document.getElementById('cloudToolbar')) return;
    const bar=document.createElement('div');
    bar.id='cloudToolbar';
    bar.className='d-flex align-items-center gap-2 p-2 border-bottom';
    bar.style.background='rgba(255,255,255,.9)'; bar.style.backdropFilter='blur(6px)';
    bar.innerHTML=`<div class=\"d-flex flex-wrap align-items-center gap-2 w-100\">\n      <span id=\"cloudStatus\" class=\"small text-muted\">Cloud: non connesso</span>\n      <div class=\"ms-auto d-flex gap-2\">\n        <button id=\"btnSignIn\" class=\"btn btn-sm btn-primary\" disabled>Accedi</button>\n        <button id=\"btnSignOut\" class=\"btn btn-sm btn-outline-secondary\">Esci</button>\n        <button id=\"btnSyncNow\" class=\"btn btn-sm btn-outline-primary\">Sincronizza ora</button>\n        <div class=\"btn-group\">\n          <button class=\"btn btn-sm btn-outline-secondary dropdown-toggle\" data-bs-toggle=\"dropdown\">Avanzate</button>\n          <ul class=\"dropdown-menu dropdown-menu-end\">\n            <li><a class=\"dropdown-item\" href=\"#\" id=\"btnCloudLoad\">Carica dal cloud (forza)</a></li>\n            <li><a class=\"dropdown-item\" href=\"#\" id=\"btnExportJSON\">Esporta backup JSON</a></li>\n          </ul>\n        </div>\n      </div>\n    </div>`;
    const anchor=document.querySelector('#topbar')||document.body.firstElementChild; (anchor&&anchor.parentNode?anchor.parentNode:document.body).insertBefore(bar, anchor?anchor.nextSibling:null);
    document.getElementById('btnSignIn').onclick = signIn;
    document.getElementById('btnSignOut').onclick = () => { try{ const acc=msalInstance && msalInstance.getAllAccounts ? msalInstance.getAllAccounts()[0] : null; if(acc && msalInstance) msalInstance.logoutPopup({account:acc}); }catch{} updateStatus(); };
    document.getElementById('btnSyncNow').onclick = async()=>{ try{ await cloudSave(true); alert('Sync completata'); }catch(e){ alert('Errore sync: '+e.message);} };
    document.getElementById('btnCloudLoad').onclick = async (e)=>{ e.preventDefault(); try{ await cloudLoad(); fullRerender(); alert('Dati caricati dal cloud'); }catch(e2){ alert('Errore cloud load: '+e2.message);} };
    document.getElementById('btnExportJSON').onclick = (e)=>{ e.preventDefault(); exportLocalBackup(); };
  }

  function updateStatus(text){ const acc = (msalInstance && msalInstance.getAllAccounts) ? msalInstance.getAllAccounts()[0] : null; const el=document.getElementById('cloudStatus'); if(el) el.textContent = text || (acc?(`Cloud: connesso a ${acc.name||acc.username}`):'Cloud: non connesso'); }

  async function ensureMsal(){
    if (msalReady && msalInstance) return true;
    const used = await loadMsalFromAnyCdn();
    if (!window.msal){ console.warn('MSAL non caricato'); return false; }
    try{
      msalInstance = new msal.PublicClientApplication({
        auth:{ clientId: CLIENT_ID, authority: "https://login.microsoftonline.com/common", redirectUri: REDIRECT },
        cache:{ cacheLocation:"sessionStorage", storeAuthStateInCookie: true }
      });
      if (typeof msalInstance.handleRedirectPromise === 'function') {
        try { await msalInstance.handleRedirectPromise(); } catch(e){ console.warn('handleRedirectPromise', e); }
      }
      msalReady = true; const btn=document.getElementById('btnSignIn'); if(btn) btn.disabled=false;
      updateStatus();
      console.log('MSAL ready via', used);
      return true;
    }catch(e){ console.error('Init MSAL error', e); return false; }
  }

  async function signIn(){
    try{
      const ok = await ensureMsal();
      if (!ok){ alert('MSAL non è pronto. Ricarica la pagina e riprova.'); return; }
      const scopes=["User.Read","openid","profile","offline_access","Files.ReadWrite.AppFolder"];
      let acc = null; try{ acc = msalInstance.getAllAccounts()[0]; }catch(e){ console.warn('getAllAccounts error', e); }
      if(!acc){
        try{ await msalInstance.loginPopup({scopes}); }
        catch(e){ console.warn('loginPopup fallito, provo redirect', e); msalInstance.loginRedirect({scopes}); return; }
      }
      updateStatus(); await cloudLoad(); fullRerender(); startAutoRefresh();
    }catch(e){ console.error(e); alert('Login/Cloud load fallito: '+e.message); }
  }

  function startAutoRefresh(){ try{ if(autoRefreshTimer) clearInterval(autoRefreshTimer);}catch{} autoRefreshTimer=setInterval(async()=>{ try{ const prev=cloudETag; const data=await cloudLoad(); if(data && cloudETag!==prev) fullRerender(); }catch(e){ console.warn('Auto-refresh error:', e);} }, 3*60*1000); }

  async function getToken(scopes){ scopes=scopes||["User.Read","openid","profile","offline_access","Files.ReadWrite.AppFolder"]; const acc=(msalInstance&&msalInstance.getAllAccounts)?msalInstance.getAllAccounts()[0]:null; if(!acc){ await signIn(); throw new Error('no_account'); } try{ const res=await msalInstance.acquireTokenSilent({scopes, account: acc}); return res.accessToken; }catch(e){ const res=await msalInstance.acquireTokenPopup({scopes}).catch(()=>{ msalInstance.loginRedirect({scopes}); }); if(!res) throw new Error('token_via_redirect'); return res.accessToken; } }

  async function getAppRoot(token){ const r=await fetch(`${GRAPH_BASE}/me/drive/special/approot`,{headers:{Authorization:`Bearer ${token}`}}); if(!r.ok) throw new Error('approot '+r.status); return r.json(); }

  async function ensureFolderUnderRoot(token,path){ let r=await fetch(`${GRAPH_BASE}/me/drive/root:/${encodeURIComponent(path)}`,{headers:{Authorization:`Bearer ${token}`}}); if(r.status===404){ const parts=path.split('/'); let cur=''; for(const p of parts){ cur=cur?(cur+'/'+p):p; let rr=await fetch(`${GRAPH_BASE}/me/drive/root:/${encodeURIComponent(cur)}`,{headers:{Authorization:`Bearer ${token}`}}); if(rr.status===404){ rr=await fetch(`${GRAPH_BASE}/me/drive/root/children`,{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify({name:p, folder:{}, '@microsoft.graph.conflictBehavior':'replace'})}); if(!rr.ok) throw new Error('create_folder '+cur+' '+rr.status); } } r=await fetch(`${GRAPH_BASE}/me/drive/root:/${encodeURIComponent(path)}`,{headers:{Authorization:`Bearer ${token}`}}); } if(!r.ok) throw new Error('ensureFolder '+path+' '+r.status); return r.json(); }

  async function cloudLoad(){ const token=await getToken();
    // AppFolder first
    try{
      await getAppRoot(token);
      const metaRes=await fetch(`${GRAPH_BASE}/me/drive/special/approot:/${CLOUD_FILE_NAME}`,{headers:{Authorization:`Bearer ${token}`}});
      if(metaRes.status===404){ cloudETag=null; window.cloudETag = cloudETag; return null; }
      if(!metaRes.ok) throw new Error('meta '+metaRes.status);
      const meta=await metaRes.json(); cloudETag=meta.eTag||meta['@odata.etag']||null; window.cloudETag = cloudETag;
      const r=await fetch(`${GRAPH_BASE}/me/drive/special/approot:/${CLOUD_FILE_NAME}:/content`,{headers:{Authorization:`Bearer ${token}`}});
      if(!r.ok) throw new Error('download '+r.status);
      const json=await r.json();
      if(json && json.payload){
        const payload=json.payload||{}; window.state=window.state||{};
        window.state.rooms    = Array.isArray(payload.rooms)    ? payload.rooms    : (window.state.rooms    || []);
        window.state.guests   = Array.isArray(payload.guests)   ? payload.guests   : (window.state.guests   || []);
        window.state.bookings = Array.isArray(payload.bookings) ? payload.bookings : (window.state.bookings || []);
        try{ window.state.__updatedAt = json.updatedAt || window.state.__updatedAt; }catch{}
        if(typeof window.saveState==='function') window.saveState(window.state);
      }
      return json;
    }catch(e){ console.warn('AppFolder load fallita, provo fallback', e); }
    // Fallback under /Apps
    const folder=await ensureFolderUnderRoot(token,'Apps/BB-California-PMS');
    const url=`${GRAPH_BASE}/me/drive/items/${folder.id}:/${CLOUD_FILE_NAME}`;
    const m2=await fetch(url,{headers:{Authorization:`Bearer ${token}`}});
    if(m2.status===404){ cloudETag=null; window.cloudETag = cloudETag; return null; }
    if(!m2.ok) throw new Error('meta2 '+m2.status);
    const meta2=await m2.json(); cloudETag=meta2.eTag||meta2['@odata.etag']||null; window.cloudETag = cloudETag;
    const r2=await fetch(`${url}:/content`,{headers:{Authorization:`Bearer ${token}`}});
    if(!r2.ok) throw new Error('download2 '+r2.status);
    const json2=await r2.json();
    if(json2 && json2.payload){
      const payload=json2.payload||{}; window.state=window.state||{};
      window.state.rooms    = Array.isArray(payload.rooms)    ? payload.rooms    : (window.state.rooms    || []);
      window.state.guests   = Array.isArray(payload.guests)   ? payload.guests   : (window.state.guests   || []);
      window.state.bookings = Array.isArray(payload.bookings) ? payload.bookings : (window.state.bookings || []);
      try{ window.state.__updatedAt = json2.updatedAt || window.state.__updatedAt; }catch{}
      if(typeof window.saveState==='function') window.saveState(window.state);
    }
    return json2;
  }

  async function cloudSave(force){ const token=await getToken();
    // --- explicit payload ---
    const payload={
      rooms: Array.isArray(window.state?.rooms)? window.state.rooms : [],
      guests: Array.isArray(window.state?.guests)? window.state.guests : [],
      bookings: Array.isArray(window.state?.bookings)? window.state.bookings : []
    };
    const envelope={ version:1, updatedAt:nowISO(), payload };
    const body=JSON.stringify(envelope);
    // AppFolder first
    try{
      await getAppRoot(token);
      const url=`${GRAPH_BASE}/me/drive/special/approot:/${CLOUD_FILE_NAME}:/content`;
      const headers={Authorization:`Bearer ${token}`,'Content-Type':'application/json'};
      if(cloudETag && !force) headers['If-Match']=cloudETag;
      let r=await fetch(url,{method:'PUT', headers, body});
      if(r.status===412 && !force){ await cloudLoad(); return false; }
      if(!r.ok) throw new Error('upload '+r.status);
      const meta=await r.json(); cloudETag=meta.eTag||meta['@odata.etag']||null; window.cloudETag=cloudETag;
      try{ window.state.__updatedAt = envelope.updatedAt; }catch{}
      await maybeAutoBackup(token,envelope); updateStatus('Cloud: sincronizzato'); return true;
    }catch(e){ console.warn('AppFolder save fallita, provo fallback', e); }
    // Fallback under /Apps
    const folder=await ensureFolderUnderRoot(token,'Apps/BB-California-PMS');
    const url2=`${GRAPH_BASE}/me/drive/items/${folder.id}:/${CLOUD_FILE_NAME}:/content`;
    const headers2={Authorization:`Bearer ${token}`,'Content-Type':'application/json'};
    if(cloudETag && !force) headers2['If-Match']=cloudETag;
    let r2=await fetch(url2,{method:'PUT', headers: headers2, body});
    if(r2.status===412 && !force){ await cloudLoad(); return false; }
    if(!r2.ok) throw new Error('upload2 '+r2.status);
    const meta2=await r2.json(); cloudETag=meta2.eTag||meta2['@odata.etag']||null; window.cloudETag=cloudETag;
    try{ window.state.__updatedAt = envelope.updatedAt; }catch{}
    await maybeAutoBackup(token,envelope); updateStatus('Cloud: sincronizzato'); return true;
  }

  async function ensureBackupFolder(token){ try{ await getAppRoot(token); let r=await fetch(`${GRAPH_BASE}/me/drive/special/approot:/Backups`,{headers:{Authorization:`Bearer ${token}`}}); if(r.status===404){ r=await fetch(`${GRAPH_BASE}/me/drive/special/approot/children`,{method:'POST', headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'}, body: JSON.stringify({ name: 'Backups', folder:{}, '@microsoft.graph.conflictBehavior':'replace' })}); } if(!r.ok) throw new Error('ensure_backups '+r.status); return 'approot'; }catch(e){} await ensureFolderUnderRoot(token,'Apps/BB-California-PMS/Backups'); return 'root'; }

  async function cloudBackup(envelope){ const token=await getToken(); const where=await ensureBackupFolder(token); const fname = `backup_${new Date().toISOString().replace(/[:]/g,'-').slice(0,19)}.json`; const body = JSON.stringify(envelope, null, 2); if(where==='approot'){ const url=`${GRAPH_BASE}/me/drive/special/approot:/Backups/${fname}:/content`; const r=await fetch(url,{method:'PUT', headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'}, body}); if(!r.ok) throw new Error('backup_put '+r.status); return true; }else{ const folder=await ensureFolderUnderRoot(token,'Apps/BB-California-PMS/Backups'); const url=`${GRAPH_BASE}/me/drive/items/${folder.id}:/Backups/${fname}:/content`; const r=await fetch(url,{method:'PUT', headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'}, body}); if(!r.ok) throw new Error('backup_put2 '+r.status); return true; } }

  async function maybeAutoBackup(token,envelope){ try{ const k='bb_pms_last_backup_ts'; const last=+(localStorage.getItem(k)||'0'); const now=Date.now(); if(now-last >= 60*60*1000){ await cloudBackup(envelope); localStorage.setItem(k, String(now)); } }catch(e){ console.warn('Backup automatico fallito:', e); } }

  function exportLocalBackup(){ const envelope={version:1, exportedAt:nowISO(), payload:window.state}; const blob=new Blob([JSON.stringify(envelope, null, 2)],{type:'application/json'}); const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=`bb_california_backup_${new Date().toISOString().replace(/[:]/g,'-').slice(0,19)}.json`; a.click(); }

  function fullRerender(){ try{ if(typeof renderCalendar==='function') renderCalendar(); }catch{} try{ if(typeof renderDashboard==='function') renderDashboard(); }catch{} try{ if(typeof renderRooms==='function') renderRooms(); }catch{} try{ if(typeof renderBookingsTable==='function') renderBookingsTable(); }catch{} }

  function patchSaveState(){ if(!window.saveState || window.saveState.__patched) return; const _o=window.saveState; window.saveState=function(s){ const ret=_o.call(this,s); if(syncDebounceTimer) clearTimeout(syncDebounceTimer); syncDebounceTimer=setTimeout(()=>{ cloudSave(false).catch(console.error); },1200); return ret; }; window.saveState.__patched=true; }

  document.addEventListener('DOMContentLoaded', async ()=>{
    try{ ensureToolbar(); const ok = await ensureMsal(); if (ok) patchSaveState(); }catch(e){ console.error('CloudSync boot error', e); }
  });
})();
