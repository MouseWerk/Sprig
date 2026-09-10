#!/usr/bin/env node
// Upload a signed Android App Bundle to a Google Play track, with the
// release notes from versionshinweis.txt — the Android counterpart to
// scripts/ios-release.sh.
//
// Talks to the Google Play Developer API directly with the service account
// in ./play-service-account.json (gitignored; created via Google Cloud IAM
// and invited in Play Console → Users and permissions). No eas-cli and no
// Expo login involved, and no dependencies: Node's crypto signs the JWT and
// the global fetch does the rest.
//
//   node scripts/android-release.mjs --track internal
//   node scripts/android-release.mjs --track production --status completed
//   node scripts/android-release.mjs --track internal --dry-run   # everything except commit
//
// Options:
//   --track     internal | alpha | beta | production   (required)
//   --aab       path to the .aab (default: android/app/build/outputs/bundle/release/app-release.aab)
//   --status    completed | draft | inProgress | halted (default: completed)
//   --notes     release-notes file (default: versionshinweis.txt)
//   --version-code N   skip the upload and point the track at an already-uploaded
//               versionCode (e.g. to promote a build from internal to production;
//               Play rejects uploading the same versionCode twice)
//   --dry-run   upload + validate inside an edit, then delete the edit instead of committing
//
// The flow is Google's "edit" transaction: insert edit → upload bundle →
// point the track at the new versionCode → validate → commit. Nothing is
// visible to anyone until commit, so a failure anywhere just deletes the
// draft edit.

import { createSign } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { basename, resolve } from 'node:path';

const PACKAGE_NAME = 'com.mousewerk.sprig';
const KEY_FILE = 'play-service-account.json';
const SCOPE = 'https://www.googleapis.com/auth/androidpublisher';
const API = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${PACKAGE_NAME}`;
const UPLOAD_API = `https://androidpublisher.googleapis.com/upload/androidpublisher/v3/applications/${PACKAGE_NAME}`;
const TRACKS = ['internal', 'alpha', 'beta', 'production'];
const STATUSES = ['completed', 'draft', 'inProgress', 'halted'];
const MAX_NOTES_CHARS = 500; // Play Console limit per language

function parseArgs(argv) {
  const args = { aab: 'android/app/build/outputs/bundle/release/app-release.aab', status: 'completed', notes: 'versionshinweis.txt', dryRun: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--dry-run') args.dryRun = true;
    else if (a === '--version-code' && i + 1 < argv.length) args.versionCode = Number(argv[++i]);
    else if (a.startsWith('--') && i + 1 < argv.length) args[a.slice(2)] = argv[++i];
    else throw new Error(`Unknown argument: ${a}`);
  }
  if (!TRACKS.includes(args.track)) throw new Error(`--track must be one of ${TRACKS.join(', ')}`);
  if (!STATUSES.includes(args.status)) throw new Error(`--status must be one of ${STATUSES.join(', ')}`);
  if (args.versionCode !== undefined && !Number.isInteger(args.versionCode)) throw new Error('--version-code must be an integer');
  return args;
}

// versionshinweis.txt keeps one <locale>…</locale> block per language.
async function loadReleaseNotes(file) {
  const text = await readFile(file, 'utf8');
  const notes = [];
  for (const m of text.matchAll(/<([a-z]{2}-[A-Z]{2})>\s*([\s\S]*?)\s*<\/\1>/g)) {
    const [, language, body] = m;
    if (body.length > MAX_NOTES_CHARS) {
      throw new Error(`${file}: ${language} release notes are ${body.length} chars; Play allows ${MAX_NOTES_CHARS}`);
    }
    notes.push({ language, text: body });
  }
  if (notes.length === 0) throw new Error(`${file}: no <xx-YY>…</xx-YY> release-note blocks found`);
  return notes;
}

function base64url(input) {
  return Buffer.from(input).toString('base64url');
}

// Service-account OAuth: a self-signed RS256 JWT exchanged for an access token.
async function getAccessToken() {
  const key = JSON.parse(await readFile(KEY_FILE, 'utf8'));
  const now = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claims = base64url(JSON.stringify({ iss: key.client_email, scope: SCOPE, aud: key.token_uri, iat: now, exp: now + 3600 }));
  const signer = createSign('RSA-SHA256');
  signer.update(`${header}.${claims}`);
  const assertion = `${header}.${claims}.${signer.sign(key.private_key, 'base64url')}`;

  const res = await fetch(key.token_uri, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }),
  });
  if (!res.ok) throw new Error(`token exchange failed: ${res.status} ${await res.text()}`);
  return (await res.json()).access_token;
}

