// Freebuff preview orchestrator for World of ClaudeCraft.
//
// The browser client is served by Vite, which proxies /api and /ws to the
// authoritative game server (vite.config.ts defaults to 127.0.0.1:8787 but
// honors WOC_DEV_API_TARGET). This script starts the whole stack the preview
// needs so those proxies resolve instead of 502ing:
//
//   1. the local PostgreSQL cluster plus the `wocc` database, bootstrapped
//      idempotently by scripts/preview-pg.mjs (initdb/pg_ctl as the postgres
//      user into <repo>/.pgdata, data persists across preview restarts);
//   2. the game server bundle (esbuild via `npm run build:server`), run on
//      SERVER_PORT with PORT pinned so the server never reads the
//      platform-injected PORT;
//   3. the Vite dev server bound to 0.0.0.0 on the platform-injected PORT.
//
// Port discipline: the platform probes the port it exposed to the browser, so
// Vite MUST own the injected PORT. The game server gets a distinct port (8787
// normally; if the platform ever injects 8787 it moves to 8788) and Vite's
// proxy is pointed at it via WOC_DEV_API_TARGET, so the two can never collide
// and Vite never silently shifts off the probed port (--strictPort).
//
// Both children inherit stdout/stderr so `freebuff-preview logs` shows them,
// and a SIGINT/SIGTERM (or one child dying) tears the other down. Every step
// also appends to <repo>/.preview.log (gitignored) because the daemon log
// buffer is wiped on process death; that file is the durable record.
import { spawn, spawnSync } from 'node:child_process';
import { appendFileSync, existsSync } from 'node:fs';
import { DB_URL, ensureDatabase, ensurePostgres } from './preview-pg.mjs';

const LOG_FILE = '.preview.log';
const log = (line) => {
  try {
    appendFileSync(LOG_FILE, `${new Date().toISOString()} ${line}\n`);
  } catch {
    // logging must never take the preview down
  }
  console.log(line);
};

const INJECTED_PORT = process.env.PORT;
const CLIENT_PORT = INJECTED_PORT ?? '5173';
// The game server must never occupy the port the platform probes.
const SERVER_PORT = CLIENT_PORT === '8787' ? '8788' : '8787';
// Point the Vite proxy at the actual game server port (vite.config.ts reads
// this for both the /api and the /ws proxy targets).
const API_TARGET = `http://127.0.0.1:${SERVER_PORT}`;

function run(cmd, args, opts = {}) {
  const res = spawnSync(cmd, args, { stdio: 'inherit', ...opts });
  return res.status ?? 1;
}

function buildServer() {
  console.log('[preview] building the game server bundle...');
  const code = run('npm', ['run', 'build:server']);
  if (code === 0) return true;
  if (existsSync('dist-server/server.cjs')) {
    console.error('[preview] server build failed; falling back to the previous dist-server/server.cjs bundle.');
    return true;
  }
  console.error('[preview] server build failed and no previous bundle exists; /api will stay down.');
  return false;
}

// The Freebuff daemon sometimes exposes the game server port (which serves the
// built client from dist/) instead of the Vite dev server. A stale or missing
// dist/ then shows as 404s for every asset, so ensure the production client
// exists before booting the server. This runs once per workspace (fast when
// dist/ is already present); the full `npm run build` chain is the canonical
// build and is also what the daemon runs for deploys.
function ensureClientDist() {
  if (existsSync('dist/index.html')) return;
  log('[preview] dist/ missing; running npm run build so the game server can serve the client...');
  const code = run('npm', ['run', 'build']);
  if (code !== 0 && !existsSync('dist/index.html')) {
    log('[preview] npm run build failed and dist/index.html is still missing; if the daemon ' +
      'exposes the game server port the client will 404.');
  }
}

async function main() {
  log(`[preview] client port: ${CLIENT_PORT}, game server port: ${SERVER_PORT} (injected PORT: ${INJECTED_PORT ?? 'none'})`);
  if (!(await ensurePostgres())) {
    log('[preview] PostgreSQL is not available; cannot run the game server.');
    process.exit(1);
  }
  ensureDatabase();
  ensureClientDist();

  const serverBuildable = buildServer();

  let server = null;
  let vite = null;

  if (serverBuildable) {
    server = spawn('node', ['dist-server/server.cjs'], {
      cwd: process.cwd(),
      // PORT is pinned to the game server's own port (never the injected
      // client PORT); DATABASE_URL is passed explicitly so the preview works
      // even without a .env.local.
      env: { ...process.env, PORT: SERVER_PORT, DATABASE_URL: DB_URL },
      stdio: ['ignore', 'inherit', 'inherit'],
    });
    server.on('error', (err) => {
      log(`[preview] failed to spawn the game server: ${err.message}`);
    });
    server.on('exit', (code) => {
      log(`[preview] game server exited (code ${code}); stopping the preview.`);
      vite?.kill('SIGTERM');
      process.exit(code ?? 1);
    });
  }

  vite = spawn(
    'npm',
    ['run', 'dev', '--', '--host', '0.0.0.0', '--port', CLIENT_PORT, '--strictPort'],
    {
      cwd: process.cwd(),
      env: { ...process.env, WOC_DEV_API_TARGET: API_TARGET },
      stdio: ['ignore', 'inherit', 'inherit'],
    },
  );
  vite.on('error', (err) => {
    log(`[preview] failed to spawn Vite: ${err.message}`);
    server?.kill('SIGTERM');
    process.exit(1);
  });
  vite.on('exit', (code) => {
    log(`[preview] Vite exited (code ${code}); stopping the preview.`);
    server?.kill('SIGTERM');
    process.exit(code ?? 0);
  });

  let shuttingDown = false;
  const shutdown = (sig) => {
    if (shuttingDown) return;
    shuttingDown = true;
    log(`[preview] received ${sig}; stopping children...`);
    server?.kill(sig);
    vite?.kill(sig);
    setTimeout(() => process.exit(0), 2000).unref();
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

main().catch((err) => {
  console.error('[preview] fatal:', err);
  process.exit(1);
});
