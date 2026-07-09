import { ZipArchive } from "archiver";
import express from "express";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = Number(process.env.PORT || 3333);
const MAX_IMAGES = Number(process.env.MAX_IMAGES || 120);

const scrapeCache = new Map();

app.use(express.json({ limit: "250mb" }));
app.use(express.static(path.join(__dirname, "public")));

app.options("/api/import", (req, res) => {
  setImportCorsHeaders(res);
  res.sendStatus(204);
});

app.post("/api/import", (req, res) => {
  setImportCorsHeaders(res);

  try {
    const url = validateApartmentsUrl(req.body?.url);
    const rawUrls = Array.isArray(req.body?.urls) ? req.body.urls : [];
    const images = processImageUrls(rawUrls);
    const title =
      typeof req.body?.title === "string" && req.body.title.trim()
        ? req.body.title.trim()
        : "Apartments images";
    const result = {
      url,
      title,
      count: images.length,
      images
    };
    const id = randomUUID();
    scrapeCache.set(id, result);
    setTimeout(() => scrapeCache.delete(id), 60 * 60 * 1000);
    res.json({ id, ...result });
  } catch (error) {
    res.status(400).json({ error: error.message || "Import failed" });
  }
});

app.get("/api/result/:id", (req, res) => {
  const result = scrapeCache.get(req.params.id);
  if (!result) {
    res.status(404).json({ error: "Capture result expired or not found. Capture the listing again." });
    return;
  }
  res.json({ id: req.params.id, ...result });
});

app.get("/api/download/:id", async (req, res) => {
  const result = scrapeCache.get(req.params.id);
  if (!result) {
    res.status(404).send("Scrape result expired or not found. Scrape the listing again.");
    return;
  }

  res.setHeader("Content-Type", "application/zip");
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="${safeFilename(result.title || "apartments-images")}.zip"`
  );

  const archive = createZipArchive();
  archive.on("error", (error) => {
    if (!res.headersSent) res.status(500);
    res.end(error.message);
  });
  archive.pipe(res);

  let added = 0;
  const failures = [];
  for (const image of result.images.slice(0, MAX_IMAGES)) {
    try {
      const response = await fetchImage(image.url, result.url);
      if (!response.ok || !response.body) {
        failures.push(`${image.url} - HTTP ${response.status}`);
        continue;
      }
      const contentType = response.headers.get("content-type") || "";
      if (!contentType.startsWith("image/")) {
        failures.push(`${image.url} - returned ${contentType || "unknown content type"}`);
        continue;
      }

      added += 1;
      const extension = extensionFor(contentType, image.url);
      const buffer = Buffer.from(await response.arrayBuffer());
      archive.append(buffer, {
        name: `image-${String(added).padStart(3, "0")}${extension}`
      });
    } catch (error) {
      failures.push(`${image.url} - ${error.message || "download failed"}`);
    }
  }

  if (added === 0) {
    archive.append(
      [
        "No images could be downloaded by the local server.",
        "",
        "This usually means the image CDN requires the same browser session that opened Apartments.com.",
        "The captured image URLs are listed below so you can still open them directly.",
        "",
        ...result.images.map((image) => image.url),
        "",
        "Failures:",
        ...failures
      ].join("\n"),
      {
        name: "README.txt"
      }
    );
  } else if (failures.length > 0) {
    archive.append(failures.join("\n"), {
      name: "failed-downloads.txt"
    });
  }

  await archive.finalize();
});

app.get("/api/urls/:id", (req, res) => {
  const result = scrapeCache.get(req.params.id);
  if (!result) {
    res.status(404).send("Capture result expired or not found. Capture the listing again.");
    return;
  }

  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="${safeFilename(result.title || "apartments-images")}-urls.txt"`
  );
  res.send(result.images.map((image) => image.url).join("\n"));
});

app.post("/api/download-upload", async (req, res) => {
  const title =
    typeof req.body?.title === "string" && req.body.title.trim() ? req.body.title.trim() : "apartments-images";
  const images = Array.isArray(req.body?.images) ? req.body.images : [];

  res.setHeader("Content-Type", "application/zip");
  res.setHeader("Content-Disposition", `attachment; filename="${safeFilename(title)}.zip"`);

  const archive = createZipArchive();
  archive.on("error", (error) => {
    if (!res.headersSent) res.status(500);
    res.end(error.message);
  });
  archive.pipe(res);

  let added = 0;
  for (const image of images.slice(0, MAX_IMAGES)) {
    if (!image?.data || typeof image.data !== "string") continue;
    const match = image.data.match(/^data:(image\/[a-z0-9.+-]+);base64,(.+)$/i);
    if (!match) continue;
    added += 1;
    archive.append(Buffer.from(match[2], "base64"), {
      name: `image-${String(added).padStart(3, "0")}${extensionFor(match[1], image.url || "")}`
    });
  }

  if (added === 0) {
    archive.append("No browser-uploaded image data was received.", {
      name: "README.txt"
    });
  }

  await archive.finalize();
});

