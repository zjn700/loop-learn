import { Injectable } from '@angular/core';
import { LoopList } from '../models/loop';

const DB_NAME = 'LoopLearnDB';
const STORE_NAME = 'handles';
const KEY_NAME = 'libraryDirHandle';

@Injectable({
    providedIn: 'root',
})
export class FileStorageService {
    private _directoryHandle: any = null; // FileSystemDirectoryHandle

    constructor() {
        if (typeof window !== 'undefined') {
            this.initDB();
        }
    }

    // --- IndexedDB Helpers for Persistence ---
    private initDB(): Promise<void> {
        if (typeof window === 'undefined') return Promise.resolve();
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(DB_NAME, 1);
            request.onupgradeneeded = (event: any) => {
                const db = event.target.result;
                if (!db.objectStoreNames.contains(STORE_NAME)) {
                    db.createObjectStore(STORE_NAME);
                }
            };
            request.onsuccess = () => resolve();
            request.onerror = (e) => reject(e);
        });
    }

    private async getStoredHandle(): Promise<any> {
        if (typeof window === 'undefined') return null;
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(DB_NAME, 1);
            request.onsuccess = (event: any) => {
                const db = event.target.result;
                const tx = db.transaction(STORE_NAME, 'readonly');
                const store = tx.objectStore(STORE_NAME);
                const getReq = store.get(KEY_NAME);
                getReq.onsuccess = () => resolve(getReq.result);
                getReq.onerror = () => reject(getReq.error);
            };
            request.onerror = () => reject(request.error);
        });
    }

    private async storeHandle(handle: any): Promise<void> {
        if (typeof window === 'undefined') return;
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(DB_NAME, 1);
            request.onsuccess = (event: any) => {
                const db = event.target.result;
                const tx = db.transaction(STORE_NAME, 'readwrite');
                const store = tx.objectStore(STORE_NAME);
                const putReq = store.put(handle, KEY_NAME);
                putReq.onsuccess = () => resolve();
                putReq.onerror = () => reject(putReq.error);
            };
            request.onerror = () => reject(request.error);
        });
    }

    // --- Directory Operations ---

    get currentDirectoryHandle(): any {
        return this._directoryHandle;
    }

    get isFileSystemAccessSupported(): boolean {
        return typeof window !== 'undefined' && 'showDirectoryPicker' in window;
    }

    /**
     * Prompt user to select a folder. Persists the handle.
     */
    async selectBaseFolder(): Promise<void> {
        if (!this.isFileSystemAccessSupported) throw new Error('Not supported');
        const handle = await (window as any).showDirectoryPicker({
            mode: 'readwrite',
        });
        this._directoryHandle = handle;
        await this.storeHandle(handle);
    }

    /**
     * Try to restore handle from DB.
     * NOTE: Permissions might need to be re-verified by user action.
     */
    async restoreDirectoryHandle(): Promise<boolean> {
        const handle = await this.getStoredHandle();
        if (handle) {
            this._directoryHandle = handle;
            return true;
        }
        return false;
    }

    /**
     * Check if we have read/write permission.
     * If not, request it (requires user gesture if strictly requesting).
     */
    async verifyPermission(readWrite: boolean = true): Promise<boolean> {
        if (!this._directoryHandle) return false;
        const opts = { mode: readWrite ? 'readwrite' : 'read' };
        if ((await this._directoryHandle.queryPermission(opts)) === 'granted') {
            return true;
        }
        if ((await this._directoryHandle.requestPermission(opts)) === 'granted') {
            return true;
        }
        return false;
    }

    /**
     * List all JSON files in the directory with metadata.
     */
    async getFiles(): Promise<{ name: string; handle: any; lastModified: number }[]> {
        if (!this._directoryHandle) return [];
        const files: { name: string; handle: any; lastModified: number }[] = [];
        for await (const entry of (this._directoryHandle as any).values()) {
            if (entry.kind === 'file' && entry.name.endsWith('.json')) {
                try {
                    const file = await entry.getFile();
                    files.push({
                        name: entry.name,
                        handle: entry,
                        lastModified: file.lastModified
                    });
                } catch (e) {
                    console.warn(`Failed to read metadata for ${entry.name}`, e);
                    // Fallback if getFile fails (rare, but good for robustness)
                    files.push({
                        name: entry.name,
                        handle: entry,
                        lastModified: 0
                    });
                }
            }
        }
        return files;
    }

    /**
     * Read a file directly from a FileHandle (from getFiles list)
     */
    async loadFile(fileHandle: any): Promise<LoopList> {
        const file = await fileHandle.getFile();
        return await this.readFile(file);
    }

    private sanitizeFilename(name: string): string {
        return name.replace(/[<>:"\/\\|?*]/g, '-');
    }

    /**
     * Save to the current directory with the given filename (title).
     */
    async saveToFolder(filename: string, data: LoopList): Promise<void> {
        if (!this._directoryHandle) throw new Error('No folder selected');

        // Sanitize and ensure .json extension
        const safeName = this.sanitizeFilename(filename);
        const name = safeName.endsWith('.json') ? safeName : `${safeName}.json`;

        // Create/Update file in the directory
        const fileHandle = await this._directoryHandle.getFileHandle(name, { create: true });
        const writable = await fileHandle.createWritable();
        await writable.write(JSON.stringify(data, null, 2));
        await writable.close();
    }

    // --- Legacy / Single File Utils ---

    async saveFile(data: LoopList, suggestedName: string = 'loop-list'): Promise<void> {
        const jsonStr = JSON.stringify(data, null, 2);
        const safeName = this.sanitizeFilename(suggestedName);
        const fileName = safeName.endsWith('.json') ? safeName : `${safeName}.json`;

        try {
            if (typeof window !== 'undefined' && 'showSaveFilePicker' in window) {
                const handle = await (window as any).showSaveFilePicker({
                    suggestedName: fileName,
                    types: [{ description: 'JSON Files', accept: { 'application/json': ['.json'] } }],
                });
                const writable = await handle.createWritable();
                await writable.write(jsonStr);
                await writable.close();
            } else {
                this.downloadFile(jsonStr, fileName);
            }
        } catch (err: any) {
            if (err.name !== 'AbortError') console.error('Failed to save file:', err);
        }
    }

    async openFile(): Promise<LoopList | null> {
        if (typeof window === 'undefined') return null;
        try {
            if ('showOpenFilePicker' in window) {
                const [handle] = await (window as any).showOpenFilePicker({
                    types: [{ description: 'JSON Files', accept: { 'application/json': ['.json'] } }],
                    multiple: false,
                });
                const file = await handle.getFile();
                return await this.readFile(file);
            }
            return null;
        } catch (err: any) {
            if (err.name !== 'AbortError') console.error('Failed to open file:', err);
            return null;
        }
    }

    async readFile(file: File): Promise<LoopList> {
        const text = await file.text();
        const data = JSON.parse(text);
        return this.reviveDates(data);
    }

    private reviveDates(data: any): LoopList {
        if (data.createdAt) data.createdAt = new Date(data.createdAt);
        if (data.updatedAt) data.updatedAt = new Date(data.updatedAt);
        return data as LoopList;
    }

    private downloadFile(content: string, fileName: string) {
        const blob = new Blob([content], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }
}
