const conditionValue={
  Accecato:1.5, Confuso:1.4, Invisibile:-1, Maledetto:1.5,
  Pietrificato:2.4, Rallentato:1.2, Vulnerabile:1.3,
};

const attackDamage=(id,attacks)=>id==='arc'?1:id==='cut'?2:attacks[id]?.damage??0;

function cardValue(id,{cards,attacks}){
  if(!cards[id])return 0;
  const [,cost,type]=cards[id];
  if(type.startsWith('Attacco'))return 2+attackDamage(id,attacks)*.5-cost*.24+(type.endsWith('Vista')?.35:0);
  if(type.startsWith('Reazione'))return id==='veto'||id==='dash'?2.4:1.5;
  return ({
    stride:2.6, feral:2.5, refill:2.4, probe:2.1, meditate:2.3, oracle:2.1,
    cleanse:1.6, ballista:1.9, stasis:2, inversion:1.8,
  })[id]??(1.55-cost*.09);
}

function positionValue(actor,cell,state){
  if(cell===null)return 0;
  const own=actor.side===state.side?state.own:state.opponent;
  const {ritualDistance,combatDistance,exposed,pressure,blockedRitual}=state.position(actor,cell);
  const ritualWeight=own.ritual?0:own.kills>=2?.82:.48;
  const combatWeight=own.kills<2?.48:.15;
  const danger=actor.hp<=2?.54:.19;
  return -ritualDistance*ritualWeight-combatDistance*combatWeight
    +(!own.ritual&&!ritualDistance&&!blockedRitual?2.7:0)
    -(state.level==='easy'?0:exposed*danger)
    -(state.level==='hard'?pressure*danger:0);
}

function reposition(action,state){
  const {unit,side,phase,level}=state;
  const {cell,route,cost=0}=action;
  const sign=unit.side===side?1:-1;
  let value=sign*(positionValue(unit,cell,state)-positionValue(unit,unit.cell,state));
  if(phase==='setup'||phase==='spawn')return value;
  if(action.card==='move'){
    if(level==='hard')value+=(state.followUp(cell,cost)-state.currentAttack)*.77;
    value-=cost*.12;
    if(route&&level!=='easy'){
      for(const creation of state.creations){
        if(creation.side===side)continue;
        if(creation.id==='cube'&&route.includes(creation.cell))value-=.5;
      }
    }
    return value-.14;
  }
  if(action.card==='leap')value-=1;
  return value;
}

function attackScore(action,state,damage){
  const {target,card}=action;
  const {side,own,opponent,cards,attacks,level}=state;
  if(!target)return card==='arc'?2:0;
  if(target.conditions.Pietrificato!==undefined)return -.5;
  if(target.conditions.Vulnerabile!==undefined||state.creations.some(v=>v.id==='cube'&&v.side!==target.side&&v.cell===target.cell))damage++;
  const lethal=damage>=target.hp;
  if(lethal&&own.kills>=1&&own.ritual)return 100;
  const effect=attacks[card];
  let score=1.4*Math.min(damage,target.hp)+(lethal?(own.kills<2?6:1.8):0);
  if(!lethal&&level!=='easy'){
    if(effect?.condition&&target.conditions[effect.condition]===undefined)score+=conditionValue[effect.condition]*.65;
    if(effect?.drain)score+=Math.min(target.pe,effect.drain)*.3;
  }
  if(effect?.self)score-=.45;
  if(effect?.heal&&state.unit.hp<(state.unit.type==='Terra'?8:6))score+=.9;
  if(effect?.draw)score+=.6;
  if(level==='hard'&&!opponent.reaction&&target.pe+Math.min(2,opponent.reserve)>=3&&damage>1){
    score-=.19*Math.max(0,score-1.4);
  }
  return (target.side===side?-score:score)-cards[card][1]*.38-(card==='arc'?0:.45);
}

function reactionScore(action,state){
  const {card,target,incoming}=action;
  const {opponent,cards}=state;
  if(card==='veto'){
    const damage=attackDamage(incoming,state.attacks);
    const extra=target.conditions.Vulnerabile!==undefined||state.creations.some(v=>v.id==='cube'&&v.side!==target.side&&v.cell===target.cell)?1:0;
    if(target.hp<=1+extra||target.conditions.Pietrificato!==undefined)return -3;
    if(damage+extra>=target.hp)return 7;
    const condition=state.attacks[incoming]?.condition??state.afflictions[incoming];
    return (damage-1)*1.3+(conditionValue[condition]??0)*.7-2.55;
  }
  if(card==='dash')return target.hp<=2||opponent.kills>=1?1.3:-.3;
  if(card==='timeBlock'){
    const pe=target.pe+Math.min(2,state.own.reserve)-1;
    return state.hand.some(id=>['probe','refill','cleanse','meditate'].includes(id)&&cards[id][1]<=pe)?.8:-1;
  }
  return ({domain:1.2,shield:.8,chains:1.35,presence:.55})[card]??-.3;
}

