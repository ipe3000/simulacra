import {cells,walls,zones,ritual,xy,center,neighbors,edge,mid,blocked,lineOfSight,wallBetween,paths,respawn} from './engine.mjs';
import catalog from './catalogo-carte.json' with {type:'json'};
import {chooseComputerAction} from './computer.mjs?v=2';
import {createFeedback} from './feedback.mjs?v=2';
import {createChronicle} from './chronicle.mjs?v=1';
import {setupDetails} from './details.mjs?v=1';

let onlineSide=0, onlineDriver=null, onlineSeed=1;
let gameRandom=()=>Math.random();
function seedOnline(seed){
  onlineSeed=seed>>>0;
  gameRandom=()=>((onlineSeed=Math.imul(onlineSeed,1664525)+1013904223>>>0)/2**32);
}
const cards={
  arc:['Colpo Arcano',0,'Attacco · Tocco','Infligge 1 danno.'],
  cut:['Fendente Dimensionale',2,'Attacco · Tocco','Infligge 2 danni, poi teletrasportati in una casella libera in vista.'],
  wall:['Barriera di Forza',3,'Utilità · Vista','Blocca movimento e vista dei nemici. Un nemico adiacente può distruggerla scartando un Attacco e pagandone il costo.'],
  probe:['Sonda Telepatica',3,'Utilità · Ovunque','Guarda la mano avversaria e scegli una carta da scartare.'],
  veto:['Veto Arcano',3,'Reazione · Personale','Quando sei bersaglio, annulla l’effetto e perdi 1 PF. L’attaccante ottiene 2 PE e pesca una carta.'],
  stride:['Piede Svelto',0,'Utilità · Personale','Ottieni 1 PM per questo Turno.'],
  meditate:['Meditazione Metafisica',1,'Utilità · Personale','Pesca 2 carte.'],
  refill:['Ricarica Arcana',1,'Utilità · Personale','Recupera 2 Riserva Arcana, fino a 4.'],
  veil:['Velo d’Ombra',2,'Utilità · Personale','Ottieni Invisibile.'],
  gravity:['Campo Gravitazionale',2,'Utilità · Vista','Il bersaglio diventa Rallentato.'],
  frost:['Morsa Ghiacciata',3,'Utilità · Ovunque','Il bersaglio diventa Rallentato.'],
  vertigo:['Vertigine Psichica',3,'Utilità · Ovunque','Il bersaglio diventa Confuso.'],
  curse:['Canto Dannato',1,'Utilità · Vista','Il bersaglio diventa Maledetto.'],
  feral:['Trasmutazione Ferina',2,'Utilità · Personale','Ottieni 3 PM. Se sei Rallentato, rimuovi la Condizione e il suo effetto.'],
  dissolve:['Dissolvi Creazione',2,'Utilità · Vista','Rimuovi una Creazione, anche se indistruttibile.'],
};
const attacks={
  flash:{ref:2,damage:2,condition:'Accecato'},
  arrow:{ref:3,damage:2,draw:true},
  whip:{ref:4,damage:2,condition:'Confuso'},
  claw:{ref:5,damage:2,condition:'Vulnerabile'},
  assault:{ref:9,damage:2,drain:2},
  hammer:{ref:11,damage:3,self:'Vulnerabile'},
  word:{ref:13,damage:1,condition:'Maledetto'},
  ray:{ref:15,damage:2},
  gaze:{ref:18,damage:2,condition:'Pietrificato'},
  leech:{ref:19,damage:2,self:'Vulnerabile',heal:true},
  toxin:{ref:20,damage:2,condition:'Vulnerabile',drain:1},
  wave:{ref:6,damage:2}, shard:{ref:7,damage:1}, necrotic:{ref:8,damage:2},
  chargeAttack:{ref:10,damage:2}, fireball:{ref:12,damage:2}, fist:{ref:14,damage:1},
  raid:{ref:16,damage:1}, bounce:{ref:17,damage:2},
};
for(const [id,{ref}] of Object.entries(attacks)){
  const {nome,costo,tipo,gittata,effetto}=catalog[ref-1];
  cards[id]=[nome,costo,tipo+' · '+gittata,effetto];
}
const extra={dash:26,projection:35,cleanse:44,oracle:52,illumination:61,radiance:62,
  swap:46,corrode:47,substitute:48,push:49,leap:55,exchange:56,karmic:59,contagion:60,
  terrify:65,spray:66,frenzy:67,vortex:70,inversion:42,giant:32,stasis:45,
  spiritWall:30,illusion:37,cube:39,relocate:40,ballista:54,lightWall:58,portal:68,
  domain:21,shield:22,timeBlock:23,chains:24,presence:25,remote:34,duplicate:41,ghost:43,penetrate:53};
for(const [id,ref] of Object.entries(extra)){
  const {nome,costo,tipo,gittata,effetto}=catalog[ref-1];
  cards[id]=[nome,costo,tipo+' · '+gittata,effetto];
}
const isAttack=id=>id==='arc'||id==='cut'||Object.hasOwn(attacks,id);
const conditions={
  Accecato:'Non può lanciare incantesimi con gittata Vista.',
  Vulnerabile:'Quando subisce danni perde 1 PF aggiuntivo.',
  Pietrificato:'Salta la Fase di Azione e non può perdere PF.',
  Rallentato:'Ottiene 2 PM in meno all’inizio del suo Turno.',
  Invisibile:'Non può essere bersaglio di incantesimi con gittata Vista.',
  Confuso:'Nel suo Turno può muoversi oppure attaccare.',
  Maledetto:'Perde 1 PF al Caricamento. La Condizione si rimuove quando è adiacente a un nemico.',
};
const afflictions={gravity:'Rallentato',frost:'Rallentato',vertigo:'Confuso',curse:'Maledetto'};
const implementedRefs={cut:1,wall:57,probe:64,veto:27,stride:28,gravity:38,meditate:33,
  frost:63,veil:51,curse:31,refill:36,vertigo:69,feral:50,dissolve:29,
  ...extra,...Object.fromEntries(Object.entries(attacks).map(([id,value])=>[id,value.ref]))};
const deckQuotas=[['Reazione',4],['Attacco',8],['Utilità',18]];
function makeDeck(){
  const entries=Object.entries(implementedRefs);
  return shuffle(deckQuotas.flatMap(([type,count])=>{
    const copies=entries.flatMap(([id,ref])=>{
      const card=catalog[ref-1];
      if(card.nome!==cards[id][0])throw new Error('Riferimento carta incoerente: '+id);
      return card.tipo===type?Array(card.copiePerArcimago).fill(id):[];
    });
    if(copies.length<count)throw new Error('Copie insufficienti: '+type);
    return shuffle(copies).slice(0,count);
  }));
}
const types=['Attacco','Utilità','Reazione'];
const ranges=['Personale','Tocco','Vista','Labirinto','Ovunque'];
function orderedHand(hand){
  return hand.map((id,i)=>{
    const [label,cost,category,description]=cards[id];
    const [type,range]=category.split(' · ');
    return {id,i,label,cost,type,range,description};
  }).sort((a,b)=>types.indexOf(a.type)-types.indexOf(b.type)
    ||ranges.indexOf(a.range)-ranges.indexOf(b.range)||b.cost-a.cost);
}
function shuffle(deck){
  for(let i=deck.length-1;i>0;i--){
    const j=Math.floor(gameRandom()*(i+1));
    [deck[i],deck[j]]=[deck[j],deck[i]];
  }
  return deck;
}
const labels=['Rosso','Blu'];
const root=document.querySelector('#game');
const feedback=createFeedback(root);
const chronicle=createChronicle();
let detailReader={close(){}};
let inspected=0,historyLimit=8,historySignature='',showFullHistory=false;
const publicState=()=>({
  units:units.map(u=>({id:u.id,name:name(u),hp:u.hp,pe:u.pe,pm:u.pm,cell:u.cell,position:cellLabel(u.cell),conditions:{...u.conditions}})),
  teams:teams.map((t,i)=>({name:labels[i],reserve:t.reserve,kills:t.kills,ritual:t.ritual})),
  creations:[...creations.map(v=>labels[v.side]+' · '+cards[v.id][0]+' · '+(v.cell===undefined?'confine '+v.edge.join(','):cellLabel(v.cell))),
    ...barriers.flatMap((e,i)=>e?[labels[i]+' · Barriera di Forza · confine '+e.join(',')]:[])],
});
const publicCard=(id,u)=>({id,actor:name(u)});
let visualEvents=[],presentationTimer,presenting=false;
const signal=(label,unit,kind='magic',symbol)=>visualEvents.push({label,cell:unit?.cell,side:unit?.side,kind,symbol});
function present(done){
  if(matchMode==='online'||!feedback.enabled()||feedback.reduced()){done();return;}
  presenting=true;render();
  presentationTimer=setTimeout(()=>{presenting=false;done();},420*feedback.speed());
}
let controllers=[null,null], matchMode='local', botTimer, paused=true, botStopped=false;
let movementTimer, animatingMovement=false;
const spectatorControls=document.querySelector('#spectator-controls');
const toggleComputers=document.querySelector('#toggle-computers');
const stepComputers=document.querySelector('#step-computers');
const computerSpeed=document.querySelector('#computer-speed');
let units,teams,order,index,round,setup,viewer,phase,mode,barriers,log,winner,ritualReady,pending,choice;
const active=()=>units[order[index]];
const at=c=>units.find(u=>u.cell===c);
const name=u=>labels[u.side]+' · '+u.type;
let analysisLog=[];
const note=t=>{
  log.unshift(t);
  if(matchMode!=='local')analysisLog.push('  '+t);
};
const same=(a,b)=>a.every((v,i)=>v===b[i]);
const distance=(a,b)=>xy(a).reduce((sum,n,i)=>sum+Math.abs(n-xy(b)[i]),0);
const maxHp=u=>u.type==='Terra'?8:6;
const near=(u,n)=>paths([u.cell],n,(a,b)=>passable(u,a,b)?1:Infinity);
const unitSpells=['swap','corrode','substitute','push','exchange','contagion','terrify','spray','giant','stasis'];
let serial,nextFirst,reactionsLocked,utilityReaction,origin;
let legacyReactions=false,timeStops;
let timeControlAvailable=false;
const timeSettings=['off','once','turn'];
let creations;
const edgeCreations=['wall','spiritWall','illusion','lightWall','portal'];
const cellCreations=['cube','ballista'];
const free=c=>!at(c)&&!creations.some(v=>v.cell===c);

