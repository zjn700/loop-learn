import { Component, OnInit, OnDestroy, HostListener, signal, computed, WritableSignal } from '@angular/core';
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
import { MatRadioModule } from '@angular/material/radio';
import { MatSliderModule } from '@angular/material/slider';
import { Subject, Subscription } from 'rxjs';
import { debounceTime } from 'rxjs/operators';
import { MatDialog } from '@angular/material/dialog';
import { MatDialogModule } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatMenuModule } from '@angular/material/menu';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { DragDropModule, CdkDragDrop, moveItemInArray } from '@angular/cdk/drag-drop';
import { AddVideoDialogComponent } from './add-video-dialog';
import { SaveAsDialogComponent } from './save-as-dialog';
import { LibraryDialogComponent } from './library-dialog';
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
    MatMenuModule,
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
    MatCheckboxModule,
    MatRadioModule,
    MatSliderModule,
    /* Angular Material Modules, CommonModule, Forms... */
  ],
})
export class LoopEditorComponent implements OnInit, OnDestroy {
  // R2.1: Video ID for the player
  // https://youtube.com/shorts/tUpcnX-a3Kk?si=xyPtIj7q1fPUm_97
  videoId = signal<string>('jOoEjJjN7QI');
  // videoInput = signal<string>(''); // Removed as per refactor
  player: any; // YouTube Player instance

  isToggled = signal(false);

  videoState = signal<string>('Paused');
  // vidTitle = signal<string>('zuul');

  toggleVideoState() {
    this.isToggled.update(v => !v);
    if (this.isToggled()) {
      this.player.playVideo();
      this.videoState.set('Playing');
    } else {
      this.player.pauseVideo();
      this.videoState.set('Paused');
    }
    console.log('1 Toggle state:', this.isToggled());
    console.log('1 Video state:', this.videoState());
  }
  setVideoState(state: boolean) {
    this.isToggled.set(state);
    this.videoState.set(state ? 'Playing' : 'Paused');
    console.log('2 Video state:', this.videoState());
    console.log('2 Toggle state:', this.isToggled());
  }

  // R6.3: Playback speed control
  playbackRate = signal<number>(1.0);
  skipDuration = signal<number>(0.5);

  updateSkipDuration(event: Event): void {
    const target = event.target as HTMLSelectElement | null;
    if (!target) return;
    this.skipDuration.set(Number(target.value));
  }

  // R2.3: Current Loop List data
  currentList = signal<LoopList>({
    id: 'temp-1', // Temporary ID
    ownerId: 'user-123',
    title: 'New Language Practice',
    description: '',
    videoId: this.videoId(),
    videoUrl: `https://youtu.be/${this.videoId()}`,
    isPublic: false,
    language: '',
    skillLevel: '',
    createdAt: new Date(),
    updatedAt: new Date(),
    loops: [] as Loop[],
  });

  // R3.2: Loop boundary variables
  currentStartTime = signal<number>(0);
  currentEndTime = signal<number>(0);

  // Playback loop state
  playingLoopIndex = signal<number | null>(null); // index of the loop currently playing
  // For expanded loop, we might not track a single index, but we need to know we are playing custom range
  isPlayingExpanded = signal(false);

  // Expanded Loop Sequence State
  playQueue = signal<Loop[]>([]);
  currentQueueIndex = signal<number>(0);


  isLooping = signal(false); // whether the current playback should loop


  // Selection State
  selectedLoops = signal<Set<number>>(new Set());
  isEditing = signal(false);
  isLoopListVisible = signal(true);
  private _loopChecker: any;

  toggleEditing() {
    this.isEditing.update(v => !v);
  }

  toggleLoopList() {
    this.isLoopListVisible.update(v => !v);
  }

  isFullscreen = signal(false);

  toggleFullscreen(element: HTMLElement) {
    if (!document.fullscreenElement) {
      element.requestFullscreen().then(() => this.isFullscreen.set(true)).catch(err => {
        console.error(`Error attempting to enable fullscreen: ${err.message}`);
      });
    } else {
      document.exitFullscreen().then(() => this.isFullscreen.set(false));
    }

    // Listen for change to update signal if user presses Escape
    // Note: This adds a listener every time, which isn't ideal. 
    // Ideally init this listener in ngOnInit. 
    // For now, simpler: just rely on the button or update on change event somewhere else?
    // Let's add a global listener in constructor or ngOnInit.
  }

