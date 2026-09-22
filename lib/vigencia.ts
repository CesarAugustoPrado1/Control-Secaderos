import { isNull } from "drizzle-orm";
import { movimientos } from "./db/schema";

/**
 * Condicion para toda consulta que SUME movimientos: produccion, plan,
 * estadisticas, reproceso.
 *
 * Un movimiento anulado se registro mal y quedo en el historial solo como
 * constancia del error. Si se sumara, la carga corregida contaria dos veces:
 * el 36 anulado mas el 136 que lo reemplazo. El reemplazo es un movimiento
 * comun del mismo tipo, asi que con esta condicion cada reporte ve exactamente
 * lo que paso, sin saber que hubo una correccion.
 *
 * Es una funcion y no una constante para que cada consulta arme su propia
 * expresion: una misma instancia de SQL compartida entre consultas que corren
 * en paralelo es una fuente de sorpresas que no vale la pena tener.
 *
 * Las consultas en SQL crudo no pueden usarla: llevan `anulado_en is null`
 * escrito a mano, y un comentario que remite aca.
 */
export const vigente = () => isNull(movimientos.anuladoEn);
