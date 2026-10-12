#!/usr/bin/env node
/**
 * iOS プライバシー説明文（purpose string）の自動注入スクリプト
 *
 * 背景:
 *  - Firebase などの SDK をアプリにリンクすると、アプリ自体が位置情報を
 *    使わなくても Apple は Info.plist への目的文言を要求する
 *    （アップロード時の警告 ITMS-90683）。
 *  - ios/ フォルダは Git 管理外で `npm run ios:setup` のたびに再生成される
 *    ため、Xcode での手作業は取り直しすると消えてしまう。
 *    ここで自動注入することで、どのビルドでも同じ状態に保つ。
 *
 * 使い方:
 *   npm run ios:privacy              # 無い物だけ追加（既存の値は変更しない）
 *   npm run ios:privacy -- --force   # 既存の値も下の文言で上書き
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const PLIST = resolve('ios/App/App/Info.plist')
const FORCE = process.argv.includes('--force')

/**
 * App Store 提出時に要求される説明文。
 * 値はユーザーに表示される文章なので、日本語で具体的に書く。
 */
const PURPOSES = {
  NSLocationWhenInUseUsageDescription:
    '現地到着の報告と、依頼場所までの距離確認のために現在地を使用します。',
  // アプリ側で「常時」の位置情報を要求することはないが、
  // 同梱SDKがAPIを参照するため Apple の自動チェックに必須。
  NSLocationAlwaysAndWhenInUseUsageDescription:
    'NARABOUが常に位置情報を取得することはありません。同梱するSDKの仕様上、App Store提出に必要な記載として追加しています。',
  NSCameraUsageDescription:
    '並び状況の写真を撮影して報告するためにカメラを使用します。',
  NSPhotoLibraryUsageDescription:
    '報告用の写真を選択するために写真へアクセスします。',
  NSPhotoLibraryAdditionsUsageDescription:
    '撮影した報告写真を保存するために写真へアクセスします。',
}

const esc = (s) =>
  s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')

if (!existsSync(PLIST)) {
  console.error(`Info.plist が見つかりません: ${PLIST}`)
  console.error('先に `npm run ios:setup`（または `npx cap add ios`）を実行してください。')
  process.exit(1)
}

let text = readFileSync(PLIST, 'utf8')
const added = []
const updated = []
const kept = []

for (const [key, value] of Object.entries(PURPOSES)) {
  const keyTag = `<key>${key}</key>`
  if (text.includes(keyTag)) {
    if (!FORCE) {
      kept.push(key)
      continue
    }
    const re = new RegExp(
      `(<key>${key}<\\/key>\\s*<string>)[\\s\\S]*?(<\\/string>)`,
    )
    if (re.test(text)) {
      text = text.replace(re, (_m, a, b) => `${a}${esc(value)}${b}`)
      updated.push(key)
      continue
    }
  }
  added.push(key)
}

if (added.length) {
  // トップレベル <dict> の閉じタグ（= </plist> 直前の </dict>）の直前に挿入する。
  const close = text.lastIndexOf('</dict>')
  if (close === -1) {
    console.error('Info.plist の形式を認識できませんでした（</dict> が見つかりません）。')
    process.exit(1)
  }
  const indent = '\t'
  const block = added
    .map((k) => `${indent}<key>${k}</key>\n${indent}<string>${esc(PURPOSES[k])}</string>\n`)
    .join('')
  text = text.slice(0, close) + block + text.slice(close)
}

writeFileSync(PLIST, text)

const report = (label, list) => {
  if (list.length) console.log(`${label}: ${list.join(', ')}`)
}
report('追加した項目', added)
report('上書きした項目', updated)
report('既存を維持した項目', kept)
if (!added.length && !updated.length) console.log('変更はありません（すべて設定済み）。')
console.log(`書き出し: ${PLIST}`)
