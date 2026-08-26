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

import { brand, button, container, footer, h1, main, text } from './styles'

interface EmailChangeEmailProps {
  siteName: string
  oldEmail: string
  email: string
  newEmail: string
  confirmationUrl: string
}

export const EmailChangeEmail = ({
  siteName,
  oldEmail,
  newEmail,
  confirmationUrl,
}: EmailChangeEmailProps) => (
  <Html lang="es" dir="ltr">
    <Head />
    <Preview>Confirma tu nuevo correo en {siteName}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Text style={brand}>{siteName}</Text>
        <Heading style={h1}>Confirma tu nuevo correo</Heading>
        <Text style={text}>
          Has solicitado cambiar el correo de tu cuenta{oldEmail ? ` (${oldEmail})` : ''}
          {newEmail ? ` por ${newEmail}` : ''}. Confirma el cambio para completarlo.
        </Text>
        <Button style={button} href={confirmationUrl}>
          Confirmar cambio
        </Button>
        <Text style={footer}>Si no has solicitado este cambio, ignora este mensaje.</Text>
      </Container>
    </Body>
  </Html>
)

export default EmailChangeEmail
