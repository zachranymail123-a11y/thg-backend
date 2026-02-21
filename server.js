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

// 🔥 CLEAN GAME TITLE FOR AUTHORITY SEO
function cleanGameTitle(title){
  return title
    .replace(/LIVE/gi,"")
    .replace(/CZ/gi,"")
    .replace(/Gameplay/gi,"")
    .replace(/\|.*$/,"")
    .replace(/[🔥🎮⭐✨]/g,"")
    .replace(/\s+/g," ")
    .trim();
}

function slugify(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

async function generateContent(title) {
  const prompt = `
Napiš dlouhý SEO článek o hře ${title}.
Piš jako profesionální gaming magazín.
Bez zmínky o streamu nebo gameplay.
800–1200 slov.
Použij nadpisy H2.
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

// JSON API
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
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${game.title} | TheHardwareGuru</title>
<meta name="description" content="${game.description.replace(/"/g,"")}">
<link rel="canonical" href="https://thehardwareguru.cz/hra/${game.slug}">

<script type="application/ld+json">
{
 "@context":"https://schema.org",
 "@type":"VideoGame",
 "name":"${game.title}",
 "description":"${game.description.replace(/"/g,"")}",
 "publisher":{"@type":"Organization","name":"TheHardwareGuru"}
}
</script>

<style>
body{background:#05070f;color:#fff;font-family:Arial;max-width:900px;margin:60px auto;padding:20px;line-height:1.7}
h1{color:#00ffe1}
a{color:#00ffe1}
</style>
</head>
<body>

<h1>${game.title}</h1>
<p><a href="https://thehardwareguru.cz">← zpět na stream</a></p>
<div>${game.article.replace(/\n/g,"<br>")}</div>

</body>
</html>
`;

  res.send(html);
});

// SITEMAP AUTO
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
  app.listen(PORT, ()=>console.log("AUTHORITY SEO ENGINE RUNNING",PORT));
});