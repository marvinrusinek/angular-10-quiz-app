import { Injectable, Input } from '@angular/core';
import { Router } from '@angular/router';

import { QUIZ_DATA } from '../quiz';


@Injectable({
  providedIn: 'root',
})
export class NavigationService {
  quizData = QUIZ_DATA;

  @Input() correctAnswers: [];
  @Input() completionTime: number;
  @Input() questionIndex: number;

  constructor(private router: Router) {}

  navigateToNextQuestion(questionID): void {
    this.router.navigate(['/question', questionID]);
  }

  navigateToResults(): void {
    this.router.navigate(['/results'], {
      state:
        {
          questions: this.quizData.questions,
          results: {
            correctAnswers: this.correctAnswers,
            completionTime: this.completionTime
          }
        }
    });
  }
}
