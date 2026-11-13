import {cells,walls,zones,ritual,xy,center,neighbors,edge,mid,blocked,lineOfSight,wallBetween,paths,respawn} from './engine.mjs';

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
const conditions={
  Rallentato:'Ottiene 2 PM in meno all’inizio del suo Turno.',
  Invisibile:'Non può essere bersaglio di incantesimi con gittata Vista.',
  Confuso:'Nel suo Turno può muoversi oppure attaccare.',
  Maledetto:'Perde 1 PF al Caricamento. La Condizione si rimuove quando è adiacente a un nemico.',
};
const afflictions={gravity:'Rallentato',frost:'Rallentato',vertigo:'Confuso',curse:'Maledetto'};
const pool=['cut','wall','probe','veto','cut','veto'];
const reserveDeck=['stride','gravity','meditate','frost','veil','curse','refill','vertigo','feral','dissolve'];
function shuffle(deck){
  for(let i=deck.length-1;i>0;i--){
    const j=Math.floor(Math.random()*(i+1));
    [deck[i],deck[j]]=[deck[j],deck[i]];
  }
  return deck;
}
const labels=['Rosso','Blu'];
const root=document.querySelector('#game');
let units,teams,order,index,round,setup,viewer,phase,mode,barriers,log,winner,ritualReady,pending;
const active=()=>units[order[index]];
const at=c=>units.find(u=>u.cell===c);
const name=u=>labels[u.side]+' · '+u.type;
const note=t=>log.unshift(t);
const same=(a,b)=>a.every((v,i)=>v===b[i]);

