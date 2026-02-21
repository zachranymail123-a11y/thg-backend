
const express = require("express");
const { Pool } = require("pg");
const fetch = (...args)=>import('node-fetch').then(({default:fetch})=>fetch(...args));

const app = express();
const PORT = process.env.PORT || 3000;

let pool=null;
if(process.env.DATABASE_URL){
 pool=new Pool({connectionString:process.env.DATABASE_URL,ssl:{rejectUnauthorized:false}});
}

async function q(sql,p=[]){
 if(!pool) return {rows:[]};
 try{return await pool.query(sql,p);}catch(e){return {rows:[]};}
}

async function init(){
 await q(`CREATE TABLE IF NOT EXISTS game_cache(
   id SERIAL PRIMARY KEY,
   game TEXT UNIQUE,
   description TEXT,
   created_at TIMESTAMP DEFAULT NOW()
 )`);
 await q(`CREATE TABLE IF NOT EXISTS last_game(
   id SERIAL PRIMARY KEY,
   game TEXT,
   updated TIMESTAMP DEFAULT NOW()
 )`);
}
init();

function extractGame(title){
 if(!title) return null;
 let t=title.split("|")[0];
 t=t.split("-")[0];
 return t.trim();
}

async function getKickTitle(){
 try{
   const r=await fetch("https://kick.com/api/v2/channels/thehardwareguru");
   const j=await r.json();
   if(j?.livestream?.session_title) return j.livestream.session_title;
 }catch(e){}
 return null;
}

async function getYouTubeLast(){
 try{
   const r=await fetch("https://www.youtube.com/@TheHardwareGuru_Czech/videos");
   const html=await r.text();
   const m=html.match(/"title":\{"runs":\[\{"text":"([^"]+)/);
   if(m) return m[1];
 }catch(e){}
 return null;
}

async function getGame(){
 let title=await getKickTitle();
 if(title){
   const g=extractGame(title);
   if(g){ await q("INSERT INTO last_game(game) VALUES($1)",[g]); return g; }
 }
 title=await getYouTubeLast();
 if(title){
   const g=extractGame(title);
   if(g){ await q("INSERT INTO last_game(game) VALUES($1)",[g]); return g; }
 }
 const r=await q("SELECT game FROM last_game ORDER BY updated DESC LIMIT 1");
 if(r.rows.length) return r.rows[0].game;
 return null;
}

async function getDescription(game){
 if(!game) return "";
 const r=await q("SELECT description FROM game_cache WHERE game=$1",[game]);
 if(r.rows.length) return r.rows[0].description;

 const desc=`${game} patří mezi populární hry, které aktuálně streamuje TheHardwareGuru. Sleduj live gameplay, nové buildy a reálné hraní bez sestřihu přímo na streamu.`;
 await q("INSERT INTO game_cache(game,description) VALUES($1,$2)",[game,desc]);
 return desc;
}

app.get("/api/live",async(req,res)=>{
 const game=await getGame();
 const desc=await getDescription(game);
 res.json({
  live: true,
  game: game,
  title: game,
  description: desc,
  youtube:"https://www.youtube.com/@TheHardwareGuru_Czech",
  kick:"https://kick.com/thehardwareguru"
 });
});

app.get("/",(req,res)=>res.send("OK"));

app.listen(PORT,"0.0.0.0",()=>console.log("LIVE CORE RUNNING",PORT));
