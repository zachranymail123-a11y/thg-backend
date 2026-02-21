
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
  ssl: { rejectUnauthorized: false }
});

// === AUTO DB FIX ===
async function initDB(){
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

    await pool.query(`
      ALTER TABLE articles ADD COLUMN IF NOT EXISTS article TEXT;
    `);

    console.log("DB READY");
  }catch(e){
    console.log("DB INIT ERROR", e.message);
  }
}
initDB();

// ROOT
app.get("/", (req,res)=>{
  res.send("THG BACKEND RUNNING");
});

// LIVE GAME
app.get("/api/live", async (req,res)=>{
  try{
    const r = await pool.query("SELECT title, article FROM articles ORDER BY id DESC LIMIT 1");

    if(!r.rows.length){
      return res.json({
        live:false,
        title:"Žádná hra zatím",
        description:"Popis se generuje..."
      });
    }

    res.json({
      live:true,
      title:r.rows[0].title,
      description:r.rows[0].article || ""
    });

  }catch(e){
    res.json({
      live:false,
      title:"DB chyba",
      description:"DB error"
    });
  }
});

// SLUG
function slugify(t){
  return t.toLowerCase()
  .normalize("NFD").replace(/[\u0300-\u036f]/g,"")
  .replace(/[^a-z0-9]+/g,"-")
  .replace(/(^-|-$)/g,"");
}

// TOPICS
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

// SAVE
async function save(title){
  const slug = slugify(title);

  const ex = await pool.query("SELECT id FROM articles WHERE slug=$1",[slug]);
  if(ex.rows.length) return;

  const content = `<h1>${title}</h1>
<p>Nejnovější gameplay a info.</p>
<p><a href="https://kick.com/thehardwareguru" target="_blank">▶ Sleduj stream</a></p>`;

  await pool.query(
    "INSERT INTO articles(title,slug,article,created_at) VALUES($1,$2,$3,NOW())",
    [title,slug,content]
  );
}

// CRON
app.get("/cron/daily", async (req,res)=>{
  const t = topics();
  for(const x of t){
    await save(x);
  }
  res.send("OK generated "+t.length);
});

// 🔥 SITEMAP FIX
app.get("/sitemap.xml", async (req,res)=>{
  try{
    const r = await pool.query("SELECT slug FROM articles ORDER BY id DESC LIMIT 5000");

    let urls = "";
    r.rows.forEach(x=>{
      urls += `<url><loc>https://thehardwareguru.cz/top/${x.slug}</loc></url>`;
    });

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>`;

    res.header("Content-Type","application/xml");
    res.send(xml);

  }catch(e){
    res.send("sitemap error");
  }
});

app.listen(PORT,()=>{
  console.log("THG BACKEND RUNNING",PORT);
});
