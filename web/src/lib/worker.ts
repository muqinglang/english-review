import { createHash, randomBytes } from "node:crypto";
import { serverEnv } from "@/lib/env";

export function newWorkerToken() { return `crw_${randomBytes(24).toString("base64url")}`; }
export function workerTokenHash(token: string) { return createHash("sha256").update(`${serverEnv.workerTokenPepper}:${token}`).digest("hex"); }
export function slugify(value: string) { return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 48) || "general"; }
