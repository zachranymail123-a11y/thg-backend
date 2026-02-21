
import express from "express";
import fetch from "node-fetch";
import pkg from "pg";
import cors from "cors";

const { Pool } = pkg;

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 8080;
const OPENAI_API = process.env.OPENAI_API;
const DATABASE_URL = process.env.DATABASE_URL;

const pool = new Pool({
 connectionString: DATABASE_URL,
 ssl: { rejectUnauthorized: false }
});

function slugify(t){
 return t.toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/(^-|-$)/g,"");
}

async function aiArticle(title,lang){
 const prompt = lang==="cz"
 ? `Napiš profesionální strukturovaný SEO článek o hře ${title}. Používej nadpisy H2, seznamy a sekce.`
 : `Write structured gaming SEO article about ${title}. Use headings and sections.`;

 const r = await fetch("https://api.openai.com/v1/responses",{
  method:"POST",
  headers:{
   "Authorization":"Bearer "+OPENAI_API,
   "Content-Type":"application/json"
  },
  body:JSON.stringify({
   model:"gpt-4.1-mini",
   input:prompt
  })
 });

 const data = await r.json();
 return data.output?.[0]?.content?.[0]?.text || title;
}

// ---------- ARTICLE PAGE DESIGN ----------
function renderPage(title, content){

return `
<!DOCTYPE html>
<html lang="cs">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>${title} | TheHardwareGuru</title>

<link href="https://fonts.googleapis.com/css2?family=Orbitron:wght@500;700&family=Inter:wght@300;400;600&display=swap" rel="stylesheet">

<style>
body{margin:0;background:#05070f;color:#fff;font-family:Inter;line-height:1.7}

.hero{
background:linear-gradient(135deg,#00ffe1,#0066ff);
padding:40px 20px;
text-align:center;
box-shadow:0 0 80px rgba(0,255,225,.3);
}
.hero h1{margin:0;font-family:Orbitron;font-size:2.2rem;color:#000}

.cta{
margin-top:20px;
display:flex;
gap:12px;
flex-wrap:wrap;
justify-content:center;
}
.cta a{
padding:14px 22px;
border-radius:12px;
font-weight:700;
text-decoration:none;
}
.kick{background:#000;color:#00ffe1;border:2px solid #00ffe1}
.yt{background:#ff0000;color:#fff}
.dc{background:#5865F2;color:#fff}

.wrap{max-width:900px;margin:60px auto;padding:20px}

h1{font-family:Orbitron}
h2{color:#00ffe1;margin-top:40px}
p{opacity:.95;font-size:1.05rem}

.bottom{
margin-top:60px;
padding:30px;
border:1px solid #00ffe1;
border-radius:18px;
text-align:center;
background:#020617;
}

.bottom a{
display:inline-block;
margin:10px;
padding:16px 28px;
border-radius:14px;
text-decoration:none;
font-weight:700;
background:linear-gradient(45deg,#00ffe1,#00aaff);
color:#000;
}

</style>
</head>

<body>

<div class="hero">
<h1>${title}</h1>
<div class="cta">
<a class="kick" href="https://kick.com/thehardwareguru" target="_blank">🔴 SLEDOVAT LIVE</a>
<a class="yt" href="https://www.youtube.com/@TheHardwareGuru_Czech" target="_blank">YouTube</a>
<a class="dc" href="https://discord.com/invite/n7xThr8" target="_blank">Discord</a>
</div>
</div>

<div class="wrap">
${content.replace(/\n/g,"<br>")}

<div class="bottom">
<h2>Sleduj gameplay živě</h2>
<a href="https://kick.com/thehardwareguru" target="_blank">▶ OTEVŘÍT STREAM</a>
</div>

</div>

</body>
</html>
`;
}

// ---------- TOP ARTICLE ----------
app.get("/top/:slug", async(req,res)=>{
 const slug = req.params.slug;

 const r = await pool.query("SELECT * FROM articles WHERE slug=$1",[slug]);
 if(r.rows.length===0){ res.send("nenalezeno"); return;}

 const a = r.rows[0];
 res.send(renderPage(a.title,a.content));
});

// ---------- GAME ----------
app.get("/hra/:slug", async(req,res)=>{
 const slug=req.params.slug;

 const r=await pool.query("SELECT * FROM games WHERE slug=$1",[slug]);
 if(r.rows.length===0){res.send("nenalezeno");return;}

 const g=r.rows[0];
 res.send(renderPage(g.title,g.article));
});

app.listen(PORT,()=>console.log("ARTICLE DESIGN UPGRADE READY"));
