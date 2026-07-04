import * as React from 'react'

import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Html,
  Link,
  Preview,
  Text,
} from '@react-email/components'

interface InviteEmailProps {
  siteName: string
  siteUrl: string
  confirmationUrl: string
}

export const InviteEmail = ({
  siteName,
  siteUrl,
  confirmationUrl,
}: InviteEmailProps) => (
  <Html lang="ja" dir="ltr">
    <Head />
    <Preview>{siteName} への招待が届いています</Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>招待が届いています</Heading>
        <Text style={text}>
          {' '}
          <Link href={siteUrl} style={link}>
            <strong>{siteName}</strong>
          </Link>
          に招待されています。下のボタンから招待を承認し、アカウントを作成してください。
        </Text>
        <Button style={button} href={confirmationUrl}>
          招待を承認する
        </Button>
        <Text style={footer}>
          このメールに心当たりがない場合は、破棄してください。
        </Text>
      </Container>
    </Body>
  </Html>
)

export default InviteEmail

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
const link = { color: 'inherit', textDecoration: 'underline' }
const button = {
  backgroundColor: '#000000',
  color: '#ffffff',
  fontSize: '14px',
  borderRadius: '8px',
  padding: '12px 20px',
  textDecoration: 'none',
}
const footer = { fontSize: '12px', color: '#999999', margin: '30px 0 0' }
