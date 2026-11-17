import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import * as engine from '../../engine.mjs';
import {chooseComputerAction} from '../../computer.mjs';
import {createFeedback} from '../../feedback.mjs';
import {createChronicle} from '../../chronicle.mjs';

const source=readFileSync(new URL('../../game.mjs',import.meta.url),'utf8')
  .replace(/^import .*;\r?\n/gm,'');
const catalog=JSON.parse(readFileSync(new URL('../../catalogo-carte.json',import.meta.url),'utf8'));

// Execute the actual browser module with a minimal DOM and controllable timers.
export function gameHarness(seed=1){
  const elements=new Map();
  const timers=new Map();
  let timerId=0;
  function element(selector){
    if(!elements.has(selector))elements.set(selector,{
      hidden:false,value:'550',textContent:'',innerHTML:'',
      parentElement:{hidden:false},addEventListener(){},focus(){},
      querySelector(){return null;},querySelectorAll(){return [];},replaceChildren(){this.innerHTML='';},
    });
    return elements.get(selector);
  }
  const math=Object.create(Math);
  math.random=()=>((seed=Math.imul(seed,1664525)+1013904223>>>0)/2**32);
  const context=vm.createContext({
    ...engine,catalog,chooseComputerAction,createFeedback,createChronicle,Math:math,
    document:{querySelector:element},window:{confirm:()=>true},confirm:()=>true,
    setTimeout(fn){const id=++timerId;timers.set(id,fn);return id;},
    clearTimeout(id){timers.delete(id);},
  });
  vm.runInContext(source,context);
  const run=code=>vm.runInContext(code,context,{timeout:10000});
  run(`start();
    order=[0,1,2,3];index=0;serial=4;round=2;setup=[];
    units.forEach((u,i)=>{u.cell=[14,16,66,68][i];});
    teams.forEach(t=>{t.hand=[];t.deck=[];t.discard=[];});
    begin();`);
  return {
    run,
    snapshot:code=>JSON.parse(JSON.stringify(run(code))),
    flushTimers(){
      let count=0;
      while(timers.size){
        if(++count>1000)throw new Error('Timer loop did not settle');
        const [id,fn]=timers.entries().next().value;
        timers.delete(id);fn();
      }
    },
  };
}
