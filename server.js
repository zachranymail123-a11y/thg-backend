
import express from "express";
import pkg from "pg";
import cors from "cors";

const { Pool } = pkg;

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 8080;
const DATABASE_URL = process.env.DATABASE_URL;

// SAFE POOL (necrashne při startu)
const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// ROOT
app.get("/", (req, res) => {
  res.send("THG STABLE BACKEND RUNNING");
});

// SAFE QUERY WRAPPER
async function safeQuery(q, params = []) {
  try {
    return await pool.query(q, params);
  } catch (e) {
    console.log("DB ERROR:", e.message);
    return { rows: [] };
  }
}

// LIVE
app.get("/api/live", async (req, res) => {
  try {

    const r = await pool.query(
      "SELECT title, article FROM articles ORDER BY id DESC LIMIT 1"
    );

    if (!r.rows.length) {
      return res.json({
        live:false,
        title:"Žádná hra zatím",
        description:"Popis se generuje..."
      });
    }

    const game = r.rows[0];

    res.json({
      live:true,
      title:game.title,
      description:game.article || "Popis se generuje..."
    });

  } catch(e){
    res.json({
      live:false,
      title:"Chyba DB",
      description:"DB error"
    });
  }

  res.json({
    live: true,
    title: r.rows[0].title,
    description: r.rows[0].article || ""
  });
});

// GAME
app.get("/api/game/:title", async (req, res) => {
  const title = req.params.title;

  const r = await safeQuery(
    "SELECT article FROM articles WHERE LOWER(title)=LOWER($1) LIMIT 1",
    [title]
  );

  if (!r.rows.length) {
    return res.json({ description: "Popis se generuje..." });
  }

  res.json({ description: r.rows[0].article });
});

// SLUG
function slugify(t) {
  return t.toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

// GENERATOR
function topics() {
  const d = new Date();
  const month = d.toLocaleString("cs", { month: "long" });
  const year = d.getFullYear();
  const genres = ["RPG", "open world", "stealth", "FPS", "survival", "horror"];
  const big = ["GTA", "Skyrim", "Elden Ring", "Witcher", "Cyberpunk"];
  const pick = a => a[Math.floor(Math.random() * a.length)];

  return [
    `Nejlepší ${pick(genres)} hry ${month} ${year}`,
    `Nové hry ${month} ${year}`,
    `Hry jako ${pick(big)}`,
    `Best ${pick(genres)} games ${year}`,
    `New games ${month} ${year}`,
    `Games like ${pick(big)}`
  ];
}

// SAVE ARTICLE SAFE
async function save(title) {
  const slug = slugify(title);

  const exists = await safeQuery(
    "SELECT id FROM articles WHERE slug=$1",
    [slug]
  );

  if (exists.rows.length) return;

  const content = `
<h1>${title}</h1>
<p>Aktuální přehled her a gameplay.</p>
<p><a href="https://kick.com/thehardwareguru" target="_blank">▶ Sleduj stream</a></p>
`;

  await safeQuery(
    "INSERT INTO articles(title, slug, article, created_at) VALUES($1,$2,$3,NOW())",
    [title, slug, content]
  );
}

// CRON
app.get("/cron/daily", async (req, res) => {
  const t = topics();
  for (const x of t) {
    await save(x);
  }
  res.send("OK generated " + t.length);
});

// SITEMAP
app.get("/sitemap.xml", async (req, res) => {
  const r = await safeQuery(
    "SELECT slug FROM articles ORDER BY id DESC LIMIT 5000"
  );

  const urls = r.rows.map(x =>
    `<url><loc>https://thehardwareguru.cz/top/${x.slug}</loc></url>`
  ).join("");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>`;

  res.header("Content-Type", "application/xml");
  res.send(xml);
});

app.listen(PORT, () => {
  console.log("THG STABLE BACKEND RUNNING", PORT);
});
