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
    if (option.optionId == null) {
      console.warn('[⚠️ playOnceForOption] Missing optionId', option);
      return;
    }

    if (option.questionIndex == null) {
      console.error('[❌ playOnceForOption] MISSING questionIndex!', option);
      option.questionIndex = 0;  // fallback for Q1
    } else {
      console.log('[✅ Valid questionIndex in option]', option.questionIndex);
    }

    console.log('[🧪 Option Before Sound]', option);

    const key = `${option.questionIndex}-${option.optionId}`;
    const alreadyPlayed = this.playedSoundOptions.has(key);
    console.log('[🧪 Key]', key, '[🧪 Already played?]', alreadyPlayed);

    if (alreadyPlayed) {
      console.log(`[🔇 Skipping sound for reselected option: ${key}]`);
      return;
    }

    // Mark this as played BEFORE or AFTER playing sound
    // this.playedSoundOptions.add(key);

    // Determine which sound to play
    const soundName = option.correct ? 'correct' : 'incorrect';

    // Play the sound
    this.play(soundName);
    this.playedSoundOptions.add(key);

    console.log('[🧪 Sound Check]', { option });
    console.log('[🧪 Key]', key);
    console.log('[🧪 Already played?]', this.playedSoundOptions.has(key));
  }

  /* play(soundName: string): void {
    // Ensure audio context is active
    this.resumeAudioContextIfSuspended();  // ensure context is active

    const sound = this.sounds[soundName];
    if (!sound) {
      console.warn(`[❌ Sound "${soundName}" not found. Sounds may not be initialized yet.]`);
      return;
    }
    console.log(`[🔊 Playing "${soundName}"]`);
  
    try {
      console.log(`[🔊 Playing "${soundName}"]`);
      sound.stop();  // ensure it's reset
      sound.play();
    } catch (error) {
      console.error(`[❌ Error playing sound "${soundName}"]:`, error);
    }
  } */
  play(soundName: string): void {
    this.resumeAudioContextIfSuspended();  // ensure audio context is active
  
    const sound = this.sounds[soundName];
    if (!sound) {
      console.warn(`[❌ Sound "${soundName}" not found. Sounds may not be initialized yet.]`);
      return;
    }
  
    console.log(`[🔊 Attempting to play "${soundName}"]`);
  
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
    console.log('[🔁 SoundService] Resetting...');
    console.log('[🛠️ reset() called in SoundService]');  // TOP-LEVEL LOG
    console.log('[🧼 playedSoundOptions before clear]', Array.from(this.playedSoundOptions));

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

  // Method to ensure sounds are ready after restart
  ensureSoundsReady(): void {
    if (!this.sounds['correct'] || !this.sounds['incorrect']) {
      console.log('[🔁 Reinitializing sounds - they may have been cleared]');
      this.initializeSounds();
    }
  }

  clearPlayedOptionsForQuestion(questionIndex: number): void {
    const keysToDelete = [...this.playedSoundOptions].filter(key =>
      key.startsWith(`${questionIndex}-`)
    );
    keysToDelete.forEach(key => this.playedSoundOptions.delete(key));
    console.log(`[🔁 Cleared sound flags for Q${questionIndex}]`, keysToDelete);
  }  
}