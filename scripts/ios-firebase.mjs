#!/usr/bin/env node
/**
 * iOS AppDelegate への Firebase / プッシュ通知コード自動注入スクリプト
 *
 * 背景:
 *  - @capacitor-firebase/messaging は iOS 側で
 *      1) FirebaseApp.configure() の呼び出し
 *      2) APNs トークンをプラグインへ渡す AppDelegate のハンドラ
 *         (didRegisterForRemoteNotificationsWithDeviceToken など)
 *    の両方が無いと getToken() が永久に解決せず、アプリの
 *    「通知を有効にする」ボタンが「設定中...」のまま固まる。
 *  - ios/ フォルダは Git 管理外で `npm run ios:setup` のたびに再生成される
 *    ため、Xcode での手作業は取り直しすると消えてしまう。
 *    ここで自動注入することで、どのビルドでも同じ状態に保つ。
 *
 * 使い方:
 *   npm run ios:firebase   # 足りない部分だけ追加（何度実行しても安全）
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const APP_DELEGATE = resolve('ios/App/App/AppDelegate.swift')

if (!existsSync(APP_DELEGATE)) {
  console.error(`AppDelegate.swift が見つかりません: ${APP_DELEGATE}`)
  console.error('先に `npm run ios:setup`（または `npx cap add ios`）を実行してください。')
  process.exit(1)
}

let text = readFileSync(APP_DELEGATE, 'utf8')
const original = text

// 1) import FirebaseCore を import Capacitor の直後に追加
if (!text.includes('import FirebaseCore')) {
  if (!text.includes('import Capacitor')) {
    console.error('AppDelegate.swift の形式を認識できませんでした（import Capacitor が見つかりません）。')
    process.exit(1)
  }
  text = text.replace('import Capacitor', 'import Capacitor\nimport FirebaseCore')
}

// 2) didFinishLaunchingWithOptions 内で FirebaseApp.configure() を呼ぶ
if (!text.includes('FirebaseApp.configure()')) {
  const MARKER = '// Override point for customization after application launch.'
  if (text.includes(MARKER)) {
    text = text.replace(MARKER, `${MARKER}\n        FirebaseApp.configure()`)
  } else {
    const re =
      /(func application\(_ application: UIApplication, didFinishLaunchingWithOptions[\s\S]*?)(\n\s*return true)/
    if (!re.test(text)) {
      console.error('didFinishLaunchingWithOptions の挿入位置を特定できませんでした。')
      process.exit(1)
    }
    text = text.replace(re, (_m, head, ret) => `${head}\n        FirebaseApp.configure()${ret}`)
  }
}

// 3) APNs トークン / 通知受信をプラグインへ渡すハンドラ
const handlers = []
if (!text.includes('didRegisterForRemoteNotificationsWithDeviceToken')) {
  handlers.push(`    func application(_ application: UIApplication, didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
        NotificationCenter.default.post(name: .capacitorDidRegisterForRemoteNotifications, object: deviceToken)
    }`)
}
if (!text.includes('didFailToRegisterForRemoteNotificationsWithError')) {
  handlers.push(`    func application(_ application: UIApplication, didFailToRegisterForRemoteNotificationsWithError error: Error) {
        NotificationCenter.default.post(name: .capacitorDidFailToRegisterForRemoteNotifications, object: error)
    }`)
}
if (!text.includes('didReceiveRemoteNotification userInfo')) {
  handlers.push(`    func application(_ application: UIApplication, didReceiveRemoteNotification userInfo: [AnyHashable: Any], fetchCompletionHandler completionHandler: @escaping (UIBackgroundFetchResult) -> Void) {
        NotificationCenter.default.post(name: Notification.Name.init("didReceiveRemoteNotification"), object: completionHandler, userInfo: userInfo)
    }`)
}
if (handlers.length > 0) {
  // AppDelegate クラスの閉じ括弧（ファイル内で最後の "}"）の直前に挿入
  const idx = text.lastIndexOf('}')
  if (idx < 0) {
    console.error('AppDelegate クラスの終わりを特定できませんでした。')
    process.exit(1)
  }
  text = `${text.slice(0, idx).replace(/\s*$/, '')}\n\n${handlers.join('\n\n')}\n}\n`
}

if (text === original) {
  console.log('AppDelegate.swift の Firebase / プッシュ通知設定は既に揃っています。変更はありません。')
  process.exit(0)
}

writeFileSync(APP_DELEGATE, text)
console.log('AppDelegate.swift に Firebase 初期化とプッシュ通知の受け渡し処理を追加しました。')
console.log(`書き出し: ${APP_DELEGATE}`)