function start(){
  clearTimeout(botTimer);
  cancelMovementAnimation();
  feedback.reset();visualEvents=[];
  detailReader.close();showFullHistory=false;
  document.querySelector('.match-menu')?.removeAttribute?.('open');
  chronicle.reset();historyLimit=8;historySignature='';
  document.querySelector('#route-caption').textContent='';
  document.querySelector('#action-caption').textContent='';
  logExport.hidden=true;
  copyMatchLog.textContent='Copia registro partita';
  paused=true;botStopped=false;
  const levels={easy:'Facile',normal:'Normale',hard:'Difficile'};
  analysisLog=['Simulacra | '+(matchMode==='solo'?'Giocatore vs Computer':'Computer vs Computer'),
    ...labels.map((label,side)=>label+' · '+(levels[controllers[side]]??'Umano'))];
  borrowed=[];
  units=[0,1,2,3].map(id=>({id,side:id%2,type:id<2?'Terra':'Fulmine',hp:id<2?8:6,pe:4,pm:0,cell:null,conditions:{}}));
  teams=[0,1].map(()=>{
    const deck=makeDeck();
    return {hand:deck.splice(0,6),deck,discard:[],reserve:4,kills:0,ritual:0,spent:0,reaction:false};
  });
  const first=gameRandom()<.5?0:1;
  serial=0;nextFirst=null;reactionsLocked=false;utilityReaction=null;origin=null;
  timeStops=[0,1].map(()=>({mode:'off',turn:null,skip:null}));
  order=[first,1-first,first+2,3-first];
  index=0; round=1; setup=[first,first+2,1-first,3-first]; viewer=null;
  phase='setup'; mode='move'; barriers=[null,null]; creations=[]; log=[]; winner=null; pending=null;choice=null;
  inspected=setup[0];
  show(first);
}
function show(side){
  viewer=side;
  render();
}
function sightWalls(side, target, ignoreSupportingWall=false){
  const portals=creations.filter(v=>v.id==='portal');
  const maze=(portals.length||ignoreSupportingWall)?walls.flatMap(([x,y,a,b])=>{
    const dx=Math.sign(a-x),dy=Math.sign(b-y);
    return Array.from({length:Math.abs(a-x)+Math.abs(b-y)},(_,i)=>
      [x+i*dx,y+i*dy,x+(i+1)*dx,y+(i+1)*dy]);
  }).filter(e=>!(ignoreSupportingWall&&same(e,target))&&!portals.some(v=>same(v.edge,e))):walls;
  const edges=creations.filter(v=>v.edge&&v.side!==side).map(v=>v.edge);
  return [...maze,...barriers.filter((e,i)=>e&&i!==side),...edges].filter(e=>e!==target);
}
function sightBoxes(side, ignored){
  return creations.filter(v=>v!==ignored&&v.cell!==undefined
    &&(v.id==='ballista'||(v.id==='cube'&&v.side!==side))).flatMap(v=>{
    const [x,y]=xy(v.cell);
    return [[x,y,x+1,y],[x+1,y,x+1,y+1],[x,y+1,x+1,y+1],[x,y,x,y+1]];
  });
}
function sight(c,target,side,{ignored,penetrate=false}={}){
  const start=center(c),walls=sightWalls(side),boxes=sightBoxes(side,ignored);
  if(lineOfSight(start,target,[...walls,...boxes]))return true;
  const [x,y]=target;
  if(!penetrate||(x!==start[0]&&y!==start[1])||(x===start[0]&&y===start[1]))return false;
  const previous=[x-Math.sign(x-start[0]),y-Math.sign(y-start[1])];
  return !blocked([...start,...target],boxes)&&!blocked([...start,...previous],walls);
}
const spellOrigin=u=>origin?.unit===u?origin.cell:u.cell;
const spellSight=(u,c,ignored)=>sight(spellOrigin(u),center(c),u.side,{ignored,penetrate:u.penetrate});
const effectiveRange=(u,category)=>u.projection&&category.endsWith('Tocco')?'Vista':category.split(' · ').at(-1);
function edgeSight(u,e,ignoreSupportingWall=false){
  const [x,y]=xy(spellOrigin(u));
  const blockers=[...sightWalls(u.side,e,ignoreSupportingWall),...sightBoxes(u.side)];
  return [[0,.5],[1,.5],[.5,0],[.5,1]].some(([dx,dy])=>lineOfSight([x+dx,y+dy],mid(e),blockers));
}
const has=(u,condition)=>Object.hasOwn(u.conditions,condition);
const turn=()=>serial;
function clearCurses(){
  for(const u of units){
    if(u.cell!==null&&has(u,'Maledetto')&&neighbors(u.cell).some(c=>at(c)?.side===1-u.side))delete u.conditions.Maledetto;
  }
}
function applyCondition(u,condition){
  if(condition&&u.cell!==null&&!has(u,condition))u.conditions[condition]=turn();
}
function stepCost(u,a,b){
  const enemy=units.some(v=>v.cell===b&&v.side!==u.side);
  const cube=creations.some(v=>v.id==='cube'&&v.cell===a&&v.side!==u.side);
  return 1+Number(enemy)+Number(cube);
}
function walk(u){
  const step=(a,b)=>passable(u,a,b)?stepCost(u,a,b):Infinity;
  const reach=paths([u.cell],u.pm,step);
  if(u.ghost){
    for(const [a,before] of [...reach])for(const b of neighbors(a)){
      if(passable(u,a,b))continue;
      const cost=before.cost+stepCost(u,a,b);
      if(cost>u.pm)continue;
      for(const [c,after] of paths([b],u.pm-cost,step)){
        const total=cost+after.cost;
        if(total<(reach.get(c)?.cost??Infinity))reach.set(c,{cost:total,route:[...before.route,...after.route]});
      }
    }
  }
  return reach;
}
function passable(u,a,b){
  const e=edge(a,b);
  if(wallBetween(a,b)&&!creations.some(v=>v.id==='portal'&&same(e,v.edge)))return false;
  return !(barriers[1-u.side]&&same(e,barriers[1-u.side]));
}
function legalCells(selection=mode,u=active()){
  if(phase==='setup')return zones[units[setup[0]].side].filter(c=>!at(c));
  if(phase==='spawn')return respawn(zones[u.side],free);
  if(phase==='dash')return [...near(choice.unit,3).keys()].filter(c=>!at(c));
  if(phase==='selection')return choice.positions??[];
  if(phase!=='action')return [];
  return actionCells(selection,u);
}
function actionCells(mode,u){
  if(cards[mode]&&effectiveRange(u,cards[mode][2])==='Vista'&&has(u,'Accecato'))return [];
  if(mode==='move')return utilityReaction||origin?.required||(has(u,'Confuso')&&u.attacked)?[]:[...walk(u).keys()].filter(c=>!at(c));
  if(mode==='jump')return cells.filter(c=>free(c)&&spellSight(u,c));
  if(mode==='leap')return cells.filter(c=>free(c)&&distance(c,u.cell)<=2);
  if(cellCreations.includes(mode))return creationCells(u,mode);
  if(mode==='relocate'&&has(u,'Accecato'))return [];
  if(mode==='dissolve'||mode==='relocate')return creations.filter(v=>v.cell!==undefined
    && (mode==='relocate'?v.side===u.side:visibleCreation(u,v))).map(v=>v.cell);
  if(isAttack(mode)){
    if(!canAttack(u))return [];
    const reach=mode==='ray'?paths([origin?.unit===u?origin.cell:u.cell],3,(a,b)=>passable(u,a,b)?1:Infinity):null;
    const unitTargets=units.filter(v=>v.side!==u.side&&v.cell!==null
      && !(round===1&&zones[v.side].includes(v.cell))
      && !u.attackTargets.includes(v.id)
      && (mode==='chargeAttack'?chargeDestinations(u,v).length>0:mode==='bounce'?!has(u,'Accecato')&&!has(v,'Invisibile')&&bouncedSight(u,v):reach?reach.has(v.cell):inRange(u,v,cards[mode][2]))).map(v=>v.cell);
    if(mode==='arc')unitTargets.push(...creations.filter(v=>v.id==='ballista'&&v.side!==u.side&&inRange(u,v,cards.arc[2],v)).map(v=>v.cell));
    return unitTargets;
  }
  if(afflictions[mode])return units.filter(v=>v.cell!==null&&v!==u&&
    inRange(u,v,cards[mode][2])).map(v=>v.cell);
  if(unitSpells.includes(mode))return units.filter(v=>v.cell!==null&&v!==u
    && (mode==='exchange'?v.side===u.side:['swap','push','substitute','stasis'].includes(mode)||v.side!==u.side)
    && inRange(u,v,cards[mode][2])).map(v=>v.cell);
  return [];
}
function targets(selection=mode){
  const mode=selection;
  const u=active();
  if(phase!=='action'||(cards[mode]&&effectiveRange(u,cards[mode][2])==='Vista'&&has(u,'Accecato')))return [];
  if(mode==='dissolve')return [...barriers,...creations.map(v=>v.edge)].filter(e=>e&&edgeSight(u,e));
  if(mode==='relocate'&&!has(u,'Accecato'))return [barriers[u.side],...creations.filter(v=>v.side===u.side).map(v=>v.edge)].filter(Boolean);
  return edgeCreations.includes(mode)?creationEdges(u,mode):[];
}
function creationEdges(u,id,projected=u.projection){
  return cells.flatMap(c=>neighbors(c).filter(n=>n>c&&wallBetween(c,n)===(id==='portal')).map(n=>edge(c,n)))
    .filter(e=>![...barriers,...creations.map(v=>v.edge)].some(b=>b&&same(b,e))
      && (id==='spiritWall'||(['lightWall','portal'].includes(id)
        ?(projected?edgeSight(u,e,id==='portal'):neighbors(spellOrigin(u)).some(n=>same(e,edge(n,spellOrigin(u)))))
         :edgeSight(u,e))));
}
function visibleCreation(u,v){
  return spellSight(u,v.cell,v);
}
function creationCells(u,id,projected=u.projection){
  return cells.filter(c=>free(c)&&(id==='cube'||((projected
    ? !has(u,'Accecato')&&spellSight(u,c)
    : distance(c,spellOrigin(u))===1&&spellSight(u,c))
    && !units.some(v=>v.side!==u.side&&v.cell!==null&&(sight(c,center(v.cell),u.side)||sight(v.cell,center(c),v.side))))));
}
function putCreation(id,location){
  const side=active().side;
  if(id==='wall'){barriers[side]=location.edge;return;}
  creations=creations.filter(v=>v.id!==id||v.side!==side);
  creations.push({id,side,...location});
}
function selectCreation(location){
  const u=active(),id=mode;
  const e=location.edge;
  const existing=creations.find(v=>e?v.edge===e:v.cell===location.cell);
  const barrier=e?barriers.indexOf(e):-1;
  if(id==='relocate'){
    const kind=existing?.id??'wall';
    if(e){
      const places=creationEdges(u,kind,false).filter(v=>edgeSight(u,v,kind==='portal'));
      choose('Scegli il nuovo confine',places.map(v=>['Confine '+v.join(', '),()=>{
        if(cast(id)){putCreation(kind,{edge:v});resume();}
      }]).concat([['Annulla',resume]]));
    }else{
      chooseCell('Scegli la nuova casella',creationCells(u,kind,false).filter(c=>spellSight(u,c)),
        c=>{if(cast(id))putCreation(kind,{cell:c});});
    }
    return;
  }
  if(!cast(id))return;
  if(id==='dissolve'||id==='arc'){
    if(barrier>=0)barriers[barrier]=null;
    else creations=creations.filter(v=>v!==existing);
    if(id==='arc'){u.attacked=true;u.attackTargets.push('ballista');}
  }else putCreation(id,location);
  resume();
}
const baseMovement=u=>u.type==='Terra'?4:5;
function begin(){
  const u=active();
  for(const [side,stop] of timeStops.entries()){
    if(stop.turn!==null&&stop.turn!==serial){if(stop.mode==='turn')stop.mode='off';stop.turn=null;stop.skip=null;}
    if(stop.mode!=='off'&&stop.turn===null&&u.side!==side)stop.turn=serial;
  }
  chronicle.turn({serial,round,side:u.side,unit:name(u)},publicState());inspected=u.id;
  teams.forEach(t=>{t.spent=0;t.reaction=false;});
  mode='move';u.attacked=false;u.played=[];u.pm=baseMovement(u);
  u.attackTargets=[];u.attackLimit=1;u.noAttack=false;reactionsLocked=false;
  u.penetrate=false;u.ghost=false;origin=null;
  u.projection=false;
  u.moved=false;u.slowPenalty=has(u,'Rallentato')?2:0;u.pm-=u.slowPenalty;
  phase=u.cell===null?'spawn':'action';
  if(phase==='action'&&has(u,'Pietrificato'))phase='charge';
  ritualReady=phase==='action'&&canRitual();
  if(phase==='action')offerTimeBlock(u.side,()=>show(u.side));else show(u.side);
}
function canRitual(){
  const u=active();
  return ritual.includes(u.cell)&&!neighbors(u.cell).some(c=>at(c)?.side===1-u.side);
}
function draw(side){
  const t=teams[side];
  if(!t.deck.length){
    t.deck=shuffle(t.discard.splice(0));
  }
  if(t.deck.length){
    t.hand.push(t.deck.shift());
    chronicle.add(labels[side]+' pesca 1 carta.');
    return true;
  }
  return false;
}
let borrowed=[];
function discard(side,i){
  const t=teams[side];
  const [id]=t.hand.splice(i,1);
  const loan=borrowed.findIndex(v=>v.id===id&&v.holder===side);
  const destination=loan<0?side:borrowed.splice(loan,1)[0].owner;
  teams[destination].discard.push(id);
}
function inRange(u,v,category,ignored){
  const range=effectiveRange(u,category);
  if(range==='Ovunque')return true;
  if(range==='Tocco')return distance(spellOrigin(u),v.cell)===1&&spellSight(u,v.cell,ignored);
  return !has(u,'Accecato')&&(!v.conditions||!has(v,'Invisibile'))&&spellSight(u,v.cell,ignored);
}
function bouncedSight(u,v){
  return spellSight(u,v.cell)||cells.some(c=>spellSight(u,c)&&sight(c,center(v.cell),u.side));
}
function chargeDestinations(u,v){
  if(has(u,'Accecato')||(u.projection&&has(v,'Invisibile'))||!spellSight(u,v.cell))return [];
  const reach=near(u,Infinity);
  return neighbors(v.cell).filter(c=>(c===u.cell||!at(c))&&reach.has(c)&&sight(c,center(v.cell),u.side));
}
function canAttack(u){return !u.noAttack&&u.attackTargets.length<u.attackLimit&&!(has(u,'Confuso')&&u.moved);}
function choose(text,options,side=active().side,positions){
  choice={text,options,positions};phase='selection';show(side);
}
function resume(){
  choice=null;mode='move';
  if(phase!=='end')phase=active().cell===null&&!utilityReaction?'charge':'action';
  clearCurses();show(active().side);
}
function offerRebirthMovement(){
  const u=active(),bonus=baseMovement(u);
  const finish=boost=>{
    if(phase!=='selection'||choice?.intent!=='rebirth')return;
    chronicle.begin({title:'Rinascita',actor:name(u)});
    if(boost){
      u.pm+=bonus;u.noAttack=true;
      note(name(u)+' rinuncia agli Attacchi: +'+bonus+' PM per questo turno.');
    }else note(name(u)+' rinasce senza bonus movimento.');
    resume();
  };
  choose('Rinascita: puoi rinunciare agli Attacchi per ottenere +'+bonus+' PM in questo turno.',[
    ['Ottieni +'+bonus+' PM · rinuncia agli Attacchi',()=>finish(true),{bonus:true}],
    ['Mantieni gli Attacchi · movimento normale',()=>finish(false),{bonus:false}],
  ]);
  choice.intent='rebirth';
}
function chooseCell(text,positions,apply,done=resume,optional=true,side=active().side){
  if(!positions.length){done();return;}
  choose(text,optional?[['Salta',done]]:[],side,positions);
  choice.apply=c=>{apply(c);done();};
}
function swapUnits(a,b,done=resume){
  const apply=()=>{[a.cell,b.cell]=[b.cell,a.cell];done();};
  const second=()=>{if(!offerReaction(b,'domain',done,apply))apply();};
  if(!offerReaction(a,'domain',done,second))second();
}
function moveEffect(u,positions,done=resume,optional=true,side=active().side){
  if(!positions.length){done();return;}
  const select=()=>{
    choose('Sposta '+name(u),optional?[['Salta',done]]:[],side,positions);
    choice.moving=u;
    choice.apply=c=>traverse(u,near(u,Infinity).get(c).route,()=>{
      if(phase==='end'){choice=null;render();}else done();
    });
  };
  if(!offerReaction(u,'domain',done,select))select();
}
function movementCells(u,n){return [...near(u,n).keys()].filter(c=>!at(c));}
function chooseDiscard(side,n,done){
  const hand=teams[side].hand;
  if(!n||hand.length<=3){done();return;}
  choose('Scegli una carta da scartare',orderedHand(hand).map(({label,i})=>[label,()=>{
    discard(side,i);chooseDiscard(side,n-1,done);
  }]),side);
  choice.intent='discard';
}
function affordable(u,cost){const t=teams[u.side];return cost<=u.pe+Math.min(t.reserve,2-t.spent);}
function pay(u,cost){
  const reserve=Math.max(0,cost-u.pe);
  const t=teams[u.side];
  if(!affordable(u,cost))return false;
  if(reserve&&matchMode!=='online'&&!controllers[u.side]&&!window.confirm('Usare '+reserve+' dalla Riserva Arcana per coprire i PE mancanti?'))return false;
  u.pe-=cost-reserve;t.reserve-=reserve;t.spent+=reserve;
  return true;
}
function cast(id){
  const u=active();
  if(isAttack(id)&&!canAttack(u))return false;
  if(utilityReaction&&(utilityReaction.used||!cards[id][2].startsWith('Utilità')))return false;
  if(effectiveRange(u,cards[id][2])==='Vista'&&has(u,'Accecato'))return false;
  const index=teams[u.side].hand.indexOf(id);
  if(id!=='arc'&&index<0)return false;
  if(!pay(u,cards[id][1]))return false;
  chronicle.begin({title:cards[id][0],actor:name(u),card:publicCard(id,u)});
  if(id!=='arc')discard(u.side,index);
  u.played.push(id);
  ritualReady=false;
  note(labels[u.side]+' lancia '+cards[id][0]+'.');
  signal(name(u)+' · '+cards[id][0],u,u.type==='Terra'?'earth-effect':'lightning-effect');
  if(utilityReaction)utilityReaction.used=true;
  if(origin)origin.consumed=true;
  return true;
}
function canReact(u,id){
  const t=teams[u.side];
  return !reactionsLocked&&!t.reaction&&t.hand.includes(id)&&affordable(u,cards[id][1])&&(legacyReactions||u.cell!==null&&u.hp>0);
}
function reactionCost(u,id){
  const cost=cards[id][1],reserve=Math.max(0,cost-u.pe);
  return reserve?(cost-reserve)+' PE + '+reserve+' Riserva':cost+' PE';
}
function declineReaction(){return legacyReactions?'Passa':'Non reagire';}
function offerReaction(u,id,apply,pass){
  if(!canReact(u,id)){
    if(legacyReactions&&matchMode==='online'&&!reactionsLocked&&!teams[u.side].reaction){choose('Reazione · '+name(u),[['Passa',pass]],u.side);return true;}
    return false;
  }
  choose('Reazione · '+name(u),[[cards[id][0]+(legacyReactions?'':' · '+reactionCost(u,id)),()=>{
    if(!pay(u,cards[id][1]))return;
    chronicle.reaction(publicCard(id,u));
    discard(u.side,teams[u.side].hand.indexOf(id));teams[u.side].reaction=true;
    note(name(u)+' usa '+cards[id][0]+'.');signal(name(u)+' · '+cards[id][0],u);apply();
  },{reaction:id,unit:u}],[declineReaction(),pass]],u.side);
  return true;
}
function timeUtilities(v){
  const saved={order,phase,mode,origin,utilityReaction,played:v.played};
  try{
    order=[...order];order[index]=v.id;phase='action';mode='move';origin=null;utilityReaction={used:false};v.played=[];
    return teams[v.side].hand.filter(id=>cards[id][2].startsWith('Utilità')&&affordable(v,cards[id][1]+1)&&canPlay(v,id)&&
      (untargetedSpells.has(id)||legalCells(id,v).length||targets(id).length));
  }finally{({order,phase,mode,origin,utilityReaction}=saved);v.played=saved.played;}
}
function timeCandidates(side){return units.filter(v=>v.side===side&&v.cell!==null&&canReact(v,'timeBlock')&&timeUtilities(v).length);}
function timeBoundary(){return JSON.stringify([serial,units,teams,creations,barriers]);}
function timeStopSetting(side,setting){
  if(!['off','once','turn'].includes(setting))throw Error('Impostazione intervento non valida.');
  if(setting!=='off'&&!timeCandidates(side).length)return false;
  timeStops[side]={mode:setting,turn:active().side!==side&&phase!=='setup'?serial:null,skip:null};
  if(setting!=='off'&&active().side!==side&&phase==='action'&&mode!=='jump'&&!pending&&!utilityReaction&&!origin?.required)mode='move';
  render();
  return true;
}
function timeControlState(side){
  return {visible:matchMode==='online'&&phase!=='end'&&teams[side].hand.includes('timeBlock'),
    available:timeCandidates(side).length>0,setting:timeStops[side].mode};
}
function updateTimeControl(state){
  const control=document.querySelector('#time-control'),select=document.querySelector('#time-stop');
  control.hidden=!state?.visible;select.value=state?.setting??'off';
  timeControlAvailable=!!state?.available;select.disabled=!timeControlAvailable&&select.value==='off';
  document.querySelector('#time-stop-hint').textContent=!state?.available?
    'Servono Blocco Temporale, un’Utilità valida e PE o Riserva sufficienti per entrambi.':
    state.setting==='off'?'Scegli uno stop per intervenire. Le azioni già confermate si completano.':
    state.setting==='once'?'Ti verrà chiesto prima della prossima azione avversaria utile.':
    'Ti verrà chiesto a ogni nuova azione di questo turno nemico; se è il tuo turno, del prossimo.';
}
function timeControl(){
  if(matchMode!=='online')return '';
  const state=timeControlState(onlineSide);
  updateTimeControl(state);
  if(!state.visible)return '';
  const text=viewer===onlineSide&&reactionInfo()?.cards.includes('timeBlock')?'Intervento in corso':
    {off:'Nessuno stop',once:'Stop alla prossima azione',turn:'Stop a ogni azione'}[state.setting];
  return '<button type="button" class="time-control-link" data-time-open>Blocco Temporale · '+text+'</button>';
}
function reactionInfo(){
  if(phase==='reaction')return {cards:['veto'],reason:name(active())+' sta lanciando '+cards[pending.id][0]+' su '+name(pending.defender)+'. Puoi annullarlo prima della risoluzione.',
    publicReason:name(active())+' sta lanciando '+cards[pending.id][0]+' su '+name(pending.defender)+'. In attesa della risposta prima della risoluzione.'};
  if(phase==='afterDamage')return {cards:['dash'],reason:name(choice.unit)+' ha subito danni. Scatto Fulmineo consente di spostarsi dopo il danno.'};
  if(phase!=='selection')return null;
  const options=choice.options.filter(v=>v[2]?.reaction);
  if(!options.length)return null;
  const ids=options.map(v=>v[2].reaction);
  const reason=ids.includes('timeBlock')?'Stop richiesto con Blocco Temporale: scegli se lanciare un’Utilità prima della prossima azione di '+labels[active().side]+'.':
    ids.includes('domain')?'Uno spostamento o teletrasporto sta per coinvolgere un tuo Simulacro. Dominio Spaziale può impedirlo.':
    'Il movimento di '+name(active())+' consente una reazione: '+[...new Set(ids)].map(id=>cards[id][0]).join(', ')+'.';
  const publicReason=ids.includes('timeBlock')?labels[viewer]+' ha richiesto un intervento prima della prossima azione di '+labels[active().side]+'.':
    ids.includes('domain')?'Uno spostamento o teletrasporto coinvolge un Simulacro di '+labels[viewer]+'. In attesa della risposta.':
    'Il movimento di '+name(active())+' consente una risposta di '+labels[viewer]+'. In attesa prima di proseguire.';
  return {cards:ids,reason,publicReason};
}
function modernizeReactions(){
  legacyReactions=false;
  if(phase==='selection'&&choice&&(choice.options.some(v=>v[2]?.reaction==='timeBlock')||choice.text?.startsWith('Reazione')&&choice.options.length===1)){
    choice.options.at(-1)[1]();return;
  }
  if(phase==='reaction'&&!canReact(pending.defender,'veto')){resolve(false);return;}
  if(phase==='afterDamage'&&!canReact(choice.unit,'dash')){finishDash();return;}
  render();
}
function offerPreparedTimeBlock(){
  if(legacyReactions||matchMode!=='online'||phase!=='action'||mode!=='move'||pending||choice||utilityReaction||origin?.required||presenting||animatingMovement)return false;
  const side=active().side,stop=timeStops[1-side];
  if(stop.mode==='off'||stop.skip===timeBoundary()||!timeCandidates(1-side).length)return false;
  offerTimeBlock(side,()=>show(side));return true;
}
function offerTimeBlock(side,done){
  const t=teams[1-side];
  const candidates=legacyReactions?units.filter(v=>v.side!==side&&v.cell!==null&&canReact(v,'timeBlock')&&
    t.hand.some(id=>cards[id][2].startsWith('Utilità')&&cards[id][1]+1<=v.pe+Math.min(t.reserve,2-t.spent))):timeCandidates(1-side);
  if(!candidates.length&&!(legacyReactions&&matchMode==='online'&&!reactionsLocked&&!t.reaction&&units.some(v=>v.side!==side&&v.cell!==null))){done();return;}
  if(!legacyReactions&&matchMode==='online'){
    const stop=timeStops[1-side];
    if(stop.mode==='off'||stop.skip===timeBoundary()){done();return;}
    stop.turn=serial;stop.skip=timeBoundary();if(stop.mode==='once')stop.mode='off';
  }
  const resumeTurn=()=>{choice=null;if(phase!=='end')phase='action';done();};
  choose(legacyReactions?'Reazione nel Turno avversario':'Blocco Temporale: intervieni prima della prossima azione di '+labels[side]+'.',[
    ...candidates.map(v=>['Blocco Temporale · '+name(v)+(legacyReactions?'':' · '+reactionCost(v,'timeBlock')+' + costo Utilità'),()=>{
      if(!pay(v,1))return;
      chronicle.reaction(publicCard('timeBlock',v));
      discard(v.side,t.hand.indexOf('timeBlock'));t.reaction=true;
      utilityReaction={order,index,done:resumeTurn,locked:reactionsLocked,used:false,turnMode:mode,ritualReady,played:v.played};
      order=[...order];order[index]=v.id;v.played=[];choice=null;mode='move';phase='action';show(v.side);
    },{reaction:'timeBlock',unit:v}]),[declineReaction(),resumeTurn]],1-side);
}
function finishTimeBlock(){
  const u=active(),saved=utilityReaction;
  applyCondition(u,'Rallentato');u.played=saved.played;
  ({order,index,ritualReady}=saved);reactionsLocked=saved.locked;
  utilityReaction=null;origin=null;choice=null;mode=saved.turnMode;
  if(phase!=='end')phase='action';
  saved.done();
}
function victory(side){
  if(teams[side].kills>=2&&teams[side].ritual>=1){winner=side;phase='end';mode='move';return true;}
  return false;
}
function damage(u,amount){
  if(has(u,'Pietrificato')){chronicle.add(name(u)+' non perde PF: Pietrificato.');return;}
  if(has(u,'Vulnerabile')||creations.some(v=>v.id==='cube'&&v.side!==u.side&&v.cell===u.cell))chronicle.add(name(u)+' subisce 1 danno aggiuntivo per Vulnerabile o Cubo nemico.');
  amount+=has(u,'Vulnerabile')||creations.some(v=>v.id==='cube'&&v.side!==u.side&&v.cell===u.cell)?1:0;
  u.hp=Math.max(0,u.hp-amount);
  note(name(u)+' perde '+amount+' PF.');
  if(u.hp===0){
    u.cell=null;u.conditions={};teams[1-u.side].kills++;
    teams[u.side].reserve=Math.min(4,teams[u.side].reserve+2);
    note(name(u)+' è caduto.');
    victory(1-u.side);
  }
}
function targetUnit(c){
  const id=mode,u=active(),defender=at(c);
  if(!cast(id))return;
  if(chronicle.current)chronicle.current.target=name(defender);
  if(isAttack(id)){u.attacked=true;u.attackTargets.push(defender.id);}
  pending={id,defender};
  if(id==='chargeAttack'){
    choose('Scegli dove terminare la carica',[],u.side,chargeDestinations(u,defender));
    choice.moving=u;
    choice.apply=destination=>traverse(u,near(u,Infinity).get(destination).route,()=>{
      if(u.cell===destination&&phase!=='end'){u.moved=true;offerVeto();return;}
      pending=null;
      if(phase==='end'){choice=null;render();}else if(u.cell===null)charge();else resume();
    });
    return;
  }
  present(offerVeto);
}
function movementReactions(u,from,to,done){
  const enemies=units.filter(v=>v.side!==u.side&&v.cell!==null);
  const options=[];let publicWindow=false;
  for(const v of enemies){
    const was=distance(v.cell,from)===1,now=distance(v.cell,to)===1;
    if(!reactionsLocked&&!teams[v.side].reaction&&((!was&&now)||(was&&!now)))publicWindow=true;
    if(!was&&now&&canReact(v,'shield')){
      options.push([v,'shield',()=>moveEffect(u,movementCells(u,2).filter(c=>distance(c,v.cell)>distance(to,v.cell)),done,true,v.side)]);
    }
    if(was&&!now&&canReact(v,'chains')&&!at(from)){
      options.push([v,'chains',()=>{u.cell=from;u.pm=Math.max(0,u.pm-2);done();}]);
    }
    const firstSight=!sight(v.cell,center(from),v.side)&&sight(v.cell,center(to),v.side)
      &&v.sawTurn!==turn();
    if(firstSight){
      v.sawTurn=turn();
      if(!reactionsLocked&&!teams[v.side].reaction&&!has(v,'Accecato')&&!has(u,'Invisibile'))publicWindow=true;
      if(!has(v,'Accecato')&&!has(u,'Invisibile')&&canReact(v,'presence'))options.push([v,'presence',()=>{u.pm=Math.max(0,u.pm-2);done();}]);
    }
  }
  if(!options.length&&!(legacyReactions&&matchMode==='online'&&publicWindow)){done();return;}
  choose('Reazione al movimento',[
    ...options.map(([v,id,apply])=>[cards[id][0]+' · '+name(v)+(legacyReactions?'':' · '+reactionCost(v,id)),()=>{
      if(!pay(v,cards[id][1]))return;
      chronicle.reaction(publicCard(id,v));
      discard(v.side,teams[v.side].hand.indexOf(id));teams[v.side].reaction=true;apply();
    },{reaction:id,unit:v}]),[declineReaction(),done]],1-u.side);
}
function offerVeto(){
  const {defender}=pending;
  const t=teams[defender.side];
  if(!reactionsLocked&&!t.reaction&&(legacyReactions&&matchMode==='online'||canReact(defender,'veto'))){
    phase='reaction';mode='move';show(defender.side);
  }else resolve(false);
}
function additionalEffect(id,u,v,hitCell=v.cell){
  const live=v.cell!==null;
  if(id==='wave'&&live){moveEffect(v,movementCells(v,3));return true;}
  if(id==='fist'&&live){
    const positions=cells.filter(c=>!at(c)&&distance(v.cell,c)<=2);
    const select=()=>{
      chooseCell('Teletrasporta '+name(v),positions,c=>{v.cell=c;});
      if(positions.length)choice.moving=v;
    };
    if(!offerReaction(v,'domain',resume,select))select();
    return true;
  }
  if(id==='shard'&&live){
    const select=left=>choose('Scegli '+(left.length===4?'la prima':'la seconda')+' Condizione',left.map(c=>[c,()=>{
      applyCondition(v,c);if(left.length===4)select(left.filter(x=>x!==c));else resume();
    }]));
    select(['Confuso','Vulnerabile','Accecato','Rallentato']);return true;
  }
  if(id==='necrotic'||id==='corrode'){chooseDiscard(v.side,2,resume);return true;}
  if(id==='fireball'){
    const reach=near({...v,cell:hitCell},3);
    const other=units.filter(w=>w!==v&&w.side===v.side&&w.cell!==null&&reach.has(w.cell));
    choose('Scegli il secondo bersaglio',[...other.map(w=>[name(w),()=>{damage(w,1);resume();}]),['Continua',resume]]);
    return true;
  }
  if(id==='raid'){
    const t=teams[v.side];
    choose('Scegli una carta da prendere',[...orderedHand(t.hand).map(({label,i})=>[label,()=>{
      const [id]=t.hand.splice(i,1);
      const loan=borrowed.findIndex(item=>item.holder===v.side&&item.id===id);
      if(loan>=0)borrowed.splice(loan,1);else borrowed.push({id,holder:u.side,owner:v.side});
      teams[u.side].hand.push(id);resume();
    }]),...(!t.hand.length?[['Continua',resume]]:[])]);
    choice.intent='take';
    return true;
  }
  if(id==='swap'&&live){
    const positions=units.filter(w=>w!==v&&w.cell!==null&&inRange(u,w,cards[id][2])).map(w=>w.cell);
    if(!positions.length){resume();return true;}
    choose('Scegli il secondo Simulacro',[],u.side,positions);
    choice.apply=c=>swapUnits(v,at(c));return true;
  }
  if(id==='substitute'&&live){applyCondition(v,'Rallentato');swapUnits(u,v);return true;}
  if(id==='push'&&live){moveEffect(v,movementCells(v,2));return true;}
  if(id==='terrify'&&live){
    applyCondition(v,'Rallentato');
    moveEffect(v,movementCells(v,2).filter(c=>distance(c,u.cell)>distance(v.cell,u.cell)));return true;
  }
  if(id==='giant'&&live){
    const reach=near(v,Infinity);
    const adjacent=neighbors(u.cell).filter(c=>!at(c)&&reach.has(c)&&sight(u.cell,center(c),u.side));
    const min=Math.min(...adjacent.map(c=>reach.get(c).cost));
    moveEffect(v,adjacent.filter(c=>reach.get(c).cost===min),resume,false);return true;
  }
  if(id==='spray'){applyCondition(v,'Vulnerabile');applyCondition(v,'Rallentato');applyCondition(u,'Vulnerabile');}
  if(id==='stasis')reactionsLocked=true;
  if(id==='contagion'){
    choose('Scegli una Condizione da trasferire',[...Object.keys(u.conditions).filter(c=>c!=='Maledetto').map(c=>[c,()=>{
      delete u.conditions[c];applyCondition(v,c);resume();
    }]),['Continua',resume]]);return true;
  }
  if(id==='exchange'){
    const options=[];
    for(const [from,to] of [[u,v],[v,u]])for(let n=1;n<=Math.min(2,from.hp-1,maxHp(to)-to.hp);n++){
      options.push([n+' PF da '+name(from)+' a '+name(to),()=>{from.hp-=n;to.hp+=n;resume();}]);
    }
    choose('Scegli come scambiare i PF',[...options,['Continua',resume]]);return true;
  }
  return false;
}
function resolve(veto){
  const {id,defender}=pending,u=active();
  if(veto){
    if(!pay(defender,3))return;
    chronicle.reaction(publicCard('veto',defender));
    if(chronicle.current)chronicle.current.status='Annullata';
    discard(defender.side,teams[defender.side].hand.indexOf('veto'));
    teams[defender.side].reaction=true;
    note(labels[defender.side]+' annulla l’incantesimo con Veto Arcano.');
    signal('Veto Arcano · incantesimo annullato',defender,'veto-effect','⊘');
  }
  phase='action';pending=null;mode='move';
  const effect=attacks[id];
  const before=defender.hp,hitCell=defender.cell;
  if(veto||isAttack(id))damage(defender,veto||id==='arc'?1:effect?.damage??2);
  if(!veto&&phase!=='end'){
    applyCondition(defender,effect?.condition??afflictions[id]);
    applyCondition(u,effect?.self);
    if(effect?.drain&&defender.cell!==null)defender.pe=Math.max(0,defender.pe-effect.drain);
    if(effect?.draw)draw(u.side);
    if(effect?.heal)u.hp=Math.min(u.type==='Terra'?8:6,u.hp+1);
  }
  clearCurses();
  if(phase!=='end'){
    if(veto){u.pe=Math.min(4,u.pe+2);draw(u.side);}
    if(!veto&&id==='cut'){mode='jump';if(!legalCells().length)mode='move';}
    if(!veto){
      const continueEffect=()=>{if(!additionalEffect(id,u,defender,hitCell))show(u.side);};
      if(defender.cell!==null&&defender.hp<before&&(canReact(defender,'dash')||legacyReactions&&matchMode==='online'&&defender.type==='Fulmine'&&!reactionsLocked&&!teams[defender.side].reaction)){
        choice={unit:defender,resume:mode,done:continueEffect};phase='afterDamage';show(defender.side);return;
      }
      continueEffect();return;
    }
  }
  show(u.side);
}
function traverse(u,route,done,spendPm=false){
  let lastFree=u.cell,spent=0;
  const visited=[u.cell];
  const occupied=c=>units.some(v=>v!==u&&v.cell===c);
  const finish=()=>{
    if(u.cell!==null&&occupied(u.cell))u.cell=lastFree;
    if(matchMode!=='local'&&visited.length>1){
      analysisLog.push('  '+name(u)+' · Percorso effettivo: '+visited.map(cellLabel).join(' → ')+
        (u.cell===visited.at(-1)?'':' · Fine: '+cellLabel(u.cell))+(spendPm?' · '+spent+' PM':''));
    }
    done(spent);
  };
  const step=i=>{
    if(i>=route.length||u.cell===null||phase==='end'){finish();return;}
    const from=u.cell,destination=route[i],crossing=edge(from,destination);
    const open=passable(u,from,destination);
    if(!open&&!(spendPm&&u.ghost)){finish();return;}
    if(spendPm){
      const cost=stepCost(u,from,destination);
      if(cost>u.pm){finish();return;}
      u.pm-=cost;spent+=cost;
      if(!open)u.ghost=false;
    }
    const visible=creations.filter(v=>v.id==='ballista'&&v.side!==u.side&&!sight(v.cell,center(from),v.side,{ignored:v}));
    u.cell=destination;
    visited.push(destination);
    if(!occupied(destination))lastFree=destination;
    for(const v of [...creations]){
      if(u.cell===null||phase==='end')break;
      if(v.side===u.side)continue;
      if(v.edge&&same(crossing,v.edge)){
        if(v.id==='illusion')u.noAttack=true;
        if(v.id==='lightWall'){creations=creations.filter(w=>w!==v);damage(u,1);applyCondition(u,'Accecato');}
      }
      if(visible.includes(v)&&v.fired!==turn()&&sight(v.cell,center(destination),v.side,{ignored:v})){
        v.fired=turn();chronicle.add('Ballista Animata '+labels[v.side]+' colpisce '+name(u)+'.');damage(u,1);
      }
    }
    const continueMovement=()=>{
      if(u.cell===null||phase==='end'){finish();return;}
      movementReactions(u,from,destination,()=>u.cell===destination?step(i+1):finish());
    };
    if(matchMode==='online'||!controllers[u.side]&&(!feedback.enabled()||feedback.reduced())){continueMovement();return;}
    animatingMovement=true;
    render();
    const delay=feedback.reduced()?0:(matchMode==='spectator'?Math.max(220,Number(computerSpeed.value)*.48):240)*feedback.speed();
    movementTimer=setTimeout(()=>{
      animatingMovement=false;
      continueMovement();
    },delay);
  };
  step(1);
}
function cancelMovementAnimation(){
  clearTimeout(movementTimer);
  clearTimeout(presentationTimer);presenting=false;
  animatingMovement=false;
}
function finishDash(){
  const {resume:next,done}=choice;
  mode=next;phase='action';choice=null;done();
}
function reactDash(){
  const u=choice.unit,t=teams[u.side];
  if(!pay(u,1))return;
  chronicle.reaction(publicCard('dash',u));
  discard(u.side,t.hand.indexOf('dash'));t.reaction=true;
  note(name(u)+' usa Scatto Fulmineo.');
  phase='dash';render();
}
function selectCell(c,selection=mode){
  if(!legalCells(selection).includes(c))return;
  mode=selection;
  const u=active();
  if(phase==='selection'){choice.apply(c);return;}
  if(phase==='action'&&(cellCreations.includes(mode)||mode==='relocate'||mode==='dissolve'||(mode==='arc'&&!at(c)))){
    selectCreation({cell:c});return;
  }
  if(phase==='dash'){
    const dash=choice;
    traverse(dash.unit,near(dash.unit,3).get(c).route,()=>{
      choice=dash;clearCurses();
      if(phase==='end'){choice=null;render();}else{if(dash.unit===active()&&dash.unit.cell===null){choice=null;charge();return;}finishDash();}
    });return;
  }
  if(phase==='setup'){
    const placed=units[setup.shift()];placed.cell=c;
    if(setup.length)inspected=setup[0];
    if(setup.length)show(units[setup[0]].side);else begin();
    return;
  }
  if(phase==='spawn'){
    u.cell=c;u.hp=u.type==='Terra'?8:6;u.pe=4;phase='action';ritualReady=canRitual();
    offerRebirthMovement();return;
  }else if(isAttack(mode)||afflictions[mode]||unitSpells.includes(mode)){targetUnit(c);return;}
  else if(mode==='leap'){
    if(!cast('leap'))return;
    u.cell=c;u.noAttack=true;mode='move';
  }
  else if(mode==='jump'){u.cell=c;mode='move';}
  else{
    const route=walk(u).get(c);
    chronicle.begin({title:'Movimento',actor:name(u)});
    ritualReady=false;u.moved=true;
    traverse(u,route.route,spent=>{
      if(spent)note(name(u)+' si muove · '+spent+' PM.');
      choice=null;clearCurses();
      if(phase==='end'){render();return;}
      if(u.cell===null){charge();return;}
      phase='action';offerTimeBlock(u.side,()=>show(u.side));
    },true);return;
  }
  clearCurses();render();
}
function charge(){
  phase='charge';mode='move';render();
}
function advance(){
  const u=active(),t=teams[u.side];
  if(t.hand.length>6)return;
  chronicle.begin({title:'Caricamento',actor:name(u)});
  while(t.hand.length<6&&(t.deck.length||t.discard.length))draw(u.side);
  u.pe=4;u.pm=0;
  clearCurses();
  if(u.cell!==null&&has(u,'Maledetto')&&u.conditions.Maledetto<turn()){
    damage(u,1);
    if(phase==='end'){render();return;}
  }
  for(const [condition,applied] of Object.entries(u.conditions)){
    if(condition!=='Maledetto'&&applied<turn())delete u.conditions[condition];
  }
  chronicle.observe(publicState());
  if(chronicle.current)chronicle.current.status='Risolta';
  index=(index+1)%4;serial++;
  if(index===0){
    round++;
    if(nextFirst!==null){order=[nextFirst,1-nextFirst,nextFirst+2,3-nextFirst];nextFirst=null;}
  }
  begin();
}
function ritualAction(){
  const u=active(),t=teams[u.side];
  chronicle.begin({title:'Rituale',actor:name(u)});
  t.ritual++;t.reserve=Math.min(4,t.reserve+2);
  note(labels[u.side]+' completa il Rituale.');
  if(!victory(u.side))charge();else render();
}
function pick(id){
  const u=active(),t=teams[u.side];
  if(['remote','duplicate','ghost','penetrate'].includes(id)){
    if(utilityReaction&&['remote','duplicate'].includes(id))return;
    const ally=units.find(v=>v!==u&&v.side===u.side);
    if(id==='remote'&&ally.cell===null)return;
    if(!cast(id))return;
    if(id==='ghost'){u.ghost=true;u.noAttack=true;resume();}
    if(id==='penetrate'){u.penetrate=true;resume();}
    if(id==='remote'){origin={unit:u,cell:ally.cell,required:true};resume();}
    if(id==='duplicate'){
      chooseCell('Scegli l’origine del prossimo incantesimo',[...near(u,2).keys()],c=>{origin={unit:u,cell:c};});
    }
    return;
  }
  if(['frenzy','inversion','karmic','vortex'].includes(id)){
    const ally=units.find(v=>v!==u&&v.side===u.side);
    if(id==='inversion'&&(t.ritual||ally.cell===null))return;
    if(!cast(id))return;
    if(id==='frenzy')u.attackLimit=2;
    if(id==='inversion'){swapUnits(u,ally);return;}
    if(id==='karmic'){
      const turnOrder=utilityReaction?.order??order;
      if(turnOrder[0]===u.side){draw(u.side);draw(u.side);}
      else{nextFirst=u.side;damage(u,1);}
    }
    if(id==='vortex'){
      const next=remaining=>{
        if(!remaining.length){resume();return;}
        choose('Scegli quale Simulacro spostare',remaining.map(v=>[name(v),()=>{
          moveEffect(v,movementCells(v,1),()=>next(remaining.filter(w=>w!==v)));
        }]));
      };
      next(units.filter(v=>v.cell!==null));return;
    }
    resume();return;
  }
  if(id==='projection'){
    if(cast(id)){u.projection=true;mode='move';render();}
    return;
  }
  if(['cleanse','oracle','illumination','radiance'].includes(id)){
    const options=id==='cleanse'?Object.keys(u.conditions):id==='illumination'?[...new Set(t.discard)]
      :id==='radiance'?units.filter(v=>v.cell!==null&&v.side!==u.side):[];
    if(id!=='oracle'&&id!=='radiance'&&!options.length)return;
    if(!cast(id))return;
    choice={id,options};
    if(id==='oracle'){
      for(let count=0;count<3;count++)if(draw(u.side))options.push(t.hand.length-1);
      choice.text=options.length===3
        ?'Scegli una carta da rimettere in cima o in fondo al mazzo.'
        :options.length===1
          ?'Hai pescato una carta: scegli se rimetterla in cima o in fondo al mazzo.'
          :options.length===2
            ?'Hai pescato due carte: scegli quale rimettere in cima o in fondo al mazzo.'
            :'Non ci sono carte da pescare.';
    }
    phase='choice';mode='move';render();return;
  }
  if(['stride','meditate','refill','veil','feral'].includes(id)){
    if(!cast(id))return;
    const u=active(),t=teams[u.side];
    if(id==='stride')u.pm++;
    if(id==='meditate'){draw(u.side);draw(u.side);}
    if(id==='refill')t.reserve=Math.min(4,t.reserve+2);
    if(id==='veil'&&!has(u,'Invisibile'))u.conditions.Invisibile=turn();
    if(id==='feral'){
      u.pm+=3+u.slowPenalty;u.slowPenalty=0;delete u.conditions.Rallentato;
    }
    mode='move';render();return;
  }
  if(id==='probe'){
    if(!cast(id))return;
    phase='probe';mode='move';render();return;
  }
  if(cards[id]&&effectiveRange(u,cards[id][2])==='Vista'&&has(u,'Accecato'))return;
  mode=mode===id?'move':id;render();
}
function finishChoice(){
  resume();
}
function destroy(i){
  const u=active(),t=teams[u.side],e=barriers[1-u.side];
  if(!e||!pay(u,cards[t.hand[i]][1]))return;
  chronicle.begin({title:'Distruzione della Barriera di Forza',actor:name(u)});
  discard(u.side,i);barriers[1-u.side]=null;ritualReady=false;
  note('Barriera di Forza distrutta.');render();
}

