// Android 用 Firebase 設定スクリプト（ios-firebase.mjs の Android 版）。
// android/ は gitignore されており `npm run android:setup` で再生成されるため、
// google-services.json の配置と Gradle プラグイン適用は必ずこのスクリプト経由で行う。
//
// 前提: Firebase Console で Android アプリ (jp.narabou.app) を登録し、
// ダウンロードした google-services.json を native/google-services.json として保存しておく。
import { existsSync, copyFileSync, readFileSync, writeFileSync } from "node:fs";

const ROOT = new URL("..", import.meta.url).pathname;
const SRC_JSON = `${ROOT}native/google-services.json`;
const APP_DIR = `${ROOT}android/app`;

if (!existsSync(APP_DIR)) {
  console.error("[android-firebase] android/app がありません。先に `cap add android` を実行してください。");
  process.exit(1);
}
if (!existsSync(SRC_JSON)) {
  console.error("[android-firebase] native/google-services.json がありません。");
  console.error("  Firebase Console → プロジェクト設定 → Android アプリ (jp.narabou.app) から");
  console.error("  google-services.json をダウンロードし、native/google-services.json として保存してください。");
  process.exit(1);
}

// 1. google-services.json を android/app/ に配置
copyFileSync(SRC_JSON, `${APP_DIR}/google-services.json`);
console.log("[android-firebase] google-services.json を android/app/ に配置しました");

// 2. プロジェクト側 build.gradle に Google Services プラグインの classpath を追加
const projGradlePath = `${ROOT}android/build.gradle`;
let projGradle = readFileSync(projGradlePath, "utf8");
if (!projGradle.includes("com.google.gms:google-services")) {
  if (!projGradle.includes("classpath")) {
    console.error("[android-firebase] android/build.gradle に classpath ブロックが見つかりません");
    process.exit(1);
  }
  projGradle = projGradle.replace(
    /(dependencies\s*\{)/,
    `$1\n        classpath 'com.google.gms:google-services:4.4.2'`,
  );
  writeFileSync(projGradlePath, projGradle);
  console.log("[android-firebase] android/build.gradle に google-services classpath を追加しました");
}

// 3. アプリ側 build.gradle にプラグイン適用
const appGradlePath = `${APP_DIR}/build.gradle`;
let appGradle = readFileSync(appGradlePath, "utf8");
if (!appGradle.includes("com.google.gms.google-services")) {
  appGradle = appGradle.replace(
    /apply plugin: 'com\.android\.application'/,
    `apply plugin: 'com.android.application'\napply plugin: 'com.google.gms.google-services'`,
  );
  if (!appGradle.includes("com.google.gms.google-services")) {
    console.error("[android-firebase] android/app/build.gradle に apply plugin 行を追加できませんでした");
    process.exit(1);
  }
  writeFileSync(appGradlePath, appGradle);
  console.log("[android-firebase] android/app/build.gradle に google-services プラグインを適用しました");
}

console.log("[android-firebase] 完了");
