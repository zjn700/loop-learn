import { ComponentFixture, TestBed } from '@angular/core/testing';

import { LoopEditor } from './loop-editor';

describe('LoopEditor', () => {
  let component: LoopEditor;
  let fixture: ComponentFixture<LoopEditor>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [LoopEditor]
    })
    .compileComponents();

    fixture = TestBed.createComponent(LoopEditor);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
