
async function loadLive(){
 try{
 const r = await fetch("https://thg-backend-production.up.railway.app/api/live");
 const d = await r.json();
 if(d && d.title){
 document.getElementById("liveTitle").innerText="🔴 Právě streamuji: "+d.title;
 }else{
 document.getElementById("liveTitle").innerText="Stream offline";
 }
 }catch(e){
 document.getElementById("liveTitle").innerText="Stream offline";
 }}
loadLive();
setInterval(loadLive,60000);
