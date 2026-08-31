```powershell
$root = Join-Path $PWD "cell-arena"
$public = Join-Path $root "public"

New-Item -ItemType Directory -Force -Path $public | Out-Null

@'
{
  "name": "cell-arena-online",
  "version": "1.0.0",
  "description": "Multiplayer cell arena game",
  "main": "server.js",
  "scripts": {
    "start": "node server.js"
  },
  "dependencies": {
    "ws": "^8.18.3"
  }
}
'@ | Set-Content -Encoding UTF8 (Join-Path $root "package.json")

@'
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
      .replace(/[^\wÀ-ÿ ._-]/g,"")
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
'@ | Set-Content -Encoding UTF8 (Join-Path $root "server.js")

@'
<!doctype html>
<html lang="it">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Cell Arena Online</title>
<style>
*{box-sizing:border-box}
html,body{margin:0;width:100%;height:100%;overflow:hidden;background:#07101d;color:#fff;font-family:Arial}
canvas{display:block;width:100%;height:100%}
#menu,#dead{
position:fixed;inset:0;display:flex;align-items:center;justify-content:center;
background:#02050bdd;z-index:10}
.card{
width:min(400px,92vw);background:#0c1728;padding:30px;
border-radius:22px;box-shadow:0 25px 80px #000
}
h1{font-size:40px;margin-top:0}
input,button{width:100%;padding:13px;border:0;border-radius:11px;margin-top:10px;font-size:16px}
input{background:#142238;color:#fff}
button{background:#42d392;font-weight:bold;cursor:pointer}
#hud,#board,#status{
position:fixed;z-index:4;background:#081322dd;border-radius:14px
}
#hud{left:15px;top:15px;padding:12px 15px}
#board{right:15px;top:15px;width:200px;padding:13px}
#status{
bottom:15px;left:50%;transform:translateX(-50%);
padding:8px 14px;color:#aebbd0;font-size:12px
}
.row{display:flex;justify-content:space-between;margin:5px 0;font-size:13px}
.hidden{display:none!important}
</style>
</head>
<body>

<canvas id="game"></canvas>

<div id="hud">
<b>Massa: <span id="mass">0</span></b><br>
Punteggio: <span id="score">0</span>
</div>

<div id="board">
<b>🏆 CLASSIFICA</b>
<div id="players"></div>
</div>

<div id="status">Disconnesso</div>

<div id="menu">
<div class="card">
<h1>🟢 Cell Arena</h1>
<p>Multiplayer online.</p>
<input id="name" maxlength="16" value="Player">
<button onclick="connect()">ENTRA NELL'ARENA</button>
</div>
</div>

<div id="dead" class="hidden">
<div class="card">
<h1>💥 Eliminato</h1>
<p>Punteggio: <span id="finalScore">0</span></p>
<button onclick="location.reload()">RIGIOCA</button>
</div>
</div>

<script>
const canvas=document.getElementById("game");
const ctx=canvas.getContext("2d");

let W,H,DPR;
let socket,myId=null,world=6000;

let state={foods:[],players:[]};

let camera={x:3000,y:3000,zoom:1};
let mouse={x:innerWidth/2,y:innerHeight/2};
let lastSend=0;

function resize(){
 DPR=devicePixelRatio||1;
 W=innerWidth;H=innerHeight;
 canvas.width=W*DPR;
 canvas.height=H*DPR;
 ctx.setTransform(DPR,0,0,DPR,0,0);
}
addEventListener("resize",resize);
resize();

addEventListener("mousemove",e=>{
 mouse.x=e.clientX;
 mouse.y=e.clientY;
 sendMove();
});

addEventListener("touchmove",e=>{
 if(e.touches[0]){
  mouse.x=e.touches[0].clientX;
  mouse.y=e.touches[0].clientY;
  sendMove();
 }
},{passive:true});

addEventListener("keydown",e=>{
 if(e.code==="Space"){
  e.preventDefault();
  send({type:"split"});
 }
 if(e.code==="KeyW")send({type:"eject"});
});

function send(data){
 if(socket&&socket.readyState===WebSocket.OPEN)
  socket.send(JSON.stringify(data));
}

function connect(){
 const protocol=location.protocol==="https:"?"wss://":"ws://";
 socket=new WebSocket(protocol+location.host);

 socket.onopen=()=>{
  document.getElementById("status").textContent="🟢 Online";
  send({
   type:"join",
   name:document.getElementById("name").value
  });
  document.getElementById("menu").classList.add("hidden");
 };

 socket.onmessage=e=>{
  const msg=JSON.parse(e.data);

  if(msg.type==="welcome"){
   myId=msg.id;
   world=msg.world;
  }

  if(msg.type==="state"){
   state=msg;
   updateHUD();
  }

  if(msg.type==="dead"){
   document.getElementById("finalScore").textContent=msg.score;
   document.getElementById("dead").classList.remove("hidden");
  }

  if(msg.type==="error")alert(msg.message);
 };

 socket.onclose=()=>{
  document.getElementById("status").textContent="🔴 Disconnesso";
 };
}

function getMe(){
 return state.players.find(p=>p.id===myId);
}

function sendMove(){
 const now=performance.now();
 if(now-lastSend<30)return;
 lastSend=now;

 const me=getMe();
 if(!me)return;

 const x=(mouse.x-W/2)/camera.zoom+camera.x;
 const y=(mouse.y-H/2)/camera.zoom+camera.y;

 send({type:"move",x,y});
}

function updateHUD(){
 const me=getMe();
 if(!me)return;

 let mass=0;

 for(const c of me.cells||[])
  mass+=c.r*c.r;

 document.getElementById("mass").textContent=Math.floor(mass);
 document.getElementById("score").textContent=me.score;

 const ranking=[...state.players]
  .map(p=>{
   let m=0;
   for(const c of p.cells||[])m+=c.r*c.r;
   return {name:p.name,mass:m,me:p.id===myId};
  })
  .sort((a,b)=>b.mass-a.mass)
  .slice(0,8);

 document.getElementById("players").innerHTML=
 ranking.map((p,i)=>`
 <div class="row" style="${p.me?'color:#42d392;font-weight:bold':''}">
 <span>${i+1}. ${escapeHTML(p.name)}</span>
 <span>${Math.floor(p.mass)}</span>
 </div>`).join("");
}

function escapeHTML(s){
 return String(s)
 .replaceAll("&","&amp;")
 .replaceAll("<","&lt;")
 .replaceAll(">","&gt;");
}

function screen(x,y){
 return {
  x:(x-camera.x)*camera.zoom+W/2,
  y:(y-camera.y)*camera.zoom+H/2
 };
}

function drawGrid(){
 const size=100;
 const left=camera.x-W/2/camera.zoom;
 const top=camera.y-H/2/camera.zoom;

 ctx.strokeStyle="#ffffff08";
 ctx.lineWidth=1;

 for(let x=Math.floor(left/size)*size;
     x<left+W/camera.zoom+size;x+=size){
  const p=screen(x,0);
  ctx.beginPath();
  ctx.moveTo(p.x,0);
  ctx.lineTo(p.x,H);
  ctx.stroke();
 }

 for(let y=Math.floor(top/size)*size;
     y<top+H/camera.zoom+size;y+=size){
  const p=screen(0,y);
  ctx.beginPath();
  ctx.moveTo(0,p.y);
  ctx.lineTo(W,p.y);
  ctx.stroke();
 }
}

function draw(){
 ctx.clearRect(0,0,W,H);
 ctx.fillStyle="#07101d";
 ctx.fillRect(0,0,W,H);

 drawGrid();

 const a=screen(0,0);
 const b=screen(world,world);

 ctx.strokeStyle="#42d39255";
 ctx.lineWidth=5;
 ctx.strokeRect(a.x,a.y,b.x-a.x,b.y-a.y);

 for(const f of state.foods||[]){
  const p=screen(f.x,f.y);
  ctx.beginPath();
  ctx.arc(p.x,p.y,f.r*camera.zoom,0,Math.PI*2);
  ctx.fillStyle=f.color;
  ctx.fill();
 }

 const players=[...(state.players||[])];

 for(const p of players){
  for(const c of p.cells||[]){
   drawCell(p,c);
  }
 }

 updateCamera();
}

function drawCell(player,c){
 const p=screen(c.x,c.y);
 const r=c.r*camera.zoom;

 ctx.beginPath();
 ctx.arc(p.x,p.y,r,0,Math.PI*2);
 ctx.fillStyle=player.color;
 ctx.fill();

 ctx.beginPath();
 ctx.arc(
  p.x-r*.28,
  p.y-r*.28,
  r*.34,
  0,Math.PI*2
 );
 ctx.fillStyle="#ffffff20";
 ctx.fill();

 if(r>18){
  ctx.fillStyle="#fff";
  ctx.textAlign="center";
  ctx.textBaseline="middle";
  ctx.font=`bold ${Math.max(10,r*.24)}px Arial`;
  ctx.fillText(player.name,p.x,p.y);
 }
}

function updateCamera(){
 const me=getMe();
 if(!me||!me.cells||!me.cells.length)return;

 const c=me.cells[0];

 camera.x+=(c.x-camera.x)*.12;
 camera.y+=(c.y-camera.y)*.12;

 const z=Math.max(.45,Math.min(1.15,42/c.r));

 camera.zoom+=(z-camera.zoom)*.05;
}

function loop(){
 draw();
 requestAnimationFrame(loop);
}

loop();
</script>
</body>
</html>
'@ | Set-Content -Encoding UTF8 (Join-Path $public "index.html")

$zip = Join-Path $PWD "cell-arena.zip"

if(Test-Path $zip){
  Remove-Item $zip -Force
}

Compress-Archive -Path $root -DestinationPath $zip -Force

Write-Host ""
Write-Host "Creato:"
Write-Host $zip
Write-Host ""
Write-Host "Per avviare il gioco:"
Write-Host "1. Estrai cell-arena.zip"
Write-Host "2. Entra nella cartella cell-arena"
Write-Host "3. Esegui: npm install"
Write-Host "4. Esegui: npm start"
Write-Host "5. Apri: http://localhost:3000"
```
