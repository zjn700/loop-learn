import { Component, OnInit, OnDestroy } from '@angular/core';
import { DecimalPipe, NgIf, NgFor } from '@angular/common';
import { YouTubePlayerModule } from '@angular/youtube-player';
import { Loop, LoopList } from '../models/loop';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatSelectModule } from '@angular/material/select';
import { FormsModule } from '@angular/forms';
import { MatInputModule } from '@angular/material/input';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatSnackBarModule } from '@angular/material/snack-bar';
import { Subject, Subscription } from 'rxjs';
import { debounceTime } from 'rxjs/operators';
import { MatDialog } from '@angular/material/dialog';
import { MatDialogModule } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { SaveAsDialogComponent } from './save-as-dialog';

@Component({
  selector: 'app-loop-editor',
  templateUrl: './loop-editor.html',
  styleUrls: ['./loop-editor.css'], // Use Tailwind/global styles
  standalone: true,
  imports: [
    YouTubePlayerModule,
    MatIconModule,
    MatFormFieldModule,
    MatSlideToggleModule,
    MatSelectModule,
    MatButtonModule,
    NgIf,
    NgFor,
    DecimalPipe,
    FormsModule,
    MatInputModule,
    MatSnackBarModule,
    MatDialogModule,
    /* Angular Material Modules, CommonModule, Forms... */
  ],
})
export class LoopEditorComponent implements OnInit, OnDestroy {
  // R2.1: Video ID for the player
  videoId: string = 'epnNIxhKJSc'; //'yXQViZ_6M9o'; // Example ID
  player: any; // YouTube Player instance

  // R6.3: Playback speed control
  playbackRate: number = 1.0;

  // R2.3: Current Loop List data
  currentList: LoopList = {
    ownerId: 'user-123',
    title: 'New Language Practice',
    description: '',
    videoId: this.videoId,
    videoUrl: `https://youtu.be/${this.videoId}`,
    isPublic: false,
    language: '',
    skillLevel: '',
    createdAt: new Date(),
    loops: [] as Loop[],
  };

  // R3.2: Loop boundary variables
  currentStartTime: number = 0;
  currentEndTime: number = 0;

  // Playback loop state
  playingLoopIndex: number | null = null; // index of the loop currently playing
  isLooping: boolean = false; // whether the current playback should loop
  constructor(private snackBar: MatSnackBar, private dialog: MatDialog) { }

  // open save-as dialog using MatDialog
  openSaveAsDialog(): void {
    const ref = this.dialog.open(SaveAsDialogComponent, {
      width: '320px',
      data: { name: this.currentList.title || '' },
    });
    ref.afterClosed().subscribe((name?: string) => {
      if (!name) return;
      this.saveCurrentAsName(name);
    });
  }
  private _loopChecker: any = null; // interval id for checking loop end

  // Autosave
  private saveSubject = new Subject<void>();
  private saveSub: Subscription | null = null;

  // Saved lists (multiple) support
  private readonly STORAGE_LISTS_KEY = 'loop-learn.savedLists';
  savedLists: Array<any> = [];
  selectedSavedId: string | null = null;

  ngOnInit() {
    // Attempt to load saved list from localStorage before player initialization
    this.loadListFromLocalStorage();
    // load saved lists index
    this.loadSavedListsFromStorage();

    // setup autosave (debounced)
    this.saveSub = this.saveSubject.pipe(debounceTime(600)).subscribe(() => {
      // If a saved entry is selected, update it, otherwise write legacy single key
      if (this.selectedSavedId) {
        const idx = this.savedLists.findIndex((s) => s.id === this.selectedSavedId);
        if (idx !== -1) {
          const copy: any = {
            ...this.currentList,
            createdAt: this.currentList.createdAt ? this.currentList.createdAt.toISOString() : null,
            loops: this.currentList.loops.map((l) => ({ ...l })),
          };
          this.savedLists[idx].list = copy;
          this.persistSavedLists();
          try {
            this.snackBar.open('Autosaved', '', { duration: 800 });
          } catch { }
          return;
        }
      }
      // fallback: legacy single-key save
      this.saveListToLocalStorage(false);
      try {
        this.snackBar.open('Autosaved', '', { duration: 800 });
      } catch { }
    });

    // 1. Load the YouTube Iframe Player API script
    if (typeof document !== 'undefined') {
      // Code that uses the document object goes here

      const tag = document.createElement('script');
      tag.src = 'https://www.youtube.com/iframe_api';
      document.body.appendChild(tag);
    }
    // 2. Window callback for player initialization
    if (typeof window !== 'undefined' && window.localStorage) {
      (window as any)['onYouTubeIframeAPIReady'] = () => {
        this.player = new (window as any).YT.Player('youtube-player-embed', {
          height: '400',
          width: '100%',
          videoId: this.videoId,
          playerVars: {
            playsinline: 1,
          },
          events: {
            onReady: this.onPlayerReady.bind(this),
            onStateChange: this.onPlayerStateChange.bind(this),
          },
        });
      };
    }
  }

