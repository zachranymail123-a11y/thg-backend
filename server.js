
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

// ensure games table columns
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

// -------- scrape real topics ----------
async function steam(){
 try{
  const html=await (await fetch("https://store.steampowered.com/search/?filter=popularnew")).text();
  const matches=[...html.matchAll(/<span class="title">(.*?)<\/span>/g)];
  return matches.slice(0,20).map(m=>m[1]);
 }catch(e){return [];}
}

async function ign(){
 try{
  const html=await (await fetch("https://www.ign.com/games")).text();
  const $=cheerio.load(html);
  let arr=[];
  $("h3").each((i,el)=>{
   const t=$(el).text().trim();
   if(t.length>3&&t.length<60) arr.push(t);
  });
  return arr;
 }catch(e){return [];}
}

function uniq(a){return [...new Set(a.map(x=>x.trim()))].filter(Boolean)}

async function collect(){
 const s=await steam();
 const i=await ign();
 return uniq([...s,...i]).slice(0,30);
}

// prevent duplicates by game name
async function exists(title){
 const r=await q("SELECT id FROM games WHERE title=$1",[title]);
 return r.rows.length>0;
}

async function generate(title){
 if(await exists(title)) return;

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
.k{background:#00ff88;color:#000}.y{background:#ff0033;color:#fff}
</style>
</head>
<body>

<h1>${title}</h1>

<div class="cta">
<h2>🎮 Sleduj live stream</h2>
<a href="${KICK}" class="btn k">WATCH LIVE ON KICK</a>
<a href="${YT}" class="btn y">YouTube</a>
</div>

<p>${title} aktuálně trenduje v herní komunitě. Sleduj živé hraní, reakce a reálný gameplay přímo na streamu TheHardwareGuru.</p>

<div class="cta">
<h2>🔥 Join live community</h2>
<a href="${KICK}" class="btn k">WATCH LIVE</a>
<a href="${YT}" class="btn y">YouTube</a>
</div>

</body></html>`;

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
 res.send("engine for games table executed");
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

app.listen(PORT,"0.0.0.0",()=>console.log("ENGINE FIXED FOR GAMES TABLE",PORT));