  constructor(
    private snackBar: MatSnackBar,
    private dialog: MatDialog,
    private fileStorage: FileStorageService
  ) { }

  // open save-as dialog using MatDialog
  openSaveAsDialog(): void {
    const ref = this.dialog.open(SaveAsDialogComponent, {
      width: '400px',
      data: { name: this.currentList().title || '' },
    });
    console.log('Save as dialog opened', this.currentList().title);

    ref.afterClosed().subscribe((name?: string) => {
      if (!name) return;
      this.currentList.update(l => ({ ...l, title: name })); // Update current list title
      this.saveToLibrary(); // Save to library with the new title
    });
  }

  openAddVideoDialog(): void {
    const ref = this.dialog.open(AddVideoDialogComponent, {
      width: '400px',
      data: { videoId: '' },
    });

    ref.afterClosed().subscribe((id?: string) => {
      if (id) {
        this.loadVideo(id);
      }
    });
  }



  // Autosave
  private saveSubject = new Subject<void>();
  private saveSub: Subscription | null = null;


  ngOnInit(): void {
  }

  ngAfterViewInit(): void {
    // Try to restore library access - handled in dialog now or on demand
    // this.initLibrary();

    // setup autosave (debounced) - OPTIONAL: We might want explicit save for files, 
    // or autosave to the specific file handle if we have one. 
    // For now, let's keep autosave disabled or just logging, as file writes are more heavy.
    // Changing strategy: Autosave is risky with direct file writes without user intent.
    // We will rely on manual save for now, or autosave to a temp local storage if needed.
    // Let's keep the subject but maybe just log or do nothing.
    // Listen for fullscreen changes to update the signal (e.g. Escape key)
    if (typeof document !== 'undefined') {
      document.addEventListener('fullscreenchange', () => {
        this.isFullscreen.set(!!document.fullscreenElement);
      });
    }

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
          videoId: this.videoId(),
          playerVars: {
            playsinline: 1,
            controls: 0,
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
    event.target.setPlaybackRate(this.playbackRate());
    // this.vidTitle.set(event.target.getVideoData().title);
    console.log('Player ready title:', event.target.getVideoData().title);
    // Auto-set title from video if current title is default
    const videoData = event.target.getVideoData();
    if (videoData && videoData.title) {
      if (!this.currentList().title || this.currentList().title === 'New Language Practice') {
        this.currentList.update(l => ({ ...l, title: videoData.title }));
      }
    }
  }

  onPlayerStateChange(event: any): void {
    // R6.1: Logic to handle looping transitions here
    console.log('Player state changed:', event.data);
    if (event.data === (window as any).YT.PlayerState.PLAYING) {
      this.setVideoState(true);
      // this.toggleVideoState();
    } else if (event.data === (window as any).YT.PlayerState.PAUSED) {
      this.setVideoState(false);
    } else if (event.data === (window as any).YT.PlayerState.ENDED) {
      this.setVideoState(false);
    }
    console.log('Player state changed:', event.target.getVideoData().title);
    // Also update title if we just loaded a new video or started playing
    if (event.data === (window as any).YT.PlayerState.PLAYING || event.data === (window as any).YT.PlayerState.PAUSED || event.data === (window as any).YT.PlayerState.CUED) {
      const videoData = event.target.getVideoData();
      console.log('videoData title:', videoData.title, 'currentList title:', this.currentList().title);
      if (videoData && videoData.title) {
        if (!this.currentList().title || this.currentList().title === 'New Language Practice' || this.currentList().title === '') {
          this.currentList.update(l => ({ ...l, title: videoData.title }));
        }
      }


    }
  }

  /** Load a video from the input URL or ID */
  async loadVideo(videoIdInput: string): Promise<void> {
    if (!videoIdInput) return;
    // console.log('Loading video', this.videoInput());
    // Parse ID
    let id = videoIdInput.trim();
    const regExp = /^.*(youtu\.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
    const match = id.match(regExp);
    if (match && match[2].length === 11) {
      id = match[2];
    }

    if (!id) {
      this.snackBar.open('Invalid Video ID or URL', 'OK');
      return;
    }

    // 1. (Cleared via Dialog)

    // 2. CHECK LIBRARY FOR EXISTING FILE
    // We can only check if we already have permission (no prompt)
    const isAccess = await this.fileStorage.verifyPermission(false);
    const existingFile = await this.scanLibraryForVideoId(id);
    if (existingFile) {
      this.snackBar.open('Found existing loops for this video', '', { duration: 2500 });
      try {
        const data = await this.fileStorage.loadFile(existingFile.handle);
        this.loadList(data);
      } catch (e) {
        console.error('Failed to load existing file', e);
      }
      return;
    }


    // 3. NOT FOUND -> LOAD NEW
    // 3. NOT FOUND -> LOAD NEW
    this.resetEditorState();

    this.videoId.set(id);

    // Reset current list for the new video
    this.currentList.set({
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
    });


    // Update player
    if (this.player && this.player.loadVideoById) {
      this.player.loadVideoById(id);
      // console.log('Loaded video', id);
    }

    this.snackBar.open('There are no loops yet for this video. You can create one now', 'OK', { duration: 5000 });
  }

  async scanLibraryForVideoId(videoId: string): Promise<any | null> {
    // Brute-force scan of small libraries
    // Note: We need to get files from service now since we don't hold state
    try {
      // Quick check if we have access first without prompt
      const granted = await this.fileStorage.verifyPermission(false);
      if (!granted) return null;

      const files = await this.fileStorage.getFiles();
      for (const fileItem of files) {
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
    } catch (e) {
      return null;
    }
  }

  /** R3.2: Sets the loop start time to the current video time. */
  setStartTime(): void {
    this.currentStartTime.set(this.player.getCurrentTime());
    console.log(`Start Time set: ${this.currentStartTime()}`);
  }

  /** R3.2: Sets the loop end time to the current video time. */
  setEndTime(): void {
    this.currentEndTime.set(this.player.getCurrentTime());
    console.log(`End Time set: ${this.currentEndTime()}`);
  }

  /** R2.4: Saves the defined loop to the list */
  addLoop(): void {
    const start = this.currentStartTime();
    const end = this.currentEndTime();
    if (end > start && start >= 0) {
      this.currentList.update(list => {
        const newLoop: Loop = {
          loopIndex: list.loops.length,
          name: `Loop ${list.loops.length + 1}`,
          startTime: start,
          endTime: end,
          primaryText: '',
          secondaryText: '',
        };
        list.loops.push(newLoop); // Mutating array inside object, then returning object to update signal
        return { ...list }; // Trigger signal update with shallow copy logic
      });
      this.markListChanged();
      // Reset times for next loop definition
      this.currentStartTime.set(0);
      this.currentEndTime.set(0);
    } else {
      alert('End time must be greater than start time.');
    }
  }

  /** R6.3: Updates playback rate */
  updatePlaybackRate(event: Event): void {
    const target = event.target as HTMLSelectElement | null;
    if (!target) return;
    this.playbackRate.set(Number(target.value));
    if (this.player) {
      this.player.setPlaybackRate(this.playbackRate());
    }
  }

  /** Play a loop by its index. If `loopForever` is true, it will repeatedly loop. */
  playLoop(loopIndex: number, loopForever: boolean = false): void {
    const loop = this.currentList().loops[loopIndex];
    if (!loop || !this.player) return;

    this.playingLoopIndex.set(loopIndex);
    this.isPlayingExpanded.set(false);
    this._playRange(loop.startTime, loop.endTime, loopForever);
  }

  /** Play expanded loop from selected loops */
  playExpandedLoop(): void {
    if (this.selectedLoops().size === 0) return;

    // Get selected loops and sort them by index to ensure correct order
    const indices = Array.from(this.selectedLoops()).sort((a, b) => a - b);
    const loops = this.currentList().loops.filter((_, i) => indices.includes(i));

    // Safety check: ensure loops are sorted by index effectively
    loops.sort((a, b) => a.loopIndex - b.loopIndex);

    if (loops.length === 0) return;

    // Setup Sequence
    this.playQueue.set(loops);
    this.currentQueueIndex.set(0);

    this.playingLoopIndex.set(null);
    this.isPlayingExpanded.set(true);
    this.isLooping.set(true); // Expanded mode loops the whole sequence forever

    this._playSequenceItem();
  }

  /** Stop expanded loop and clear selection */
  stopExpandedLoop(): void {
    this.stopLoop();
    this.selectedLoops.set(new Set());
    this.playQueue.set([]);
    this.currentQueueIndex.set(0);
  }

  private _playSequenceItem(): void {
    if (this.currentQueueIndex() >= this.playQueue().length) {
      // Sequence finished, loop back to start
      this.currentQueueIndex.set(0);
    }

    const loop = this.playQueue()[this.currentQueueIndex()];
    if (!loop) return;

    // Use a specialized checker for the sequence item
    this._playRange(loop.startTime, loop.endTime, false);
    // Note: we pass false for 'loopForever' because _playRange logic 
    // will be slightly modified or we handle the "looping" manually in the interval.
    // Actually, let's look at _playRange logic below to adapt it.
  }

  private _playRange(startTime: number, endTime: number, loopForever: boolean): void {
    // If we are in expanded mode, 'loopForever' param here applies to the *single item*? 
    // No, we want to play this item once, then go to next.
    // So for Sequence items, loopForever is false.

    // However, we need to distinguish between "Single Loop Repeating" and "Expanded Sequence Repeating".
    // inner isLooping state is used by the checker.

    if (!this.isPlayingExpanded()) {
      this.isLooping.set(!!loopForever);
    }
    // If expanded, we handle logic in checker.

    // Seek to start and play
    try {
      this.player.seekTo(startTime, true);
      this.player.setPlaybackRate(this.playbackRate());
      this.player.playVideo();
      this.setVideoState(true);
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

      // If we've reached or passed the end time
      if (t >= endTime) {
        if (this.isPlayingExpanded()) {
          // Sequence Logic: Move to next item
          this.currentQueueIndex.update(i => i + 1);
          this._playSequenceItem();
        } else if (this.isLooping()) {
          // Standard Single Loop Logic: Seek back to start
          this.player.seekTo(startTime, true);
          this.player.setPlaybackRate(this.playbackRate());
          this.player.seekTo(startTime, true);
          this.player.setPlaybackRate(this.playbackRate());
          this.player.playVideo();
        } else {
          // Stop playback
          this.stopLoop();
        }
      }
    }, 150);
  }

  toggleLoopSelection(index: number): void {
    const wasPlayingExpanded = this.isPlayingExpanded();
    // 1. Capture currently playing loop if in expanded mode
    let currentPlayingLoop: Loop | undefined;
    if (wasPlayingExpanded) {
      currentPlayingLoop = this.playQueue()[this.currentQueueIndex()];
    }

    this.selectedLoops.update(set => {
      if (set.has(index)) {
        set.delete(index);
      } else {
        set.add(index);
      }
      return new Set(set); // Return new set to trigger change
    });

    // 2. If playing expanded, update the queue dynamically
    if (wasPlayingExpanded) {
      const indices = Array.from(this.selectedLoops()).sort((a, b) => a - b);
      const newQueue = this.currentList().loops.filter((_, i) => indices.includes(i));
      newQueue.sort((a, b) => a.loopIndex - b.loopIndex);

      this.playQueue.set(newQueue);

      if (newQueue.length === 0) {
        this.stopExpandedLoop();
        return;
      }

      // 3. Re-sync currentQueueIndex
      if (currentPlayingLoop) {
        const newIndex = newQueue.findIndex(l => l.loopIndex === currentPlayingLoop!.loopIndex);
        if (newIndex !== -1) {
          // Loop is still in the queue, update index
          this.currentQueueIndex.set(newIndex);
        } else {
          // Loop was removed. Find the nearest following loop to maintain flow.
          const nextLoop = newQueue.find(l => l.loopIndex > currentPlayingLoop!.loopIndex);
          if (nextLoop) {
            const nextIndex = newQueue.indexOf(nextLoop);
            // Set to (nextIndex - 1) so that when the current one finishes, 
            // the player logic (i + 1) will hit 'nextIndex'.
            this.currentQueueIndex.set(nextIndex - 1);
          } else {
            // No loops after this one. Wrap to start (conceptually).
            // Set to last index so (i + 1) triggers reset to 0
            this.currentQueueIndex.set(newQueue.length - 1);
          }
        }
      } else {
        // Fallback if somehow nothing was playing?
        this.currentQueueIndex.set(0);
      }
    }
  }

  isLoopSelected(index: number): boolean {
    return this.selectedLoops().has(index);
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
        this.setVideoState(false);
      } catch (e) {
        // ignore
      }
    }
    this.playingLoopIndex.set(null);
    this.isPlayingExpanded.set(false);
    this.isLooping.set(false);
    this.playQueue.set([]);
    this.currentQueueIndex.set(0);
  }

