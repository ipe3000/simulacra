// Public outcomes only: never retain hands, deck order or computer evaluations.
export function createChronicle(){
  let previous=null,current=null,entry=null,nextId=0;
  const turns=[];
  const clone=value=>JSON.parse(JSON.stringify(value));
  function observe(state){
    if(previous&&entry){
      for(const unit of state.units){
        const old=previous.units.find(v=>v.id===unit.id);
        for(const [key,label] of [['hp','PF'],['pe','PE'],['pm','PM']]){
          const delta=unit[key]-old[key];
          if(delta)add(unit.name+' : '+(delta>0?'+':'−')+Math.abs(delta)+' '+label);
        }
        for(const c of Object.keys(unit.conditions))if(!(c in old.conditions))add(unit.name+' : '+c);
        for(const c of Object.keys(old.conditions))if(!(c in unit.conditions))add(unit.name+' : rimossa '+c);
        if(unit.cell!==old.cell)add(unit.name+' : '+(unit.cell===null?'caduto':old.cell===null?'rinascita':'posizione '+unit.position));
      }
      state.teams.forEach((team,i)=>{
        for(const [key,label] of [['reserve','Riserva Arcana'],['kills','punti uccisione'],['ritual','punti rituale']]){
          const delta=team[key]-previous.teams[i][key];
          if(delta)add(team.name+' : '+(delta>0?'+':'−')+Math.abs(delta)+' '+label);
        }
      });
      for(const creation of state.creations)if(!previous.creations.includes(creation))add('Creata: '+creation);
      for(const creation of previous.creations)if(!state.creations.includes(creation))add('Rimossa: '+creation);
    }
    previous=clone(state);
  }
  function add(text){if(entry)entry.changes.push(text);}
  function turn(info,state){
    observe(state);
    if(current)current.complete=true;
    current={...info,id:++nextId,complete:false,entries:[]};turns.push(current);entry=null;
  }
  function begin(info){
    if(!current)return;
    if(entry&&entry.status!=='Annullata')entry.status='Risolta';
    entry={...info,id:++nextId,status:'In corso',cards:info.card?[info.card]:[],changes:[]};
    current.entries.push(entry);
  }
  function reaction(card){
    if(!entry)begin({title:'Reazione',actor:card.actor});
    if(entry)entry.cards.push(card);
  }
  return {turns,turn,begin,reaction,observe,add,
    get current(){return entry;},
    reset(){turns.length=0;previous=current=entry=null;nextId=0;}};
}
