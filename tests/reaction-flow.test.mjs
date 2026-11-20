import test from 'node:test';
import assert from 'node:assert/strict';
import {gameHarness} from './helpers/game-harness.mjs';

const online=()=>{const g=gameHarness();g.run("matchMode='online';onlineSide=1;controllers=[null,null];begin();");return g;};

test('online starts an enemy turn without a mandatory Time Block pass, even when the card is held',()=>{
  const g=online();g.run("teams[1].hand=['timeBlock','stride'];begin();");
  assert.equal(g.run('phase'),'action');assert.equal(g.run('viewer'),0);
  assert(!g.run('root.innerHTML').includes('Non reagire'));
});

test('Veto opens only with the card and enough PE plus the remaining reserve allowance',()=>{
  for(const [pe,reserve,spent,opens] of [[0,4,0,false],[1,2,0,true],[1,2,1,false],[3,0,2,true]]){
    const g=online();
    g.run(`teams[1].hand=['veto'];units[1].pe=${pe};teams[1].reserve=${reserve};teams[1].spent=${spent};pending={id:'flash',defender:units[1]};offerVeto();`);
    assert.equal(g.run("phase==='reaction'"),opens,`${pe} PE, ${reserve} reserve, ${spent} already spent`);
    if(opens)assert.match(g.run("document.querySelector('#action-caption').innerHTML"),/Puoi reagire/);
  }
});

test('movement without a valid reaction does not require passing',()=>{
  const g=online();
  g.run("units[0].cell=27;units[1].cell=29;let completed=false;movementReactions(units[0],26,28,()=>{completed=true;});");
  assert(g.run('completed'));assert.equal(g.run('phase'),'action');
});

test('Time Block requires payment for itself and an actually playable Utility',()=>{
  const g=online();
  g.run("teams[1].hand=['timeBlock','veil'];units.filter(v=>v.side===1).forEach(v=>v.pe=0);teams[1].reserve=4;");
  assert.equal(g.run('timeCandidates(1).length'),0,'reserve can only cover 2 PE per turn');
  g.run('units[1].pe=1');assert(g.run('timeCandidates(1).length')>0);
  g.run('teams[1].spent=1');assert.equal(g.run('timeCandidates(1).length'),0);
  g.run("teams[1].spent=0;units[1].pe=4;teams[1].hand=['timeBlock','dissolve'];");
  assert.equal(g.run('timeCandidates(1).length'),0,'no creation is a valid target');
});

test('one-shot stop pauses before an action, disarms, and resumes without a repeated pause',()=>{
  const g=online();g.run("teams[1].hand=['timeBlock','stride'];mode='flash';timeStopSetting(1,'once');");
  assert.equal(g.run('phase'),'selection');assert.equal(g.run('viewer'),1);
  assert.equal(g.run('timeStops[1].mode'),'off');
  assert.match(g.run('choice.text'),/prima della prossima azione/);
  g.run('choice.options.at(-1)[1]();render();');
  assert.equal(g.run('phase'),'action');assert.equal(g.run('viewer'),0);assert.equal(g.run('mode'),'move');
});

test('full control pauses again at the next completed action and expires after that enemy turn',()=>{
  const g=online();g.run("teams[1].hand=['timeBlock','stride'];teams[0].hand=['stride'];timeStopSetting(1,'turn');choice.options.at(-1)[1]();pick('stride');");
  assert.equal(g.run('phase'),'selection');
  g.run('choice.options.at(-1)[1]();charge();advance();');
  assert.equal(g.run('timeStops[1].mode'),'off');assert.equal(g.run('active().side'),1);
});

test('a stop can be prepared during own turn for the beginning of the next enemy turn',()=>{
  const g=online();g.run("teams[0].hand=['timeBlock','stride'];timeStopSetting(0,'once');charge();advance();");
  assert.equal(g.run('phase'),'selection');assert.equal(g.run('viewer'),0);
  assert.match(g.run("document.querySelector('#turn').textContent"),/Turno: Blu · Terra · Reazione: Rosso/);
});

test('using Time Block spends the shared reaction, launches one Utility and resumes the original turn',()=>{
  const g=online();g.run("teams[1].hand=['timeBlock','stride'];timeStopSetting(1,'once');choice.options[0][1]();pick('stride');");
  assert.equal(g.run('teams[1].reaction'),true);assert.equal(g.run('units[1].pe'),3);
  assert(g.run("has(units[1],'Rallentato')"));assert.equal(g.run('active().side'),0);
  assert.equal(g.run('utilityReaction'),null);assert.equal(g.run('viewer'),0);
});

test('legacy empty windows can be reconstructed and then removed at the migration boundary',()=>{
  const g=online();g.run("legacyReactions=true;teams[1].hand=[];begin();");
  assert.equal(g.run('phase'),'selection');
  g.run('modernizeReactions();');assert.equal(g.run('phase'),'action');assert.equal(g.run('viewer'),0);
});

test('waiting player sees the event without a list of unplayed reaction cards',()=>{
  const g=online();g.run("units[0].cell=28;units[1].cell=29;teams[1].hand=['shield'];onlineSide=0;movementReactions(units[0],27,28,()=>{});");
  assert.equal(g.run('phase'),'selection');
  const announcement=g.run("document.querySelector('#action-caption').innerHTML");
  assert.match(announcement,/In attesa di Blu/);assert(!announcement.includes('Schermo Cinetico'));
  g.run('onlineSide=1;render();');
  assert.match(g.run("document.querySelector('#action-caption').innerHTML"),/Schermo Cinetico/);
});

test('confirmed legacy action indices reconstruct the same state before switching to the new reaction rules',()=>{
  const a=gameHarness(),b=gameHarness();
  for(const g of [a,b])g.run("matchMode='online';legacyReactions=true;seedOnline(40);start();");
  const state=g=>g.snapshot('({units,teams,order,index,serial,round,phase,mode,viewer})');
  for(let i=0;i<30;i++){
    a.run('onlineSide=viewer;render();');
    const buttons=[...a.run('root.innerHTML').matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/g)]
      .filter(m=>/data-action="\d+"/.test(m[1])&&!/aria-disabled="true"|\bdisabled/.test(m[1]));
    const button=buttons.find(m=>/Passa|Ricarica senza|Caricamento/.test(m[2]))??buttons.find(m=>/cell .*legal/.test(m[1]))??buttons[0];
    assert(button);const id=Number(/data-action="(\d+)"/.exec(button[1])[1]);
    for(const g of [a,b])g.run(`onlineSide=viewer;render();actions[${id}]();`);
    assert.deepEqual(state(a),state(b));
  }
  for(const g of [a,b])g.run('modernizeReactions();');
  assert.deepEqual(state(a),state(b));assert.equal(b.run('legacyReactions'),false);
});
