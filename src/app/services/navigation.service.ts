import { Injectable, Input } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';

import { QUIZ_DATA } from '../quiz';


@Injectable({
  providedIn: 'root',
})
export class NavigationService {
  quizData = QUIZ_DATA;

  @Input() correctAnswers: [];
  @Input() completionTime: number;
  @Input() questionIndex: number;

  constructor(
    private route: ActivatedRoute,
    private router: Router) {}

  navigateToNextQuestion(): void {
    // if (this.quizService.isThereAnotherQuestion()) {
      this.router.navigate(['/question', this.questionIndex + 1]);
    // } else {
    //  this.navigateToResults();
    // }
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
