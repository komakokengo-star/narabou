#!/usr/bin/env node
/**
 * iOS プッシュ通知の権限（aps-environment）を Debug / Release の両方に自動設定する。
 *
 * 背景:
 *  - Xcode の Push Notifications を Release だけに付けると、▶︎（Debug）で起動した
 *    アプリには aps-environment が入らず、registerForRemoteNotifications が
 *    「no valid aps-environment entitlement」で失敗する。
 *  - ios/ は Git 管理外で再生成されるため、Xcode の手作業は消える。ここで毎回揃える。
 *  - App Store 用に書き出すと Xcode が自動で production に置き換えるため、
 *    ファイル上は development のままでよい。
 *
 * 使い方: npm run ios:entitlements（何度実行しても安全）
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'

const PBXPROJ = resolve('ios/App/App.xcodeproj/project.pbxproj')
if (!existsSync(PBXPROJ)) {
  console.error(`project.pbxproj が見つかりません: ${PBXPROJ}`)
  console.error('先に `npm run ios:setup`（または `npx cap add ios`）を実行してください。')
  process.exit(1)
}

let pbx = readFileSync(PBXPROJ, 'utf8')
const original = pbx

// 既にどこかの構成で指定されていればそのパスを使い回す（Xcode が作ったファイルを活かす）
const existing = pbx.match(/CODE_SIGN_ENTITLEMENTS = "?([^";\n]+)"?;/)
const entPath = existing ? existing[1].trim() : 'App/App.entitlements'

// App ターゲットの全ビルド構成（INFOPLIST_FILE = App/Info.plist を含むもの）に設定
pbx = pbx.replace(/buildSettings = \{[^{}]*\};/g, (block) => {
  if (!/INFOPLIST_FILE = "?App\/Info\.plist"?;/.test(block)) return block
  if (/CODE_SIGN_ENTITLEMENTS = /.test(block)) {
    return block.replace(/CODE_SIGN_ENTITLEMENTS = [^;\n]+;/, `CODE_SIGN_ENTITLEMENTS = ${entPath};`)
  }
  return block.replace('buildSettings = {', `buildSettings = {\n\t\t\t\tCODE_SIGN_ENTITLEMENTS = ${entPath};`)
})

if (pbx !== original) {
  writeFileSync(PBXPROJ, pbx)
  console.log(`Debug / Release の両方にプッシュ通知の権限ファイル（${entPath}）を設定しました。`)
} else {
  console.log('プッシュ通知の権限ファイルは Debug / Release とも設定済みです。')
}

// 権限ファイル本体に aps-environment を入れる
const ENT_FILE = resolve(dirname(PBXPROJ), '..', entPath)
let plist = existsSync(ENT_FILE)
  ? readFileSync(ENT_FILE, 'utf8')
  : `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
</dict>
</plist>
`
if (!plist.includes('aps-environment')) {
  plist = plist.replace(/<dict\/>|<dict>/, '<dict>\n\t<key>aps-environment</key>\n\t<string>development</string>')
  if (!plist.includes('</dict>')) plist = plist.replace('</plist>', '</dict>\n</plist>')
  writeFileSync(ENT_FILE, plist)
  console.log(`権限ファイルに aps-environment を追加しました: ${ENT_FILE}`)
} else {
  console.log('権限ファイルには aps-environment が既にあります。')
}
