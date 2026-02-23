
const express=require('express');
const cors=require('cors');
const {Pool}=require('pg');
const slugify=require('slugify');

const app=express();
app.use(cors());

const PORT=process.env.PORT||3000;

const pool=new Pool({
 connectionString:process.env.DATABASE_URL,
 ssl:{rejectUnauthorized:false}
});

// ===== INIT DB =====
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

// ===== DEMO ARTICLE GENERATOR =====
app.get('/cron/demo',async(req,res)=>{
 const games=["GTA 6","Warzone","CS2","Fortnite","Elden Ring","Diablo 4"];
 let created=0;

 for(let g of games){
  const exists=await pool.query("SELECT id FROM articles WHERE game=$1",[g]);
  if(exists.rows.length) continue;

  const title=`${g} – novinky, gameplay a český stream`;
  const slug=slugify(title,{lower:true,strict:true});
  const content=`<p>Aktuální informace o hře ${g}. Sleduj live stream TheHardwareGuru a zapoj se do komunity.</p>`;

  await pool.query(
  "INSERT INTO articles(title,slug,game,content) VALUES($1,$2,$3,$4)",
  [title,slug,g,content]);

  created++;
 }
 res.send("created "+created);
});

// ===== ARTICLE PAGE SEO MAX =====
app.get('/top/:slug',async(req,res)=>{
 const r=await pool.query("SELECT * FROM articles WHERE slug=$1",[req.params.slug]);
 if(!r.rows.length) return res.send("Not found");

 const a=r.rows[0];
 const canonical=`https://thehardwareguru.cz/top/${a.slug}`;
 const desc=`${a.game} – aktuální novinky, gameplay, tipy a český stream TheHardwareGuru.`;
 const date=new Date(a.created_at||Date.now()).toISOString();

 res.send(`
<html>
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>${a.title}</title>

<link rel="canonical" href="${canonical}" />
<meta name="robots" content="index, follow"/>
<meta name="description" content="${desc}"/>

<meta property="og:title" content="${a.title}"/>
<meta property="og:description" content="${desc}"/>
<meta property="og:type" content="article"/>
<meta property="og:url" content="${canonical}"/>
<meta property="og:image" content="https://thehardwareguru.cz/og.jpg"/>

<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${a.title}">
<meta name="twitter:description" content="${desc}">
<meta name="twitter:image" content="https://thehardwareguru.cz/og.jpg">

<script type="application/ld+json">
{
 "@context":"https://schema.org",
 "@type":"Article",
 "headline":"${a.title}",
 "datePublished":"${date}",
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

app.listen(PORT,()=>console.log("FINAL SEO ARTICLE ENGINE RUNNING",PORT));
