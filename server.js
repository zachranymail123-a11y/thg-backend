
const express=require("express");
const {Pool}=require("pg");
const slugify=require("slugify");
const fetch=(...a)=>import('node-fetch').then(({default:fetch})=>fetch(...a));
const cheerio=require("cheerio");

const app=express();
const PORT=process.env.PORT||3000;

const YT="https://www.youtube.com/@TheHardwareGuru_Czech";
const KICK="https://kick.com/thehardwareguru";

let pool=null;
if(process.env.DATABASE_URL){
 pool=new Pool({connectionString:process.env.DATABASE_URL,ssl:{rejectUnauthorized:false}});
}

async function q(sql,p=[]){
 if(!pool) return {rows:[]};
 try{return await pool.query(sql,p);}catch(e){return {rows:[]};}
}

async function init(){
 await q(`CREATE TABLE IF NOT EXISTS games(
  id SERIAL PRIMARY KEY,
  title TEXT,
  slug TEXT UNIQUE,
  article TEXT,
  created_at TIMESTAMP DEFAULT NOW()
 )`);
}
init();

// -------- SOURCES --------
async function steam(){
 try{
  const html=await (await fetch("https://store.steampowered.com/search/?filter=popularnew")).text();
  const matches=[...html.matchAll(/<span class="title">(.*?)<\/span>/g)];
  return matches.slice(0,20).map(m=>m[1]);
 }catch(e){return [];}
}

async function twitch(){
 try{
  const html=await (await fetch("https://twitchtracker.com/games")).text();
  const $=cheerio.load(html);
  let arr=[];
  $("a").each((i,el)=>{
   const t=$(el).text().trim();
   if(t.length>2&&t.length<40) arr.push(t);
  });
  return arr.slice(0,20);
 }catch(e){return [];}
}

async function youtube(){
 try{
  const html=await (await fetch("https://www.youtube.com/feed/gaming")).text();
  const matches=[...html.matchAll(/"title":\{"runs":\[\{"text":"([^"]+)/g)];
  return matches.slice(0,20).map(m=>m[1]);
 }catch(e){return [];}
}

async function reddit(){
 try{
  const html=await (await fetch("https://www.reddit.com/r/gaming/")).text();
  const matches=[...html.matchAll(/<h3.*?>(.*?)<\/h3>/g)];
  return matches.slice(0,20).map(m=>m[1]);
 }catch(e){return [];}
}

function clean(a){
 return [...new Set(a.map(x=>x.replace(/[^a-zA-Z0-9 :'-]/g,"").trim()))]
 .filter(x=>x.length>3 && x.length<60);
}

async function collect(){
 const s=await steam();
 const t=await twitch();
 const y=await youtube();
 const r=await reddit();
 return clean([...s,...t,...y,...r]).slice(0,40);
}

async function exists(title){
 const r=await q("SELECT id FROM games WHERE title=$1",[title]);
 return r.rows.length>0;
}

function articleTemplate(title){
 return `<!DOCTYPE html>
<html><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<style>
body{background:#0b0f14;color:#fff;font-family:Arial;padding:40px;max-width:900px;margin:auto;line-height:1.7}
h1{font-size:34px}
.cta{margin:40px 0;padding:25px;background:#111827;border-radius:14px;text-align:center}
.btn{display:inline-block;margin:10px;padding:14px 26px;font-weight:bold;border-radius:8px;text-decoration:none}
.k{background:#00ff88;color:#000}.y{background:#ff0033;color:#fff}
</style>
</head>
<body>

<h1>${title}</h1>

<div class="cta">
<h2>🎮 Sleduj real gameplay live</h2>
<a href="${KICK}" class="btn k">WATCH LIVE ON KICK</a>
<a href="${YT}" class="btn y">YouTube</a>
</div>

<p>Jsem 45letý gamer co hraje tuhle hru live na streamu. Žádný tryhard, chill atmosféra, kecáme s chatem a testujeme hry v reálném čase. V chatu je i aktivní AI divák, který reaguje a dělá stream zábavnější.</p>

<p>${title} teď trenduje mezi hráči a komunitou. Pokud chceš vidět reálné hraní bez přetvářky a marketingových keců, sleduj live stream.</p>

<div class="cta">
<h2>🔥 Přijď na live stream</h2>
<a href="${KICK}" class="btn k">WATCH LIVE</a>
<a href="${YT}" class="btn y">YouTube</a>
</div>

</body></html>`;
}

async function generate(title){
 if(await exists(title)) return;
 const slug=slugify(title,{lower:true,strict:true});
 const html=articleTemplate(title);
 await q("INSERT INTO games(title,slug,article) VALUES($1,$2,$3)",[title,slug,html]);
}

async function run(){
 const r=await q("SELECT count(*) FROM games WHERE created_at > NOW() - INTERVAL '24 hours'");
 const today=parseInt(r.rows[0]?.count||0);
 if(today>=12) return;

 const topics=await collect();
 let left=12-today;

 for(const t of topics){
  if(left<=0) break;
  await generate(t);
  left--;
 }
}

setInterval(run,1000*60*60*6);
run();

app.get("/cron/daily",async(req,res)=>{
 await run();
 res.send("MASTER ENGINE RUN");
});

app.get("/sitemap.xml",async(req,res)=>{
 const r=await q("SELECT slug,created_at FROM games ORDER BY created_at DESC LIMIT 500");
 const urls=r.rows.map(x=>`<url><loc>https://thehardwareguru.cz/top/${x.slug}</loc><lastmod>${new Date(x.created_at).toISOString()}</lastmod></url>`).join("");
 res.header("Content-Type","application/xml");
 res.send(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls}</urlset>`);
});

app.get("/top/:slug",async(req,res)=>{
 const r=await q("SELECT article FROM games WHERE slug=$1",[req.params.slug]);
 if(!r.rows.length) return res.status(404).send("404");
 res.send(r.rows[0].article);
});

app.listen(PORT,"0.0.0.0",()=>console.log("MASTER ENGINE RUNNING",PORT));
