"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import confetti from "canvas-confetti";
import { Activity, ArrowRight, Check, Copy, Crown, Flame, Plus, Sparkles, Swords, Users, Wallet, X } from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { AVATARS, Bet, Player, Prediction, Room, Vote } from "@/lib/types";

type Screen = "home"|"room";
const db = () => supabaseBrowser();
const money = (n:number) => n.toLocaleString("en-US");
const code6 = () => Math.random().toString(36).slice(2,8).toUpperCase();
const CONFETTI = {particleCount:150,spread:80,startVelocity:45,origin:{y:.6},colors:["#d7fb70","#7c5cff","#22231e","#ffffff"]};

// Remembering who you are on this device, so a refresh drops you back into your
// seat instead of spawning a second copy of you in the room.
const SESSION_KEY = "called-it:session";
type Session = {roomId:string;playerId:string};
const readSession = ():Session|null => {
  try { const raw = localStorage.getItem(SESSION_KEY); return raw ? JSON.parse(raw) as Session : null; }
  catch { return null; }
};
const writeSession = (s:Session|null) => {
  try { if(s) localStorage.setItem(SESSION_KEY,JSON.stringify(s)); else localStorage.removeItem(SESSION_KEY); }
  catch { /* private mode, blocked storage — the game still works, you just re-join */ }
};

