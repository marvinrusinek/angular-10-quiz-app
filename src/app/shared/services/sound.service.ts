import { DOCUMENT } from '@angular/common';
import { Inject, Injectable, Optional } from '@angular/core';
import { Howl, Howler } from 'howler';

import { SelectedOption } from '../../shared/models/SelectedOption.model';

@Injectable({ providedIn: 'root' })
export class SoundService {
  private sounds: Record<string, Howl> = {};
  private playedMap = new Map<number, Set<number>>();

  // Track which (questionIndex, optionId) pairs played sound
  private playedSoundOptions: Set<string> = new Set();

  /* constructor() {
    this.initializeSounds();
  } */

  /* initializeSounds(): void {
    this.sounds['correct'] = new Howl({
      src: ['https://raw.githubusercontent.com/marvinrusinek/angular-10-quiz-app/master/src/assets/sounds/correct.mp3'],
      html5: true
    });

    this.sounds['incorrect'] = new Howl({
      src: ['https://raw.githubusercontent.com/marvinrusinek/angular-10-quiz-app/master/src/assets/sounds/incorrect.mp3'],
      html5: true
    });
    this.sounds['correct'] = new Howl({
      src: ['../../../assets/sounds/correct.mp3'],
      html5: true
    });

    this.sounds['incorrect'] = new Howl({
      src: ['../../../assets/sounds/incorrect.mp3'],
      html5: true
    });
  } */

  constructor(@Optional() @Inject(DOCUMENT) private readonly document: Document | null) {
    this.configureHowler();
    this.initializeSounds();
  }

  initializeSounds(): void {
    this.sounds['correct'] = new Howl({
      src: [this.resolveSoundUrl('correct.mp3')],
      preload: true
    });

    this.sounds['incorrect'] = new Howl({
      src: [this.resolveSoundUrl('incorrect.mp3')],
      preload: true
    });
  }

  // Play a sound only once per (questionIndex + optionId)
  playOnceForOption(option: SelectedOption): void {
    const qIndex = option.questionIndex ?? -1;
    const optId = option.optionId;
    const key = `${qIndex}-${optId}`;
    const alreadyPlayed = this.playedSoundOptions.has(key);
    
    if (alreadyPlayed) {
      console.log(`[⏸️ Sound already played for Q${qIndex}, Option ${optId}]`);
      return;
    }

    // Determine which sound to play and play the correct sound
    const soundName = option.correct ? 'correct' : 'incorrect';
    this.play(soundName);

    // Track that this option has been played
    const playedSet = this.playedMap.get(qIndex) ?? new Set<number>();
    playedSet.add(optId);
    this.playedMap.set(qIndex, playedSet);
    this.playedSoundOptions.add(key);
  }

  play(soundName: string): void {
    this.resumeAudioContextIfSuspended();  // ensure audio context is active
  
    const sound = this.sounds[soundName];
    if (!sound) {
      console.warn(`[❌ Sound "${soundName}" not found. Sounds may not be initialized yet.]`);
      return;
    }
  
    try {
      sound.stop();  // stop any current playback
      const soundId = sound.play();  // returns a numeric sound ID
      console.log(`[✅ "${soundName}" triggered successfully with soundId: ${soundId}]`);
    } catch (error) {
      console.error(`[❌ Error playing sound "${soundName}"]:`, error);
    }
  }  

  // True if already played a sound for this option
  hasPlayed(qIdx: number, optId: number): boolean {
    return this.playedMap.get(qIdx)?.has(optId) ?? false;
  }

  // Mark that now played a sound
  markPlayed(qIdx: number, optId: number): void {
    if (!this.playedMap.has(qIdx)) this.playedMap.set(qIdx, new Set<number>());
    this.playedMap.get(qIdx)!.add(optId);
  }

  public reset(): void {
    this.playedSoundOptions.clear();
  
    // Stop and unload all existing Howl instances FIRST
    Object.values(this.sounds).forEach((sound) => {
      try {
        sound.stop();
        sound.unload();
      } catch (error) {
        console.warn('[SoundService] Error stopping/unloading sound:', error);
      }
    });
  
    this.sounds = {};

    // Ensure audio context is resumed before recreating sounds
    this.resumeAudioContextIfSuspended();

    // this.playedMap.clear();

    // Small delay to ensure audio context is ready
    setTimeout(() => {
      this.initializeSounds();  // recreate fresh Howl instances
    }, 100);
  }

  resumeAudioContextIfSuspended(): void {
    try {
      const ctx = (Howler as any).ctx as AudioContext;
    
      if (ctx && ctx.state === 'suspended') {
        ctx.resume().then(() => {
          console.log('[🔊 AudioContext resumed]');
        }).catch(err => {
          console.error('[❌ Failed to resume AudioContext]', err);
        });
      }
    } catch (error) {
      console.warn('[⚠️ Error accessing AudioContext]:', error);
    }
  }

  // Method to ensure sounds are ready after restart
  ensureSoundsReady(): void {
    if (!this.sounds['correct'] || !this.sounds['incorrect']) {
      this.initializeSounds();
    }
  }

  clearPlayedOptionsForQuestion(questionIndex: number): void {
    const keysToDelete = [...this.playedSoundOptions].filter(key =>
      key.startsWith(`${questionIndex}-`)
    );
    keysToDelete.forEach(key => this.playedSoundOptions.delete(key));
  }

  private configureHowler(): void {
    try {
      Howler.autoUnlock = true;
    } catch (error) {
      console.warn('[⚠️ Unable to configure Howler autoUnlock]', error);
    }
  }

  private resolveSoundUrl(fileName: string): string {
    const fallbackUrl = `assets/sounds/${fileName}`;

    try {
      const baseHref = this.document?.baseURI ?? this.document?.location?.href;

      if (!baseHref) {
        return fallbackUrl;
      }

      return new URL(`assets/sounds/${fileName}`, baseHref).toString();
    } catch (error) {
      console.warn('[⚠️ Falling back to relative sound path]', error);
      return fallbackUrl;
    }
  }
}