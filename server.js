
import express from "express";
import pkg from "pg";
import cors from "cors";

const { Pool } = pkg;

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 8080;
const DATABASE_URL = process.env.DATABASE_URL;

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// ---------- HEALTH ----------
app.get("/", (req, res) => {
  res.send("THG BACKEND RUNNING");
});

// ---------- LIVE API ----------
app.get("/api/live", async (req, res) => {
  res.json({
    live: true,
    title: "Live Stream",
    youtube: "https://www.youtube.com/@TheHardwareGuru_Czech"
  });
});

// ---------- GAME API ----------
app.get("/api/game/:title", async (req, res) => {
  const title = req.params.title;

  try {
    const r = await pool.query(
      "SELECT * FROM articles WHERE LOWER(title)=LOWER($1) LIMIT 1",
      [title]
    );

    if (r.rows.length === 0) {
      return res.json({ description: "Popis zatím není dostupný." });
    }

    res.json({
      description: r.rows[0].article || r.rows[0].description
    });

  } catch (e) {
    res.json({ description: "Chyba databáze." });
  }
});

// ---------- SITEMAP ----------
app.get("/sitemap.xml", async (req, res) => {
  try {
    const r = await pool.query("SELECT slug FROM articles LIMIT 1000");

    let urls = r.rows.map(row =>
      `<url><loc>https://thehardwareguru.cz/top/${row.slug}</loc></url>`
    ).join("");

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
    <urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
    ${urls}
    </urlset>`;

    res.header("Content-Type", "application/xml");
    res.send(xml);

  } catch (e) {
    res.send("<urlset></urlset>");
  }
});

app.listen(PORT, () => {
  console.log("THG FINAL BACKEND RUNNING", PORT);
});
