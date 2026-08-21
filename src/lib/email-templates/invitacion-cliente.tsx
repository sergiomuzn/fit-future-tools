import * as React from 'react'
import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Html,
  Preview,
  Section,
  Text,
} from '@react-email/components'
import type { TemplateEntry } from './registry'

interface InvitacionClienteProps {
  centro?: string
  url?: string
  servicios?: string
}

function InvitacionCliente({
  centro = 'Fitness 360',
  url = 'https://example.com/invitacion/codigo',
  servicios = '',
}: InvitacionClienteProps) {
  return (
    <Html>
      <Head />
      <Preview>{`Tu acceso al portal de reservas de ${centro}`}</Preview>
      <Body style={{ backgroundColor: '#f6f7f9', fontFamily: 'Arial, sans-serif', margin: 0 }}>
        <Container style={{ backgroundColor: '#ffffff', borderRadius: 12, margin: '32px auto', maxWidth: 520, padding: 32 }}>
          <Heading style={{ fontSize: 20, margin: '0 0 12px' }}>{centro}</Heading>
          <Text style={{ color: '#334155', fontSize: 15, lineHeight: '22px' }}>
            Te hemos dado acceso al portal de reservas. Completa tu registro para empezar a reservar tus sesiones.
          </Text>
          {servicios ? (
            <Text style={{ color: '#64748b', fontSize: 14 }}>Acceso a: {servicios}</Text>
          ) : null}
          <Section style={{ margin: '24px 0' }}>
            <Button
              href={url}
              style={{
                backgroundColor: '#00ADE2',
                borderRadius: 8,
                color: '#ffffff',
                display: 'inline-block',
                fontSize: 15,
                fontWeight: 'bold',
                padding: '12px 20px',
                textDecoration: 'none',
              }}
            >
              Registrarse
            </Button>
          </Section>
          <Text style={{ color: '#94a3b8', fontSize: 12 }}>
            Si el botón no funciona, copia este enlace: {url}
          </Text>
          <Text style={{ color: '#94a3b8', fontSize: 12 }}>El enlace caduca a los 7 días.</Text>
        </Container>
      </Body>
    </Html>
  )
}

export const template = {
  component: InvitacionCliente,
  displayName: 'Invitación cliente',
  subject: (data: Record<string, any>) =>
    `Tu acceso al portal de reservas de ${data['centro'] ?? 'Fitness 360'}`,
  previewData: {
    centro: 'Fitness 360',
    url: 'https://example.com/invitacion/abc123',
    servicios: 'Grupos',
  },
} satisfies TemplateEntry
