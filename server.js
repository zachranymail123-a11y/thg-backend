
const express = require("express");
const { Pool } = require("pg");
const slugify = require("slugify");
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
 await q(`CREATE TABLE IF NOT EXISTS articles(
   id SERIAL PRIMARY KEY,
   title TEXT,
   slug TEXT UNIQUE,
   article TEXT,
   created_at TIMESTAMP DEFAULT NOW()
 )`);
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

async function detectGame(){
 let title=await getKickTitle();
 if(title){
   const g=extractGame(title);
   if(g){ await q("INSERT INTO last_game(game) VALUES($1)",[g]); return g;}
 }
 title=await getYouTubeLast();
 if(title){
   const g=extractGame(title);
   if(g){ await q("INSERT INTO last_game(game) VALUES($1)",[g]); return g;}
 }
 const r=await q("SELECT game FROM last_game ORDER BY updated DESC LIMIT 1");
 if(r.rows.length) return r.rows[0].game;
 return null;
}

async function getDescription(game){
 if(!game) return "";
 const r=await q("SELECT description FROM game_cache WHERE game=$1",[game]);
 if(r.rows.length) return r.rows[0].description;

 const desc=`${game} patří mezi hry, které aktuálně streamuje TheHardwareGuru. Sleduj live gameplay, testy a reálné hraní bez střihu přímo na streamu.`;
 await q("INSERT INTO game_cache(game,description) VALUES($1,$2)",[game,desc]);
 return desc;
}

app.get("/api/live",async(req,res)=>{
 const game=await detectGame();
 const desc=await getDescription(game);
 res.json({
  live:true,
  game,
  title:game,
  description:desc,
  youtube:"https://www.youtube.com/@TheHardwareGuru_Czech",
  kick:"https://kick.com/thehardwareguru"
 });
});

/* ===== AUTHORITY ARTICLE GENERATOR ===== */

const games=["GTA 6","Cyberpunk 2077","Warzone","Starfield","Elden Ring","Alan Wake 2","Baldur's Gate 3","Silent Hill"];
const topics=["Update 2026","Complete Guide","Story Overview","Gameplay Analysis","New Features Explained"];

function rand(a){return a[Math.floor(Math.random()*a.length)]}

async function generateArticle(){
 const game=rand(games);
 const topic=rand(topics);
 const title=`${game} ${topic} – Complete Overview`;
 const slug=slugify(title+"-"+Date.now(),{lower:true,strict:true});

 const html=`
<h1>${title}</h1>

<div style="margin:30px 0;padding:25px;background:#111827;border-radius:14px;text-align:center;">
<h2>🎮 WATCH LIVE GAMEPLAY</h2>
<a href="https://kick.com/thehardwareguru" style="display:inline-block;margin:10px;padding:14px 26px;background:#00ff88;color:#000;font-weight:bold;border-radius:8px;text-decoration:none;">WATCH LIVE ON KICK</a>
<a href="https://www.youtube.com/@TheHardwareGuru_Czech" style="display:inline-block;margin:10px;padding:14px 26px;background:#ff0033;color:#fff;font-weight:bold;border-radius:8px;text-decoration:none;">YouTube</a>
</div>

<h2>Overview</h2>
<p>${game} patří mezi nejdiskutovanější hry poslední doby. Tento článek přináší přehled, novinky a důvody proč hru sledovat live.</p>

<h2>Gameplay</h2>
<p>Hra nabízí silný příběh, akci a moderní herní mechaniky. Sleduj live gameplay pro reálný zážitek.</p>

<div style="margin:40px 0;padding:25px;background:#020617;border-radius:14px;text-align:center;">
<h2>🔥 Sleduj stream živě</h2>
<a href="https://kick.com/thehardwareguru" style="display:inline-block;margin:10px;padding:14px 26px;background:#00ff88;color:#000;font-weight:bold;border-radius:8px;text-decoration:none;">WATCH LIVE</a>
</div>
`;

 await q("INSERT INTO articles(title,slug,article) VALUES($1,$2,$3) ON CONFLICT (slug) DO NOTHING",[title,slug,html]);
}

app.get("/cron/daily",async(req,res)=>{
 for(let i=0;i<12;i++){
  await generateArticle();
 }
 res.send("generated 12");
});

app.get("/top/:slug",async(req,res)=>{
 const r=await q("SELECT * FROM articles WHERE slug=$1",[req.params.slug]);
 if(!r.rows.length) return res.status(404).send("404");
 res.send(r.rows[0].article);
});

app.get("/sitemap.xml",async(req,res)=>{
 const r=await q("SELECT slug,created_at FROM articles ORDER BY created_at DESC");
 const urls=r.rows.map(x=>`
<url>
<loc>https://thehardwareguru.cz/top/${x.slug}</loc>
<lastmod>${new Date(x.created_at).toISOString()}</lastmod>
</url>`).join("");
 res.header("Content-Type","application/xml");
 res.send(`<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls}</urlset>`);
});

app.get("/",(req,res)=>res.send("OK"));

app.listen(PORT,"0.0.0.0",()=>console.log("FULL SYSTEM RUNNING",PORT));
