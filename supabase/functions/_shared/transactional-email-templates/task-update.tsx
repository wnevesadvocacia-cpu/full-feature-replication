import * as React from 'npm:react@18.3.1'
import { Body, Button, Container, Head, Heading, Html, Text } from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

const Email = ({ title, assignee, due, processNumber, copy }: Record<string, any>) => (
  <Html lang="pt-BR"><Head /><Body style={{ backgroundColor: '#ffffff', fontFamily: 'Arial, sans-serif' }}>
    <Container style={{ padding: '24px', maxWidth: '560px' }}>
      <Heading>{copy ? 'Cópia de prazo cadastrado ou atualizado' : 'Prazo atribuído a você'}</Heading>
      <Text>Título: {title}</Text><Text>Responsável: {assignee}</Text><Text>Vencimento: {due}</Text>
      {processNumber && <Text>Processo: {processNumber}</Text>}
      <Button href="https://wnevesbox.com/#/tarefas">Abrir prazo no WnevesBox</Button>
    </Container>
  </Body></Html>
)
export const template = { component: Email, subject: 'WnevesBox — Notificação de prazo', displayName: 'Notificação de prazo' } satisfies TemplateEntry