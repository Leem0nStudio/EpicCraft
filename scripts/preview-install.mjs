// Freebuff preview install: makes the preview sandbox able to run the
// authoritative game server, which requires a local PostgreSQL, then installs
// npm dependencies. Runs once per workspace (fast when everything is already
// present: every step no-ops in ~1s). The preview command itself only starts
// services; it never apt-installs or npm-installs, so preview restarts stay
// quick.
//
// PostgreSQL bootstrap lives in scripts/preview-pg.mjs: the sandbox image
// ships the postgres-14 server binaries but not the postgresql-common wrapper,
// so the cluster is initialized and started directly with initdb/pg_ctl as the
// `postgres` system user into <repo>/.pgdata. The apt step below is only a
// best-effort fallback for images with no postgres at all; it must never block
// `npm ci` (on the production deploy builder, a Node-only image, postgres is
// not installable and the preview game server simply cannot run there).
import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { ensureDatabase, ensurePostgres } from './preview-pg.mjs';

function sh(command, opts = {}) {
  execSync(command, { stdio: 'inherit', ...opts });
}

function has(command) {
  try {
    execSync(`command -v ${command}`, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

const hasPostgres =
  has('pg_ctlcluster') || existsSync('/usr/lib/postgresql');

if (hasPostgres) {
  console.log('[preview-install] PostgreSQL already installed');
} else {
  try {
    console.log('[preview-install] installing PostgreSQL (first run only, ~1-2 min)...');
    sh('apt-get update -qq');
    sh('DEBIAN_FRONTEND=noninteractive apt-get install -y -qq postgresql');
    console.log('[preview-install] PostgreSQL installed');
  } catch (err) {
    console.warn(
      '[preview-install] could not install PostgreSQL (expected on the production ' +
        'deploy builder): the preview game server needs it, production serves the ' +
        'static build instead.',
    );
  }
}

const pgUp = await ensurePostgres();
if (pgUp) {
  ensureDatabase();
} else if (!hasPostgres) {
  console.warn(
    '[preview-install] PostgreSQL unavailable; the preview game server will stay down.',
  );
}

console.log('[preview-install] installing npm dependencies...');
sh('npm ci');
console.log('[preview-install] done');
