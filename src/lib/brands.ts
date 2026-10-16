import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { slugify } from "./slug";

const FILE = path.join(process.cwd(), ".data", "brands.json");
const SEED = ["Glossier", "Nike", "Liquid Death"];

export async function listBrands(): Promise<string[]> {
  try {
    return JSON.parse(await readFile(FILE, "utf8"));
  } catch {
    return SEED;
  }
}

export async function addBrand(name: string) {
  const brands = await listBrands();
  if (brands.some((b) => slugify(b) === slugify(name))) return;
  await mkdir(path.dirname(FILE), { recursive: true });
  await writeFile(FILE, JSON.stringify([...brands, name.trim()]));
}
