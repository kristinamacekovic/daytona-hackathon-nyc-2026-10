import { VARIANTS } from "./types";

// A partial run (e.g. one track rate-limited) must never replace the stage fallback.
export const isCompleteRun = (optionCount: number) => optionCount === VARIANTS.length;
