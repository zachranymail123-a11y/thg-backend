
async function loadLive(){
  try{
    const r = await fetch("https://thg-backend-production.up.railway.app/api/live");
    const d = await r.json();
    if(d && d.title){
      document.getElementById("liveStatus").innerText = "🔴 Právě streamuji: " + d.title;
    } else {
      document.getElementById("liveStatus").innerText = "Stream offline – záznamy níže";
    }
  } catch(e){
    document.getElementById("liveStatus").innerText = "Stream offline";
  }
}
loadLive();
setInterval(loadLive, 60000);
