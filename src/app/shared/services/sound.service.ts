import { Injectable } from '@angular/core';
import { Howl } from 'howler';

@Injectable({ providedIn: 'root' })
export class SoundService {
  private sounds: Record<string, Howl> = {};

  constructor() {
    this.sounds['correct'] = new Howl({
      src: ['https://raw.githubusercontent.com/marvinrusinek/angular-10-quiz-app/master/src/assets/sounds/correct.mp3']
    });
    this.sounds['incorrect'] = new Howl({
      src: ['https://raw.githubusercontent.com/marvinrusinek/angular-10-quiz-app/master/src/assets/sounds/incorrect.mp3']
    });
  }

  play(soundName: string): void {
    const sound = this.sounds[soundName];
    if (!sound) {
      console.warn(`[❌ Sound "${soundName}" not found]`);
      return;
    }
  
    sound.play();
  }  
}
