const http = require("http");
const fs = require("fs");
const path = require("path");
const WebSocket = require("ws");

const PORT = process.env.PORT || 3000;
const WORLD = 6000;
const FOOD_COUNT = 700;
const MAX_PLAYERS = 40;
const TICK = 30;

const colors = [
  "#42d392","#55a7ff","#ff6680","#ffbf55",
  "#b56cff","#25d9d0","#f472b6","#a3e635"
];

const players = new Map();
const foods = [];

const random = (a,b) => Math.random()*(b-a)+a;
const clamp = (v,a,b) => Math.max(a,Math.min(b,v));
const distance = (a,b) => Math.hypot(a.x-b.x,a.y-b.y);

function makeFood(){
  return {
    id: Math.random().toString(36).slice(2),
    x: random(30,WORLD-30),
    y: random(30,WORLD-30),
    r: random(3,7),
    color: colors[Math.floor(random(0,colors.length))]
  };
}

for(let i=0;i<FOOD_COUNT;i++) foods.push(makeFood());

function createPlayer(id,name){
  return {
    id,
    name: String(name || "Player")
      .replace(/[^\w ._-]/g,"")
      .slice(0,16) || "Player",
    x: random(300,WORLD-300),
    y: random(300,WORLD-300),
    r: 25,
    color: colors[Math.floor(random(0,colors.length))],
    targetX: WORLD/2,
    targetY: WORLD/2,
    energy: 100,
    score: 0,
    cells: [],
    lastSplit: 0,
    lastEject: 0,
    socket: null
  };
}

function publicPlayer(p){
  return {
    id:p.id,
    name:p.name,
    color:p.color,
    energy:Math.floor(p.energy),
    score:Math.floor(p.score),
    cells:p.cells.length
      ? p.cells.map(c=>({id:c.id,x:c.x,y:c.y,r:c.r}))
      : [{id:p.id,x:p.x,y:p.y,r:p.r}]
  };
}

function allCells(){
  const result=[];
  for(const p of players.values()){
    if(p.cells.length){
      for(const c of p.cells) result.push({owner:p,cell:c});
    }else{
      result.push({owner:p,cell:p});
    }
  }
  return result;
}

function movePlayer(p){
  const cells=p.cells.length?p.cells:[p];

  for(const c of cells){
    const dx=p.targetX-c.x;
    const dy=p.targetY-c.y;
    const d=Math.hypot(dx,dy);

    if(d<2) continue;

    const speed=Math.max(.8,7*Math.pow(25/c.r,.43));

    c.x+=dx/d*speed;
    c.y+=dy/d*speed;

    c.x=clamp(c.x,c.r,WORLD-c.r);
    c.y=clamp(c.y,c.r,WORLD-c.r);
  }
}

function eatFood(){
  for(const item of allCells()){
    const c=item.cell;
    const p=item.owner;

    for(let i=foods.length-1;i>=0;i--){
      const f=foods[i];

      if(distance(c,f)<c.r+f.r){
        c.r=Math.sqrt(c.r*c.r+1);
        p.score++;

        foods.splice(i,1);
        foods.push(makeFood());
      }
    }
  }
}

function splitPlayer(p){
  const now=Date.now();
  if(now-p.lastSplit<900)return;

  p.lastSplit=now;

  const cells=p.cells.length?p.cells:[
    {id:p.id,x:p.x,y:p.y,r:p.r}
  ];

  if(cells.length>=16)return;

  const created=[];

  for(const c of cells){
    if(c.r<22)continue;

    const r=c.r/Math.sqrt(2);
    c.r=r;

    const angle=Math.atan2(
      p.targetY-c.y,
      p.targetX-c.x
    );

    created.push({
      id:Math.random().toString(36).slice(2),
      x:clamp(c.x+Math.cos(angle)*r*1.8,r,WORLD-r),
      y:clamp(c.y+Math.sin(angle)*r*1.8,r,WORLD-r),
      r,
      vx:Math.cos(angle)*14,
      vy:Math.sin(angle)*14,
      boost:25
    });
  }

  p.cells=cells.concat(created);
}

function ejectMass(p){
  const now=Date.now();

  if(now-p.lastEject<120)return;
  if(p.energy<8)return;

  p.lastEject=now;
  p.energy-=8;

  const cells=p.cells.length?p.cells:[p];

  for(const c of cells){
    if(c.r<15)continue;

    c.r=Math.sqrt(Math.max(20,c.r*c.r-6));

    const angle=Math.atan2(
      p.targetY-c.y,
      p.targetX-c.x
    );

    foods.push({
      id:Math.random().toString(36).slice(2),
      x:clamp(c.x+Math.cos(angle)*c.r,10,WORLD-10),
      y:clamp(c.y+Math.sin(angle)*c.r,10,WORLD-10),
      r:8,
      color:p.color
    });
  }
}

