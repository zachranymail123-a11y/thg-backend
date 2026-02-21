export async function handler() {

  const KICK = "thehardwareguru";
  const YT = "UCgDdszBhhpqkNQc6t4YOCNw"; // doplň svůj channel ID

  let title = "Neznámá hra";
  let youtube = null;
  let live = false;

  try {
    const res = await fetch(`https://kick.com/api/v2/channels/${KICK}`);
    const data = await res.json();
    if (data?.livestream) {
      title = data.livestream.session_title;
      if (data.livestream.is_live === true) live = true;
    }
  } catch {}

  try {
    const rss = await fetch(`https://www.youtube.com/feeds/videos.xml?channel_id=${YT}`);
    const text = await rss.text();
    const titles = [...text.matchAll(/<title>(.*?)<\/title>/g)];
    const ids = [...text.matchAll(/<yt:videoId>(.*?)<\/yt:videoId>/g)];
    if (titles[1]) title = titles[1][1];
    if (ids[0]) youtube = "https://www.youtube.com/watch?v=" + ids[0][1];
  } catch {}

  return {
    statusCode: 200,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ live, title, youtube })
  };
}
