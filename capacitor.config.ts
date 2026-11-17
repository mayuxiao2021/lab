import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.rhinelab.rlos',
  appName: 'Rhine Lab R.L.OS',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
    cleartext: true,
  },
  android: {
    allowMixedContent: true,
    backgroundColor: '#15171A',
  },
};

export default config;
