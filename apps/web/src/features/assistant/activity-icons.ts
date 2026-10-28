import {
  type RemixiconComponentType,
  RiAppleLine,
  RiBeerLine,
  RiBook2Line,
  RiBowlLine,
  RiBriefcase4Line,
  RiCake3Line,
  RiCapsuleLine,
  RiCarLine,
  RiCupLine,
  RiDropLine,
  RiFlowerLine,
  RiFootprintLine,
  RiGamepadLine,
  RiGiftLine,
  RiGlassesLine,
  RiGoblet2Line,
  RiHammerLine,
  RiHandHeartLine,
  RiKnifeLine,
  RiLeafLine,
  RiRestaurant2Line,
  RiRunLine,
  RiScissors2Line,
  RiShirtLine,
  RiShoppingBasket2Line,
  RiSmartphoneLine,
  RiSofaLine,
  RiStore2Line,
  RiTakeawayLine,
  RiTShirt2Line,
} from "@remixicon/react";
import { normalizeText } from "@/lib.ts";

/** One icon per common activity of data/curado/rubros.yaml, by its id. */
const BY_ID: Record<string, RemixiconComponentType> = {
  almacen: RiShoppingBasket2Line,
  kiosco: RiStore2Line,
  ropa: RiTShirt2Line,
  rotiseria: RiTakeawayLine,
  carniceria: RiKnifeLine,
  verduleria: RiAppleLine,
  panaderia: RiCake3Line,
  fiambreria: RiBowlLine,
  dietetica: RiLeafLine,
  heladeria: RiCupLine,
  bar: RiGoblet2Line,
  "cerveza-artesanal": RiBeerLine,
  restaurante: RiRestaurant2Line,
  pastas: RiBowlLine,
  peluqueria: RiScissors2Line,
  ferreteria: RiHammerLine,
  libreria: RiBook2Line,
  zapateria: RiFootprintLine,
  bazar: RiGiftLine,
  jugueteria: RiGamepadLine,
  perfumeria: RiDropLine,
  celulares: RiSmartphoneLine,
  optica: RiGlassesLine,
  floreria: RiFlowerLine,
  muebleria: RiSofaLine,
  veterinaria: RiHandHeartLine,
  lavanderia: RiShirtLine,
  gimnasio: RiRunLine,
  taller: RiCarLine,
  farmacia: RiCapsuleLine,
  oficina: RiBriefcase4Line,
};

/** The icon of an activity: by id, or by its name when only the label is known; a shop when there is no match. */
export function activityIcon(id: string | undefined, label: string): RemixiconComponentType {
  const byId = id ? BY_ID[id] : undefined;
  if (byId) return byId;
  const slug = normalizeText(label).replace(/\s+/g, "-");
  const hit = Object.entries(BY_ID).find(([key]) => slug.includes(key));
  return hit ? hit[1] : RiStore2Line;
}
