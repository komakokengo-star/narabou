import type { CapacitorConfig } from '@capacitor/cli';

/**
 * NARABOU iOS wrapper (Capacitor).
 *
 * 方式: 公開サイト (https://app.narabou.jp) をアプリ内で表示する「ライブ配信型」。
 * Web 側を更新すれば、App Store への再申請なしでアプリの中身も更新されます。
 */
const config: CapacitorConfig = {
  appId: 'jp.narabou.app',
  appName: 'NARABOU',
  // server.url を使うためビルド成果物は同梱しないが、webDir は必須なのでフォールバックを指す
  webDir: 'native/www',
  server: {
    url: 'https://app.narabou.jp',
    hostname: 'app.narabou.jp',
    androidScheme: 'https',
    iosScheme: 'https',
    cleartext: false,
    // アプリ内 WebView から離脱せずに開いてよいドメイン
    allowNavigation: [
      'app.narabou.jp',
      '*.narabou.jp',
      '*.supabase.co',
      'js.stripe.com',
      '*.stripe.com',
      'checkout.stripe.com',
      'connect.stripe.com',
      'accounts.google.com',
      '*.googleapis.com',
      '*.gstatic.com',
      'maps.google.com',
    ],
  },
  ios: {
    contentInset: 'always',
    limitsNavigationsToAppBoundDomains: false,
    backgroundColor: '#ffffff',
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 1200,
      backgroundColor: '#ffffff',
      showSpinner: false,
    },
    PushNotifications: {
      presentationOptions: ['badge', 'sound', 'alert'],
    },
  },
};

export default config;
