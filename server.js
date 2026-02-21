
import express from "express";
import fetch from "node-fetch";
import pkg from "pg";
import cors from "cors";

const { Pool } = pkg;

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 8080;
const OPENAI_API = process.env.OPENAI_API;
const DATABASE_URL = process.env.DATABASE_URL;

const pool = new Pool({
 connectionString: DATABASE_URL,
 ssl: { rejectUnauthorized: false }
});

// ---------- INIT DB ----------
async function initDB(){
 await pool.query(`
 CREATE TABLE IF NOT EXISTS games(
  id SERIAL PRIMARY KEY,
  slug TEXT UNIQUE,
  title TEXT,
  description TEXT,
  article TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
 );
 `);

 await pool.query(`
 CREATE TABLE IF NOT EXISTS articles(
  id SERIAL PRIMARY KEY,
  slug TEXT UNIQUE,
  title TEXT,
  lang TEXT,
  content TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
 );
 `);
}

// ---------- HELPERS ----------
function slugify(t){
 return t.toLowerCase()
 .replace(/[^a-z0-9]+/g,"-")
 .replace(/(^-|-$)/g,"");
}

// ---------- AI GENERATOR ----------
async function aiArticle(title,lang){

 const prompt = lang==="cz"
 ? `Napiš dlouhý profesionální SEO gaming článek česky o: ${title}. Minimálně 1200 slov.`
 : `Write long professional SEO gaming article about: ${title}. 1200+ words.`;

 const r = await fetch("https://api.openai.com/v1/responses",{
  method:"POST",
  headers:{
   "Authorization":"Bearer "+OPENAI_API,
   "Content-Type":"application/json"
  },
  body:JSON.stringify({
   model:"gpt-4.1-mini",
   input:prompt
  })
 });

 const data = await r.json();
 return data.output?.[0]?.content?.[0]?.text || title;
}

// ---------- GAME PAGE ----------
app.get("/api/game/:title", async(req,res)=>{

 const raw = decodeURIComponent(req.params.title);
 const clean = raw.replace(/LIVE|CZ|Gameplay|🔥/gi,"").trim();
 const slug = slugify(clean);

 let g = await pool.query("SELECT * FROM games WHERE slug=$1",[slug]);

 if(g.rows.length>0){
  res.json(g.rows[0]);
  return;
 }

 const article = await aiArticle(clean,"cz");
 const desc = article.substring(0,300);

 await pool.query(
  "INSERT INTO games(slug,title,description,article) VALUES($1,$2,$3,$4)",
  [slug,clean,desc,article]
 );

 const saved = await pool.query("SELECT * FROM games WHERE slug=$1",[slug]);
 res.json(saved.rows[0]);
});

// ---------- DAILY AUTOPILOT ----------
app.get("/cron/daily", async(req,res)=>{

 const year = new Date().getFullYear();

 const topics = [
  `Nejlepší hry ${year}`,
  `Nové hry ${year}`,
  `Nejočekávanější hry ${year+1}`,
  `Best games ${year}`,
  `New games ${year}`,
  `Upcoming games ${year+1}`
 ];

 for(const t of topics){

  const lang = t.match(/Best|New|Upcoming/) ? "en" : "cz";
  const slug = slugify(t+"-"+lang);

  const exist = await pool.query("SELECT * FROM articles WHERE slug=$1",[slug]);
  if(exist.rows.length>0) continue;

  const content = await aiArticle(t,lang);

  await pool.query(
   "INSERT INTO articles(slug,title,lang,content) VALUES($1,$2,$3,$4)",
   [slug,t,lang,content]
  );
 }

 res.send("DAILY GENERATED OK");
});

// ---------- SEO PAGE ----------
app.get("/top/:slug", async(req,res)=>{
 const a = await pool.query("SELECT * FROM articles WHERE slug=$1",[req.params.slug]);
 if(a.rows.length===0){ res.send("nenalezeno"); return; }

 const art = a.rows[0];

 res.send(`
 <!DOCTYPE html>
 <html lang="${art.lang}">
 <head>
 <meta charset="UTF-8">
 <title>${art.title}</title>
 <meta name="description" content="${art.title}">
 </head>
 <body style="background:#05070f;color:white;font-family:Arial;max-width:900px;margin:60px auto;line-height:1.7">
 <h1>${art.title}</h1>
 <div>${art.content.replace(/\\n/g,"<br>")}</div>
 <p><a href="https://thehardwareguru.cz">← zpět na stream</a></p>
 </body>
 </html>
 `);
});

// ---------- SITEMAP ----------
app.get("/sitemap.xml", async(req,res)=>{

 const g = await pool.query("SELECT slug FROM games");
 const a = await pool.query("SELECT slug FROM articles");

 let xml=`<?xml version="1.0" encoding="UTF-8"?>
 <urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">`;

 g.rows.forEach(r=>{
  xml+=`<url><loc>https://thehardwareguru.cz/hra/${r.slug}</loc></url>`;
 });

 a.rows.forEach(r=>{
  xml+=`<url><loc>https://thehardwareguru.cz/top/${r.slug}</loc></url>`;
 });

 xml+="</urlset>";

 res.header("Content-Type","application/xml");
 res.send(xml);
});

initDB().then(()=>{
 app.listen(PORT,()=>console.log("THG FINAL BACKEND RUNNING "+PORT));
});
