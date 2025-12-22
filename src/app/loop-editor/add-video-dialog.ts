import { Component, Inject } from '@angular/core';
import { MatDialogRef, MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';

@Component({
    selector: 'app-add-video-dialog',
    standalone: true,
    imports: [MatFormFieldModule, MatInputModule, FormsModule, MatButtonModule, MatDialogModule],
    template: `
    <h3 mat-dialog-title>Add Video</h3>
    <div mat-dialog-content>
      <mat-form-field style="width:100%">
        <mat-label>YouTube URL or ID</mat-label>
        <input matInput [(ngModel)]="data.videoId" placeholder="e.g. jOoEjJjN7QI" (keyup.enter)="onLoad()" />
      </mat-form-field>
    </div>
    <div mat-dialog-actions style="justify-content:flex-end">
      <button mat-button (click)="onCancel()">Cancel</button>
      <button mat-flat-button color="primary" (click)="onLoad()" [disabled]="!data.videoId">Load</button>
    </div>
  `,
})
export class AddVideoDialogComponent {
    constructor(
        public dialogRef: MatDialogRef<AddVideoDialogComponent>,
        @Inject(MAT_DIALOG_DATA) public data: { videoId: string }
    ) { }

    onLoad() {
        this.dialogRef.close(this.data.videoId?.trim() || null);
    }

    onCancel() {
        this.dialogRef.close(null);
    }
}
