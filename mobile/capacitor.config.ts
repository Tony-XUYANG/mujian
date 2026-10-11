import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.mujian.storyapp',
  appName: '幕间',
  webDir: 'www',
  server: {
    // Keep the APK connected to the deployed HTTPS app so API, uploads, and
    // service-worker behavior remain on the same origin as the web release.
    url: 'https://anthapjdimpo.sealosbja.site',
    cleartext: false,
    allowNavigation: ['anthapjdimpo.sealosbja.site'],
  },
  android: {
    allowMixedContent: false,
  },
};

export default config;
