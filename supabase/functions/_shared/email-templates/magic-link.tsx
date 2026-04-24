/// <reference types="npm:@types/react@18.3.1" />

import * as React from 'npm:react@18.3.1'

import {
  Body,
  Container,
  Head,
  Heading,
  Html,
  Preview,
  Section,
  Text,
} from 'npm:@react-email/components@0.0.22'

interface MagicLinkEmailProps {
  siteName: string
  token: string
}

export const MagicLinkEmail = ({
  siteName,
  token,
}: MagicLinkEmailProps) => (
  <Html lang="pt-BR" dir="ltr">
    <Head />
    <Preview>Seu código de acesso {siteName}: {token}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={brand}>WnevesBox</Heading>
        <Heading style={h1}>Seu código de verificação</Heading>
        <Text style={text}>
          Use o código abaixo para concluir o login em <strong>{siteName}</strong>.
          Ele expira em 5 minutos.
        </Text>
        <Section style={codeBox}>
          <Text style={codeStyle}>{token}</Text>
        </Section>
        <Text style={text}>
          Digite este código na tela de verificação do navegador onde você iniciou o login.
        </Text>
        <Text style={footer}>
          Se você não solicitou este código, ignore este email — sua conta permanece segura.
        </Text>
      </Container>
    </Body>
  </Html>
)

export default MagicLinkEmail

const main = { backgroundColor: '#ffffff', fontFamily: 'Arial, sans-serif' }
const container = { padding: '24px 28px', maxWidth: '480px' }
const brand = {
  fontSize: '14px',
  fontWeight: 'bold' as const,
  color: '#2563eb',
  letterSpacing: '0.08em',
  textTransform: 'uppercase' as const,
  margin: '0 0 8px',
}
const h1 = {
  fontSize: '22px',
  fontWeight: 'bold' as const,
  color: '#0f172a',
  margin: '0 0 20px',
}
const text = {
  fontSize: '14px',
  color: '#475569',
  lineHeight: '1.5',
  margin: '0 0 20px',
}
const codeBox = {
  backgroundColor: '#f1f5f9',
  borderRadius: '10px',
  padding: '18px 12px',
  textAlign: 'center' as const,
  margin: '0 0 24px',
}
const codeStyle = {
  fontFamily: 'Courier, monospace',
  fontSize: '32px',
  fontWeight: 'bold' as const,
  color: '#0f172a',
  letterSpacing: '0.35em',
  margin: 0,
}
const footer = { fontSize: '12px', color: '#94a3b8', margin: '24px 0 0' }
