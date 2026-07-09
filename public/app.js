const statusEl = document.querySelector("#status");
const actionsEl = document.querySelector("#actions");
const galleryEl = document.querySelector("#gallery");
const bookmarkletEl = document.querySelector("#bookmarklet");

bookmarkletEl.href = buildBookmarklet();

const resultId = new URLSearchParams(window.location.search).get("result");
if (resultId) {
  loadResult(resultId);
} else {
  setStatus("Drag the bookmark button to your bookmarks bar, then use it from an Apartments.com listing gallery.");
}

async function loadResult(id) {
  setStatus("Loading captured images...");
  actionsEl.classList.add("hidden");
  actionsEl.innerHTML = "";
  galleryEl.innerHTML = "";

  try {
    const response = await fetch(`/api/result/${encodeURIComponent(id)}`);
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Could not load captured images");
    showResult(data);
  } catch (error) {
    setStatus(error.message, true);
  }
}

function showResult(data) {
  if (data.count === 0) {
    setStatus("No property images were captured. Open the listing photo gallery, scroll through it, then click the bookmark again.", true);
    return;
  }
  setStatus(`Found ${data.count} image${data.count === 1 ? "" : "s"} for ${data.title}.`);
  renderActions(data);
  renderGallery(data.images);
}

function renderActions(data) {
  actionsEl.classList.remove("hidden");
  actionsEl.innerHTML = `
    <span>${data.count} downloadable images</span>
    <div class="download-actions">
      <button id="open-all-images" type="button">Open all full-size images</button>
      <a href="/api/download/${data.id}">Download ZIP</a>
      <a class="secondary-download" href="/api/urls/${data.id}">Download URL list</a>
    </div>
  `;

  document.querySelector("#open-all-images").addEventListener("click", () => {
    openImagesInTabs(data.images);
  });
}

function renderGallery(images) {
  const fragment = document.createDocumentFragment();
  for (const image of images) {
    const tile = document.createElement("a");
    tile.href = image.url;
    tile.target = "_blank";
    tile.rel = "noreferrer";
    tile.className = "image-tile";

    const img = document.createElement("img");
    img.src = image.url;
    img.loading = "lazy";
    img.alt = "";
    tile.append(img);
    fragment.append(tile);
  }
  galleryEl.append(fragment);
}

function openImagesInTabs(images) {
  const blocked = [];

  images.forEach((image) => {
    const tab = window.open(image.url, "_blank", "noopener,noreferrer");
    if (!tab) blocked.push(image.url);
  });

  if (blocked.length > 0) {
    setStatus(
      `Your browser blocked ${blocked.length} tab${blocked.length === 1 ? "" : "s"}. Allow pop-ups for this local app, then click the open-all button again.`,
      true
    );
  } else {
    setStatus(`Opened ${images.length} full-size image${images.length === 1 ? "" : "s"} in new tabs.`);
  }
}

function setStatus(message, isError = false) {
  statusEl.textContent = message;
  statusEl.classList.toggle("error", isError);
}

function buildBookmarklet() {
  const code = `javascript:(async()=>{const add=(set,value)=>{if(!value||typeof value!=="string")return;(value.match(/https?:\\/\\/[^"' <>)\\\\]+/g)||[]).forEach(url=>set.add(url.replace(/\\\\u002F/g,"/").replace(/&amp;/g,"&").replace(/[),.;]+$/,"")))};const urls=new Set();document.querySelectorAll("img,source").forEach(el=>["src","srcset","data-src","data-srcset","data-lazy-src","data-original"].forEach(attr=>add(urls,el.getAttribute(attr))));document.querySelectorAll("[style],script").forEach(el=>add(urls,el.getAttribute("style")||el.textContent||""));const response=await fetch("http://localhost:3333/api/import",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({url:location.href,title:(document.querySelector("h1")?.textContent||document.title||"Apartments images").trim(),urls:[...urls]})});const data=await response.json();if(!response.ok)throw new Error(data.error||"Capture failed");window.open("http://localhost:3333/?result="+encodeURIComponent(data.id),"_blank")})().catch(error=>alert("Apartments image capture failed: "+error.message));`;
  return code;
}
