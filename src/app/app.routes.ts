import { Routes } from '@angular/router';
import { LoopEditorComponent } from './loop-editor/loop-editor';

export const routes: Routes = [
  { path: '', redirectTo: 'home', pathMatch: 'full' },
  { path: 'home', component: LoopEditorComponent },
];
