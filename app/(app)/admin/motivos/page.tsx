import { todosLosMotivos } from "@/lib/consultas";
import { todosLosMotivosDesvio } from "@/lib/plan";
import { ListaMotivos } from "./lista";
import { ListaMotivosDesvio } from "./desvio";

export const metadata = { title: "Motivos · Administración" };
export const dynamic = "force-dynamic";

export default async function PaginaAdminMotivos() {
  const [motivos, desvios] = await Promise.all([
    todosLosMotivos(),
    todosLosMotivosDesvio(),
  ]);

  return (
    <div className="space-y-8">
      <section>
        <h2 className="mb-1 text-base font-bold text-slate-900">
          Motivos de desperdicio
        </h2>
        <p className="mb-3 text-sm text-slate-500">
          Por qué se rompen las placas. Los elige el operario al cargar roturas.
        </p>
        <ListaMotivos motivos={motivos} />
      </section>

      <section>
        <h2 className="mb-1 text-base font-bold text-slate-900">
          Motivos de desvío del plan
        </h2>
        <p className="mb-3 text-sm text-slate-500">
          Por qué no se llegó a lo pedido en la orden de producción.
        </p>
        <ListaMotivosDesvio motivos={desvios} />
      </section>
    </div>
  );
}
