import test from 'node:test';
import assert from 'node:assert/strict';
import {gameHarness} from './helpers/game-harness.mjs';

for(const level of ['easy','normal','hard'])for(const seed of [1,17,42,91,2026]){
  test(`computer match preserves game invariants (${level}, seed ${seed})`,()=>{
    const game=gameHarness(seed);
    game.run(`matchMode='spectator';controllers=['${level}','${level}'];start();`);
    let decisions=0;
    for(;decisions<1500&&game.run(`phase!=='end'&&!botStopped`);decisions++){
      game.run('computerTurn()');
      game.flushTimers();
      game.run(`{
        if(units.some(u=>u.cell!==null&&(u.hp<=0||u.cell<0||u.cell>=78)))throw new Error('Invalid live unit');
        const live=units.filter(u=>u.cell!==null);
        // A movement reaction may interrupt transit through an occupied cell.
        if(['action','charge','spawn','end'].includes(phase)&&new Set(live.map(u=>u.cell)).size!==live.length)throw new Error('Overlapping units');
        if(teams.some(t=>t.reserve<0||t.reserve>4||t.spent>2))throw new Error('Invalid reserve');
      }`);
    }
    assert.equal(game.run('botStopped'),false,JSON.stringify(game.snapshot('({phase,mode,round,last:analysisLog.slice(-3)})')));
    assert.equal(game.run('phase'),'end',`Match did not finish within ${decisions} decisions`);
  });
}
