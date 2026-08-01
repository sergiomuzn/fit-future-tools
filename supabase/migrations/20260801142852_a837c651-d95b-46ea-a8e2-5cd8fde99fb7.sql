UPDATE public.notificaciones
SET titulo = 'Reserva creada por ' || split_part(mensaje, ' ha reservado plaza en ', 1),
    mensaje = 'en ' || replace(regexp_replace(rtrim(split_part(mensaje, ' ha reservado plaza en ', 2), '.'), '\(([^,()]+, )', '('), ' de ', ' ')
WHERE tipo = 'reserva_creada' AND mensaje LIKE '% ha reservado plaza en %';

UPDATE public.notificaciones
SET titulo = 'Reserva cancelada por ' || split_part(mensaje, ' ha cancelado su plaza en ', 1),
    mensaje = 'en ' || replace(regexp_replace(rtrim(split_part(mensaje, ' ha cancelado su plaza en ', 2), '.'), '\(([^,()]+, )', '('), ' de ', ' ')
WHERE tipo = 'reserva_cancelada_cliente' AND mensaje LIKE '% ha cancelado su plaza en %';

UPDATE public.notificaciones
SET titulo = 'Reserva cancelada por el centro',
    mensaje = 'en ' || replace(regexp_replace(rtrim(split_part(mensaje, 'El centro ha cancelado tu reserva de ', 2), '.'), '\(([^,()]+, )', '('), ' de ', ' ')
WHERE tipo = 'reserva_cancelada' AND mensaje LIKE 'El centro ha cancelado tu reserva de %';