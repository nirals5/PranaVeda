// Google Identity Services, token model: sign-in happens entirely in the
// browser and yields a short-lived access token (about an hour, no refresh
// token), so nothing has to be stored on a server. Shared by the calendar and
// Google Health connectors, each asking only for its own read-only scope.

export const GOOGLE_CLIENT_ID = (import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined) || '';

export interface GoogleToken {
  token: string;
  expiresAt: number;
}

let gisLoading: Promise<void> | null = null;
export function loadGoogleIdentity(): Promise<void> {
  if ((window as any).google?.accounts?.oauth2) return Promise.resolve();
  gisLoading ??= new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => {
      gisLoading = null;
      reject(new Error('Google sign-in could not be loaded.'));
    };
    document.head.appendChild(script);
  });
  return gisLoading;
}

// Must be called from a click: it opens Google's consent popup.
export async function requestGoogleToken(scope: string): Promise<GoogleToken> {
  await loadGoogleIdentity();
  return new Promise<GoogleToken>((resolve, reject) => {
    const client = (window as any).google.accounts.oauth2.initTokenClient({
      client_id: GOOGLE_CLIENT_ID,
      scope,
      callback: (response: any) => {
        if (response?.access_token) {
          resolve({ token: response.access_token, expiresAt: Date.now() + (Number(response.expires_in) || 3600) * 1000 });
        } else {
          reject(new Error('Google did not grant access.'));
        }
      },
      error_callback: () => reject(new Error('Google sign-in was closed before it finished.')),
    });
    client.requestAccessToken();
  });
}

export function revokeGoogleToken(token: string) {
  (window as any).google?.accounts?.oauth2?.revoke?.(token);
}
