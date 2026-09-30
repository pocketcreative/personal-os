// One-time OAuth 2.0 authorization for Brendan's own YouTube channel, so
// Personal OS can later pull real Thumbnail CTR and Average Percentage
// Viewed numbers for LF videos via the YouTube Analytics API + YouTube Data
// API v3.
//
// Reads the Desktop-app OAuth client already created in the
// "Pocket Creative YT Analytics" GCP project (inspiring-bonus-510106-j2)
// from .google-youtube-analytics-client-secret.json, runs the real Google
// "installed app" authorization flow (opens the consent screen, catches the
// callback on a local loopback server, exchanges the code for tokens), and
// saves the refresh token to .google-youtube-analytics-tokens.json.
//
// Run once:
//   node scripts/youtube-analytics-auth.mjs
//
// It prints a real Google authorization URL and also tries to open it in
// the default browser (macOS `open`). Brendan needs to open that URL (or
// let it auto-open), sign in as the YouTube channel owner, and click
// Allow. After that, this script exchanges the code for tokens itself and
// exits -- nothing further to run. The saved refresh token does not
// expire on its own, so this does not need to be repeated unless the
// token file is deleted or the app's access is revoked in
// https://myaccount.google.com/permissions.
//
// Safe to re-run: overwrites .google-youtube-analytics-tokens.json with a
// fresh token if run again.

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:http';
import { exec } from 'node:child_process';
import path from 'node:path';
import { google } from 'googleapis';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.join(__dirname, '..');
const CLIENT_SECRET_PATH = path.join(PROJECT_ROOT, '.google-youtube-analytics-client-secret.json');
const TOKENS_PATH = path.join(PROJECT_ROOT, '.google-youtube-analytics-tokens.json');

const SCOPES = [
  'https://www.googleapis.com/auth/yt-analytics.readonly',
  'https://www.googleapis.com/auth/youtube.readonly',
];

const CALLBACK_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes to click Allow

function loadClientSecret() {
  let raw;
  try {
    raw = readFileSync(CLIENT_SECRET_PATH, 'utf8');
  } catch {
    throw new Error(`Client secret not found at ${CLIENT_SECRET_PATH}. It should already exist -- see the GCP setup this script assumes.`);
  }
  const parsed = JSON.parse(raw);
  const creds = parsed.installed ?? parsed.web;
  if (!creds) throw new Error(`${CLIENT_SECRET_PATH} doesn't look like a Desktop/installed-app OAuth client (no "installed" key).`);
  return creds;
}

function openInBrowser(url) {
  // Best-effort only. If this fails (headless session, no default browser
  // set, etc.) the printed URL below is the fallback -- not an error.
  exec(`open ${JSON.stringify(url)}`, () => {});
}

async function main() {
  const { client_id, client_secret } = loadClientSecret();

  // Desktop-app OAuth clients accept any port on the loopback redirect
  // (the registered redirect_uri is just "http://localhost"), so start the
  // callback server first and build the actual redirect_uri from whatever
  // port the OS hands out.
  const { server, port } = await new Promise((resolve, reject) => {
    const srv = createServer();
    srv.on('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      resolve({ server: srv, port: srv.address().port });
    });
  });

  const redirectUri = `http://127.0.0.1:${port}`;
  const oAuth2Client = new google.auth.OAuth2(client_id, client_secret, redirectUri);

  const authUrl = oAuth2Client.generateAuthUrl({
    access_type: 'offline', // required to get a refresh_token back
    prompt: 'consent',      // force the consent screen so a refresh_token is issued even on a repeat auth
    scope: SCOPES,
  });

  console.log('\nOpen this URL and sign in as the YouTube channel owner, then click Allow:\n');
  console.log(authUrl);
  console.log(`\nWaiting for the redirect on ${redirectUri} (up to 5 minutes)...\n`);
  openInBrowser(authUrl);

  const code = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      server.close();
      reject(new Error('Timed out waiting for the Google authorization callback (5 minutes). Run the script again.'));
    }, CALLBACK_TIMEOUT_MS);

    server.on('request', (req, res) => {
      const url = new URL(req.url, redirectUri);
      const err = url.searchParams.get('error');
      const authCode = url.searchParams.get('code');

      if (err) {
        res.writeHead(400, { 'Content-Type': 'text/html' });
        res.end(`<html><body>Authorization failed: ${err}. You can close this tab.</body></html>`);
        clearTimeout(timer);
        server.close();
        reject(new Error(`Google returned an error: ${err}`));
        return;
      }
      if (!authCode) {
        res.writeHead(400, { 'Content-Type': 'text/html' });
        res.end('<html><body>No authorization code in the callback. You can close this tab.</body></html>');
        return; // keep waiting, this wasn't the real callback request (e.g. favicon.ico)
      }

      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end('<html><body>Authorization complete. You can close this tab and go back to the terminal.</body></html>');
      clearTimeout(timer);
      server.close();
      resolve(authCode);
    });
  });

  const { tokens } = await oAuth2Client.getToken(code);
  if (!tokens.refresh_token) {
    throw new Error('Google did not return a refresh_token. Revoke this app\'s access at https://myaccount.google.com/permissions and run this script again so a fresh consent is forced.');
  }

  writeFileSync(TOKENS_PATH, JSON.stringify(tokens, null, 2), { mode: 0o600 });
  console.log(`Saved tokens (including refresh_token) to ${TOKENS_PATH}.`);
  console.log('Done -- this does not need to be run again unless that file is deleted or access is revoked.');
}

main().catch((e) => {
  console.error('\nAuthorization failed:', e.message);
  process.exit(1);
});