function canPlay(u,id){
  const [,cost,type]=cards[id];
  if(type.startsWith('Reazione')||!affordable(u,cost)||u.played.includes(id))return false;
  if(utilityReaction&&(!type.startsWith('Utilità')||utilityReaction.used||['remote','duplicate'].includes(id)))return false;
  if(effectiveRange(u,type)==='Vista'&&has(u,'Accecato'))return false;
  if(isAttack(id)&&!canAttack(u))return false;
  const ally=units.find(v=>v.side===u.side&&v!==u);
  if(id==='remote')return ally.cell!==null;
  if(id==='inversion')return !teams[u.side].ritual&&ally.cell!==null;
  if(id==='cleanse')return Object.keys(u.conditions).length>0;
  if(id==='illumination')return teams[u.side].discard.length>0;
  return true;
}

function canDestroy(u,id){
  const e=barriers[1-u.side];
  return isAttack(id)&&e&&neighbors(u.cell).some(c=>same(e,edge(c,u.cell)))&&affordable(u,cards[id][1]);
}

function discardForCharge(side,i){
  discard(side,i);
  if(teams[side].hand.length<=6)advance();
  else render();
}

function discardFromProbe(side,i){
  discard(side,i);phase='action';render();
}

function cardChoice(option,where){
  const u=active(),t=teams[u.side];
  if(choice.id==='oracle'){
    const [id]=t.hand.splice(option,1);
    if(where==='cima')t.deck.unshift(id);else t.deck.push(id);
  }else if(choice.id==='illumination'){
    t.hand.push(...t.discard.splice(t.discard.indexOf(option),1));
  }else if(choice.id==='radiance'){
    applyCondition(option,'Accecato');choice.options=choice.options.filter(v=>v!==option);
    if(choice.options.length){render();return;}
  }else{
    delete u.conditions[option];
    if(option==='Maledetto')damage(u,1);
  }
  finishChoice();
}

