import * as React from 'npm:react@18.3.1'
import { Body, Container, Head, Heading, Html, Preview, Text } from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

interface Props { tribunal?: string; process?: string; deadline?: string; days?: number; oab?: string; content?: string }
const Email = ({ tribunal = '—', process = '—', deadline = '—', days = 0, oab = '—', content = '' }: Props) => (
  <Html lang="pt-BR"><Head /><Preview>Prazo processual crítico — vence {deadline}</Preview>
    <Body style={{ backgroundColor: '#ffffff', fontFamily: 'Arial, sans-serif' }}>
      <Container style={{ maxWidth: '560px', padding: '24px' }}>
        <Heading style={{ color: '#dc2626', fontSize: '16px' }}>⚠️ Prazo processual crítico</Heading>
        <Text><strong>Tribunal:</strong> {tribunal}</Text>
        <Text><strong>Processo:</strong> {process}</Text>
        <Text><strong>Vencimento:</strong> {deadline} ({days} dia(s) útil(eis) restante(s))</Text>
        <Text><strong>OAB:</strong> {oab}</Text>
        <Text>Conteúdo:</Text><Text style={{ whiteSpace: 'pre-wrap' }}>{content}</Text>
        <Text>Acesse o sistema para tratar esta intimação.</Text>
      </Container>
    </Body>
  </Html>
)
export const template = {
  component: Email,
  subject: (data) => `🚨 PRAZO CRÍTICO: ${data.days ?? 0} dia(s) útil(eis) — vence ${data.deadline ?? '—'}`,
  displayName: 'Prazo crítico DJEN',
  previewData: { tribunal: 'TJSP', process: '0000000-00.2026.8.26.0000', deadline: '2026-10-15', days: 2, oab: '290702/SP', content: 'Publicação judicial.' },
} satisfies TemplateEntry