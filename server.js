
const express = require("express");
const { Pool } = require("pg");
const slugify = require("slugify");
const fetch = (...args)=>import('node-fetch').then(({default:fetch})=>fetch(...args));

const app = express();
const PORT = process.env.PORT || 3000;

const YOUTUBE_URL = "https://www.youtube.com/@TheHardwareGuru_Czech";
const KICK_URL = "https://kick.com/thehardwareguru";

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
 await q(`CREATE TABLE IF NOT EXISTS last_title(
   id SERIAL PRIMARY KEY,
   title TEXT,
   updated TIMESTAMP DEFAULT NOW()
 )`);
}
init();

function extractGame(title){
 if(!title) return null;
 return title.split("|")[0].split("-")[0].trim();
}

async function getKickTitle(){
 try{
   const r=await fetch("https://kick.com/api/v2/channels/thehardwareguru");
   const j=await r.json();
   if(j?.livestream?.session_title) return j.livestream.session_title;
   if(j?.previous_livestreams?.[0]?.session_title) return j.previous_livestreams[0].session_title;
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

async function getCurrentTitle(){
 let title=await getKickTitle();
 if(title){
   await q("INSERT INTO last_title(title) VALUES($1)",[title]);
   return title;
 }
 title=await getYouTubeLast();
 if(title){
   await q("INSERT INTO last_title(title) VALUES($1)",[title]);
   return title;
 }
 const r=await q("SELECT title FROM last_title ORDER BY updated DESC LIMIT 1");
 if(r.rows.length) return r.rows[0].title;
 return "TheHardwareGuru Stream";
}

async function getDescription(game){
 if(!game) return "";
 const r=await q("SELECT description FROM game_cache WHERE game=$1",[game]);
 if(r.rows.length) return r.rows[0].description;

 const desc=`${game} je aktuálně streamovaná hra na kanále TheHardwareGuru. Sleduj živé hraní, nové buildy a reálné reakce přímo na streamu.`;
 await q("INSERT INTO game_cache(game,description) VALUES($1,$2)",[game,desc]);
 return desc;
}

app.get("/api/live",async(req,res)=>{
 const title=await getCurrentTitle();
 const game=extractGame(title);
 const desc=await getDescription(game);
 res.json({
  title,
  description:desc,
  youtube:YOUTUBE_URL,
  kick:KICK_URL
 });
});

// -------- TREND ENGINE --------

async function getSteamTrending(){
 try{
  const html = await (await fetch("https://store.steampowered.com/search/?filter=topsellers")).text();
  const matches=[...html.matchAll(/data-ds-appid=".*?".*?<span class="title">(.*?)<\/span>/g)];
  return matches.slice(0,20).map(m=>m[1]);
 }catch(e){return [];}
}

async function getGoogleTrending(){
 return ["GTA 6","Cyberpunk 2077","Palworld","Warzone","Elden Ring","Starfield","Helldivers 2"];
}

async function getYouTubeTrending(){
 try{
  const html=await (await fetch("https://www.youtube.com/feed/trending")).text();
  const matches=[...html.matchAll(/"title":\{"runs":\[\{"text":"([^"]+)/g)];
  return matches.slice(0,15).map(m=>m[1]);
 }catch(e){return [];}
}

function uniq(arr){
 return [...new Set(arr.map(x=>x.trim()))].filter(Boolean);
}

async function collectTrends(){
 const steam=await getSteamTrending();
 const google=await getGoogleTrending();
 const yt=await getYouTubeTrending();
 return uniq([...steam,...google,...yt]).slice(0,40);
}

async function existsTitle(t){
 const r=await q("SELECT id FROM articles WHERE title=$1",[t]);
 return r.rows.length>0;
}

async function generateArticle(topic,lang){
 const title = lang==="cz"
  ? `${topic} – novinky, gameplay a informace`
  : `${topic} – gameplay, updates and details`;

 if(await existsTitle(title)) return;

 const slug=slugify(title,{lower:true,strict:true});

 const html=`
<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<style>
body{background:#0b0f14;color:#fff;font-family:Arial;padding:40px;max-width:900px;margin:auto;line-height:1.7}
h1{font-size:34px}
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
<h2>🎮 Sleduj live gameplay</h2>
<a href="${KICK_URL}" class="btn kick">WATCH LIVE ON KICK</a>
<a href="${YOUTUBE_URL}" class="btn yt">YouTube</a>
</div>

<h2>O hře</h2>
<p>${topic} patří mezi aktuálně trendující herní témata. Tento článek přináší přehled novinek, gameplay informací a důvodů, proč titul sleduje herní komunita.</p>

<h2>Proč hra trenduje</h2>
<p>Hra získává popularitu díky novým updateům, komunitě a streamům. Sleduj živé hraní pro autentický zážitek bez střihu.</p>

<div class="cta">
<h2>🔥 Sleduj stream TheHardwareGuru</h2>
<a href="${KICK_URL}" class="btn kick">WATCH LIVE</a>
<a href="${YOUTUBE_URL}" class="btn yt">YouTube</a>
</div>

</body>
</html>`;

 await q("INSERT INTO articles(title,slug,article) VALUES($1,$2,$3)",[title,slug,html]);
}

app.get("/cron/daily",async(req,res)=>{
 const trends=await collectTrends();
 let used=0;
 for(const t of trends){
  if(used>=6) break;
  await generateArticle(t,"cz");
  used++;
 }
 used=0;
 for(const t of trends){
  if(used>=6) break;
  await generateArticle(t,"en");
  used++;
 }
 res.send("generated 12 trend articles");
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

app.listen(PORT,"0.0.0.0",()=>console.log("TREND ENGINE RUNNING",PORT));
