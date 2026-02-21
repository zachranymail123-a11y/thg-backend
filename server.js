
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

async function safeQuery(q,params=[]){
 try{return await pool.query(q,params)}
 catch{return {rows:[]}}
}

async function init(){
 await safeQuery(`CREATE TABLE IF NOT EXISTS live_game(
   id SERIAL PRIMARY KEY,
   title TEXT,
   description TEXT,
   youtube TEXT,
   updated TIMESTAMP DEFAULT NOW()
 )`);

 await safeQuery(`CREATE TABLE IF NOT EXISTS articles(
   id SERIAL PRIMARY KEY,
   title TEXT,
   slug TEXT UNIQUE,
   article TEXT,
   created_at TIMESTAMP DEFAULT NOW()
 )`);
}
init();

app.get("/api/live",async(req,res)=>{
 const r=await safeQuery("SELECT * FROM live_game ORDER BY updated DESC LIMIT 1");
 if(!r.rows.length) return res.json({live:false});
 res.json(r.rows[0]);
});

app.get("/setlive",async(req,res)=>{
 const {title,desc,youtube}=req.query;
 if(!title) return res.send("missing title");
 await safeQuery("INSERT INTO live_game(title,description,youtube) VALUES($1,$2,$3)",[title,desc||"",youtube||""]);
 res.send("ok");
});

function articleHTML(a){
return `<!DOCTYPE html><html><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${a.title}</title>
<meta name="description" content="${a.title} guide">
<link rel="canonical" href="https://thehardwareguru.cz/top/${a.slug}">
<style>
body{background:#0b0f14;color:#fff;font-family:Arial;padding:40px;max-width:900px;margin:auto}
a{color:#00ffcc}
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
 const r=await safeQuery("SELECT * FROM articles WHERE slug=$1",[req.params.slug]);
 if(!r.rows.length) return res.status(404).send("Not found");
 res.send(articleHTML(r.rows[0]));
});

app.get("/sitemap.xml",async(req,res)=>{
 const r=await safeQuery("SELECT slug, created_at FROM articles ORDER BY created_at DESC");
 const urls = r.rows.map(x=>`
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

function randomGame(){
 const games=["GTA 6","Cyberpunk 2077","Warzone","Minecraft","Starfield","Elden Ring","Helldivers 2"];
 return games[Math.floor(Math.random()*games.length)];
}

app.get("/cron/daily",async(req,res)=>{
 for(let i=0;i<6;i++){
   const g=randomGame();
   const title=`${g} guide ${Date.now()} ${i}`;
   const slug=slugify(title,{lower:true,strict:true});
   const article=`${g} je populární hra.\nTipy pro stream.\nBuildy.\nNovinky.\nUpcoming obsah.\nPodobné hry.`;
   await safeQuery("INSERT INTO articles(title,slug,article) VALUES($1,$2,$3) ON CONFLICT (slug) DO NOTHING",[title,slug,article]);
 }
 res.send("ok");
});

app.listen(PORT);
