# Apartments.com Image Downloader

A desktop app that starts a local Apartments.com image downloader server, opens the tool in the browser, and stops the server when the app closes.

## Desktop app

```bash
./setup.sh
npm run desktop
```

The desktop window starts the local server and opens [http://localhost:3333](http://localhost:3333) in your normal browser. Leave the desktop window open while using the tool. Close the desktop window when you want the server to stop.

To build a Windows portable app:

```bash
npm run dist:win
```

The Windows build output is written to `dist/`.

## Browser flow

Use the bookmark button on the app page:

1. Drag **Capture images** from the app page to your bookmarks bar.
2. Open the Apartments.com listing in your normal browser.
3. Open the listing's photo gallery and scroll through the photos you want.
4. Click the **Capture images** bookmark.
5. The bookmark opens the local app with the captured images.
6. Download the ZIP, download the URL list, or click **Open all full-size images** to open each image in its own browser tab.

## Notes

- Use this only for listings and images you are allowed to access and download.
- Results are cached in memory for one hour so the ZIP endpoint can download the same URLs.
- You can cap the number of images with `MAX_IMAGES=50 ./run.sh`.
