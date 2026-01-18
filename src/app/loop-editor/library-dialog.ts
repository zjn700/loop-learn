import { Component, OnInit, signal, computed } from '@angular/core';
import { CommonModule, DatePipe, NgFor, NgIf } from '@angular/common';
import { LoopList } from '../models/loop';
import { FormsModule } from '@angular/forms';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { FileStorageService } from '../services/file-storage.service';
import { MatSnackBar } from '@angular/material/snack-bar';

@Component({
    selector: 'app-library-dialog',
    template: `
    <h2 mat-dialog-title>Saved Loop Lists</h2>
    <mat-dialog-content>
      <!-- Hidden for cleaner UX (DB-only mode) -->
      <!-- <div *ngIf="!hasLibraryFolder() && isFileSystemAccessSupported" class="mb-4 p-3 bg-blue-50 border border-blue-200 rounded flex items-center justify-between">
        <div class="flex items-center space-x-2 text-blue-800">
           <mat-icon>folder_open</mat-icon>
           <span class="text-sm">Connect a folder to sync your loops to disk.</span>
        </div>
        <button mat-stroked-button color="primary" (click)="selectFolder()" class="text-sm">
          Connect Folder
        </button>
      </div> -->

      <div class="space-y-4">
        <div class="flex justify-between items-center bg-gray-50 p-3 rounded">
            <div class="flex items-center space-x-2">
                <mat-icon class="text-gray-500">folder_special</mat-icon>
                <div class="flex flex-col">
                    <span class="text-sm font-medium">Saved Loops ({{ libraryLoops().length }})</span>
                    <!-- Sorting Controls -->
                    <select [ngModel]="sortOption()" (ngModelChange)="sortOption.set($event)" 
                        class="text-xs border rounded p-1 mt-1 bg-white">
                        <option value="modified-desc">Date Modified (Newest)</option>
                        <option value="modified-asc">Date Modified (Oldest)</option>
                        <option value="name-asc">Name (A-Z)</option>
                        <option value="name-desc">Name (Z-A)</option>
                    </select>
                </div>
            </div>
            <div class="flex space-x-2">
                <!-- Only show Edit Folder if we actually have one connected -->
                <!-- <button *ngIf="hasLibraryFolder()" mat-icon-button (click)="selectFolder()" title="Change Folder">
                    <mat-icon>edit</mat-icon>
                </button> -->
                <button mat-icon-button (click)="refresh()" title="Refresh">
                    <mat-icon>refresh</mat-icon>
                </button>
            </div>
        </div>

        <!-- <div *ngIf="!isLibraryAccessGranted()" class="p-4 bg-yellow-50 rounded border border-yellow-200 text-center">
             <p class="mb-2 text-sm text-yellow-800">Permission needed to access this folder.</p>
             <button mat-stroked-button color="accent" (click)="verifyPermission()">
                Grant Permission
             </button>
        </div> -->

        <div *ngIf="isLibraryAccessGranted() || hasLibraryFolder() || true">
             <!-- Always show list if we have DB items, even if no folder connected -->
             <div *ngIf="libraryLoops().length === 0" class="text-center py-8 text-gray-500 italic">
                No saved loops found in library.
             </div>

             <ul class="space-y-1 max-h-80 overflow-y-auto">
                <li *ngFor="let loop of sortedLoops()">
                  <button mat-button class="w-full text-left !justify-start hover:bg-gray-100" (click)="loadLoop(loop)">
                    <mat-icon class="text-gray-400 !mr-2">description</mat-icon>
                    <div class="flex flex-col items-start overflow-hidden w-full">
                        <span class="truncate w-full font-medium">{{ loop.title || 'Untitled' }}</span>
                        <span class="text-xs text-gray-400" *ngIf="loop.updatedAt">
                            {{ loop.updatedAt | date:'medium' }}
                        </span>
                    </div>
                  </button>
                </li>
             </ul>
        </div>
      </div>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-stroked-button (click)="openFromFile()">
          <mat-icon>folder_open</mat-icon> Open File
      </button>
      <input type="file" #fileInput (change)="onFileSelected($event)" accept=".json" style="display:none" />
      <button mat-button mat-dialog-close>Close</button>
    </mat-dialog-actions>
  `,
    standalone: true,
    imports: [
        CommonModule,
        MatDialogModule,
        MatButtonModule,
        MatIconModule,
        NgIf,
        NgFor,
        DatePipe,
        FormsModule,
    ]
})
export class LibraryDialogComponent implements OnInit {