function computerTurn(){
  if(phase==='end'||botStopped||animatingMovement||presenting||!controllers[viewer])return;
  const side=viewer, level=controllers[side], u=active(), t=teams[side];
  const unit=phase==='setup'?units[setup[0]]:phase==='dash'||phase==='afterDamage'?choice.unit:choice?.moving??u;
  const hand=orderedHand(t.hand);
  const actions=[];
  const add=(kind,run,data={})=>actions.push({kind,run,...data});
  const addCell=(c,selection=mode,data={})=>add('cell',()=>selectCell(c,selection),{cell:c,card:selection,...data});
  if(phase==='action'&&mode!=='jump'){
    const movement=legalCells('move');
    if(movement.length){
      const reach=walk(u);
      movement.forEach(c=>addCell(c,'move',{cost:reach.get(c).cost,route:reach.get(c).route}));
    }
    if(utilityReaction)add('end',finishTimeBlock);
    else if(origin?.required)add('end',()=>{origin=null;resume();});
    else{
      add('end',charge);
      if(ritualReady&&canRitual())add('ritual',ritualAction);
    }
    for(const id of new Set(['arc',...t.hand])){
      if(!canPlay(u,id))continue;
      const positions=legalCells(id);
      const edges=targets(id);
      for(const c of positions)addCell(c,id,{target:at(c)});
      for(const e of edges)add('edge',()=>{mode=id;selectCreation({edge:e});},{card:id,edge:e});
      if(!positions.length&&!edges.length&&untargetedSpells.has(id))add('spell',()=>pick(id),{card:id});
    }
    for(const {id,i} of hand)if(canDestroy(u,id))add('destroy',()=>destroy(i),{card:id,edge:barriers[1-side]});
  }else{
    for(const c of legalCells())addCell(c);
    if(phase==='charge'){
      if(hand.length<=6)add('end',advance);
      for(const {id,i} of hand)add('discard',()=>discardForCharge(side,i),{card:id});
    }else if(phase==='probe'){
      // The acting Arcimago can see these cards while resolving Sonda Telepatica.
      for(const {id,i} of orderedHand(teams[1-side].hand))add('take',()=>discardFromProbe(1-side,i),{card:id});
      if(!actions.length)add('skip',resume);
    }else if(phase==='reaction'){
      add('reaction',()=>resolve(true),{card:'veto',target:pending.defender,incoming:pending.id});
      add('skip',()=>resolve(false));
    }else if(phase==='afterDamage'){
      add('reaction',reactDash,{card:'dash',target:unit});
      add('skip',finishDash);
    }else if(phase==='dash'){
      add('skip',finishDash);
    }else if(phase==='selection'){
      for(const [label,run,details] of choice.options){
        const card=details?.reaction??Object.keys(cards).find(id=>cards[id][0]===label);
        const kind=details?.reaction?'reaction':choice.intent??'option';
        add(kind,run,{label,card,target:details?.unit,bonus:details?.bonus});
      }
    }else if(phase==='choice'){
      for(const option of choice.options){
        if(choice.id==='oracle'){
          for(const where of ['cima','fondo'])add('oracle',()=>cardChoice(option,where),{card:t.hand[option],where});
        }else add(choice.id,()=>cardChoice(option),{card:option,label:option});
      }
      if(!actions.length||choice.id==='radiance')add('skip',finishChoice);
    }
  }

  const enemy=1-side;
  const foes=units.filter(v=>v.side===enemy&&v.cell!==null);
  const positional=new Map();
  const reachFrom=(actor,c)=>paths([c],Infinity,(a,b)=>passable(actor,a,b)?1:Infinity);
  const enemyReach=level==='hard'?foes.map(v=>[v,reachFrom(v,v.cell)]):[];
  const goalDistances=new Map();
  function position(actor,c){
    if(!positional.has(actor.id+':'+c)){
      const opponents=actor.side===side?foes:units.filter(v=>v.side===side&&v.cell!==null);
      if(!goalDistances.has(actor.id)){
        const step=(a,b)=>passable(actor,a,b)?1:Infinity;
        const approach=opponents.flatMap(v=>neighbors(v.cell).filter(n=>passable(actor,n,v.cell)));
        goalDistances.set(actor.id,{
          ritual:paths(ritual,Infinity,step),
          combat:paths(approach,Infinity,step),
        });
      }
      const goals=goalDistances.get(actor.id);
      const ritualDistance=goals.ritual.get(c)?.cost??30;
      const combatDistance=goals.combat.get(c)?.cost??30;
      const exposed=opponents.filter(v=>sight(v.cell,center(c),v.side)).length;
      const pressure=actor.side===side?enemyReach.reduce((sum,[v,reach])=>
        sum+Number((reach.get(c)?.cost??Infinity)<=(v.type==='Terra'?5:6)),0):0;
      const blockedRitual=opponents.some(v=>distance(c,v.cell)===1);
      positional.set(actor.id+':'+c,{ritualDistance,combatDistance,exposed,pressure,blockedRitual});
    }
    return positional.get(actor.id+':'+c);
  }
  function followUp(c,cost){
    if(origin||utilityReaction||has(u,'Confuso'))return 0;
    const moved={...u,cell:c,pm:u.pm-cost,moved:true};
    const attacksInHand=['arc',...t.hand.filter(isAttack)].filter(id=>canPlay(moved,id));
    let best=0;
    for(const id of attacksInHand){
      for(const targetCell of actionCells(id,moved)){
        const target=at(targetCell);
        if(target?.side!==enemy||has(target,'Pietrificato'))continue;
        const damage=attacks[id]?.damage??(id==='arc'?1:2);
        best=Math.max(best,damage+(target.hp<=damage?3:0)-cards[id][1]*.18);
      }
    }
    return best;
  }
  const currentAttack=level==='hard'&&phase==='action'&&mode!=='jump'?followUp(u.cell,0):0;
  const rebirthPlans=choice?.intent==='rebirth'?[false,true].flatMap(bonus=>{
    const actor={...u,pm:u.pm+(bonus?baseMovement(u):0)};
    return [...walk(actor)].filter(([c])=>c===u.cell||!at(c)).map(([cell,{cost}])=>({
      bonus,cell,cost,attack:bonus?0:followUp(cell,cost),
    }));
  }):[];
  const state={level,side,phase,mode,unit,hand:t.hand,own:{
    kills:t.kills,ritual:t.ritual,reserve:t.reserve,
  },opponent:{
    kills:teams[enemy].kills,ritual:teams[enemy].ritual,reserve:teams[enemy].reserve,reaction:teams[enemy].reaction,
  },foes,creations,position,followUp,currentAttack,rebirthPlans,cards,attacks,afflictions};
  const scored=[];
  const action=chooseComputerAction(actions,state,Math.random,(candidate,value)=>scored.push({candidate,value}));
  if(action){
    recordComputerDecision(side,unit,action,scored);
    action.run();
  }
  else{
    botStopped=true;paused=true;render();
  }
}

