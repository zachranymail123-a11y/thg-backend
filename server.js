
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

    // LIVE TABLE
    await pool.query(`
      CREATE TABLE IF NOT EXISTS live_game(
        id SERIAL PRIMARY KEY,
        title TEXT,
        description TEXT,
        youtube TEXT,
        updated TIMESTAMP DEFAULT NOW()
      );
    `);

    // ARTICLES TABLE
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
    console.log("DB INIT ERROR", e.message);
  }
}
init();

// ===== LIVE GAME API =====
app.get("/api/live", async (req,res)=>{
  try{
    const r = await pool.query("SELECT * FROM live_game ORDER BY id DESC LIMIT 1");

    if(!r.rows.length){
      return res.json({
        live:false,
        title:"Žádný stream",
        description:""
      });
    }

    res.json({
      live:true,
      title:r.rows[0].title,
      description:r.rows[0].description,
      youtube:r.rows[0].youtube || ""
    });

  }catch(e){
    res.json({live:false,title:"DB error",description:""});
  }
});

// ===== UPDATE LIVE GAME MANUAL =====
app.get("/setlive", async (req,res)=>{

  const title = req.query.title || "Live stream";
  const desc = req.query.desc || "Sleduj live gameplay";
  const yt = req.query.youtube || "";

  await pool.query(
    "INSERT INTO live_game(title,description,youtube) VALUES($1,$2,$3)",
    [title,desc,yt]
  );

  res.send("LIVE UPDATED");
});

// ===== SLUG =====
function slugify(t){
  return t.toLowerCase()
  .normalize("NFD").replace(/[\u0300-\u036f]/g,"")
  .replace(/[^a-z0-9]+/g,"-")
  .replace(/(^-|-$)/g,"");
}

// ===== TOPICS =====
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

// ===== SAVE ARTICLE =====
async function save(title){
  const slug=slugify(title);
  const ex=await pool.query("SELECT id FROM articles WHERE slug=$1",[slug]);
  if(ex.rows.length) return;

  const content=`
<h1>${title}</h1>
<p>Gaming článek a přehled.</p>
<p><a href="https://kick.com/thehardwareguru" target="_blank">▶ Sleduj stream</a></p>
`;

  await pool.query(
    "INSERT INTO articles(title,slug,article) VALUES($1,$2,$3)",
    [title,slug,content]
  );
}

// ===== CRON =====
app.get("/cron/daily", async (req,res)=>{
  const t=topics();
  for(const x of t) await save(x);
  res.send("OK generated "+t.length);
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

app.listen(PORT,()=>console.log("THG FINAL RUNNING",PORT));
