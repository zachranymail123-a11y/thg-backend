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

async function initDB() {
  db = await open({
    filename: "./database.sqlite",
    driver: sqlite3.Database
  });

  await db.exec(`
    CREATE TABLE IF NOT EXISTS games (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      slug TEXT UNIQUE,
      title TEXT,
      description TEXT,
      article TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
}

// 🧠 UNIVERSAL CLEAN TITLE
function cleanGameTitle(title){

  let t = title;

  // remove html entities
  t = t.replace(/&amp;/g,"&");

  // remove everything after |
  t = t.replace(/\|.*$/,"");

  // remove LIVE / CZ / Gameplay etc
  t = t
    .replace(/LIVE/gi,"")
    .replace(/Gameplay/gi,"")
    .replace(/Walkthrough/gi,"")
    .replace(/Let'?s Play/gi,"")
    .replace(/CZ/gi,"")
    .replace(/SK/gi,"")
    .replace(/EN/gi,"")
    .replace(/První/gi,"")
    .replace(/First/gi,"");

  // remove emojis
  t = t.replace(/[^\w\s:]/gi,"");

  // trim spaces
  t = t.replace(/\s+/g," ").trim();

  return t;
}

function slugify(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

async function generateContent(title) {

  const prompt = `
Napiš profesionální SEO článek o hře ${title}.
Jako gaming magazín.
Bez zmínky o streamu.
1000 slov.
`;

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${OPENAI_API}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: "gpt-4.1-mini",
      input: prompt
    })
  });

  const data = await response.json();
  const text = data.output?.[0]?.content?.[0]?.text || title;

  return {
    description: text.substring(0, 350),
    article: text
  };
}

app.get("/api/game/:title", async (req, res) => {

  const raw = decodeURIComponent(req.params.title);
  const clean = cleanGameTitle(raw);
  const slug = slugify(clean);

  let game = await db.get("SELECT * FROM games WHERE slug = ?", slug);

  if (!game) {
    const content = await generateContent(clean);

    await db.run(
      "INSERT INTO games (slug, title, description, article) VALUES (?, ?, ?, ?)",
      slug,
      clean,
      content.description,
      content.article
    );

    game = await db.get("SELECT * FROM games WHERE slug = ?", slug);
  }

  res.json(game);
});

// SEO PAGE
app.get("/hra/:slug", async (req, res) => {
  const slug = req.params.slug;
  const game = await db.get("SELECT * FROM games WHERE slug = ?", slug);

  if (!game) {
    res.send("Hra nenalezena");
    return;
  }

  const html = `
<!DOCTYPE html>
<html lang="cs">
<head>
<meta charset="UTF-8">
<title>${game.title} | TheHardwareGuru</title>
<meta name="description" content="${game.description.replace(/"/g,"")}">
<link rel="canonical" href="https://thehardwareguru.cz/hra/${game.slug}">
</head>
<body style="background:#05070f;color:white;font-family:Arial;max-width:900px;margin:60px auto;padding:20px;line-height:1.7">

<h1>${game.title}</h1>
<p><a href="https://thehardwareguru.cz">← zpět na stream</a></p>
<div>${game.article.replace(/\n/g,"<br>")}</div>

</body>
</html>
`;
  res.send(html);
});

// sitemap
app.get("/sitemap.xml", async (req,res)=>{
  const games = await db.all("SELECT slug FROM games");

  let xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">`;

  games.forEach(g=>{
    xml+=`
<url>
<loc>https://thehardwareguru.cz/hra/${g.slug}</loc>
</url>`;
  });

  xml += "</urlset>";

  res.header("Content-Type","application/xml");
  res.send(xml);
});

initDB().then(()=>{
  app.listen(PORT, ()=>console.log("UNIVERSAL SEO ENGINE READY",PORT));
});