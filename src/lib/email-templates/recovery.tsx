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

interface RecoveryEmailProps {
  siteName: string
  confirmationUrl: string
}

export const RecoveryEmail = ({ siteName, confirmationUrl }: RecoveryEmailProps) => (
  <Html lang="es" dir="ltr">
    <Head />
    <Preview>Restablece tu contraseña de {siteName}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Text style={brand}>{siteName}</Text>
        <Heading style={h1}>Restablece tu contraseña</Heading>
        <Text style={text}>
          Hemos recibido una solicitud para cambiar la contraseña de tu cuenta en {siteName}.
        </Text>
        <Button style={button} href={confirmationUrl}>
          Cambiar contraseña
        </Button>
        <Text style={footer}>
          Si no has solicitado el cambio, puedes ignorar este mensaje: tu contraseña no cambiará.
        </Text>
      </Container>
    </Body>
  </Html>
)

export default RecoveryEmail
