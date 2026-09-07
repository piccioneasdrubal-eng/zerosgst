package zerolegend;

import java.io.*;
import java.net.*;
import java.net.http.*;
import java.nio.charset.StandardCharsets;
import java.security.*;
import java.time.Duration;
import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicLong;

/**
 * ZeroLegend Java realtime engine - PvP phase.
 * JDK 21 only, no external dependencies.
 * Wire protocol intentionally mirrors the existing Node client.
 */
public final class ZeroLegendServer {
  static final int PORT = Integer.parseInt(env("PORT","3000"));
  static final int MAX_PLAYERS = Integer.parseInt(env("MAX_PLAYERS","160"));
  static final int MAX_BOTS = Math.min(100,(int)(MAX_PLAYERS*.35));
  static final int W=5000,H=5000;
  static final long TICK_MS=33, STATE_MS=50;
  static final double EAT_FACTOR=1.15;
  static final Random RNG=new Random();
  static final AtomicLong IDS=new AtomicLong();
  static final HttpClient HTTP=HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5)).build();
  static final ExecutorService API_EXEC=Executors.newFixedThreadPool(2,r->{Thread t=new Thread(r,"api-sync");t.setDaemon(true);return t;});
  static final String AUTH_URL=env("AUTH_VERIFY_URL","https://zerothelegend.gamer.gd/auth/auth.php");
  static final String API_SECRET=env("API_SECRET","");
  static final String ECONOMY_URL=env("ECONOMY_API_URL","https://zerothelegend.gamer.gd/auth/economy.php");
  static final boolean AUTH_REQUIRED=!"0".equals(System.getenv().getOrDefault("AUTH_REQUIRED","1"));
  static final Room ROOM=new Room();

  static String env(String k,String d){String v=System.getenv(k);return v==null||v.isBlank()?d:v.trim();}
  static long now(){return System.currentTimeMillis();}
  static String id(){return Long.toString(IDS.incrementAndGet(),36)+"-"+Long.toString(Math.abs(RNG.nextLong()),36);}
  static double clamp(double v,double a,double b){return Math.max(a,Math.min(b,v));}
  static double d2(double ax,double ay,double bx,double by){double x=ax-bx,y=ay-by;return x*x+y*y;}
  static Map<String,Object> map(Object... kv){Map<String,Object>m=new LinkedHashMap<>();for(int i=0;i+1<kv.length;i+=2)m.put(String.valueOf(kv[i]),kv[i+1]);return m;}

  public static void main(String[] args)throws Exception{
    try(ServerSocket ss=new ServerSocket(PORT,128,InetAddress.getByName("0.0.0.0"))){
      System.out.println("ZeroLegend Java PvP listening on "+PORT);
      ROOM.spawnBots(Math.min(Integer.parseInt(env("INITIAL_BOTS","8")),MAX_BOTS),30);
      Thread t=new Thread(ROOM::loop,"game-loop");t.setDaemon(true);t.start();
      while(true){Socket s=ss.accept();Thread c=new Thread(()->handle(s),"conn-"+IDS.incrementAndGet());c.setDaemon(true);c.start();}
    }
  }
  static void handle(Socket socket){
    try(Socket s=socket){s.setSoTimeout(15000);InputStream in=s.getInputStream();OutputStream out=s.getOutputStream();String h=readHeaders(in);if(h==null)return;String first=h.lines().findFirst().orElse("");
      if(first.startsWith("GET ")&&first.contains(" HTTP/")){String path=first.substring(4,first.indexOf(" HTTP/"));String key=header(h,"Sec-WebSocket-Key");if(key!=null&&path.split("\\?",2)[0].equals("/")){handshake(out,key);wsSession(s,in,out);return;}http(out,path);return;}
      text(out,405,"Method Not Allowed");
    }catch(Exception e){e.printStackTrace();}
  }
  static String readHeaders(InputStream in)throws IOException{ByteArrayOutputStream b=new ByteArrayOutputStream();int prev=0,c;while(b.size()<32768&&(c=in.read())!=-1){b.write(c);if(prev=='\r'&&c=='\n'){byte[]a=b.toByteArray();int n=a.length;if(n>=4&&a[n-4]=='\r'&&a[n-3]=='\n')return b.toString(StandardCharsets.ISO_8859_1);}prev=c;}return null;}
  static String header(String h,String n){for(String l:h.split("\\r\\n")){int i=l.indexOf(':');if(i>0&&l.substring(0,i).trim().equalsIgnoreCase(n))return l.substring(i+1).trim();}return null;}
  static void handshake(OutputStream o,String key)throws Exception{MessageDigest md=MessageDigest.getInstance("SHA-1");String a=Base64.getEncoder().encodeToString(md.digest((key+"258EAFA5-E914-47DA-95CA-C5AB0DC85B11").getBytes(StandardCharsets.ISO_8859_1)));o.write(("HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: "+a+"\r\n\r\n").getBytes(StandardCharsets.ISO_8859_1));o.flush();}
  static void http(OutputStream o,String path)throws IOException{String p=path.split("\\?",2)[0];Map<String,Object>j=map("ok",true,"service","zerolegend-java-pvp","players",ROOM.size(),"maxPlayers",MAX_PLAYERS,"bots",ROOM.botCount());if(p.equals("/health")||p.equals("/healthz")){j.put("uptime",(now()-ROOM.started)/1000);}else if(p.equals("/api/room")){j.put("capacity",Math.max(0,MAX_PLAYERS-ROOM.size()));}else if(p.equals("/api/state")){j.put("pellets",ROOM.food.size());j.put("pvpEvent",ROOM.pvpEvent);}else{text(o,404,"Not Found");return;}byte[]b=Json.stringify(j).getBytes(StandardCharsets.UTF_8);String h="HTTP/1.1 200 OK\r\nContent-Type: application/json; charset=utf-8\r\nAccess-Control-Allow-Origin: *\r\nCache-Control: no-store\r\nContent-Length: "+b.length+"\r\nConnection: close\r\n\r\n";o.write(h.getBytes(StandardCharsets.ISO_8859_1));o.write(b);o.flush();}
  static void text(OutputStream o,int code,String s)throws IOException{byte[]b=s.getBytes(StandardCharsets.UTF_8);o.write(("HTTP/1.1 "+code+" "+s+"\r\nContent-Type: text/plain; charset=utf-8\r\nContent-Length: "+b.length+"\r\nConnection: close\r\n\r\n").getBytes(StandardCharsets.ISO_8859_1));o.write(b);o.flush();}

  static void wsSession(Socket socket,InputStream in,OutputStream out)throws Exception{
    Player p=null;long lastTarget=0,lastAction=0,lastChat=0,lastAbility=0;
    try{while(true){Frame f=Frame.read(in);if(f==null)break;if(f.opcode==8)break;if(f.opcode==9){Frame.write(out,new byte[]{(byte)0x8A,0});continue;}if(f.opcode!=1)continue;if(f.payload.length>8192)continue;
      Map<String,Object>m=Json.parseObject(new String(f.payload,StandardCharsets.UTF_8));String type=Json.str(m.get("type"));if(type==null)continue;
      if(p==null){if(!"join".equals(type))continue;String token=Json.str(m.get("authToken"));Map<String,Object>a=AUTH_REQUIRED?verify(token):Map.of();if(AUTH_REQUIRED&&a==null){send(out,map("type","auth-error","error","Sessione mancante o non valida."));break;}p=ROOM.join(m,a);if(p==null){send(out,map("type","room-full","players",ROOM.size(),"maxPlayers",MAX_PLAYERS,"retryAfter",5000));break;}p.authToken=token;p.out=out;ROOM.loadPersistentStats(p,a);send(out,p.welcome());ROOM.syncWallet(p,out);continue;}
      long n=now();
      switch(type){
        case "target"->{if(n-lastTarget>=35){p.tx=clamp(Json.num(m.get("x"),p.x),0,W);p.ty=clamp(Json.num(m.get("y"),p.y),0,H);lastTarget=n;}}
        case "split"->{if(n-lastAction>=70){lastAction=n;send(out,map("type","action-result","action","split","ok",ROOM.split(p)));}}
        case "eject"->{if(n-lastAction>=80){lastAction=n;send(out,map("type","action-result","action","eject","ok",ROOM.eject(p)));}}
        case "shoot-virus"->{if(n-lastAction>=100){lastAction=n;send(out,map("type","action-result","action","shoot-virus","ok",ROOM.shootVirus(p)));}}
        case "godmode"->{send(out,map("type","action-result","action","godmode","ok",ROOM.god(p),"durationMs",10000,"cooldownMs",45000));}
        case "sprint"->p.sprint=Json.bool(m.get("on"));
        case "dash"->ROOM.dash(p); case "blink"->ROOM.blink(p); case "shockwave"->ROOM.shockwave(p);case "freeze"->ROOM.freezeNearby(p);case "decoy"->ROOM.decoy(p);case "mass-burst"->ROOM.massBurst(p);case "heal"->ROOM.heal(p);case "rage"->ROOM.rage(p);case "reveal"->ROOM.reveal(p);case "autopilot"->p.autoPilot=Json.bool(m.get("on"));
        case "pvp"->{if(n-lastAbility<120)return;lastAbility=n;String a=Json.str(m.get("action"));boolean ok=ROOM.pvp(p,a,m);send(out,map("type","feature-result","requestId",m.get("requestId"),"category","pvp","action",a,"ok",ok,"summary",p.summary()));}
        case "shop","economy"->{ROOM.shop(p,m,out);}
        case "wallet-sync"->{ROOM.syncWallet(p,out);}
        case "refresh-skin"->{ROOM.syncWallet(p,out);}
        case "admin"->{ROOM.admin(p,m,out);}
        case "f2"->{ROOM.feature(p,m,out);}
        case "chat"->{if(n-lastChat>=700&&n>=p.mutedUntil){String s=Json.str(m.get("text"));if(s!=null&&!s.isBlank()){s=s.replaceAll("[\\u0000-\\u001F\\u007F]","");s=s.substring(0,Math.min(120,s.length()));lastChat=n;ROOM.broadcast(map("type","chat","name",p.name,"id",p.id,"isBot",p.bot,"team",p.team,"text",s));}}}
        case "ping"->send(out,map("type","pong","t",m.get("t")));
      }
    }}finally{if(p!=null)ROOM.leave(p);}
  }
  static void send(OutputStream o,Object x){try{Frame.write(o,Json.stringify(x).getBytes(StandardCharsets.UTF_8));}catch(Exception ignored){}}
  static Map<String,Object> verify(String token){if(token==null||token.isBlank()||AUTH_URL.isBlank()||API_SECRET.isBlank())return null;try{HttpRequest q=HttpRequest.newBuilder(URI.create(AUTH_URL)).timeout(Duration.ofSeconds(5)).header("Content-Type","application/json").header("Accept","application/json").header("X-Api-Secret",API_SECRET).POST(HttpRequest.BodyPublishers.ofString(Json.stringify(map("action","verify","token",token)))).build();HttpResponse<String>r=HTTP.send(q,HttpResponse.BodyHandlers.ofString());if(r.statusCode()<200||r.statusCode()>=300)return null;Map<String,Object>d=Json.parseObject(r.body());return Json.bool(d.get("ok"))?Json.obj(d.get("user")):null;}catch(Exception e){return null;}}

  static final class Room{
    final long started=now();final ConcurrentHashMap<String,Player>players=new ConcurrentHashMap<>();final CopyOnWriteArrayList<Food>food=new CopyOnWriteArrayList<>();final CopyOnWriteArrayList<Effect>effects=new CopyOnWriteArrayList<>();final Set<String>banned=ConcurrentHashMap.newKeySet();final Set<String>ranked=ConcurrentHashMap.newKeySet();volatile boolean paused;volatile Map<String,Object>pvpEvent=null;
    Room(){for(int i=0;i<1200;i++)food.add(new Food(id(),RNG.nextDouble()*W,RNG.nextDouble()*H,1,0,0,null));}
    int size(){return players.size();}int botCount(){int n=0;for(Player p:players.values())if(p.bot)n++;return n;}
    void loadPersistentStats(Player p,Map<String,Object>a){
      Map<String,Object> st=Json.obj(a.get("stats"));
      p.matches=Json.integer(st.get("matches"),0); p.kills=Json.integer(st.get("kills"),0); p.deaths=Json.integer(st.get("deaths"),0);
      p.bestMass=Json.num(st.get("best_mass"),0); p.elo=Json.integer(st.get("elo"),1000); p.killStreak=Json.integer(st.get("kill_streak"),0);
    }
    void syncStatsAsync(Player p){
      if(p==null||p.bot||p.accountId<=0||p.authToken==null||p.authToken.isBlank())return;
      Map<String,Object> stats=map("matches",p.matches,"kills",p.kills,"deaths",p.deaths,"bestMass",Math.round(p.bestMass),"elo",p.elo,"killStreak",p.killStreak,"playSeconds",0);
      API_EXEC.submit(()->{try{HttpRequest q=HttpRequest.newBuilder(URI.create(AUTH_URL)).timeout(Duration.ofSeconds(7)).header("Content-Type","application/json").header("Accept","application/json").header("X-Api-Secret",API_SECRET).POST(HttpRequest.BodyPublishers.ofString(Json.stringify(map("action","sync_stats","token",p.authToken,"stats",stats)))).build();HTTP.send(q,HttpResponse.BodyHandlers.ofString());}catch(Exception ignored){}});
    }
Player join(Map<String,Object>m,Map<String,Object>a){if(size()>=MAX_PLAYERS)return null;String name=Json.str(m.get("name"));if(name==null||name.isBlank())name=Json.str(a.get("name"));if(name==null||name.isBlank())name="Player";name=safe(name);Player p=new Player(id(),name,false);p.accountId=(long)Json.num(a.get("id"),0);p.role=Json.str(a.get("role"));p.admin=Json.bool(a.get("is_admin"))||"admin".equalsIgnoreCase(p.role)||"owner".equalsIgnoreCase(p.role);p.coins=Json.integer(a.get("coins"),1000);p.equippedSkin=Json.str(a.get("equipped_skin"));if(p.equippedSkin==null)p.equippedSkin="default";p.team=Json.integer(m.get("team"),-1);p.mode="teams".equalsIgnoreCase(Json.str(m.get("mode")))?"teams":"ffa";if(!"teams".equals(p.mode))p.team=-1;p.color=Json.str(m.get("color"));if(p.color==null||!p.color.matches("#[0-9a-fA-F]{6}"))p.color="#6ee7ff";p.x=RNG.nextDouble()*W;p.y=RNG.nextDouble()*H;p.tx=p.x;p.ty=p.y;players.put(p.id,p);return p;}
    String safe(String s){s=s.replaceAll("[<>]","").trim();return s.substring(0,Math.min(16,s.length()));}
    void leave(Player p){players.remove(p.id);ranked.remove(p.id);}
    void spawnBots(int n,double mass){for(int i=0;i<n&&size()<MAX_PLAYERS&&botCount()<MAX_BOTS;i++){Player p=new Player(id(),"Bot"+(botCount()+1),true);p.mass=mass;p.x=RNG.nextDouble()*W;p.y=RNG.nextDouble()*H;p.tx=p.x;p.ty=p.y;p.botDifficulty=1;players.put(p.id,p);}}
    boolean can(Player p,double cost,long cd){long n=now();if(p.dead||p.mass<cost||n-p.lastAbility<cd)return false;p.mass-=cost;p.lastAbility=n;return true;}
    boolean split(Player p){if(!can(p,20,500)||p.cells>=12)return false;double a=Math.atan2(p.ty-p.y,p.tx-p.x);double half=p.mass/2;p.mass=half;p.cells++;p.vx=Math.cos(a)*14;p.vy=Math.sin(a)*14;return true;}
    boolean eject(Player p){if(!can(p,14,80))return false;double a=Math.atan2(p.ty-p.y,p.tx-p.x);food.add(new Food(id(),clamp(p.x+Math.cos(a)*35,5,W-5),clamp(p.y+Math.sin(a)*35,5,H-5),14,Math.cos(a)*17,Math.sin(a)*17,p.id));return true;}
    boolean shootVirus(Player p){if(!can(p,30,100))return false;double a=Math.atan2(p.ty-p.y,p.tx-p.x);effects.add(new Effect(id(),"virus",p.x,p.y,now()+7000,p.id,Math.cos(a)*600,Math.sin(a)*600,160));return true;}
    boolean god(Player p){long n=now();if(!p.admin||n-p.lastGod<45000)return false;p.lastGod=n;p.godUntil=n+10000;return true;}
    void dash(Player p){if(!can(p,7,1200))return;p.x=clamp(p.x+dirx(p)*320,10,W-10);p.y=clamp(p.y+diry(p)*320,10,H-10);}
    void blink(Player p){if(!can(p,18,3000))return;p.x=clamp(p.x+dirx(p)*480,10,W-10);p.y=clamp(p.y+diry(p)*480,10,H-10);}
    void shockwave(Player p){if(!can(p,20,4000))return;for(Player q:enemyList(p,420)){double a=Math.atan2(q.y-p.y,q.x-p.x);q.x=clamp(q.x+Math.cos(a)*220,10,W-10);q.y=clamp(q.y+Math.sin(a)*220,10,H-10);q.freezeUntil=Math.max(q.freezeUntil,now()+350);q.damageTaken+=4;p.damageDealt+=4;}}
    void freezeNearby(Player p){if(!can(p,12,2500))return;for(Player q:enemyList(p,360))q.freezeUntil=Math.max(q.freezeUntil,now()+900);}
    void decoy(Player p){if(!can(p,10,3500))return;effects.add(new Effect(id(),"decoy",p.x+dirx(p)*180,p.y+diry(p)*180,now()+8000,p.id,0,0,Math.max(20,p.mass*.35)));}
    void massBurst(Player p){if(!can(p,25,5000))return;p.mass+=Math.min(30,p.mass*.12);}
    void heal(Player p){if(!can(p,10,1000))return;p.mass+=10;}
    void rage(Player p){if(!can(p,18,5000))return;p.rageUntil=now()+7000;}
    void reveal(Player p){if(!can(p,8,3000))return;p.revealUntil=now()+7000;}
    List<Player>enemyList(Player p,double r){List<Player>l=new ArrayList<>();for(Player q:players.values())if(q.id!=p.id&&!q.dead&&(p.team<0||q.team!=p.team)&&d2(p.x,p.y,q.x,q.y)<=r*r)l.add(q);l.sort(Comparator.comparingDouble(q->d2(p.x,p.y,q.x,q.y)));return l;}
    Player enemy(Player p,String target){if(target!=null){Player q=players.get(target);if(q!=null&&!q.dead&&q.id!=p.id&&(p.team<0||q.team!=p.team))return q;}List<Player>l=enemyList(p,900);return l.isEmpty()?null:l.get(0);}

    boolean pvp(Player p,String a,Map<String,Object>x){if(a==null)return false;Player t=enemy(p,Json.str(x.get("targetId")));long n=now();switch(a){
      case "mark"-> {if(t==null)return false;p.markedTargetId=t.id;return true;}
      case "hunter"->{if(!can(p,18,3500))return false;p.hunterUntil=n+7000;p.revealUntil=Math.max(p.revealUntil,n+7000);return true;}
      case "parry"->{if(!can(p,10,3500))return false;p.parryUntil=n+1100;return true;}
      case "stun"->{if(t==null||!can(p,12,2200))return false;t.freezeUntil=Math.max(t.freezeUntil,n+900);p.damageDealt+=2;t.damageTaken+=2;return true;}
      case "slow"->{if(t==null||!can(p,9,2000))return false;t.slowUntil=Math.max(t.slowUntil,n+2200);p.damageDealt++;t.damageTaken++;return true;}
      case "knockback"->{if(t==null||!can(p,11,1700))return false;double a2=Math.atan2(t.y-p.y,t.x-p.x);t.x=clamp(t.x+Math.cos(a2)*260,10,W-10);t.y=clamp(t.y+Math.sin(a2)*260,10,H-10);p.damageDealt+=3;t.damageTaken+=0;return true;}
      case "trap"->{if(!can(p,14,3500))return false;effects.add(new Effect(id(),"trap",clamp(p.x+dirx(p)*260,30,W-30),clamp(p.y+diry(p)*260,30,H-30),n+12000,p.id,0,0,80));return true;}
      case "mine"->{if(!can(p,18,4200))return false;effects.add(new Effect(id(),"mine",clamp(p.x+dirx(p)*360,30,W-30),clamp(p.y+diry(p)*360,30,H-30),n+15000,p.id,0,0,70));return true;}
      case "lifesteal"->{if(t==null||!can(p,15,2600))return false;double stolen=Math.min(35,Math.max(8,t.mass*.04));double take=Math.min(stolen,Math.max(0,t.mass-5));t.mass-=take;p.mass+=take;p.damageDealt+=take;t.damageTaken+=take;return take>0;}
      case "execute"->{if(t==null||!can(p,25,4000))return false;if(t.mass>p.mass*.22)return false;eliminate(t,p,"execution");return true;}
      case "shieldbreak"->{if(t==null||!can(p,13,2800))return false;t.shieldUntil=0;t.respawnShieldUntil=0;return true;}
      case "duel"->{if(t==null||p.duelId!=null||t.duelId!=null)return false;String id=id();p.duelId=id;t.pendingDuelId=id;duels.put(id,new Duel(id,p.id,t.id,n));return true;}
      case "duelAccept"->{String id=Json.str(x.get("duelId"));Duel d=duels.get(id!=null?id:p.pendingDuelId);if(d==null||!d.b.equals(p.id)||d.resolved)return false;d.accepted=true;d.startedAt=n;p.duelId=d.id;p.pendingDuelId=null;Player first=players.get(d.a);if(first!=null)first.duelId=d.id;return true;}
      case "duelCancel"->{String id=Json.str(x.get("duelId"));Duel d=duels.get(id!=null?id:(p.duelId!=null?p.duelId:p.pendingDuelId));if(d==null)return false;cancelDuel(d);return true;}
      case "arenaIn"->{p.arena=true;return true;} case "arenaOut"->{p.arena=false;return true;}
      case "spectate"->{Player q=players.get(Json.str(x.get("targetId")));if(q==null||q.id.equals(p.id)||q.dead)return false;p.spectating=true;p.spectateTargetId=q.id;return true;}
      default-> {return false;}
    }}
    final ConcurrentHashMap<String,Duel>duels=new ConcurrentHashMap<>();
    void cancelDuel(Duel d){d.resolved=true;Player a=players.get(d.a),b=players.get(d.b);if(a!=null&&Objects.equals(a.duelId,d.id))a.duelId=null;if(b!=null&&Objects.equals(b.duelId,d.id))b.duelId=null;if(b!=null&&Objects.equals(b.pendingDuelId,d.id))b.pendingDuelId=null;duels.remove(d.id);}
    void eliminate(Player v,Player k,String reason){if(v.dead)return;v.dead=true;v.respawnAt=now()+3000;v.deaths++;v.killStreak=0;k.kills++;k.killStreak++;k.bestKillStreak=Math.max(k.bestKillStreak,k.killStreak);k.pvpPoints+=25;k.elo+=15;v.elo=Math.max(0,v.elo-12);if(k.mass>k.bestMass)k.bestMass=k.mass;if(v.mass>v.bestMass)v.bestMass=v.mass;pvpEvent=map("type","kill","killer",k.name,"victim",v.name,"reason",reason,"at",now());syncStatsAsync(k);syncStatsAsync(v);}

    void tick(double dt){if(paused)return;long n=now();for(Player p:players.values()){if(p.dead){if(n>=p.respawnAt){p.dead=false;p.mass=20;p.cells=1;p.x=RNG.nextDouble()*W;p.y=RNG.nextDouble()*H;p.respawnShieldUntil=n+2500;}continue;}if(p.freezeUntil>n)continue;if(p.bot&&RNG.nextDouble()<.035){p.tx=clamp(p.x+RNG.nextGaussian()*800,0,W);p.ty=clamp(p.y+RNG.nextGaussian()*800,0,H);}double speed=3*(p.sprint?1.9:1)*(p.rageUntil>n?1.25:1)*(p.slowUntil>n?.55:1);p.x=clamp(p.x+dirx(p)*speed*60*dt,10,W-10);p.y=clamp(p.y+diry(p)*speed*60*dt,10,H-10);eatFood(p);}
      while(food.size()<1200)food.add(new Food(id(),RNG.nextDouble()*W,RNG.nextDouble()*H,1,0,0,null));effects.removeIf(e->e.expiresAt<n);triggerEffects(n);collisions(n);resolveDuels(n);if(n%STATE_MS<35)broadcastStates();}
    void eatFood(Player p){for(Food f:food){if(d2(p.x,p.y,f.x,f.y)<Math.pow(8+Math.sqrt(p.mass)*2,2)){p.mass+=f.mass;food.remove(f);break;}}}
    void triggerEffects(long n){for(Effect e:effects){if(e.type.equals("virus")){e.x+=e.vx*.033;e.y+=e.vy*.033;for(Player p:players.values())if(!p.dead&&!p.id.equals(e.owner)&&d2(p.x,p.y,e.x,e.y)<e.radius*e.radius){p.mass=Math.max(5,p.mass-22);p.freezeUntil=Math.max(p.freezeUntil,n+400);e.expiresAt=0;break;}}
      else if(e.type.equals("trap")||e.type.equals("mine")){Player owner=players.get(e.owner);for(Player p:players.values())if(!p.dead&&!p.id.equals(e.owner)&&(owner==null||owner.team<0||p.team!=owner.team)&&d2(p.x,p.y,e.x,e.y)<e.radius*e.radius){if(e.type.equals("trap")){p.slowUntil=Math.max(p.slowUntil,n+1800);p.freezeUntil=Math.max(p.freezeUntil,n+350);if(owner!=null)owner.damageDealt+=6;}else{p.mass=Math.max(5,p.mass-22);p.freezeUntil=Math.max(p.freezeUntil,n+650);if(owner!=null)owner.damageDealt+=22;}e.expiresAt=0;break;}}
    }}
    void collisions(long n){List<Player>ps=new ArrayList<>(players.values());for(int i=0;i<ps.size();i++)for(int j=i+1;j<ps.size();j++){Player a=ps.get(i),b=ps.get(j);if(a.dead||b.dead||a.id.equals(b.id)||(a.team>=0&&a.team==b.team)||a.godUntil>n||b.godUntil>n||a.shieldUntil>n||b.shieldUntil>n)continue;double d=Math.sqrt(d2(a.x,a.y,b.x,b.y));double ra=10*Math.sqrt(Math.max(1,a.mass)),rb=10*Math.sqrt(Math.max(1,b.mass));if(d>=Math.max(ra,rb)*.75)continue;if(a.mass>b.mass*EAT_FACTOR){if(b.parryUntil>n){b.parryUntil=0;continue;}a.mass+=b.mass*.8;eliminate(b,a,"eat");}else if(b.mass>a.mass*EAT_FACTOR){if(a.parryUntil>n){a.parryUntil=0;continue;}b.mass+=a.mass*.8;eliminate(a,b,"eat");}}}
    void resolveDuels(long n){for(Duel d:new ArrayList<>(duels.values())){Player a=players.get(d.a),b=players.get(d.b);if(a==null||b==null||a.dead||b.dead){cancelDuel(d);continue;}if(!d.accepted&&n-d.createdAt>15000){cancelDuel(d);continue;}if(d.accepted&&n-d.startedAt>45000){cancelDuel(d);}}}
    double dirx(Player p){double x=p.tx-p.x,y=p.ty-p.y,l=Math.hypot(x,y);return l<.001?0:x/l;}double diry(Player p){double x=p.tx-p.x,y=p.ty-p.y,l=Math.hypot(x,y);return l<.001?0:y/l;}
    void loop(){long last=now();while(true){long n=now();tick(Math.min(.06,Math.max(.001,(n-last)/1000d)));last=n;try{Thread.sleep(TICK_MS);}catch(InterruptedException e){return;}}}

    void broadcast(Object o){String s=Json.stringify(o);for(Player p:players.values())if(p.out!=null)sendRaw(p.out,s);}
    void sendRaw(OutputStream o,String s){try{Frame.write(o,s.getBytes(StandardCharsets.UTF_8));}catch(Exception ignored){}}
    void send(OutputStream o,Object x){sendRaw(o,Json.stringify(x));}
    void broadcastStates(){for(Player p:players.values())if(p.out!=null)send(p.out,state(p));}
    Map<String,Object>state(Player me){long n=now();List<Object>ps=new ArrayList<>();for(Player p:players.values()){if(p.dead)continue;if(p.id.equals(me.id)||d2(me.x,me.y,p.x,p.y)<1700*1700||me.revealUntil>n)ps.add(p.snap(p.id.equals(me.id)));}List<Object>ff=new ArrayList<>();for(Food f:food)if(d2(me.x,me.y,f.x,f.y)<1850*1850)ff.add(f.json());List<Object>tr=new ArrayList<>(),mi=new ArrayList<>();for(Effect e:effects){if(e.type.equals("trap"))tr.add(e.json());if(e.type.equals("mine"))mi.add(e.json());}List<Player>rank=new ArrayList<>(players.values());rank.sort((a,b)->Double.compare(b.mass,a.mass));List<Object>lb=new ArrayList<>();for(Player p:rank.subList(0,Math.min(10,rank.size())))lb.add(map("id",p.id,"name",p.name,"mass",Math.round(p.mass),"isBot",p.bot,"elo",p.elo,"pvpPoints",p.pvpPoints));return map("type","state","players",ps,"pellets",ff,"powerups",List.of(),"virusProjectiles",effects.stream().filter(e->e.type.equals("virus")).map(Effect::json).toList(),"zones",List.of(),"killfeed",pvpEvent==null?List.of():List.of(pvpEvent),"decoys",effects.stream().filter(e->e.type.equals("decoy")).map(Effect::json).toList(),"traps",tr,"mines",mi,"events",List.of(),"world",map("width",W,"height",H),"leaderboard",lb);
    }
    Map<String,Object>featureSummary(Player p){return p.summary();}
    void feature(Player p,Map<String,Object>m,OutputStream out){String cat=Json.str(m.get("category"));String a=Json.str(m.get("action"));if("pvp".equalsIgnoreCase(cat)){send(out,map("type","feature-result","requestId",m.get("requestId"),"category","pvp","action",a,"ok",pvp(p,a,m),"summary",p.summary()));}else if("shop".equalsIgnoreCase(cat)||"economy".equalsIgnoreCase(cat))shop(p,m,out);else if("admin".equalsIgnoreCase(cat))admin(p,m,out);else send(out,map("type","feature-result","requestId",m.get("requestId"),"category",cat,"action",a,"ok",false,"error","Categoria non supportata"));}
    void shop(Player p,Map<String,Object>m,OutputStream out){String a=Json.str(m.get("action"));if(p.authToken==null){send(out,map("type","feature-result","category","shop","action",a,"ok",false,"error","Sessione mancante"));return;}try{Map<String,Object>b=new LinkedHashMap<>(m);b.put("action",("buy".equals(a)?"purchase_item":a));b.put("token",p.authToken);HttpRequest q=HttpRequest.newBuilder(URI.create(ECONOMY_URL)).timeout(Duration.ofSeconds(7)).header("Content-Type","application/json").POST(HttpRequest.BodyPublishers.ofString(Json.stringify(b))).build();HttpResponse<String>r=HTTP.send(q,HttpResponse.BodyHandlers.ofString());Map<String,Object>d=Json.parseObject(r.body());if(Json.bool(d.get("ok"))){Map<String,Object>w=Json.obj(d.get("wallet"));if(!w.isEmpty()){p.coins=Json.integer(w.get("coins"),p.coins);p.equippedSkin=Json.str(w.get("equippedSkin"))==null?p.equippedSkin:Json.str(w.get("equippedSkin"));}}send(out,map("type","feature-result","category","shop","action",a,"ok",Json.bool(d.get("ok")),"data",d,"wallet",map("coins",p.coins,"equippedSkin",p.equippedSkin)));}catch(Exception e){send(out,map("type","feature-result","category","shop","action",a,"ok",false,"error","Economy API non raggiungibile"));}}
    void syncWallet(Player p,OutputStream out){if(p.authToken==null)return;Map<String,Object>b=map("action","wallet","token",p.authToken);try{HttpRequest q=HttpRequest.newBuilder(URI.create(ECONOMY_URL)).timeout(Duration.ofSeconds(7)).header("Content-Type","application/json").POST(HttpRequest.BodyPublishers.ofString(Json.stringify(b))).build();Map<String,Object>d=Json.parseObject(HTTP.send(q,HttpResponse.BodyHandlers.ofString()).body());Map<String,Object>w=Json.obj(d.get("wallet"));if(Json.bool(d.get("ok"))&&!w.isEmpty()){p.coins=Json.integer(w.get("coins"),p.coins);String s=Json.str(w.get("equippedSkin"));if(s!=null)p.equippedSkin=s;send(out,map("type","wallet-update","wallet",w));}}catch(Exception ignored){}}
    boolean setCoinsPersistent(Player actor,Player target,int value){
      if(actor.authToken==null||actor.authToken.isBlank()||target.accountId<=0)return false;
      try{Map<String,Object>b=map("action","admin_set_coins","token",actor.authToken,"target_user_id",target.accountId,"coins",value);HttpRequest q=HttpRequest.newBuilder(URI.create(AUTH_URL)).timeout(Duration.ofSeconds(7)).header("Content-Type","application/json").header("Accept","application/json").header("X-Api-Secret",API_SECRET).POST(HttpRequest.BodyPublishers.ofString(Json.stringify(b))).build();Map<String,Object>d=Json.parseObject(HTTP.send(q,HttpResponse.BodyHandlers.ofString()).body());if(!Json.bool(d.get("ok")))return false;target.coins=Json.integer(Json.obj(d.get("wallet")).get("coins"),value);return true;}catch(Exception e){return false;}
    }
void admin(Player p,Map<String,Object>m,OutputStream out){String a=Json.str(m.get("action"));if(!p.admin){send(out,map("type","feature-result","category","admin","action",a,"ok",false,"error","Richiesti permessi admin"));return;}Player q=players.get(Json.str(m.get("target")));boolean ok=true;Object data=null;switch(a){case"list"->data=players.values().stream().map(Player::summary).toList();case"get"->data=q==null?null:q.summary();case"kick","ban"->{if(q==null)ok=false;else{if("ban".equals(a))banned.add(q.name.toLowerCase());players.remove(q.id);try{q.out.close();}catch(Exception ignored){}}}case"mute"->{if(q==null)ok=false;else q.mutedUntil=now()+Math.max(1000,Json.integer(m.get("duration"),600000));}case"unmute"->{if(q==null)ok=false;else q.mutedUntil=0;}case"freeze"->{if(q==null)ok=false;else q.adminFrozen=true;}case"unfreeze"->{if(q==null)ok=false;else q.adminFrozen=false;}case"setMass"->{if(q==null)ok=false;else q.mass=clamp(Json.num(m.get("value"),20),5,1000000);}case"setCoins"->{if(q==null)ok=false;else{int value=Math.max(0,Json.integer(m.get("value"),0));ok=setCoinsPersistent(p,q,value);}}case"teleport"->{if(q==null)ok=false;else{q.x=clamp(Json.num(m.get("x"),q.x),0,W);q.y=clamp(Json.num(m.get("y"),q.y),0,H);}}case"heal"->{if(q==null)ok=false;else q.mass+=25;}case"kill"->{if(q==null)ok=false;else eliminate(q,p,"admin");}case"respawn"->{if(q==null)ok=false;else{q.dead=false;q.mass=20;q.x=RNG.nextDouble()*W;q.y=RNG.nextDouble()*H;}}case"setTeam"->{if(q==null)ok=false;else q.team=Json.integer(m.get("value"),-1);}case"setColor"->{if(q==null)ok=false;else q.color=Json.str(m.get("value"));}case"broadcast"->{broadcast(map("type","announcement","text",String.valueOf(m.getOrDefault("value",""))));}case"spawnBots"->{int z=Math.min(Json.integer(m.get("value"),1),MAX_BOTS-botCount());spawnBots(Math.max(0,z),Json.num(m.get("mass"),30));data=z;}case"removeBots"->{int lim=Math.max(1,Json.integer(m.get("value"),1)),z=0;for(Player b:new ArrayList<>(players.values()))if(z<lim&&b.bot){players.remove(b.id);z++;}data=z;}case"pause"->paused=true;case"resume"->paused=false;case"resetMatch"->{for(Player b:players.values()){b.dead=false;b.mass=20;b.x=RNG.nextDouble()*W;b.y=RNG.nextDouble()*H;}}default->ok=false;}send(out,map("type","feature-result","category","admin","action",a,"ok",ok,"data",data));}
  }

  static final class Player{
    final String id;String name;final boolean bot;OutputStream out;String authToken,role,equippedSkin="default",color="#6ee7ff",mode="ffa";boolean admin,adminFrozen,dead,sprint,autoPilot,arena,spectating;int team=-1,coins=1000,pvpPoints,elo=1000,wins,losses,kills,deaths,killStreak,bestKillStreak,matches,cells=1,botDifficulty=1;double x,y,tx,ty,mass=20,bestMass,vx,vy,damageDealt,damageTaken;long accountId,respawnAt,mutedUntil,lastAbility,lastGod,godUntil,freezeUntil,slowUntil,rageUntil,revealUntil,parryUntil,shieldUntil,respawnShieldUntil,hunterUntil;String markedTargetId,duelId,pendingDuelId,spectateTargetId;Player(String id,String n,boolean b){this.id=id;name=n;bot=b;}
    Map<String,Object>snap(boolean self){long n=now();Map<String,Object>m=map("id",id,"name",name,"isBot",bot,"gameMode",mode,"color",color,"team",team,"mass",Math.round(mass),"dead",dead,"respawnAt",dead?respawnAt:null,"invisible",false,"speedBoost",rageUntil>n,"magnet",false,"shield",shieldUntil>n,"respawnShield",respawnShieldUntil>n,"frozen",freezeUntil>n,"rage",rageUntil>n,"reveal",revealUntil>n,"autoPilot",autoPilot,"combo",0,"assists",0,"bounty",0,"kills",kills,"deaths",deaths,"pvpPoints",pvpPoints,"elo",elo,"damageDealt",Math.round(damageDealt),"damageTaken",Math.round(damageTaken),"killStreak",killStreak,"hunter",hunterUntil>n,"parry",parryUntil>n,"slow",slowUntil>n,"godMode",godUntil>n,"godModeRemaining",Math.max(0,godUntil-n),"coins",coins,"equippedSkin",equippedSkin,"cells",List.of(map("x",x,"y",y,"mass",Math.max(0,mass),"id",id+"c")));return m;}
    Map<String,Object>summary(){return map("id",id,"name",name,"isBot",bot,"mass",Math.round(mass),"kills",kills,"deaths",deaths,"team",team,"admin",admin,"dead",dead,"pvpPoints",pvpPoints,"elo",elo,"killStreak",killStreak,"damageDealt",Math.round(damageDealt),"damageTaken",Math.round(damageTaken));}
    Map<String,Object>welcome(){return map("type","welcome","id",id,"world",map("width",W,"height",H),"teams",map("NAMES",List.of("ROSSI","BLU","VERDI","GIALLI","VIOLA"),"COLORS",List.of("#ff4d4d","#4d7cff","#4dff88","#ffd633","#c04dff")),"auth",map("user",map("id",accountId,"name",name,"role",role),"premium",false,"is_admin",admin,"team",team,"mode",mode),"room",map("players",ROOM.size(),"maxPlayers",MAX_PLAYERS,"bots",ROOM.botCount(),"maxBots",MAX_BOTS));}
  }
  static final class Food{final String id,owner;double x,y,mass,vx,vy;Food(String i,double x,double y,double m,double vx,double vy,String o){id=i;this.x=x;this.y=y;mass=m;this.vx=vx;this.vy=vy;owner=o;}Map<String,Object>json(){return map("id",id,"x",x,"y",y,"mass",mass,"color","#6ee7ff");}}
  static final class Effect{final String id,type,owner;double x,y,vx,vy,radius;long expiresAt;Effect(String i,String t,double x,double y,long e,String o,double vx,double vy,double r){id=i;type=t;this.x=x;this.y=y;expiresAt=e;owner=o;this.vx=vx;this.vy=vy;radius=r;}Map<String,Object>json(){return map("id",id,"type",type,"x",x,"y",y,"r",radius,"ownerId",owner,"expiresAt",expiresAt,"damage",type.equals("mine")?22:0);}}
  static final class Duel{final String id,a,b;final long createdAt;long startedAt;boolean accepted,resolved;Duel(String i,String a,String b,long n){id=i;this.a=a;this.b=b;createdAt=n;}}

  static final class Frame{int opcode;byte[]payload;static Frame read(InputStream in)throws IOException{int h=in.read(),b=in.read();if(h<0||b<0)return null;int op=h&15;boolean masked=(b&128)!=0;long len=b&127;if(len==126)len=((in.read()&255L)<<8)|(in.read()&255L);else if(len==127){len=0;for(int i=0;i<8;i++)len=(len<<8)|(in.read()&255L);}if(len>1_000_000)throw new IOException("frame too large");byte[]mask=masked?in.readNBytes(4):null;byte[]p=in.readNBytes((int)len);if(p.length!=len)throw new EOFException();if(masked)for(int i=0;i<p.length;i++)p[i]=(byte)(p[i]^mask[i%4]);Frame f=new Frame();f.opcode=op;f.payload=p;return f;}static void write(OutputStream o,byte[]p)throws IOException{int n=p.length;o.write(0x81);if(n<126)o.write(n);else if(n<=65535){o.write(126);o.write((n>>>8)&255);o.write(n&255);}else{o.write(127);for(int i=7;i>=0;i--)o.write((n>>>(8*i))&255);}o.write(p);o.flush();}}
  static final class Json{static Map<String,Object>parseObject(String s){Object o=new Parser(s).parse();return o instanceof Map?(Map<String,Object>)o:new LinkedHashMap<>();}static String str(Object o){return o==null?null:String.valueOf(o);}static boolean bool(Object o){return Boolean.TRUE.equals(o)||"true".equalsIgnoreCase(String.valueOf(o));}static double num(Object o,double d){try{return o==null?d:Double.parseDouble(String.valueOf(o));}catch(Exception e){return d;}}static int integer(Object o,int d){return (int)Math.round(num(o,d));}static Map<String,Object>obj(Object o){return o instanceof Map?(Map<String,Object>)o:new LinkedHashMap<>();}static String stringify(Object o){StringBuilder b=new StringBuilder();write(b,o);return b.toString();}static void write(StringBuilder b,Object o){if(o==null)b.append("null");else if(o instanceof String||o instanceof Character){b.append('"');for(char c:String.valueOf(o).toCharArray()){switch(c){case'\\'->b.append("\\\\");case'"'->b.append("\\\"");case'\n'->b.append("\\n");case'\r'->b.append("\\r");case'\t'->b.append("\\t");default->{if(c<32)b.append(String.format("\\u%04x",(int)c));else b.append(c);}}}b.append('"');}else if(o instanceof Number||o instanceof Boolean)b.append(o);else if(o instanceof Map){b.append('{');boolean f=true;for(var e:((Map<?,?>)o).entrySet()){if(!f)b.append(',');f=false;write(b,String.valueOf(e.getKey()));b.append(':');write(b,e.getValue());}b.append('}');}else if(o instanceof Iterable){b.append('[');boolean f=true;for(Object x:(Iterable<?>)o){if(!f)b.append(',');f=false;write(b,x);}b.append(']');}else write(b,String.valueOf(o));}static final class Parser{final String s;int i;Parser(String s){this.s=s.trim();}Object parse(){skip();if(i>=s.length())return null;char c=s.charAt(i);if(c=='{')return obj();if(c=='[')return arr();if(c=='"')return str();if(s.startsWith("true",i)){i+=4;return true;}if(s.startsWith("false",i)){i+=5;return false;}if(s.startsWith("null",i)){i+=4;return null;}return number();}Map<String,Object>obj(){Map<String,Object>m=new LinkedHashMap<>();i++;skip();while(i<s.length()&&s.charAt(i)!='}'){String k=str();skip();if(i<s.length()&&s.charAt(i)==':')i++;Object v=parse();m.put(k,v);skip();if(i<s.length()&&s.charAt(i)==','){i++;skip();}}if(i<s.length())i++;return m;}List<Object>arr(){List<Object>l=new ArrayList<>();i++;skip();while(i<s.length()&&s.charAt(i)!=']'){l.add(parse());skip();if(i<s.length()&&s.charAt(i)==','){i++;skip();}}if(i<s.length())i++;return l;}String str(){StringBuilder b=new StringBuilder();i++;while(i<s.length()){char c=s.charAt(i++);if(c=='"')break;if(c=='\\'&&i<s.length()){char e=s.charAt(i++);switch(e){case'n'->b.append('\n');case'r'->b.append('\r');case't'->b.append('\t');case'"'->b.append('"');case'\\'->b.append('\\');default->b.append(e);}}else b.append(c);}return b.toString();}Number number(){int st=i;while(i<s.length()&&"-+0123456789.eE".indexOf(s.charAt(i))>=0)i++;try{return Double.parseDouble(s.substring(st,i));}catch(Exception e){return 0;}}void skip(){while(i<s.length()&&Character.isWhitespace(s.charAt(i)))i++;}}}
}
