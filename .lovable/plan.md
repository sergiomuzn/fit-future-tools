# Historial de bonos y fechas uniformes

## Resultado
- Mantener las seis columnas del historial en una sola tabla compacta y sin desplazamiento lateral.
- Mostrar **Servicio** con la etiqueta y el color configurado para ese servicio.
- Mostrar **Modalidad** con la misma etiqueta gris contorneada usada en las pestañas Bonos y Clientes.
- Reservar ancho suficiente para que la fecha se vea completa y **Restantes al cerrar** permanezca en una sola línea.
- Mostrar todas las fechas visibles de la app como `dd/mm/aa`.

## Implementación
- Crear un único formateador seguro para fechas, evitando cambios de día por zona horaria en valores guardados como `aaaa-mm-dd`.
- Sustituir fechas ISO y formatos largos visibles en tablas, perfiles, agenda, reservas, facturación, estadísticas, accesos y administración.
- Mantener los valores ISO internos de campos de fecha, consultas y comparaciones; solo cambia su presentación.
- Conservar encabezados de meses o días de la semana cuando funcionan como navegación, añadiendo `dd/mm/aa` cuando también muestran una fecha concreta.

## Comprobación
- Revisar el historial del cliente al ancho actual para confirmar que no corta fechas ni encabezados.
- Comprobar varias pantallas con fechas y verificar que no quedan fechas visibles en formato `aaaa-mm-dd`.
- Confirmar que la app sigue cargando sin errores.
