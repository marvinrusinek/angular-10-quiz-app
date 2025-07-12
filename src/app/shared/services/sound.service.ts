import { Injectable } from '@angular/core';
import { Howl } from 'howler';

import { SelectedOption } from '../../shared/models/SelectedOption.model';

@Injectable({ providedIn: 'root' })
export class SoundService {
  private sounds: Record<string, Howl> = {};
  private playedMap = new Map<number, Set<number>>();

  // Track which (questionIndex, optionId) pairs played sound
  private playedSoundOptions: Set<string> = new Set();

  constructor() {
    this.initializeSounds();
  }

  initializeSounds(): void {
    this.sounds['correct'] = new Howl({
      src: ['https://raw.githubusercontent.com/marvinrusinek/angular-10-quiz-app/master/src/assets/sounds/correct.mp3'],
      html5: true
    });

    this.sounds['incorrect'] = new Howl({
      src: ['https://raw.githubusercontent.com/marvinrusinek/angular-10-quiz-app/master/src/assets/sounds/incorrect.mp3'],
      html5: true
    });  
  }

  // Play a sound only once per (questionIndex + optionId)
  playOnceForOption(option: SelectedOption): void {
    if (!option) {
      console.warn('[🔇 playOnceForOption] No option provided');
      return;
    }

    // Ensure questionIndex is valid (should be 0 after restart)
    if (option.questionIndex === undefined || option.questionIndex === null) {
      console.warn('[🔇 playOnceForOption] Invalid questionIndex:', option.questionIndex);
      return;
    }

    const key = `${option.questionIndex}-${option.optionId}`;

    // Check if we've already played sound for this option
    if (this.playedSoundOptions.has(key)) {
      console.log(`[🔇 Skipping sound for reselected option: ${key}]`);
      return;
    }

    // Mark this option as having played sound
    this.playedSoundOptions.add(key);

    // Determine which sound to play
    const soundName = option.correct ? 'correct' : 'incorrect';

    // Play the sound
    this.play(soundName);

    console.log('[🧪 Sound Check]', { option });
    console.log('[🧪 Key]', key);
    console.log('[🧪 Already played?]', this.playedSoundOptions.has(key));
  }

  play(soundName: string): void {
    this.resumeAudioContextIfSuspended();  // ensure context is active

    const sound = this.sounds[soundName];
    if (!sound) {
      console.warn(`[❌ Sound "${soundName}" not found. Sounds may not be initialized yet.]`);
      return;
    }
    console.log(`[🔊 Playing "${soundName}"]`);
  
    sound.stop();  // ensure it's reset
    sound.play();
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
    console.log('[🔁 SoundService] Resetting...');
  
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
    this.playedSoundOptions.clear();
    this.playedMap.clear();

    // Ensure audio context is resumed before recreating sounds
    this.resumeAudioContextIfSuspended();

    // Small delay to ensure audio context is ready
    setTimeout(() => {
      this.initializeSounds();  // recreate fresh Howl instances
      console.log('[🔁 SoundService] Reset complete - sounds reinitialized');
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
}