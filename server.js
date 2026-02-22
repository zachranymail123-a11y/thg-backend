
const express=require('express');
const axios=require('axios');
const cheerio=require('cheerio');
const cors=require('cors');
const {Pool}=require('pg');
const slugify=require('slugify');

const app=express();
app.use(cors());
app.use(express.json());

const PORT=process.env.PORT||3000;

const pool=new Pool({
 connectionString:process.env.DATABASE_URL,
 ssl:{rejectUnauthorized:false}
});

// ===== DB INIT =====
async function init(){
 await pool.query(`CREATE TABLE IF NOT EXISTS articles(
 id SERIAL PRIMARY KEY,
 title TEXT,
 slug TEXT UNIQUE,
 game TEXT UNIQUE,
 content TEXT,
 created_at TIMESTAMP DEFAULT NOW()
 );`);
}
init();

// ===== SITEMAP =====
app.get('/sitemap.xml',async(req,res)=>{
 const r=await pool.query("SELECT slug FROM articles ORDER BY created_at DESC");
 const urls=r.rows.map(x=>`<url><loc>https://thehardwareguru.cz/top/${x.slug}</loc></url>`).join("");
 res.type('application/xml').send(`<?xml version="1.0"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls}</urlset>`);
});

// ===== REAL STEAM TREND ENGINE =====
async function getSteamTopGames(){
 try{
  const r=await axios.get("https://api.steampowered.com/ISteamChartsService/GetMostPlayedGames/v1/");
  const ids=r.data.response.ranks.slice(0,20).map(g=>g.appid);
  let names=[];

  for(let id of ids){
   try{
    const detail=await axios.get(`https://store.steampowered.com/api/appdetails?appids=${id}`);
    const data=detail.data[id];
    if(data.success && data.data.type==="game"){
     names.push(data.data.name);
    }
   }catch{}
  }
  return names;
 }catch{
  return ["GTA 6","Counter-Strike 2","Fortnite","Warzone","Elden Ring","Diablo 4"];
 }
}

// ===== CRON =====
app.get('/cron/daily',async(req,res)=>{
 try{
  const games=await getSteamTopGames();
  let created=0;

  for(let g of games){

   const exists=await pool.query("SELECT id FROM articles WHERE game=$1",[g]);
   if(exists.rows.length) continue;

   const title=`${g} – aktuální novinky, gameplay a stream`;
   const slug=slugify(title,{lower:true,strict:true});

   const content=`
   <h2>${g}</h2>
   <p>Nejnovější informace, gameplay a meta ze světa ${g}.</p>
   <p>Sleduj český stream TheHardwareGuru na Kicku.</p>
   <p>YouTube: https://www.youtube.com/@TheHardwareGuru_Czech</p>
   `;

   await pool.query(
   "INSERT INTO articles(title,slug,game,content) VALUES($1,$2,$3,$4)",
   [title,slug,g,content]);

   created++;
   if(created>=6) break;
  }

  res.send("OK");
 }catch(e){
  console.log(e);
  res.send("OK");
 }
});

// ===== ARTICLE PAGE =====
app.get('/top/:slug',async(req,res)=>{
 const r=await pool.query("SELECT * FROM articles WHERE slug=$1",[req.params.slug]);
 if(!r.rows.length) return res.status(404).send("Not found");
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
 <meta name="description" content="${a.title} – aktuální novinky a gameplay informace."/>
 <style>
 body{background:#05070d;color:white;font-family:Arial;max-width:900px;margin:auto;padding:40px}
 .btn{background:#00ffee;color:#000;padding:14px 22px;border-radius:10px;text-decoration:none;margin:6px;display:inline-block;font-weight:bold}
 </style>
 </head>
 <body>
 <h1>${a.title}</h1>
 ${a.content}
 <br>
 <a class="btn" href="https://kick.com/thehardwareguru">SLEDOVAT LIVE</a>
 <a class="btn" href="https://www.youtube.com/@TheHardwareGuru_Czech">YOUTUBE</a>
 <a class="btn" href="https://discord.com/invite/n7xThr8">DISCORD</a>
 </body>
 </html>`);
});

app.listen(PORT,()=>console.log("THG FINAL ENGINE RUNNING",PORT));
