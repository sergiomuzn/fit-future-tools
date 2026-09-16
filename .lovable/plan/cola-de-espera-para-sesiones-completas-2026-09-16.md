# Cola de espera para sesiones completas

Cuando una sesión está llena, el cliente podrá apuntarse a una cola. Si alguien cancela, se avisa por orden y el siguiente confirma o rechaza la plaza.

## Qué verá el cliente

- En una sesión completa (calendario y reservas), el botón "Reservar" se sustituye por **"Apuntarme a la cola"**.
- Al apuntarse se le informa: *"Si alguien más se apunta después que tú, tendrás X para confirmar la plaza cuando quede libre"* (X según el servicio; si el centro no activa el límite, se indica que no caduca).
- Estando en cola ve **"En cola · 2º de 3"** (cuántos hay por delante) y un botón **"Salir de la cola"**.
- Cuando le toca la plaza: aviso en el buzón + en la propia sesión aparecen **Confirmar** y **Rechazar**, con el tiempo restante si aplica.
  - Confirmar → queda reservada igual que cualquier otra reserva (respetando el flujo de confirmación del centro si ese servicio lo requiere).
  - Rechazar → sale de la cola y se ofrece automáticamente al siguiente.
- Si pasa el plazo sin responder y hay alguien detrás, se rechaza automáticamente y pasa al siguiente. Si no hay nadie detrás, no caduca: tiene hasta el inicio de la sesión.

## Qué verá el centro

En **Configuración → Funcionamiento**, nueva tarjeta **"Cola de espera"**:
- Interruptor para activar la cola en el centro.
- Interruptor "Caducidad de la confirmación" (desactivado = no caduca nunca).
- Al activarlo: tiempo de confirmación general y, opcionalmente, un tiempo distinto por servicio (2 h por defecto), con las mismas opciones que ya existen para cancelación.

En el panel de reservas de cada servicio se muestra el número de personas en cola por sesión.

## Detalles técnicos

**Base de datos** — nueva tabla `public.reserva_cola`:
`id, centro_id, client_id, user_id, clave` (la misma clave de hueco/clase que usa el portal), `servicio_slug, group_id, fecha, hora_inicio, hora_fin, estado` (`en_cola` | `ofrecida` | `aceptada` | `rechazada` | `caducada`), `ofrecida_at, expira_at, created_at`. Índice por (`centro_id`, `clave`, `estado`, `created_at`), único parcial por (`clave`, `user_id`) mientras está activa. GRANT a `authenticated`/`service_role` + RLS: el cliente lee/borra las suyas; admin y entrenador del centro leen todas.

**Configuración** — nuevas claves en `center_config.avisos`: `cola_activa`, `cola_caducidad_activa`, `cola_confirmacion_min`, `cola_confirmacion_por_servicio`. Nuevo módulo `src/lib/cola-espera.ts` con parseo, opciones de tiempo y `colaTiempoParaServicio()`, siguiendo el patrón de `cancelacion-antelacion.ts`.

**Servidor** — `src/lib/cola-espera.server.ts` con la lógica de cola (apuntarse, salir, ofrecer al siguiente, aceptar, rechazar, caducar) y `src/lib/cola-espera.functions.ts` con server functions autenticadas para el portal. `cancelBookingForUser` y el borrado/denegación de reservas por el centro llaman a `ofrecerPlazaSiguiente()` al liberar una plaza.

**Caducidad** — se calcula al ofrecer la plaza: `expira_at` solo se rellena si existe al menos otra entrada `en_cola` detrás y el centro tiene la caducidad activa. Se aplica de forma perezosa en cada lectura/acción y además en un endpoint `src/routes/api/public/hooks/cola-expiraciones.ts` para barridos periódicos.

**Portal** — `ClaseGrupal` y `SesionPersonal` incorporan `colaTotal`, `colaPosicion`, `colaEstado` y `colaExpiraAt`; `client-portal.server.ts` los rellena. La tarjeta de sesión del portal y el buzón (`notifications-bell.tsx`) obtienen los botones Confirmar/Rechazar para las ofertas de cola.

**Notificaciones** — nuevos tipos `cola_plaza_libre`, `cola_caducada`, `cola_confirmada`, reutilizando `crearNotificaciones` con `session_id` cuando aplica.
