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
  const caption=g.run("document.querySelector('#action-caption').innerHTML");
  assert.match(caption,/Blu · Terra usa Veto Arcano/);
  assert.match(caption,/annullato.*perde 1 PF.*recupera 2 PE.*Rosso riprende/);
});

test('movement reactions identify the interruption, actual movement loss and resumption',()=>{
  const g=gameHarness();
  g.run(`matchMode='online';onlineSide=0;units[0].cell=30;units[1].cell=28;units[0].pm=1;
    teams[1].hand=['chains'];chronicle.begin({title:'Movimento',actor:name(active())});
    movementReactions(active(),29,30,()=>{choice=null;phase='action';show(0);});
    choice.options[0][1]();`);
  assert.match(g.run("document.querySelector('#action-caption').innerHTML"),/Catene Invisibili.*si interrompe.*perde 1 PM.*Rosso riprende/);
  assert.equal(g.run('units[0].cell'),29);
});

test('Scatto is named only after it is played and the opponent can see who is still choosing',()=>{
  const g=gameHarness();
  g.run(`matchMode='online';onlineSide=0;units[0].cell=27;units[3].cell=28;
    teams[0].hand=['flash'];teams[1].hand=['dash'];mode='flash';targetUnit(28);`);
  const caption=()=>g.run("document.querySelector('#action-caption').innerHTML");
  assert.match(caption(),/In attesa di Blu/);
  assert.doesNotMatch(caption(),/Scatto Fulmineo/);
  g.run('reactDash()');
  assert.match(caption(),/Blu · Fulmine usa Scatto Fulmineo.*Blu deve completare la scelta/);
  g.run('selectCell(legalCells()[0])');
  assert.match(caption(),/si sposta.*danno è già stato applicato.*Rosso riprende/);
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
  g.run("pick('stride')");
  assert.match(g.run("document.querySelector('#action-caption').innerHTML"),/usa Blocco Temporale.*Piede Svelto.*Rallentato.*Rosso riprende/);
});

test('new matches clear history',()=>{
  const g=gameHarness();
  g.run(`teams[0].hand=['stride'];pick('stride');start();`);
  assert.equal(g.run('chronicle.turns.length'),0);
});
