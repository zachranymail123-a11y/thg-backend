
const express = require("express");
const { Pool } = require("pg");
const slugify = require("slugify");
const fetch = (...args)=>import('node-fetch').then(({default:fetch})=>fetch(...args));
const cheerio = require("cheerio");

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
 await q(`CREATE TABLE IF NOT EXISTS used_topics(
   id SERIAL PRIMARY KEY,
   topic TEXT UNIQUE,
   created_at TIMESTAMP DEFAULT NOW()
 )`);
}
init();

// -------- SCRAPING NEWS --------

async function scrapeIGN(){
 try{
  const html=await (await fetch("https://www.ign.com/games")).text();
  const $=cheerio.load(html);
  let games=[];
  $("h3").each((i,el)=>{
   const t=$(el).text().trim();
   if(t.length>3 && t.length<60) games.push(t);
  });
  return games;
 }catch(e){return [];}
}

async function scrapePCGamer(){
 try{
  const html=await (await fetch("https://www.pcgamer.com/news/")).text();
  const $=cheerio.load(html);
  let games=[];
  $("a").each((i,el)=>{
   const t=$(el).text().trim();
   if(t.match(/update|patch|release|game|dlc|expansion/i) && t.length<80){
     games.push(t);
   }
  });
  return games;
 }catch(e){return [];}
}

async function scrapeSteam(){
 try{
  const html=await (await fetch("https://store.steampowered.com/search/?filter=popularnew")).text();
  const matches=[...html.matchAll(/<span class="title">(.*?)<\/span>/g)];
  return matches.slice(0,25).map(m=>m[1]);
 }catch(e){return [];}
}

function cleanTopics(arr){
 return [...new Set(arr.map(x=>x.replace(/[^a-zA-Z0-9 :'-]/g,"").trim()))]
 .filter(x=>x.length>3 && x.length<80)
 .slice(0,40);
}

async function collectTopics(){
 const ign=await scrapeIGN();
 const pc=await scrapePCGamer();
 const steam=await scrapeSteam();
 return cleanTopics([...ign,...pc,...steam]);
}

// -------- GENERATION --------

async function used(topic){
 const r=await q("SELECT id FROM used_topics WHERE topic=$1",[topic]);
 return r.rows.length>0;
}

async function generateArticle(topic){
 if(await used(topic)) return;

 const title = topic;
 const slug=slugify(title,{lower:true,strict:true});

 const html=`<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<style>
body{background:#0b0f14;color:#fff;font-family:Arial;padding:40px;max-width:900px;margin:auto;line-height:1.7}
h1{font-size:34px}
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

<p>${title} aktuálně trenduje v herním světě. Hráči řeší nové změny, aktualizace a gameplay mechaniky. Sleduj živý stream pro autentické reakce a reálné hraní bez střihu.</p>

<h2>Proč se o tom mluví</h2>
<p>Komunita aktivně reaguje na novinky a změny. Tento článek shrnuje důležité informace a důvody, proč je hra opět v centru pozornosti.</p>

<div class="cta">
<h2>🔥 Sleduj stream TheHardwareGuru</h2>
<a href="${KICK_URL}" class="btn kick">WATCH LIVE</a>
<a href="${YOUTUBE_URL}" class="btn yt">YouTube</a>
</div>

</body>
</html>`;

 await q("INSERT INTO articles(title,slug,article) VALUES($1,$2,$3) ON CONFLICT DO NOTHING",[title,slug,html]);
 await q("INSERT INTO used_topics(topic) VALUES($1) ON CONFLICT DO NOTHING",[topic]);
}

async function runEngine(){
 const r=await q("SELECT count(*) FROM articles WHERE created_at > NOW() - INTERVAL '24 hours'");
 const today=parseInt(r.rows[0]?.count||0);
 if(today>=12) return;

 const topics=await collectTopics();
 let left=12-today;

 for(const t of topics){
  if(left<=0) break;
  await generateArticle(t);
  left--;
 }
}

setInterval(runEngine,1000*60*60*6);
runEngine();

app.get("/cron/daily",async(req,res)=>{
 await runEngine();
 res.send("news trend engine executed");
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

app.listen(PORT,"0.0.0.0",()=>console.log("NEWS SCRAPER ENGINE RUNNING",PORT));
