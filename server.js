
require('dotenv').config();
const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const cors = require('cors');
const { Pool } = require('pg');
const slugify = require('slugify');

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

let cache = {};
function setCache(k,d,t=600){ cache[k]={d,exp:Date.now()+t*1000}; }
function getCache(k){ if(!cache[k]) return null; if(Date.now()>cache[k].exp){ delete cache[k]; return null;} return cache[k].d; }

async function initDB(){
 await pool.query(`CREATE TABLE IF NOT EXISTS articles(
   id SERIAL PRIMARY KEY,
   title TEXT,
   slug TEXT UNIQUE,
   article TEXT,
   created_at TIMESTAMP DEFAULT NOW()
 );`);

 await pool.query(`CREATE TABLE IF NOT EXISTS live_game(
   id SERIAL PRIMARY KEY,
   title TEXT,
   description TEXT,
   youtube TEXT,
   updated TIMESTAMP DEFAULT NOW()
 );`);
}
initDB();

// ================= SEO =================

app.get('/robots.txt',(req,res)=>{
 res.type('text/plain').send(`User-agent: *
Allow: /
Sitemap: https://thehardwareguru.cz/sitemap-index.xml`);
});

app.get('/sitemap-index.xml',(req,res)=>{
 res.type('application/xml').send(`<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
 <sitemap><loc>https://thehardwareguru.cz/sitemap.xml</loc></sitemap>
</sitemapindex>`);
});

app.get('/sitemap.xml', async (req,res)=>{
 const r = await pool.query("SELECT slug FROM articles");
 const urls = r.rows.map(x=>`<url><loc>https://thehardwareguru.cz/top/${x.slug}</loc></url>`).join("");
 res.type('application/xml').send(`<?xml version="1.0"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls}</urlset>`);
});

// ================= CONTENT =================

app.get('/cron/daily', async (req,res)=>{
 const games = ["GTA 6","CS2","Fortnite","Elden Ring","Cyberpunk 2077","Diablo 4","Starfield","Helldivers 2","Witcher 4"];
 for(let i=0;i<6;i++){
   const g = games[Math.floor(Math.random()*games.length)];
   const title = `${g} gameplay guide ${Date.now()} ${i}`;
   const slug = slugify(title,{lower:true,strict:true});
   const article = `<h2>${g} Gameplay Guide</h2>
   <p>${g} gameplay tips, strategies, stream highlights.</p>
   <p>Watch live gameplay and chill vibe on Kick.</p>`;
   await pool.query(
     "INSERT INTO articles(title,slug,article) VALUES($1,$2,$3) ON CONFLICT DO NOTHING",
     [title,slug,article]
   );
 }
 res.send("OK");
});

app.get('/top/:slug', async (req,res)=>{
 const r = await pool.query("SELECT * FROM articles WHERE slug=$1",[req.params.slug]);
 if(!r.rows.length) return res.status(404).send("Not found");
 const a = r.rows[0];
 res.send(`
 <html>
 <head>
 <meta name="viewport" content="width=device-width, initial-scale=1"/>
 <title>${a.title}</title>
 <meta name="description" content="${a.title} gameplay guide and stream highlights"/>
 <style>
 body{background:#0b0f1a;color:#fff;font-family:Arial;padding:40px;max-width:900px;margin:auto}
 .btn{display:inline-block;margin:10px;padding:14px 24px;background:#00ffee;color:#000;border-radius:8px;text-decoration:none;font-weight:bold}
 </style>
 </head>
 <body>
 <h1>${a.title}</h1>
 ${a.article}
 <br/>
 <a class="btn" href="https://kick.com/thehardwareguru">WATCH LIVE</a>
 <a class="btn" href="https://youtube.com">YOUTUBE</a>
 </body>
 </html>`);
});

// ================= API =================

app.get('/api/shorts', async (req,res)=>{
 try{
   const c = getCache("shorts");
   if(c) return res.json(c);
   const url=`https://www.googleapis.com/youtube/v3/search?key=${process.env.YOUTUBE_API_KEY}&channelId=${process.env.YOUTUBE_CHANNEL_ID}&part=snippet,id&order=date&maxResults=10`;
   const r=await axios.get(url);
   const vids=r.data.items.filter(v=>v.id.videoId).slice(0,3).map(v=>({
     title:v.snippet.title,
     thumbnail:v.snippet.thumbnails.high.url,
     url:"https://youtube.com/watch?v="+v.id.videoId
   }));
   setCache("shorts",vids,600);
   res.json(vids);
 }catch{res.json([])}
});

app.get('/api/kick-last', async (req,res)=>{
 try{
   const c=getCache("kick");
   if(c) return res.json(c);
   const r=await axios.get("https://kick.com/thehardwareguru/videos");
   const $=cheerio.load(r.data);
   const thumb=$("img").first().attr("src")||"";
   const data={title:"Last Kick Stream",thumbnail:thumb,url:"https://kick.com/thehardwareguru"};
   setCache("kick",data,600);
   res.json(data);
 }catch{res.json({title:"Kick",thumbnail:"",url:"https://kick.com/thehardwareguru"})}
});

app.listen(PORT,()=>console.log("RUNNING",PORT));
