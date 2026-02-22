
require('dotenv').config();
const express=require('express');
const axios=require('axios');
const cheerio=require('cheerio');
const cors=require('cors');
const {Pool}=require('pg');
const slugify=require('slugify');

const app=express();
app.use(cors());
app.use(express.json());

const pool=new Pool({
 connectionString:process.env.DATABASE_URL,
 ssl:{rejectUnauthorized:false}
});

const PORT=process.env.PORT||3000;

let cache={};
function setCache(k,d,t=600){cache[k]={d,exp:Date.now()+t*1000}}
function getCache(k){if(!cache[k])return null;if(Date.now()>cache[k].exp){delete cache[k];return null;}return cache[k].d;}

// DB init + anti duplicate game index
async function init(){
 await pool.query(`CREATE TABLE IF NOT EXISTS articles(
  id SERIAL PRIMARY KEY,
  title TEXT,
  slug TEXT UNIQUE,
  game TEXT,
  article TEXT,
  created_at TIMESTAMP DEFAULT NOW()
 );`);

 await pool.query(`CREATE TABLE IF NOT EXISTS games_done(
  game TEXT PRIMARY KEY,
  last_used TIMESTAMP DEFAULT NOW()
 );`);
}
init();

// ROBOTS + sitemap
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
 const r=await pool.query("SELECT slug FROM articles ORDER BY created_at DESC");
 const urls=r.rows.map(x=>`<url><loc>https://thehardwareguru.cz/top/${x.slug}</loc></url>`).join("");
 res.type('application/xml').send(`<?xml version="1.0"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls}</urlset>`);
});

// ===== TREND SOURCES =====
async function getTrendingGames(){
 try{
  const gnews=await axios.get("https://gnews.io/api/v4/search?q=game&lang=en&max=10&token=demo").catch(()=>null);
  let list=[];

  if(gnews?.data?.articles){
   gnews.data.articles.forEach(a=>{
    const words=a.title.split(" ");
    words.forEach(w=>{
     if(w.length>3 && w[0]===w[0].toUpperCase()){
      list.push(w.replace(/[^a-zA-Z0-9]/g,''));
     }
    });
   });
  }

  // fallback curated AAA pool
  const fallback=["GTA 6","Cyberpunk 2077","Warzone","Fortnite","Elden Ring","Starfield","CS2","Minecraft","Diablo 4","Witcher 4"];
  return [...new Set([...list,...fallback])].slice(0,20);

 }catch{
  return ["GTA 6","Warzone","Fortnite","Elden Ring","Starfield","CS2","Minecraft","Diablo 4"];
 }
}

// ===== CRON DAILY SMART =====
app.get('/cron/daily',async(req,res)=>{
 try{
  const trends=await getTrendingGames();

  for(let g of trends){

   // anti duplicate game
   const exists=await pool.query("SELECT game FROM games_done WHERE game=$1",[g]);
   if(exists.rows.length) continue;

   const title=`${g} gameplay novinky, tipy a stream`;
   const slug=slugify(title,{lower:true,strict:true});

   const article=`
   <h2>${g} – novinky a gameplay</h2>
   <p>Nejnovější informace, gameplay a tipy pro ${g}.</p>
   <p>Sleduj live stream TheHardwareGuru pro real gameplay a chill komunitu.</p>
   <p><b>Kick stream každý den.</b></p>
   `;

   await pool.query("INSERT INTO articles(title,slug,game,article) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING",
   [title,slug,g,article]);

   await pool.query("INSERT INTO games_done(game) VALUES($1) ON CONFLICT DO NOTHING",[g]);
  }

  res.send("OK");
 }catch(e){
  res.send("FAIL");
 }
});

// article page
app.get('/top/:slug',async(req,res)=>{
 const r=await pool.query("SELECT * FROM articles WHERE slug=$1",[req.params.slug]);
 if(!r.rows.length) return res.send("404");
 const a=r.rows[0];

 res.send(`
 <html>
 <head>
 <meta name="viewport" content="width=device-width, initial-scale=1"/>
 <title>${a.title}</title>
 <style>
 body{background:#0b0f1a;color:white;font-family:Arial;max-width:900px;margin:auto;padding:40px}
 .btn{background:#00ffee;color:#000;padding:14px 20px;border-radius:10px;text-decoration:none;margin:5px;display:inline-block;font-weight:bold}
 </style>
 </head>
 <body>
 <h1>${a.title}</h1>
 ${a.article}
 <br>
 <a class="btn" href="https://kick.com/thehardwareguru">SLEDOVAT LIVE</a>
 <a class="btn" href="https://www.youtube.com/@TheHardwareGuru_Czech">YOUTUBE</a>
 </body>
 </html>`);
});

// ===== API =====
app.get('/api/shorts',async(req,res)=>{
 try{
  const c=getCache("shorts"); if(c) return res.json(c);
  const url=`https://www.googleapis.com/youtube/v3/search?key=${process.env.YOUTUBE_API_KEY}&channelId=${process.env.YOUTUBE_CHANNEL_ID}&part=snippet,id&order=date&maxResults=8`;
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

app.get('/api/kick-last',async(req,res)=>{
 try{
  const r=await axios.get("https://kick.com/thehardwareguru/videos");
  const $=cheerio.load(r.data);
  const thumb=$("img").first().attr("src")||"";
  res.json({title:"Poslední stream",thumbnail:thumb,url:"https://kick.com/thehardwareguru"});
 }catch{res.json({title:"Kick",thumbnail:"",url:"https://kick.com/thehardwareguru"})}
});

app.listen(PORT,()=>console.log("RUNNING",PORT));
