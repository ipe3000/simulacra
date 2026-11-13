export const width = 13;
export const height = 6;
export const cells = Array.from({length: width * height}, (_, i) => i);
export const walls = [
  [0,0,1,0],[2,0,4,0],[5,0,8,0],[9,0,11,0],[12,0,13,0],
  [0,6,1,6],[2,6,4,6],[5,6,8,6],[9,6,11,6],[12,6,13,6],
  [0,0,0,1],[0,2,0,4],[0,5,0,6],[13,0,13,1],[13,2,13,4],[13,5,13,6],
  ...[6,7].flatMap(x=>[[x,0,x,1],[x,2,x,4],[x,5,x,6]]),
  [1,1,2,1],[4,1,6,1],[11,1,13,1],[2,2,3,2],[0,3,2,3],[3,3,4,3],
  [5,3,6,3],[10,3,11,3],[0,4,1,4],[2,4,4,4],[9,4,10,4],[11,4,13,4],
  [1,5,2,5],[7,5,9,5],[10,5,11,5],
  [1,1,1,2],[1,5,1,6],[3,0,3,2],[3,5,3,6],[4,2,4,5],[5,1,5,2],[5,3,5,5],
  [8,0,8,2],[8,3,8,5],[9,1,9,4],[10,0,10,2],[10,5,10,6],
  [11,1,11,2],[11,3,11,4],[12,1,12,3],[12,5,12,6],
];
export const zones = [[0,1,2],[65,66,67]];
export const ritual = cells.filter(c=>c%width===12);
export const xy = c=>[c%width,Math.floor(c/width)];
export const center = c=>xy(c).map(n=>n+.5);
export function neighbors(c) {
  const [x,y]=xy(c);
  return [x>0?c-1:null,x<12?c+1:null,y>0?c-width:null,y<5?c+width:null].filter(n=>n!==null);
}
export function edge(a,b) {
  const [x,y]=xy(Math.max(a,b));
  return Math.abs(a-b)===1?[x,y,x,y+1]:[x,y,x+1,y];
}
export function intersects([ax,ay,bx,by],[cx,cy,dx,dy]) {
  const cross=(x,y,u,v,p,q)=>(u-x)*(q-y)-(v-y)*(p-x);
  return Math.max(Math.min(ax,bx),Math.min(cx,dx))<=Math.min(Math.max(ax,bx),Math.max(cx,dx))
    && Math.max(Math.min(ay,by),Math.min(cy,dy))<=Math.min(Math.max(ay,by),Math.max(cy,dy))
    && cross(ax,ay,bx,by,cx,cy)*cross(ax,ay,bx,by,dx,dy)<=0
    && cross(cx,cy,dx,dy,ax,ay)*cross(cx,cy,dx,dy,bx,by)<=0;
}
export const blocked = (segment, obstacles=walls)=>obstacles.some(w=>intersects(segment,w));
export function lineOfSight([x,y],[a,b],obstacles=walls) {
  return (x===a||y===b)&&!blocked([x,y,a,b],obstacles);
}
export const mid = ([x,y,a,b])=>[(x+a)/2,(y+b)/2];
export const wallBetween = (a,b)=>blocked([...center(a),...center(b)]);
export function paths(starts, max, step) {
  const found=new Map(starts.map(c=>[c,{cost:0,route:[c]}]));
  const pending=new Set(starts);
  while(pending.size) {
    const from=[...pending].sort((a,b)=>found.get(a).cost-found.get(b).cost)[0];
    pending.delete(from);
    const {cost,route}=found.get(from);
    for(const to of neighbors(from)) {
      const next=cost+step(from,to);
      if(next<=max && next<(found.get(to)?.cost??Infinity)) {
        found.set(to,{cost:next,route:[...route,to]});
        pending.add(to);
      }
    }
  }
  return found;
}
export function respawn(zone,free) {
  const reach=paths(zone,Infinity,(a,b)=>wallBetween(a,b)?Infinity:1);
  const candidates=[...reach].filter(([c])=>free(c));
  const min=Math.min(...candidates.map(([,p])=>p.cost));
  return candidates.filter(([,p])=>p.cost===min).map(([c])=>c);
}
