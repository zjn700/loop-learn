import { Component, OnInit, OnDestroy, NgZone, HostListener } from '@angular/core';
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
import { DragDropModule, CdkDragDrop, moveItemInArray } from '@angular/cdk/drag-drop';
import { SaveAsDialogComponent } from './save-as-dialog';
import { FileStorageService } from '../services/file-storage.service';

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
    MatInputModule,
    MatSnackBarModule,
    MatDialogModule,
    DragDropModule,
    /* Angular Material Modules, CommonModule, Forms... */
  ],
})
export class LoopEditorComponent implements OnInit, OnDestroy {
  // R2.1: Video ID for the player
  videoId: string = 'epnNIxhKJSc'; //'yXQViZ_6M9o'; // Example ID
  videoInput: string = ''; // Input for loading new video
  player: any; // YouTube Player instance

  // R6.3: Playback speed control
  playbackRate: number = 1.0;

  // R2.3: Current Loop List data
  currentList: LoopList = {
    id: 'temp-1', // Temporary ID
    ownerId: 'user-123',
    title: 'New Language Practice',
    description: '',
    videoId: this.videoId,
    videoUrl: `https://youtu.be/${this.videoId}`,
    isPublic: false,
    language: '',
    skillLevel: '',
    createdAt: new Date(),
    updatedAt: new Date(),
    loops: [] as Loop[],
  };

  // R3.2: Loop boundary variables
  currentStartTime: number = 0;
  currentEndTime: number = 0;

  // Playback loop state
  playingLoopIndex: number | null = null; // index of the loop currently playing
  isLooping: boolean = false; // whether the current playback should loop
  constructor(
    private snackBar: MatSnackBar,
    private dialog: MatDialog,
    private fileStorage: FileStorageService,
    private ngZone: NgZone
  ) { }

  // open save-as dialog using MatDialog
  openSaveAsDialog(): void {
    const ref = this.dialog.open(SaveAsDialogComponent, {
      width: '320px',
      data: { name: this.currentList.title || '' },
    });
    ref.afterClosed().subscribe((name?: string) => {
      if (!name) return;
      this.ngZone.run(() => {
        this.currentList.title = name; // Update current list title
        this.saveToLibrary(); // Save to library with the new title
      });
    });
  }
  private _loopChecker: any = null; // interval id for checking loop end

  // Library / Folder State
  libraryFiles: { name: string; handle: any }[] = [];
  isLibraryAccessGranted: boolean = false;
  hasLibraryFolder: boolean = false;

  // Autosave
  private saveSubject = new Subject<void>();
  private saveSub: Subscription | null = null;

