import test from 'node:test';
import assert from 'node:assert/strict';
import {gameHarness} from './helpers/game-harness.mjs';

test('animated casting waits before damage and before offering Veto',()=>{
  const game=gameHarness();
  game.run(`feedback.enabled=()=>true;feedback.reduced=()=>false;feedback.speed=()=>1;
    units[0].cell=27;units[1].cell=28;teams[1].hand=['veto'];
    mode='arc';targetUnit(28);`);
  assert.equal(game.run('presenting'),true);
  assert.equal(game.run('units[1].hp'),8);
  game.flushTimers();
  assert.equal(game.run('phase'),'reaction');
  assert.equal(game.run('units[1].hp'),8);
  game.run('resolve(false)');
  assert.equal(game.run('units[1].hp'),7);
});

test('starting a new match cancels a pending animated spell',()=>{
  const game=gameHarness();
  game.run(`feedback.enabled=()=>true;feedback.reduced=()=>false;feedback.speed=()=>1;
    units[0].cell=27;units[1].cell=28;mode='arc';targetUnit(28);start();`);
  game.flushTimers();
  assert.equal(game.run('phase'),'setup');
  assert.equal(game.run('presenting'),false);
  assert.equal(game.run('units[1].hp'),8);
});

test('Ribaltamento Karmico ends the action phase when its caster dies',()=>{
  const game=gameHarness();
  game.run(`order=[1,0,3,2];index=1;begin();
    active().hp=1;teams[0].hand=['karmic'];pick('karmic');`);
  assert.equal(game.run('active().cell'),null);
  assert.equal(game.run('phase'),'charge');
  assert.equal(game.run('teams[1].kills'),1);
  game.run('advance();advance();advance();');
  assert.equal(game.run('active().id'),0);
  assert.equal(game.run('phase'),'spawn');
  game.run('selectCell(legalCells()[0])');
  assert.equal(game.run('active().hp'),8);
  assert.equal(game.run('phase'),'action');
});

test('removing Maledetto at one PF ends the dead caster’s action phase',()=>{
  const game=gameHarness();
  game.run(`active().hp=1;active().conditions.Maledetto=serial;
    teams[0].hand=['cleanse'];pick('cleanse');cardChoice('Maledetto');`);
  assert.equal(game.run('active().cell'),null);
  assert.equal(game.run('phase'),'charge');
});

test('Palla di Fuoco still offers its secondary target after a lethal hit',()=>{
  const game=gameHarness();
  game.run(`units[0].cell=27;units[1].cell=28;units[3].cell=29;units[1].hp=2;
    teams[0].hand=['fireball'];mode='fireball';targetUnit(28);`);
  assert.equal(game.run('units[1].cell'),null);
  assert.equal(game.run('phase'),'selection');
  assert.equal(game.run('choice.options.length'),2);
  game.run('choice.options[0][1]()');
  assert.equal(game.run('units[3].hp'),5);
});

test('Blocco Temporale keeps the round order when evaluating Ribaltamento Karmico',()=>{
  const game=gameHarness();
  game.run(`serial=0;round=1;order=[0,1,2,3];index=0;
    teams[1].hand=['timeBlock','karmic'];begin();
    choice.options[0][1]();pick('karmic');`);
  assert.equal(game.run('units[1].hp'),7);
  assert.equal(game.run('nextFirst'),1);
  assert.deepEqual(game.snapshot('order'),[0,1,2,3]);
  assert.equal(game.run('active().id'),0);
});

test('a lethal secondary hit preserves the victory state',()=>{
  const game=gameHarness();
  game.run(`units[0].cell=27;units[1].cell=28;units[3].cell=29;units[1].hp=3;units[3].hp=1;
    teams[0].kills=1;teams[0].ritual=1;
    teams[0].hand=['fireball'];mode='fireball';targetUnit(28);
    choice.options[0][1]();`);
  assert.equal(game.run('phase'),'end');
  assert.equal(game.run('winner'),0);
});

test('self-inflicted lethal damage preserves an opponent’s victory',()=>{
  const game=gameHarness();
  game.run(`teams[1].kills=1;teams[1].ritual=1;
    active().hp=1;active().conditions.Maledetto=serial;
    teams[0].hand=['cleanse'];pick('cleanse');cardChoice('Maledetto');`);
  assert.equal(game.run('phase'),'end');
  assert.equal(game.run('winner'),1);
});

test('a caster dying during Blocco Temporale returns control to the interrupted turn',()=>{
  const game=gameHarness();
  game.run(`order=[0,1,2,3];index=0;units[1].hp=1;
    teams[1].hand=['timeBlock','karmic'];begin();
    choice.options[0][1]();pick('karmic');`);
  assert.equal(game.run('units[1].cell'),null);
  assert.equal(game.run('active().id'),0);
  assert.equal(game.run('viewer'),0);
  assert.equal(game.run('utilityReaction'),null);
  assert.equal(game.run('phase'),'action');
});

test('Ribaltamento Karmico still draws two cards for the first Arcimago',()=>{
  const game=gameHarness();
  game.run(`teams[0].hand=['karmic'];teams[0].deck=['stride','refill'];pick('karmic');`);
  assert.deepEqual(game.snapshot('teams[0].hand'),['stride','refill']);
  assert.equal(game.run('active().hp'),8);
  assert.equal(game.run('nextFirst'),null);
});
