import { Component, OnInit } from '@angular/core';
import { DecimalPipe, NgIf, NgFor } from '@angular/common';
import { YouTubePlayerModule } from '@angular/youtube-player';
import { Loop, LoopList } from '../models/loop';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatSelectModule } from '@angular/material/select';
import { FormsModule } from '@angular/forms';
import { MatInputModule } from '@angular/material/input';

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
    DecimalPipe,
    FormsModule,
    MatInputModule,
    /* Angular Material Modules, CommonModule, Forms... */
  ],
})
export class LoopEditorComponent implements OnInit {
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
  private _loopChecker: any = null; // interval id for checking loop end

  ngOnInit() {
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
}
