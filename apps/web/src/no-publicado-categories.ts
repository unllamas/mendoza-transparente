import { Banknote, Building2, FileSpreadsheet, HeartPulse, Landmark, MapPin, Receipt, ShoppingCart, UsersRound, Vote, type LucideIcon } from "lucide-react";

/** Categories for "Lo que no se publica". Every entry in data/curado/no-publicado.yaml has one `categoria`. */
export const NO_PUBLICADO_CATEGORIES = {
  personal: { label: "Personal y sueldos", description: "Quiénes trabajan en el Estado, en qué y cuánto cobran.", icon: UsersRound },
  estructura: { label: "Estructura del Estado", description: "Cómo está organizado el Estado y quién conduce cada área.", icon: Building2 },
  presupuesto: { label: "Presupuesto y cuentas", description: "En qué se gasta la plata y cómo se rinde cuentas.", icon: FileSpreadsheet },
  impuestos: { label: "Impuestos y recaudación", description: "Cuánto se recauda, de quién y qué exenciones hay.", icon: Receipt },
  compras: { label: "Compras y contratos", description: "Qué compra el Estado, a quién y con qué contratos.", icon: ShoppingCart },
  empresas: { label: "Empresas y fondos del Estado", description: "Sociedades, fideicomisos y fondos fuera del presupuesto.", icon: Banknote },
  legislatura: { label: "Legislatura", description: "Qué hacen, cómo votan y cuánto cuestan los legisladores.", icon: Landmark },
  elecciones: { label: "Elecciones y campañas", description: "Quién financia la política.", icon: Vote },
  servicios: { label: "Salud, seguridad y servicios", description: "Cómo funcionan los servicios que usa la gente.", icon: HeartPulse },
  municipios: { label: "Municipios", description: "Lo que no publican los municipios.", icon: MapPin },
} as const satisfies Record<string, { label: string; description: string; icon: LucideIcon }>;

export type NoPublicadoCategory = keyof typeof NO_PUBLICADO_CATEGORIES;
