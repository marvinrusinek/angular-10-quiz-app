import { Injectable } from '@angular/core';
import { Howl } from 'howler';

@Injectable({ providedIn: 'root' })
export class SoundService {
  private sounds: Record<string, Howl> = {};

  constructor() {
    console.log('Loading sounds...');
    this.sounds['correct'] = new Howl({
      src: ['../../assets/sounds/correct.mp3'],
      onloaderror: (id, err) => console.error('[❌ Load error]', err),
      onload: () => console.log('[✅ Loaded] correct.mp3')
    });
    this.sounds['incorrect'] = new Howl({
      src: ['../../assets/sounds/incorrect.mp3'],
      onloaderror: (id, err) => console.error('[❌ Load error]', err),
      onload: () => console.log('[✅ Loaded] incorrect.mp3')
    });
  }

  play(soundName: string): void {
    const sound = this.sounds[soundName];
    if (!sound) {
      console.warn(`[❌ Sound "${soundName}" not found]`);
      return;
    }
  
    console.log(`[🔊 Attempting to play sound: ${soundName}]`);
    console.log('🔍 Howl object:', sound);
    
    const id = sound.play();
  
    // Howler event hooks
    sound.once('play', () => console.log(`[✅ Sound "${soundName}" started playing]`));
    sound.once('end', () => console.log(`[🎵 Sound "${soundName}" finished playing]`));
    sound.once('loaderror', (_, err) => console.error(`[❌ Load error for "${soundName}"`, err));
    sound.once('playerror', (_, err) => console.error(`[❌ Play error for "${soundName}"`, err));
  }   
}
