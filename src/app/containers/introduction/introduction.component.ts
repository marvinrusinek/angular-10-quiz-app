import { ChangeDetectionStrategy, Component, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

import { QUIZ_DATA } from '../../shared/quiz';
import { Quiz } from '../../shared/models/Quiz.model';
import { QuizService } from '../../shared/services/quiz.service';

@Component({
  selector: 'codelab-quiz-intro',
  templateUrl: './introduction.component.html',
  styleUrls: ['./introduction.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class IntroductionComponent implements OnInit {
  quizData: Quiz[] = QUIZ_DATA;
  quizzes$: Observable<Quiz[]>;
  quizName$: Observable<string>;
  imagePath = '../../../assets/images/milestones/';

  constructor(
    private quizService: QuizService,
    private activatedRoute: ActivatedRoute
  ) { }

  ngOnInit(): void {
    this.quizzes$ = this.quizService.getQuizzes();
    this.quizName$ = this.activatedRoute.url.pipe(
      map(segments => segments[1].toString())
    );
  }

  onChange($event): void {
    if ($event.checked === true) {
      this.quizService.setChecked($event.checked);
    }
  }
}