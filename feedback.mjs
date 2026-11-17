// Presentation observes committed state; it never applies game rules.
export function createFeedback(root){
  let previous=null,holdUntil=0;
  const running=new Set();
  const stacks=new Map();
  const enabled=()=>typeof root.animate==='function';
  const reduced=()=>!enabled()||(document.querySelector('#reduce-motion')?.checked??true);
  const speed=()=>enabled()?(Number(document.querySelector('#animation-speed')?.value)||1):1;
  function animate(node,frames,duration){
    const animation=node.animate(frames,{duration:duration*speed(),easing:'ease-out',fill:'forwards'});
    running.add(animation);
    animation.finished.catch(()=>{}).finally(()=>{running.delete(animation);node.remove();});
  }
  function mark(cell,label,kind='magic',side=0){
    const board=root.querySelector('.board');
    if(!board||cell===null||cell===undefined)return;
    const node=document.createElement('span');
    node.className='feedback '+kind+(side?' blue':'');
    node.textContent=label;
    node.style.left=((cell%13+.5)/13*100)+'%';
    node.style.top=((Math.floor(cell/13)+.5)/6*100)+'%';
    const stack=stacks.get(cell)||0;stacks.set(cell,stack+1);
    node.style.marginTop=(-stack*22)+'px';
    board.append(node);
    holdUntil=Date.now()+700*speed();
    animate(node,reduced()?[{opacity:1},{opacity:1,offset:.8},{opacity:0}]:
      [{opacity:0,transform:'translate(-50%,0) scale(.8)'},{opacity:1,offset:.15,transform:'translate(-50%,-70%) scale(1)'},
        {opacity:0,transform:'translate(-50%,-160%) scale(1)'}],950);
  }
  function reset(){
    previous=null;holdUntil=0;
    for(const animation of running)animation.cancel();
    running.clear();
  }
  function update(state){
    if(!enabled())return;
    stacks.clear();
    const before=previous;
    previous=structuredClone(state);
    const banner=document.querySelector('#action-caption');
    const reaction=['reaction','afterDamage','dash'].includes(state.phase)||
      state.phase==='selection'&&state.choiceText?.startsWith('Reazione');
    root.classList.toggle('reaction-window',reaction);
    if(state.pending){
      const {from,to,label}=state.pending;
      for(const [cell,cls] of [[from,'spell-source'],[to,'spell-target']])root.querySelectorAll('.cell')[cell]?.classList.add(cls);
      banner.textContent=(reaction?'Reazione · '+state.viewerLabel+' · ':'')+label;
      const board=root.querySelector('.board');
      const beam=document.createElementNS('http://www.w3.org/2000/svg','svg');
      beam.setAttribute('viewBox','0 0 1300 600');beam.setAttribute('preserveAspectRatio','none');
      beam.classList.add('spell-link');
      const line=document.createElementNS('http://www.w3.org/2000/svg','line');
      for(const [key,value] of Object.entries({x1:(from%13+.5)*100,y1:(Math.floor(from/13)+.5)*100,
        x2:(to%13+.5)*100,y2:(Math.floor(to/13)+.5)*100}))line.setAttribute(key,value);
      beam.append(line);board.append(beam);
    }else if(reaction)banner.textContent=state.choiceText||'Reazione · '+state.viewerLabel;
    if(!before)return;
    for(const unit of state.units){
      const old=before.units.find(v=>v.id===unit.id);
      if(!old)continue;
      if(unit.cell!==null&&old.cell!==null&&unit.cell!==old.cell&&!reduced()){
        const board=root.querySelector('.board'),token=root.querySelectorAll('.cell')[unit.cell]?.querySelector('.token');
        if(token){
          const dx=((old.cell%13)-(unit.cell%13))*board.clientWidth/13;
          const dy=(Math.floor(old.cell/13)-Math.floor(unit.cell/13))*board.clientHeight/6;
          const animation=token.animate(state.moving?
            [{transform:`translate(${dx}px,${dy}px)`},{transform:'translate(0,0)'}]:
            [{opacity:0,filter:'brightness(3)',transform:'scale(.3)'},{opacity:1,filter:'brightness(1)',transform:'scale(1)'}],
          {duration:200*speed(),easing:'ease-out'});
          running.add(animation);animation.finished.catch(()=>{}).finally(()=>running.delete(animation));
          if(!state.moving)mark(old.cell,'✧','magic',unit.side);
        }
      }
      if(unit.hp!==old.hp)mark(unit.cell??old.cell,(unit.hp>old.hp?'+':'−')+Math.abs(unit.hp-old.hp)+' PF',unit.hp>old.hp?'heal':'damage',unit.side);
      if(old.cell!==null&&unit.cell===null)mark(old.cell,'Caduto','fallen',unit.side);
      if(old.cell===null&&unit.cell!==null)mark(unit.cell,'Evocazione',unit.type==='Terra'?'earth-effect':'lightning-effect',unit.side);
      for(const condition of Object.keys(unit.conditions))if(!(condition in old.conditions))mark(unit.cell,condition,'condition',unit.side);
      for(const condition of Object.keys(old.conditions))if(!(condition in unit.conditions)&&unit.cell!==null)mark(unit.cell,'− '+condition,'heal',unit.side);
    }
    const location=v=>JSON.stringify([v.id,v.side,v.cell,v.edge]);
    for(const creation of state.creations)if(!before.creations.some(v=>location(v)===location(creation))){
      const cell=creation.cell??Math.min(77,Math.floor((creation.edge[1]+creation.edge[3])/2)*13+Math.min(12,Math.floor((creation.edge[0]+creation.edge[2])/2)));
      mark(cell,'✦','magic',creation.side);
    }
    for(let side=0;side<2;side++){
      const team=state.teams[side],old=before.teams[side];
      if(team.ritual>old.ritual)mark(state.units.find(u=>u.id===state.active)?.cell,'✦ Rituale','ritual-effect',side);
      if(team.kills>old.kills)banner.textContent=state.labels[side]+' · +1 punto uccisione';
    }
    const event=state.events.at(-1);
    if(event){
      if(!state.pending&&!reaction)banner.textContent=event.label;
      mark(event.cell,event.symbol||'✦',event.kind||'magic',event.side);
    }
    if(state.phase==='end')banner.textContent='✦ Vince l’Arcimago '+state.labels[state.winner];
  }
  return {update,reset,enabled,reduced,speed,wait:()=>Math.max(0,holdUntil-Date.now())};
}
