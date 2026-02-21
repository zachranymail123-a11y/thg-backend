
import express from "express";
import pkg from "pg";
import fetch from "node-fetch";
import slugify from "slugify";

const {Pool} = pkg;
const app = express();
const PORT = process.env.PORT || 3000;

const pool = new Pool({connectionString:process.env.DATABASE_URL,ssl:{rejectUnauthorized:false}});

async function init(){
 await pool.query(`CREATE TABLE IF NOT EXISTS live_game(
   id SERIAL PRIMARY KEY,
   title TEXT,
   description TEXT,
   youtube TEXT,
   updated TIMESTAMP DEFAULT NOW()
 )`);

 await pool.query(`CREATE TABLE IF NOT EXISTS articles(
   id SERIAL PRIMARY KEY,
   title TEXT,
   slug TEXT UNIQUE,
   article TEXT,
   created_at TIMESTAMP DEFAULT NOW()
 )`);
}
init().catch(()=>{});

app.get("/api/live",async(req,res)=>{
 try{
   const r=await pool.query("SELECT * FROM live_game ORDER BY updated DESC LIMIT 1");
   if(!r.rows.length) return res.json({live:false});
   res.json(r.rows[0]);
 }catch{
   res.json({live:false});
 }
});

app.get("/setlive",async(req,res)=>{
 const {title,desc,youtube}=req.query;
 if(!title) return res.send("missing title");
 await pool.query("INSERT INTO live_game(title,description,youtube) VALUES($1,$2,$3)",[title,desc||"",youtube||""]);
 res.send("ok");
});

function articleHTML(a){
return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${a.title}</title>
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
 const r=await pool.query("SELECT * FROM articles WHERE slug=$1",[req.params.slug]);
 if(!r.rows.length) return res.send("404");
 res.send(articleHTML(r.rows[0]));
});

app.get("/sitemap.xml",async(req,res)=>{
 const r=await pool.query("SELECT slug FROM articles");
 let urls=r.rows.map(x=>`<url><loc>https://thehardwareguru.cz/top/${x.slug}</loc></url>`).join("");
 res.header("Content-Type","application/xml");
 res.send(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls}</urlset>`);
});

function randomGame(){
 const games=["GTA 6","Cyberpunk","Warzone","Minecraft","Starfield","Elden Ring"];
 return games[Math.floor(Math.random()*games.length)];
}

app.get("/cron/daily",async(req,res)=>{
 try{
  for(let i=0;i<6;i++){
   const g=randomGame();
   const title=`${g} guide ${Date.now()} ${i}`;
   const slug=slugify(title,{lower:true,strict:true});
   const article=`${g} je populární hra.\nTipy pro stream.\nBuildy.\nNovinky.\nUpcoming content.`;
   try{
    await pool.query("INSERT INTO articles(title,slug,article) VALUES($1,$2,$3)",[title,slug,article]);
   }catch{}
  }
  res.send("ok");
 }catch(e){res.send("err");}
});

app.listen(PORT,()=>console.log("RUN"));
