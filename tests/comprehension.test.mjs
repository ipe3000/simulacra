import test from 'node:test';
import assert from 'node:assert/strict';
import {gameHarness} from './helpers/game-harness.mjs';

test('a spell and Veto remain one action with actual outcomes and both card texts',()=>{
  const g=gameHarness();
  g.run(`units[0].cell=27;units[1].cell=28;teams[0].hand=['flash'];teams[1].hand=['veto'];
    render();mode='flash';targetUnit(28);resolve(true);`);
  const action=g.snapshot('chronicle.current');
  assert.equal(action.status,'Annullata');
  assert.deepEqual(action.cards.map(c=>c.id),['flash','veto']);
  assert(action.changes.some(c=>c.includes('Blu · Terra : −1 PF')));
  assert(!action.changes.some(c=>c.includes('Accecato')));
  assert.equal(action.target,'Blu · Terra');
});

test('a turn transition preserves previous spells and reactions in history',()=>{
  const g=gameHarness();
  g.run(`teams[0].hand=['stride'];pick('stride');charge();advance();`);
  assert.equal(g.run('chronicle.turns.at(-2).complete'),true);
  assert.equal(g.run(`chronicle.turns.at(-2).entries.some(e=>e.cards.some(c=>c.id==='stride'))`),true);
  assert.equal(g.run('chronicle.turns.at(-1).side'),1);
});

test('history retains no unplayed card identities or deck order',()=>{
  const g=gameHarness();
  g.run(`teams[0].hand=['probe','vortex'];teams[0].deck=['arrow'];render();charge();advance();`);
  const history=g.run('JSON.stringify(chronicle.turns)');
  assert(!history.includes('vortex'));
  assert(!history.includes('arrow'));
  assert(!history.includes('probe'));
});

test('condition explanations distinguish applied movement penalties from future penalties',()=>{
  const g=gameHarness();
  g.run(`applyCondition(active(),'Rallentato');`);
  assert.match(g.run(`conditionInfo(active(),'Rallentato')`),/prossimo turno/);
  g.run('begin()');
  assert.match(g.run(`conditionInfo(active(),'Rallentato')`),/già applicata/);
});

test('unavailable cards explain the rule instead of consuming the selection',()=>{
  const g=gameHarness();
  g.run(`applyCondition(active(),'Accecato');`);
  assert.match(g.run(`unavailableReason(active(),'flash')`),/Accecato/);
  assert.match(g.run(`unavailableReason(active(),'dash')`),/finestra di Reazione/);
  g.run(`delete active().conditions.Accecato;active().moved=true;applyCondition(active(),'Confuso');`);
  assert.match(g.run(`unavailableReason(active(),'arc')`),/Confuso/);
});

test('Blocco Temporale identifies the interrupted turn and the deciding player separately',()=>{
  const g=gameHarness();
  g.run(`teams[1].hand=['timeBlock','stride'];begin();choice.options[0][1]();`);
  assert.match(g.run(`document.querySelector('#turn').textContent`),/Turno: Rosso · Terra · Reazione: Blu/);
});

test('new matches clear history',()=>{
  const g=gameHarness();
  g.run(`teams[0].hand=['stride'];pick('stride');start();`);
  assert.equal(g.run('chronicle.turns.length'),0);
});