function score(action,state){
  const {kind,card,target,label}=action;
  const {phase,mode,unit,own,hand,cards,attacks,afflictions,level}=state;
  if(kind==='end'||kind==='skip')return 0;
  if(kind==='ritual')return !own.ritual?(own.kills>=2?120:12):own.reserve<=2?3:-.2;
  if(kind==='reaction')return reactionScore(action,state);
  if(kind==='discard')return (hand.length>6?3:0)-cardValue(card,state)-(hand.filter(id=>id===card).length===1?.25:0);
  if(kind==='take')return cardValue(card,state);
  if(kind==='oracle')return -cardValue(card,state)+(action.where==='cima'?.08:0);
  if(kind==='illumination')return cardValue(card,state);
  if(kind==='cleanse')return (conditionValue[label]??0)-(label==='Maledetto'?(unit.hp===1?8:1):0);
  if(kind==='radiance')return label.conditions.Accecato===undefined?2:.5;
  if(kind==='destroy')return own.ritual?.3:1.1;
  if(kind==='option'){
    if(['Passa','Continua','Salta','Annulla'].includes(label))return 0;
    return conditionValue[label]??(label.includes(' PF ')?0:.2);
  }
  if(kind==='cell'&&(phase!=='action'||['move','jump','leap'].includes(card)))return reposition(action,state);
  const damage=attackDamage(card,attacks);
  if(damage)return attackScore(action,state,damage);
  const [,cost]=cards[card];
  const expense=cost*.38+Math.max(0,cost-unit.pe)*.3;
  if(afflictions[card]){
    const condition=afflictions[card];
    return target.conditions[condition]!==undefined?-2:(target.side===state.side?-1:1)*conditionValue[condition]-expense*.55;
  }
  if(kind==='edge'){
    if(card==='dissolve')return .65-expense*.35;
    if(card==='relocate')return -1;
    const [x,y,a,b]=action.edge;
    const nearby=state.foes.filter(v=>{
      const column=v.cell%13+.5,row=Math.floor(v.cell/13)+.5;
      return Math.abs(column-(x+a)/2)+Math.abs(row-(y+b)/2)<=1.5;
    }).length;
    return level==='easy'?-1:nearby*.65-expense;
  }
  const position=unit.cell===null?null:state.position(unit,unit.cell);
  const needsMovement=position&&(position.ritualDistance>0&&!own.ritual||position.combatDistance>0&&own.kills<2);
  const utility={
    stride:needsMovement?.85:-.5, feral:needsMovement?1.7:unit.slowPenalty?1.15:-.5,
    refill:Math.min(2,4-own.reserve)*1.35,
    meditate:hand.length<=5?2.25:hand.length<=7?.9:-.5,
    oracle:hand.length<=5?2.7:hand.length<=7?1:-.5,
    illumination:hand.length<=6?1.75:.35,
    cleanse:Object.keys(unit.conditions).filter(c=>c!=='Maledetto'||unit.hp>1).reduce((best,c)=>Math.max(best,conditionValue[c]??0),0),
    veil:unit.conditions.Invisibile===undefined&&position?.exposed?(unit.hp<=2?2:1.15):0,
    probe:2.25, karmic:hand.length<=5?1.6:-.5,
    radiance:state.foes.filter(v=>v.conditions.Accecato===undefined).length*1.13,
    ballista:1.6, cube:action.cell!==undefined&&state.foes.some(v=>v.cell===action.cell)?2:-.5,
    stasis:target?.side!==state.side&&state.foes.length?1.25:-.5,
    corrode:2.15, terrify:1.1, spray:2.5, giant:1.15,
    inversion:level==='easy'?-.8:-.1,
    projection:mode==='move'&&hand.some(id=>id!=='arc'&&cards[id][2]==='Attacco · Tocco')?.65:-.5,
  };
  if(target?.side===state.side&&['stasis','push','substitute'].includes(card))return -2;
  return (utility[card]??-.75)-expense;
}

export function chooseComputerAction(actions,state,random=Math.random,record){
  let best=null,bestScore=-Infinity;
  for(const action of actions){
    const noise=state.level==='easy'?random()*.9:0;
    const value=score(action,state)+noise;
    record?.(action,value);
    if(value>bestScore){best=action;bestScore=value;}
  }
  return best;
}