function cellLabel(cell){
  if(cell===null)return 'fuori plancia';
  const [x,y]=xy(cell);
  return '('+(x+1)+','+(y+1)+')';
}

function describeDecision(action){
  const {kind,card,cell,edge,label,target}=action;
  const names={move:'Muovi',jump:'Teletrasporto',end:'Caricamento / fine fase',
    ritual:'Rituale',skip:'Passa / continua',discard:'Scarta',take:'Scegli carta avversaria',
    oracle:'Oracolo',cleanse:'Rimuovi Condizione',radiance:'Acceca',destroy:'Distruggi barriera'};
  return [names[kind],cards[card]?.[0]??names[card],typeof label==='string'?label:undefined,
    target?name(target):undefined,cell!==undefined?cellLabel(cell):undefined,
    edge?'confine '+edge.join(','):undefined,action.where].filter(Boolean).join(' · ')||'Scegli casella';
}

function recordComputerDecision(side,unit,action,scored){
  const stages={setup:'Evocazione',spawn:'Rinascita',action:'Azione',charge:'Caricamento',
    reaction:'Reazione',afterDamage:'Reazione al danno',dash:'Scatto',selection:'Scelta',choice:'Effetto',probe:'Sonda Telepatica'};
  const describe=({candidate,value})=>describeDecision(candidate)+' ['+value.toFixed(2)+']';
  const selected=scored.find(item=>item.candidate===action);
  const alternatives=scored.filter(item=>item!==selected).sort((a,b)=>b.value-a.value).slice(0,3);
  analysisLog.push('Round '+round+' · Turno '+(serial+1)+' · Decide '+labels[side]+' · '+stages[phase]+
    ' · '+name(unit)+' '+cellLabel(unit.cell)+' · '+unit.hp+' PF, '+unit.pe+' PE, '+unit.pm+' PM'+
    '\n  Scelta: '+describe(selected)+(alternatives.length?'\n  Alternative: '+alternatives.map(describe).join(' | '):''));
}

