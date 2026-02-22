
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
const PORT=process.env.PORT||3000;

const pool=new Pool({
 connectionString:process.env.DATABASE_URL,
 ssl:{rejectUnauthorized:false}
});

// DB INIT
async function init(){
 await pool.query(`CREATE TABLE IF NOT EXISTS articles(
 id SERIAL PRIMARY KEY,
 title TEXT,
 slug TEXT UNIQUE,
 game TEXT UNIQUE,
 article TEXT,
 created_at TIMESTAMP DEFAULT NOW()
 );`);
}
init();

// ROBOTS
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

// SAFE TREND LIST (NO FAIL)
async function getTrends(){
 try{
  const r=await axios.get("https://api.steampowered.com/ISteamChartsService/GetMostPlayedGames/v1/");
  if(r.data?.response?.ranks){
   return r.data.response.ranks.slice(0,20).map(g=>g.appid.toString());
  }
 }catch{}
 return ["GTA 6","Warzone","Fortnite","CS2","Elden Ring","Diablo 4","Starfield","Minecraft","Cyberpunk 2077","Witcher 4"];
}

// CRON SAFE
app.get('/cron/daily',async(req,res)=>{
 try{
  const trends=await getTrends();
  let created=0;

  for(let g of trends){
   const game=g.toString();

   const exists=await pool.query("SELECT id FROM articles WHERE game=$1",[game]);
   if(exists.rows.length) continue;

   const title=`${game} – novinky gameplay a stream`;
   const slug=slugify(title,{lower:true,strict:true});

   const article=`<h2>${game} gameplay a novinky</h2>
   <p>Nejnovější informace o ${game}.</p>
   <p>Sleduj live stream TheHardwareGuru na Kicku.</p>`;

   await pool.query(
   "INSERT INTO articles(title,slug,game,article) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING",
   [title,slug,game,article]);

   created++;
   if(created>=6) break;
  }

  res.send("OK");
 }catch(e){
  console.log(e);
  res.send("OK"); // nikdy fail
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
 </body>
 </html>`);
});

// shorts
app.get('/api/shorts',async(req,res)=>{
 try{
  const url=`https://www.googleapis.com/youtube/v3/search?key=${process.env.YOUTUBE_API_KEY}&channelId=${process.env.YOUTUBE_CHANNEL_ID}&part=snippet,id&order=date&maxResults=6`;
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

app.listen(PORT,()=>console.log("RUNNING",PORT));
