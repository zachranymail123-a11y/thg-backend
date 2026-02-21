
const express = require("express");
const { Pool } = require("pg");
const slugify = require("slugify");

const app = express();
const PORT = process.env.PORT || 3000;

let pool = null;
if(process.env.DATABASE_URL){
  pool = new Pool({
    connectionString:process.env.DATABASE_URL,
    ssl:{rejectUnauthorized:false}
  });
}

async function q(sql,p=[]){
  if(!pool) return {rows:[]};
  try{return await pool.query(sql,p)}catch{return {rows:[]}}
}

async function init(){
  await q(`CREATE TABLE IF NOT EXISTS live_game(
    id SERIAL PRIMARY KEY,
    title TEXT,
    description TEXT,
    youtube TEXT,
    updated TIMESTAMP DEFAULT NOW()
  )`);
  await q(`CREATE TABLE IF NOT EXISTS articles(
    id SERIAL PRIMARY KEY,
    title TEXT,
    slug TEXT UNIQUE,
    article TEXT,
    created_at TIMESTAMP DEFAULT NOW()
  )`);
}
init();

const games=["GTA 6","Cyberpunk 2077","Warzone","Starfield","Elden Ring","Alan Wake 2","Baldur's Gate 3","Silent Hill"];
const topics=["Update 2026","Complete Guide","Story Overview","Gameplay Analysis","New Features Explained"];

function rand(a){return a[Math.floor(Math.random()*a.length)]}

async function generateArticle(lang){
  const game=rand(games);
  const topic=rand(topics);
  const title = lang==="cz"
    ? `${game} ${topic} – Kompletní Přehled`
    : `${game} ${topic} – Complete Overview`;

  const slug=slugify(title+"-"+Date.now(),{lower:true,strict:true});

  const article=`
<div style="max-width:900px;margin:auto;padding:40px;font-family:Arial;">
<h1 style="font-size:38px;">${title}</h1>

<div style="margin:30px 0;padding:25px;background:#111827;border-radius:14px;text-align:center;">
<h2>🎮 WATCH LIVE GAMEPLAY</h2>
<p>TheHardwareGuru streamuje nové hry každý den.</p>
<a href="https://kick.com/thehardwareguru" style="display:inline-block;margin:10px;padding:14px 26px;background:#00ff88;color:#000;font-weight:bold;border-radius:8px;text-decoration:none;">WATCH LIVE ON KICK</a>
<a href="https://youtube.com/@thehardwareguru" style="display:inline-block;margin:10px;padding:14px 26px;background:#ff0033;color:#fff;font-weight:bold;border-radius:8px;text-decoration:none;">YouTube Gameplay</a>
</div>

<h2>Overview</h2>
<p>${game} patří mezi nejdiskutovanější tituly poslední doby. Tento článek přináší detailní pohled na změny, herní mechaniky a důvody, proč hra přitahuje hráče po celém světě.</p>

<h2>Gameplay & Mechanics</h2>
<p>Hra nabízí kombinaci příběhu, akce a strategických rozhodnutí. Každý update přináší nové prvky, které ovlivňují styl hraní i celkovou dynamiku.</p>

<h2>Why It’s Trending</h2>
<p>Komunita sleduje novinky kolem hry kvůli častým aktualizacím a novému obsahu. Díky tomu zůstává hra relevantní a stále populární.</p>

<div style="margin:40px 0;padding:25px;background:#020617;border-radius:14px;text-align:center;">
<h2>🔥 Sleduj Live Gameplay</h2>
<p>Chceš vidět reálný gameplay bez střihu? Sleduj stream živě.</p>
<a href="https://kick.com/thehardwareguru" style="display:inline-block;margin:10px;padding:14px 26px;background:#00ff88;color:#000;font-weight:bold;border-radius:8px;text-decoration:none;">WATCH LIVE</a>
</div>

</div>
`;

  await q("INSERT INTO articles(title,slug,article) VALUES($1,$2,$3) ON CONFLICT (slug) DO NOTHING",[title,slug,article]);
}

app.get("/cron/daily",async(req,res)=>{
  for(let i=0;i<6;i++) await generateArticle("cz");
  for(let i=0;i<6;i++) await generateArticle("en");
  res.send("generated 12 authority articles");
});

app.get("/api/live",async(req,res)=>{
  const r=await q("SELECT * FROM live_game ORDER BY updated DESC LIMIT 1");
  if(!r.rows.length) return res.json({live:false});
  res.json(r.rows[0]);
});

app.get("/top/:slug",async(req,res)=>{
  const r=await q("SELECT * FROM articles WHERE slug=$1",[req.params.slug]);
  if(!r.rows.length) return res.status(404).send("404");
  res.send(r.rows[0].article);
});

app.get("/sitemap.xml",async(req,res)=>{
  const r=await q("SELECT slug, created_at FROM articles ORDER BY created_at DESC");
  const urls=r.rows.map(x=>`
<url>
<loc>https://thehardwareguru.cz/top/${x.slug}</loc>
<lastmod>${new Date(x.created_at).toISOString()}</lastmod>
</url>`).join("");
  res.header("Content-Type","application/xml");
  res.send(`<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>`);
});

app.listen(PORT,"0.0.0.0",()=>console.log("SERVER RUNNING ON PORT",PORT));
