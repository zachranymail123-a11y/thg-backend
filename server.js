
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
      ALTER TABLE articles
      ADD COLUMN IF NOT EXISTS article TEXT;
    `);

    console.log("DB AUTO FIX OK");

  }catch(e){
    console.log("DB INIT ERROR", e.message);
  }
}

initDB();

app.get("/", (req,res)=>{
  res.send("THG BACKEND OK");
});

async function safeQuery(q,p=[]){
  try{
    return await pool.query(q,p);
  }catch(e){
    console.log("DB ERR",e.message);
    return {rows:[]};
  }
}

app.get("/api/live", async (req,res)=>{
  const r = await safeQuery("SELECT title, article FROM articles ORDER BY id DESC LIMIT 1");

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
    description:r.rows[0].article || "Popis se generuje..."
  });
});

function slugify(t){
  return t.toLowerCase()
  .normalize("NFD").replace(/[\u0300-\u036f]/g,"")
  .replace(/[^a-z0-9]+/g,"-")
  .replace(/(^-|-$)/g,"");
}

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
  const ex=await safeQuery("SELECT id FROM articles WHERE slug=$1",[slug]);
  if(ex.rows.length) return;

  const content=`
<h1>${title}</h1>
<p>Gaming článek a gameplay.</p>
<p><a href="https://kick.com/thehardwareguru" target="_blank">▶ Sleduj stream</a></p>
`;

  await safeQuery(
    "INSERT INTO articles(title,slug,article,created_at) VALUES($1,$2,$3,NOW())",
    [title,slug,content]
  );
}

app.get("/cron/daily", async (req,res)=>{
  const t=topics();
  for(const x of t) await save(x);
  res.send("OK generated "+t.length);
});

app.listen(PORT,()=>{
  console.log("THG AUTO BACKEND RUNNING",PORT);
});
