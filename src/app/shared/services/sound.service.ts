import { Injectable } from '@angular/core';
import { Howl } from 'howler';

@Injectable({ providedIn: 'root' })
export class SoundService {
  private sounds: Record<string, Howl> = {};

  constructor() {
    this.sounds['correct'] = new Howl({ src: ['assets/sounds/correct.mp3'] });
    this.sounds['wrong'] = new Howl({ src: ['assets/sounds/wrong.mp3'] });
    this.sounds['click'] = new Howl({ src: ['assets/sounds/click.mp3'] });
  }

  play(soundName: string): void {
    const sound = this.sounds[soundName];
    if (sound) {
      sound.play();
    } else {
      console.warn(`[SoundService] Sound '${soundName}' not found.`);
    }
  }
}
