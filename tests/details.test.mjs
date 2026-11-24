import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

function harness(){
  const listeners={},timers=new Map();let timerId=0;
  const popup={hidden:true,offsetWidth:320,offsetHeight:200,style:{},classList:{toggle(){}},
    setAttribute(){},contains:()=>false,addEventListener(name,fn){listeners['popup:'+name]=fn;}};
  const content={},close={};
  const doc={querySelector(selector){return ({'#context-detail':popup,'#detail-content':content,'#close-detail':close})[selector];},
    addEventListener(name,fn){listeners[name]=fn;}};
  const source={dataset:{detail:'Folgore Abbagliante\n2 danni e Accecato.'},isConnected:true,
    getBoundingClientRect:()=>({left:340,top:200,bottom:250}),
    closest:()=>source,contains:()=>false,focus(){listeners.focusin({target:source});}};
  const context=vm.createContext({document:doc,innerWidth:1366,innerHeight:768,
    setTimeout(fn){const id=++timerId;timers.set(id,fn);return id;},clearTimeout(id){timers.delete(id);}});
  vm.runInContext(readFileSync(new URL('../details.mjs',import.meta.url),'utf8').replace('export function','function'),context);
  vm.runInContext('setupDetails()',context);
  return {listeners,popup,content,close,source,flush(){for(const [id,fn] of timers){timers.delete(id);fn();}}};
}

test('hover waits before opening details beside the card and stays open over the popup',()=>{
  const h=harness();h.listeners.pointerover({target:h.source});
  assert.equal(h.popup.hidden,true);h.flush();
  assert.equal(h.popup.hidden,false);
  assert.equal(h.popup.style.left,'340px');
  assert.equal(h.popup.style.top,'258px');
  assert.match(h.content.textContent,/2 danni/);
  h.listeners.pointerout({target:h.source,relatedTarget:h.popup});
  h.listeners['popup:pointerenter']();h.flush();
  assert.equal(h.popup.hidden,false);
  h.listeners['popup:pointerleave']();h.flush();
  assert.equal(h.popup.hidden,true);
});

test('click pins a detail while the pointer leaves; Escape closes it without reopening on focus',()=>{
  const h=harness();h.listeners.click({target:h.source});
  h.listeners.pointerout({target:h.source,relatedTarget:null});h.flush();
  assert.equal(h.popup.hidden,false);
  h.listeners.keydown({key:'Escape'});
  assert.equal(h.popup.hidden,true);
});

test('keyboard focus opens details and the close button returns focus without reopening',()=>{
  const h=harness();h.listeners.focusin({target:h.source});
  assert.equal(h.popup.hidden,false);h.close.onclick();
  assert.equal(h.popup.hidden,true);
});
