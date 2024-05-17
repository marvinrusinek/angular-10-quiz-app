import { ChangeDetectionStrategy, Component, OnInit } from '@angular/core';

import { QuizDataService } from './shared/services/quizdata.service';

@Component({
  selector: 'codelab-root',
  templateUrl: './app.component.html',
  styleUrls: [ './app.component.scss' ],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class AppComponent  {
  constructor(private quizDataService: QuizDataService) {}

  ngOnInit() {
    this.quizDataService.loadQuizzesData(); // Ensure quizzes are loaded on app start
  }
}
