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
    if (!option) return;

    const key = `${option.questionIndex}-${option.optionId}`;
    if (this.playedSoundOptions.has(key)) {
      console.log(`[🔇 Skipping sound for reselected option: ${key}]`);
      return;
    }

    this.playedSoundOptions.add(key);
    const soundName = option.correct ? 'correct' : 'incorrect';
    this.play(soundName);

    console.log('[🧪 Sound Check]', { option });
    console.log('[🧪 Key]', key);
    console.log('[🧪 Already played?]', this.playedSoundOptions.has(key));
  }

  play(soundName: string): void {
    this.resumeAudioContextIfSuspended();  // ensure context is active

    const sound = this.sounds[soundName];
    if (!sound) {
      console.warn(`[❌ Sound "${soundName}" not found]`);
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
      sound.stop();
      sound.unload();
    });
  
    // Then clear the sound map and reinitialize
    this.sounds = {};
    this.playedSoundOptions.clear();
  
    this.initializeSounds(); // recreate fresh Howl instances
    this.resumeAudioContextIfSuspended(); // ensure audio context is ready
  }  

  resumeAudioContextIfSuspended(): void {
    const ctx = (Howler as any).ctx as AudioContext;
  
    if (ctx && ctx.state === 'suspended') {
      ctx.resume().then(() => {
        console.log('[🔊 AudioContext resumed]');
      }).catch(err => {
        console.error('[❌ Failed to resume AudioContext]', err);
      });
    }
  }  
}