-- Metros cuadrados por placa de cada producto, para ver las estadisticas en m2.
--
-- Solo AGREGA una columna que nace vacia (null): no modifica ni borra nada, y
-- se puede correr con la app funcionando. Los productos existentes quedan "sin
-- conversion" hasta que el admin les cargue el dato en Administracion ->
-- Productos.
--
-- Correr ANTES de desplegar el codigo nuevo: el codigo nuevo lee esta columna y
-- sin ella las pantallas de productos y estadisticas fallan.
--
-- Es idempotente: correrla dos veces no hace nada la segunda.

ALTER TABLE "productos" ADD COLUMN IF NOT EXISTS "m2_por_placa" numeric(7, 4);
