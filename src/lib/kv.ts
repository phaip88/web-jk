/**
 * KV Abstraction Layer
 *
 * In production (EdgeOne Pages), this uses the platform KV binding.
 * In development, it falls back to a local JSON file for persistence.
 */

import fs from "fs";
import path from "path";
import { headers } from "next/headers";

const LOCAL_KV_PATH = path.join(process.cwd(), ".kv-store.json");

type KVBackend = "edge" | "edge-bridge" | "local-file" | "unconfigured";

export class KVStorageUnavailableError extends Error {
    constructor(message = "当前部署未配置可写持久化存储，请先绑定 KV 或外部数据库。") {
        super(message);
        this.name = "KVStorageUnavailableError";
    }
}

// ---------- Local dev KV (JSON file) ----------

function readLocalStore(): Record<string, string> {
    try {
        if (fs.existsSync(LOCAL_KV_PATH)) {
            return JSON.parse(fs.readFileSync(LOCAL_KV_PATH, "utf-8"));
        }
    } catch {
        // corrupted file, reset
    }
    return {};
}

function writeLocalStore(data: Record<string, string>) {
    fs.writeFileSync(LOCAL_KV_PATH, JSON.stringify(data, null, 2), "utf-8");
}

// ---------- Edge KV interface ----------

interface EdgeKVNamespace {
    get(key: string): Promise<string | null>;
    put(key: string, value: string): Promise<void>;
    delete(key: string): Promise<void>;
    list(options?: { prefix?: string }): Promise<{ keys: Array<{ name?: string; key?: string }> }>;
}

function getEdgeKV(): EdgeKVNamespace | null {
    // EdgeOne Pages injects a global KV namespace.
    // Adapt this to your actual binding name.
    const g = globalThis as Record<string, unknown>;
    if (g.__EDGE_KV__) {
        return g.__EDGE_KV__ as EdgeKVNamespace;
    }
    return null;
}

function allowLocalFileKV(): boolean {
    return process.env.NODE_ENV !== "production" || process.env.ALLOW_FILE_KV === "true";
}

export function getKVStatus(): { backend: KVBackend; writable: boolean } {
    if (getEdgeKV()) {
        return { backend: "edge", writable: true };
    }

    if (allowLocalFileKV()) {
        return { backend: "local-file", writable: true };
    }

    return { backend: "unconfigured", writable: false };
}

async function resolveBridgeOrigin(): Promise<string> {
    if (process.env.KV_BRIDGE_ORIGIN) {
        return process.env.KV_BRIDGE_ORIGIN;
    }

    const headerStore = await headers();
    const proto = headerStore.get("x-forwarded-proto") ?? "https";
    const host = headerStore.get("x-forwarded-host") ?? headerStore.get("host");

    if (!host) {
        throw new KVStorageUnavailableError("无法确定 Edge KV 桥接地址，请设置 KV_BRIDGE_ORIGIN。",);
    }

    return `${proto}://${host}`;
}

async function bridgeRequest<T>(operation: string, payload?: Record<string, unknown>): Promise<T> {
    const origin = await resolveBridgeOrigin();
    const response = await fetch(`${origin}/internal/kv/${operation}`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            ...(process.env.KV_BRIDGE_SECRET
                ? { "x-kv-bridge-secret": process.env.KV_BRIDGE_SECRET }
                : {}),
        },
        body: JSON.stringify(payload ?? {}),
        cache: "no-store",
    });

    const result = (await response.json().catch(() => null)) as
        | { success?: boolean; data?: T; error?: string }
        | null;

    if (!response.ok || !result?.success) {
        throw new KVStorageUnavailableError(result?.error || "Edge KV bridge request failed.");
    }

    return result.data as T;
}

async function getProductionStatus(): Promise<{ backend: KVBackend; writable: boolean }> {
    try {
        const data = await bridgeRequest<{ backend: string; writable: boolean }>("status");
        return {
            backend: data.backend === "edge" ? "edge-bridge" : "unconfigured",
            writable: data.writable,
        };
    } catch {
        return { backend: "unconfigured", writable: false };
    }
}

export async function getResolvedKVStatus(): Promise<{ backend: KVBackend; writable: boolean }> {
    const direct = getKVStatus();
    if (direct.backend !== "unconfigured") {
        return direct;
    }

    return getProductionStatus();
}

function requireWritableStore(): void {
    if (!getKVStatus().writable) {
        throw new KVStorageUnavailableError();
    }
}

// ---------- Unified KV API ----------

export const kv = {
    async get(key: string): Promise<string | null> {
        const edge = getEdgeKV();
        if (edge) return edge.get(key);
        if (!allowLocalFileKV()) {
            return bridgeRequest<string | null>("get", { key });
        }
        const store = readLocalStore();
        return store[key] ?? null;
    },

    async put(key: string, value: string): Promise<void> {
        const edge = getEdgeKV();
        if (edge) return edge.put(key, value);
        if (!allowLocalFileKV()) {
            await bridgeRequest("put", { key, value });
            return;
        }
        requireWritableStore();
        const store = readLocalStore();
        store[key] = value;
        writeLocalStore(store);
    },

    async delete(key: string): Promise<void> {
        const edge = getEdgeKV();
        if (edge) return edge.delete(key);
        if (!allowLocalFileKV()) {
            await bridgeRequest("delete", { key });
            return;
        }
        requireWritableStore();
        const store = readLocalStore();
        delete store[key];
        writeLocalStore(store);
    },

    async list(prefix?: string): Promise<string[]> {
        const edge = getEdgeKV();
        if (edge) {
            const result = await edge.list({ prefix });
            return result.keys.map((k) => k.name ?? k.key ?? "").filter(Boolean);
        }
        if (!allowLocalFileKV()) {
            return bridgeRequest<string[]>("list", { prefix });
        }
        const store = readLocalStore();
        const keys = Object.keys(store);
        if (prefix) return keys.filter((k) => k.startsWith(prefix));
        return keys;
    },

    // Helpers for typed JSON storage
    async getJSON<T>(key: string): Promise<T | null> {
        const raw = await this.get(key);
        if (!raw) return null;
        try {
            return JSON.parse(raw) as T;
        } catch {
            return null;
        }
    },

    async putJSON<T>(key: string, value: T): Promise<void> {
        await this.put(key, JSON.stringify(value));
    },
};