function start(){
  units=[0,1,2,3].map(id=>({id,side:id%2,type:id<2?'Terra':'Fulmine',hp:id<2?8:6,pe:4,pm:0,cell:null,conditions:{}}));
  teams=[0,1].map(()=>{
    const deck=shuffle([...pool,...pool,...reserveDeck,...reserveDeck.slice(0,8)]);
    return {hand:deck.splice(0,6),deck,discard:[],reserve:4,kills:0,ritual:0,spent:0,reaction:false};
  });
  const first=Math.random()<.5?0:1;
  order=[first,1-first,first+2,3-first];
  index=0; round=1; setup=[first,first+2,1-first,3-first]; viewer=null;
  phase='setup'; mode='move'; barriers=[null,null]; log=[]; winner=null; pending=null;
  show(first);
}
function show(side){
  viewer=side;
  render();
}
function obstacles(side){return barriers[1-side]?[...walls,barriers[1-side]]:walls;}
function sight(c,target,side){return lineOfSight(center(c),target,obstacles(side));}
function edgeSight(u,e){
  const [x,y]=xy(u.cell);
  return [[0,.5],[1,.5],[.5,0],[.5,1]].some(([dx,dy])=>
    lineOfSight([x+dx,y+dy],mid(e),[...walls,...barriers.filter((b,i)=>b&&b!==e&&i!==u.side)]));
}
const has=(u,condition)=>Object.hasOwn(u.conditions,condition);
const turn=()=>4*(round-1)+index;
function clearCurses(){
  for(const u of units){
    if(u.cell!==null&&has(u,'Maledetto')&&neighbors(u.cell).some(c=>at(c)?.side===1-u.side))delete u.conditions.Maledetto;
  }
}
function walk(u){
  return paths([u.cell],u.pm,(a,b)=>{
    if(blocked([...center(a),...center(b)],obstacles(u.side)))return Infinity;
    return at(b)?.side===1-u.side?2:1;
  });
}
function legalCells(){
  const u=active();
  if(phase==='setup')return zones[units[setup[0]].side].filter(c=>!at(c));
  if(phase==='spawn')return respawn(zones[u.side],c=>!at(c));
  if(phase!=='action')return [];
  if(mode==='move')return has(u,'Confuso')&&u.attacked?[]:[...walk(u).keys()].filter(c=>!at(c));
  if(mode==='jump')return cells.filter(c=>!at(c)&&sight(u.cell,center(c),u.side));
  if(mode==='arc'||mode==='cut')return neighbors(u.cell).filter(c=>at(c)?.side===1-u.side
    && !(round===1&&zones[1-u.side].includes(c))&&sight(u.cell,center(c),u.side));
  if(afflictions[mode])return units.filter(v=>v.cell!==null&&v!==u&&
    (['frost','vertigo'].includes(mode)||(!has(v,'Invisibile')&&sight(u.cell,center(v.cell),u.side)))).map(v=>v.cell);
  return [];
}
function targets(){
  const u=active();
  if(phase!=='action')return [];
  if(mode==='dissolve')return barriers.filter(e=>e&&edgeSight(u,e));
  if(mode!=='wall')return [];
  return cells.flatMap(c=>neighbors(c).filter(n=>n>c&&!wallBetween(c,n)).map(n=>edge(c,n)))
    .filter(e=>!barriers.some(b=>b&&same(b,e))&&edgeSight(u,e));
}
function begin(){
  const u=active();
  teams.forEach(t=>{t.spent=0;t.reaction=false;});
  mode='move';u.attacked=false;u.played=[];u.pm=u.type==='Terra'?4:5;
  u.moved=false;u.slowPenalty=has(u,'Rallentato')?2:0;u.pm-=u.slowPenalty;
  phase=u.cell===null?'spawn':'action';
  ritualReady=phase==='action'&&canRitual();
  show(u.side);
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
  if(t.deck.length)t.hand.push(t.deck.shift());
}
function discard(side,i){const t=teams[side];t.discard.push(...t.hand.splice(i,1));}
function affordable(u,cost){const t=teams[u.side];return cost<=u.pe+Math.min(t.reserve,2-t.spent);}
function pay(u,cost){
  const reserve=Math.max(0,cost-u.pe);
  const t=teams[u.side];
  if(!affordable(u,cost))return false;
  if(reserve&&!window.confirm('Usare '+reserve+' dalla Riserva Arcana per coprire i PE mancanti?'))return false;
  u.pe-=cost-reserve;t.reserve-=reserve;t.spent+=reserve;
  return true;
}
function cast(id){
  const u=active();
  if(!pay(u,cards[id][1]))return false;
  if(id!=='arc')discard(u.side,teams[u.side].hand.indexOf(id));
  u.played.push(id);
  ritualReady=false;
  note(labels[u.side]+' lancia '+cards[id][0]+'.');
  return true;
}
function victory(side){
  if(teams[side].kills>=2&&teams[side].ritual>=1){winner=side;phase='end';mode='move';return true;}
  return false;
}
function damage(u,amount){
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
  if(id==='arc'||id==='cut')u.attacked=true;
  pending={id,defender};
  const t=teams[defender.side];
  if(t.hand.includes('veto')&&!t.reaction&&affordable(defender,3)){
    phase='reaction';mode='move';show(defender.side);
  }else resolve(false);
}
function resolve(veto){
  const {id,defender}=pending,u=active();
  if(veto){
    if(!pay(defender,3))return;
    discard(defender.side,teams[defender.side].hand.indexOf('veto'));
    teams[defender.side].reaction=true;
    note(labels[defender.side]+' annulla l’incantesimo con Veto Arcano.');
  }
  phase='action';pending=null;mode='move';
  if(veto||id==='arc'||id==='cut')damage(defender,veto||id==='arc'?1:2);
  else if(!has(defender,afflictions[id]))defender.conditions[afflictions[id]]=turn();
  clearCurses();
  if(phase!=='end'){
    if(veto){u.pe=Math.min(4,u.pe+2);draw(u.side);}
    if(!veto&&id==='cut'){mode='jump';if(!legalCells().length)mode='move';}
  }
  show(u.side);
}
function selectCell(c){
  if(!legalCells().includes(c))return;
  const u=active();
  if(phase==='setup'){
    const placed=units[setup.shift()];placed.cell=c;
    if(setup.length)show(units[setup[0]].side);else begin();
    return;
  }
  if(phase==='spawn'){
    u.cell=c;u.hp=u.type==='Terra'?8:6;u.pe=4;phase='action';ritualReady=canRitual();
  }else if(mode==='arc'||mode==='cut'||afflictions[mode]){targetUnit(c);return;}
  else if(mode==='jump'){u.cell=c;mode='move';}
  else{
    const route=walk(u).get(c);
    u.cell=c;u.pm-=route.cost;ritualReady=false;u.moved=true;
    note(name(u)+' si muove · '+route.cost+' PM.');
  }
  clearCurses();render();
}
function charge(){
  phase='charge';mode='move';render();
}
function advance(){
  const u=active(),t=teams[u.side];
  if(t.hand.length>6)return;
  while(t.hand.length<6&&(t.deck.length||t.discard.length))draw(u.side);
  u.pe=4;u.pm=0;
  clearCurses();
  if(has(u,'Maledetto')&&u.conditions.Maledetto<turn()){
    damage(u,1);
    if(phase==='end'){render();return;}
  }
  for(const [condition,applied] of Object.entries(u.conditions)){
    if(condition!=='Maledetto'&&applied<turn())delete u.conditions[condition];
  }
  index=(index+1)%4;if(index===0)round++;
  begin();
}
function ritualAction(){
  const u=active(),t=teams[u.side];
  t.ritual++;t.reserve=Math.min(4,t.reserve+2);
  note(labels[u.side]+' completa il Rituale.');
  if(!victory(u.side))charge();else render();
}
function pick(id){
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
  mode=mode===id?'move':id;render();
}
function destroy(i){
  const u=active(),t=teams[u.side],e=barriers[1-u.side];
  if(!e||!pay(u,2))return;
  discard(u.side,i);barriers[1-u.side]=null;ritualReady=false;
  note('Barriera di Forza distrutta.');render();
}
const actions=[];
const attr=s=>s.replaceAll('&','&amp;').replaceAll('"','&quot;').replaceAll('<','&lt;');
function button(label,fn,enabled=true,cls='',tip=''){
  const i=actions.push(fn)-1;
  const unavailable=(cls.startsWith('cell ')||cls.startsWith('card '))?(cls.startsWith('card ')?'aria-disabled="true"':'aria-disabled="true" tabindex="-1"'):'disabled';
  return '<button type="button" data-action="'+i+'" class="'+cls+'" title="'+attr(tip)+'" '+(enabled?'':unavailable)+'>'+label+'</button>';
}
function line(e,cls,fn,tip){
  const [x,y,a,b]=e;
  const vert=x===a;
  const style='left:'+(x/13*100)+'%;top:'+(y/6*100)+'%;width:'+((vert?b-y:a-x)/13*100)+'%;transform:rotate('+(vert?90:0)+'deg)';
  if(!fn)return '<span class="'+cls+'" style="'+style+'" title="'+attr(tip)+'"></span>';
  const i=actions.push(fn)-1;
  return '<button title="'+attr(tip)+'" aria-label="'+attr(tip)+'" class="'+cls+'" style="'+style+'" data-action="'+i+'"></button>';
}
function render(){
  actions.length=0;
  const u=active(),t=teams[u.side];
  const visible=viewer!==null;
  const valid=visible?legalCells():[];
  const movement=phase==='action'&&mode==='move'&&valid.length?walk(u):null;
  const title={setup:'Evocazione · '+name(units[setup[0]]??u),spawn:'Rinascita · '+name(u),action:name(u),charge:'Caricamento · '+name(u),reaction:'Reazione · '+labels[pending?.defender.side],probe:'Sonda Telepatica',end:'Vince l’Arcimago '+labels[winner]}[phase];
  const prompt={setup:'Scegli una casella della tua Zona Evocazione.',spawn:'Scegli una delle caselle libere evidenziate.',action:{move:'Scegli una destinazione o un incantesimo.',arc:'Scegli un nemico a Tocco.',cut:'Scegli un nemico a Tocco.',wall:'Scegli un confine evidenziato.',jump:'Scegli la destinazione del teletrasporto.',dissolve:'Scegli una Creazione visibile.'}[mode]??'Scegli un Simulacro evidenziato.',charge:'Scarta una carta se vuoi, poi ricarica.',reaction:'Puoi annullare l’incantesimo con Veto Arcano.',probe:'Scegli una carta da scartare dalla mano avversaria.',end:'Due punti uccisione e un punto rituale.'}[phase];
  let board=cells.map(c=>{
    const token=at(c);
    const z=zones[0].includes(c)?'redzone':zones[1].includes(c)?'bluezone':ritual.includes(c)?'ritual':'';
    const [x,y]=xy(c),legal=valid.includes(c);
    const cost=legal?movement?.get(c).cost:null;
    const tip=[
      token&&[name(token)+' · '+token.hp+' PF · '+token.pe+' PE. Attraversare un nemico costa 2 PM. La pedina non blocca la vista.',
        ...Object.keys(token.conditions).map(k=>k+' · '+conditions[k])].join('\n'),
      z==='ritual'&&'Zona Rituale. Inizia qui la Fase di Azione senza nemici adiacenti per poter compiere il Rituale.',
      (z==='redzone'||z==='bluezone')&&'Zona Evocazione '+(z==='redzone'?'Rossa':'Blu')+'. Serve per schieramento e rinascita. Nel primo Round protegge dagli Attacchi i propri Simulacri.',
    ].filter(Boolean).join('\n');
    return button((z?'<span class="mark">'+(z==='ritual'?'◇':'•')+'</span>':'')+
      (token?'<span class="token '+(token.side?'blue ':'')+(token===u&&phase!=='setup'?'active':'')+'">'+(token.type==='Terra'?'▲':'ϟ')+'</span>':cost??'<span class="sr">Casella '+(x+1)+', '+(y+1)+'</span>'),
      ()=>selectCell(c),legal,'cell '+z+(legal?' legal':''),tip);
  }).join('');
  board+=walls.map(e=>line(e,'wall',null,'Muro. Blocca il movimento e la linea di vista, anche sulla punta.')).join('');
  barriers.forEach((e,i)=>{if(e)board+=line(e,'edge barrier '+(i?'blue':''),null,'Barriera di Forza · '+labels[i]+'. '+cards.wall[3]);});
  if(visible)board+=targets().map(e=>line(e,'edge target',()=>{
    if(mode==='wall'&&cast('wall')){barriers[u.side]=e;mode='move';render();}
    else if(mode==='dissolve'&&cast('dissolve')){barriers[barriers.indexOf(e)]=null;mode='move';render();}
  },mode==='wall'?'Crea Barriera di Forza qui.':'Dissolvi questa Barriera di Forza.')).join('');
  let controls='',hand='';
  if(visible&&phase==='action'&&mode!=='jump'){
    controls=button('Muovi',()=>pick('move'),true,mode==='move'?'selected':'')
      +button('Colpo Arcano',()=>pick('arc'),!u.attacked&&!(has(u,'Confuso')&&u.moved),mode==='arc'?'selected':'')
      +button('Rituale',ritualAction,ritualReady&&canRitual())
      +button('Caricamento',charge);
  }
  if(visible&&phase==='charge')controls=button('Ricarica e termina',advance,t.hand.length<=6);
  if(visible&&phase==='reaction')controls=button('Veto Arcano · 3 PE',()=>resolve(true))+button('Passa',()=>resolve(false));
  if(visible&&['action','charge','probe'].includes(phase)){
    const side=phase==='probe'?1-u.side:u.side;
    hand=teams[side].hand.map((id,i)=>{
      const [label,cost,type,description]=cards[id];
      const e=barriers[1-u.side];
      const adjacent=e&&neighbors(u.cell).some(c=>same(e,edge(c,u.cell)));
      const playable=phase==='action'&&mode!=='jump'&&id!=='veto'&&affordable(u,cost)&&!u.played.includes(id)&&!(id==='cut'&&(u.attacked||(has(u,'Confuso')&&u.moved)));
      return button('<strong>'+label+'</strong><small>'+type.split(' · ')[0]+' · '+cost+' PE</small>',()=>{
        if(phase==='probe'){discard(side,i);phase='action';render();}
        else if(phase==='charge'){discard(side,i);phase='refill';render();}
        else pick(id);
      },playable||phase!=='action','card '+(mode===id?'selected':''),label+'\n'+type+' · '+cost+' PE\n'+description)+
      (phase==='action'&&mode!=='jump'&&id==='cut'&&adjacent?button('Scarta per distruggere',()=>destroy(i),affordable(u,2)):'');
    }).join('');
    if(phase==='probe'&&!hand)controls=button('Continua',()=>{phase='action';render();});
  }
  if(visible&&phase==='refill'){
    controls=button('Ricarica e termina',advance,t.hand.length<=6);
    if(t.hand.length>6) hand=t.hand.map((id,i)=>button('Scarta '+cards[id][0],()=>{discard(u.side,i);render();})).join('');
  }
  const turnBar=document.querySelector('#turn');
  turnBar.className=viewer?'turn-blue':'turn-red';
  turnBar.textContent='Round '+round+' · '+(phase==='refill'?'Caricamento · '+name(u):title);
  const historyOpen=root.querySelector('details')?.open;
  root.innerHTML='<div class="layout"><section class="play-area"><div class="board">'+board+'</div>'+
    (hand?'<section class="hand"><h3>'+(phase==='probe'?'Mano avversaria':'Mano · '+labels[viewer])+'</h3><div class="cards">'+hand+'</div></section>':'')+
    '<p class="key">▲ Terra · ϟ Fulmine · ◇ Zona Rituale · • Zona Evocazione</p></section><aside class="panel"><p class="instruction">'+(prompt??'Riporta la mano a sei carte e termina il Turno.')+'</p><div class="actions">'+controls+'</div>'+
    teams.map((v,i)=>'<div class="team '+(i?'blue':'')+'"><strong>'+labels[i]+'</strong><div class="stats">'+v.kills+' uccisioni · '+v.ritual+' rituali · '+v.reserve+' riserva</div>'+units.filter(k=>k.side===i).map(k=>'<div class="stats">'+k.type+' · '+k.hp+' PF · '+k.pe+' PE'+(k===u&&phase!=='setup'?' · '+k.pm+' PM':'')+'</div>').join('')+'</div>').join('')+
    (hand?'<div id="card-detail" class="card-detail"></div>':'')+
    (log.length?'<p class="muted">'+log[0]+'</p><details '+(historyOpen?'open':'')+'><summary>Registro</summary><ul class="log">'+log.slice(0,15).map(l=>'<li>'+l+'</li>').join('')+'</ul></details>':'')+'</aside></div>';
  previewCard();
}
function previewCard(card=root.querySelector('.card.selected')){
  const detail=root.querySelector('#card-detail');
  if(detail)detail.textContent=card?.title||'Passa su una carta per leggerne l’effetto.';
}
root.addEventListener('pointerover',event=>{
  const card=event.target.closest('.card');
  if(card)previewCard(card);
});
root.addEventListener('pointerout',event=>{
  const card=event.target.closest('.card');
  if(card&&!card.contains(event.relatedTarget))previewCard();
});
root.addEventListener('focusin',event=>{
  if(event.target.matches('.card'))previewCard(event.target);
});
root.addEventListener('focusout',event=>{
  if(event.target.matches('.card'))previewCard();
});
root.addEventListener('click',event=>{
  const b=event.target.closest('button[data-action]');
  if(b&&!b.disabled&&b.getAttribute('aria-disabled')!=='true')actions[Number(b.dataset.action)]?.();
});
document.querySelector('#reset').onclick=()=>{if(confirm('Iniziare una nuova partita?'))start();};
start();
