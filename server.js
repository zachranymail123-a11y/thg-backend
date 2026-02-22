
const express=require('express');
const axios=require('axios');
const cheerio=require('cheerio');
const cors=require('cors');
const {Pool}=require('pg');
const slugify=require('slugify');
const Parser=require('rss-parser');

const app=express();
app.use(cors());
app.use(express.json());
const parser=new Parser();

const PORT=process.env.PORT||3000;

const pool=new Pool({
 connectionString:process.env.DATABASE_URL,
 ssl:{rejectUnauthorized:false}
});

// ===== DB AUTO INIT =====
async function init(){
 await pool.query(`CREATE SCHEMA IF NOT EXISTS thg;`);
 await pool.query(`
 CREATE TABLE IF NOT EXISTS thg.articles(
 id SERIAL PRIMARY KEY,
 title TEXT,
 slug TEXT UNIQUE,
 game TEXT UNIQUE,
 article TEXT,
 created_at TIMESTAMP DEFAULT NOW()
 );`);
}
init();

// ===== SEO =====
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

app.get('/sitemap.xml',async(req,res)=>{
 const r=await pool.query("SELECT slug FROM thg.articles ORDER BY created_at DESC");
 const urls=r.rows.map(x=>`<url><loc>https://thehardwareguru.cz/top/${x.slug}</loc></url>`).join("");
 res.type('application/xml').send(`<?xml version="1.0"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls}</urlset>`);
});

// ===== TREND SOURCES =====
async function getGoogleNews(){
 try{
  const feed=await parser.parseURL("https://news.google.com/rss/search?q=video+game&hl=en-US&gl=US&ceid=US:en");
  return feed.items.map(i=>i.title);
 }catch{return []}
}

async function getIGN(){
 try{
  const feed=await parser.parseURL("https://feeds.ign.com/ign/games-all");
  return feed.items.map(i=>i.title);
 }catch{return []}
}

async function getReddit(){
 try{
  const r=await axios.get("https://www.reddit.com/r/gaming/hot.json?limit=25",{headers:{'User-agent':'thg'}});
  return r.data.data.children.map(p=>p.data.title);
 }catch{return []}
}

async function getSteamTop(){
 try{
  const r=await axios.get("https://store.steampowered.com/api/featuredcategories");
  return r.data.top_sellers.items.map(i=>i.name);
 }catch{return []}
}

// extract game names from titles
function extractGames(titles){
 let games=[];
 titles.forEach(t=>{
  let clean=t.replace(/[^a-zA-Z0-9 :\-]/g,'');
  let words=clean.split(" ");
  if(words.length<2) return;
  let name=words.slice(0,4).join(" ");
  if(name.length>4) games.push(name.trim());
 });
 return games;
}

// ===== CRON =====
app.get('/cron/daily',async(req,res)=>{
 try{
  let all=[];

  const [gnews,ign,reddit,steam]=await Promise.all([
   getGoogleNews(),getIGN(),getReddit(),getSteamTop()
  ]);

  all=[...gnews,...ign,...reddit,...steam];

  let games=[...new Set(extractGames(all))];

  // fallback if empty
  if(games.length<10){
   games=["GTA 6","Elden Ring","Warzone","Fortnite","CS2","Diablo 4","Starfield","Cyberpunk 2077"];
  }

  let created=0;

  for(let g of games){

   const exists=await pool.query("SELECT game FROM thg.articles WHERE game=$1",[g]);
   if(exists.rows.length) continue;

   const title=`${g} – novinky, gameplay a tipy pro hráče`;
   const slug=slugify(title,{lower:true,strict:true});

   const article=`
   <h2>${g}</h2>
   <p>Nejnovější informace, gameplay a novinky ze světa ${g}.</p>
   <p>Sleduj live stream TheHardwareGuru pro reálný gameplay a komunitu.</p>
   <p>YouTube: https://www.youtube.com/@TheHardwareGuru_Czech</p>
   `;

   await pool.query("INSERT INTO thg.articles(title,slug,game,article) VALUES($1,$2,$3,$4)",
   [title,slug,g,article]);

   created++;
   if(created>=8) break;
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
 if(!r.rows.length) return res.send("404");
 const a=r.rows[0];

 res.send(`<html>
 <head>
 <meta name="viewport" content="width=device-width, initial-scale=1"/>
 <title>${a.title}</title>
 <style>
 body{background:#070a14;color:white;font-family:Arial;max-width:900px;margin:auto;padding:40px}
 .btn{background:#00ffee;color:#000;padding:14px 22px;border-radius:10px;text-decoration:none;margin:6px;display:inline-block;font-weight:bold}
 </style>
 </head>
 <body>
 <h1>${a.title}</h1>
 ${a.article}
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
  const url=`https://www.googleapis.com/youtube/v3/search?key=${key}&channelId=${ch}&part=snippet,id&order=date&maxResults=6`;
  const r=await axios.get(url);
  const vids=r.data.items.filter(v=>v.id.videoId).slice(0,3).map(v=>({
   title:v.snippet.title,
   thumbnail:v.snippet.thumbnails.high.url,
   url:"https://youtube.com/watch?v="+v.id.videoId
  }));
  res.json(vids);
 }catch{res.json([])}
});

app.get('/api/kick-last',async(req,res)=>{
 try{
  const r=await axios.get("https://kick.com/thehardwareguru/videos");
  const $=cheerio.load(r.data);
  const thumb=$("img").first().attr("src")||"";
  res.json({title:"Poslední stream",thumbnail:thumb,url:"https://kick.com/thehardwareguru"});
 }catch{res.json({title:"Kick",thumbnail:"",url:"https://kick.com/thehardwareguru"})}
});

app.listen(PORT,()=>console.log("MULTISOURCE AI RUNNING",PORT));