async function api(token, method, url, { body, contentType = 'application/json' } = {}) {
  const res = await fetch(url, {
    method,
    headers: { authorization: `Bearer ${token}`, ...(body !== undefined ? { 'content-type': contentType } : {}) },
    body: body === undefined ? undefined : (contentType === 'application/json' ? JSON.stringify(body) : body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${url.replace(API, '').replace(UPLOAD_API, '')} → ${res.status}: ${text}`);
  return text ? JSON.parse(text) : null;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const promoteOnly = args.versionCode !== undefined;
  const aabPath = resolve(args.aab);
  const [aab, notes, appJson] = await Promise.all([
    promoteOnly ? null : readFile(aabPath),
    loadReleaseNotes(args.notes),
    readFile('app.json', 'utf8').then(JSON.parse),
  ]);
  const expectedVersionCode = appJson.expo.android.versionCode;
  const versionName = appJson.expo.version;
  if (promoteOnly && args.versionCode !== expectedVersionCode) {
    throw new Error(`--version-code ${args.versionCode} does not match app.json (${expectedVersionCode}); the release notes/name would belong to a different build`);
  }

  if (promoteOnly) console.log(`Bundle:   (already uploaded) versionCode ${args.versionCode}`);
  else console.log(`Bundle:   ${basename(aabPath)} (${(aab.length / 1024 / 1024).toFixed(1)} MB)`);
  console.log(`Release:  ${versionName} (versionCode ${expectedVersionCode}) → track "${args.track}", status "${args.status}"`);
  console.log(`Notes:    ${notes.map(n => `${n.language} ${n.text.length} chars`).join(', ')}`);
  if (args.dryRun) console.log('Mode:     DRY RUN — the edit is deleted instead of committed');

  const token = await getAccessToken();
  const edit = await api(token, 'POST', `${API}/edits`);
  console.log(`Edit:     ${edit.id}`);

  try {
    let bundle;
    if (promoteOnly) {
      const existing = await api(token, 'GET', `${API}/edits/${edit.id}/bundles`);
      bundle = (existing.bundles || []).find(b => b.versionCode === args.versionCode);
      if (!bundle) throw new Error(`versionCode ${args.versionCode} has not been uploaded to Play yet — run without --version-code to upload the bundle`);
      console.log(`Bundle:   found on Play (sha256 ${bundle.sha256.slice(0, 12)}…)`);
    } else {
      process.stdout.write('Uploading bundle… ');
      bundle = await api(token, 'POST', `${UPLOAD_API}/edits/${edit.id}/bundles?uploadType=media`, { body: aab, contentType: 'application/octet-stream' });
      console.log(`done (versionCode ${bundle.versionCode})`);
      if (bundle.versionCode !== expectedVersionCode) {
        throw new Error(`bundle has versionCode ${bundle.versionCode} but app.json says ${expectedVersionCode} — rebuild or fix app.json before releasing`);
      }
    }

    try {
      await api(token, 'PUT', `${API}/edits/${edit.id}/tracks/${args.track}`, {
        body: { track: args.track, releases: [{ name: versionName, versionCodes: [String(bundle.versionCode)], status: args.status, releaseNotes: notes }] },
      });
    } catch (err) {
      if (args.track === 'production' && /FAILED_PRECONDITION/.test(err.message)) {
        throw new Error(`${err.message}\n\nPlay refuses writes to the production track — for a personal developer account ` +
          `that almost always means production access hasn't been granted yet (Play Console → Dashboard → ` +
          `"Zugriff auf die Produktionsversion beantragen"; Google reviews the request for up to ~7 days). ` +
          `Nothing was changed. Re-run this command once the approval email arrives.`);
      }
      throw err;
    }
    console.log(`Track:    "${args.track}" now points at ${bundle.versionCode}`);

    await api(token, 'POST', `${API}/edits/${edit.id}:validate`);
    console.log('Validate: OK');

    if (args.dryRun) {
      await api(token, 'DELETE', `${API}/edits/${edit.id}`);
      console.log('Dry run complete — edit deleted, nothing published.');
      return;
    }
    await api(token, 'POST', `${API}/edits/${edit.id}:commit`);
    console.log(`Committed. ${versionName} (${bundle.versionCode}) is live on the "${args.track}" track.`);
  } catch (err) {
    await api(token, 'DELETE', `${API}/edits/${edit.id}`).catch(() => { });
    throw err;
  }
}

main().catch(err => {
  console.error(`\nRelease failed: ${err.message}`);
  process.exit(1);
});
