-- Moldes del carrusel, historial de inventario de moldes, palets armados.
--
-- Solo AGREGA: 3 tipos, 5 tablas y 3 columnas. No borra ni modifica nada
-- existente, asi que el codigo que esta en produccion no se entera y se puede
-- correr con la app funcionando. Va en una transaccion: o entra todo o nada.
--
-- Filas existentes (ARQUITECTURA 9.4): productos.moldes nace en 0 para todos,
-- que es lo buscado (sin inventario cargado no se pueden pedir moldes);
-- plan_lineas.palets_* nacen en null, que es "sin palets pedidos".
--
-- Correr ANTES de desplegar el codigo nuevo (ARQUITECTURA 9.5).

BEGIN;

CREATE TYPE "public"."motivo_inventario_moldes" AS ENUM('carga_inicial', 'alta', 'baja_deterioro', 'discontinuado', 'correccion', 'otro');
CREATE TYPE "public"."motivo_moldes_incompletos" AS ENUM('mesa_mantenimiento', 'falta_moldes', 'otro');
CREATE TYPE "public"."tipo_palet" AS ENUM('estandar', 'optimizado');
CREATE TABLE "ajustes_inventario_moldes" (
		"id" serial PRIMARY KEY NOT NULL,
		"producto_id" integer NOT NULL,
		"producto_nombre" text NOT NULL,
		"antes" integer NOT NULL,
		"despues" integer NOT NULL,
		"motivo" "motivo_inventario_moldes" NOT NULL,
		"nota" text,
		"usuario_id" integer NOT NULL,
		"usuario_nombre" text NOT NULL,
		"creado_en" timestamp with time zone DEFAULT now() NOT NULL
	);
CREATE TABLE "cambio_moldes_lineas" (
		"id" serial PRIMARY KEY NOT NULL,
		"cambio_id" integer NOT NULL,
		"producto_id" integer NOT NULL,
		"producto_nombre" text NOT NULL,
		"cantidad" integer NOT NULL
	);
CREATE TABLE "cambios_moldes" (
		"id" serial PRIMARY KEY NOT NULL,
		"usuario_id" integer NOT NULL,
		"usuario_nombre" text NOT NULL,
		"total" integer NOT NULL,
		"lugares" integer NOT NULL,
		"motivo_incompleto" "motivo_moldes_incompletos",
		"nota" text,
		"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
		"anulado_en" timestamp with time zone,
		"anulado_por_id" integer,
		"anulado_por_nombre" text,
		"motivo_anulacion" text
	);
CREATE TABLE "palets_armados" (
		"id" serial PRIMARY KEY NOT NULL,
		"fecha" date NOT NULL,
		"producto_id" integer NOT NULL,
		"producto_nombre" text NOT NULL,
		"tipo" "tipo_palet" NOT NULL,
		"cantidad" integer NOT NULL,
		"usuario_id" integer NOT NULL,
		"usuario_nombre" text NOT NULL,
		"creado_en" timestamp with time zone DEFAULT now() NOT NULL
	);
CREATE TABLE "plan_moldes" (
		"id" serial PRIMARY KEY NOT NULL,
		"fecha" date NOT NULL,
		"producto_id" integer NOT NULL,
		"moldes" integer NOT NULL
	);
ALTER TABLE "plan_lineas" ADD COLUMN "palets_estandar" integer;
ALTER TABLE "plan_lineas" ADD COLUMN "palets_optimizados" integer;
ALTER TABLE "productos" ADD COLUMN "moldes" integer DEFAULT 0 NOT NULL;
ALTER TABLE "ajustes_inventario_moldes" ADD CONSTRAINT "ajustes_inventario_moldes_producto_id_productos_id_fk" FOREIGN KEY ("producto_id") REFERENCES "public"."productos"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "ajustes_inventario_moldes" ADD CONSTRAINT "ajustes_inventario_moldes_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "cambio_moldes_lineas" ADD CONSTRAINT "cambio_moldes_lineas_cambio_id_cambios_moldes_id_fk" FOREIGN KEY ("cambio_id") REFERENCES "public"."cambios_moldes"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "cambio_moldes_lineas" ADD CONSTRAINT "cambio_moldes_lineas_producto_id_productos_id_fk" FOREIGN KEY ("producto_id") REFERENCES "public"."productos"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "cambios_moldes" ADD CONSTRAINT "cambios_moldes_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "cambios_moldes" ADD CONSTRAINT "cambios_moldes_anulado_por_id_usuarios_id_fk" FOREIGN KEY ("anulado_por_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "palets_armados" ADD CONSTRAINT "palets_armados_producto_id_productos_id_fk" FOREIGN KEY ("producto_id") REFERENCES "public"."productos"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "palets_armados" ADD CONSTRAINT "palets_armados_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "plan_moldes" ADD CONSTRAINT "plan_moldes_producto_id_productos_id_fk" FOREIGN KEY ("producto_id") REFERENCES "public"."productos"("id") ON DELETE no action ON UPDATE no action;
CREATE INDEX "ajustes_inventario_moldes_creado_idx" ON "ajustes_inventario_moldes" USING btree ("creado_en");
CREATE INDEX "ajustes_inventario_moldes_producto_idx" ON "ajustes_inventario_moldes" USING btree ("producto_id");
CREATE INDEX "cambio_moldes_lineas_cambio_idx" ON "cambio_moldes_lineas" USING btree ("cambio_id");
CREATE INDEX "cambios_moldes_creado_idx" ON "cambios_moldes" USING btree ("creado_en");
CREATE INDEX "palets_armados_fecha_idx" ON "palets_armados" USING btree ("fecha");
CREATE UNIQUE INDEX "plan_moldes_fecha_producto_idx" ON "plan_moldes" USING btree ("fecha","producto_id");

COMMIT;
