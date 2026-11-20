import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
import {webcrypto} from 'node:crypto';

const source=fs.readFileSync(new URL('../online.mjs',import.meta.url),'utf8').replaceAll('export ','');
const flush=async()=>{for(let i=0;i<30;i++)await Promise.resolve();};
const room='a'.repeat(32),invite='b'.repeat(32),token='c'.repeat(32);
const hostRecord=()=>({key:'host:'+room,protocol:1,role:'host',room,invite,seed:42,guest:token,commands:[{id:'one',side:0,index:3}]});
function harness(record,{hash='',session=record?.key}={}){
  const elements=new Map(),timers=new Map(),peers=[],sessions=new Map(session?[['simulacra-active-online',session]]:[]);
  let timerId=0,locked=true;const applied=[],rendered=[];
  const element=id=>{if(!elements.has(id))elements.set(id,{hidden:false,open:false,value:'',textContent:'',dataset:{},focus(){},contains(){return false;},replaceChildren(){},append(){}});return elements.get(id);};
  class Emitter{handlers={};on(name,fn){(this.handlers[name]??=[]).push(fn);}emit(name,arg){for(const fn of this.handlers[name]??[])fn(arg);}}
  class Connection extends Emitter{open=true;sent=[];send(m){this.sent.push(m);}close(){this.open=false;this.emit('close');}}
  class Peer extends Emitter{
    constructor(){super();peers.push(this);}
    destroy(){this.destroyed=true;}
    connect(){this.connection=new Connection();return this.connection;}
  }
  let saved=record?structuredClone(record):null;
  const store={all:async()=>saved?[structuredClone(saved)]:[],save:async r=>{saved=structuredClone(r);}};
  const game={start(){applied.length=0;},apply(side,index){applied.push([side,index]);},view:side=>({side,html:'board',turn:'Turno Blu'}),
    guest:v=>rendered.push(v),waiting(){rendered.push('waiting');},lock(){locked=true;},unlock(){locked=false;}};
  const context=vm.createContext({URL,crypto:webcrypto,console,store,game,Peer,
    location:{hash,href:'https://example.test/'+hash,pathname:'/'},
    sessionStorage:{getItem:k=>sessions.get(k),setItem:(k,v)=>sessions.set(k,v),removeItem:k=>sessions.delete(k)},
    document:{getElementById:element,querySelector:element,addEventListener(){},createElement:()=>element('created')},window:{addEventListener(){}},
    setTimeout:(fn,ms)=>{const id=++timerId;timers.set(id,{fn,ms});return id;},clearTimeout:id=>timers.delete(id),
    setInterval:()=>++timerId,clearInterval(){},
  });
  vm.runInContext(source+'\nopenStore=async()=>store;globalThis.driver=setupOnline(game);',context);
  return {element,peers,applied,rendered,sessions,get saved(){return saved;},get locked(){return locked;},driver:context.driver,
    async hello(){const c=new Connection();peers.at(-1).emit('connection',c);c.emit('data',{protocol:1,type:'hello',room,invite,token});await flush();return c;},
    async retry(){const entry=[...timers].find(([,v])=>v.ms<15000);assert(entry,'automatic reconnect scheduled');timers.delete(entry[0]);entry[1].fn();await flush();},
  };
}

test('host refresh restores the active seat and confirmed decisions without menu interaction',async()=>{
  const h=harness(hostRecord());await flush();
  assert.equal(h.peers.length,1);assert.deepEqual(h.applied,[[0,3]]);assert(h.locked);
  await h.hello();assert(!h.locked);assert.equal(h.element('online-bar').dataset.state,'connected');
  assert.equal(h.element('online-notice').hidden,true);assert.equal(h.element('online-bar').open,false);
});

test('a broken connection retries automatically and an acknowledged move is not applied twice',async()=>{
  const record=hostRecord();record.commands[0].side=1;
  const h=harness(record);await flush();const c=await h.hello();
  c.close();assert(h.locked);assert.equal(h.element('online-notice').hidden,false);
  await h.retry();assert.equal(h.peers.length,2);const next=await h.hello();
  next.emit('data',{protocol:1,type:'command',id:'one',index:3,revision:0,token});await flush();
  assert.deepEqual(h.applied,[[1,3]]);assert.equal(next.sent.at(-1).ack,'one');assert(!h.locked);
});

test('guest refresh shows the cached board, resends an outstanding move, and waits for its acknowledgement',async()=>{
  const view={side:1,html:'saved board',turn:'Turno Blu'};
  const pending={id:'pending',index:2,revision:1};
  const h=harness({key:'guest:'+room,protocol:1,role:'guest',room,invite,token,revision:1,view,pending});await flush();
  assert.equal(h.rendered[0].html,'saved board');assert(h.locked);
  h.peers[0].emit('open');const c=h.peers[0].connection;c.emit('open');
  c.emit('data',{protocol:1,type:'view',revision:1,view});await flush();
  assert(h.locked);assert.equal(c.sent.at(-1).id,'pending');
  c.emit('data',{protocol:1,type:'view',revision:2,view,ack:'pending'});await flush();
  assert(!h.locked);assert.equal(h.saved.pending,null);assert.equal(h.saved.revision,2);
  assert(!('seed'in h.saved));assert(!('commands'in h.saved));
});

test('explicit exit clears automatic resume and a different invitation takes precedence',async()=>{
  const h=harness(hostRecord());await flush();h.driver.leave();assert.equal(h.sessions.size,0);
  const other=harness(hostRecord(),{hash:'#online='+'d'.repeat(32)+'.'+invite});await flush();
  assert.equal(other.peers.length,0);assert.equal(other.sessions.size,0);assert.equal(other.element('online-panel').hidden,false);
});
