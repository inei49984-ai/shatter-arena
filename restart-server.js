import net from 'node:net';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const port = Number(process.argv[2]) || 3000;
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

async function portIsFree() {
  return new Promise(resolve => {
    const probe = net.createServer();
    probe.once('error', () => resolve(false));
    probe.listen(port, '127.0.0.1', () => probe.close(() => resolve(true)));
  });
}

for (let attempt = 0; attempt < 90; attempt++) {
  if (await portIsFree()) {
    const child = spawn(process.execPath, [path.join(root, 'server.js')], { cwd: root, stdio: 'inherit', windowsHide: false });
    process.exit(0);
  }
  await delay(500);
}
process.exit(1);
