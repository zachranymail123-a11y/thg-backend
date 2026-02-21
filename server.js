
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

async function hardReset(){
 await q("DROP TABLE IF EXISTS articles");
 await q(`CREATE TABLE articles(
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

hardReset();

function extractGame(title){
 if(!title) return null;
 return title.split("|")[0].split("-")[0].trim();
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

 const desc=`${game} je aktuálně streamovaná hra na kanále TheHardwareGuru. Sleduj živé hraní, reálné reakce a kompletní průchod bez střihu přímo na streamu.`;
 await q("INSERT INTO game_cache(game,description) VALUES($1,$2)",[game,desc]);
 return desc;
}

app.get("/api/live",async(req,res)=>{
 const game=await detectGame();
 const desc=await getDescription(game);
 res.json({
  live:true,
  title:game,
  description:desc,
  youtube:"https://www.youtube.com/@TheHardwareGuru_Czech",
  kick:"https://kick.com/thehardwareguru"
 });
});

const games=["GTA 6","Cyberpunk 2077","Elden Ring","Alan Wake 2","Baldur's Gate 3","Silent Hill","Starfield","Red Dead Redemption 2"];
const topics=["Complete Guide 2026","Story Analysis","Gameplay Breakdown","New Update Overview","Why It’s Trending"];

function rand(a){return a[Math.floor(Math.random()*a.length)]}

async function generateArticle(){
 const game=rand(games);
 const topic=rand(topics);
 const title=`${game} ${topic}`;
 const slug=slugify(title+"-"+Date.now(),{lower:true,strict:true});

 const html=`
<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<link rel="canonical" href="https://thehardwareguru.cz/top/${slug}">
<style>
body{background:#0b0f14;color:#fff;font-family:Arial;padding:40px;max-width:900px;margin:auto;line-height:1.7}
h1{font-size:36px}
h2{margin-top:40px}
.cta{margin:40px 0;padding:25px;background:#111827;border-radius:14px;text-align:center}
.btn{display:inline-block;margin:10px;padding:14px 26px;font-weight:bold;border-radius:8px;text-decoration:none}
.kick{background:#00ff88;color:#000}
.yt{background:#ff0033;color:#fff}
</style>
</head>
<body>

<h1>${title}</h1>

<div class="cta">
<h2>🎮 WATCH LIVE GAMEPLAY</h2>
<a href="https://kick.com/thehardwareguru" class="btn kick">WATCH LIVE ON KICK</a>
<a href="https://www.youtube.com/@TheHardwareGuru_Czech" class="btn yt">YouTube</a>
</div>

<h2>Overview</h2>
<p>${game} patří mezi nejdiskutovanější hry současnosti. Tento článek přináší detailní rozbor herních mechanik, aktualizací a důvodů, proč si titul drží vysokou popularitu mezi hráči.</p>

<h2>Gameplay & Mechanics</h2>
<p>Hra nabízí propracovaný příběh, moderní herní prvky a silnou atmosféru. Každý update přináší nové výzvy a obsah, který udržuje komunitu aktivní.</p>

<h2>Why Watch It Live</h2>
<p>Sledování živého hraní poskytuje autentický pohled na herní mechaniky a reakce bez střihu. TheHardwareGuru streamuje pravidelně a přináší kompletní průchody a testy novinek.</p>

<div class="cta">
<h2>🔥 Sleduj stream živě</h2>
<a href="https://kick.com/thehardwareguru" class="btn kick">WATCH LIVE</a>
</div>

</body>
</html>
`;

 await q("INSERT INTO articles(title,slug,article) VALUES($1,$2,$3)",[title,slug,html]);
}

app.get("/cron/daily",async(req,res)=>{
 for(let i=0;i<12;i++){
  await generateArticle();
 }
 res.send("generated 12 magazine articles");
});

app.get("/top/:slug",async(req,res)=>{
 const r=await q("SELECT article FROM articles WHERE slug=$1",[req.params.slug]);
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

app.listen(PORT,"0.0.0.0",()=>console.log("FINAL PRODUCTION RUNNING",PORT));
