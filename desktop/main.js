import { app, BrowserWindow } from 'electron';
import express from 'express';
import { createServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

app.setName('Tomas Fight');
let staticServer;

async function createWindow() {
  const site = express();
  const root = app.isPackaged ? path.join(app.getAppPath(),'public') : fileURLToPath(new URL('../public/',import.meta.url));
  site.use('/vendor/three', express.static(app.isPackaged ? path.join(app.getAppPath(),'node_modules/three') : fileURLToPath(new URL('../node_modules/three/',import.meta.url))));
  site.use(express.static(root));
  staticServer = createServer(site);
  await new Promise(resolve => staticServer.listen(0, '127.0.0.1', resolve));
  const address = staticServer.address();
  const window = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 960,
    minHeight: 640,
    show: false,
    backgroundColor: '#20272a',
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true }
  });
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', (event, url) => {
    if (new URL(url).origin !== `http://127.0.0.1:${address.port}`) event.preventDefault();
  });
  await window.loadURL(`http://127.0.0.1:${address.port}/`);
  window.show();
}

app.whenReady().then(createWindow);
app.on('window-all-closed', () => app.quit());
app.on('before-quit', () => staticServer?.close());
