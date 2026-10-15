#!/usr/bin/env node
/**
 * iOS AppDelegate への Firebase 初期化コード自動注入スクリプト
 *
 * 背景:
 *  - @capacitor-firebase/messaging は iOS 側で FirebaseApp.configure() が
 *    呼ばれていないと getToken() が永久に解決せず、アプリの
 *    「通知を有効にする」ボタンが「設定中...」のまま固まる。
 *  - ios/ フォルダは Git 管理外で `npm run ios:setup` のたびに再生成される
 *    ため、Xcode での手作業は取り直しすると消えてしまう。
 *    ここで自動注入することで、どのビルドでも同じ状態に保つ。
 *
 * 使い方:
 *   npm run ios:firebase   # 無ければ追加（既にあれば何もしない）
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

if (text.includes('FirebaseApp.configure()')) {
  console.log('FirebaseApp.configure() は既に設定済みです。変更はありません。')
  process.exit(0)
}

// 1) import FirebaseCore を import Capacitor の直後に追加
if (!text.includes('import FirebaseCore')) {
  if (!text.includes('import Capacitor')) {
    console.error('AppDelegate.swift の形式を認識できませんでした（import Capacitor が見つかりません）。')
    process.exit(1)
  }
  text = text.replace('import Capacitor', 'import Capacitor\nimport FirebaseCore')
}

// 2) didFinishLaunchingWithOptions 内で FirebaseApp.configure() を呼ぶ
//    ストックの AppDelegate には目印コメントがあるので優先的に使う。
const MARKER = '// Override point for customization after application launch.'
if (text.includes(MARKER)) {
  text = text.replace(MARKER, `${MARKER}\n        FirebaseApp.configure()`)
} else {
  // コメントが無い場合は didFinishLaunchingWithOptions 内の最初の return true の直前に挿入
  const re =
    /(func application\(_ application: UIApplication, didFinishLaunchingWithOptions[\s\S]*?)(\n\s*return true)/
  if (!re.test(text)) {
    console.error('didFinishLaunchingWithOptions の挿入位置を特定できませんでした。')
    process.exit(1)
  }
  text = text.replace(re, (_m, head, ret) => `${head}\n        FirebaseApp.configure()${ret}`)
}

writeFileSync(APP_DELEGATE, text)
console.log('AppDelegate.swift に FirebaseApp.configure() を追加しました。')
console.log(`書き出し: ${APP_DELEGATE}`)
