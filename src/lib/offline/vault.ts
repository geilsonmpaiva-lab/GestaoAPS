"use client";

import type { SyncOperation } from "@/lib/domain/contracts";

const DB_NAME = "sgc-ubs-offline";
const DB_VERSION = 1;
const MAX_OFFLINE_MS = 72 * 60 * 60 * 1000;

type CipherRecord = { id: string; iv: string; value: string; updatedAt: number };
type VaultMeta = { id: "vault"; salt: string; verifiedAt: number; deviceId: string };

function encode(bytes: Uint8Array) {
  let binary = "";
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary);
}

function decode(value: string) {
  const binary = atob(value);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

async function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains("meta")) db.createObjectStore("meta", { keyPath: "id" });
      if (!db.objectStoreNames.contains("records")) db.createObjectStore("records", { keyPath: "id" });
      if (!db.objectStoreNames.contains("queue")) db.createObjectStore("queue", { keyPath: "id" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function transact<T>(db: IDBDatabase, storeName: string, mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, mode);
    const request = run(transaction.objectStore(storeName));
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function deriveKey(pin: string, salt: Uint8Array) {
  const material = await crypto.subtle.importKey("raw", new TextEncoder().encode(pin), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey({ name: "PBKDF2", salt: salt as BufferSource, iterations: 210_000, hash: "SHA-256" }, material, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
}

async function encrypt(key: CryptoKey, id: string, payload: unknown): Promise<CipherRecord> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const plain = new TextEncoder().encode(JSON.stringify(payload));
  const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, plain);
  return { id, iv: encode(iv), value: encode(new Uint8Array(encrypted)), updatedAt: Date.now() };
}

async function decrypt<T>(key: CryptoKey, record: CipherRecord): Promise<T> {
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: decode(record.iv) }, key, decode(record.value));
  return JSON.parse(new TextDecoder().decode(plain)) as T;
}

export class OfflineVault {
  private constructor(private db: IDBDatabase, private key: CryptoKey, public readonly deviceId: string) {}

  static async unlock(pin: string) {
    if (!/^[0-9]{6,12}$/.test(pin)) throw new Error("Use um PIN local de 6 a 12 dígitos.");
    const db = await openDatabase();
    let meta = await transact<VaultMeta | undefined>(db, "meta", "readonly", (store) => store.get("vault"));
    if (!meta) {
      if (!navigator.onLine) throw new Error("O primeiro desbloqueio exige conexão para registrar o dispositivo.");
      meta = { id: "vault", salt: encode(crypto.getRandomValues(new Uint8Array(16))), verifiedAt: Date.now(), deviceId: crypto.randomUUID() };
      await transact(db, "meta", "readwrite", (store) => store.put(meta));
    }
    if (Date.now() - meta.verifiedAt > MAX_OFFLINE_MS) throw new Error("A autorização offline expirou. Conecte-se para validar o dispositivo.");
    const key = await deriveKey(pin, decode(meta.salt));
    const verifier = await transact<CipherRecord | undefined>(db, "records", "readonly", (store) => store.get("__verifier"));
    if (verifier) await decrypt<{ valid: true }>(key, verifier);
    else {
      const verifierRecord = await encrypt(key, "__verifier", { valid: true });
      await transact(db, "records", "readwrite", (store) => store.put(verifierRecord));
    }
    return new OfflineVault(db, key, meta.deviceId);
  }

  async markOnlineVerification() {
    const meta = await transact<VaultMeta>(this.db, "meta", "readonly", (store) => store.get("vault"));
    await transact(this.db, "meta", "readwrite", (store) => store.put({ ...meta, verifiedAt: Date.now() }));
  }

  async putRecord<T>(id: string, value: T) {
    const record = await encrypt(this.key, id, value);
    await transact(this.db, "records", "readwrite", (store) => store.put(record));
  }

  async getRecord<T>(id: string): Promise<T | null> {
    const record = await transact<CipherRecord | undefined>(this.db, "records", "readonly", (store) => store.get(id));
    return record ? decrypt<T>(this.key, record) : null;
  }

  async enqueue(operation: Omit<SyncOperation, "operationId" | "deviceId" | "occurredAt">) {
    const item: SyncOperation = { ...operation, operationId: crypto.randomUUID(), deviceId: this.deviceId, occurredAt: new Date().toISOString() };
    const record = await encrypt(this.key, item.operationId, item);
    await transact(this.db, "queue", "readwrite", (store) => store.put(record));
    return item;
  }

  async queued(): Promise<SyncOperation[]> {
    const records = await transact<CipherRecord[]>(this.db, "queue", "readonly", (store) => store.getAll());
    return Promise.all(records.map((record) => decrypt<SyncOperation>(this.key, record)));
  }

  async acknowledge(operationIds: string[]) {
    const transaction = this.db.transaction("queue", "readwrite");
    operationIds.forEach((id) => transaction.objectStore("queue").delete(id));
    await new Promise<void>((resolve, reject) => { transaction.oncomplete = () => resolve(); transaction.onerror = () => reject(transaction.error); });
  }

  static async purge() {
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.deleteDatabase(DB_NAME);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
      request.onblocked = () => resolve();
    });
    if ("caches" in window) {
      const keys = await caches.keys();
      await Promise.all(keys.filter((key) => key.startsWith("sgc-ubs-")).map((key) => caches.delete(key)));
    }
  }
}
