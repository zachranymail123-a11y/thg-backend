
import express from "express";
import pkg from "pg";
import slugify from "slugify";

const {Pool} = pkg;
const app = express();
const PORT = process.env.PORT || 3000;

const pool = new Pool({
 connectionString:process.env.DATABASE_URL,
 ssl:{rejectUnauthorized:false}
});

async function q(sql,p=[]){
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
await init();

/* AUTO GENERATE DAILY IF EMPTY */
async function ensureArticles(){
 const r=await q("SELECT COUNT(*) FROM articles");
 if(Number(r.rows[0]?.count||0)>0) return;

 for(let i=0;i<6;i++) await generateOne(i);
}
await ensureArticles();

const games=["GTA 6","Cyberpunk 2077","Warzone","Minecraft","Starfield","Elden Ring","Helldivers 2","Fortnite","Diablo 4","Baldur's Gate 3"];
const topics=["guide","tips","best settings","build","how to play","2026 update","new expansion","gameplay","review","walkthrough"];

function rand(a){return a[Math.floor(Math.random()*a.length)]}

async function generateOne(i){
 const game=rand(games);
 const topic=rand(topics);
 const title=`${game} ${topic} ${Date.now()} ${i}`;
 const slug=slugify(title,{lower:true,strict:true});
 const article=`${game} ${topic} kompletní přehled.

Tipy pro hráče.
Buildy.
Novinky.
Upcoming content.
Podobné hry.
Streaming guide.`;

 await q("INSERT INTO articles(title,slug,article) VALUES($1,$2,$3) ON CONFLICT (slug) DO NOTHING",[title,slug,article]);
}

app.get("/cron/daily",async(req,res)=>{
 for(let i=0;i<6;i++) await generateOne(i);
 res.send("generated 6");
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

function html(a){
return `<!DOCTYPE html><html><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${a.title}</title>
<link rel="canonical" href="https://thehardwareguru.cz/top/${a.slug}">
<style>
body{background:#0b0f14;color:#fff;font-family:Arial;padding:40px;max-width:900px;margin:auto}
.btn{display:inline-block;margin:10px;padding:12px 20px;background:#00ff88;color:#000;text-decoration:none;border-radius:8px}
</style></head><body>
<h1>${a.title}</h1>
<div>${a.article.replace(/\n/g,"<br>")}</div>
<br>
<a class="btn" href="https://kick.com/thehardwareguru">Kick</a>
<a class="btn" href="https://youtube.com/@thehardwareguru">YouTube</a>
<a class="btn" href="/">Zpět</a>
</body></html>`;
}

app.get("/top/:slug",async(req,res)=>{
 const r=await q("SELECT * FROM articles WHERE slug=$1",[req.params.slug]);
 if(!r.rows.length) return res.status(404).send("404");
 res.send(html(r.rows[0]));
});

app.get("/sitemap.xml",async(req,res)=>{
 const r=await q("SELECT slug, created_at FROM articles ORDER BY created_at DESC LIMIT 5000");
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

app.listen(PORT);
