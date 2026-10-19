"use client";

import type { SyncOperation } from "@/lib/domain/contracts";
import { OFFLINE_AUTHORIZATION_KEY, isOfflineAuthorization, type OfflineAuthorization } from "./authorization";

const DB_NAME = "sgc-ubs-offline";
const DB_VERSION = 1;
const MAX_OFFLINE_MS = 72 * 60 * 60 * 1000;

type CipherRecord = { id: string; iv: string; value: string; updatedAt: number };
type VaultMeta = { id: "vault"; salt: string; verifiedAt: number; deviceId: string; userId?: string; organizationId?: string; blocked?: boolean;lastSeenAt?:number };
const connections = new Set<IDBDatabase>();

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
    request.onsuccess = () => { const db = request.result; connections.add(db); db.onversionchange = () => { db.close(); connections.delete(db); }; resolve(db); };
    request.onerror = () => reject(request.error);
  });
}

function transact<T>(db: IDBDatabase, storeName: string, mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, mode);
    const request = run(transaction.objectStore(storeName));
    transaction.oncomplete = () => resolve(request.result);
    transaction.onabort = () => reject(transaction.error ?? new Error('A gravação local foi interrompida.'));
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
  static active: OfflineVault | null = null;
  private constructor(private db: IDBDatabase, private key: CryptoKey, public readonly deviceId: string, public readonly identity: {userId?:string;organizationId?:string}) {}

  static async resume(pin: string) {
    const db=await openDatabase();
    const meta=await transact<VaultMeta|undefined>(db,'meta','readonly',store=>store.get('vault'));
    db.close(); connections.delete(db);
    if(!meta?.userId||!meta.organizationId) throw new Error('Prepare o cofre online com sua conta antes de usar o modo offline.');
    return OfflineVault.unlock(pin,{userId:meta.userId,organizationId:meta.organizationId});
  }

  static async unlock(pin: string, identity?: { userId: string; organizationId: string }) {
    if (!/^[0-9]{6,12}$/.test(pin)) throw new Error("Use um PIN local de 6 a 12 dígitos.");
    const db = await openDatabase();
    let meta = await transact<VaultMeta | undefined>(db, "meta", "readonly", (store) => store.get("vault"));
    if (!meta) {
      if (!navigator.onLine) throw new Error("O primeiro desbloqueio exige conexão para registrar o dispositivo.");
      meta = { id: "vault", salt: encode(crypto.getRandomValues(new Uint8Array(16))), verifiedAt: 0, deviceId: crypto.randomUUID(), ...identity };
      await transact(db, "meta", "readwrite", (store) => store.put(meta));
    }
    if (identity && meta.userId && (identity.userId !== meta.userId || identity.organizationId !== meta.organizationId)) { db.close(); throw new Error('Este cofre pertence a outra conta ou organização. Saia da conta anterior antes de continuar.'); }
    if (!navigator.onLine && Date.now() - meta.verifiedAt > MAX_OFFLINE_MS) { db.close(); throw new Error("A autorização offline expirou. Conecte-se para validar o dispositivo."); }
    const key = await deriveKey(pin, decode(meta.salt));
    const verifier = await transact<CipherRecord | undefined>(db, "records", "readonly", (store) => store.get("__verifier"));
    if (verifier && identity && !meta.userId) throw new Error('Cofre antigo sem identificação. Entre pela interface anterior e sincronize seus itens antes de migrar.');
    if (verifier) {
      try { await decrypt<{ valid: true }>(key, verifier); }
      catch { db.close(); connections.delete(db); throw new Error('PIN incorreto. Seus dados locais foram preservados.'); }
    }
    else {
      const verifierRecord = await encrypt(key, "__verifier", { valid: true });
      await transact(db, "records", "readwrite", (store) => store.put(verifierRecord));
    }
    if (identity && !meta.userId) await transact(db, 'meta', 'readwrite', store => store.put({ ...meta, ...identity }));
    const vault = new OfflineVault(db, key, meta.deviceId, {userId:meta.userId,organizationId:meta.organizationId});
    return vault;
  }

  async assertAuthorized() {
    const now=Date.now();
    const meta=await new Promise<VaultMeta|undefined>((resolve,reject)=>{
      const transaction=this.db.transaction('meta','readwrite');const store=transaction.objectStore('meta');const read=store.get('vault');
      let current:VaultMeta|undefined;
      read.onsuccess=()=>{current=read.result;if(current&&now>(current.lastSeenAt??0))store.put({...current,lastSeenAt:now});};
      transaction.oncomplete=()=>resolve(current);transaction.onabort=()=>reject(transaction.error??new Error('Falha ao validar o cofre.'));
    });
    if (!meta || meta.blocked || !meta.verifiedAt || now+5*60*1000 < Math.max(meta.verifiedAt,meta.lastSeenAt??0) || now - meta.verifiedAt > MAX_OFFLINE_MS) throw new Error('Cofre expirado ou acesso revogado. Reconecte e valide o dispositivo. As pendências cifradas foram preservadas.');
  }

  async assertIdentity(userId: string, organizationId: string) {
    await this.assertAuthorized();
    const meta = await transact<VaultMeta>(this.db, 'meta', 'readonly', store => store.get('vault'));
    if (meta.userId !== userId || meta.organizationId !== organizationId) throw new Error('Desbloqueie o cofre para a conta e organização atuais.');
  }

  static activate(vault: OfflineVault) { OfflineVault.active = vault; window.dispatchEvent(new Event('sgc-vault-change')); }

  async listRecords<T>(prefix: string): Promise<Array<{id:string; value:T}>> {
    await this.assertAuthorized();
    const records = await transact<CipherRecord[]>(this.db, 'records', 'readonly', store => store.getAll());
    return Promise.all(records.filter(r => r.id.startsWith(prefix)).map(async r => ({id:r.id, value:await decrypt<T>(this.key,r)})));
  }

  async removeRecord(id: string) { if(id===OFFLINE_AUTHORIZATION_KEY)throw new Error('Metadado de autorização reservado.'); await this.assertAuthorized(); await transact(this.db, 'records', 'readwrite', store => store.delete(id)); window.dispatchEvent(new Event('sgc-vault-change')); }

  async invalidateAuthorization() {
    const meta=await transact<VaultMeta>(this.db,'meta','readonly',store=>store.get('vault'));
    await transact(this.db,'meta','readwrite',store=>store.put({...meta,blocked:true,verifiedAt:0}));
    OfflineVault.active=null;
    window.dispatchEvent(new Event('sgc-vault-change'));
  }

  async verificationContext<T>(id: "workspace" | typeof OFFLINE_AUTHORIZATION_KEY = "workspace") {
    // Only available after PIN verification; used to revalidate an expired
    // authorization, not to render expired business data.
    if(id!=="workspace"&&id!==OFFLINE_AUTHORIZATION_KEY)throw new Error('Metadado de verificação inválido.');
    const record=await transact<CipherRecord|undefined>(this.db,'records','readonly',store=>store.get(id));
    return record?decrypt<T>(this.key,record):null;
  }

  async hasStoredVerificationData() {
    // Inspect keys/counts only, never decrypt expired drafts or clinical content.
    const meta=await transact<VaultMeta|undefined>(this.db,'meta','readonly',store=>store.get('vault'));
    const keys=await transact<IDBValidKey[]>(this.db,'records','readonly',store=>store.getAllKeys());
    const queued=await transact<number>(this.db,'queue','readonly',store=>store.count());
    return !meta||!!meta.blocked||meta.verifiedAt>0||queued>0||keys.some(key=>key!=="__verifier"&&key!==OFFLINE_AUTHORIZATION_KEY);
  }

  async markOnlineVerification(verifiedAt = new Date().toISOString(), authorization?: OfflineAuthorization) {
    const timestamp=Date.parse(verifiedAt);
    if(!Number.isFinite(timestamp)||Math.abs(timestamp-Date.now())>5*60*1000) throw new Error('Horário do dispositivo divergente do servidor. Corrija o relógio antes de continuar.');
    if(authorization&&(!isOfflineAuthorization(authorization)||authorization.userId!==this.identity.userId||authorization.organizationId!==this.identity.organizationId))throw new Error('Autorização do cofre pertence a outro contexto.');
    const record=authorization?await encrypt(this.key,OFFLINE_AUTHORIZATION_KEY,authorization):undefined;
    // Baseline and expiration are committed together. A crash cannot renew a vault
    // without persisting its verified restricted-authorization baseline.
    await new Promise<void>((resolve,reject)=>{
      const transaction=this.db.transaction(['meta','records'],'readwrite');const store=transaction.objectStore('meta');const request=store.get('vault');
      request.onsuccess=()=>{
        const meta=request.result as VaultMeta|undefined;
        if(!meta||meta.blocked){transaction.abort();return;}
        if(record)transaction.objectStore('records').put(record);
        store.put({...meta,verifiedAt:timestamp,lastSeenAt:Date.now()});
      };
      transaction.oncomplete=()=>resolve();
      transaction.onabort=()=>reject(new Error('Cofre em quarentena. Pendências cifradas preservadas para tratamento autorizado.'));
      transaction.onerror=()=>reject(transaction.error??new Error('Falha ao confirmar a autorização do cofre.'));
    });
  }

  async putRecord<T>(id: string, value: T) {
    if(id===OFFLINE_AUTHORIZATION_KEY)throw new Error('Metadado de autorização reservado.');
    await this.assertAuthorized();
    const record = await encrypt(this.key, id, value);
    await transact(this.db, "records", "readwrite", (store) => store.put(record));
    window.dispatchEvent(new Event('sgc-vault-change'));
  }

  async getRecord<T>(id: string): Promise<T | null> {
    await this.assertAuthorized();
    const record = await transact<CipherRecord | undefined>(this.db, "records", "readonly", (store) => store.get(id));
    return record ? decrypt<T>(this.key, record) : null;
  }

  async enqueue(operation: Omit<SyncOperation, "operationId" | "deviceId" | "occurredAt">) {
    await this.assertAuthorized();
    const item: SyncOperation = { ...operation, operationId: crypto.randomUUID(), deviceId: this.deviceId, occurredAt: new Date().toISOString() };
    const record = await encrypt(this.key, item.operationId, item);
    await transact(this.db, "queue", "readwrite", (store) => store.put(record));
    window.dispatchEvent(new Event('sgc-vault-change'));
    return item;
  }

  async queued(): Promise<SyncOperation[]> {
    await this.assertAuthorized();
    const records = await transact<CipherRecord[]>(this.db, "queue", "readonly", (store) => store.getAll());
    return Promise.all(records.map((record) => decrypt<SyncOperation>(this.key, record)));
  }

  async acknowledge(operationIds: string[]) {
    await this.assertAuthorized();
    const transaction = this.db.transaction("queue", "readwrite");
    operationIds.forEach((id) => transaction.objectStore("queue").delete(id));
    await new Promise<void>((resolve, reject) => { transaction.oncomplete = () => resolve(); transaction.onerror = () => reject(transaction.error); });
    window.dispatchEvent(new Event('sgc-vault-change'));
  }

  static async purge() {
    OfflineVault.active = null;
    for (const db of connections) db.close();
    connections.clear();
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.deleteDatabase(DB_NAME);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
      request.onblocked = () => reject(new Error('Feche outras abas do SGC-UBS para concluir a limpeza do cofre.'));
    });
    if ("caches" in window) {
      const keys = await caches.keys();
      // Public shell/JS contains no user data and must survive logout so the
      // worker can still show the locked screen. All encrypted account data above
      // is deleted; historical non-public caches are removed as well.
      await Promise.all(keys.filter((key) => key.startsWith("sgc-ubs-")&&!key.startsWith('sgc-ubs-public-')).map((key) => caches.delete(key)));
    }
  }
}
