import test from 'node:test';
import assert from 'node:assert/strict';
import {gameHarness} from './helpers/game-harness.mjs';

function reborn(id=0){
  const game=gameHarness();
  game.run(`index=${id};active().cell=null;begin();selectCell(legalCells()[0]);`);
  return game;
}

for(const [id,base] of [[0,4],[2,5]]){
  test(`rebirth offers ${base} extra PM before actions, once only`,()=>{
    const game=reborn(id);
    assert.equal(game.run('phase'),'selection');
    assert.equal(game.run('choice.intent'),'rebirth');
    assert.deepEqual(game.snapshot('legalCells()'),[]);
    assert.equal(game.run("unavailableReason(active(),'arc')"),'Attendi la tua Fase di Azione.');
    game.run('const acceptRebirth=choice.options[0][1];acceptRebirth();acceptRebirth();');
    assert.equal(game.run('active().pm'),base*2);
    assert.equal(game.run('phase'),'action');
    assert.equal(game.run('active().noAttack'),true);
    assert.equal(game.run("canPlay(active(),'arc')"),false);
    assert.equal(game.run("cast('arc')"),false);
    assert.deepEqual(game.snapshot("legalCells('arc')"),[]);
    assert.ok(game.run("legalCells('move').length")>0);
    game.run('advance();advance();advance();advance();');
    assert.equal(game.run('active().pm'),base);
    assert.equal(game.run('active().noAttack'),false);
    assert.equal(game.run('choice'),null);
  });

  test(`declining the rebirth bonus preserves attacks and ${base} PM`,()=>{
    const game=reborn(id);
    game.run('choice.options[1][1]()');
    assert.equal(game.run('active().pm'),base);
    assert.equal(game.run('canAttack(active())'),true);
    assert.equal(game.run('phase'),'action');
  });
}

test('rebirth movement adds to utility bonuses and Frenesia cannot unlock attacks',()=>{
  const game=reborn();
  game.run("choice.options[0][1]();teams[0].hand=['feral','frenzy'];pick('feral');");
  assert.equal(game.run('active().pm'),11);
  game.run("pick('frenzy')");
  assert.equal(game.run('active().attackLimit'),2);
  assert.equal(game.run("canPlay(active(),'arc')"),false);
});

test('initial summoning does not offer the rebirth bonus',()=>{
  const game=gameHarness();
  game.run('start();while(setup.length)selectCell(legalCells()[0]);');
  assert.equal(game.run('phase'),'action');
  assert.equal(game.run('choice'),null);
  assert.equal(game.run('active().pm'),4);
});

test('computer takes the rebirth bonus when it helps approach distant objectives',()=>{
  const game=reborn();
  game.run("controllers=['hard',null];computerTurn();");
  assert.equal(game.run('phase'),'action');
  assert.equal(game.run('active().pm'),8);
  assert.equal(game.run('active().noAttack'),true);
});

test('computer preserves a winning attack instead of taking the rebirth bonus',()=>{
  const game=reborn();
  game.run(`controllers=['hard',null];units[1].cell=13;units[1].hp=1;
    teams[0].kills=1;teams[0].ritual=1;computerTurn();`);
  assert.equal(game.run('phase'),'action');
  assert.equal(game.run('active().noAttack'),false);
  game.run('computerTurn()');
  assert.equal(game.run('winner'),0);
});
