import * as React from 'react'
import {
  Body,
  Container,
  Head,
  Heading,
  Html,
  Preview,
  Text,
} from '@react-email/components'
import type { TemplateEntry } from './registry'
import { brand, container, footer, h1, main, text } from './styles'

interface AvisoClienteProps {
  centro?: string
  titulo?: string
  mensaje?: string
}

function AvisoCliente({
  centro = 'Tracli',
  titulo = 'Tienes un aviso nuevo',
  mensaje = '',
}: AvisoClienteProps) {
  return (
    <Html lang="es">
      <Head />
      <Preview>{titulo}</Preview>
      <Body style={main}>
        <Container style={container}>
          <Text style={brand}>{centro}</Text>
          <Heading style={h1}>{titulo}</Heading>
          {mensaje ? <Text style={text}>{mensaje}</Text> : null}
          <Text style={footer}>
            Recibes este correo porque tienes activados los avisos por correo en tu perfil de
            cliente. Puedes desactivarlos desde Mi perfil.
          </Text>
        </Container>
      </Body>
    </Html>
  )
}

export const template = {
  component: AvisoCliente,
  displayName: 'Aviso cliente',
  subject: (data: Record<string, any>) =>
    `${data['titulo'] ?? 'Tienes un aviso nuevo'}${data['centro'] ? ` · ${data['centro']}` : ''}`,
  previewData: {
    centro: 'Tracli',
    titulo: 'Reserva confirmada',
    mensaje: 'Tracli ha confirmado tu reserva de Grupos el 7 jul a las 10:00',
  },
} satisfies TemplateEntry
