
import express from "express";
import pkg from "pg";
import cors from "cors";

const { Pool } = pkg;

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 8080;
const DATABASE_URL = process.env.DATABASE_URL;

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: { rejectUnauthorized:false }
});

// ===== DB INIT =====
async function init(){
  try{
    await pool.query(`
      CREATE TABLE IF NOT EXISTS articles(
        id SERIAL PRIMARY KEY,
        title TEXT,
        slug TEXT UNIQUE,
        article TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);
    console.log("DB READY");
  }catch(e){
    console.log("DB ERROR", e.message);
  }
}
init();

// ===== ROOT =====
app.get("/", (req,res)=>{
  res.send("THG BACKEND OK");
});

// ===== LIVE (simple) =====
app.get("/api/live", async (req,res)=>{
  try{
    const r = await pool.query("SELECT title, article FROM articles ORDER BY id DESC LIMIT 1");
    if(!r.rows.length){
      return res.json({live:false,title:"Žádná hra",description:""});
    }
    res.json({live:true,title:r.rows[0].title,description:r.rows[0].article});
  }catch{
    res.json({live:false,title:"DB error",description:""});
  }
});

// ===== SLUG =====
function slugify(t){
  return t.toLowerCase()
  .normalize("NFD").replace(/[\u0300-\u036f]/g,"")
  .replace(/[^a-z0-9]+/g,"-")
  .replace(/(^-|-$)/g,"");
}

// ===== GENERATOR =====
function topics(){
  const d=new Date();
  const m=d.toLocaleString("cs",{month:"long"});
  const y=d.getFullYear();
  const g=["RPG","FPS","open world","survival","stealth","horror"];
  const b=["GTA","Skyrim","Elden Ring","Witcher","Cyberpunk"];
  const pick=a=>a[Math.floor(Math.random()*a.length)];
  return [
    `Nejlepší ${pick(g)} hry ${m} ${y}`,
    `Nové hry ${m} ${y}`,
    `Hry jako ${pick(b)}`,
    `Best ${pick(g)} games ${y}`,
    `New games ${m} ${y}`,
    `Games like ${pick(b)}`
  ];
}

async function save(title){
  const slug=slugify(title);
  const ex=await pool.query("SELECT id FROM articles WHERE slug=$1",[slug]);
  if(ex.rows.length) return;

  const html=`
<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>${title}</title>
<meta name="description" content="${title}">
<style>
body{font-family:Arial;background:#0b0f1a;color:#fff;max-width:900px;margin:auto;padding:40px}
a{color:#00ffe1}
h1{color:#00ffe1}
.btn{display:inline-block;margin:10px 10px 20px 0;padding:14px 22px;background:#00ffe1;color:#000;text-decoration:none;font-weight:bold;border-radius:10px}
</style>
</head>
<body>
<a class="btn" href="https://thehardwareguru.cz">← zpět na stream</a>
<h1>${title}</h1>
<p>Gaming článek a přehled hry. Sleduj gameplay a další streamy.</p>
<p>
<a class="btn" href="https://kick.com/thehardwareguru" target="_blank">Kick stream</a>
<a class="btn" href="https://www.youtube.com/@TheHardwareGuru_Czech" target="_blank">YouTube</a>
<a class="btn" href="https://discord.com/invite/n7xThr8" target="_blank">Discord</a>
</p>
</body>
</html>`;

  await pool.query(
    "INSERT INTO articles(title,slug,article) VALUES($1,$2,$3)",
    [title,slug,html]
  );
}

// ===== CRON =====
app.get("/cron/daily", async (req,res)=>{
  const t=topics();
  for(const x of t) await save(x);
  res.send("OK generated "+t.length);
});

// ===== TOP ARTICLE PAGE 🔥 =====
app.get("/top/:slug", async (req,res)=>{
  try{
    const slug=req.params.slug;
    const r=await pool.query("SELECT article FROM articles WHERE slug=$1 LIMIT 1",[slug]);

    if(!r.rows.length){
      return res.send("Článek nenalezen");
    }

    res.send(r.rows[0].article);
  }catch(e){
    res.send("error");
  }
});

// ===== SITEMAP =====
app.get("/sitemap.xml", async (req,res)=>{
  const r=await pool.query("SELECT slug FROM articles ORDER BY id DESC LIMIT 5000");
  let urls="";
  r.rows.forEach(x=>{
    urls+=`<url><loc>https://thehardwareguru.cz/top/${x.slug}</loc></url>`;
  });

  const xml=`<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>`;

  res.header("Content-Type","application/xml");
  res.send(xml);
});

app.listen(PORT,()=>console.log("THG BACKEND FINAL RUNNING",PORT));
