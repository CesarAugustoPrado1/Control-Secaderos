"use client";

import { useState } from "react";
import {
  cambiarEstadoUsuario,
  desbloquearUsuario,
  guardarUsuario,
} from "@/lib/acciones/admin";
import type { Rol } from "@/lib/db/schema";
import { ETIQUETA_ROL } from "@/lib/permisos";
import {
  BloqueNuevo,
  BotonAccion,
  Campo,
  FilaAbm,
  FormularioAbm,
} from "@/components/admin/comunes";

type Fila = {
  id: number;
  usuario: string;
  nombre: string;
  rol: Rol;
  activo: boolean;
  bloqueado: boolean;
};

const ROLES: Rol[] = ["admin", "carrusel", "horno", "paletizado", "auditor"];

const COLOR_ROL: Record<Rol, string> = {
  admin: "bg-slate-900 text-white",
  carrusel: "bg-blue-100 text-blue-800",
  horno: "bg-orange-100 text-orange-800",
  paletizado: "bg-violet-100 text-violet-800",
  auditor: "bg-teal-100 text-teal-800",
};

export function ListaUsuarios({
  usuarios,
  miId,
}: {
  usuarios: Fila[];
  miId: number;
}) {
  const [editando, setEditando] = useState<number | null>(null);

  return (
    <>
      <BloqueNuevo etiqueta="Agregar usuario">
        {(cerrar) => (
          <FormularioUsuario
            inicial={{ usuario: "", nombre: "", rol: "carrusel" }}
            esNuevo
            alGuardar={cerrar}
          />
        )}
      </BloqueNuevo>

      <ul className="space-y-2">
        {usuarios.map((u) => (
          <FilaAbm key={u.id} atenuado={!u.activo}>
            {editando === u.id ? (
              <div className="w-full">
                <FormularioUsuario
                  inicial={u}
                  alGuardar={() => setEditando(null)}
                />
                <button
                  type="button"
                  onClick={() => setEditando(null)}
                  className="mt-2 text-sm font-medium text-slate-500"
                >
                  Cancelar
                </button>
              </div>
            ) : (
              <>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-slate-900">
                    {u.nombre}
                    {u.id === miId && (
                      <span className="ml-2 text-xs font-normal text-slate-400">
                        (vos)
                      </span>
                    )}
                  </p>
                  <div className="mt-1 flex flex-wrap items-center gap-2">
                    <span className="font-mono text-xs text-slate-500">
                      {u.usuario}
                    </span>
                    <span className={`chip ${COLOR_ROL[u.rol]}`}>
                      {ETIQUETA_ROL[u.rol]}
                    </span>
                    {!u.activo && (
                      <span className="chip bg-red-100 text-red-800">
                        DE BAJA
                      </span>
                    )}
                    {u.bloqueado && (
                      <span className="chip bg-amber-100 text-amber-900">
                        BLOQUEADO
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setEditando(u.id)}
                    className="rounded-lg px-2.5 py-1.5 text-xs font-semibold text-slate-600 ring-1 ring-slate-300 hover:bg-slate-50"
                  >
                    Editar / cambiar PIN
                  </button>

                  {u.bloqueado && (
                    <BotonAccion accion={() => desbloquearUsuario({ id: u.id })}>
                      Desbloquear
                    </BotonAccion>
                  )}

                  {u.id !== miId && (
                    <BotonAccion
                      accion={() =>
                        cambiarEstadoUsuario({ id: u.id, activo: !u.activo })
                      }
                    >
                      {u.activo ? "Dar de baja" : "Reactivar"}
                    </BotonAccion>
                  )}
                </div>
              </>
            )}
          </FilaAbm>
        ))}
      </ul>

      <p className="mt-4 text-xs text-slate-500">
        Tras 5 PIN incorrectos seguidos el usuario queda bloqueado 5 minutos.
        Podés desbloquearlo acá o cambiarle el PIN.
      </p>
    </>
  );
}

function FormularioUsuario({
  inicial,
  esNuevo,
  alGuardar,
}: {
  inicial: { id?: number; usuario: string; nombre: string; rol: Rol };
  esNuevo?: boolean;
  alGuardar: () => void;
}) {
  const [usuario, setUsuario] = useState(inicial.usuario);
  const [nombre, setNombre] = useState(inicial.nombre);
  const [rol, setRol] = useState<Rol>(inicial.rol);
  const [pin, setPin] = useState("");

  return (
    <FormularioAbm
      alGuardar={alGuardar}
      accion={() =>
        guardarUsuario({ id: inicial.id, usuario, nombre, rol, pin })
      }
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Campo etiqueta="Nombre y apellido">
          <input
            className="campo"
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            placeholder="ej: Juan Pérez"
            required
            maxLength={80}
          />
        </Campo>

        <Campo etiqueta="Usuario (para entrar)">
          <input
            className="campo font-mono"
            value={usuario}
            onChange={(e) => setUsuario(e.target.value.toLowerCase())}
            placeholder="ej: jperez"
            autoCapitalize="none"
            autoCorrect="off"
            required
          />
        </Campo>

        <Campo etiqueta="Rol">
          <select
            className="campo"
            value={rol}
            onChange={(e) => setRol(e.target.value as Rol)}
          >
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {ETIQUETA_ROL[r]}
              </option>
            ))}
          </select>
        </Campo>

        <Campo etiqueta={esNuevo ? "PIN (4 a 8 números)" : "Nuevo PIN (opcional)"}>
          <input
            className="campo font-mono tracking-widest"
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
            inputMode="numeric"
            maxLength={8}
            placeholder={esNuevo ? "ej: 1234" : "dejar vacío para no cambiarlo"}
            required={esNuevo}
          />
        </Campo>
      </div>

      <p className="text-xs text-slate-500">
        Anotá el PIN y pasáselo a la persona: no se puede ver después, solo
        reemplazar.
      </p>
    </FormularioAbm>
  );
}
