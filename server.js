
import express from "express";
import fetch from "node-fetch";
import sqlite3 from "sqlite3";
import { open } from "sqlite";
import cors from "cors";

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;
const OPENAI_API = process.env.OPENAI_API;

let db;

async function initDB(){
 db = await open({
  filename:"./database.sqlite",
  driver: sqlite3.Database
 });

 await db.exec(`
 CREATE TABLE IF NOT EXISTS articles(
   id INTEGER PRIMARY KEY AUTOINCREMENT,
   slug TEXT UNIQUE,
   title TEXT,
   lang TEXT,
   content TEXT,
   created_at DATETIME DEFAULT CURRENT_TIMESTAMP
 )
 `);
}

function slugify(t){
 return t.toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/(^-|-$)/g,"");
}

async function aiWrite(title, lang){

 let promptCZ = `Napiš dlouhý profesionální SEO článek česky: ${title}. Minimálně 1200 slov.`;
 let promptEN = `Write long professional SEO gaming article: ${title}. 1200+ words.`;

 const res = await fetch("https://api.openai.com/v1/responses",{
  method:"POST",
  headers:{
   "Authorization":"Bearer "+OPENAI_API,
   "Content-Type":"application/json"
  },
  body:JSON.stringify({
   model:"gpt-4.1",
   input: lang==="cz"?promptCZ:promptEN
  })
 });

 const data = await res.json();
 return data.output?.[0]?.content?.[0]?.text || title;
}

async function createArticle(title,lang){

 const slug = slugify(title+"-"+lang);

 let exists = await db.get("SELECT * FROM articles WHERE slug=?",slug);
 if(exists) return;

 const content = await aiWrite(title,lang);

 await db.run(
  "INSERT INTO articles (slug,title,lang,content) VALUES (?,?,?,?)",
  slug,title,lang,content
 );
}

// 🔥 DAILY AUTO GENERATOR
app.get("/cron/daily", async(req,res)=>{

 const date = new Date();
 const year = date.getFullYear();

 const topics = [
  `Nejlepší hry ${year}`,
  `Nové hry ${year}`,
  `Nejočekávanější hry ${year+1}`,
  `Best games ${year}`,
  `Upcoming games ${year+1}`,
  `New games ${year}`
 ];

 for(const t of topics){
   if(t.includes("Best") || t.includes("Upcoming") || t.includes("New")){
     await createArticle(t,"en");
   }else{
     await createArticle(t,"cz");
   }
 }

 res.send("OK DAILY GENERATED");
});

// HTML
app.get("/top/:slug", async(req,res)=>{
 const a = await db.get("SELECT * FROM articles WHERE slug=?",req.params.slug);
 if(!a){ res.send("nenalezeno"); return;}

 res.send(`
 <!DOCTYPE html>
 <html lang="${a.lang}">
 <head>
 <meta charset="UTF-8">
 <title>${a.title}</title>
 <meta name="description" content="${a.title}">
 </head>
 <body style="background:#05070f;color:white;font-family:Arial;max-width:900px;margin:60px auto;line-height:1.7">
 <h1>${a.title}</h1>
 <div>${a.content.replace(/\n/g,"<br>")}</div>
 <p><a href="https://thehardwareguru.cz">← zpět na stream</a></p>
 </body>
 </html>
 `);
});

// sitemap
app.get("/sitemap.xml", async(req,res)=>{
 const rows = await db.all("SELECT slug FROM articles");
 let xml=`<?xml version="1.0" encoding="UTF-8"?>
 <urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">`;

 rows.forEach(r=>{
  xml+=`<url><loc>https://thehardwareguru.cz/top/${r.slug}</loc></url>`;
 });

 xml+="</urlset>";
 res.header("Content-Type","application/xml");
 res.send(xml);
});

initDB().then(()=>{
 app.listen(PORT,()=>console.log("AUTOPILOT DAILY READY"));
});
