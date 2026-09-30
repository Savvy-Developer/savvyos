import type { MlsProvider } from "../../../drizzle/mlsSchema";
import { mlsGridAdapter } from "./mlsGrid";
import { customAdapter, resoWebApiAdapter } from "./resoWebApi";
import { sparkAdapter } from "./spark";
import { trestleAdapter } from "./trestle";
import type { MlsAdapter } from "./types";

export const MLS_ADAPTERS: Record<MlsProvider, MlsAdapter> = {
  mls_grid: mlsGridAdapter,
  trestle: trestleAdapter,
  spark: sparkAdapter,
  reso_web_api: resoWebApiAdapter,
  custom: customAdapter,
};

export function adapterFor(provider: MlsProvider): MlsAdapter {
  return MLS_ADAPTERS[provider];
}

export * from "./types";
