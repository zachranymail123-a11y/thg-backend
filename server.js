
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
 await q(`CREATE TABLE IF NOT EXISTS trend_log(
   id SERIAL PRIMARY KEY,
   game TEXT,
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
 if(title){ await q("INSERT INTO last_title(title) VALUES($1)",[title]); return title;}
 title=await getYouTubeLast();
 if(title){ await q("INSERT INTO last_title(title) VALUES($1)",[title]); return title;}
 const r=await q("SELECT title FROM last_title ORDER BY updated DESC LIMIT 1");
 if(r.rows.length) return r.rows[0].title;
 return "TheHardwareGuru Stream";
}

app.get("/api/live",async(req,res)=>{
 const title=await getCurrentTitle();
 res.json({title,youtube:YOUTUBE_URL,kick:KICK_URL});
});

async function steamTrending(){
 try{
  const html=await (await fetch("https://store.steampowered.com/search/?filter=popularnew")).text();
  const matches=[...html.matchAll(/<span class="title">(.*?)<\/span>/g)];
  return matches.slice(0,20).map(m=>m[1]);
 }catch(e){return [];}
}

async function googleTrends(){
 return ["new game release","game patch","game update","new survival game","new rpg game"];
}

function uniq(a){return [...new Set(a.map(x=>x.trim()))].filter(Boolean)}

async function collectTrends(){
 const steam=await steamTrending();
 const google=await googleTrends();
 return uniq([...steam,...google]).slice(0,30);
}

async function generatedToday(){
 const r=await q("SELECT count(*) FROM articles WHERE created_at > NOW() - INTERVAL '24 hours'");
 return parseInt(r.rows[0]?.count||0);
}

async function usedRecently(game){
 const r=await q("SELECT id FROM trend_log WHERE game=$1 AND created_at > NOW() - INTERVAL '7 days'",[game]);
 return r.rows.length>0;
}

async function generateArticle(game,lang){
 if(await usedRecently(game)) return;
 const title = lang==="cz"
  ? `${game} – novinky, gameplay a aktuální stav`
  : `${game} – gameplay, updates and current state`;

 const slug=slugify(title,{lower:true,strict:true});

 const html=`<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<style>
body{background:#0b0f14;color:#fff;font-family:Arial;padding:40px;max-width:900px;margin:auto}
.cta{background:#111827;padding:25px;margin:30px 0;border-radius:14px;text-align:center}
.btn{padding:14px 26px;margin:8px;display:inline-block;font-weight:bold;border-radius:8px;text-decoration:none}
.k{background:#00ff88;color:#000}.y{background:#ff0033;color:#fff}
</style></head><body>

<h1>${title}</h1>
<div class="cta">
<h2>🎮 Sleduj live gameplay</h2>
<a class="btn k" href="${KICK_URL}">WATCH LIVE ON KICK</a>
<a class="btn y" href="${YOUTUBE_URL}">YouTube</a>
</div>

<p>${game} patří mezi aktuálně sledované herní tituly. Tento článek přináší přehled novinek, změn a důvodů, proč hra znovu získává pozornost hráčů.</p>

<h2>Co je nového</h2>
<p>Nové aktualizace a komunitní zájem posouvají hru zpět do popředí. Sleduj živé hraní pro reálné reakce a gameplay bez střihu.</p>

<div class="cta">
<h2>🔥 Sleduj stream TheHardwareGuru</h2>
<a class="btn k" href="${KICK_URL}">WATCH LIVE</a>
<a class="btn y" href="${YOUTUBE_URL}">YouTube</a>
</div>

</body></html>`;

 await q("INSERT INTO articles(title,slug,article) VALUES($1,$2,$3) ON CONFLICT DO NOTHING",[title,slug,html]);
 await q("INSERT INTO trend_log(game) VALUES($1)",[game]);
}

async function runEngine(){
 const count=await generatedToday();
 if(count>=12) return;
 const trends=await collectTrends();
 let left=12-count;
 for(const g of trends){
  if(left<=0) break;
  await generateArticle(g,"cz");
  await generateArticle(g,"en");
  left-=2;
 }
}

setInterval(runEngine, 1000*60*60*6);
runEngine();

app.get("/cron/daily",async(req,res)=>{
 await runEngine();
 res.send("trend engine executed");
});

app.get("/top/:slug",async(req,res)=>{
 const r=await q("SELECT article FROM articles WHERE slug=$1",[req.params.slug]);
 if(!r.rows.length) return res.status(404).send("404");
 res.send(r.rows[0].article);
});

app.get("/sitemap.xml",async(req,res)=>{
 const r=await q("SELECT slug,created_at FROM articles ORDER BY created_at DESC");
 const urls=r.rows.map(x=>`<url><loc>https://thehardwareguru.cz/top/${x.slug}</loc><lastmod>${new Date(x.created_at).toISOString()}</lastmod></url>`).join("");
 res.header("Content-Type","application/xml");
 res.send(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls}</urlset>`);
});

app.listen(PORT,"0.0.0.0",()=>console.log("V8 TREND ENGINE RUNNING",PORT));
