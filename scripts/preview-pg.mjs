// Shared Freebuff preview PostgreSQL bootstrap for World of ClaudeCraft.
//
// The authoritative game server persists to PostgreSQL (server/db.ts reads
// DATABASE_URL at module load), so the preview sandbox needs a local cluster.
// The sandbox image ships the postgres-14 server binaries under
// /usr/lib/postgresql/14/bin but no postgresql-common wrapper (no
// pg_ctlcluster/service), so this module boots a cluster directly with initdb +
// pg_ctl, run as the `postgres` system user (the server refuses to run as
// root). The data dir lives at <repo>/.pgdata (gitignored) so characters
// persist across preview restarts within the workspace. Idempotent: every step
// no-ops once the cluster is up and the `wocc` database exists.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

export const DB_NAME = 'wocc';
export const DB_PORT = process.env.PG_PORT ?? '5432';
export const PGDATA = process.env.PGDATA ?? resolve(ROOT, '.pgdata');
export const DB_URL =
  process.env.DATABASE_URL ?? `postgres://postgres:postgres@127.0.0.1:${DB_PORT}/${DB_NAME}`;

const PG_ENV = { ...process.env, PGPASSWORD: 'postgres' };
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function run(cmd, args, opts = {}) {
  const res = spawnSync(cmd, args, { stdio: 'inherit', ...opts });
  return res.status ?? 1;
}

function runQuiet(cmd, args, opts = {}) {
  const res = spawnSync(cmd, args, { stdio: ['ignore', 'pipe', 'ignore'], ...opts });
  return { ok: res.status === 0, out: String(res.stdout ?? '').trim() };
}

function findBin(name) {
  const onPath = runQuiet('command', ['-v', name]).out;
  if (onPath) return onPath;
  // Raw binaries live under /usr/lib/postgresql/<ver>/bin; pick the highest
  // installed version so the image layout, not PATH, decides availability.
  try {
    const versions = readdirSync('/usr/lib/postgresql').sort();
    for (const ver of versions.reverse()) {
      const bin = resolve('/usr/lib/postgresql', ver, 'bin', name);
      if (existsSync(bin)) return bin;
    }
  } catch {
    // no /usr/lib/postgresql at all
  }
  return null;
}

function probeOk() {
  return runQuiet(
    'psql',
    ['-h', '127.0.0.1', '-p', DB_PORT, '-U', 'postgres', '-d', 'postgres', '-tAc', 'SELECT 1'],
    { env: PG_ENV },
  ).ok;
}

async function waitForProbe(seconds = 30) {
  for (let i = 0; i < seconds; i++) {
    if (probeOk()) return true;
    await sleep(1000);
  }
  return probeOk();
}

function postgresUser() {
  const uid = runQuiet('id', ['-u', 'postgres']).out;
  return uid ? 'postgres' : 'root';
}

// The postgres system user must be able to traverse up to the data dir. The
// workspace parents may block it (as in the Freebuff sandbox), so grant o+x up
// the chain from the repo root; PGDATA itself is chowned to postgres below.
function makeTraversable(dir) {
  let cur = resolve(dir);
  for (;;) {
    run('chmod', ['o+x', cur], { stdio: 'ignore' });
    const parent = dirname(cur);
    if (parent === cur) break;
    cur = parent;
  }
}

// Starts the local cluster if it is not already reachable. Returns true when
// the cluster answers on 127.0.0.1:DB_PORT afterwards.
export async function ensurePostgres() {
  if (probeOk()) return true;

  const pgCtlCluster = findBin('pg_ctlcluster');
  if (pgCtlCluster) {
    console.log('[preview] starting local PostgreSQL cluster...');
    run('service', ['postgresql', 'start']);
    return waitForProbe();
  }

  const initdb = findBin('initdb');
  const pgCtl = findBin('pg_ctl');
  if (!initdb || !pgCtl) {
    console.error(
      '[preview] PostgreSQL server binaries not found; the game server cannot run. ' +
        'Re-run the workspace install so scripts/preview-install.mjs can install it.',
    );
    return false;
  }

  const user = postgresUser();
  if (user !== 'postgres') {
    console.error('[preview] no `postgres` system user; cannot init the local cluster.');
    return false;
  }

  makeTraversable(ROOT);

  if (!existsSync(resolve(PGDATA, 'PG_VERSION'))) {
    console.log(`[preview] initializing PostgreSQL data dir at ${PGDATA}...`);
    mkdirSync(PGDATA, { recursive: true });
    run('chown', ['postgres:postgres', PGDATA]);
    const code = run('runuser', [
      '-u', 'postgres', '--',
      initdb, '-D', PGDATA, '-U', 'postgres', '-E', 'UTF8', '--locale=C', '--auth=trust',
    ]);
    if (code !== 0) {
      console.error('[preview] initdb failed; cannot run the game server.');
      return false;
    }
  }

  console.log(`[preview] starting PostgreSQL on 127.0.0.1:${DB_PORT}...`);
  run('chown', ['postgres:postgres', PGDATA]);
  const code = run('runuser', [
    '-u', 'postgres', '--',
    pgCtl, '-D', PGDATA, '-l', resolve(PGDATA, 'pg.log'),
    '-o', `-p ${DB_PORT} -h 127.0.0.1 -k /tmp`, '-w', 'start',
  ]);
  if (code !== 0) {
    // A stale pid/start race can surface here; a second start attempt is cheap.
    run('runuser', [
      '-u', 'postgres', '--',
      pgCtl, '-D', PGDATA, '-l', resolve(PGDATA, 'pg.log'),
      '-o', `-p ${DB_PORT} -h 127.0.0.1 -k /tmp`, '-w', 'start',
    ]);
  }
  return waitForProbe();
}

// Ensures the postgres role password and the `wocc` database exist. Must run
// after ensurePostgres().
export function ensureDatabase() {
  run('psql', ['-h', '127.0.0.1', '-p', DB_PORT, '-U', 'postgres', '-d', 'postgres',
    '-c', `ALTER USER postgres PASSWORD 'postgres'`], { stdio: 'ignore', env: PG_ENV });
  const res = runQuiet(
    'psql',
    ['-h', '127.0.0.1', '-p', DB_PORT, '-U', 'postgres', '-d', 'postgres', '-tAc',
      `SELECT 1 FROM pg_database WHERE datname='${DB_NAME}'`],
    { env: PG_ENV },
  );
  if (res.out === '1') return true;
  console.log(`[preview] creating database ${DB_NAME}...`);
  const createdb = findBin('createdb') ?? 'createdb';
  run(createdb, ['-h', '127.0.0.1', '-p', DB_PORT, '-U', 'postgres', DB_NAME], {
    stdio: 'inherit',
    env: PG_ENV,
  });
  return runQuiet(
    'psql',
    ['-h', '127.0.0.1', '-p', DB_PORT, '-U', 'postgres', '-d', 'postgres', '-tAc',
      `SELECT 1 FROM pg_database WHERE datname='${DB_NAME}'`],
    { env: PG_ENV },
  ).out === '1';
}
