
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

const games=["GTA 6","Cyberpunk 2077","Warzone","Starfield","Elden Ring","Helldivers 2","Baldur's Gate 3","Silent Hill","Alan Wake 2","Red Dead Redemption 2"];
const topics=["complete guide","story playthrough","first impressions","best settings","gameplay overview","review","tips and tricks","beginner guide"];

function rand(a){return a[Math.floor(Math.random()*a.length)]}

async function generateArticle(lang){
  const game=rand(games);
  const topic=rand(topics);
  const title=lang==="cz"
    ? `${game} ${topic} 2026 CZ`
    : `${game} ${topic} 2026`;
  const slug=slugify(title+"-"+Date.now(),{lower:true,strict:true});
  const intro=lang==="cz"
    ? `${game} patří mezi nejzajímavější hry roku 2026. V tomto článku najdeš přehled, tipy a důvody, proč sledovat live gameplay.`
    : `${game} is one of the most talked about games of 2026. Here you will find an overview, tips and reasons to watch live gameplay.`;
  const article=`
<h2>${title}</h2>
<p>${intro}</p>
<h3>Gameplay Overview</h3>
<p>${game} nabízí silný příběh, atmosféru a akci.</p>
<h3>Beginner Tips</h3>
<p>Zaměř se na správné tempo a sleduj detaily příběhu.</p>
<h3>Why Watch Live</h3>
<p>Sleduj TheHardwareGuru live pro autentický gameplay bez střihu.</p>
<div style="margin:30px;padding:20px;background:#111827;border-radius:10px;text-align:center;">
<h3>🎮 WATCH LIVE GAMEPLAY</h3>
<a href="https://kick.com/thehardwareguru" style="display:inline-block;padding:12px 20px;background:#00ff88;color:#000;font-weight:bold;border-radius:8px;text-decoration:none;">WATCH LIVE ON KICK</a>
</div>
`;
  await q("INSERT INTO articles(title,slug,article) VALUES($1,$2,$3) ON CONFLICT (slug) DO NOTHING",[title,slug,article]);
}

app.get("/cron/daily",async(req,res)=>{
  for(let i=0;i<6;i++) await generateArticle("cz");
  for(let i=0;i<6;i++) await generateArticle("en");
  res.send("generated 12");
});

app.get("/api/live",async(req,res)=>{
  const r=await q("SELECT * FROM live_game ORDER BY updated DESC LIMIT 1");
  if(!r.rows.length) return res.json({live:false});
  res.json(r.rows[0]);
});

app.get("/setlive",async(req,res)=>{
  const {title,desc,youtube}=req.query;
  if(!title) return res.send("missing");
  await q("INSERT INTO live_game(title,description,youtube) VALUES($1,$2,$3)",[title,desc||"",youtube||""]);
  res.send("ok");
});

app.get("/top/:slug",async(req,res)=>{
  const r=await q("SELECT * FROM articles WHERE slug=$1",[req.params.slug]);
  if(!r.rows.length) return res.status(404).send("404");
  const a=r.rows[0];
  res.send(`<!DOCTYPE html><html><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${a.title}</title>
<link rel="canonical" href="https://thehardwareguru.cz/top/${a.slug}">
<style>
body{background:#0b0f14;color:#fff;font-family:Arial;padding:40px;max-width:900px;margin:auto}
a{color:#00ff88}
</style></head><body>
${a.article}
</body></html>`);
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
