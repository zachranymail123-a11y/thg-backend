
const express=require('express');
const axios=require('axios');
const cors=require('cors');
const {Pool}=require('pg');
const slugify=require('slugify');

const app=express();
app.use(cors());
app.use(express.json());

const PORT=process.env.PORT||3000;

// ===== DB CONNECT =====
const pool=new Pool({
 connectionString:process.env.DATABASE_URL,
 ssl:{rejectUnauthorized:false}
});

// ===== FORCE DB INIT =====
async function initDB(){
 try{
  await pool.query(`
  CREATE TABLE IF NOT EXISTS articles(
   id SERIAL PRIMARY KEY,
   title TEXT,
   slug TEXT UNIQUE,
   game TEXT UNIQUE,
   content TEXT,
   created_at TIMESTAMP DEFAULT NOW()
  );`);
  console.log("DB READY");
 }catch(e){
  console.log("DB INIT ERROR:",e.message);
 }
}
initDB();

// ===== DEBUG DB =====
app.get('/db-test',async(req,res)=>{
 try{
  const r=await pool.query("SELECT COUNT(*) FROM articles");
  res.send("DB OK. Articles count: "+r.rows[0].count);
 }catch(e){
  res.send("DB ERROR: "+e.message);
 }
});

// ===== SITEMAP =====
app.get('/sitemap.xml',async(req,res)=>{
 try{
  const r=await pool.query("SELECT slug FROM articles ORDER BY created_at DESC");
  const urls=r.rows.map(x=>`<url><loc>https://thehardwareguru.cz/top/${x.slug}</loc></url>`).join("");
  res.type('application/xml').send(`<?xml version="1.0"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls}</urlset>`);
 }catch(e){
  res.send("SITEMAP ERROR: "+e.message);
 }
});

// ===== REAL GAME LIST =====
async function getGames(){
 try{
  const r=await axios.get("https://api.steampowered.com/ISteamChartsService/GetMostPlayedGames/v1/");
  const ids=r.data.response.ranks.slice(0,15).map(g=>g.appid);
  let names=[];
  for(let id of ids){
   try{
    const d=await axios.get(`https://store.steampowered.com/api/appdetails?appids=${id}`);
    const data=d.data[id];
    if(data.success && data.data.type==="game"){
     names.push(data.data.name);
    }
   }catch{}
  }
  if(names.length) return names;
 }catch{}
 return ["GTA 6","Warzone","CS2","Fortnite","Elden Ring","Diablo 4"];
}

// ===== CRON =====
app.get('/cron/daily',async(req,res)=>{
 try{
  const games=await getGames();
  let created=0;
  let log=[];

  for(let g of games){

   const exists=await pool.query("SELECT id FROM articles WHERE game=$1",[g]);
   if(exists.rows.length){log.push("SKIP "+g);continue;}

   const title=`${g} – novinky, gameplay a stream`;
   const slug=slugify(title,{lower:true,strict:true});

   const content=`<h2>${g}</h2>
   <p>Aktuální novinky a gameplay ze světa ${g}.</p>
   <p>Sleduj live stream TheHardwareGuru.</p>`;

   await pool.query(
   "INSERT INTO articles(title,slug,game,content) VALUES($1,$2,$3,$4)",
   [title,slug,g,content]
   );

   created++;
   log.push("CREATED "+g);
   if(created>=6) break;
  }

  res.json({
   status:"OK",
   created,
   log
  });

 }catch(e){
  res.send("CRON ERROR: "+e.message);
 }
});

// ===== ARTICLE PAGE =====
app.get('/top/:slug',async(req,res)=>{
 try{
  const r=await pool.query("SELECT * FROM articles WHERE slug=$1",[req.params.slug]);
  if(!r.rows.length) return res.send("Not found");

  const a=r.rows[0];
  const canonical=`https://thehardwareguru.cz/top/${a.slug}`;

  res.send(`
  <html>
  <head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <title>${a.title}</title>
  <link rel="canonical" href="${canonical}" />
  <meta name="robots" content="index, follow" />
  </head>
  <body style="background:#05070d;color:white;font-family:Arial;max-width:900px;margin:auto;padding:40px">
  <h1>${a.title}</h1>
  ${a.content}
  <br><br>
  <a href="https://kick.com/thehardwareguru">KICK</a> |
  <a href="https://www.youtube.com/@TheHardwareGuru_Czech">YOUTUBE</a> |
  <a href="https://discord.com/invite/n7xThr8">DISCORD</a>
  </body></html>
  `);

 }catch(e){
  res.send("ARTICLE ERROR: "+e.message);
 }
});

app.listen(PORT,()=>console.log("HARD FIX ENGINE RUNNING",PORT));
