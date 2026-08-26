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

interface InviteEmailProps {
  siteName: string
  siteUrl: string
  confirmationUrl: string
}

export const InviteEmail = ({ siteName, confirmationUrl }: InviteEmailProps) => (
  <Html lang="es" dir="ltr">
    <Head />
    <Preview>Tu invitación a {siteName}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Text style={brand}>{siteName}</Text>
        <Heading style={h1}>Te han invitado</Heading>
        <Text style={text}>
          Te hemos dado acceso al portal de reservas de {siteName}. Completa tu registro para
          empezar a reservar tus sesiones.
        </Text>
        <Button style={button} href={confirmationUrl}>
          Aceptar invitación
        </Button>
        <Text style={footer}>Si no esperabas esta invitación, puedes ignorar este mensaje.</Text>
      </Container>
    </Body>
  </Html>
)

export default InviteEmail
