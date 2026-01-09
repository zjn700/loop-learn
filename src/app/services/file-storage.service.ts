import { Injectable } from '@angular/core';
import { LoopList } from '../models/loop';

import { db } from '../db/db';


@Injectable({
    providedIn: 'root',
})
export class FileStorageService {
    private _directoryHandle: any = null; // FileSystemDirectoryHandle

    constructor() {
        // Dexie handles init automatically
    }

    // --- IndexedDB Helpers for Persistence ---


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
        await db.handles.put({ id: 'libraryDirHandle', handle });
    }

    /**
     * Try to restore handle from DB.
     * NOTE: Permissions might need to be re-verified by user action.
     */
    async restoreDirectoryHandle(): Promise<boolean> {
        const entry = await db.handles.get('libraryDirHandle');
        if (entry && entry.handle) {
            this._directoryHandle = entry.handle;
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
        // Try reading from DB first to see what we have
        // However, the original method returns file handles.
        // For Hybrid, we want to return LoopList objects mostly.
        // But for compatibility with existing components that expect file list...
        // Let's keep this as "Directory File List" helper.

        if (!this._directoryHandle) return [];
        const files: { name: string; handle: any; lastModified: number }[] = [];
        try {
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
                        files.push({ name: entry.name, handle: entry, lastModified: 0 });
                    }
                }
            }
        } catch (e) {
            console.warn('Error reading directory handle', e);
            // If handle is stale, stick to DB?
        }
        return files;
    }

    /**
     * Primary method to get all loops.
     * Strategy:
     * 1. If we have a directory handle, Sync it (read files, update DB).
     * 2. Return all loops from DB.
     */
    async getAllLoops(): Promise<LoopList[]> {
        if (this._directoryHandle) {
            await this.syncDirectory();
        }
        return db.loops.toArray();
    }

    /**
     * Syncs the currently selected directory with the DB.
     * - Reads all .json files
     * - Parses them
     * - Updates/Inserts into DB
     */
    async syncDirectory(): Promise<void> {
        if (!this._directoryHandle) return;
        const fileEntries = await this.getFiles();

        for (const entry of fileEntries) {
            try {
                const loop = await this.loadFile(entry.handle);
                // Upsert into DB based on title or some ID?
                // Our loop model might not have a consistent ID. 
                // Let's use 'title' as a soft key for duplications or just put it in.
                // ideally loops have a UUID.

                // For now, we put. If ID exists it updates, else adds.
                // We need to query if a loop with this title exists to avoid duplicates if ID is missing.

                // Simple Sync: Check if title exists to prevent duplicates on first import
                const existing = await db.loops.where('title').equals(loop.title).first();
                if (existing) {
                    loop.id = existing.id; // Preserve DB ID
                } else if (!loop.id) {
                    loop.id = crypto.randomUUID(); // Generate new ID if missing
                }

                await db.loops.put(loop);
            } catch (err) {
                console.error('Failed to sync file', entry.name, err);
            }
        }
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
        // 1. Ensure ID exists
        if (!data.id) {
            data.id = crypto.randomUUID();
        }

        // Upsert to DB
        await db.loops.put(data);


        // 2. Save to File System (Secondary / Sync)
        if (this._directoryHandle) {
            try {
                // Sanitize and ensure .json extension
                const safeName = this.sanitizeFilename(filename);
                const name = safeName.endsWith('.json') ? safeName : `${safeName}.json`;

                // Create/Update file in the directory
                const fileHandle = await this._directoryHandle.getFileHandle(name, { create: true });
                const writable = await fileHandle.createWritable();
                await writable.write(JSON.stringify(data, null, 2));
                await writable.close();
            } catch (e) {
                console.warn('Failed to save to file system (access denied?)', e);
                // Don't crash app, just warn, since DB save worked.
            }
        }
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
