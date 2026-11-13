import {cells,walls,zones,ritual,xy,center,neighbors,edge,mid,blocked,lineOfSight,wallBetween,paths,respawn} from './engine.mjs';

const cards={
  arc:['Colpo Arcano',0,'Attacco · Tocco','Infligge 1 danno.'],
  cut:['Fendente Dimensionale',2,'Attacco · Tocco','Infligge 2 danni, poi teletrasportati in una casella libera in vista.'],
  wall:['Barriera di Forza',3,'Utilità · Vista','Blocca movimento e vista dei nemici. Un nemico adiacente può distruggerla scartando un Attacco e pagandone il costo.'],
  probe:['Sonda Telepatica',3,'Utilità · Ovunque','Guarda la mano avversaria e scegli una carta da scartare.'],
  veto:['Veto Arcano',3,'Reazione · Personale','Quando sei bersaglio, annulla l’effetto e perdi 1 PF. L’attaccante ottiene 2 PE e pesca una carta.'],
};
const pool=['cut','wall','probe','veto','cut','veto'];
const labels=['Rosso','Blu'];
const root=document.querySelector('#game');
const dialog=document.querySelector('#handoff');
let units,teams,order,index,round,setup,viewer,phase,mode,barriers,log,winner,ritualReady,pending;
const active=()=>units[order[index]];
const at=c=>units.find(u=>u.cell===c);
const name=u=>labels[u.side]+' · '+u.type;
const note=t=>log.unshift(t);
const same=(a,b)=>a.every((v,i)=>v===b[i]);

