import * as React from 'react'

import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Html,
  Preview,
  Text,
} from '@react-email/components'

interface RecoveryEmailProps {
  siteName: string
  confirmationUrl: string
}

const PUBLIC_APP_URL = 'https://narabou.lovable.app'
const PASSWORD_FORGOT_URL = `${PUBLIC_APP_URL}/auth/forgot`

function getRecoveryButtonUrl(confirmationUrl: string) {
  try {
    const url = new URL(confirmationUrl)
    const hasResetToken =
      url.searchParams.has('token') ||
      url.searchParams.has('token_hash') ||
      url.hash.includes('access_token=') ||
      url.hash.includes('refresh_token=')

    // Test emails from the dashboard use a placeholder URL without a recovery token.
    // Send those to the Japanese forgot-password page instead of the preview TOP page.
    return hasResetToken ? confirmationUrl : PASSWORD_FORGOT_URL
  } catch {
    return PASSWORD_FORGOT_URL
  }
}

export const RecoveryEmail = ({
  siteName,
  confirmationUrl,
}: RecoveryEmailProps) => {
  const buttonUrl = getRecoveryButtonUrl(confirmationUrl)

  return (
  <Html lang="ja" dir="ltr">
    <Head />
    <Preview>{siteName} のパスワード再設定</Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>パスワード再設定</Heading>
        <Text style={text}>
          {siteName} のパスワード再設定リクエストを受け付けました。下のボタンから新しいパスワードを設定してください。
        </Text>
        <Button style={button} href={buttonUrl}>
          パスワードを再設定する
        </Button>
        <Text style={footer}>
          このメールに心当たりがない場合は、破棄してください。パスワードは変更されません。
        </Text>
      </Container>
    </Body>
  </Html>
  )
}

export default RecoveryEmail

const main = { backgroundColor: '#ffffff', fontFamily: 'Arial, sans-serif' }
const container = { padding: '20px 25px' }
const h1 = {
  fontSize: '22px',
  fontWeight: 'bold' as const,
  color: '#000000',
  margin: '0 0 20px',
}
const text = {
  fontSize: '14px',
  color: '#55575d',
  lineHeight: '1.5',
  margin: '0 0 25px',
}
const button = {
  backgroundColor: '#000000',
  color: '#ffffff',
  fontSize: '14px',
  borderRadius: '8px',
  padding: '12px 20px',
  textDecoration: 'none',
}
const footer = { fontSize: '12px', color: '#999999', margin: '30px 0 0' }
