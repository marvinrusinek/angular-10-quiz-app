import { Injectable } from '@angular/core';
import { Howl } from 'howler';

@Injectable({ providedIn: 'root' })
export class SoundService {
  private sounds: Record<string, Howl> = {};

  constructor() {
    console.log('Loading sounds...');
    this.sounds['correct'] = new Howl({
      src: ['https://raw.githubusercontent.com/marvinrusinek/angular-10-quiz-app/master/src/assets/sounds/correct.mp3'],
      volume: 1.0,
      html5: true, // ✅ required for remote streaming
      onload: () => console.log('[✅ Loaded] correct.mp3'),
      onloaderror: (id, err) => console.error('[❌ Load error]', err),
      onplayerror: (id, err) => console.error('[❌ Play error]', err)
    });
    
    this.sounds['incorrect'] = new Howl({
      src: ['https://raw.githubusercontent.com/marvinrusinek/angular-10-quiz-app/master/src/assets/sounds/incorrect.mp3'],
      volume: 1.0,
      html5: true,
      onload: () => console.log('[✅ Loaded] incorrect.mp3'),
      onloaderror: (id, err) => console.error('[❌ Load error]', err),
      onplayerror: (id, err) => console.error('[❌ Play error]', err)
    });
  }

  play(soundName: string): void {
    const sound = this.sounds[soundName];
    if (!sound) {
      console.warn(`[❌ Sound "${soundName}" not found]`);
      return;
    }
  
    console.log(`[🔊 Attempting to play sound: ${soundName}]`);
    const id = sound.play();
  
    sound.once('play', () =>
      console.log(`[✅ Sound "${soundName}" started playing]`)
    );
    sound.once('end', () =>
      console.log(`[🎵 Sound "${soundName}" finished playing]`)
    );
    sound.once('playerror', (_, err) =>
      console.error(`[❌ Play error for "${soundName}"]`, err)
    );
  }  
}