function start(){
  units=[0,1,2,3].map(id=>({id,side:id%2,type:id<2?'Terra':'Fulmine',hp:id<2?8:6,pe:4,pm:0,cell:null}));
  teams=[0,1].map(()=>({hand:[...pool],deck:[...pool,...pool,...pool,...pool],discard:[],reserve:4,kills:0,ritual:0,spent:0,reaction:false}));
  const first=Math.random()<.5?0:1;
  order=[first,1-first,first+2,3-first];
  index=0; round=1; setup=[first,first+2,1-first,3-first]; viewer=null;
  phase='setup'; mode='move'; barriers=[null,null]; log=[]; winner=null; pending=null;
  show(first);
}
function show(side){
  if(viewer!==side){
    viewer=null;
    render();
    dialog.querySelector('p').textContent='Tocca all’Arcimago '+labels[side]+'.';
    dialog.onclose=()=>{viewer=side;render();};
    if(!dialog.open)dialog.showModal();
  }else render();
}
function obstacles(side){return barriers[1-side]?[...walls,barriers[1-side]]:walls;}
function sight(c,target,side){return lineOfSight(center(c),target,obstacles(side));}
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
  if(mode==='move')return [...walk(u).keys()].filter(c=>!at(c));
  if(mode==='jump')return cells.filter(c=>!at(c)&&sight(u.cell,center(c),u.side));
  if(mode==='arc'||mode==='cut')return neighbors(u.cell).filter(c=>at(c)?.side===1-u.side
    && !(round===1&&zones[1-u.side].includes(c))&&sight(u.cell,center(c),u.side));
  return [];
}
function targets(){
  const u=active();
  if(phase!=='action'||mode!=='wall')return [];
  return cells.flatMap(c=>neighbors(c).filter(n=>n>c&&!wallBetween(c,n)).map(n=>edge(c,n)))
    .filter(e=>!barriers.some(b=>b&&same(b,e)) && [
      [0,.5],[1,.5],[.5,0],[.5,1],
    ].some(([dx,dy])=>{
      const [x,y]=xy(u.cell);
      return lineOfSight([x+dx,y+dy],mid(e),obstacles(u.side));
    }));
}
function begin(){
  const u=active();
  teams.forEach(t=>{t.spent=0;t.reaction=false;});
  mode='move';u.attacked=false;u.played=[];u.pm=u.type==='Terra'?4:5;
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
    t.deck=t.discard.splice(0);
    for(let i=t.deck.length-1;i>0;i--){
      const j=Math.floor(Math.random()*(i+1));
      [t.deck[i],t.deck[j]]=[t.deck[j],t.deck[i]];
    }
  }
  if(t.deck.length)t.hand.push(t.deck.shift());
}
function discard(side,i){const t=teams[side];t.discard.push(...t.hand.splice(i,1));}
function affordable(u,cost){const t=teams[u.side];return cost<=u.pe+Math.min(t.reserve,2-t.spent);}
function pay(u,cost){
  const min=Math.max(0,cost-u.pe);
  const t=teams[u.side];
  const max=Math.min(cost,t.reserve,2-t.spent);
  if(min>max)return false;
  const reserve=max>min?window.prompt('Segnalini di Riserva Arcana da spendere ('+min+'–'+max+')',String(min)):String(min);
  if(reserve===null||!/^\d+$/.test(reserve)||+reserve<min||+reserve>max)return false;
  u.pe-=cost-Number(reserve);t.reserve-=Number(reserve);t.spent+=Number(reserve);
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
    u.cell=null;teams[1-u.side].kills++;
    teams[u.side].reserve=Math.min(4,teams[u.side].reserve+2);
    note(name(u)+' è caduto.');
    victory(1-u.side);
  }
}
function attack(c){
  const id=mode,u=active(),defender=at(c);
  if(!cast(id))return;
  u.attacked=true;
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
  damage(defender,veto||id==='arc'?1:2);
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
  }else if(mode==='arc'||mode==='cut'){attack(c);return;}
  else if(mode==='jump'){u.cell=c;mode='move';}
  else{
    const route=walk(u).get(c);
    u.cell=c;u.pm-=route.cost;ritualReady=false;
    note(name(u)+' si muove · '+route.cost+' PM.');
  }
  render();
}
function charge(){
  phase='charge';mode='move';render();
}
function advance(){
  const u=active(),t=teams[u.side];
  if(t.hand.length>6)return;
  while(t.hand.length<6&&(t.deck.length||t.discard.length))draw(u.side);
  u.pe=4;u.pm=0;
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
function button(label,fn,enabled=true,cls=''){
  const i=actions.push(fn)-1;
  return '<button type="button" data-action="'+i+'" class="'+cls+'" '+(enabled?'':'disabled')+'>'+label+'</button>';
}
function line(e,cls,fn){
  const [x,y,a,b]=e;
  const vert=x===a;
  const style='left:'+(x/13*100)+'%;top:'+(y/6*100)+'%;width:'+((vert?b-y:a-x)/13*100)+'%;transform:rotate('+(vert?90:0)+'deg)';
  if(!fn)return '<span class="'+cls+'" style="'+style+'"></span>';
  const i=actions.push(fn)-1;
  return '<button aria-label="Crea barriera sul confine '+e.join(', ')+'" class="'+cls+'" style="'+style+'" data-action="'+i+'"></button>';
}
function render(){
  actions.length=0;
  const u=active(),t=teams[u.side];
  const visible=viewer!==null;
  const valid=visible?legalCells():[];
  const movement=phase==='action'&&mode==='move'&&valid.length?walk(u):null;
  const title={setup:'Evocazione · '+name(units[setup[0]]??u),spawn:'Rinascita · '+name(u),action:name(u),charge:'Caricamento · '+name(u),reaction:'Reazione · '+labels[pending?.defender.side],probe:'Sonda Telepatica',end:'Vince l’Arcimago '+labels[winner]}[phase];
  const prompt={setup:'Scegli una casella della tua Zona Evocazione.',spawn:'Scegli una delle caselle libere evidenziate.',action:{move:'Scegli una destinazione o un incantesimo.',arc:'Scegli un nemico a Tocco.',cut:'Scegli un nemico a Tocco.',wall:'Scegli un confine evidenziato.',jump:'Scegli la destinazione del teletrasporto.'}[mode],charge:'Scarta una carta se vuoi, poi ricarica.',reaction:'Puoi annullare l’incantesimo con Veto Arcano.',probe:'Scegli una carta da scartare dalla mano avversaria.',end:'Due punti uccisione e un punto rituale.'}[phase];
  let board=cells.map(c=>{
    const token=at(c);
    const z=zones[0].includes(c)?'redzone':zones[1].includes(c)?'bluezone':ritual.includes(c)?'ritual':'';
    const [x,y]=xy(c),legal=valid.includes(c);
    const cost=legal?movement?.get(c).cost:null;
    return button((z?'<span class="mark">'+(z==='ritual'?'◇':'•')+'</span>':'')+
      (token?'<span class="token '+(token.side?'blue ':'')+(token===u&&phase!=='setup'?'active':'')+'" title="'+name(token)+'">'+(token.type==='Terra'?'▲':'ϟ')+'</span>':cost??'<span class="sr">Casella '+(x+1)+', '+(y+1)+'</span>'),
      ()=>selectCell(c),legal,'cell '+z+(legal?' legal':''));
  }).join('');
  board+=walls.map(e=>line(e,'wall')).join('');
  barriers.forEach((e,i)=>{if(e)board+=line(e,'edge barrier '+(i?'blue':''));});
  if(visible)board+=targets().map(e=>line(e,'edge target',()=>{
    if(cast('wall')){barriers[u.side]=e;mode='move';render();}
  })).join('');
  let controls='',hand='';
  if(visible&&phase==='action'&&mode!=='jump'){
    controls=button('Muovi',()=>pick('move'),true,mode==='move'?'selected':'')
      +button('Colpo Arcano',()=>pick('arc'),!u.attacked,mode==='arc'?'selected':'')
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
      const playable=phase==='action'&&mode!=='jump'&&id!=='veto'&&affordable(u,cost)&&!u.played.includes(id)&&!(id==='cut'&&u.attacked);
      return button('<strong>'+label+'</strong><small>'+type+' · '+cost+' PE</small><small>'+description+'</small>',()=>{
        if(phase==='probe'){discard(side,i);phase='action';render();}
        else if(phase==='charge'){discard(side,i);phase='refill';render();}
        else pick(id);
      },playable||phase!=='action','card '+(mode===id?'selected':''))+
      (phase==='action'&&mode!=='jump'&&id==='cut'&&adjacent?button('Scarta per distruggere',()=>destroy(i),affordable(u,2)):'');
    }).join('');
    if(phase==='probe'&&!hand)controls=button('Continua',()=>{phase='action';render();});
  }
  if(visible&&phase==='refill'){
    controls=button('Ricarica e termina',advance,t.hand.length<=6);
    if(t.hand.length>6) hand=t.hand.map((id,i)=>button('Scarta '+cards[id][0],()=>{discard(u.side,i);render();})).join('');
  }
  root.innerHTML='<section class="status"><span class="eyebrow">ROUND '+round+'</span><h2>'+(phase==='refill'?'Caricamento · '+name(u):title)+'</h2><p>'+(prompt??'Riporta la mano a sei carte e termina il Turno.')+'</p></section><div class="layout"><section><div class="board">'+board+'</div><p class="key">▲ Terra · ϟ Fulmine · ◇ Zona Rituale · • Zona Evocazione</p></section><aside class="panel"><h3>Arcimaghi</h3>'+
    teams.map((v,i)=>'<div class="team '+(i?'blue':'')+'"><strong>'+labels[i]+'</strong><div class="stats">'+v.kills+' uccisioni · '+v.ritual+' rituali · '+v.reserve+' riserva</div>'+units.filter(k=>k.side===i).map(k=>'<div class="stats">'+k.type+' · '+k.hp+' PF · '+k.pe+' PE'+(k===u&&phase!=='setup'?' · '+k.pm+' PM':'')+'</div>').join('')+'</div>').join('')+
    '<div class="actions">'+controls+'</div><h3>Registro</h3><ul class="log">'+log.slice(0,5).map(l=>'<li>'+l+'</li>').join('')+'</ul></aside></div>'+
    (hand?'<section class="hand"><h3>'+(phase==='probe'?'Mano avversaria':'Mano · '+labels[viewer])+'</h3><div class="cards">'+hand+'</div></section>':'');
}
root.addEventListener('click',event=>{
  const b=event.target.closest('button[data-action]');
  if(b&&!b.disabled)actions[Number(b.dataset.action)]?.();
});
document.querySelector('#reset').onclick=()=>{if(confirm('Iniziare una nuova partita?'))start();};
dialog.addEventListener('cancel',event=>event.preventDefault());
start();
