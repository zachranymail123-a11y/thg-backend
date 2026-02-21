
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

// ---------- INIT DB SAFE ----------
async function initDB(){
 await pool.query(`
 CREATE TABLE IF NOT EXISTS articles(
  id SERIAL PRIMARY KEY,
  title TEXT,
  slug TEXT UNIQUE,
  article TEXT,
  created_at TIMESTAMP DEFAULT NOW()
 )
 `);
}
initDB();

// ROOT
app.get("/", (req,res)=> res.send("THG BACKEND RUNNING"));

// ---------- LIVE ----------
app.get("/api/live", async (req,res)=>{
 try{
   const r = await pool.query("SELECT title, article FROM articles ORDER BY id DESC LIMIT 1");

   if(r.rows.length===0){
     return res.json({
       live:false,
       title:"Žádná hra zatím",
       description:"Čekám na první vygenerovaný článek"
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
     title:"DB offline",
     description:"Databáze zatím prázdná"
   });
 }
});

// ---------- GAME ----------
app.get("/api/game/:title", async(req,res)=>{
 try{
   const title=req.params.title;
   const r=await pool.query(
     "SELECT article FROM articles WHERE LOWER(title)=LOWER($1) LIMIT 1",
     [title]
   );

   if(r.rows.length===0){
     return res.json({description:"Popis se generuje..."});
   }

   res.json({description:r.rows[0].article});
 }catch(e){
   res.json({description:"DB error"});
 }
});

// ---------- SLUG ----------
function slugify(t){
 return t.toLowerCase()
 .normalize("NFD").replace(/[\u0300-\u036f]/g,"")
 .replace(/[^a-z0-9]+/g,"-")
 .replace(/(^-|-$)/g,"");
}

// ---------- GENERATOR ----------
function topics(){
 const d=new Date();
 const month=d.toLocaleString("cs",{month:"long"});
 const year=d.getFullYear();
 const genres=["RPG","open world","stealth","FPS","survival","horror"];
 const big=["GTA","Skyrim","Elden Ring","Witcher","Cyberpunk"];

 const pick=a=>a[Math.floor(Math.random()*a.length)];

 return [
  `Nejlepší ${pick(genres)} hry ${month} ${year}`,
  `Nové hry ${month} ${year}`,
  `Hry jako ${pick(big)}`,
  `Best ${pick(genres)} games ${year}`,
  `New games ${month} ${year}`,
  `Games like ${pick(big)}`
 ];
}

async function save(title){
 const slug=slugify(title);
 const e=await pool.query("SELECT id FROM articles WHERE slug=$1",[slug]);
 if(e.rows.length>0) return;

 const content=`
<h1>${title}</h1>
<p>Aktuální přehled her a gameplay.</p>
<p><a href="https://kick.com/thehardwareguru" target="_blank">▶ Sleduj stream</a></p>
`;

 await pool.query(
 "INSERT INTO articles(title,slug,article) VALUES($1,$2,$3)",
 [title,slug,content]
 );
}

// ---------- CRON ----------
app.get("/cron/daily", async(req,res)=>{
 try{
  const t=topics();
  for(const x of t){ await save(x); }
  res.send("OK generated "+t.length);
 }catch(e){
  res.send("cron error");
 }
});

// ---------- SITEMAP ----------
app.get("/sitemap.xml", async(req,res)=>{
 try{
  const r=await pool.query("SELECT slug FROM articles ORDER BY id DESC LIMIT 5000");
  const urls=r.rows.map(x=>`<url><loc>https://thehardwareguru.cz/top/${x.slug}</loc></url>`).join("");
  const xml=`<?xml version="1.0" encoding="UTF-8"?>
  <urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls}</urlset>`;
  res.header("Content-Type","application/xml");
  res.send(xml);
 }catch{
  res.send("<urlset></urlset>");
 }
});

app.listen(PORT,()=>console.log("DB SAFE BACKEND RUNNING",PORT));
