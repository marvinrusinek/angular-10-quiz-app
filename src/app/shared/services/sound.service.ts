import { Injectable } from '@angular/core';
import { Howl } from 'howler';

import { SelectedOption } from '../../shared/models/SelectedOption.model';

@Injectable({ providedIn: 'root' })
export class SoundService {
  private sounds: Record<string, Howl> = {};
  private playedMap = new Map<number, Set<number>>();

  // Track which (questionIndex, optionId) pairs played sound
  private playedSoundOptions = new Set<string>();

  constructor() {
    this.sounds['correct'] = new Howl({
      src: [
        'https://raw.githubusercontent.com/marvinrusinek/angular-10-quiz-app/master/src/assets/sounds/correct.mp3'
      ]
    });
    this.sounds['incorrect'] = new Howl({
      src: [
        'https://raw.githubusercontent.com/marvinrusinek/angular-10-quiz-app/master/src/assets/sounds/incorrect.mp3'
      ]
    });
  }

  // Play a sound only once per (questionIndex + optionId) */
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
  }

  play(soundName: string): void {
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
    this.playedSoundOptions.clear();
  }

  reloadAll(): void {
    Object.values(this.sounds).forEach(sound => {
      sound.unload(); // clears buffer and context
      sound.load();   // re-initialize
    });
    console.log('[🔁 SoundService] Reloaded all sounds');
  }
}