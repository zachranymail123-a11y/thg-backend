
require('dotenv').config();
const express=require('express');
const axios=require('axios');
const cheerio=require('cheerio');
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

let cache={};

function setCache(k,d,t=600){cache[k]={d,exp:Date.now()+t*1000}}
function getCache(k){if(!cache[k])return null;if(Date.now()>cache[k].exp){delete cache[k];return null;}return cache[k].d;}

async function init(){
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
init();

// robots
app.get('/robots.txt',(req,res)=>{
 res.type('text/plain').send(`User-agent: *
Allow: /
Sitemap: https://thehardwareguru.cz/sitemap-index.xml`);
});

// sitemap index
app.get('/sitemap-index.xml',(req,res)=>{
 res.header("Content-Type","application/xml");
 res.send(`<?xml version="1.0" encoding="UTF-8"?>
 <sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
   <sitemap>
     <loc>https://thehardwareguru.cz/sitemap.xml</loc>
   </sitemap>
 </sitemapindex>`);
});

// sitemap articles
app.get('/sitemap.xml',async(req,res)=>{
 const r=await pool.query("SELECT slug FROM articles");
 const urls=r.rows.map(x=>`<url><loc>https://thehardwareguru.cz/top/${x.slug}</loc></url>`).join("");
 res.header("Content-Type","application/xml");
 res.send(`<?xml version="1.0"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls}</urlset>`);
});

// shorts
app.get('/api/shorts',async(req,res)=>{
 try{
  const c=getCache("shorts"); if(c) return res.json(c);
  const url=`https://www.googleapis.com/youtube/v3/search?key=${process.env.YOUTUBE_API_KEY}&channelId=${process.env.YOUTUBE_CHANNEL_ID}&part=snippet,id&order=date&maxResults=12`;
  const r=await axios.get(url);
  const vids=r.data.items.filter(v=>v.id.videoId).slice(0,3).map(v=>({
   title:v.snippet.title,
   thumbnail:v.snippet.thumbnails.medium.url,
   url:"https://youtube.com/watch?v="+v.id.videoId
  }));
  setCache("shorts",vids,600);
  res.json(vids);
 }catch{res.json([])}
});

// kick last
app.get('/api/kick-last',async(req,res)=>{
 try{
  const c=getCache("kick"); if(c) return res.json(c);
  const r=await axios.get("https://kick.com/thehardwareguru/videos");
  const $=cheerio.load(r.data);
  const thumb=$("img").first().attr("src")||"";
  const data={title:"Last stream",thumbnail:thumb,url:"https://kick.com/thehardwareguru"};
  setCache("kick",data,600);
  res.json(data);
 }catch{res.json({title:"Kick",thumbnail:"",url:"https://kick.com/thehardwareguru"})}
});

// live
app.get('/api/live',async(req,res)=>{
 const r=await pool.query("SELECT * FROM live_game ORDER BY updated DESC LIMIT 1");
 res.json(r.rows[0]||{});
});

app.get('/setlive',async(req,res)=>{
 const {title,desc,youtube}=req.query;
 await pool.query("INSERT INTO live_game(title,description,youtube,updated) VALUES($1,$2,$3,NOW())",
 [title||"",desc||"",youtube||""]);
 res.send("ok");
});

// article page
app.get('/top/:slug',async(req,res)=>{
 const r=await pool.query("SELECT * FROM articles WHERE slug=$1",[req.params.slug]);
 if(!r.rows.length) return res.send("404");
 const a=r.rows[0];
 res.send(`<html><head>
 <meta name="viewport" content="width=device-width, initial-scale=1"/>
 <title>${a.title}</title>
 <style>
 body{background:#07070a;color:white;font-family:Arial;max-width:900px;margin:auto;padding:40px}
 .btn{background:#00ffee;color:#000;padding:14px 20px;border-radius:8px;text-decoration:none;margin:6px;display:inline-block}
 </style></head>
 <body>
 <h1>${a.title}</h1>
 ${a.article}
 <br><br>
 <a class="btn" href="https://kick.com/thehardwareguru">WATCH LIVE</a>
 <a class="btn" href="https://youtube.com">YOUTUBE</a>
 <br><br>
 <a href="/">← zpět</a>
 </body></html>`);
});

// cron generator
app.get('/cron/daily',async(req,res)=>{
 const games=["GTA 6","CS2","Fortnite","Elden Ring","Diablo 4","Cyberpunk","Minecraft","Starfield"];
 for(let i=0;i<6;i++){
  const g=games[Math.floor(Math.random()*games.length)];
  const title=`${g} gameplay guide ${Date.now()} ${i}`;
  const slug=slugify(title,{lower:true,strict:true});
  const article=`<p>${g} gameplay guide, tips a stream.</p><p>Sleduj live thehardwareguru.</p>`;
  await pool.query("INSERT INTO articles(title,slug,article) VALUES($1,$2,$3) ON CONFLICT DO NOTHING",
  [title,slug,article]);
 }
 res.send("ok");
});

app.listen(PORT,()=>console.log("RUN",PORT));
