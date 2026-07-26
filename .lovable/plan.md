
## 1. Migración de base de datos

- **`bono_tipo` enum → `text`**: convertir `bonos_catalogo.tipo` y `sessions.tipo` a texto libre. Se conservan los valores existentes. Se recrean las funciones (`apply_invoice_row`, `log_client_alta`, `revert_invoice_row`) para comparar `= 'prueba'` en texto.
- **Bono "Prueba" en catálogo**: si no existe ya, insertar `nombre='Prueba'`, `tipo='prueba'`, `sesiones_incluidas=1`, `precio=10`.
- **Función `auto_deactivate_prueba_clients()`**: marca `clients.activo = false` para clientes cuyo único bono activo sea tipo `prueba` y cuya `fecha_inicio` sea > 30 días. Se llama desde el frontend al abrir la pestaña Clientes (idempotente).
- **Función `ensure_prueba_bono(p_client uuid, p_fecha date)`**: crea un `client_bonos` de tipo prueba (1 sesión, activo) para el cliente si no tiene ninguno todavía. Se llama al crear una sesión de estado "prueba" desde el frontend.

## 2. Configuración → Tipos de bono

`src/components/config/catalogo-manager.tsx`:
- Sustituir el `Select` cerrado (`individual/pareja/grupal/gympass`) por un **Combobox**: muestra los tipos ya usados en el catálogo (incluido `prueba` ahora) + opción "Nuevo tipo…" que abre un input libre.
- Al guardar, el `tipo` se envía tal cual como texto.

`src/components/config/schedule-form.tsx` (PreciosForm):
- Lista dinámica de tipos leídos del catálogo, en vez de las 4 filas fijas. Cada tipo tiene su input de color (persistido en `center_config.colores` por clave).

## 3. Sesión de prueba → bono automático

`src/components/agenda/session-dialog.tsx`:
- Al guardar una sesión nueva individual con `estado='prueba'` y `clientId` asignado: llamar `supabase.rpc('ensure_prueba_bono', ...)` para dar de alta al cliente con bono prueba (activo).
- No se crea factura.

## 4. Estadísticas — "Prueba" como tipo real

`src/routes/_shell.estadisticas.tsx`:
- `tipoOf` deja de descartar `prueba`: devuelve `'prueba'` cuando el bono activo del cliente es de ese tipo (o la sesión es `estado='prueba'` sin bono).
- Color por defecto de `prueba` sale de `center_config.colores.prueba` con fallback verde (`#1CDB14`, ya existe).
- Se elimina la razón "Sesión de prueba" del banner de sin clasificar (ya no aplica).

## 5. Clientes — icono de información y auto-inactivo

`src/routes/_shell.clientes.tsx`:
- Al montar, invocar `supabase.rpc('auto_deactivate_prueba_clients')` y luego invalidar la query de clientes.
- Añadir `Info` con `Tooltip` en el header de la lista explicando:
  > "Un cliente con bono de prueba pasa automáticamente a **inactivo** un mes después de la sesión de prueba si no se registra un bono nuevo en Facturación. El tipo de bono se conserva."

## 6. Labels dinámicos

Reemplazar los `TIPO_LABEL` fijos en `_shell.bonos.tsx`, `_shell.clientes.tsx`, `_shell.facturacion.tsx`, `_shell.sesiones.tsx`, `client-details-dialog.tsx` por una función pequeña `formatTipoBono(t)` (capitaliza) que aparte reconozca `prueba` → "Prueba".

## Archivos

- **Migración nueva** (un solo call): conversión de enum, catálogo prueba, funciones RPC.
- **Editados**: `catalogo-manager.tsx`, `schedule-form.tsx`, `session-dialog.tsx`, `_shell.estadisticas.tsx`, `_shell.clientes.tsx`, `db.ts` (tipo `BonoTipo = string`), y helpers de label en los 4-5 ficheros arriba.

## Notas

- Los colores de tipos existentes (Individual, Pareja, Grupal, Gympass) se conservan. Un tipo nuevo empieza con un color neutro y se puede ajustar desde Configuración → Precios/Colores.
- Regenerar `src/integrations/supabase/types.ts` es automático tras aprobar la migración.
