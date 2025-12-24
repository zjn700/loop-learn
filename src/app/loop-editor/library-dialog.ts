import { Component, OnInit, signal } from '@angular/core';
import { CommonModule, DatePipe, NgFor, NgIf } from '@angular/common';
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
      <div *ngIf="!hasLibraryFolder()" class="flex flex-col items-center justify-center p-8 space-y-4 border-2 border-dashed rounded-lg text-gray-500">
        <mat-icon class="text-4xl w-10 h-10">folder_open</mat-icon>
        <p class="text-center">Select a folder on your device to store and load your loop lists.</p>
        <button mat-raised-button color="primary" (click)="selectFolder()">
          Select Library Folder
        </button>
      </div>

      <div *ngIf="hasLibraryFolder()" class="space-y-4">
        <div class="flex justify-between items-center bg-gray-50 p-3 rounded">
            <div class="flex items-center space-x-2">
                <mat-icon class="text-gray-500">folder</mat-icon>
                <span class="text-sm font-medium">Library Folder Connected</span>
            </div>
            <div class="flex space-x-2">
                <button mat-icon-button (click)="selectFolder()" title="Change Folder">
                    <mat-icon>edit</mat-icon>
                </button>
                <button mat-icon-button (click)="refresh()" title="Refresh">
                    <mat-icon>refresh</mat-icon>
                </button>
            </div>
        </div>

        <div *ngIf="!isLibraryAccessGranted()" class="p-4 bg-yellow-50 rounded border border-yellow-200 text-center">
             <p class="mb-2 text-sm text-yellow-800">Permission needed to access this folder.</p>
             <button mat-stroked-button color="accent" (click)="verifyPermission()">
                Grant Permission
             </button>
        </div>

        <div *ngIf="isLibraryAccessGranted()">
             <div *ngIf="libraryFiles().length === 0" class="text-center py-8 text-gray-500 italic">
                No JSON loop lists found in this folder.
             </div>

             <ul class="space-y-1 max-h-80 overflow-y-auto">
                <li *ngFor="let file of libraryFiles()">
                  <button mat-button class="w-full text-left !justify-start hover:bg-gray-100" (click)="loadFile(file)">
                    <mat-icon class="text-gray-400 !mr-2">description</mat-icon>
                    <div class="flex flex-col items-start overflow-hidden">
                        <span class="truncate w-full font-medium">{{ file.name }}</span>
                        <!-- <span class="text-xs text-gray-400">Modified: ...</span> -->
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
        // DatePipe
    ]
})
export class LibraryDialogComponent implements OnInit {

    libraryFiles = signal<{ name: string; handle: any }[]>([]);
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
            if (granted) {
                this.refresh();
            }
        }
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
            const files = await this.fileStorage.getFiles();
            this.libraryFiles.set(files);
        } catch (e) {
            console.error('Failed to list files', e);
            this.libraryFiles.set([]);
        }
    }

    async loadFile(fileItem: any) {
        try {
            const data = await this.fileStorage.loadFile(fileItem.handle);
            this.dialogRef.close(data);
        } catch (e) {
            console.error('Failed to load file', e);
            this.snackBar.open('Failed to load file', 'OK');
        }
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
