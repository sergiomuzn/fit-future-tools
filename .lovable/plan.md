
# Plan: Configuración del centro y Estadísticas

## 1. Base de datos (migración)

Dos tablas nuevas + una para precios editables:

- `center_config` (singleton, key/value JSON): guarda horario base semanal y precios medios.
  - `horario_base`: `{ lun:{open,close}, mar:..., ..., dom: null }` (dom cerrado por defecto).
  - `precios`: `{ individual:36, pareja:49, grupal:17 }`.
- `special_days`:
  - `fecha date PK`
  - `tipo`: enum `cerrado | horario_especial` (los "horario modificado puntual" se tratan igual que `horario_especial`; la diferencia es solo etiqueta opcional)
  - `hora_apertura time null`, `hora_cierre time null`
  - `etiqueta text null` (ej. "Festivo", "Puente")
- Grants + RLS abiertas (siguiendo el patrón del resto de tablas).

## 2. Sidebar

Añadir entrada **"Configuración"** (`/configuracion`) con icono `Settings` en `src/routes/_shell.tsx`.

## 3. Ruta `/configuracion`

Archivo `src/routes/_shell.configuracion.tsx`. Dos bloques:

### a) Horario base y precios
- Formulario con 7 filas (lun-dom): checkbox "abierto" + inputs `open`/`close`.
- Defaults: L-V 06:45-22:00, S 09:00-14:00, D cerrado.
- Sección "Precios medios" con 3 inputs (individual, pareja, grupal). Guardado en `center_config`. Nota: cambios afectan a cálculos futuros pero no borran nada — el histórico se recalcula con los precios actuales (aceptable porque son "precios medios estimados"; documentado en la UI).

### b) Calendario de días especiales
- Toggle vista **Anual** (grid de 12 mini-meses) / **Mensual** (calendario grande).
- Click en día abre diálogo: `Normal | Cerrado | Horario especial`; si especial, inputs de apertura/cierre + etiqueta opcional.
- Días cerrados: badge rojo "Cerrado". Días con horario especial: badge ámbar con horas.

## 4. Helpers `src/lib/center-schedule.ts`

- `getDaySchedule(date, config, specialDays)` → `{ open:Date, close:Date } | null` (null = cerrado).
- `getPeriodCapacity(start, end, config, specialDays)` → `{ workingDays, totalOpenMinutes, capacityMinutes /* ×3 */ }`.
- `minutesInHourSlot(date, hour, config, specialDays)` → minutos abiertos dentro de esa hora concreta (para ocupación por franja).
- Hook `useCenterConfig()` con React Query que cachea config + special_days y expone helpers.

## 5. Integración en Agenda

En `src/components/agenda/agenda-grid.tsx`:
- Si el día actual está **cerrado**: overlay grande "Festivo · Cerrado" + no permitir crear sesiones (bloquear click y drag).
- Si tiene **horario especial**: banner arriba "Horario especial: HH:MM–HH:MM" (solo aviso visual, sesiones fuera permitidas según decisión del usuario).

## 6. Rediseño de Estadísticas

Reescribir `src/routes/_shell.estadisticas.tsx` con selector de periodo (fecha inicio/fin + presets: Hoy, Semana, Mes, Año, Personalizado) y 3 tabs:

### Tab 1 — Entrenamientos por franja
- Bar chart: eje X = franjas horarias del día (dinámicas según horario más amplio del periodo), Y = nº sesiones iniciadas en esa franja.
- Sesiones cuya `hora_inicio` cae dentro de `[H:00, H+1:00)` cuentan íntegras.
- Filtra `estado in (realizada, cancelada donde no_contabilizar=false)`.
- Botón "Exportar CSV".

### Tab 2 — Ocupación %
- KPIs arriba: ocupación total del periodo, mañana, tarde.
- Bar chart por franja horaria: `%` = minutos_ocupados_en_esa_franja / (minutos_abiertos_en_esa_franja × 3 × nº_días).
- Minutos ocupados por sesión = `(fin - inicio) × espacios` donde espacios = 2 si `tipo=grupal` else 1. Sesión asignada íntegra a la franja de inicio.
- Solo cuentan sesiones `realizada` o `cancelada no_contabilizar=false`.
- Botón CSV.

### Tab 3 — Facturación estimada
- KPIs: total, mañana, tarde.
- Precio = precio_tipo × asistentes (individual=1, pareja=2, grupal=`ocupacion`).
- Turno mañana = inicio < 14:00, tarde = ≥14:00.
- Gráfica de barras mañana vs tarde + tabla desglose por día (opcional).
- Botón CSV.

## 7. Detalles técnicos

- Todas las consultas usan `supabase` cliente ya existente.
- Reactividad: los helpers derivan todo desde React Query; al invalidar `center_config` o `special_days` se recalcula sin refrescar.
- Precios editables: se guardan como JSON en `center_config.precios`; se aplican a cualquier cálculo posterior. No se persiste facturación histórica (siempre se recalcula).
- Franjas horarias del gráfico: calculadas por día real (si un día abre 6:45 la franja 6 tiene 15 min de capacidad, y 60 min los demás), sumadas en el periodo.

## Archivos

- **Nuevos**: `src/routes/_shell.configuracion.tsx`, `src/lib/center-schedule.ts`, `src/components/config/schedule-form.tsx`, `src/components/config/special-days-calendar.tsx`, `src/components/config/day-editor-dialog.tsx`.
- **Editados**: `src/routes/_shell.tsx` (nav), `src/routes/_shell.estadisticas.tsx` (reescrito), `src/components/agenda/agenda-grid.tsx` (bloqueo días cerrados + banner).
- **Migración**: `center_config`, `special_days` con grants + RLS abiertas.

## Confirmaciones pendientes menores

Voy a asumir estos criterios salvo que digas lo contrario:
1. Precios editables afectan al recálculo del histórico (no se congelan por sesión).
2. Días "horario modificado puntual" ≡ "festivo con horario especial" en datos — la diferencia es la etiqueta.
3. En la agenda de un día cerrado no se pueden crear/mover sesiones; sí se ven las ya existentes.