function eliminate(p){
  if(!players.has(p.id))return;

  try{
    p.socket.send(JSON.stringify({
      type:"dead",
      score:p.score
    }));
  }catch{}

  players.delete(p.id);
}

function collisions(){
  const cells=allCells();

  for(let i=0;i<cells.length;i++){
    for(let j=i+1;j<cells.length;j++){
      const A=cells[i];
      const B=cells[j];

      if(A.owner===B.owner)continue;

      const a=A.cell;
      const b=B.cell;

      const d=distance(a,b);
      const big=a.r>b.r?A:B;
      const small=big===A?B:A;

      if(
        d<big.cell.r*.78 &&
        big.cell.r>small.cell.r*1.12
      ){
        big.cell.r=Math.sqrt(
          big.cell.r*big.cell.r+
          small.cell.r*small.cell.r*.8
        );

        const owner=small.owner;

        if(owner.cells.length){
          owner.cells=owner.cells.filter(
            c=>c.id!==small.cell.id
          );
        }else{
          eliminate(owner);
        }

        big.owner.score+=
          Math.floor(small.cell.r*small.cell.r);
      }
    }
  }
}

function update(){
  for(const p of players.values()){
    movePlayer(p);
    p.energy=clamp(p.energy+.35,0,100);

    if(p.cells.length){
      for(const c of p.cells){
        if(c.boost>0){
          c.x+=c.vx||0;
          c.y+=c.vy||0;
          c.vx*=.91;
          c.vy*=.91;
          c.boost--;
        }

        c.x=clamp(c.x,c.r,WORLD-c.r);
        c.y=clamp(c.y,c.r,WORLD-c.r);
      }

      if(
        p.cells.length===1 &&
        Date.now()-p.lastSplit>7000
      ){
        p.x=p.cells[0].x;
        p.y=p.cells[0].y;
        p.r=p.cells[0].r;
        p.cells=[];
      }
    }
  }

  eatFood();
  collisions();
}

function broadcast(){
  const data=JSON.stringify({
    type:"state",
    world:WORLD,
    foods,
    players:[...players.values()].map(publicPlayer)
  });

  for(const p of players.values()){
    if(p.socket.readyState===WebSocket.OPEN){
      p.socket.send(data);
    }
  }
}

const server=http.createServer((req,res)=>{
  let file=req.url==="/"
    ? "/index.html"
    : req.url;

  const publicDir=path.join(__dirname,"public");
  const filename=path.normalize(path.join(publicDir,file));

  if(!filename.startsWith(publicDir)){
    res.writeHead(403);
    return res.end("Forbidden");
  }

  fs.readFile(filename,(err,data)=>{
    if(err){
      res.writeHead(404);
      return res.end("Not found");
    }

    const ext=path.extname(filename);

    const types={
      ".html":"text/html",
      ".js":"text/javascript",
      ".css":"text/css"
    };

    res.writeHead(200,{
      "Content-Type":types[ext]||"application/octet-stream"
    });

    res.end(data);
  });
});

const wss=new WebSocket.Server({server});

wss.on("connection",socket=>{
  if(players.size>=MAX_PLAYERS){
    socket.send(JSON.stringify({
      type:"error",
      message:"Server pieno"
    }));
    socket.close();
    return;
  }

  const id=Math.random().toString(36).slice(2);
  let player=null;

  socket.on("message",raw=>{
    let msg;

    try{
      msg=JSON.parse(raw.toString());
    }catch{
      return;
    }

    if(msg.type==="join"){
      player=createPlayer(id,msg.name);
      player.socket=socket;
      players.set(id,player);

      socket.send(JSON.stringify({
        type:"welcome",
        id,
        world:WORLD
      }));

      return;
    }

    if(!player)return;

    if(msg.type==="move"){
      player.targetX=clamp(
        Number(msg.x)||player.x,
        0,
        WORLD
      );

      player.targetY=clamp(
        Number(msg.y)||player.y,
        0,
        WORLD
      );
    }

    if(msg.type==="split")splitPlayer(player);
    if(msg.type==="eject")ejectMass(player);
  });

  socket.on("close",()=>{
    if(player)players.delete(player.id);
  });
});

setInterval(()=>{
  update();
  broadcast();
},TICK);

server.listen(PORT,()=>{
  console.log(`Cell Arena: http://localhost:${PORT}`);
});
