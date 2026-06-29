## Resumen
App interna sin login, una sola cuenta compartida. Pantalla principal: agenda tipo MagicLine. Navegación lateral hacia tablas y estadísticas. Datos persistidos en Lovable Cloud (Postgres). Tema claro/oscuro con toggle, paleta Slate & Steel, tipografía Sora/Manrope.

## Fases

### Fase 1 — Cimientos
- Activar Lovable Cloud.
- Diseño: tokens en `src/styles.css` (slate/steel + colores semánticos para estados de sesión: prueba/reservada/realizada/cancelada/renovación), fuentes Sora + Manrope vía `<link>` en `__root.tsx`, toggle de tema.
- Layout con sidebar fijo: mini-calendario mensual + navegación (Agenda, Clientes, Entrenadores, Bonos, Sesiones, Facturación, Estadísticas).

### Fase 2 — Base de datos
Tablas (todas en `public`, con GRANTs a `anon` ya que no hay auth):

- `trainers` (id, nombre, iniciales, color_opcional, activo)
- `clients` (id, nombre, telefono, fecha_inicio, cumpleaños, notas)
- `bonos_catalogo` (id, tipo [individual/pareja/grupal], nombre, sesiones_incluidas, duracion_min, precio_base) — sembrado con tu lista de precios
- `client_bonos` (id, client_id, bono_catalogo_id, fecha_inicio, sesiones_disponibles, sesiones_realizadas, activo)
- `sessions` (id, client_id, trainer_id, fecha, hora_inicio, hora_fin, estado [prueba/reservada/realizada/cancelada/renovacion], ocupacion [1|2], turno [mañana/tarde — derivado], incidencia, recurrencia_id)
- `invoices` (id, fecha, cobrador_trainer_id, client_id, bono_catalogo_id, precio_cobrado, nota)

Triggers/funciones:
- Al insertar `invoice` → crear/actualizar `client_bonos` sumando sesiones del bono y marcando como último bono.
- Al marcar `session` como `realizada` → decrementar `sesiones_disponibles` y aumentar `sesiones_realizadas` del bono activo del cliente.
- Función programada (cron job o cálculo on-read) que marca sesiones pasadas con estado `reservada` como `realizada`.

### Fase 3 — Agenda (vista principal)
- Vista diaria por defecto, toggle día/semana, navegación con mini-calendario.
- Franja 6:00–23:00, líneas cada 30 min.
- Chips de entrenadores en barra superior con iniciales; al seleccionar uno entra en "modo pintar" y los siguientes clicks asignan ese entrenador a las sesiones.
- Click-and-drag vertical para crear sesión nueva → popover con buscador de clientes, selector de entrenador, checkbox "repetir N semanas".
- Drag para mover sesiones existentes a otro horario.
- Solape: las sesiones que coinciden en tiempo se reparten el ancho, dejando ~10% libre a un lado para crear sesiones nuevas.
- Colores por estado; sesiones de renovación (clientes con ≤1 sesión restante) en amarillo-naranja.
- Iniciales del entrenador visibles en cada bloque.

### Fase 4 — Tablas
- **Clientes**: nombre, teléfono, fecha inicio, cumpleaños. CRUD básico.
- **Entrenadores**: nombre, iniciales, entrenamientos del mes (auto, contados desde `sessions` realizadas), selector de mes/año.
- **Bonos**: cliente, sesiones disponibles/realizadas/restantes, último bono (de `invoices`), estado activo/inactivo. Activos primero (cronológico), luego inactivos. Botón editar sesiones restantes.
- **Sesiones**: histórico (solo pasadas), cliente, incidencia editable, estado, entrenador.
- **Facturación**: filtro mes/año, columnas: fecha, cobrador, cliente (selector + buscador con opción "nuevo cliente"), bono (selector del catálogo), precio (auto-rellenado desde catálogo, editable), nota.

### Fase 5 — Estadísticas
Constructor libre: elegir variable X (mes, año, franja horaria, día semana, entrenador, tipo de bono, turno) e Y (nº sesiones, facturación, ocupación). Gráficos con Recharts. Comparativas predefinidas como atajos (mañana vs tarde, año vs año, bonos top).

## Detalles técnicos
- **Stack**: TanStack Start + Tailwind v4 + shadcn + Recharts + dnd-kit para drag de sesiones + date-fns.
- **Sin auth**: políticas RLS abiertas a `anon` en todas las tablas (uso interno). Avisar al usuario que cualquiera con la URL puede ver/editar — si en el futuro quiere proteger, se añade contraseña compartida o login.
- **Server functions** para lógica de bonos/sesiones; lecturas vía publishable key.

## Entrega
Construyo todo en una sola tanda y, al terminar, te resumo qué probar primero (crear cliente, cobrar bono, arrastrar sesión en la agenda, ver que se descuenta).

¿Apruebas el plan?