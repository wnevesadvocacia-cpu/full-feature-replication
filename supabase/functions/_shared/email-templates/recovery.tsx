/// <reference types="npm:@types/react@18.3.1" />

import * as React from 'npm:react@18.3.1'

import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Html,
  Preview,
  Text,
} from 'npm:@react-email/components@0.0.22'

interface RecoveryEmailProps {
  siteName: string
  confirmationUrl: string
}

export const RecoveryEmail = ({
  siteName,
  confirmationUrl,
}: RecoveryEmailProps) => (
  <Html lang="pt-BR" dir="ltr">
    <Head />
    <Preview>Redefina sua senha do {siteName}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>Redefinir senha — {siteName}</Heading>
        <Text style={text}>
          Recebemos uma solicitação para redefinir sua senha no <strong>{siteName}</strong>.
          Clique no botão abaixo para criar uma nova senha. O link expira em 1 hora.
        </Text>
        <Button style={button} href={confirmationUrl}>
          Redefinir minha senha
        </Button>
        <Text style={text}>
          Se o botão não funcionar, copie e cole este link no navegador:
          <br />
          <a href={confirmationUrl} style={link}>{confirmationUrl}</a>
        </Text>
        <Text style={footer}>
          Se você não solicitou a redefinição, ignore este e-mail — sua senha
          permanecerá a mesma.
        </Text>
        <Text style={footer}>
          Dúvidas? Responda este e-mail ou escreva para <strong>wnevesadvocacia@gmail.com</strong> (alternativo: wneves2006@yahoo.com.br).
        </Text>
        <Text style={footer}>© {siteName} — wnevesbox.com</Text>
      </Container>
    </Body>
  </Html>
)

export default RecoveryEmail

const main = { backgroundColor: '#ffffff', fontFamily: 'Arial, sans-serif' }
const container = { padding: '20px 25px' }
const h1 = { fontSize: '22px', fontWeight: 'bold' as const, color: '#0f172a', margin: '0 0 20px' }
const text = { fontSize: '14px', color: '#334155', lineHeight: '1.5', margin: '0 0 20px' }
const link = { color: '#2563eb', wordBreak: 'break-all' as const }
const button = {
  backgroundColor: '#2563eb',
  color: '#ffffff',
  fontSize: '14px',
  borderRadius: '8px',
  padding: '12px 20px',
  textDecoration: 'none',
}
const footer = { fontSize: '12px', color: '#94a3b8', margin: '20px 0 0' }