const untargetedSpells=new Set([
  'remote','duplicate','ghost','penetrate','frenzy','inversion','karmic','vortex','projection',
  'cleanse','oracle','illumination','radiance','stride','meditate','refill','veil','feral','probe',
]);

function scheduleComputer(){
  clearTimeout(botTimer);
  spectatorControls.hidden=matchMode!=='spectator';
  toggleComputers.textContent=paused?'Avvia':'Pausa';
  const finished=phase==='end'||botStopped;
  document.querySelector('#copy-match-log').hidden=matchMode==='local'||matchMode==='online';
  toggleComputers.disabled=finished;
  stepComputers.disabled=finished||!paused||animatingMovement||presenting;
  if(finished||animatingMovement||presenting||!controllers[viewer]||(matchMode==='spectator'&&paused))return;
  botTimer=setTimeout(computerTurn,Math.max(feedback.wait(),matchMode==='spectator'?Number(computerSpeed.value):320));
}
const actions=[];
const attr=s=>s.replaceAll('&','&amp;').replaceAll('"','&quot;').replaceAll('<','&lt;');
function unavailableReason(u,id){
  const [,cost,type]=cards[id];
  if(type.startsWith('Reazione'))return 'Si usa solo nella relativa finestra di Reazione: il gioco ti proporrà la scelta.';
  if(phase!=='action'||u.side!==viewer||controllers[viewer]||presenting||animatingMovement)return 'Attendi la tua Fase di Azione.';
  if(mode==='jump')return 'Completa prima il teletrasporto evidenziato.';
  if(u.cell===null)return 'Il Simulacro deve prima rinascere.';
  if(!affordable(u,cost))return 'PE insufficienti, anche usando la Riserva Arcana disponibile in questo turno.';
  if(u.played.includes(id))return 'Hai già lanciato questo incantesimo nel turno.';
  if(utilityReaction&&(!type.startsWith('Utilità')||utilityReaction.used||['remote','duplicate'].includes(id)))return 'Blocco Temporale permette un solo incantesimo Utilità compatibile.';
  if(effectiveRange(u,type)==='Vista'&&has(u,'Accecato'))return 'Accecato: non puoi lanciare incantesimi a gittata Vista.';
  if(isAttack(id)){
    if(u.noAttack)return 'Un effetto ti impedisce di attaccare per il resto del turno.';
    if(has(u,'Confuso')&&u.moved)return 'Confuso: hai scelto di muoverti e non puoi attaccare.';
    if(u.attackTargets.length>=u.attackLimit)return 'Hai esaurito gli attacchi disponibili nel turno.';
  }
  const ally=units.find(v=>v.side===u.side&&v!==u);
  if(id==='remote'&&ally.cell===null)return 'L’altro tuo Simulacro deve essere sul Labirinto.';
  if(id==='inversion'&&(teams[u.side].ritual||ally.cell===null))return 'Richiede entrambi i tuoi Simulacri sul Labirinto e nessun punto rituale.';
  if(id==='cleanse'&&!Object.keys(u.conditions).length)return 'Non hai Condizioni da rimuovere.';
  if(id==='illumination'&&!teams[u.side].discard.length)return 'Non hai carte negli scarti.';
  if(!untargetedSpells.has(id)&&!legalCells(id,u).length&&!targets(id).length)return 'Nessun bersaglio o posizione valida dalla tua origine attuale.';
  return '';
}
function conditionInfo(u,c){
  let effect=conditions[c];
  if(c==='Rallentato')effect=u===active()&&!utilityReaction&&u.slowPenalty?
    'Penalità già applicata: −'+u.slowPenalty+' PM all’inizio di questo turno.':
    'Riduce di 2 i PM assegnati all’inizio del suo prossimo turno.';
  const expiry=c==='Maledetto'?'Si rimuove quando è adiacente a un nemico.':
    u===active()&&!utilityReaction&&u.conditions[c]<serial?'Si rimuove al Caricamento di questo turno.':
    'Si rimuove al Caricamento del suo prossimo turno.';
  return effect+' '+expiry;
}
function inspector(){
  const u=units[inspected]??active();
  const list=Object.keys(u.conditions);
  const cube=creations.some(v=>v.id==='cube'&&v.side!==u.side&&v.cell===u.cell);
  return '<section class="unit-inspector" aria-label="Stato del Simulacro"><h3>'+name(u)+'</h3><p>'+u.hp+' / '+maxHp(u)+' PF · '+u.pe+' PE'+(u===active()?' · '+u.pm+' PM':'')+'</p>'+
    (u.cell===null?'<p>'+(phase==='setup'?'Non ancora schierato.':'Caduto · rinasce all’inizio del proprio turno.')+'</p>':'')+
    (list.length?'<ul>'+list.map(c=>'<li><strong>'+c+'</strong><p>'+conditionInfo(u,c)+'</p></li>').join('')+'</ul>':'<p class="muted">Nessuna Condizione.</p>')+
    (cube?'<p><strong>Nel Cubo nemico</strong> · perde 1 PF aggiuntivo quando subisce danni; uscire costa 2 PM.</p>':'')+
    (u===active()&&u.noAttack?'<p>Un effetto impedisce di attaccare per il resto del turno.</p>':'')+'</section>';
}
function unitDetails(u){
  return [name(u),u.hp+' / '+maxHp(u)+' PF · '+u.pe+' PE'+(u===active()?' · '+u.pm+' PM':''),
    ...Object.keys(u.conditions).map(c=>c+'\n'+conditionInfo(u,c)),
    u.cell===null?(phase==='setup'?'Non ancora schierato.':'Caduto: rinasce nel proprio turno.'):'',
    creations.some(v=>v.id==='cube'&&v.side!==u.side&&v.cell===u.cell)?'Cubo nemico: Vulnerabile e costo di uscita 2 PM.':'',
    u===active()&&u.noAttack?'Non può attaccare per il resto del turno.':''].filter(Boolean).join('\n\n');
}
function entryDetails(e){
  return [e.title+' · '+e.status,e.actor+(e.target?' → '+e.target:''),
    ...e.cards.map(c=>c.actor+' · '+cards[c.id][0]+'\n'+cards[c.id][2]+' · '+cards[c.id][1]+' PE\n'+cards[c.id][3]),
    e.changes.length?'Conseguenze effettive\n'+e.changes.join('\n'):'Nessuna variazione registrata.'].join('\n\n');
}
function renderChronicle(){
  const host=document.querySelector('#match-history');host.hidden=false;
  const perspective=matchMode==='online'?onlineSide:matchMode==='solo'?controllers.findIndex(v=>!v):viewer;
  const signature=JSON.stringify([chronicle.turns,perspective,historyLimit,showFullHistory]);
  if(signature===historySignature)return;historySignature=signature;
  const scroll=host.querySelector('.history-list')?.scrollTop??0;
  const enemy=[...chronicle.turns].reverse().find(t=>t.side!==perspective);
  const actionText=e=>'<li><button type="button" class="history-entry" data-detail="'+attr(entryDetails(e))+'"><strong>'+e.title+
    (e.cards.length>1?' + '+e.cards.slice(1).map(c=>cards[c.id][0]).join(', '):'')+'</strong><span>'+e.actor+(e.target?' → '+e.target:'')+
    '</span><small>'+e.status+' · dettagli ↗</small></button></li>';
  const turnText=t=>'<section class="history-turn"><h3>R'+t.round+' · '+t.unit+' · '+(t.complete?'concluso':'in corso')+'</h3>'+
    (t.entries.length?'<ol>'+t.entries.map(actionText).join('')+'</ol>':'<p class="muted">Nessuna azione ancora eseguita.</p>')+'</section>';
  host.innerHTML='<div class="history-heading"><h2>'+(showFullHistory?'Cronologia':'Ultimo turno avversario')+'</h2>'+
    '<button type="button" id="history-mode">'+(showFullHistory?'Ultimo turno':'Tutti i turni')+'</button></div>'+
    '<div class="history-list" tabindex="0" aria-label="Azioni del turno">'+
    (showFullHistory?[...chronicle.turns].reverse().slice(0,historyLimit).map(turnText).join(''):
      enemy?turnText(enemy):'<p class="muted">L’avversario non ha ancora svolto un turno.</p>')+
    (showFullHistory&&chronicle.turns.length>historyLimit?'<button type="button" id="older-history">Mostra precedenti</button>':'')+'</div>'+
    '<p class="history-hint">Sosta, focus o clic su una voce per i dettagli.</p>';
  const list=host.querySelector('.history-list');if(list)list.scrollTop=scroll;
}
function renderAnnouncement(){
  const host=document.querySelector('#action-caption'),entry=chronicle.current;
  const reaction=reactionInfo();
  if(reaction){
    const own=matchMode!=='online'||onlineSide===viewer;
    host.innerHTML='<strong>'+(own?'Puoi reagire':'In attesa di '+labels[viewer])+'</strong><span>'+attr(own?reaction.reason:reaction.publicReason??reaction.reason)+'</span>';
    return;
  }
  if(!entry){host.innerHTML='<strong>'+(phase==='setup'?'Schieramento':'Inizio turno')+'</strong><span>Nome, autore, bersaglio ed esito dell’ultima azione compariranno qui.</span>';return;}
  const state=presenting||pending?'Lancio in attesa di risoluzione':entry.status;
  host.innerHTML='<button type="button" class="announcement-title" data-detail="'+attr(entryDetails(entry))+'">'+entry.title+'</button>'+
    '<span>'+entry.actor+(entry.target?' → '+entry.target:'')+' · <strong>'+state+'</strong>'+
    (entry.cards.length>1?' · '+entry.cards.slice(1).map(c=>cards[c.id][0]).join(', '):'')+'</span>';
}
function button(label,fn,enabled=true,cls='',tip=''){
  const i=actions.push(fn)-1;
  const unavailable=(cls.startsWith('cell ')||cls.startsWith('card '))?(cls.startsWith('card ')?'aria-disabled="true"':'aria-disabled="true" tabindex="-1"'):'disabled';
  return '<button type="button" data-action="'+i+'" class="'+cls+'" '+(cls.startsWith('card ')?'data-detail="'+attr(tip)+'"':'title="'+attr(tip)+'"')+' '+(enabled?'':unavailable)+'>'+label+'</button>';
}
function line(e,cls,fn,tip){
  const [x,y,a,b]=e;
  const vert=x===a;
  const style='left:'+(x/13*100)+'%;top:'+(y/6*100)+'%;width:'+((vert?b-y:a-x)/13*100)+'%;transform:rotate('+(vert?90:0)+'deg)';
  if(!fn)return '<span class="'+cls+(vert?' vertical':'')+'" style="'+style+'" title="'+attr(tip)+'"></span>';
  const i=actions.push(fn)-1;
  return '<button title="'+attr(tip)+'" aria-label="'+attr(tip)+'" class="'+cls+'" style="'+style+'" data-action="'+i+'"></button>';
}
function render(){
  if(!animatingMovement&&origin?.consumed&&phase==='action'&&mode!=='jump')origin=null;
  if(!animatingMovement&&utilityReaction?.used&&(phase==='action'&&mode==='move'||phase==='end')){finishTimeBlock();return;}
  if(offerPreparedTimeBlock())return;
  chronicle.observe(publicState());
  if(chronicle.current&&chronicle.current.status!=='Annullata')chronicle.current.status=
    pending?'In attesa di risoluzione':animatingMovement?'Movimento in corso':
    ['reaction','afterDamage','dash','selection','choice','probe'].includes(phase)||mode==='jump'?'Scelta in corso':'Risolta';
  actions.length=0;
  const u=active(),t=teams[u.side];
  const automated=Boolean(controllers[viewer]);
  const visible=viewer!==null&&!automated&&!animatingMovement&&!presenting&&(matchMode!=='online'||viewer===onlineSide);
  const valid=visible?legalCells():[];
  const movement=phase==='action'&&mode==='move'&&valid.length?walk(u):null;
  const title={setup:'Evocazione · '+name(units[setup[0]]??u),spawn:'Rinascita · '+name(u),action:name(u),charge:'Caricamento · '+name(u),reaction:'Reazione · '+labels[pending?.defender.side],probe:'Sonda Telepatica',end:'Vince l’Arcimago '+labels[winner]}[phase];
  const prompt={setup:'Scegli una casella della tua Zona Evocazione.',spawn:'Scegli una delle caselle libere evidenziate.',action:{move:'Scegli una destinazione o un incantesimo.',arc:'Scegli un nemico a Tocco.',cut:'Scegli un nemico a Tocco.',wall:'Scegli un confine evidenziato.',jump:'Scegli la destinazione del teletrasporto.',dissolve:'Scegli una Creazione visibile.'}[mode]??'Scegli un Simulacro evidenziato.',charge:t.hand.length>6?'Scarta '+(t.hand.length-6)+' per tornare a sei carte. Il turno passerà automaticamente.':'Scarta una carta per ricaricare e concludere il turno, oppure ricarica senza scartare.',reaction:'Puoi annullare l’incantesimo con Veto Arcano.',probe:'Scegli una carta da scartare dalla mano avversaria.',end:'Due punti uccisione e un punto rituale.'}[phase];
  let board=cells.map(c=>{
    const token=at(c);
    const object=creations.find(v=>v.cell===c);
    const z=zones[0].includes(c)?'redzone':zones[1].includes(c)?'bluezone':ritual.includes(c)?'ritual':'';
    const [x,y]=xy(c),legal=valid.includes(c);
    const cost=legal?movement?.get(c).cost:null;
    const tip=[
      token&&[name(token)+' · '+token.hp+' PF · '+token.pe+' PE. Attraversare un nemico costa 2 PM. La pedina non blocca la vista.',
        ...Object.keys(token.conditions).map(k=>k+' · '+conditions[k])].join('\n'),
      object&&cards[object.id][0]+' · '+labels[object.side]+'. '+cards[object.id][3],
      z==='ritual'&&'Zona Rituale. Inizia qui la Fase di Azione senza nemici adiacenti per poter compiere il Rituale.',
      (z==='redzone'||z==='bluezone')&&'Zona Evocazione '+(z==='redzone'?'Rossa':'Blu')+'. Serve per schieramento e rinascita. Nel primo Round protegge dagli Attacchi i propri Simulacri.',
    ].filter(Boolean).join('\n');
    return button((object?'<span class="creation '+object.id+(object.side?' blue':'')+'" aria-hidden="true"></span>':'')+
      (token?'<span class="token '+(token.type==='Terra'?'earth ':'lightning ')+(token.side?'blue ':'')+(token===u&&phase!=='setup'?'active':'')+(object?' on-creation':'')+'" aria-hidden="true"></span><span class="condition-badges">'+Object.keys(token.conditions).map(k=>'<span title="'+attr(k+' · '+conditions[k])+'">'+({Accecato:'◉',Vulnerabile:'!',Pietrificato:'◆',Rallentato:'⌛',Invisibile:'◌',Confuso:'?',Maledetto:'☠'}[k])+'<span class="sr">'+k+'</span></span>').join('')+'</span>':object?'':cost??'<span class="sr">Casella '+(x+1)+', '+(y+1)+'</span>'),
      ()=>selectCell(c),legal,'cell '+z+(legal?' legal':''),tip);
  }).join('');
  board+=walls.map(e=>line(e,'wall',null,'Muro. Blocca il movimento e la linea di vista, anche sulla punta.')).join('');
  barriers.forEach((e,i)=>{if(e)board+=line(e,'edge barrier force '+(i?'blue':''),null,'Barriera di Forza · '+labels[i]+'. '+cards.wall[3]);});
  creations.filter(v=>v.edge).forEach(v=>{board+=line(v.edge,'edge barrier '+v.id+' '+(v.side?'blue':''),null,cards[v.id][0]+' · '+labels[v.side]+'. '+cards[v.id][3]);});
  if(visible)board+=targets().map(e=>line(e,'edge target',()=>selectCreation({edge:e}),cards[mode][0])).join('');
  let controls='',hand='';
  if(visible&&phase==='action'&&mode!=='jump'&&!utilityReaction&&!origin?.required){
    controls=button('Muovi',()=>pick('move'),true,mode==='move'?'selected':'')
      +button('Colpo Arcano',()=>pick('arc'),canAttack(u)&&!u.played.includes('arc'),mode==='arc'?'selected':'')
      +button('Rituale',ritualAction,ritualReady&&canRitual())
      +button('Caricamento',charge);
  }
  if(visible&&phase==='action'&&utilityReaction&&!utilityReaction.used)controls=button('Termina Reazione',finishTimeBlock);
  if(visible&&phase==='action'&&origin?.required&&!origin.consumed)controls=button('Rinuncia al secondo incantesimo',()=>{origin=null;resume();});
  if(visible&&phase==='charge'&&t.hand.length<=6)controls=button('Ricarica senza scartare',advance);
  if(visible&&phase==='reaction')controls=button('Veto Arcano · '+reactionCost(pending.defender,'veto'),()=>resolve(true),canReact(pending.defender,'veto'))+button(declineReaction(),()=>resolve(false));
  if(visible&&phase==='afterDamage')controls=button('Scatto Fulmineo · '+reactionCost(choice.unit,'dash'),reactDash,canReact(choice.unit,'dash'))+button(declineReaction(),finishDash);
  if(visible&&phase==='dash')controls=button('Resta qui',finishDash);
  if(visible&&phase==='selection')controls=choice.options.map(([label,fn])=>button(label,fn)).join('');
  if(visible&&phase==='choice'){
    controls=choice.options.map(option=>{
      if(choice.id==='oracle')return '<div class="draw-choice"><strong>'+cards[t.hand[option]][0]+'</strong><span>'+['cima','fondo'].map(where=>button('Rimetti in '+where,()=>cardChoice(option,where))).join('')+'</span></div>';
      const label=choice.id==='illumination'?cards[option][0]:choice.id==='radiance'?name(option):option;
      return button(label,()=>cardChoice(option));
    }).join('');
    if(!choice.options.length||choice.id==='radiance')controls+=button('Termina scelta',finishChoice);
  }
  const interactiveHand=visible&&['action','charge','probe'].includes(phase);
  const humanSide=controllers.findIndex(level=>!level);
  const showOwnHand=(matchMode==='solo'||matchMode==='online')&&phase!=='end';
  const handSide=interactiveHand?(phase==='probe'?1-u.side:u.side):showOwnHand?(matchMode==='online'?onlineSide:humanSide):null;
  if(handSide!==null){
    const side=handSide;
    hand=orderedHand(teams[side].hand).map(({id,i,label,cost,type,range,description},position,entries)=>{
      const reason=unavailableReason(u,id);
      const playable=interactiveHand&&phase==='action'&&mode!=='jump'&&canPlay(u,id)&&!reason;
      const previous=entries[position-1];
      const boundary=previous&&(previous.type!==type||previous.range!==range)?' group-start':'';
      const content='<span class="card-type">'+type+'</span><strong>'+label+'</strong><small>'+cost+' PE · '+range+'</small>';
      const readyReaction=side===viewer&&reactionInfo()?.cards.includes(id);
      const appearance='card '+({Attacco:'attack',Reazione:'reaction',Utilità:'utility'}[type]??'')+' '+(mode===id?'selected':'')+boundary+(readyReaction?' reaction-available':'');
      const tooltip=label+'\n'+type+' · '+range+' · '+cost+' PE\n'+description+
        (phase==='action'?'\n\n'+(reason?'Indisponibile: '+reason:'Disponibile. Seleziona la carta, poi scegli tra le posizioni evidenziate se richiesto.'):'');
      if(!interactiveHand)return button(content,()=>{},false,appearance,tooltip);
      if(phase==='charge'){
        return '<div class="discard-card">'+button(content,()=>{},true,appearance,tooltip)+
          button('Scarta',()=>discardForCharge(side,i),true,'discard-button','Scarta '+label)+'</div>';
      }
      return button(content,()=>{
        if(phase==='probe')discardFromProbe(side,i);
        else pick(id);
      },playable||phase!=='action',appearance,tooltip)+
      (phase==='action'&&mode!=='jump'&&canDestroy(u,id)?button('Scarta per distruggere',()=>destroy(i)):'');
    }).join('');
    if(visible&&phase==='probe'&&!hand)controls=button('Continua',()=>{phase='action';render();});
  }
  const turnBar=document.querySelector('#turn');
  turnBar.className=viewer?'turn-blue':'turn-red';
  const choiceTitle=phase==='choice'?cards[choice.id][0]:phase==='afterDamage'||phase==='dash'?'Scatto Fulmineo · '+name(choice.unit):phase==='selection'?'Tocca a '+labels[viewer]:null;
  const publicTitle=phase==='setup'?'Evocazione':phase==='spawn'?'Rinascita':name(u);
  const turnUnit=utilityReaction?units[utilityReaction.order[utilityReaction.index]]:u;
  const reaction=reactionInfo();
  turnBar.textContent=phase==='end'?'Vince l’Arcimago '+labels[winner]:
    'Round '+round+' · Turno: '+(phase==='setup'?'Evocazione':name(turnUnit))+(reaction||utilityReaction?' · Reazione: ':' · Decide: ')+labels[viewer]+(automated?' (computer)':'');
  const instruction=presenting?'Lancio in corso · '+cards[pending.id][0]+'.'
    :animatingMovement?'Movimento in corso.'
    :botStopped?'Partita interrotta. Il computer non ha una scelta disponibile.'
    :automated&&phase!=='end'?'Decisione al computer '+labels[viewer]+'.'
    :reaction?(matchMode==='online'&&viewer!==onlineSide?'In attesa della reazione di '+labels[viewer]+'.':'Scegli una reazione oppure «Non reagire».')
    :matchMode==='online'&&viewer!==onlineSide?'Attendi la decisione di '+labels[viewer]+'.':choice?.text??prompt??'Completa la scelta o termina il Turno.';
  const historyHost=document.querySelector('#match-history'),announcementHost=document.querySelector('#action-caption'),routeHost=document.querySelector('#route-caption');
  root.innerHTML='<div class="layout'+(reaction?' reaction-window':'')+'"><section class="play-area"><div id="announcement-slot"'+(reaction?' class="reaction-announcement" role="status"':'')+'></div><div class="board-stage"><div class="board">'+board+'</div></div>'+
    '<section class="decision-dock"><div class="decision-row"><p class="instruction">'+instruction+'</p><div class="actions">'+controls+'</div><span id="route-slot"></span></div>'+
    '<section class="hand'+(reaction&&viewer===onlineSide?' reaction-hand':'')+'">'+timeControl()+'<h3>'+(hand?(interactiveHand&&phase==='probe'?'Mano avversaria':'Mano · '+labels[handSide]):'Attendi la decisione indicata in alto')+'</h3><div class="cards">'+hand+'</div></section></section></section><aside class="panel"><section class="roster">'+
    teams.map((v,i)=>'<div class="team '+(i?'blue':'')+'"><strong>'+labels[i]+'</strong><div class="stats">'+v.kills+' uccisioni · '+v.ritual+' rituali · '+v.reserve+' riserva</div>'+units.filter(k=>k.side===i).map(k=>'<button type="button" data-inspect="'+k.id+'" data-detail="'+attr(unitDetails(k))+'" aria-label="Esamina '+name(k)+'" class="unit-summary '+(k===u?'current-unit':'')+'"><strong>'+k.type+'</strong> · '+k.hp+' PF · '+k.pe+' PE'+(k===u?' · '+k.pm+' PM':'')+'<small>'+ (Object.keys(k.conditions).join(' · ')||'Nessuna Condizione')+'</small></button>').join('')+'</div>').join('')+
    '</section><div id="history-slot"></div></aside></div>';
  document.querySelector('#announcement-slot').append?.(announcementHost);
  document.querySelector('#history-slot').append?.(historyHost);
  document.querySelector('#route-slot').append?.(routeHost);
  previewCard();
  if(matchMode!=='online')feedback.update({units,teams,creations,phase,winner,moving:animatingMovement,active:u.id,labels,viewerLabel:labels[viewer],choiceText:choice?.text,
    pending:pending?{from:spellOrigin(u),to:pending.defender.cell,label:cards[pending.id][0]+' → '+name(pending.defender)}:null,
    events:visualEvents});
  visualEvents=[];
  renderAnnouncement();renderChronicle();
  scheduleComputer();
}
function previewCard(card=root.querySelector('.card.selected')){
  const detail=root.querySelector('#card-detail');
  if(detail)detail.textContent=card?.dataset.detail||card?.title||'';
}
root.addEventListener('pointerover',event=>{
  const card=event.target.closest('.card');
  if(card)previewCard(card);
  const cell=event.target.closest('.cell.legal');
  if(matchMode==='online')return;
  if(cell&&phase==='action'&&mode==='move'&&!animatingMovement&&!presenting){
    const list=[...root.querySelectorAll('.cell')],destination=list.indexOf(cell);
    const path=walk(active()).get(destination);
    for(const node of list)node.classList.remove('route-preview');
    if(path){
      path.route.forEach(c=>list[c].classList.add('route-preview'));
      document.querySelector('#route-caption').textContent='Percorso · '+path.cost+' PM';
    }
  }
});
root.addEventListener('pointerout',event=>{
  const card=event.target.closest('.card');
  if(card&&!card.contains(event.relatedTarget))previewCard();
  if(event.target.closest('.cell.legal')){
    root.querySelectorAll('.route-preview').forEach(node=>node.classList.remove('route-preview'));
    document.querySelector('#route-caption').textContent='';
  }
});
root.addEventListener('focusin',event=>{
  if(event.target.matches('.card'))previewCard(event.target);
});
root.addEventListener('focusout',event=>{
  if(event.target.matches('.card'))previewCard();
});
root.addEventListener('click',event=>{
  if(event.target.closest('[data-time-open]')){
    document.querySelector('#online-bar').open=true;document.querySelector('#time-stop').focus();return;
  }
  const unit=event.target.closest('[data-inspect]');
  if(unit){inspected=Number(unit.dataset.inspect);return;}
  const b=event.target.closest('button[data-action]');
  if(b?.matches('.card[aria-disabled="true"]')){previewCard(b);return;}
  if(b?.matches('.discard-card .card')){previewCard(b);return;}
  if(b&&!b.disabled&&b.getAttribute('aria-disabled')!=='true'){
    if(matchMode==='online'){onlineDriver?.act(Number(b.dataset.action));return;}
    actions[Number(b.dataset.action)]?.();
  }
});
document.querySelector('#reset').onclick=()=>{if(matchMode!=='online'&&confirm('Iniziare una nuova partita?'))start();};
const titleScreen=document.querySelector('#title-screen');
const matchHeader=document.querySelector('#match-header');
const copyMatchLog=document.querySelector('#copy-match-log');
const logExport=document.querySelector('#match-log-export');
copyMatchLog.onclick=async()=>{
  const scores=teams.map((team,side)=>labels[side]+': '+team.kills+' uccisioni, '+team.ritual+' rituali');
  const result=phase==='end'?'Vince '+labels[winner]:botStopped?'Partita interrotta':'Partita in corso';
  const report=[...analysisLog,'','Round '+round+' · '+result+' · '+scores.join(' | ')].join('\n');
  try{
    await navigator.clipboard.writeText(report);
    copyMatchLog.textContent='Registro copiato';
  }catch{
    logExport.hidden=false;
    logExport.value=report;
    logExport.focus();
    logExport.select();
  }
};
const startSolo=document.querySelector('#start-solo');
const startSpectator=document.querySelector('#start-spectator');
const setupForm=document.querySelector('#computer-setup');
const titleMenu=document.querySelector('.title-menu');
let selectedMatch='local';
function openMatch(type,players){
  document.body?.classList.add('match-active');
  matchMode=type;
  if(type!=='online'){gameRandom=()=>Math.random();onlineDriver?.leave();}
  controllers=players;
  titleScreen.hidden=true;
  matchHeader.hidden=false;
  root.hidden=false;
  start();
  document.querySelector('#turn').focus();
}
function showSetup(type){
  selectedMatch=type;
  const solo=type==='solo';
  titleMenu.hidden=true;
  setupForm.hidden=false;
  document.querySelector('#computer-mode').textContent=solo?'Giocatore vs Computer':'Computer vs Computer';
  document.querySelector('#side-setting').hidden=!solo;
  document.querySelector('#blue-setting').hidden=solo;
  document.querySelector('#level-label').textContent=solo?'Difficoltà':'Difficoltà del Rosso';
  document.querySelector(solo?'#human-side':'#computer-level').focus();
}
function closeSetup(){
  setupForm.hidden=true;
  titleMenu.hidden=false;
}
startSolo.onclick=()=>showSetup('solo');
startSpectator.onclick=()=>showSetup('spectator');
document.querySelector('#cancel-setup').onclick=()=>{
  closeSetup();
  (selectedMatch==='solo'?startSolo:startSpectator).focus();
};
setupForm.onsubmit=event=>{
  event.preventDefault();
  const level=document.querySelector('#computer-level').value;
  const players=[level,document.querySelector('#blue-level').value];
  if(selectedMatch==='solo'){
    const human=Number(document.querySelector('#human-side').value);
    players[human]=null;
    players[1-human]=level;
  }
  closeSetup();
  openMatch(selectedMatch,players);
};
toggleComputers.onclick=()=>{paused=!paused;scheduleComputer();};
stepComputers.onclick=()=>{if(paused&&matchMode==='spectator')computerTurn();};
computerSpeed.onchange=scheduleComputer;
document.querySelector('#main-menu').onclick=()=>{
  if(matchMode==='online'){onlineDriver?.leave();location.href=location.pathname;return;}
  if(phase!=='end'&&!confirm('Tornare al menu principale? La partita in corso terminerà.'))return;
  clearTimeout(botTimer);
  cancelMovementAnimation();
  document.body?.classList.remove('match-active');detailReader.close();
  feedback.reset();document.querySelector('#action-caption').textContent='';
  document.querySelector('#match-history').hidden=true;document.querySelector('#route-caption').textContent='';
  matchHeader.hidden=true;
  logExport.hidden=true;
  root.hidden=true;
  document.body?.append(document.querySelector('#match-history'),document.querySelector('#action-caption'),document.querySelector('#route-caption'));
  root.replaceChildren();
  titleScreen.hidden=false;
  (matchMode==='spectator'?startSpectator:startSolo).focus();
};

