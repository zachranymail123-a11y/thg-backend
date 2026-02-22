
const express=require('express');
const cors=require('cors');
const {Pool}=require('pg');

const app=express();
app.use(cors());

const PORT=process.env.PORT||3000;

const pool=new Pool({
 connectionString:process.env.DATABASE_URL,
 ssl:{rejectUnauthorized:false}
});

async function init(){
 await pool.query(`CREATE TABLE IF NOT EXISTS articles(
 id SERIAL PRIMARY KEY,
 title TEXT,
 slug TEXT UNIQUE,
 content TEXT,
 created_at TIMESTAMP DEFAULT NOW()
 );`);
}
init();

app.get('/sitemap.xml',async(req,res)=>{
 const r=await pool.query("SELECT slug FROM articles ORDER BY created_at DESC");
 const urls=r.rows.map(x=>`<url><loc>https://thehardwareguru.cz/top/${x.slug}</loc></url>`).join("");
 res.type('application/xml').send(`<?xml version="1.0"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls}</urlset>`);
});

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

app.listen(PORT,()=>console.log("BACKEND WITH CANONICAL RUNNING",PORT));