export function startServer({ port = PORT } = {}) {
  return new Promise((resolve, reject) => {
    const server = app.listen(port, () => {
      console.log(`Apartments image scraper running at http://localhost:${port}`);
      resolve({
        app,
        port,
        server,
        url: `http://localhost:${port}`,
        close: () =>
          new Promise((closeResolve, closeReject) => {
            server.close((error) => (error ? closeReject(error) : closeResolve()));
          })
      });
    });

    server.once("error", reject);
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  startServer().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}

function setImportCorsHeaders(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

function createZipArchive() {
  return new ZipArchive({ zlib: { level: 9 } });
}

async function fetchImage(imageUrl, listingUrl) {
  const attempts = [
    requestHeaders(listingUrl),
    requestHeaders(imageUrl),
    {
      Accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.9"
    }
  ];

  let lastResponse;
  for (const headers of attempts) {
    lastResponse = await fetch(imageUrl, { headers, redirect: "follow" }).catch(() => null);
    if (lastResponse?.ok) return lastResponse;
  }
  return lastResponse || new Response(null, { status: 502 });
}

function validateApartmentsUrl(rawUrl) {
  if (typeof rawUrl !== "string" || rawUrl.trim().length === 0) {
    throw new Error("Paste an apartments.com property URL.");
  }

  let url;
  try {
    url = new URL(rawUrl.trim());
  } catch {
    throw new Error("That does not look like a valid URL.");
  }

  if (!["http:", "https:"].includes(url.protocol) || !/(^|\.)apartments\.com$/i.test(url.hostname)) {
    throw new Error("Please use a property URL from apartments.com.");
  }

  url.hash = "";
  return url.toString();
}

function processImageUrls(rawUrls) {
  const allUrls = rawUrls.flatMap(expandCandidates);
  return uniqueByCanonical(allUrls)
    .filter(isLikelyPropertyImage)
    .sort((a, b) => scoreImageUrl(b) - scoreImageUrl(a))
    .slice(0, MAX_IMAGES)
    .map((imageUrl) => ({ url: imageUrl, score: scoreImageUrl(imageUrl) }));
}

function expandCandidates(rawUrl) {
  const cleaned = cleanupUrl(rawUrl);
  if (!cleaned) return [];

  const candidates = new Set([cleaned]);
  try {
    const url = new URL(cleaned);
    for (const key of ["width", "height", "w", "h", "resize", "quality", "thumbnail"]) {
      url.searchParams.delete(key);
    }
    candidates.add(url.toString());

    const pathname = url.pathname
      .replace(/\/(thumb|thumbnail|small|medium)\//gi, "/")
      .replace(/([_-])(?:thumb|thumbnail|small|medium)(?=\.)/gi, "");
    candidates.add(`${url.origin}${pathname}${url.search}`);
  } catch {
    // Keep the cleaned URL only.
  }

  return Array.from(candidates);
}

function cleanupUrl(rawUrl) {
  if (!rawUrl || rawUrl.startsWith("data:") || rawUrl.startsWith("blob:")) return null;
  const candidate = rawUrl
    .replaceAll("\\/", "/")
    .replaceAll("&amp;", "&")
    .replace(/[),.;]+$/, "");

  try {
    const url = new URL(candidate);
    if (!["http:", "https:"].includes(url.protocol)) return null;
    return url.toString();
  } catch {
    return null;
  }
}

function uniqueByCanonical(urls) {
  const seen = new Set();
  const unique = [];

  for (const url of urls) {
    const clean = cleanupUrl(url);
    if (!clean) continue;
    const canonical = clean
      .replace(/[?&](width|height|w|h|resize|quality|thumbnail)=[^&]+/gi, "")
      .replace(/([_-])(?:thumb|thumbnail|small|medium)(?=\.)/gi, "");
    if (seen.has(canonical)) continue;
    seen.add(canonical);
    unique.push(clean);
  }

  return unique;
}

function isLikelyPropertyImage(url) {
  const lower = url.toLowerCase();
  if (!/\.(jpe?g|png|webp|avif)(\?|$)/i.test(lower)) return false;
  if (/(logo|icon|sprite|avatar|map|marker|floorplan|floor-plan|favicon|badge|equalhousing)/i.test(lower)) {
    return false;
  }
  return /(apartments\.com|apartmenthomeliving|costar|images|media|photos|property|rentpath|cloudfront|imgix|cdn)/i.test(
    lower
  );
}

function scoreImageUrl(url) {
  const lower = url.toLowerCase();
  let score = 0;
  if (/\.(jpe?g|webp|png|avif)(\?|$)/.test(lower)) score += 10;
  if (/(photo|property|community|interior|exterior|building|kitchen|bedroom|living|amenity)/.test(lower)) score += 12;
  if (/(thumb|thumbnail|small|icon|logo)/.test(lower)) score -= 30;

  for (const match of lower.matchAll(/(?:width|height|w|h)[=/_-](\d{3,5})/g)) {
    score += Math.min(Number(match[1]) / 100, 30);
  }
  for (const match of lower.matchAll(/(?:^|[^a-z])(\d{3,5})x(\d{3,5})(?:[^a-z]|$)/g)) {
    score += Math.min((Number(match[1]) + Number(match[2])) / 120, 40);
  }

  return score;
}

function requestHeaders(referer) {
  return {
    Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
    Referer: referer
  };
}

function extensionFor(contentType, url) {
  if (contentType.includes("jpeg")) return ".jpg";
  if (contentType.includes("png")) return ".png";
  if (contentType.includes("webp")) return ".webp";
  if (contentType.includes("avif")) return ".avif";
  const match = new URL(url).pathname.match(/\.(jpe?g|png|webp|avif)$/i);
  return match ? `.${match[1].toLowerCase().replace("jpeg", "jpg")}` : ".jpg";
}

function safeFilename(name) {
  return name
    .replace(/[^a-z0-9 _-]/gi, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 80)
    .toLowerCase();
}
