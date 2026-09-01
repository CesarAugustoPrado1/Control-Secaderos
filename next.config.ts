import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // exceljs es CommonJS y trae binarios de zip: se deja fuera del bundle del
  // servidor para que Next lo cargue tal cual desde node_modules.
  serverExternalPackages: ["exceljs"],
  experimental: {
    // Las planillas de secaderos y productos viajan como FormData a la action
    // que las analiza. 250 filas son unos pocos KB, pero un Excel guardado con
    // formato de mas pesa bastante mas que sus datos.
    serverActions: { bodySizeLimit: "4mb" },
  },
};

export default nextConfig;