  onPlayerReady(event: any): void {
    // R6.3: Set initial playback speed
    event.target.setPlaybackRate(this.playbackRate);
    // You can now access player controls, e.g., event.target.playVideo();
  }

  onPlayerStateChange(event: any): void {
    // R6.1: Logic to handle looping transitions here
  }

  /** R3.2: Sets the loop start time to the current video time. */
  setStartTime(): void {
    this.currentStartTime = this.player.getCurrentTime();
    console.log(`Start Time set: ${this.currentStartTime}`);
  }

  /** R3.2: Sets the loop end time to the current video time. */
  setEndTime(): void {
    this.currentEndTime = this.player.getCurrentTime();
    console.log(`End Time set: ${this.currentEndTime}`);
  }

  /** R2.4: Saves the defined loop to the list */
  addLoop(): void {
    if (this.currentEndTime > this.currentStartTime && this.currentStartTime >= 0) {
      const newLoop: Loop = {
        loopIndex: this.currentList.loops.length,
        name: `Loop ${this.currentList.loops.length + 1}`,
        startTime: this.currentStartTime,
        endTime: this.currentEndTime,
        primaryText: '',
        secondaryText: '',
      };
      this.currentList.loops.push(newLoop);
      this.markListChanged();
      // Reset times for next loop definition
      this.currentStartTime = 0;
      this.currentEndTime = 0;
    } else {
      alert('End time must be greater than start time.');
    }
  }

  /** R6.3: Updates playback rate */
  updatePlaybackRate(event: Event): void {
    const target = event.target as HTMLSelectElement | null;
    if (!target) return;
    this.playbackRate = Number(target.value);
    if (this.player) {
      this.player.setPlaybackRate(this.playbackRate);
    }
  }

  /** Play a loop by its index. If `loopForever` is true, it will repeatedly loop. */
  playLoop(loopIndex: number, loopForever: boolean = false): void {
    const loop = this.currentList.loops[loopIndex];
    if (!loop || !this.player) return;

    this.playingLoopIndex = loopIndex;
    this.isLooping = !!loopForever;

    // Seek to start and play
    try {
      this.player.seekTo(loop.startTime, true);
      this.player.setPlaybackRate(this.playbackRate);
      this.player.playVideo();
    } catch (e) {
      console.warn('YouTube player not ready', e);
    }

    // Clear any existing checker
    if (this._loopChecker) {
      clearInterval(this._loopChecker);
      this._loopChecker = null;
    }

    // Poll the player current time and handle loop end
    this._loopChecker = setInterval(() => {
      if (!this.player) return;
      const t = this.player.getCurrentTime();
      // If we've reached or passed the end time, decide what to do
      if (t >= loop.endTime) {
        if (this.isLooping) {
          // seek back to start (use seekTo with allowSeekAhead)
          this.player.seekTo(loop.startTime, true);
          this.player.setPlaybackRate(this.playbackRate);
          this.player.playVideo();
        } else {
          // stop playback and clear state
          this.stopLoop();
        }
      }
    }, 150);
  }

  /** Stop any loop playback in progress. */
  stopLoop(): void {
    if (this._loopChecker) {
      clearInterval(this._loopChecker);
      this._loopChecker = null;
    }
    if (this.player) {
      try {
        this.player.pauseVideo();
      } catch (e) {
        // ignore
      }
    }
    this.playingLoopIndex = null;
    this.isLooping = false;
  }

  // Simple trackBy for loops list
  trackByLoopIndex(index: number, item: Loop): number {
    return item?.loopIndex ?? index;
  }

  /** Notify that the list changed so autosave can run (debounced). */
  markListChanged(): void {
    try {
      this.saveSubject.next();
    } catch (e) {
      console.error('Failed to schedule autosave', e);
    }
  }

  // Local storage helpers
  private readonly STORAGE_KEY = 'loop-learn.currentList';

