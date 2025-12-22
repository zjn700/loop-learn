import { Component, Inject } from '@angular/core';
import { MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';

@Component({
  selector: 'app-save-as-dialog',
  standalone: true,
  imports: [MatFormFieldModule, MatInputModule, FormsModule, MatButtonModule],
  template: `
    <h3 mat-dialog-title>Save List As</h3>
    <div mat-dialog-content>
      <mat-form-field style="width:100%">
        <textarea matInput [(ngModel)]="data.name" placeholder="List name" rows="3"></textarea>
      </mat-form-field>
    </div>
    <div mat-dialog-actions style="justify-content:flex-end">
      <button mat-button (click)="onCancel()">Cancel</button>
      <button mat-flat-button color="primary" (click)="onSave()">Save</button>
    </div>
  `,
})
export class SaveAsDialogComponent {
  constructor(
    public dialogRef: MatDialogRef<SaveAsDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: { name: string }
  ) { }

  onSave() {
    this.dialogRef.close(this.data.name?.trim() || null);
  }

  onCancel() {
    this.dialogRef.close(null);
  }
}
