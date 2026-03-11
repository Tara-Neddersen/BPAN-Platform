import type { CapacitorConfig } from '@capacitor/cli';

const serverUrl = process.env.CAP_SERVER_URL || 'https://lablynk.vercel.app';
const allowedHost = (() => {
  try {
    return new URL(serverUrl).host;
  } catch {
    return null;
  }
})();

const config: CapacitorConfig = {
  appId: 'com.lablynk.app',
  appName: 'LabLynk',
  webDir: 'public',
  server: {
    url: serverUrl,
    cleartext: false,
    allowNavigation: allowedHost ? [allowedHost] : [],
  },
  ios: {
    contentInset: 'automatic',
  },
};

export default config;
