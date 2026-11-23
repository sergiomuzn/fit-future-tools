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

interface AvisoCentroProps {
  centro?: string
  titulo?: string
  mensaje?: string
}

function AvisoCentro({
  centro = 'Tracli',
  titulo = 'Tienes un aviso nuevo',
  mensaje = '',
}: AvisoCentroProps) {
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
            Recibes este correo porque el centro tiene activados los avisos por correo en
            Configuración › Notificaciones.
          </Text>
        </Container>
      </Body>
    </Html>
  )
}

export const template = {
  component: AvisoCentro,
  displayName: 'Aviso al centro',
  subject: (data: Record<string, any>) =>
    `${data['titulo'] ?? 'Tienes un aviso nuevo'}${data['centro'] ? ` · ${data['centro']}` : ''}`,
  previewData: {
    centro: 'Tracli',
    titulo: 'Nueva reserva',
    mensaje: 'Ana López ha reservado Grupos el 07/07/26 a las 10:00',
  },
} satisfies TemplateEntry
