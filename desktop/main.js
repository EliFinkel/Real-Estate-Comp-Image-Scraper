import { app, BrowserWindow, shell } from "electron";
import { startServer } from "../server.js";

let mainWindow;
let serverHandle;

async function createWindow() {
  serverHandle = await startServer();

  mainWindow = new BrowserWindow({
    width: 1120,
    height: 820,
    minWidth: 760,
    minHeight: 560,
    title: "Apartments Image Downloader",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.removeMenu();
  await mainWindow.loadURL(serverHandle.url);
  await shell.openExternal(serverHandle.url);

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });
}

app.whenReady().then(createWindow).catch((error) => {
  console.error(error);
  app.quit();
});

app.on("window-all-closed", () => {
  app.quit();
});

app.on("before-quit", async (event) => {
  if (!serverHandle) return;

  event.preventDefault();
  const handle = serverHandle;
  serverHandle = null;

  try {
    await handle.close();
  } catch (error) {
    console.error(error);
  } finally {
    app.quit();
  }
});
