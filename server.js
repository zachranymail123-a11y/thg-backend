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

function slugify(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

async function generateContent(title) {
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${OPENAI_API}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: "gpt-4.1-mini",
      input: `Napiš SEO popis a článek o hře ${title} pro český gaming web.`
    })
  });

  const data = await response.json();
  const text = data.output?.[0]?.content?.[0]?.text || title;

  return {
    description: text.substring(0, 400),
    article: text
  };
}

app.get("/api/game/:title", async (req, res) => {
  const title = req.params.title;
  const slug = slugify(title);

  let game = await db.get("SELECT * FROM games WHERE slug = ?", slug);

  if (!game) {
    const content = await generateContent(title);

    await db.run(
      "INSERT INTO games (slug, title, description, article) VALUES (?, ?, ?, ?)",
      slug,
      title,
      content.description,
      content.article
    );

    game = await db.get("SELECT * FROM games WHERE slug = ?", slug);
  }

  res.json(game);
});

initDB().then(() => {
  app.listen(PORT, () => console.log("Server running on port", PORT));
});