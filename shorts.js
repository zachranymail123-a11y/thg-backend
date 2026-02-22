
async function loadShorts(){
  try{
    const res = await fetch("https://www.youtube.com/feeds/videos.xml?channel_id=UC_x5XG1OV2P6uZZ5FSM9Ttw");
    const text = await res.text();
    const parser = new DOMParser();
    const xml = parser.parseFromString(text, "text/xml");
    const entries = xml.getElementsByTagName("entry");

    const grid = document.getElementById("shortsGrid");
    grid.innerHTML = "";

    for(let i=0; i<3 && i<entries.length; i++){
      const videoId = entries[i].getElementsByTagName("yt:videoId")[0].textContent;
      const iframe = document.createElement("iframe");
      iframe.src = "https://www.youtube.com/embed/" + videoId;
      iframe.allow = "accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture";
      iframe.allowFullscreen = true;
      grid.appendChild(iframe);
    }

  } catch(e){
    document.getElementById("shortsGrid").innerText = "Shorts se nepodařilo načíst.";
  }
}
loadShorts();
