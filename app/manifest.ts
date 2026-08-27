import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Control de Secaderos",
    short_name: "Secaderos",
    description: "Control de secaderos de placas de yeso",
    start_url: "/",
    display: "standalone",
    background_color: "#f1f5f9",
    theme_color: "#0f172a",
    lang: "es-AR",
    icons: [
      { src: "/icono.svg", sizes: "any", type: "image/svg+xml" },
    ],
  };
}
