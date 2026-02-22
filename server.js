
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

// -------- NEWS SOURCES --------
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

function clean(a){
 return [...new Set(a.map(x=>x.replace(/[^a-zA-Z0-9 :'-]/g,"").trim()))]
 .filter(x=>x.length>4 && x.length<80);
}

async function collect(){
 const data=await Promise.all([ign(),pcgamer(),gamespot(),kotaku()]);
 return clean(data.flat()).slice(0,60);
}

// -------- ARTICLE TEMPLATE --------
function template(title,links){
 return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<meta name="description" content="Real gameplay stream této hry. Sleduj live TheHardwareGuru.">
<style>
body{background:#0b0f14;color:#fff;font-family:Arial;padding:40px;max-width:950px;margin:auto;line-height:1.7}
h1{font-size:36px}
.cta{margin:35px 0;padding:25px;background:#111827;border-radius:14px;text-align:center}
.btn{display:inline-block;margin:10px;padding:16px 28px;font-weight:bold;border-radius:10px;text-decoration:none}
.k{background:#00ff88;color:#000;font-size:18px}
.y{background:#ff0033;color:#fff}
.box{background:#111827;padding:20px;border-radius:12px;margin:25px 0}
a{color:#00ffcc}
</style>
</head>
<body>

<h1>${title}</h1>

<div class="cta">
<h2>🔴 Jsem live nebo budu brzy</h2>
<a href="${KICK}" class="btn k">WATCH LIVE STREAM</a>
<a href="${YT}" class="btn y">YouTube</a>
</div>

<div class="box">
Jsem 45letý gamer co hraje bez tryhardu. Chill stream, kecáme s chatem a mám AI diváka co reaguje. Pokud chceš reálný gameplay bez fake reakcí — přijď na stream.
</div>

<p>${title} aktuálně trenduje v gaming komunitě. Sleduju novinky, testuju buildy a hraju to live. Pokud tě zajímá real gameplay a ne jen trailer — přijď na stream.</p>

<div class="cta">
<h2>🎮 Sleduj live gameplay</h2>
<a href="${KICK}" class="btn k">WATCH ON KICK</a>
<a href="${YT}" class="btn y">YouTube</a>
</div>

<h3>🔥 Další trendy hry</h3>
<ul>
${links}
</ul>

<div class="cta">
<h2>💬 Chill stream bez tryhardu</h2>
<a href="${KICK}" class="btn k">JOIN STREAM</a>
</div>

</body></html>`;
}

// -------- GENERATOR --------
async function exists(title){
 const r=await q("SELECT id FROM games WHERE title=$1",[title]);
 return r.rows.length>0;
}

async function generate(){
 const topics=await collect();
 const latest=await q("SELECT title,slug FROM games ORDER BY created_at DESC LIMIT 5");

 for(const t of topics){
  if(await exists(t)) continue;

  const slug=slugify(t,{lower:true,strict:true});
  const links=latest.rows.map(l=>`<li><a href="/top/${l.slug}">${l.title}</a></li>`).join("");
  const html=template(t,links);

  await q("INSERT INTO games(title,slug,article) VALUES($1,$2,$3)",[t,slug,html]);
 }
}

setInterval(generate,1000*60*60*6);
generate();

app.get("/cron/daily",async(req,res)=>{
 await generate();
 res.send("GROWTH ENGINE RUN");
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

app.listen(PORT,"0.0.0.0",()=>console.log("GROWTH ENGINE RUNNING",PORT));
