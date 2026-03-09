import type { CapacitorConfig } from '@capacitor/cli';

const serverUrl = process.env.CAP_SERVER_URL || 'https://bpan-platform.vercel.app';
const allowedHost = (() => {
  try {
    return new URL(serverUrl).host;
  } catch {
    return null;
  }
})();

const config: CapacitorConfig = {
  appId: 'com.bpan.platform',
  appName: 'BPAN Platform',
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
