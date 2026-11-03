import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const app = express();
const root = path.dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT) || 3000;

app.disable('x-powered-by');
const staticOptions = {
  maxAge: process.env.RENDER ? '1h' : 0,
  setHeaders(res, file) {
    if (/\.(html|js|css|webmanifest)$/i.test(file)) res.setHeader('Cache-Control', 'no-cache');
  }
};
app.use('/vendor/three', express.static(path.join(root, 'node_modules', 'three'), staticOptions));
app.use(express.static(path.join(root, 'public'), staticOptions));
app.get('/health', (_req, res) => res.json({ ok: true }));
app.get('*path', (_req, res) => res.sendFile(path.join(root, 'public', 'index.html')));

app.listen(port, '0.0.0.0', () => console.log(`Shatter Arena listening on port ${port}`));
