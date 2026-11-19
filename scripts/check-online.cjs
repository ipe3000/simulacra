const {chromium}=require(process.env.PLAYWRIGHT_PATH||'playwright');
const http=require('node:http'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
const server=http.createServer((req,res)=>{
  const p=path.resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname));
  if(!p.startsWith(root+path.sep)&&p!==root){res.writeHead(403).end();return;}
  const file=p===root||p.endsWith(path.sep)?path.join(p,'index.html'):p;
  fs.readFile(file,(err,data)=>{if(err){res.writeHead(404).end();return;}res.setHeader('Content-Type',({'.mjs':'text/javascript','.js':'text/javascript','.json':'application/json','.css':'text/css','.html':'text/html','.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp'})[path.extname(file)]||'text/plain');res.end(data);});
});
(async()=>{
  await new Promise(r=>server.listen(8873,'127.0.0.1',r));
  const browser=await chromium.launch({channel:'chrome',headless:true});
  const errors=[];const hostContext=await browser.newContext(),guestContext=await browser.newContext();
  const host=await hostContext.newPage(),guest=await guestContext.newPage();
  for(const p of [host,guest])p.on('pageerror',e=>errors.push(e.message));
  const base=process.env.SIMULACRA_URL||'http://127.0.0.1:8873/';
  const records=p=>p.evaluate(async()=>{const {openStore}=await import('./online.mjs?v=1');return(await openStore()).all();});
  const revision=async()=>((await records(host)).find(r=>r.role==='host')?.commands.length??0);
  const waitRevision=async n=>{
    const deadline=Date.now()+20000;
    while(Date.now()<deadline){
      const h=await revision(),g=(await records(guest)).find(r=>r.role==='guest')?.revision??0;
      if(h>n&&g>n)return;
      await new Promise(r=>setTimeout(r,75));
    }
    throw Error('Conferma non ricevuta dopo la revisione '+n);
  };
  try{
    await host.goto(base);await host.locator('#start-online').click();await host.locator('#create-online').click();await host.locator('#online-link').waitFor();
    const invite=await host.locator('#online-link').inputValue();assert(invite.includes('#online='));
    await guest.goto(invite);await guest.locator('#join-online').click();
    await host.waitForFunction(()=>document.querySelector('#online-connection').textContent.includes('Collegato'),{},{timeout:55000});
    await guest.waitForFunction(()=>document.querySelector('#online-connection').textContent.includes('Collegato'),{},{timeout:55000});
    console.log('PASS public PeerJS: invitation and two isolated browsers connected');
    for(let i=0;i<45;i++){
      const turn=await host.locator('#turn').textContent();const actor=turn.includes('Decide: Blu')?guest:host;
      await actor.waitForFunction(()=>!document.querySelector('#game').inert);
      let button=actor.locator('.actions button').filter({hasText:/^(Passa|Mantieni gli Attacchi|Caricamento|Ricarica senza scartare|Continua)$/}).first();
      if(i%3===0&&await actor.locator('.cell.legal').count())button=actor.locator('.cell.legal').first();
      if(i%4===0&&await actor.locator('.cards > .card:not([aria-disabled="true"])').count())button=actor.locator('.cards > .card:not([aria-disabled="true"])').first();
      if(!await button.count())button=actor.locator('.cell.legal').first();
      if(!await button.count())button=actor.locator('.actions button:not([disabled])').first();
      if(!await button.count())button=actor.locator('#game button[data-action]:not([disabled]):not([aria-disabled="true"]):not(.discard-card .card)').first();
      assert(await button.count(),'a legal decision must be present');const n=await revision();assert.equal(n,i,'revision before decision '+i);const label=await button.textContent();await button.click();await waitRevision(n);
      assert.equal(await revision(),i+1,'saved decision '+i+' · '+label.slice(0,45));
      await guest.waitForFunction(()=>!document.querySelector('#game').inert);
      const expected=await host.locator('#turn').textContent();await guest.waitForFunction(t=>document.querySelector('#turn').textContent===t,expected);
    }
    const hr=(await records(host))[0],gr=(await records(guest))[0];assert.equal(hr.commands.length,45);assert.equal(hr.guest,gr.token);assert(!('seed'in gr));assert(!('commands'in gr));
    console.log('PASS 45 confirmed decisions including moves/spells and filtered guest storage');
    const turn=await host.locator('#turn').textContent();
    await guest.reload();await guest.locator('#start-online').click();await guest.locator('#online-saves button').first().click();
    await guest.waitForFunction(()=>document.querySelector('#online-connection').textContent.includes('Collegato'),{},{timeout:45000});
    assert.equal(await guest.locator('#turn').textContent(),turn);console.log('PASS guest reload and reserved seat recovery');
    await host.reload();await host.locator('#start-online').click();await host.locator('#online-saves button').first().click();
    await guest.locator('#reconnect-online').click();
    await guest.waitForFunction(()=>document.querySelector('#online-connection').textContent.includes('Collegato'),{},{timeout:45000});
    assert.equal(await guest.locator('#turn').textContent(),turn);assert.equal(await host.locator('#turn').textContent(),turn);
    console.log('PASS host journal replay and reconnection');
    assert.deepEqual(errors,[]);const temp=require('node:os').tmpdir();await host.screenshot({path:path.join(temp,'simulacra-online-host-check.png'),fullPage:true});await guest.screenshot({path:path.join(temp,'simulacra-online-guest-check.png'),fullPage:true});
    console.log('PASS no browser errors');
  }catch(e){console.error('HOST:',await host.locator('#online-connection').textContent().catch(()=>''));console.error('GUEST:',await guest.locator('#online-connection').textContent().catch(()=>''));console.error('ERRORS',errors);throw e;}
  finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;server.close();});
