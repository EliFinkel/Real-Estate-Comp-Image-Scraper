# Real Estate Comp Images

Static GitHub Pages site for sharing a prepared ZIP of real estate comp images.

## Deploy on GitHub Pages

1. Push this repository to GitHub.
2. Open the repository settings.
3. Go to Pages.
4. Set the source to `Deploy from a branch`.
5. Choose the branch you want to publish and the repository root (`/`).
6. Save.

The site entry point is `index.html`. The downloadable ZIP is stored at:

```text
public/the-eli-winter-springs-winter-springs-fl.zip
```

## Note

The previous Puppeteer scraping server was removed because GitHub Pages only hosts static files. It cannot run a Node server, scrape listing pages, download images, or generate ZIP files dynamically.
