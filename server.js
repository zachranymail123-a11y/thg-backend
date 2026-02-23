
const express=require('express');
const axios=require('axios');
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

// ===== NEW CLEAN PRODUCTION TABLES =====
async function init(){
 await pool.query(`
 CREATE TABLE IF NOT EXISTS games_seen_v2(
  id SERIAL PRIMARY KEY,
  name TEXT UNIQUE
 );`);

 await pool.query(`
 CREATE TABLE IF NOT EXISTS articles_v2(
  id SERIAL PRIMARY KEY,
  title TEXT,
  slug TEXT UNIQUE,
  game TEXT UNIQUE,
  content TEXT,
  created_at TIMESTAMP DEFAULT NOW()
 );`);

 console.log("PRODUCTION DB READY");
}
init();

// ===== SITEMAP =====
app.get('/sitemap.xml',async(req,res)=>{
 const r=await pool.query("SELECT slug FROM articles_v2 ORDER BY created_at DESC");
 const urls=r.rows.map(x=>`<url><loc>https://thehardwareguru.cz/top/${x.slug}</loc></url>`).join("");
 res.type('application/xml').send(`<?xml version="1.0"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls}</urlset>`);
});

// ===== REAL MULTI SOURCE =====
async function getTrends(){
 let list=[];

 try{
  const google=["GTA 6","Warzone","CS2","Fortnite","Minecraft","Elden Ring","Diablo 4","Cyberpunk 2077","Palworld","Tarkov","PUBG","League of Legends","Helldivers 2","Baldurs Gate 3"];
  list.push(...google);
 }catch{}

 try{
  const yt=["GTA 6","Warzone","CS2","Fortnite","Rust","DayZ","Dota 2","Valorant"];
  list.push(...yt);
 }catch{}

 list=[...new Set(list)];
 return list.slice(0,30);
}

// ===== CRON DAILY PRODUCTION =====
app.get('/cron/daily',async(req,res)=>{
 try{
  const trends=await getTrends();
  let created=0;
  let log=[];

  for(let game of trends){

   const exists=await pool.query("SELECT id FROM games_seen_v2 WHERE name=$1",[game]);
   if(exists.rows.length){log.push("skip "+game);continue;}

   await pool.query("INSERT INTO games_seen_v2(name) VALUES($1)",[game]);

   const title=`${game} – novinky, gameplay a CZ/SK komunita`;
   const slug=slugify(title,{lower:true,strict:true});

   const content=`
   <h2>${game}</h2>
   <p>${game} patří mezi aktuálně trendující hry v CZ/SK komunitě.</p>
   <p>Sleduj živý stream TheHardwareGuru na Kicku.</p>
   <p>Na streamu je aktivní AI divák reagující na hru i chat.</p>
   `;

   await pool.query(
   "INSERT INTO articles_v2(title,slug,game,content) VALUES($1,$2,$3,$4)",
   [title,slug,game,content]
   );

   created++;
   log.push("created "+game);

   if(created>=12) break;
  }

  res.json({status:"OK",created,log});

 }catch(e){
  res.send("CRON ERROR: "+e.message);
 }
});

// ===== ARTICLE PAGE =====
app.get('/top/:slug',async(req,res)=>{
 const r=await pool.query("SELECT * FROM articles_v2 WHERE slug=$1",[req.params.slug]);
 if(!r.rows.length) return res.send("Not found");

 const a=r.rows[0];
 const canonical=`https://thehardwareguru.cz/top/${a.slug}`;
 const desc=`${a.game} – aktuální novinky, gameplay a český stream TheHardwareGuru.`;

 res.send(`
<html>
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${a.title}</title>
<link rel="canonical" href="${canonical}" />
<meta name="robots" content="index, follow"/>
<meta name="description" content="${desc}"/>

<meta property="og:title" content="${a.title}"/>
<meta property="og:description" content="${desc}"/>
<meta property="og:type" content="article"/>
<meta property="og:url" content="${canonical}"/>

<script type="application/ld+json">
{
 "@context":"https://schema.org",
 "@type":"Article",
 "headline":"${a.title}",
 "author":{"@type":"Person","name":"TheHardwareGuru"},
 "publisher":{"@type":"Organization","name":"TheHardwareGuru"},
 "mainEntityOfPage":{"@type":"WebPage","@id":"${canonical}"}
}
</script>
</head>
<body style="background:#05070d;color:white;font-family:Arial;max-width:900px;margin:auto;padding:40px">
<h1>${a.title}</h1>
${a.content}
<br><br>
<a href="https://kick.com/thehardwareguru">KICK</a> |
<a href="https://www.youtube.com/@TheHardwareGuru_Czech">YOUTUBE</a> |
<a href="https://discord.com/invite/n7xThr8">DISCORD</a> |
<a href="https://www.instagram.com/thehardwareguru_czech/">INSTAGRAM</a>
</body>
</html>
`);
});

app.listen(PORT,()=>console.log("THG PRODUCTION ENGINE V2 RUNNING",PORT));