    libraryLoops = signal<LoopList[]>([]);
    sortOption = signal<'name-asc' | 'name-desc' | 'modified-desc' | 'modified-asc'>('modified-desc');

    get isFileSystemAccessSupported(): boolean {
        return this.fileStorage.isFileSystemAccessSupported;
    }

    sortedLoops = computed(() => {
        const loops = [...this.libraryLoops()];
        const option = this.sortOption();

        return loops.sort((a, b) => {
            const timeA = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
            const timeB = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
            const nameA = a.title || '';
            const nameB = b.title || '';

            switch (option) {
                case 'name-asc':
                    return nameA.localeCompare(nameB);
                case 'name-desc':
                    return nameB.localeCompare(nameA);
                case 'modified-desc':
                    return timeB - timeA;
                case 'modified-asc':
                    return timeA - timeB;
                default:
                    return 0;
            }
        });
    });

    isLibraryAccessGranted = signal(false);
    hasLibraryFolder = signal(false);

    constructor(
        private dialogRef: MatDialogRef<LibraryDialogComponent>,
        private fileStorage: FileStorageService,
        private snackBar: MatSnackBar
    ) { }

    ngOnInit() {
        this.initLibrary();
    }

    async initLibrary() {
        // Check if we have a stored handle
        const restored = await this.fileStorage.restoreDirectoryHandle();
        this.hasLibraryFolder.set(restored);

        if (restored) {
            // Check permission without prompting
            const granted = await this.fileStorage.verifyPermission(false);
            this.isLibraryAccessGranted.set(granted);
        }
        // Always refresh loops from DB
        this.refresh();
    }

    async selectFolder() {
        try {
            await this.fileStorage.selectBaseFolder();
            this.hasLibraryFolder.set(true);
            this.isLibraryAccessGranted.set(true);
            await this.refresh();
        } catch (e: any) {
            if (e.name !== 'AbortError') {
                console.error('Select folder failed', e);
                this.snackBar.open('Failed to select folder', 'OK');
            }
        }
    }

    async verifyPermission() {
        try {
            const granted = await this.fileStorage.verifyPermission(true);
            this.isLibraryAccessGranted.set(granted);
            if (granted) {
                this.refresh();
            }
        } catch (e) {
            console.error('Permission verification failed', e);
        }
    }

    async refresh() {
        try {
            const loops = await this.fileStorage.getAllLoops();
            this.libraryLoops.set(loops);
        } catch (e) {
            console.error('Failed to list loops', e);
            this.libraryLoops.set([]);
        }
    }

    loadLoop(loop: LoopList) {
        this.dialogRef.close(loop);
    }

    async openFromFile() {
        if (this.fileStorage.isFileSystemAccessSupported) {
            try {
                const data = await this.fileStorage.openFile();
                if (data) {
                    this.dialogRef.close(data);
                }
            } catch (e) {
                console.error('Failed to open file', e);
                this.snackBar.open('Failed to open file', 'OK');
            }
        } else {
            // Fallback for Safari/Legacy
            const input = document.querySelector('input[type="file"]') as HTMLInputElement;
            if (input) input.click();
        }
    }

    async onFileSelected(event: any) {
        const file = event.target.files[0];
        if (!file) return;
        try {
            const data = await this.fileStorage.readFile(file);
            this.dialogRef.close(data);
            // Reset input
            event.target.value = '';
        } catch (e) {
            console.error('Read file failed', e);
            this.snackBar.open('Failed to read file', 'OK');
        }
    }
}
