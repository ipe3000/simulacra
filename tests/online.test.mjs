import test from 'node:test';
import assert from 'node:assert/strict';
import {gameHarness} from './helpers/game-harness.mjs';
import {validateRecord,seededRandom} from '../online.mjs';

test('online journal reconstructs private state and pending choices from seed and confirmed commands',()=>{
  const a=gameHarness(),b=gameHarness();
  const initialize=g=>g.run("matchMode='online';seedOnline(123456);controllers=[null,null];onlineSide=0;start();");
  initialize(a);initialize(b);
  const state=g=>g.snapshot('({units,teams,order,index,round,phase,viewer,mode,barriers,creations,serial,pending,options:choice?.options?.map(v=>v[0]),text:choice?.text})');
  for(let i=0;i<150;i++){
    a.run('onlineSide=viewer;render();');
    const html=a.run('root.innerHTML');
    const legal=[...html.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/g)].filter(m=>/data-action="\d+"/.test(m[1])&&!/aria-disabled="true"|\bdisabled/.test(m[1]));
    const selected=legal.find(m=>/Passa|Continua|Mantieni gli Attacchi|Ricarica senza|Caricamento/.test(m[2]))??legal.filter(m=>/cell .*legal/.test(m[1]))[i%Math.max(1,legal.filter(m=>/cell .*legal/.test(m[1])).length)]??legal[0];
    assert(selected,'must have a legal decision');
    const id=Number(/data-action="(\d+)"/.exec(selected[1])[1]);
    for(const g of [a,b])g.run(`onlineSide=viewer;render();actions[${id}]();`);
    assert.deepEqual(state(a),state(b));
  }
});

test('waiting recipient sees only own cards and no private selection text',()=>{
  const g=gameHarness();
  g.run("matchMode='online';onlineSide=1;teams[0].hand=['probe'];teams[1].hand=['stride'];choose('PRIVATE SECRET',[['Hidden card',()=>{}]],0);render();");
  const html=g.run('root.innerHTML');
  assert(!html.includes('PRIVATE SECRET'));assert(!html.includes('Hidden card'));assert(!html.includes('Sonda Telepatica'));
  assert(html.includes('Piede Svelto'));
});

test('online skips the Veto window without a payable Veto',()=>{
  const g=gameHarness();
  g.run("matchMode='online';onlineSide=1;teams[1].hand=[];pending={id:'flash',defender:units[1]};offerVeto();");
  assert.notEqual(g.run('phase'),'reaction');
  assert(!g.run('root.innerHTML').includes('Non reagire'));
});

test('backup validation rejects malformed journals and duplicate request IDs',()=>{
  const r={protocol:1,role:'host',room:'a'.repeat(32),invite:'b'.repeat(32),seed:1,commands:[]};
  assert.equal(validateRecord(r),r);
  assert.throws(()=>validateRecord({...r,commands:[{side:2,index:1,id:'x'}]}));
  assert.throws(()=>validateRecord({...r,commands:[{side:0,index:1,id:'x'},{side:1,index:1,id:'x'}]}));
  const a=seededRandom(42),b=seededRandom(42);assert.equal(a(),b());assert.equal(a(),b());
});
