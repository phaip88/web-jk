/**
 * KV Abstraction Layer
 *
 * In production (EdgeOne Pages), this uses the platform KV binding.
 * In development, it falls back to a local JSON file for persistence.
 */

import fs from "fs";
import path from "path";

const LOCAL_KV_PATH = path.join(process.cwd(), ".kv-store.json");

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
    list(options?: { prefix?: string }): Promise<{ keys: { name: string }[] }>;
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

// ---------- Unified KV API ----------

export const kv = {
    async get(key: string): Promise<string | null> {
        const edge = getEdgeKV();
        if (edge) return edge.get(key);
        const store = readLocalStore();
        return store[key] ?? null;
    },

    async put(key: string, value: string): Promise<void> {
        const edge = getEdgeKV();
        if (edge) return edge.put(key, value);
        const store = readLocalStore();
        store[key] = value;
        writeLocalStore(store);
    },

    async delete(key: string): Promise<void> {
        const edge = getEdgeKV();
        if (edge) return edge.delete(key);
        const store = readLocalStore();
        delete store[key];
        writeLocalStore(store);
    },

    async list(prefix?: string): Promise<string[]> {
        const edge = getEdgeKV();
        if (edge) {
            const result = await edge.list({ prefix });
            return result.keys.map((k) => k.name);
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
