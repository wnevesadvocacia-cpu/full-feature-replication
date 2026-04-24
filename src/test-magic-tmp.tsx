import * as React from 'react';
import { render } from '@react-email/render';
import {
  Body, Container, Head, Heading, Html, Preview, Section, Text,
} from '@react-email/components';

const MagicLinkEmail = ({ siteName, token }: any) => (
  <Html lang="pt-BR" dir="ltr">
    <Head />
    <Preview>Seu código de acesso {siteName}: {token}</Preview>
    <Body>
      <Container>
        <Heading>WnevesBox</Heading>
        <Heading>Seu código de verificação</Heading>
        <Text>Use o código abaixo para concluir o login em <strong>{siteName}</strong>. Ele expira em 5 minutos.</Text>
        <Section><Text>{token}</Text></Section>
        <Text>Digite este código na tela de verificação.</Text>
        <Text>Se você não solicitou este código, ignore este email.</Text>
      </Container>
    </Body>
  </Html>
);

const html = await render(React.createElement(MagicLinkEmail, { siteName: 'WnevesBox', token: '12345678' }));
console.log(html);
console.log('---HAS_TOKEN:', html.includes('12345678'));
console.log('---HAS_LINK_BUTTON:', html.includes('Log In') || html.toLowerCase().includes('href='));
