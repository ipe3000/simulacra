// One non-modal reading surface, shared by cards, conditions and history.
export function setupDetails(){
  const popup=document.querySelector('#context-detail');
  const content=document.querySelector('#detail-content');
  let timer,leaveTimer,pinned=false,source=null;
  function close(){
    clearTimeout(timer);clearTimeout(leaveTimer);
    popup.hidden=true;pinned=false;source=null;
  }
  function show(target,pin=false){
    const text=target?.dataset.detail;
    if(!text||pinned&&!pin)return;
    source=target;pinned=pin;content.textContent=text;popup.hidden=false;
    popup.setAttribute('aria-label',text.split('\n')[0]);
    const rail=document.querySelector('.panel')?.getBoundingClientRect();
    const top=document.querySelector('#match-header').getBoundingClientRect().bottom+8;
    popup.style.left=Math.max(8,Math.min(rail?.left??8,innerWidth-popup.offsetWidth-8))+'px';
    popup.style.top=Math.max(8,Math.min(top,innerHeight-popup.offsetHeight-8))+'px';
    popup.classList.toggle('pinned',pin);
  }
  document.addEventListener('pointerover',event=>{
    const target=event.target.closest('[data-detail]');
    if(!target||target===source)return;
    clearTimeout(timer);clearTimeout(leaveTimer);
    timer=setTimeout(()=>show(target),350);
  });
  document.addEventListener('pointerout',event=>{
    const target=event.target.closest('[data-detail]');
    if(!target||target.contains(event.relatedTarget))return;
    clearTimeout(timer);
    if(!pinned)leaveTimer=setTimeout(close,180);
  });
  popup.addEventListener('pointerenter',()=>clearTimeout(leaveTimer));
  popup.addEventListener('pointerleave',()=>{if(!pinned)leaveTimer=setTimeout(close,180);});
  document.addEventListener('focusin',event=>{
    const target=event.target.closest('[data-detail]');if(target)show(target);
  });
  document.addEventListener('click',event=>{
    const target=event.target.closest('[data-detail]');
    if(target){clearTimeout(timer);show(target,true);}
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
