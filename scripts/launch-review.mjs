import { createApp } from '../server.mjs';
import { spawn } from 'node:child_process';

// Portable reviews never inherit private model credentials from the host.
const server = createApp({ env: {} });
server.once('error', error => {
  console.error(`Unable to start Next Touch: ${error.message}`);
  process.exitCode = 1;
});
server.listen(0, '127.0.0.1', () => {
  const url = `http://127.0.0.1:${server.address().port}`;
  console.log(`\nNext Touch is ready: ${url}\n`);
  console.log('Keep this window open while reviewing. Close it to stop the app.');
  console.log('Bundled synthetic replay and evidence analysis work offline.');
  console.log('Live language-model conversation is not included in this portable build.\n');
  if (process.argv.includes('--no-browser')) return;
  const command = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'rundll32.exe' : 'xdg-open';
  const args = process.platform === 'win32' ? ['url.dll,FileProtocolHandler', url] : [url];
  const browser = spawn(command, args, { stdio: 'ignore' });
  browser.on('error', () => console.log(`Open the address above in your browser.`));
  browser.unref();
});
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => {
  server.closeAllConnections();
  server.close(() => process.exit(0));
});
