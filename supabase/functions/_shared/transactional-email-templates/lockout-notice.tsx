import * as React from 'npm:react@18.3.1'
import { Body, Container, Head, Heading, Html, Preview, Text } from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

const Email = () => (
  <Html lang="pt-BR"><Head /><Preview>Conta bloqueada temporariamente</Preview>
    <Body style={{ backgroundColor: '#ffffff', fontFamily: 'Arial, sans-serif' }}>
      <Container style={{ maxWidth: '480px', padding: '32px' }}>
        <Heading style={{ color: '#7c2d12', fontSize: '18px' }}>⚠ Conta bloqueada temporariamente</Heading>
        <Text>Detectamos múltiplas tentativas inválidas de login na sua conta. Por segurança, bloqueamos novas tentativas pelos próximos <strong>15 minutos</strong>.</Text>
        <Text>Se não foi você, recomendamos monitorar acessos suspeitos.</Text>
        <Text>WnevesBox · Notificação automática de segurança.</Text>
      </Container>
    </Body>
  </Html>
)

export const template = { component: Email, subject: 'Conta bloqueada temporariamente', displayName: 'Bloqueio temporário' } satisfies TemplateEntry