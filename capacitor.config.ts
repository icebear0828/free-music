import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.yutao.music',
  appName: 'Music',
  webDir: 'dist',
  // The bundled client talks to the Express backend over the LAN; the address is
  // configured in-app (设置 → 服务器地址) and stored in localStorage.
  server: {
    androidScheme: 'http',
    cleartext: true,
  },
  android: {
    allowMixedContent: true,
  },
  ios: {
    contentInset: 'always',
  },
  plugins: {
    StatusBar: {
      style: 'DEFAULT',
      overlaysWebView: false,
    },
  },
};

export default config;
