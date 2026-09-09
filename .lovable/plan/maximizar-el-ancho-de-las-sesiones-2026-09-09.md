# Maximizar el ancho de las sesiones

## Objetivo
Reordenar automáticamente las columnas visuales para que las sesiones ocupen todo el ancho libre compatible, sin cambiar sus horas ni crear solapamientos.

## Cambios
- Sustituir la mejora local actual, que solo acepta mover una sesión cuando mejora inmediatamente, por una búsqueda de varias recolocaciones encadenadas.
- Permitir movimientos intermedios neutros para casos como Bea Hurtado, donde primero deben moverse Silvina, Pura, Tania y Ángel antes de que Bea pueda ampliarse.
- Expandir cada sesión hacia las columnas libres contiguas una vez encontrada la mejor distribución.
- Priorizar la disposición con mayor superficie ocupada y, en empate, la más compacta y estable para evitar saltos visuales.
- Mantener intactas las horas, los datos y el orden cronológico de todas las sesiones.

## Validación
- Comprobar un escenario de tres columnas donde varias sesiones deban cambiar de columna para liberar dos columnas contiguas a una sesión.
- Verificar que ninguna sesión solapada comparte espacio y que el resultado es estable.
