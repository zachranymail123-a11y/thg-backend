
import express from "express";
import fetch from "node-fetch";
import * as cheerio from "cheerio";

const app = express();
const PORT = process.env.PORT || 8080;

let shortsCache = [];
let kickCache = null;
let lastUpdate = 0;
const CACHE_TIME = 1000 * 60 * 10;

async function loadShorts(){
  if(Date.now()-lastUpdate < CACHE_TIME && shortsCache.length) return shortsCache;

  const key = process.env.YOUTUBE_API_KEY;
  const channel = process.env.YOUTUBE_CHANNEL_ID;

  const url = `https://www.googleapis.com/youtube/v3/search?key=${key}&channelId=${channel}&part=snippet,id&order=date&maxResults=10`;
  const r = await fetch(url);
  const j = await r.json();

  const vids = j.items
    .filter(v=>v.id.videoId)
    .slice(0,3)
    .map(v=>({
      title:v.snippet.title,
      id:v.id.videoId,
      thumb:v.snippet.thumbnails.high.url,
      url:`https://www.youtube.com/watch?v=${v.id.videoId}`
    }));

  shortsCache = vids;
  lastUpdate = Date.now();
  return vids;
}

async function loadKick(){
  if(kickCache && Date.now()-lastUpdate < CACHE_TIME) return kickCache;

  const r = await fetch("https://kick.com/thehardwareguru/videos");
  const html = await r.text();
  const $ = cheerio.load(html);

  const first = $("a[href*='/video/']").first().attr("href");
  if(!first){
    kickCache=null;
    return null;
  }

  kickCache={url:"https://kick.com"+first};
  return kickCache;
}

app.get("/api/shorts", async(req,res)=>{
  try{
    const s = await loadShorts();
    res.json(s);
  }catch(e){
    res.json([]);
  }
});

app.get("/api/kick-last", async(req,res)=>{
  try{
    const k = await loadKick();
    res.json(k||{});
  }catch(e){
    res.json({});
  }
});

app.get("/", (req,res)=>res.send("THG backend running"));

app.listen(PORT, ()=>console.log("RUNNING "+PORT));
