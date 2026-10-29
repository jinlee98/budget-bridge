import type { GoogleWindow } from '../types';
declare const window: GoogleWindow;
export async function loadGoogleScript() {
  if (window.google?.accounts?.oauth2)
    return;
  await new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>('script[src="https://accounts.google.com/gsi/client"]');
    if (existing?.dataset.loaded === 'true') {
      resolve();
      return;
    }
    const script = existing ?? document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.onload = () => {
      script.dataset.loaded = 'true';
      resolve();
    };
    script.onerror = () => reject(new Error('Google sign-in could not be loaded.'));
    if (!existing)
      document.head.appendChild(script);
  });
}
export async function authorizeGoogle(clientId: string, prompt = ''): Promise<string> {
  if (!clientId.trim())
    throw new Error('Google Sheets connection is not configured for this installation. See the README setup instructions.');
  await loadGoogleScript();
  return new Promise((resolve, reject) => {
    const google = window.google;
    if (!google?.accounts?.oauth2) {
      reject(new Error('Google sign-in did not finish loading. Try again.'));
      return;
    }
    const tokenClient = google.accounts.oauth2.initTokenClient({
      client_id: clientId.trim(),
      scope: 'https://www.googleapis.com/auth/spreadsheets',
      callback: (response) => {
        if (response.error === 'invalid_client') {
          reject(new Error('Google rejected this OAuth client. Add this exact origin to its Authorized JavaScript origins: ' + window.location.origin));
          return;
        }
        if (response.error || !response.access_token) {
          reject(new Error('Google authorization was not completed' + (response.error ? ' (' + response.error + ').' : '.')));
          return;
        }
        resolve(response.access_token);
      },
    });
    tokenClient.requestAccessToken({ prompt });
  });
}
export async function sheetsRequest(path: string, token: string, init: RequestInit = {}) {
  const response = await fetch('https://sheets.googleapis.com/v4/' + path, {
    ...init,
    headers: {
      Authorization: 'Bearer ' + token,
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    const message = body?.error?.message ?? 'Google Sheets request failed (' + response.status + ').';
    throw new Error(message);
  }
  return response.status === 204 ? null : response.json();
}