  ngOnInit() {
    // Try to restore library access
    this.initLibrary();

    // setup autosave (debounced) - OPTIONAL: We might want explicit save for files, 
    // or autosave to the specific file handle if we have one. 
    // For now, let's keep autosave disabled or just logging, as file writes are more heavy.
    // Changing strategy: Autosave is risky with direct file writes without user intent.
    // We will rely on manual save for now, or autosave to a temp local storage if needed.
    // Let's keep the subject but maybe just log or do nothing.
    this.saveSub = this.saveSubject.pipe(debounceTime(2000)).subscribe(() => {
      // Option: Autosave to currently open file handle if implemented
      // this.saveToLibrary(); 
    });

    // 1. Load the YouTube Iframe Player API script
    if (typeof document !== 'undefined') {
      // Code that uses the document object goes here

      const tag = document.createElement('script');
      tag.src = 'https://www.youtube.com/iframe_api';
      document.body.appendChild(tag);
    }
    // 2. Window callback for player initialization
    if (typeof window !== 'undefined') {
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

    // Auto-set title from video if current title is default
    this.ngZone.run(() => {
      const videoData = event.target.getVideoData();
      if (videoData && videoData.title) {
        if (!this.currentList.title || this.currentList.title === 'New Language Practice') {
          this.currentList.title = videoData.title;
        }
      }
    });
  }

  onPlayerStateChange(event: any): void {
    // R6.1: Logic to handle looping transitions here
    // Also update title if we just loaded a new video
    if (event.data === (window as any).YT.PlayerState.PLAYING || event.data === (window as any).YT.PlayerState.PAUSED || event.data === (window as any).YT.PlayerState.CUED) {
      this.ngZone.run(() => {
        const videoData = event.target.getVideoData();
        if (videoData && videoData.title) {
          if (!this.currentList.title || this.currentList.title === 'New Language Practice' || this.currentList.title === '') {
            this.currentList.title = videoData.title;
          }
        }
      });
    }
  }

  /** Load a video from the input URL or ID */
  async loadVideo(): Promise<void> {
    if (!this.videoInput) return;

    // Parse ID
    let id = this.videoInput.trim();
    const regExp = /^.*(youtu\.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
    const match = id.match(regExp);
    if (match && match[2].length === 11) {
      id = match[2];
    }

    if (!id) {
      this.snackBar.open('Invalid Video ID or URL', 'OK');
      return;
    }

    // 1. CLEAR INPUT
    this.videoInput = '';

    // 2. CHECK LIBRARY FOR EXISTING FILE
    if (this.isLibraryAccessGranted) {
      const existingFile = await this.scanLibraryForVideoId(id);
      if (existingFile) {
        this.ngZone.run(async () => {
          this.snackBar.open('Found existing loops for this video', '', { duration: 2500 });
          await this.loadFromLibrary(existingFile);
        });
        return;
      }
    }

    // 3. NOT FOUND -> LOAD NEW
    this.videoId = id;

    // Reset current list for the new video
    this.currentList = {
      id: crypto.randomUUID(), // or Date.now().toString()
      ownerId: 'user-123',
      title: '', // Pending fetch from player
      description: '',
      videoId: id,
      videoUrl: `https://youtu.be/${id}`,
      isPublic: false,
      language: '',
      skillLevel: '',
      createdAt: new Date(),
      updatedAt: new Date(),
      loops: [],
    };

    // Update player
    if (this.player && this.player.loadVideoById) {
      this.player.loadVideoById(id);
    }

    this.snackBar.open('There are no loops yet for this video. You can create one now', 'OK', { duration: 5000 });
  }

  async scanLibraryForVideoId(videoId: string): Promise<any | null> {
    // Brute-force scan of small libraries
    for (const fileItem of this.libraryFiles) {
      try {
        const data = await this.fileStorage.loadFile(fileItem.handle);
        if (data.videoId === videoId) {
          return fileItem;
        }
      } catch (e) {
        console.warn(`Failed to scan file ${fileItem.name}`, e);
      }
    }
    return null;
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

  deleteLoop(index: number): void {
    if (index >= 0 && index < this.currentList.loops.length) {
      this.currentList.loops.splice(index, 1);
      this.reindexLoops();
      this.markListChanged();
      this.snackBar.open('Loop deleted', '', { duration: 1000 });
    }
  }

  drop(event: CdkDragDrop<string[]>): void {
    moveItemInArray(this.currentList.loops, event.previousIndex, event.currentIndex);
    this.reindexLoops();
    this.markListChanged();
  }

  private reindexLoops(): void {
    this.currentList.loops.forEach((loop, i) => {
      loop.loopIndex = i;
    });
  }

  // Simple trackBy for loops list
  trackByLoopIndex(index: number, item: Loop): number {
    return item?.loopIndex ?? index;
  }

  /** Notify that the list changed. */
  markListChanged(): void {
    this.saveSubject.next();
  }

  // --- Folder / Library Logic ---

  async initLibrary(): Promise<void> {
    if (!this.fileStorage.isFileSystemAccessSupported) return;

    // Check if we have a stored handle
    const restored = await this.fileStorage.restoreDirectoryHandle();
    this.hasLibraryFolder = restored;

    if (restored) {
      // We have a handle, but need to verify permissions
      // We cannot prompt immediately on init (needs gesture), so we check 'read'
      this.isLibraryAccessGranted = await this.fileStorage.verifyPermission(false);
      if (this.isLibraryAccessGranted) {
        this.refreshLibrary();
      }
    }
  }

  async selectLibraryFolder(): Promise<void> {
    try {
      await this.fileStorage.selectBaseFolder();
      this.ngZone.run(async () => {
        this.hasLibraryFolder = true;
        this.isLibraryAccessGranted = true;
        await this.refreshLibrary();
        this.snackBar.open('Library folder selected', '', { duration: 2000 });
      });
    } catch (e: any) {
      if (e.name !== 'AbortError') {
        console.error('Select folder failed', e);
        this.snackBar.open('Failed to select folder', 'OK');
      }
    }
  }

  async verifyLibraryPermission(): Promise<void> {
    try {
      const granted = await this.fileStorage.verifyPermission(true);
      this.ngZone.run(() => {
        this.isLibraryAccessGranted = granted;
        if (granted) {
          this.refreshLibrary();
        } else {
          this.snackBar.open('Permission denied', 'OK');
        }
      });
    } catch (e) {
      console.error('Verify permission failed', e);
    }
  }

  async refreshLibrary(): Promise<void> {
    try {
      this.libraryFiles = await this.fileStorage.getFiles();
      this.ngZone.run(() => {
        // just to be sure change detection runs even if getFiles finished quickly
      });
    } catch (e) {
      console.error('Failed to list files', e);
      this.ngZone.run(() => {
        this.libraryFiles = [];
      });
    }
  }

  async loadFromLibrary(fileItem: any): Promise<void> {
    try {
      const data = await this.fileStorage.loadFile(fileItem.handle);
      this.ngZone.run(() => {
        this.loadList(data);
      });
      // Update Title to match filename (minus .json) if needed?
      // Or keep internal title. Let's keep internal title but maybe suggest filename on save.
    } catch (e) {
      console.error('Failed to load file', e);
      this.ngZone.run(() => {
        this.snackBar.open('Failed to load file', 'OK');
      });
    }
  }

  async saveToLibrary(): Promise<void> {
    if (!this.hasLibraryFolder) {
      this.snackBar.open('No library folder selected', 'OK');
      return;
    }

    // use current title as filename
    const filename = this.currentList.title.trim() || 'Untitled';

    try {
      // Ensure we have write permission
      const granted = await this.fileStorage.verifyPermission(true);
      if (!granted) {
        this.snackBar.open('Write permission needed', 'OK');
        return;
      }

      // Update timestamp
      this.currentList.updatedAt = new Date();

      await this.fileStorage.saveToFolder(filename, this.currentList);
      this.ngZone.run(() => {
        this.snackBar.open('Saved to Library', '', { duration: 2000 });
        this.refreshLibrary(); // refresh list in case it's a new file
      });
    } catch (e) {
      console.error('Failed to save to library', e);
      this.snackBar.open('Failed to save', 'OK');
    }
  }
  // --- File System Storage ---

  get isFileAccessSupported(): boolean {
    return this.fileStorage.isFileSystemAccessSupported;
  }

  async saveToFile(): Promise<void> {
    if (!this.isFileAccessSupported) {
      // Fallback (Safari): Prompt for name first
      const ref = this.dialog.open(SaveAsDialogComponent, {
        width: '320px',
        data: { name: this.currentList.title || '' },
      });
      ref.afterClosed().subscribe(async (name?: string) => {
        if (!name) return;
        this.ngZone.run(async () => {
          this.currentList.title = name;
          try {
            await this.fileStorage.saveFile(this.currentList, name);
            this.ngZone.run(() => {
              this.snackBar.open('File downloaded', '', { duration: 2000 });
            });
          } catch (e) {
            console.error('Save file failed', e);
          }
        });
      });
      return;
    }

    // Native File System API Supported
    try {
      await this.fileStorage.saveFile(this.currentList, this.currentList.title || 'loop-list');
      this.ngZone.run(() => {
        this.snackBar.open('File saved', '', { duration: 2000 });
      });
    } catch (e) {
      console.error('Save file failed', e);
      this.snackBar.open('Failed to save file', 'OK');
    }
  }

  async openFromFile(): Promise<void> {
    if (this.isFileAccessSupported) {
      const data = await this.fileStorage.openFile();
      if (data) {
        this.ngZone.run(() => {
          this.loadList(data);
        });
      }
    } else {
      // Trigger hidden input click
      const input = document.getElementById('fileInput') as HTMLInputElement;
      if (input) input.click();
    }
  }

  async onFileSelected(event: any): Promise<void> {
    const file = event.target.files[0];
    if (!file) return;
    try {
      const data = await this.fileStorage.readFile(file);
      this.ngZone.run(() => {
        this.loadList(data);
        // Reset input
        event.target.value = '';
      });
    } catch (e) {
      console.error('Read file failed', e);
      this.snackBar.open('Failed to read file', 'OK');
    }
  }

  private loadList(data: LoopList): void {
    this.currentList = data;
    if (data.videoId) {
      this.videoId = data.videoId;
      // Load the video in the player
      if (this.player && this.player.loadVideoById) {
        this.player.loadVideoById(this.videoId);
      }
    }
    // Reset player state if needed, or just let user play
    this.snackBar.open('List loaded from file', '', { duration: 2000 });
  }

  @HostListener('window:keydown', ['$event'])
  handleKeyboardEvent(event: KeyboardEvent) {
    // Ignore if user is typing in an input
    const target = event.target as HTMLElement;
    if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') {
      return;
    }

    if (event.key === 'ArrowLeft') {
      this.adjustTime(-0.1);
      event.preventDefault(); // Prevent scrolling if needed
    } else if (event.key === 'ArrowRight') {
      this.adjustTime(0.1);
      event.preventDefault();
    }
  }

  /** Adjust current video time by delta seconds */
  adjustTime(delta: number): void {
    if (!this.player || !this.player.getCurrentTime) return;

    const currentTime = this.player.getCurrentTime();
    const newTime = Math.max(0, currentTime + delta);

    this.player.seekTo(newTime, true);
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
