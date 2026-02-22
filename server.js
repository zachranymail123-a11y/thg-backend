
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
 await pool.query(`CREATE SCHEMA IF NOT EXISTS thg;`);
 await pool.query(`
 CREATE TABLE IF NOT EXISTS thg.games(
 id SERIAL PRIMARY KEY,
 name TEXT UNIQUE,
 created_at TIMESTAMP DEFAULT NOW()
 );`);
 await pool.query(`
 CREATE TABLE IF NOT EXISTS thg.articles(
 id SERIAL PRIMARY KEY,
 title TEXT,
 slug TEXT UNIQUE,
 game TEXT UNIQUE,
 content TEXT,
 created_at TIMESTAMP DEFAULT NOW()
 );`);
}
init();

// ===== SEO =====
app.get('/robots.txt',(req,res)=>{
 res.type('text/plain').send(`User-agent: *
Allow: /
Sitemap: https://thehardwareguru.cz/sitemap.xml`);
});

app.get('/sitemap.xml',async(req,res)=>{
 const r=await pool.query("SELECT slug FROM thg.articles ORDER BY created_at DESC");
 const urls=r.rows.map(x=>`<url><loc>https://thehardwareguru.cz/top/${x.slug}</loc></url>`).join("");
 res.type('application/xml').send(`<?xml version="1.0"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls}</urlset>`);
});

// ===== REAL TREND SOURCES =====

// TwitchTracker scrape
async function getTwitchTrending(){
 try{
  const r=await axios.get("https://twitchtracker.com/games");
  const $=cheerio.load(r.data);
  let games=[];
  $("a.game-link").each((i,el)=>{
   const name=$(el).text().trim();
   if(name.length>2) games.push(name);
  });
  return games.slice(0,20);
 }catch{return []}
}

// YouTube Gaming trending
async function getYouTubeTrending(){
 try{
  const r=await axios.get(`https://www.googleapis.com/youtube/v3/videos?part=snippet&chart=mostPopular&videoCategoryId=20&maxResults=25&regionCode=CZ&key=${process.env.YOUTUBE_API_KEY}`);
  return r.data.items.map(v=>v.snippet.title);
 }catch{return []}
}

// Google Trends via RSS
async function getGoogleTrends(){
 try{
  const r=await axios.get("https://trends.google.com/trends/trendingsearches/daily/rss?geo=CZ");
  const $=cheerio.load(r.data,{xmlMode:true});
  let games=[];
  $("title").each((i,el)=>{
   const t=$(el).text();
   if(t.length>3) games.push(t);
  });
  return games.slice(0,20);
 }catch{return []}
}

// Simple cleaner: remove non-game phrases
function cleanNames(list){
 return [...new Set(list)]
 .map(n=>n.replace(/[^a-zA-Z0-9 :\-]/g,''))
 .filter(n=>n.length>3 && !n.toLowerCase().includes("video") && !n.toLowerCase().includes("update"))
 .slice(0,40);
}

// ===== CRON ENGINE =====
app.get('/cron/daily',async(req,res)=>{
 try{
  const [twitch,yt,google]=await Promise.all([
   getTwitchTrending(),
   getYouTubeTrending(),
   getGoogleTrends()
  ]);

  let all=cleanNames([...twitch,...yt,...google]);

  let created=0;

  for(let g of all){

   const exists=await pool.query("SELECT id FROM thg.articles WHERE game=$1",[g]);
   if(exists.rows.length) continue;

   const title=`${g} – aktuální novinky, gameplay a stream`;
   const slug=slugify(title,{lower:true,strict:true});

   const content=`
   <h2>${g}</h2>
   <p>Kompletní přehled novinek a gameplay ze světa ${g}.</p>
   <p>Sleduj český stream TheHardwareGuru na Kicku.</p>
   <p>YouTube: https://www.youtube.com/@TheHardwareGuru_Czech</p>
   `;

   await pool.query(
   "INSERT INTO thg.articles(title,slug,game,content) VALUES($1,$2,$3,$4)",
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
 const r=await pool.query("SELECT * FROM thg.articles WHERE slug=$1",[req.params.slug]);
 if(!r.rows.length) return res.status(404).send("Not found");
 const a=r.rows[0];

 res.send(`<html>
 <head>
 <meta name="viewport" content="width=device-width, initial-scale=1"/>
 <title>${a.title}</title>
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
 </body></html>`);
});

// ===== API =====
app.get('/api/shorts',async(req,res)=>{
 try{
  const key=process.env.YOUTUBE_API_KEY;
  const ch=process.env.YOUTUBE_CHANNEL_ID;
  const r=await axios.get(`https://www.googleapis.com/youtube/v3/search?key=${key}&channelId=${ch}&part=snippet,id&order=date&maxResults=6`);
  const vids=r.data.items.filter(v=>v.id.videoId).slice(0,3).map(v=>({
   title:v.snippet.title,
   thumbnail:v.snippet.thumbnails.high.url,
   url:"https://youtube.com/watch?v="+v.id.videoId
  }));
  res.json(vids);
 }catch{res.json([])}
});

app.listen(PORT,()=>console.log("ULTRA REAL TREND ENGINE RUNNING",PORT));
