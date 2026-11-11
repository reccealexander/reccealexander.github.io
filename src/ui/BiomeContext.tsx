import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { biomeById, DEFAULT_BIOME, type Biome, type BiomeId } from "@/lib/biomes";
import { restartGrowth } from "@/three/growth";

type Ctx = { biome: Biome; setBiome: (id: BiomeId) => void };

const BiomeCtx = createContext<Ctx | null>(null);

export function BiomeProvider({ children }: { children: ReactNode }) {
  const [id, setId] = useState<BiomeId>(DEFAULT_BIOME);

  /*
   * The clock starts here rather than in an effect on `id`, and the guard
   * matters: choosing the biome you are already in must not replant anything.
   * The picker allows it — it is a radio group, and clicking the checked row is
   * a thing readers do — and an effect would answer that by growing the whole
   * field back in for no reason.
   */
  const setBiome = useCallback((next: BiomeId) => {
    setId((prev) => {
      if (next !== prev) restartGrowth();
      return next;
    });
  }, []);

  const value = useMemo(() => ({ biome: biomeById(id), setBiome }), [id, setBiome]);
  return <BiomeCtx.Provider value={value}>{children}</BiomeCtx.Provider>;
}

export function useBiome(): Ctx {
  const ctx = useContext(BiomeCtx);
  if (!ctx) throw new Error("useBiome outside BiomeProvider");
  return ctx;
}
