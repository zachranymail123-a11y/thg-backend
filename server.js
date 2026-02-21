
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

// ROOT
app.get("/", (req,res)=>{
 res.send("THG BACKEND OK");
});

// ---------- LIVE GAME (TAHÁ POSLEDNÍ ČLÁNEK Z DB) ----------
app.get("/api/live", async (req,res)=>{
 try{
   const r = await pool.query(
    "SELECT title, article FROM articles ORDER BY id DESC LIMIT 1"
   );

   if(r.rows.length===0){
     return res.json({
       live:false,
       title:"Stream offline",
       description:"Čekám na první stream."
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
     title:"Chyba DB",
     description:""
   });
 }
});

// ---------- DETAIL HRY ----------
app.get("/api/game/:title", async(req,res)=>{
 const title=req.params.title;

 try{
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
function generateTopics(){
 const month=new Date().toLocaleString("cs",{month:"long"});
 const year=new Date().getFullYear();
 const genres=["RPG","open world","stealth","FPS","survival","horror"];
 const big=["GTA","Skyrim","Elden Ring","Witcher","Cyberpunk"];

 function pick(a){return a[Math.floor(Math.random()*a.length)]}

 return [
  `Nejlepší ${pick(genres)} hry ${month} ${year}`,
  `Nové hry ${month} ${year}`,
  `Hry jako ${pick(big)}`,
  `Best ${pick(genres)} games ${year}`,
  `New games ${month} ${year}`,
  `Games like ${pick(big)}`
 ];
}

async function saveArticle(title){
 const slug=slugify(title);
 const exists=await pool.query("SELECT id FROM articles WHERE slug=$1",[slug]);
 if(exists.rows.length>0) return;

 const content=`
<h1>${title}</h1>
<p>Kompletní přehled her a gameplay. Sleduj TheHardwareGuru živě.</p>
<p><a href="https://kick.com/thehardwareguru" target="_blank">▶ Sledovat stream</a></p>
`;

 await pool.query(
 "INSERT INTO articles(title,slug,article,created_at) VALUES($1,$2,$3,NOW())",
 [title,slug,content]
 );
}

// ---------- CRON ----------
app.get("/cron/daily", async(req,res)=>{
 try{
  const topics=generateTopics();
  for(const t of topics){ await saveArticle(t); }
  res.send("OK generated "+topics.length);
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
  <urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  ${urls}
  </urlset>`;
  res.header("Content-Type","application/xml");
  res.send(xml);
 }catch(e){
  res.send("<urlset></urlset>");
 }
});

app.listen(PORT,()=>console.log("THG LIVE FIX RUNNING",PORT));