const reducedMotion=document.querySelector('#reduce-motion');
document.querySelector('#time-stop').onchange=event=>{
  const setting=timeSettings.indexOf(event.target.value);
  if(setting>=0)onlineDriver?.act(9997+setting);
};
reducedMotion.checked=typeof matchMedia==='function'&&matchMedia('(prefers-reduced-motion: reduce)').matches;
document.querySelector('#match-history').addEventListener('click',event=>{
  if(event.target.id==='history-mode'){showFullHistory=!showFullHistory;renderChronicle();}
  if(event.target.id==='older-history'){historyLimit+=12;renderChronicle();}
});
if(typeof document.addEventListener==='function')detailReader=setupDetails();

// The host retains the rules and private state. Only recipient-specific HTML leaves it.
if(typeof document.createElement==='function')import('./online.mjs?v=5').then(({setupOnline})=>{
  onlineDriver=setupOnline({
    waiting(){
      titleScreen.hidden=true;matchHeader.hidden=false;root.hidden=true;
      document.body.classList.add('match-active');
      document.querySelector('#turn').textContent='Ripresa della partita online…';
      document.querySelector('#reset').hidden=true;copyMatchLog.hidden=true;
    },
    start(seed,legacy=false){legacyReactions=legacy;seedOnline(seed);onlineSide=0;openMatch('online',[null,null]);},
    modernize:modernizeReactions,
    view(side){
      onlineSide=side;historySignature='';showFullHistory=true;historyLimit=100000;render();
      const view={html:root.innerHTML,turn:document.querySelector('#turn').textContent,side,decider:viewer,timeControl:timeControlState(side)};
      return view;
    },
    apply(side,id){
      if(!legacyReactions&&Number.isInteger(id)&&id>=9997&&id<=9999){timeStopSetting(side,timeSettings[id-9997]);return;}
      onlineSide=side;render();
      if(side!==viewer)throw new Error('Attendi la tua decisione.');
      const b=root.querySelector('button[data-action="'+id+'"]');
      if(!Number.isInteger(id)||!b||b.disabled||b.getAttribute('aria-disabled')==='true'||b.matches('.discard-card .card'))throw new Error('Mossa non disponibile.');
      actions[id]();
    },
    guest(view){
      matchMode='online';onlineSide=1;titleScreen.hidden=true;matchHeader.hidden=false;root.hidden=false;
      document.body.classList.add('match-active');detailReader.close();
      for(const id of ['match-history','action-caption','route-caption'])document.querySelector('#'+id)?.remove();
      const template=document.createElement('template');template.innerHTML=view.html;
      const tags=new Set(['DIV','SECTION','ASIDE','SPAN','BUTTON','P','H2','H3','STRONG','SMALL','OL','LI']);
      for(const node of template.content.querySelectorAll('*')){
        if(!tags.has(node.tagName)){node.remove();continue;}
        for(const a of [...node.attributes])if(!['class','id','title','tabindex','disabled','type','data-action','data-detail','data-inspect','role'].includes(a.name)&&!a.name.startsWith('aria-')&&!(a.name==='style'&&/^(left:[\d.]+%;top:[\d.]+%;width:[\d.]+%;transform:rotate\((0|90)deg\))$/.test(a.value)))node.removeAttribute(a.name);
      }
      root.replaceChildren(template.content);document.querySelector('#turn').textContent=view.turn;
      updateTimeControl(view.timeControl);
      document.querySelector('#reset').hidden=true;copyMatchLog.hidden=true;
    },
    lock(){root.inert=true;document.querySelector('#time-stop').disabled=true;},
    unlock(){root.inert=false;document.querySelector('#time-stop').disabled=!timeControlAvailable&&document.querySelector('#time-stop').value==='off';},
  });
}).catch(error=>console.error('Online:',error));