  deleteLoop(index: number): void {
    if (index >= 0 && index < this.currentList().loops.length) {
      this.currentList.update(l => {
        l.loops.splice(index, 1);
        return { ...l };
      });
      this.reindexLoops();
      this.markListChanged();
      this.snackBar.open('Loop deleted', '', { duration: 1000 });
    }
  }

  drop(event: CdkDragDrop<string[]>): void {
    this.currentList.update(l => {
      moveItemInArray(l.loops, event.previousIndex, event.currentIndex);
      return { ...l };
    });
    this.reindexLoops();
    this.markListChanged();
  }

  private reindexLoops(): void {
    this.currentList.update(l => {
      l.loops.forEach((loop, i) => {
        loop.loopIndex = i;
      });
      return { ...l };
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

  // --- Template Helpers ---
  updateListTitle(title: string): void {
    this.currentList.update(l => ({ ...l, title }));
    this.markListChanged();
  }

  updateListPublic(isPublic: boolean): void {
    this.currentList.update(l => ({ ...l, isPublic }));
    this.markListChanged();
  }

  updateListLanguage(language: string): void {
    this.currentList.update(l => ({ ...l, language }));
    this.markListChanged();
  }

  // --- Helper to Reset State ---
  resetEditorState(): void {
    this.stopLoop();
    this.selectedLoops.set(new Set()); // Clear selection
    this.playQueue.set([]); // Clear queue
    this.currentQueueIndex.set(0); // Reset queue index
    // Note: We do NOT reset currentList here, as it will be set by the caller (loadVideo or loadList)
  }

  // --- Folder / Library Logic ---

  openLibraryDialog(): void {
    const ref = this.dialog.open(LibraryDialogComponent, {
      width: '500px',
      height: '600px',
    });

    ref.afterClosed().subscribe((data: LoopList | undefined) => {
      if (data) {
        this.loadList(data);
      }
    });
  }



  async saveToLibrary(): Promise<void> {
    // Check basic support
    if (!this.isFileAccessSupported) return;

    // Check if we have a handle (via service check, or we can catch error)
    // We can rely on service verifyPermission which checks handle existence


    // use current title as filename
    const filename = this.currentList().title.trim() || 'Untitled';

    try {
      // Ensure we have write permission
      const granted = await this.fileStorage.verifyPermission(true);
      if (!granted) {
        this.snackBar.open('Write permission needed', 'OK');
        return;
      }

      // Update timestamp
      this.currentList.update(l => ({ ...l, updatedAt: new Date() }));

      await this.fileStorage.saveToFolder(filename, this.currentList());
      this.snackBar.open('Saved to Library', '', { duration: 2000 });

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
        data: { name: this.currentList().title || '' },
      });
      ref.afterClosed().subscribe(async (name?: string) => {
        if (!name) return;
        this.currentList.update(l => ({ ...l, title: name }));
        try {
          await this.fileStorage.saveFile(this.currentList(), name);
          this.snackBar.open('File downloaded', '', { duration: 2000 });
        } catch (e) {
          console.error('Save file failed', e);
        }
      });
      return;
    }

    // Native File System API Supported
    try {
      await this.fileStorage.saveFile(this.currentList(), this.currentList().title || 'loop-list');
      this.snackBar.open('File saved', '', { duration: 2000 });
    } catch (e) {
      console.error('Save file failed', e);
      this.snackBar.open('Failed to save file', 'OK');
    }
  }





  private loadList(data: LoopList): void {
    this.resetEditorState();
    this.currentList.set(data);
    if (data.videoId) {
      this.videoId.set(data.videoId);
      // Load the video in the player
      if (this.player && this.player.loadVideoById) {
        this.player.loadVideoById(this.videoId());
      }
      // console.log('Loaded video', this.videoId());
    }
    // Reset player state if needed, or just let user play
    this.snackBar.open('List loaded from file', '', { duration: 2000 });
    console.log('Loaded list', this.currentList());
  }

  @HostListener('window:keydown', ['$event'])
  handleKeyboardEvent(event: KeyboardEvent) {
    // Ignore if user is typing in an input
    const target = event.target as HTMLElement;
    if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') {
      return;
    }

    if (event.key === 'ArrowLeft') {
      // this.adjustTime(-0.1);
      this.adjustTime(-this.skipDuration());
      event.preventDefault(); // Prevent scrolling if needed
    } else if (event.key === 'ArrowRight') {
      this.adjustTime(this.skipDuration());
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
