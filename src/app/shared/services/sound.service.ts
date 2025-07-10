import { Injectable } from '@angular/core';
import { Howl } from 'howler';

@Injectable({ providedIn: 'root' })
export class SoundService {
  private sounds: Record<string, Howl> = {};

  constructor() {
    console.log('Loading sounds...');
    this.sounds['correct'] = new Howl({
      src: ['assets/sounds/correct.mp3'],
      onloaderror: (id, err) => console.error('[❌ Load error]', err),
      onload: () => console.log('[✅ Loaded] correct.mp3')
    });
    this.sounds['incorrect'] = new Howl({
      src: ['assets/sounds/incorrect.mp3'],
      onloaderror: (id, err) => console.error('[❌ Load error]', err),
      onload: () => console.log('[✅ Loaded] incorrect.mp3')
    });
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
