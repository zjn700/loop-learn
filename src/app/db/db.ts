import Dexie, { Table } from 'dexie';

import { LoopList } from '../models/loop';

export interface HandleEntry {
    id: string;
    handle: any; // FileSystemDirectoryHandle or FileSystemFileHandle
}

export class AppDatabase extends Dexie {
    handles!: Table<HandleEntry, string>;
    loops!: Table<LoopList, string>;

    constructor() {
        super('LoopLearnDB');
        this.version(1).stores({
            handles: 'id',
            loops: 'id, title, updatedAt'
        });
    }
}

export const db = new AppDatabase();