  /** Save the current list to localStorage (serializes dates). */
  saveListToLocalStorage(showNotify: boolean = true): void {
    if (typeof localStorage === 'undefined') return;
    try {
      const copy: any = {
        ...this.currentList,
        createdAt: this.currentList.createdAt ? this.currentList.createdAt.toISOString() : null,
        loops: this.currentList.loops.map((l) => ({ ...l })),
      };
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(copy));
      console.log('Saved list to localStorage');
      if (showNotify) {
        try {
          this.snackBar.open('Saved locally', '', { duration: 1200 });
        } catch { }
      }
    } catch (e) {
      console.error('Failed to save list', e);
      try {
        this.snackBar.open('Failed to save list to local storage', 'OK');
      } catch { }
    }
  }

  /** Load the list from localStorage if present and revive dates. */
  loadListFromLocalStorage(): void {
    if (typeof localStorage === 'undefined') return;
    try {
      const raw = localStorage.getItem(this.STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      // revive createdAt
      if (parsed.createdAt) {
        parsed.createdAt = new Date(parsed.createdAt);
      } else {
        parsed.createdAt = new Date();
      }
      // ensure loops array
      parsed.loops = Array.isArray(parsed.loops) ? parsed.loops : [];
      // ensure loopIndex values and defaults
      parsed.loops = parsed.loops.map((l: any, idx: number) => ({
        loopIndex: typeof l.loopIndex === 'number' ? l.loopIndex : idx,
        name: l.name || `Loop ${idx + 1}`,
        startTime: Number(l.startTime) || 0,
        endTime: Number(l.endTime) || 0,
        primaryText: l.primaryText || '',
        secondaryText: l.secondaryText || '',
      }));

      this.currentList = parsed as LoopList;

      // If the saved list references a different video, update videoId used by player init
      if (this.currentList.videoId) {
        this.videoId = this.currentList.videoId;
      }

      console.log('Loaded list from localStorage');
      try {
        this.snackBar.open('Loaded local list', '', { duration: 900 });
      } catch { }
    } catch (e) {
      console.error('Failed to load list', e);
    }
  }

  /** Clear saved list from localStorage. */
  clearSavedList(): void {
    if (typeof localStorage === 'undefined') return;
    localStorage.removeItem(this.STORAGE_KEY);
    try {
      this.snackBar.open('Cleared saved list', '', { duration: 900 });
    } catch { }
  }

  // --- Saved lists (multiple) helpers ---
  loadSavedListsFromStorage(): void {
    if (typeof localStorage === 'undefined') return;
    try {
      const raw = localStorage.getItem(this.STORAGE_LISTS_KEY);
      if (!raw) return;
      this.savedLists = JSON.parse(raw) || [];
      if (this.savedLists.length > 0) this.selectedSavedId = this.savedLists[0].id;
    } catch (e) {
      console.error('Failed to load saved lists', e);
    }
  }

  persistSavedLists(): void {
    if (typeof localStorage === 'undefined') return;
    try {
      localStorage.setItem(this.STORAGE_LISTS_KEY, JSON.stringify(this.savedLists));
    } catch (e) {
      console.error('Failed to persist saved lists', e);
      try {
        this.snackBar.open('Failed to persist saved lists', 'OK');
      } catch { }
    }
  }

  saveCurrentAsName(name: string): void {
    const id = Date.now().toString();
    const copy: any = {
      ...this.currentList,
      createdAt: this.currentList.createdAt ? this.currentList.createdAt.toISOString() : null,
      loops: this.currentList.loops.map((l) => ({ ...l })),
    };
    const entry = {
      id,
      name,
      videoId: this.videoId,
      savedAt: new Date().toISOString(),
      list: copy,
    };
    this.savedLists.unshift(entry);
    this.selectedSavedId = id;
    this.persistSavedLists();
    try {
      this.snackBar.open('Saved list', '', { duration: 1200 });
    } catch { }
  }

  loadSavedById(id: string | null): void {
    if (!id) return;
    const entry = this.savedLists.find((s) => s.id === id);
    if (!entry) return;
    this.currentList = entry.list as LoopList;
    if (entry.videoId) this.videoId = entry.videoId;
    try {
      this.snackBar.open('Loaded saved list', '', { duration: 900 });
    } catch { }
  }

  loadSelected(): void {
    this.loadSavedById(this.selectedSavedId);
  }

  deleteSavedById(id: string | null): void {
    if (!id) return;
    const idx = this.savedLists.findIndex((s) => s.id === id);
    if (idx === -1) return;
    this.savedLists.splice(idx, 1);
    if (this.savedLists.length > 0) this.selectedSavedId = this.savedLists[0].id;
    else this.selectedSavedId = null;
    this.persistSavedLists();
    try {
      this.snackBar.open('Deleted saved list', '', { duration: 900 });
    } catch { }
  }

  ngOnDestroy(): void {
    if (this.saveSub) {
      try {
        this.saveSub.unsubscribe();
      } catch { }
      this.saveSub = null;
    }
    if (this._loopChecker) {
      try {
        clearInterval(this._loopChecker);
      } catch { }
      this._loopChecker = null;
    }
  }
}
