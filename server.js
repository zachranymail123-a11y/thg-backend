
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

// ---------- NEWS SCRAPERS ----------

async function scrape(url, selector){
 try{
  const html=await (await fetch(url,{headers:{'user-agent':'Mozilla'}})).text();
  const $=cheerio.load(html);
  let arr=[];
  $(selector).each((i,el)=>{
   const t=$(el).text().trim();
   if(t.length>4 && t.length<120) arr.push(t);
  });
  return arr;
 }catch(e){return [];}
}

async function ign(){return scrape("https://www.ign.com/games","h3")}
async function pcgamer(){return scrape("https://www.pcgamer.com/news/","h3")}
async function gamespot(){return scrape("https://www.gamespot.com/news/","h3")}
async function kotaku(){return scrape("https://kotaku.com","h2")}

async function reddit(){
 try{
  const html=await (await fetch("https://www.reddit.com/r/gaming/")).text();
  const matches=[...html.matchAll(/<h3.*?>(.*?)<\/h3>/g)];
  return matches.map(m=>m[1]);
 }catch(e){return [];}
}

async function steam(){
 try{
  const html=await (await fetch("https://store.steampowered.com/search/?filter=popularnew")).text();
  const matches=[...html.matchAll(/<span class="title">(.*?)<\/span>/g)];
  return matches.map(m=>m[1]);
 }catch(e){return [];}
}

function clean(a){
 return [...new Set(a.map(x=>x.replace(/[^a-zA-Z0-9 :'-]/g,"").trim()))]
 .filter(x=>x.length>4 && x.length<80);
}

async function collectAll(){
 const data=await Promise.all([ign(),pcgamer(),gamespot(),kotaku(),reddit(),steam()]);
 return clean(data.flat()).slice(0,80);
}

// ---------- ARTICLE TEMPLATE ----------

function article(title){
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
<h2>🎮 Sleduj live gameplay</h2>
<a href="${KICK}" class="btn k">WATCH LIVE ON KICK</a>
<a href="${YT}" class="btn y">YouTube</a>
</div>

<p>Jsem 45letý gamer co tohle hraje live. Chill stream, žádný tryhard. Kecáme s chatem a máme AI co reaguje přímo během streamu.</p>

<p>${title} aktuálně trenduje v gaming světě. Pokud chceš vidět reálný gameplay bez bullshitu a marketingu, přijď live na stream.</p>

<div class="cta">
<h2>🔥 Join stream</h2>
<a href="${KICK}" class="btn k">WATCH LIVE</a>
<a href="${YT}" class="btn y">YouTube</a>
</div>

</body></html>`;
}

// ---------- GENERATOR ----------

async function exists(title){
 const r=await q("SELECT id FROM games WHERE title=$1",[title]);
 return r.rows.length>0;
}

async function generate(){
 const topics=await collectAll();

 let created=0;
 for(const t of topics){
  if(created>=18) break;
  if(await exists(t)) continue;

  const slug=slugify(t,{lower:true,strict:true});
  await q("INSERT INTO games(title,slug,article) VALUES($1,$2,$3)",[t,slug,article(t)]);
  created++;
 }
}

// run every 6h
setInterval(generate,1000*60*60*6);
generate();

// endpoints
app.get("/cron/daily",async(req,res)=>{
 await generate();
 res.send("ULTIMATE NEWS ENGINE RUN");
});

app.get("/sitemap.xml",async(req,res)=>{
 const r=await q("SELECT slug,created_at FROM games ORDER BY created_at DESC LIMIT 1000");
 const urls=r.rows.map(x=>`<url><loc>https://thehardwareguru.cz/top/${x.slug}</loc><lastmod>${new Date(x.created_at).toISOString()}</lastmod></url>`).join("");
 res.header("Content-Type","application/xml");
 res.send(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls}</urlset>`);
});

app.get("/top/:slug",async(req,res)=>{
 const r=await q("SELECT article FROM games WHERE slug=$1",[req.params.slug]);
 if(!r.rows.length) return res.status(404).send("404");
 res.send(r.rows[0].article);
});

app.listen(PORT,"0.0.0.0",()=>console.log("ULTIMATE NEWS ENGINE RUNNING",PORT));
