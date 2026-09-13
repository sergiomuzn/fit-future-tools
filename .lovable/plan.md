# Eliminar el lapso al reservar y cancelar

## Objetivo
Mantener cada sesión estable mientras se procesa la acción, sin que el botón cambie brevemente al estado contrario ni que la lista parpadee.

## Cambios
- Aplicar una actualización inmediata en pantalla al reservar o cancelar.
- Mantener el botón deshabilitado con su texto de acción mientras termina la operación.
- Sincronizar Calendario y Mis reservas desde la misma copia temporal de datos.
- Restaurar el estado anterior si la operación falla y mostrar el error existente.

## Verificación
- Probar reserva y cancelación desde Calendario y Mis reservas.
- Confirmar que no aparece durante ningún instante el botón contrario ni un estado vacío intermedio.
