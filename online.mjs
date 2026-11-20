export const ONLINE_VERSION=1;
export function seededRandom(seed){return ()=>((seed=Math.imul(seed,1664525)+1013904223>>>0)/2**32);}
export function validateRecord(r){
  if(!r||r.protocol!==ONLINE_VERSION||!['host','guest'].includes(r.role)||!/^[a-f0-9]{32}$/.test(r.room)||!/^[a-f0-9]{32}$/.test(r.invite))throw Error('Backup online non valido.');
  if(r.role==='host'&&(!Number.isInteger(r.seed)||!Array.isArray(r.commands)||r.commands.length>20000||r.commands.some(c=>!c||![0,1].includes(c.side)||!Number.isInteger(c.index)||c.index<0||c.index>10000||typeof c.id!=='string')||new Set(r.commands.map(c=>c.id)).size!==r.commands.length))throw Error('Cronologia online non valida.');
  if(r.guest!==undefined&&!/^[a-f0-9]{32}$/.test(r.guest))throw Error('Credenziale non valida.');
  if(r.role==='guest'&&(!/^[a-f0-9]{32}$/.test(r.token)||r.revision!==undefined&&(!Number.isInteger(r.revision)||r.revision<0)||r.pending&&(!Number.isInteger(r.pending.index)||r.pending.index<0||!Number.isInteger(r.pending.revision)||r.pending.revision<0||typeof r.pending.id!=='string')))throw Error('Credenziale o richiesta in attesa non valida.');
  return r;
}
const randomId=()=>Array.from(crypto.getRandomValues(new Uint8Array(16)),n=>n.toString(16).padStart(2,'0')).join('');
export async function openStore(){
  const db=await new Promise((resolve,reject)=>{const q=indexedDB.open('simulacra-online-v1',1);q.onupgradeneeded=()=>q.result.createObjectStore('matches',{keyPath:'key'});q.onsuccess=()=>resolve(q.result);q.onerror=()=>reject(q.error);});
  return {
    all:()=>new Promise((resolve,reject)=>{const q=db.transaction('matches').objectStore('matches').getAll();q.onsuccess=()=>resolve(q.result);q.onerror=()=>reject(q.error);}),
    save:r=>new Promise((resolve,reject)=>{
      const tx=db.transaction('matches','readwrite'),s=tx.objectStore('matches'),q=s.get(r.key),version=r.version??0;
      q.onsuccess=()=>{if((q.result?.version??0)!==version){tx.abort();return;}s.put({...r,version:version+1,updated:Date.now()});};
      tx.oncomplete=()=>{r.version=version+1;resolve();};tx.onabort=tx.onerror=()=>reject(Error('Salvataggio non riuscito o partita aperta in un’altra scheda. Riapri il tuo posto.'));
    }),
  };
}
export function setupOnline(game){
  const $=id=>document.getElementById(id);
  const panel=$('online-panel'),status=$('online-status'),bar=$('online-bar');
  const sessionKey='simulacra-active-online';
  let store,record,peer,connection,ready=false,busy=false,queue=Promise.resolve(),generation=0,heartbeat,lastSeen=0;
  let retryTimer,connectTimer,retries=0,everConnected=false,active=false;
  const session={get(){try{return sessionStorage.getItem(sessionKey);}catch{return null;}},set(key){try{sessionStorage.setItem(sessionKey,key);}catch{}},clear(){try{sessionStorage.removeItem(sessionKey);}catch{}}};
  const say=t=>{status.textContent=t;$('online-connection').textContent=t;};
  const guarded=fn=>(...args)=>Promise.resolve().then(()=>fn(...args)).catch(fail);
  function state(name,text){
    bar.dataset.state=name;
    const labels={connected:'Collegato',waiting:'In attesa',connecting:'Connessione…',reconnecting:'Riconnessione…',error:'Da verificare'};
    $('online-summary').textContent='Online · '+labels[name];
    say(text);$('online-notice').textContent=text;
    $('online-notice').hidden=name==='connected';
    $('reconnect-online').hidden=!['error','reconnecting'].includes(name);
  }
  function fail(e){
    ready=false;busy=false;clearTimeout(retryTimer);clearTimeout(connectTimer);game.lock();
    if(active){state('error',e?.message??String(e));bar.open=true;}
    else say(e?.message??String(e));
  }
  function disconnect(){
    generation++;ready=false;clearInterval(heartbeat);clearTimeout(retryTimer);clearTimeout(connectTimer);
    retryTimer=null;connectTimer=null;
    connection?.close();peer?.destroy();connection=peer=null;
  }
  function leave(){active=false;disconnect();session.clear();bar.hidden=true;bar.open=false;$('online-notice').hidden=true;$('online-side').hidden=true;}
  function connected(){
    const first=!everConnected;everConnected=true;ready=true;retries=0;
    clearTimeout(retryTimer);retryTimer=null;clearTimeout(connectTimer);
    state('connected','Collegato · sei '+(record.role==='host'?'Rosso':'Blu')+'.');
    if(first){
      const focusInside=bar.contains(document.activeElement);bar.open=false;
      if(focusInside)$('online-summary').focus();
    }
  }
  function recover(){
    if(!active||retryTimer)return;
    ready=false;game.lock();clearTimeout(connectTimer);
    state('reconnecting','Collegamento interrotto. La partita è salvata; riconnessione automatica in corso…');
    const gen=generation,delay=Math.min(1000*2**retries++,8000);
    retryTimer=setTimeout(()=>{retryTimer=null;if(active&&gen===generation)guarded(restart)();},delay);
  }
  async function restart(){await queue;if(!active)return;await connect();}
  function send(data){if(connection?.open)connection.send({protocol:ONLINE_VERSION,...data});}
  function enqueue(fn){const gen=generation;queue=queue.then(()=>{if(gen===generation)return fn();}).catch(fail);}
  function displayGuest(view){game.guest(view);if(ready&&!busy)game.unlock();else game.lock();}
  function views(){const guest=game.view(1);game.view(0);$('reset').hidden=true;return guest;}
  function restore(){game.start(record.seed);for(const c of record.commands)game.apply(c.side,c.index);views();}
  async function snapshot(ack){const view=views();send({type:'view',view,revision:record.commands.length,ack});}
  async function apply(c,revision){
    const previous=record.commands.find(v=>v.id===c.id);
    if(previous){if(previous.side!==c.side||previous.index!==c.index)throw Error('Identificativo di comando incoerente.');await snapshot(c.id);return;}
    if(revision!==record.commands.length){await snapshot(c.id);return;}
    if(![0,1].includes(c.side)||!Number.isInteger(c.index)||record.commands.length>=20000)throw Error('Comando online non valido.');
    game.lock();game.apply(c.side,c.index);record.commands.push(c);
    try{await store.save(record);}catch(e){record.commands.pop();restore();throw e;}
    await snapshot(c.id);if(ready)game.unlock();
  }
  async function loadPeer(){
    if(globalThis.Peer)return;
    await new Promise((resolve,reject)=>{const s=document.createElement('script');s.src='./vendor/peerjs.min.js';s.onload=resolve;s.onerror=()=>reject(Error('Impossibile caricare PeerJS.'));document.head.append(s);});
  }
  function bind(c,gen){
    lastSeen=Date.now();
    c.on('close',()=>{if(gen===generation&&connection===c)recover();});
    c.on('error',()=>{if(gen===generation&&connection===c)recover();});
    c.on('data',m=>{
      if(gen!==generation||connection!==c||!m||m.protocol!==ONLINE_VERSION)return;
      lastSeen=Date.now();
      if(m.type==='ping'){send({type:'pong'});return;}
      if(m.type==='pong')return;
      enqueue(async()=>{
        if(record.role==='host'){
          if(m.type==='hello'){
            if(m.room!==record.room||m.invite!==record.invite||!/^[a-f0-9]{32}$/.test(m.token)||record.guest&&record.guest!==m.token){send({type:'rejected'});c.close();return;}
            record.guest=m.token;await store.save(record);connected();await snapshot();game.unlock();
          }else if(m.type==='command'&&ready&&m.token===record.guest&&typeof m.id==='string'&&m.id.length<=100){
            await apply({id:m.id,side:1,index:m.index},m.revision);
          }
        }else if(m.type==='rejected'){disconnect();fail(Error('Questo invito è già occupato o non è valido.'));}
        else if(m.type==='view'&&Number.isInteger(m.revision)&&m.revision>=0&&m.view?.side===1&&typeof m.view.html==='string'){
          if(record.revision!==undefined&&m.revision<record.revision)throw Error('La cronologia dell’ospitante è precedente a quella salvata. Recupera il backup più recente.');
          record.revision=m.revision;
          if(record.pending&&m.ack===record.pending.id)record.pending=null;
          record.view=m.view;
          await store.save(record);connected();busy=!!record.pending;displayGuest(m.view);
          if(record.pending)send({type:'command',...record.pending,token:record.token});
        }
      });
    });
  }
  async function connect(){
    disconnect();const gen=generation;busy=false;bar.hidden=false;game.lock();
    state(everConnected||retries?'reconnecting':'connecting',everConnected||retries?'Ripresa del collegamento in corso. La partita è salvata.':'Connessione in corso…');
    await loadPeer();if(gen!==generation)return;
    const options={debug:0,config:{iceServers:[{urls:'stun:stun.l.google.com:19302'}]}};
    peer=record.role==='host'?new Peer('simulacra-v1-'+record.room,options):new Peer(options);
    heartbeat=setInterval(()=>{
      if(gen!==generation||!ready)return;
      if(Date.now()-lastSeen>30000){recover();return;}
      send({type:'ping'});
    },10000);
    peer.on('error',()=>{if(gen===generation)recover();});
    peer.on('disconnected',()=>{if(gen===generation&&!connection?.open)recover();});
    peer.on('connection',c=>{
      if(gen!==generation||record.role!=='host'||connection?.open){c.on('open',()=>c.close());return;}
      connection=c;ready=false;bind(c,gen);
    });
    peer.on('open',()=>{
      if(gen!==generation)return;
      if(record.role==='host'){
        if(!record.guest){clearTimeout(connectTimer);state('waiting','Copia il link e invialo all’altro giocatore.');}
        return;
      }
      connection=peer.connect('simulacra-v1-'+record.room,{reliable:true,serialization:'binary'});bind(connection,gen);
      connection.on('open',()=>send({type:'hello',room:record.room,invite:record.invite,token:record.token}));
    });
    connectTimer=setTimeout(()=>{if(gen===generation&&!ready)recover();},15000);
  }
  function invitation(){const u=new URL(location.href);u.search='';u.hash='online='+record.room+'.'+record.invite;return u.href;}
  async function enter(r){
    await queue;
    record=validateRecord(r);active=true;session.set(record.key);everConnected=!!record.guest||record.revision!==undefined;
    const side=$('online-side');
    side.textContent=record.role==='host'?'Tu: Rosso':'Tu: Blu';
    side.dataset.side=record.role==='host'?'red':'blue';side.hidden=false;
    panel.hidden=true;$('computer-setup').hidden=true;
    if(record.role==='host'){restore();$('online-link').value=invitation();}
    else{$('online-link').value='';if(record.view)displayGuest(record.view);else game.waiting();}
    $('online-invite').hidden=record.role!=='host';bar.open=record.role==='host'&&!record.guest;await connect();
  }
  async function list(){
    $('online-saves').replaceChildren();
    const records=(await store.all()).sort((a,b)=>b.updated-a.updated);
    $('online-saved-section').hidden=!records.length;
    for(const r of records){
      const b=document.createElement('button');b.type='button';b.textContent='Riprendi '+(r.role==='host'?'Rosso':'Blu')+' · '+new Date(r.updated).toLocaleString('it-IT');b.onclick=guarded(()=>enter(r));$('online-saves').append(b);
    }
  }
  function showPanel(){
    panel.hidden=false;$('computer-setup').hidden=true;document.querySelector('.title-menu').hidden=true;
    $('online-title').focus();
  }
  $('start-online').onclick=guarded(async()=>{showPanel();if(!store)store=await openStore();await list();});
  $('close-online').onclick=()=>{panel.hidden=true;document.querySelector('.title-menu').hidden=false;$('start-online').focus();};
  $('leave-online').onclick=()=>{leave();location.href=location.pathname;};
  $('create-online').onclick=guarded(async()=>{
    if(!store)store=await openStore();const room=randomId();const r={protocol:ONLINE_VERSION,key:'host:'+room,role:'host',room,invite:randomId(),seed:crypto.getRandomValues(new Uint32Array(1))[0],commands:[]};await store.save(r);await enter(r);
  });
  $('join-online-form').onsubmit=event=>{event.preventDefault();join();};
  const join=guarded(async()=>{
    const input=$('join-link').value.trim();let hash;
    try{hash=new URL(input,location.href).hash;}catch{throw Error('Incolla un link d’invito valido.');}
    const m=/^#online=([a-f0-9]{32})\.([a-f0-9]{32})$/.exec(hash);if(!m)throw Error('Link d’invito non valido.');
    if(!store)store=await openStore();let r=(await store.all()).find(r=>r.key==='guest:'+m[1]);
    if(!r){r={protocol:ONLINE_VERSION,key:'guest:'+m[1],role:'guest',room:m[1],invite:m[2],token:randomId()};await store.save(r);}await enter(r);
  });
  $('copy-invite').onclick=guarded(async()=>{try{await navigator.clipboard.writeText($('online-link').value);say('Invito copiato.');}catch{$('online-link').select();say('Seleziona e copia il link d’invito.');}});
  $('reconnect-online').onclick=guarded(restart);
  document.addEventListener('keydown',event=>{if(event.key==='Escape'&&bar.open){bar.open=false;$('online-summary').focus();}});
  document.addEventListener('click',event=>{if(bar.open&&!bar.contains(event.target))bar.open=false;});
  window.addEventListener('online',()=>{if(active&&!ready)guarded(restart)();});
  $('export-online').onclick=guarded(async()=>{
    await queue;
    if(!record)return;const blob=new Blob([JSON.stringify(record)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='simulacra-'+record.role+'-'+record.room+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  });
  $('import-online').onchange=guarded(async event=>{
    const file=event.target.files[0];if(!file)return;const r=validateRecord(JSON.parse(await file.text()));r.key=r.role+':'+r.room;
    if(!store)store=await openStore();const old=(await store.all()).find(v=>v.key===r.key);
    if(old){
      if(r.role==='host'&&(old.seed!==r.seed||old.invite!==r.invite||old.commands.some((c,i)=>JSON.stringify(c)!==JSON.stringify(r.commands[i]))))throw Error('Backup precedente o divergente: il salvataggio esistente è stato conservato.');
      if(r.role==='guest'&&(old.token!==r.token||(old.revision??0)>(r.revision??0)))throw Error('Backup precedente o credenziale diversa.');
    }
    if(r.role==='host'){game.start(r.seed);for(const c of r.commands)game.apply(c.side,c.index);game.lock();}
    r.version=old?.version??0;await store.save(r);await enter(r);
  });
  guarded(async()=>{
    const key=session.get(),invite=/^#online=([a-f0-9]{32})\./.exec(location.hash);
    if(key){
      if(!store)store=await openStore();
      const saved=(await store.all()).find(r=>r.key===key);
      if(saved&&(!invite||saved.room===invite[1])){await enter(saved);return;}
      session.clear();
    }
    if(!invite)return;
    $('join-link').value=location.href;showPanel();$('join-online').focus();
    if(!store)store=await openStore();
    const saved=(await store.all()).find(r=>r.key==='guest:'+invite[1]);
    if(saved&&saved.invite===location.hash.split('.')[1]){await enter(saved);return;}
    await list();
  })();
  return {leave,act(index){
    if(!ready||busy)return;busy=true;game.lock();
    enqueue(async()=>{
      try{
        if(record.role==='host')await apply({side:0,index,id:randomId()},record.commands.length);
        else{record.pending={id:randomId(),index,revision:record.revision};await store.save(record);send({type:'command',...record.pending,token:record.token});return;}
      }finally{if(record.role==='host'){busy=false;if(ready)game.unlock();}}
    });
  }};
}
