// One non-modal reading surface, shared by cards, conditions and history.
export function setupDetails(){
  const popup=document.querySelector('#context-detail');
  const content=document.querySelector('#detail-content');
  let timer,leaveTimer,pinned=false,source=null,pointerOnSource=false,pointerOnPopup=false;
  function close(){
    clearTimeout(timer);clearTimeout(leaveTimer);
    popup.hidden=true;pinned=false;source=null;pointerOnSource=false;pointerOnPopup=false;
  }
  function show(target,pin=false){
    const text=target?.dataset.detail;
    if(!text||target.isConnected===false||pinned&&!pin)return;
    source=target;pinned=pin;content.textContent=text;popup.hidden=false;
    popup.setAttribute('aria-label',text.split('\n')[0]);
    const rect=target.getBoundingClientRect?.()??{left:8,right:8,top:8,bottom:8};
    const gap=8;
    const card=target.classList?.contains('card');
    const left=card&&innerWidth>=1100?innerWidth-popup.offsetWidth-12:Math.max(8,Math.min(rect.left,innerWidth-popup.offsetWidth-8));
    let top=rect.bottom+gap;
    if(top+popup.offsetHeight>innerHeight-8)top=rect.top-popup.offsetHeight-gap;
    popup.style.left=Math.max(8,Math.min(left,innerWidth-popup.offsetWidth-8))+'px';
    popup.style.top=Math.max(8,Math.min(top,innerHeight-popup.offsetHeight-8))+'px';
    popup.classList.toggle('pinned',pin);
  }
  document.addEventListener('pointerover',event=>{
    const target=event.target.closest('[data-detail]');
    if(!target)return;
    pointerOnSource=true;
    if(target===source){clearTimeout(leaveTimer);return;}
    clearTimeout(timer);clearTimeout(leaveTimer);
    timer=setTimeout(()=>show(target),350);
  });
  document.addEventListener('pointerout',event=>{
    const target=event.target.closest('[data-detail]');
    if(!target||target.contains(event.relatedTarget))return;
    if(target===source)pointerOnSource=false;
    clearTimeout(timer);
    if(!pinned)leaveTimer=setTimeout(()=>{if(!pointerOnSource&&!pointerOnPopup)close();},180);
  });
  popup.addEventListener('pointerenter',()=>{pointerOnPopup=true;clearTimeout(leaveTimer);});
  popup.addEventListener('pointerleave',()=>{
    pointerOnPopup=false;
    if(!pinned)leaveTimer=setTimeout(()=>{if(!pointerOnSource&&!pointerOnPopup)close();},180);
  });
  document.addEventListener('focusin',event=>{
    const target=event.target.closest('[data-detail]');if(target)show(target);
  });
  document.addEventListener('click',event=>{
    const target=event.target.closest('[data-detail]');
    if(target){clearTimeout(timer);show(target,true);if(!popup.hidden)document.querySelector('#close-detail').focus?.();}
    else if(!popup.contains(event.target))close();
  });
  document.querySelector('#close-detail').onclick=()=>{
    const target=source;if(target?.isConnected)target.focus();close();
  };
  document.addEventListener('keydown',event=>{
    if(event.key==='Escape'&&!popup.hidden){const target=source;if(target?.isConnected)target.focus();close();}
  });
  return {close};
}
