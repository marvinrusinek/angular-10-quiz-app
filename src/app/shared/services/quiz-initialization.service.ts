// src/app/shared/services/quiz-initialization.service.ts

import { Injectable } from '@angular/core';
import { QuizService } from './quiz.service';
import { QuizDataService } from './quizdata.service';
import { QuizStateService } from './quizstate.service';
import { QuizQuestionManagerService } from './quizquestionmgr.service';
import { ProgressBarService } from './progress-bar.service';
import { QuizQuestion } from '../models/QuizQuestion.model';
import { Option } from '../models/Option.model';
import { BehaviorSubject, forkJoin } from 'rxjs';
import { tap } from 'rxjs/operators';

@Injectable({
  providedIn: 'root'
})
export class QuizInitializationService {
  constructor(
    private quizService: QuizService,
    private quizDataService: QuizDataService,
    private quizStateService: QuizStateService,
    private quizQuestionManagerService: QuizQuestionManagerService,
    private progressBarService: ProgressBarService
  ) {}

  initializeQuiz(questionIndex: number): void {
    console.log('[🧠 QuizInitializationService] Initializing quiz...');

    this.quizDataService.fetchQuizData();

    this.quizService.currentQuestionIndexSource.next(questionIndex);
    this.quizService.setQuizStarted(true);
    this.progressBarService.setProgress(0);
  }

  loadQuestionData(index: number, updateFn: (q: QuizQuestion, opts: Option[]) => void): void {
    forkJoin({
      question: this.quizService.getQuestionByIndex(index),
      options: this.quizService.getOptions(index)
    })
      .pipe(
        tap(({ question, options }) => {
          if (!question || !options) {
            console.warn('[⚠️ QuizInitializationService] Missing question or options');
            return;
          }
          updateFn(question, options);
        })
      )
      .subscribe();
  }
}