export function DuelApp(){
  const [screen,setScreen] = useState<Screen>("home");
  const [room,setRoom] = useState<Room|null>(null);
  const [me,setMe] = useState<Player|null>(null);
  const [players,setPlayers] = useState<Player[]>([]);
  const [predictions,setPredictions] = useState<Prediction[]>([]);
  const [bets,setBets] = useState<Bet[]>([]);
  const [votes,setVotes] = useState<Vote[]>([]);
  const [activity,setActivity] = useState<{id:string;message:string;created_at:string}[]>([]);
  const [loading,setLoading] = useState(false);
  const [notice,setNotice] = useState("");
  const [modal,setModal] = useState<"create"|"join"|"prediction"|"bet"|"vote"|null>(null);
  const [activePrediction,setActivePrediction] = useState<Prediction|null>(null);
  const [tab,setTab] = useState<"live"|"resolved"|"leaderboard">("live");
  const [roomName,setRoomName] = useState("The Chaos Club");
  const [vibe,setVibe] = useState("friendly chaos");
  const [nickname,setNickname] = useState("");
  const [avatar,setAvatar] = useState("🦊");
  const [joinCode,setJoinCode] = useState("");
  const [question,setQuestion] = useState("");
  const [subject,setSubject] = useState("");
  const [deadline,setDeadline] = useState("");
  const [choice,setChoice] = useState(true);
  const [amount,setAmount] = useState("100");
  const [voteChoice,setVoteChoice] = useState(true);
  const [sparkIdeas,setSparkIdeas] = useState<string[]>([]);
  const [sparkLoading,setSparkLoading] = useState(false);
  const [commentary,setCommentary] = useState("");
  const [commentaryLoading,setCommentaryLoading] = useState(false);
  const [demoLoading,setDemoLoading] = useState(false);
  const [restoring,setRestoring] = useState(true);
  const seenResolved = useRef<Set<string>|null>(null);

  const refresh = useCallback(async (roomId:string) => {
    const s=db();
    const [p,pr,b,v,a] = await Promise.all([
      s.from("players").select("*").eq("room_id",roomId).order("points",{ascending:false}),
      s.from("predictions").select("*").eq("room_id",roomId).order("created_at",{ascending:false}),
      s.from("bets").select("*"),
      s.from("votes").select("*"),
      s.from("activity").select("id,message,created_at").eq("room_id",roomId).order("created_at",{ascending:false}).limit(20)
    ]);
    if(p.data) setPlayers(p.data as Player[]);
    if(pr.data) setPredictions(pr.data as Prediction[]);
    if(b.data) setBets(b.data as Bet[]);
    if(v.data) setVotes(v.data as Vote[]);
    if(a.data) setActivity(a.data as typeof activity);
    if(me && p.data) setMe((p.data as Player[]).find(x=>x.id===me.id) || me);
  },[me]);

  useEffect(()=>{
    if(!room) return;
    refresh(room.id);
    const s=db();
    const channel=s.channel(`room-${room.id}`)
      .on("postgres_changes",{event:"*",schema:"public",table:"players",filter:`room_id=eq.${room.id}`},()=>refresh(room.id))
      .on("postgres_changes",{event:"*",schema:"public",table:"predictions",filter:`room_id=eq.${room.id}`},()=>refresh(room.id))
      .on("postgres_changes",{event:"*",schema:"public",table:"activity",filter:`room_id=eq.${room.id}`},()=>refresh(room.id))
      .on("postgres_changes",{event:"*",schema:"public",table:"bets"},()=>refresh(room.id))
      .on("postgres_changes",{event:"*",schema:"public",table:"votes"},()=>refresh(room.id))
      .subscribe();
    return ()=>{s.removeChannel(channel);};
  },[room,refresh]);

  useEffect(()=>{
    if(!room) return;
    const expired=predictions.filter(p=>p.status==="open" && new Date(p.deadline).getTime()<=Date.now());
    expired.forEach(p=>{ void db().from("predictions").update({status:"voting"}).eq("id",p.id).eq("status","open"); });
  },[room,predictions]);

  const say = async (message:string, playerId=me?.id) => {
    if(!room) return;
    await db().from("activity").insert({room_id:room.id,player_id:playerId,message});
  };
  const joinRoom = async (r:Room) => {
    if(!nickname.trim()){setNotice("Pick a nickname first.");return;}
    setLoading(true);setNotice("");
    const s=db();
    const {data:existing}=await s.from("players").select("*").eq("room_id",r.id).eq("nickname",nickname.trim()).maybeSingle();
    let player=existing as Player|null;
    if(!player){
      const {data,error}=await s.from("players").insert({room_id:r.id,nickname:nickname.trim().slice(0,24),avatar,points:1000}).select().single();
      if(error){setNotice(error.message.includes("duplicate")?"That nickname is already taken in this room.":error.message);setLoading(false);return;}
      player=data as Player;
    }
    setRoom(r);setMe(player);setScreen("room");setModal(null);setLoading(false);
    writeSession({roomId:r.id,playerId:player.id});
    await db().from("activity").insert({room_id:r.id,player_id:player.id,message:`${player.avatar} ${player.nickname} joined the room`});
  };
  const createRoom = async () => {
    if(!nickname.trim()){setNotice("Pick a nickname first.");return;}
    setLoading(true);setNotice("");
    const s=db(); const code=code6();
    const {data,error}=await s.from("rooms").insert({code,name:roomName.trim()||"The Chaos Club",vibe:vibe.trim()||"friendly chaos"}).select().single();
    if(error||!data){setNotice(error?.message||"Couldn't create room.");setLoading(false);return;}
    await joinRoom(data as Room);
  };
  const findRoom = async () => {
    setLoading(true);setNotice("");
    const {data,error}=await db().from("rooms").select("*").eq("code",joinCode.trim().toUpperCase()).maybeSingle();
    setLoading(false);
    if(error||!data){setNotice("We couldn't find that room code. Check it and try again.");return;}
    await joinRoom(data as Room);
  };
  const createPrediction = async () => {
    if(!room||!me) return;
    if(question.trim().length<8){setNotice("Give the prediction a little more detail.");return;}
    if(!subject||subject===me.id && players.length>1){/* self predictions are allowed */ }
    // Moderation is run separately so normal user text never gets silently rewritten.
    const moderation=await fetch("/api/moderate",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({text:question})});
    const m=await moderation.json().catch(()=>({allowed:true}));
    if(!m.allowed){setNotice("Let's keep it friendly. Try a playful, verifiable prediction instead.");return;}
    const dl=deadline ? new Date(deadline).toISOString() : new Date(Date.now()+24*60*60*1000).toISOString();
    if(new Date(dl).getTime()<=Date.now()){setNotice("Deadline needs to be in the future.");return;}
    const {data,error}=await db().from("predictions").insert({room_id:room.id,author_id:me.id,subject_id:subject||me.id,question:question.trim(),deadline:dl}).select().single();
    if(error){setNotice(error.message);return;}
    await say(`${me.avatar} ${me.nickname} posted: “${question.trim()}”`);
    setQuestion("");setModal(null);setNotice("");setActivePrediction(data as Prediction);
  };
  const placeBet = async () => {
    if(!room||!me||!activePrediction) return;
    const n=Math.floor(Number(amount));
    if(!Number.isFinite(n)||n<1||n>me.points){setNotice("Bet must be at least 1 point and no more than your balance.");return;}
    if(activePrediction.status!=="open"||new Date(activePrediction.deadline).getTime()<=Date.now()){setNotice("Betting has closed for this prediction.");return;}
    if(bets.some(b=>b.prediction_id===activePrediction.id&&b.player_id===me.id)){setNotice("You already placed a bet on this prediction.");return;}
    const {error}=await db().from("bets").insert({prediction_id:activePrediction.id,player_id:me.id,choice,amount:n});
    if(error){setNotice("Couldn't place that bet. You may already have bet on this prediction.");return;}
    await db().from("players").update({points:me.points-n}).eq("id",me.id);
    await say(`${me.avatar} ${me.nickname} put ${n} points on ${choice?"YES":"NO"}`);
    setModal(null);setNotice("");await refresh(room.id);
  };
  const castVote = async () => {
    if(!me||!activePrediction||!room) return;
    if(activePrediction.subject_id===me.id){setNotice("The subject can't vote on their own prediction.");return;}
    if(votes.some(v=>v.prediction_id===activePrediction.id&&v.player_id===me.id)){setNotice("You've already voted.");return;}
    const {error}=await db().from("votes").insert({prediction_id:activePrediction.id,player_id:me.id,outcome:voteChoice});
    if(error){setNotice("Couldn't record vote. You may already have voted.");return;}
    await say(`${me.avatar} ${me.nickname} voted ${voteChoice?"YES":"NO"} on the outcome`);
    setModal(null);await refresh(room.id);
  };
  const resolvePrediction = async (p:Prediction) => {
    if(!room||!me) return;
    const eligible=players.filter(x=>x.id!==p.subject_id);
    const pv=votes.filter(v=>v.prediction_id===p.id);
    if(pv.length<Math.ceil(eligible.length/2)){setNotice(`Need at least ${Math.ceil(eligible.length/2)} vote(s) to resolve.`);return;}
    const yes=pv.filter(v=>v.outcome).length, no=pv.length-yes;
    if(yes===no){
      await db().from("predictions").update({status:"void",resolution_note:"Tie vote — bets refunded."}).eq("id",p.id);
      const all=bets.filter(b=>b.prediction_id===p.id);
      for(const b of all){const pl=players.find(x=>x.id===b.player_id);if(pl)await db().from("players").update({points:pl.points+b.amount}).eq("id",pl.id);}
      await say(`⚖️ “${p.question}” ended in a tie. Bets refunded.`);
      setNotice("Tie vote: prediction voided and bets refunded.");await refresh(room.id);return;
    }
    const outcome=yes>no;
    const pool=bets.filter(b=>b.prediction_id===p.id);
    const winners=pool.filter(b=>b.choice===outcome);
    const total=pool.reduce((sum,b)=>sum+b.amount,0);
    const winningStake=winners.reduce((sum,b)=>sum+b.amount,0);
    if(winners.length&&winningStake){
      let distributed=0;
      for(let i=0;i<winners.length;i++){
        const b=winners[i], share=i===winners.length-1?total-distributed:Math.floor(total*b.amount/winningStake);
        distributed+=share;
        const pl=players.find(x=>x.id===b.player_id);
        if(pl) await db().from("players").update({points:pl.points+share}).eq("id",pl.id);
      }
    } else {
      // No winning bets: return all stakes to preserve the point economy.
      for(const b of pool){const pl=players.find(x=>x.id===b.player_id);if(pl)await db().from("players").update({points:pl.points+b.amount}).eq("id",pl.id);}
    }
    await db().from("predictions").update({status:"resolved",outcome,resolution_note:winners.length?null:"No winning bets — stakes refunded."}).eq("id",p.id);
    const names=winners.map(b=>players.find(x=>x.id===b.player_id)?.nickname).filter(Boolean);
    await say(`${outcome?"✅ YES":"❌ NO"} — “${p.question}” resolved. ${names.length?`Winners: ${names.join(", ")}`:"No winning bets; stakes refunded."}`);
    setCommentaryLoading(true);
    const res=await fetch("/api/commentary",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({kind:"resolved",question:p.question,outcome,winnerNames:names,roomName:room.name})});
    const c=await res.json();setCommentary(c.text||"The room has spoken!");setCommentaryLoading(false);
    await refresh(room.id);
  };
  const askSpark = async () => {
    setSparkLoading(true);
    const r=await fetch("/api/spark",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({players:players.map(p=>p.nickname),vibe:room?.vibe||vibe})});
    const j=await r.json();setSparkIdeas(j.ideas||[]);setSparkLoading(false);
  };
  const weeklyRoast = async () => {
    if(!room)return;
    setCommentaryLoading(true);
    const r=await fetch("/api/commentary",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({kind:"weekly",roomName:room.name,leaderboard:players.map((p,i)=>({rank:i+1,name:p.nickname,points:p.points}))})});
    const j=await r.json();setCommentary(j.text||"The leaderboard has spoken.");setCommentaryLoading(false);
  };
  // One click into a room that is already mid-game, for anyone arriving on their own.
  const startDemo = async () => {
    setDemoLoading(true);setNotice("");
    try{
      const r=await fetch("/api/demo",{method:"POST"});
      const j=await r.json();
      if(!r.ok||!j.room||!j.player) throw new Error(j.error||"Could not start a demo room.");
      const player=j.player as Player;
      writeSession({roomId:j.room.id,playerId:player.id});
      seenResolved.current=null;
      setRoom(j.room as Room);setMe(player);setNickname(player.nickname);setAvatar(player.avatar);
      setScreen("room");setModal(null);
    }catch(e){ setNotice(e instanceof Error?e.message:"Could not start a demo room."); }
    setDemoLoading(false);
  };
  const copyInvite = async () => {
    const link=`${window.location.origin}/?room=${room?.code}`;
    await navigator.clipboard.writeText(link);
    setNotice("Invite link copied!");
  };
  useEffect(()=>{
    void (async()=>{
      const code=new URLSearchParams(window.location.search).get("room");
      const saved=readSession();
      if(saved){
        const s=db();
        const [{data:r},{data:p}]=await Promise.all([
          s.from("rooms").select("*").eq("id",saved.roomId).maybeSingle(),
          s.from("players").select("*").eq("id",saved.playerId).maybeSingle()
        ]);
        if(r&&p){
          const player=p as Player;
          setRoom(r as Room);setMe(player);setNickname(player.nickname);setAvatar(player.avatar);setScreen("room");setRestoring(false);
          return;
        }
        writeSession(null);
      }
      if(code){setJoinCode(code);setModal("join");}
      setRestoring(false);
    })();
  },[]);

  // Every winner sees their own confetti, not just whoever happened to click Resolve.
  useEffect(()=>{
    if(!me) return;
    if(seenResolved.current===null){
      seenResolved.current=new Set(predictions.filter(p=>p.status==="resolved").map(p=>p.id));
      return;
    }
    for(const p of predictions){
      if(p.status!=="resolved"||seenResolved.current.has(p.id)) continue;
      seenResolved.current.add(p.id);
      const mine=bets.find(b=>b.prediction_id===p.id&&b.player_id===me.id);
      if(mine&&mine.choice===p.outcome) confetti(CONFETTI);
    }
  },[predictions,bets,me]);
  const betFor=(id:string)=>bets.find(b=>b.prediction_id===id&&b.player_id===me?.id);
  const voteFor=(id:string)=>votes.find(v=>v.prediction_id===id&&v.player_id===me?.id);
  const getPlayer=(id:string)=>players.find(p=>p.id===id);
  const live=predictions.filter(p=>p.status==="open"||p.status==="voting");
  const done=predictions.filter(p=>p.status==="resolved"||p.status==="void");

  return <main className="min-h-screen">
    <header className="mx-auto flex max-w-6xl items-center justify-between px-4 py-5 md:px-8">
      <button onClick={()=>{writeSession(null);seenResolved.current=null;setScreen("home");setRoom(null);setMe(null);setModal(null)}} className="flex items-center gap-2 font-black tracking-tight text-lg"><span className="grid h-9 w-9 place-items-center rounded-xl bg-[#d7fb70]"><Swords size={20}/></span> called<span className="text-[#7c5cff]">it</span></button>
      <div className="hidden items-center gap-2 text-xs font-bold text-stone-500 sm:flex"><span className="h-2 w-2 rounded-full bg-lime-500"/>{screen==="room"?"ROOM LIVE":"FRIENDS. POINTS. BRAGGING RIGHTS."}</div>
    </header>

    {restoring ? <div className="mx-auto grid max-w-6xl place-items-center px-4 py-32"><div className="h-11 w-11 animate-pulse rounded-2xl bg-[#d7fb70]"/></div>
    : screen==="home" ? <section className="mx-auto max-w-6xl px-4 pb-16 pt-5 md:px-8 md:pt-12">
      <div className="grid items-center gap-10 md:grid-cols-[1.1fr_.9fr]">
        <div className="animate-rise">
          <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-stone-200 bg-white px-3 py-2 text-xs font-extrabold"><Sparkles size={14} className="text-[#7c5cff]"/> YOUR FRIENDS ARE THE PLOT</div>
          <h1 className="max-w-2xl text-5xl font-black leading-[.98] tracking-[-.06em] sm:text-6xl md:text-7xl">How well do you <span className="relative inline-block">know them?<span className="absolute bottom-1 left-0 -z-10 h-4 w-full -rotate-2 bg-[#d7fb70]"/></span></h1>
          <p className="mt-6 max-w-lg text-lg leading-7 text-stone-600">Make predictions about your people. Put points on the line. Wait for reality to expose everybody.</p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row"><button className="btn btn-dark" onClick={()=>{setModal("create");setNotice("")}}>Create a room <ArrowRight size={17}/></button><button className="btn btn-lime" onClick={startDemo} disabled={demoLoading}>{demoLoading?"Dealing you in…":"Play a live demo"} <Sparkles size={16}/></button><button className="btn btn-outline" onClick={()=>{setModal("join");setNotice("")}}>Join with a code</button></div>
          <p className="mt-3 text-sm text-stone-500">On your own? <b className="text-stone-800">Play a live demo</b> drops you straight into a room mid-game — bets open, a vote waiting.</p>
          {notice&&<p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-900">{notice}</p>}
          <div className="mt-8 flex items-center gap-3 text-sm text-stone-500"><div className="flex -space-x-2">{["🦊","🐸","🐼","🐙"].map(a=><span key={a} className="grid h-9 w-9 place-items-center rounded-full border-2 border-[#f8f7f1] bg-white text-lg">{a}</span>)}</div><span><b className="text-stone-800">No signup.</b> Just your nickname and your receipts.</span></div>
        </div>
        <div className="relative mx-auto w-full max-w-md animate-rise">
          <div className="absolute -right-2 top-5 rotate-12 rounded-2xl bg-[#7c5cff] px-4 py-2 text-sm font-black text-white shadow-lg">THE GROUP CHAT KNOWS 👀</div>
          <div className="card rotate-[-2deg] p-5 sm:p-7">
            <div className="flex items-center justify-between"><span className="pill bg-[#f1efff] text-[#6a4de6]">PREDICTION #014</span><span className="text-xs font-bold text-stone-400">CLOSES TOMORROW</span></div>
            <h2 className="mt-6 text-2xl font-black leading-tight">Will Alex say “on my way” before leaving the house?</h2>
            <div className="mt-5 flex gap-3"><div className="flex-1 rounded-2xl border border-emerald-200 bg-emerald-50 p-4"><div className="text-sm font-bold text-emerald-700">YES</div><div className="mt-1 text-2xl font-black">64%</div><div className="text-xs text-emerald-700">640 pts in</div></div><div className="flex-1 rounded-2xl border border-rose-200 bg-rose-50 p-4"><div className="text-sm font-bold text-rose-700">NO</div><div className="mt-1 text-2xl font-black">36%</div><div className="text-xs text-rose-700">360 pts in</div></div></div>
            <div className="mt-5 flex items-center justify-between border-t border-stone-100 pt-4"><div className="flex -space-x-2">{["🐸","🐼","🦊","🐙"].map(a=><span key={a} className="grid h-8 w-8 place-items-center rounded-full border-2 border-white bg-stone-100">{a}</span>)}</div><span className="text-xs font-bold text-stone-500">6 players in the pool</span></div>
          </div>
          <div className="absolute -bottom-5 -left-3 rotate-[-5deg] rounded-2xl border border-stone-200 bg-white p-3 shadow-md"><div className="text-xs text-stone-500">THE RECEIPTS ARE IN</div><div className="font-black">🐼 Sam +240 pts <span className="text-emerald-600">↗</span></div></div>
        </div>
      </div>
      <div className="mt-20 grid gap-4 sm:grid-cols-3">
        {[["01","Make a room","Invite your people with one link. No accounts, no awkward setup."],["02","Call your shot","Post a prediction, pick YES or NO, and risk your points."],["03","Let the room decide","When time’s up, vote on what happened. Winners split the pool."]].map(([n,t,d])=><div key={n} className="card p-5"><span className="text-xs font-black text-[#7c5cff]">{n} / HOW TO PLAY</span><h3 className="mt-4 text-xl font-black">{t}</h3><p className="mt-2 text-sm leading-6 text-stone-500">{d}</p></div>)}
      </div>
    </section> : room&&me ? <section className="mx-auto max-w-6xl px-4 pb-16 md:px-8">
      <div className="mb-6 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div><div className="mb-2 flex items-center gap-2 text-xs font-extrabold uppercase tracking-widest text-[#7c5cff]"><span className="h-2 w-2 rounded-full bg-emerald-500"/> LIVE ROOM · {room.code}</div><h1 className="text-3xl font-black tracking-tight sm:text-4xl">{room.name}</h1><p className="mt-2 text-sm text-stone-500">Vibe: {room.vibe} · {players.length} players</p></div>
        <div className="flex gap-2"><button className="btn btn-outline" onClick={copyInvite}><Copy size={16}/> Invite friends</button><button className="btn btn-lime" onClick={()=>{setModal("prediction");setNotice("")}}><Plus size={17}/> New prediction</button></div>
      </div>
      {notice&&<div className="mb-4 flex items-center justify-between rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-900">{notice}<button onClick={()=>setNotice("")}><X size={16}/></button></div>}
      <div className="grid gap-5 lg:grid-cols-[1fr_310px]">
        <div>
          <div className="mb-4 flex gap-2 overflow-x-auto pb-1">{([["live","In play"],["resolved","Resolved"],["leaderboard","Leaderboard"]] as const).map(([k,label])=><button key={k} onClick={()=>setTab(k)} className={`pill whitespace-nowrap ${tab===k?"bg-[#22231e] text-white":"border border-stone-200 bg-white text-stone-600"}`}>{label}{k==="live"&&live.length?` · ${live.length}`:""}</button>)}</div>
          {tab==="live"&&<div className="space-y-4">{live.length===0?<div className="card px-6 py-12 text-center"><div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-[#f1efff] text-[#7c5cff]"><Sparkles/></div><h3 className="mt-4 text-xl font-black">Quiet in here. Suspicious.</h3><p className="mx-auto mt-2 max-w-sm text-sm text-stone-500">Start the first prediction and give everyone something to argue about.</p><button className="btn btn-dark mt-5" onClick={()=>setModal("prediction")}><Plus size={16}/> Make a prediction</button></div>:live.map(p=>{const pool=bets.filter(b=>b.prediction_id===p.id),yes=pool.filter(b=>b.choice).reduce((s,b)=>s+b.amount,0),no=pool.filter(b=>!b.choice).reduce((s,b)=>s+b.amount,0),total=yes+no,own=betFor(p.id),voted=voteFor(p.id),expired=new Date(p.deadline).getTime()<=Date.now()||p.status==="voting";return <article key={p.id} className="card animate-rise p-5 sm:p-6"><div className="flex items-start justify-between gap-3"><div className="flex flex-wrap items-center gap-2"><span className={`pill ${expired?"bg-amber-100 text-amber-800":"bg-emerald-50 text-emerald-700"}`}>{expired?"VOTING":"OPEN"}</span><span className="text-xs font-bold text-stone-400">BY {getPlayer(p.author_id)?.nickname||"A player"}</span></div><span className="text-right text-xs font-bold text-stone-400">{expired?"Deadline passed":`Ends ${new Date(p.deadline).toLocaleString([], {month:"short",day:"numeric",hour:"numeric",minute:"2-digit"})}`}</span></div><h3 className="mt-4 text-xl font-black leading-snug">{p.question}</h3><p className="mt-2 text-sm text-stone-500">About <b className="text-stone-800">{getPlayer(p.subject_id)?.avatar} {getPlayer(p.subject_id)?.nickname||"someone"}</b> · Pool {money(total)} pts</p><div className="mt-5 h-2 overflow-hidden rounded-full bg-rose-100"><div className="h-full rounded-full bg-emerald-400 transition-all" style={{width:`${total?yes/total*100:50}%`}}/></div><div className="mt-2 flex justify-between text-xs font-bold"><span className="text-emerald-700">YES {money(yes)} ({total?Math.round(yes/total*100):50}%)</span><span className="text-rose-600">NO {money(no)} ({100-(total?Math.round(yes/total*100):50)}%)</span></div><div className="mt-5 flex flex-wrap gap-2">{!expired&&!own&&p.author_id!==me.id&&<button className="btn btn-dark flex-1" onClick={()=>{setActivePrediction(p);setModal("bet");setNotice("")}}>Bet points <Wallet size={16}/></button>}{expired&&p.subject_id!==me.id&&!voted&&<button className="btn btn-lime flex-1" onClick={()=>{setActivePrediction(p);setModal("vote");setNotice("")}}>Vote outcome <Check size={16}/></button>}{expired&&<button className="btn btn-outline" onClick={()=>void resolvePrediction(p)}>Resolve vote</button>}{own&&<span className="pill bg-stone-100 text-stone-500">Your bet: {own.choice?"YES":"NO"} · {own.amount} pts</span>}{voted&&<span className="pill bg-stone-100 text-stone-500">Voted {voted.outcome?"YES":"NO"}</span>}</div>{expired&&<p className="mt-3 text-xs text-stone-400">{votes.filter(v=>v.prediction_id===p.id).length} vote(s) submitted · subject can’t vote</p>}</article>})}</div>}
          {tab==="resolved"&&<div className="space-y-3">{done.length===0?<div className="card p-10 text-center text-sm text-stone-500">No resolved predictions yet. Time will tell. ⏳</div>:done.map(p=><div key={p.id} className="card p-5"><div className="flex items-center justify-between gap-3"><span className={`pill ${p.status==="void"?"bg-amber-100 text-amber-800":p.outcome?"bg-emerald-100 text-emerald-800":"bg-rose-100 text-rose-800"}`}>{p.status==="void"?"VOID":p.outcome?"YES WON":"NO WON"}</span><span className="text-xs text-stone-400">{new Date(p.created_at).toLocaleDateString()}</span></div><h3 className="mt-3 font-black">{p.question}</h3>{p.resolution_note&&<p className="mt-1 text-sm text-stone-500">{p.resolution_note}</p>}</div>)}</div>}
          {tab==="leaderboard"&&<div className="card overflow-hidden">{players.map((p,i)=><div key={p.id} className="flex items-center gap-4 border-b border-stone-100 p-4 last:border-0"><span className={`grid h-9 w-9 place-items-center rounded-xl font-black ${i===0?"bg-[#d7fb70]": "bg-stone-100"}`}>{i===0?<Crown size={17}/>:i+1}</span><span className="text-2xl">{p.avatar}</span><div className="min-w-0 flex-1"><div className="truncate font-black">{p.nickname}{p.id===me.id?" (you)":""}</div><div className="text-xs text-stone-400">{i===0?"Currently the one to beat":"Playing the long game"}</div></div><span className="font-black tabular-nums">{money(p.points)} <small className="text-xs text-stone-400">pts</small></span></div>)}</div>}
        </div>
        <aside className="space-y-4">
          <div className="card p-5"><div className="flex items-center gap-2 text-sm font-black"><Wallet size={17} className="text-[#7c5cff]"/> YOUR WALLET</div><div className="mt-3 text-4xl font-black tracking-tight">{money(me.points)}<span className="ml-2 text-sm font-bold text-stone-400">PTS</span></div><div className="mt-4 h-2 overflow-hidden rounded-full bg-stone-100"><div className="h-full rounded-full bg-[#d7fb70]" style={{width:`${Math.min(100,me.points/10)}%`}}/></div><p className="mt-2 text-xs text-stone-400">Started with 1,000. Spend wisely-ish.</p></div>
          <div className="card p-5"><div className="flex items-center justify-between"><h3 className="flex items-center gap-2 font-black"><Sparkles size={17} className="text-[#7c5cff]"/> Spark ideas</h3><button onClick={askSpark} disabled={sparkLoading} className="text-xs font-black text-[#7c5cff]">{sparkLoading?"Thinking…":"Generate ↗"}</button></div><p className="mt-2 text-sm text-stone-500">Need inspiration? Let AI cook up something friendly.</p>{sparkIdeas.length>0&&<div className="mt-3 space-y-2">{sparkIdeas.map((idea,i)=><button key={i} onClick={()=>{setQuestion(idea);setModal("prediction")}} className="w-full rounded-xl bg-stone-50 p-3 text-left text-sm font-semibold hover:bg-[#f1efff]">{idea}</button>)}</div>}</div>
          <div className="card p-5"><h3 className="flex items-center gap-2 font-black"><Activity size={17} className="text-[#7c5cff]"/> Activity</h3><div className="mt-4 space-y-4">{activity.length===0?<p className="text-sm text-stone-400">Your room’s story starts here.</p>:activity.slice(0,7).map(a=><div key={a.id} className="flex gap-3"><span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-[#d7fb70]"/><div><p className="text-sm leading-5">{a.message}</p><p className="mt-1 text-[10px] font-bold uppercase tracking-wide text-stone-400">{new Date(a.created_at).toLocaleString([], {month:"short",day:"numeric",hour:"numeric",minute:"2-digit"})}</p></div></div>)}</div></div>
          <button onClick={weeklyRoast} className="btn btn-outline w-full"><Flame size={16} className="text-[#7c5cff]"/> Roast the leaderboard</button>
          {commentary&&<div className="card border-[#d7fb70] bg-[#fbffef] p-4"><div className="mb-2 text-xs font-black uppercase tracking-widest text-[#7c5cff]">AI commentator</div><p className="text-sm leading-6">{commentary}</p>{commentaryLoading&&<span className="text-xs text-stone-400">Writing the recap…</span>}</div>}
          <div className="card p-4"><div className="flex items-center gap-2 text-xs font-black"><Users size={15}/> THE ROOM ({players.length})</div><div className="mt-3 flex flex-wrap gap-2">{players.map(p=><span key={p.id} title={p.nickname} className={`grid h-9 w-9 place-items-center rounded-full text-lg ${p.id===me.id?"ring-2 ring-[#7c5cff] ring-offset-2":"bg-stone-100"}`}>{p.avatar}</span>)}</div></div>
        </aside>
      </div>
    </section>:null}

    {modal&&<div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 backdrop-blur-[2px] sm:items-center sm:p-4" onClick={()=>setModal(null)}><div onClick={e=>e.stopPropagation()} className="animate-rise max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-[28px] bg-[#f8f7f1] p-5 shadow-2xl sm:rounded-[28px] sm:p-7">
      <div className="mb-5 flex items-center justify-between"><div><div className="text-xs font-black uppercase tracking-widest text-[#7c5cff]">{modal==="create"?"NEW ROOM":modal==="join"?"JOIN THE CHAOS":modal==="prediction"?"MAKE A CALL":modal==="bet"?"PUT POINTS DOWN":"CAST YOUR VOTE"}</div><h2 className="mt-1 text-2xl font-black">{modal==="create"?"Make it a room.":modal==="join"?"Got an invite code?":modal==="prediction"?"What’s the prediction?":modal==="bet"?"Back your instinct.":"What actually happened?"}</h2></div><button className="grid h-9 w-9 place-items-center rounded-full bg-white" onClick={()=>setModal(null)}><X size={18}/></button></div>
      {notice&&<p className="mb-4 rounded-xl bg-amber-50 p-3 text-sm text-amber-900">{notice}</p>}
      {(modal==="create"||modal==="join")&&<div className="space-y-4"><label className="block text-sm font-bold">Your nickname<input className="field mt-2" maxLength={24} value={nickname} onChange={e=>setNickname(e.target.value)} placeholder="e.g. Sam the Oracle"/></label><div><label className="text-sm font-bold">Pick your avatar</label><div className="mt-2 flex flex-wrap gap-2">{AVATARS.map(a=><button key={a} onClick={()=>setAvatar(a)} className={`grid h-11 w-11 place-items-center rounded-xl bg-white text-xl ${avatar===a?"ring-2 ring-[#7c5cff]":""}`}>{a}</button>)}</div></div>{modal==="create"?<><label className="block text-sm font-bold">Room name<input className="field mt-2" value={roomName} onChange={e=>setRoomName(e.target.value)} maxLength={50}/></label><label className="block text-sm font-bold">Room vibe<input className="field mt-2" value={vibe} onChange={e=>setVibe(e.target.value)} maxLength={100} placeholder="friendly chaos, family lore…"/></label><button disabled={loading} onClick={createRoom} className="btn btn-dark w-full">{loading?"Making room…":"Create room"} <ArrowRight size={16}/></button></>:<><label className="block text-sm font-bold">Invite code<input className="field mt-2 uppercase" value={joinCode} onChange={e=>setJoinCode(e.target.value.toUpperCase())} maxLength={8} placeholder="ABC123"/></label><button disabled={loading} onClick={findRoom} className="btn btn-dark w-full">{loading?"Joining…":"Join room"} <ArrowRight size={16}/></button></>}</div>}
      {modal==="prediction"&&<div className="space-y-4"><label className="block text-sm font-bold">Prediction question<textarea className="field mt-2 min-h-24" value={question} onChange={e=>setQuestion(e.target.value)} maxLength={220} placeholder="Will Sam wake up before 9am tomorrow?"/></label><label className="block text-sm font-bold">Who is this about?<select className="field mt-2" value={subject} onChange={e=>setSubject(e.target.value)}><option value="">Choose a player…</option>{players.map(p=><option key={p.id} value={p.id}>{p.avatar} {p.nickname}</option>)}</select></label><label className="block text-sm font-bold">Deadline<input type="datetime-local" className="field mt-2" value={deadline} onChange={e=>setDeadline(e.target.value)}/><span className="mt-1 block text-xs font-normal text-stone-400">Leave blank to use 24 hours from now.</span></label><button onClick={createPrediction} className="btn btn-dark w-full">Post prediction <ArrowRight size={16}/></button></div>}
      {modal==="bet"&&activePrediction&&<div className="space-y-4"><p className="rounded-xl bg-white p-4 font-bold">{activePrediction.question}</p><div className="grid grid-cols-2 gap-3"><button onClick={()=>setChoice(true)} className={`rounded-2xl border p-4 text-left ${choice?"border-emerald-400 bg-emerald-50":"border-stone-200 bg-white"}`}><div className="font-black text-emerald-700">YES</div><div className="mt-1 text-xs text-stone-500">I believe it.</div></button><button onClick={()=>setChoice(false)} className={`rounded-2xl border p-4 text-left ${!choice?"border-rose-400 bg-rose-50":"border-stone-200 bg-white"}`}><div className="font-black text-rose-700">NO</div><div className="mt-1 text-xs text-stone-500">Not a chance.</div></button></div><label className="block text-sm font-bold">Points to bet<input type="number" min={1} max={me?.points||1000} className="field mt-2" value={amount} onChange={e=>setAmount(e.target.value)}/><span className="mt-1 block text-xs font-normal text-stone-400">Available balance: {money(me?.points||0)} points</span></label><button onClick={placeBet} className="btn btn-dark w-full">Lock in bet <Wallet size={16}/></button></div>}
      {modal==="vote"&&activePrediction&&<div className="space-y-4"><p className="rounded-xl bg-white p-4 font-bold">{activePrediction.question}</p><p className="text-sm text-stone-500">You’re voting on what happened in real life. The subject can’t vote.</p><div className="grid grid-cols-2 gap-3"><button onClick={()=>setVoteChoice(true)} className={`rounded-2xl border p-5 font-black ${voteChoice?"border-emerald-400 bg-emerald-50 text-emerald-800":"border-stone-200 bg-white"}`}>YES, IT DID</button><button onClick={()=>setVoteChoice(false)} className={`rounded-2xl border p-5 font-black ${!voteChoice?"border-rose-400 bg-rose-50 text-rose-800":"border-stone-200 bg-white"}`}>NO, IT DIDN’T</button></div><button onClick={castVote} className="btn btn-dark w-full">Submit vote <Check size={16}/></button></div>}
      <p className="mt-5 text-center text-xs text-stone-400">Keep it kind. The best predictions are funny, not personal.</p>
    </div></div>}
    <footer className="mx-auto max-w-6xl px-4 pb-8 text-center text-xs text-stone-400">Called It · Just a game, just points · Play nice.</footer>
  </main>;
}