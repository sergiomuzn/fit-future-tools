# Tareas

- [x] Añadir selección de servicios al ajuste de sesiones restantes del centro; 11 pruebas correctas y guardado, recarga y saldo visible/oculto al cambiar de servicio verificados, restaurando los ajustes originales sin guardar sesiones.

- [x] Unificar las plazas reservadas/disponibles en Agenda y menú con el mismo bloque exacto, sin contar cola ni cancelaciones; 24 pruebas correctas y 35 sesiones reales comparadas al abrir, sin modificar datos.

- [x] Hacer efectiva «Cliente Cancela» antes de guardar: mostrar Cancelados, conservar No contabilizar individual y guardar cada cancelación sin confundirla con Quitar cliente; 38 pruebas y creación, guardado y reapertura reales verificados con datos temporales eliminados.

- [x] Eliminar selección manual de estado; calcular Reservada/Realizada por fecha y margen existente.
- [x] Añadir menú por cliente para quitar sin contabilizar o cancelar solo su reserva; conservar No contabilizar individual.
- [x] Mostrar estado agregado y número rojo de cancelaciones en Agenda e historial, preservando sesiones independientes.
- [x] Verificar reglas: 57 pruebas correctas y cancelación real individual, cambio de No contabilizar y cancelación del último cliente verificados; datos temporales eliminados.

- [x] Reducir el lapso al añadir, editar y eliminar sesiones: cierre sin esperar recargas de menús, actualización de Agenda por ID y refresco de vistas diaria/semanal; 13 pruebas correctas y creación, edición y borrado real de una sesión temporal vacía verificados (eliminada después), sin tocar reservas existentes.

- [x] Añadir opción desactivada por defecto en Funcionamiento para mostrar sesiones restantes debajo del cliente seleccionado al añadir o editar sesiones; 14 pruebas correctas y activación/desactivación verificadas con sesiones individuales y grupales reales, sin modificar reservas.

- [x] Guardar sesiones con Enter tras elegir cliente; extenderlo a servicios y creación de clientes, conservar selección antes de guardado y aislar menús anidados; 6 pruebas y guardado real sin cambiar datos verificados.

- [x] Corregir la selección antes de recoger las búsquedas con lupa; verificados perfil correcto, selección en invitaciones, borrado interior y clic exterior sin modificar datos.

- [x] Corregir coincidencias aproximadas que amplían búsquedas y totales; verificar Facturación, Clientes y Bonos con datos reales y 15 pruebas.

- [x] Excluir entrenadores inactivos de selectores de sesiones y facturas.
- [x] Registrar actividad histórica desde ahora y filtrar entrenadores en comparaciones por periodo; los periodos previos sin historial se conservan según sesiones registradas.
- [x] Probar selectores en navegador autenticado y reglas históricas (21 pruebas correctas).

- [x] Corregir Sesiones Totales según estados y contabilización, con 42 pruebas correctas y total de octubre verificado: 796 realizadas + 22 canceladas contabilizadas = 818.

- [x] Corregir y verificar que todas las reservas de una clase compartida aparecen en Agenda diaria y semanal.

- [x] Añadir distinción opcional de reservas online en Agenda, desactivada por defecto.
- [x] Ocultar cancelaciones online de una plaza sin cola, conservando su contabilización.
- [x] Verificar configuración y distinción en una reserva real; cancelaciones con pruebas sin modificar reservas de clientes.

- [x] Retirar del buzón la solicitud pendiente cuando el cliente la cancela.
- [x] Impedir en la base de datos que una reserva pendiente pase a cancelada y descuente bono.
- [x] Reparar la reserva incorrecta detectada y devolver la sesión descontada.
- [x] Verificar cancelación pendiente y acciones de confirmación/denegación.
- [x] Eliminar el lapso visual al cambiar entre reservar y cancelar.