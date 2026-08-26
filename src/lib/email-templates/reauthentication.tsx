import * as React from 'react'

import { Body, Container, Head, Heading, Html, Preview, Text } from '@react-email/components'

import { brand, code, container, footer, h1, main, text } from './styles'

interface ReauthenticationEmailProps {
  token: string
}

export const ReauthenticationEmail = ({ token }: ReauthenticationEmailProps) => (
  <Html lang="es" dir="ltr">
    <Head />
    <Preview>Tu código de verificación</Preview>
    <Body style={main}>
      <Container style={container}>
        <Text style={brand}>Tracli</Text>
        <Heading style={h1}>Tu código de verificación</Heading>
        <Text style={text}>Introduce este código para confirmar tu identidad:</Text>
        <Text style={code}>{token}</Text>
        <Text style={footer}>El código caduca en unos minutos. Si no lo has pedido, ignóralo.</Text>
      </Container>
    </Body>
  </Html>
)

export default ReauthenticationEmail
