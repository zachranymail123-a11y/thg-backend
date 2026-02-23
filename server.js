
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

async function init(){
 await pool.query(`CREATE TABLE IF NOT EXISTS games_seen(
  id SERIAL PRIMARY KEY,
  name TEXT UNIQUE
 );`);

 await pool.query(`CREATE TABLE IF NOT EXISTS articles(
  id SERIAL PRIMARY KEY,
  title TEXT,
  slug TEXT UNIQUE,
  game TEXT UNIQUE,
  content TEXT,
  created_at TIMESTAMP DEFAULT NOW()
 );`);

 console.log("DB READY");
}
init();

app.get('/sitemap.xml',async(req,res)=>{
 const r=await pool.query("SELECT slug FROM articles ORDER BY created_at DESC");
 const urls=r.rows.map(x=>`<url><loc>https://thehardwareguru.cz/top/${x.slug}</loc></url>`).join("");
 res.type('application/xml').send(`<?xml version="1.0"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls}</urlset>`);
});

async function getTrendGames(){
 let games=[];
 try{
  const g=["GTA 6","Warzone","Counter-Strike 2","Fortnite","Minecraft","Elden Ring","Diablo 4","Cyberpunk 2077"];
  games.push(...g);
 }catch{}
 try{
  const yt=["GTA 6","Warzone","CS2","Palworld","Escape from Tarkov"];
  games.push(...yt);
 }catch{}
 games=[...new Set(games)];
 return games.slice(0,10);
}

app.get('/cron/daily',async(req,res)=>{
 try{
  const trends=await getTrendGames();
  let created=0;
  let log=[];

  for(let game of trends){
   const exists=await pool.query("SELECT id FROM games_seen WHERE name=$1",[game]);
   if(exists.rows.length){log.push("skip "+game);continue;}

   await pool.query("INSERT INTO games_seen(name) VALUES($1)",[game]);

   const title=`${game} – novinky, gameplay a CZ/SK komunita`;
   const slug=slugify(title,{lower:true,strict:true});
   const content=`
   <p><b>${game}</b> patří mezi aktuálně sledované hry v CZ/SK komunitě.</p>
   <p>Sleduj gameplay, novinky a live stream TheHardwareGuru.</p>
   <p>Na streamu je aktivní AI divák který reaguje na hru i chat.</p>
   `;

   await pool.query(
   "INSERT INTO articles(title,slug,game,content) VALUES($1,$2,$3,$4)",
   [title,slug,game,content]
   );

   created++;
   log.push("created "+game);
   if(created>=3) break;
  }

  res.json({status:"OK",created,log});
 }catch(e){
  res.send("CRON ERROR: "+e.message);
 }
});

app.get('/top/:slug',async(req,res)=>{
 const r=await pool.query("SELECT * FROM articles WHERE slug=$1",[req.params.slug]);
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
<meta property="og:image" content="https://thehardwareguru.cz/og.jpg"/>

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

app.listen(PORT,()=>console.log("CZSK AUTHORITY ENGINE RUNNING",PORT));
