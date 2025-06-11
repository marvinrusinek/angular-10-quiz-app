import { Injectable } from '@angular/core';
import { ActivatedRoute, ParamMap, Router } from '@angular/router';
import { BehaviorSubject, EMPTY, firstValueFrom, forkJoin, Observable, of, Subject, Subscription } from 'rxjs';
import { catchError, combineLatest, debounceTime, distinctUntilChanged, filter, map, merge, retry, switchMap, take, takeUntil, tap } from 'rxjs/operators';

import { QuestionType } from '../models/question-type.enum';
import { CombinedQuestionDataType } from '../models/CombinedQuestionDataType.model';
import { Option } from '../models/Option.model';
import { QuestionState } from '../../shared/models/QuestionState.model';
import { Quiz } from '../models/Quiz.model';
import { QuizQuestion } from '../models/QuizQuestion.model';

import { ExplanationTextService } from './explanation-text.service';
import { NextButtonStateService } from './next-button-state.service';
import { ProgressBarService } from './progress-bar.service';
import { QuizDataService } from './quizdata.service';
import { QuizNavigationService } from './quiz-navigation.service';
import { QuizQuestionManagerService } from './quizquestionmgr.service';
import { QuizService } from './quiz.service';
import { QuizStateService } from './quizstate.service';
import { SelectedOptionService } from './selectedoption.service';
import { SelectionMessageService } from './selection-message.service';

@Injectable({ providedIn: 'root' })
export class QuizInitializationService {
  private alreadyInitialized = false;

  constructor(
    private router: Router,
    private activatedRoute: ActivatedRoute,
    private quizService: QuizService,
    private explanationTextService: ExplanationTextService,
    private quizNavigationService: QuizNavigationService,
    private nextButtonStateService: NextButtonStateService,
    private quizDataService: QuizDataService,
    private quizStateService: QuizStateService
  ) {}

  public async initializeQuiz(): Promise<void> {
    if (this.alreadyInitialized) {
      console.warn('[🛑 QuizInitializationService] Already initialized. Skipping...');
      return;
    }
    this.alreadyInitialized = true;

    const quizId = this.activatedRoute.snapshot.paramMap.get('quizId');
    const routeIndex = Number(this.activatedRoute.snapshot.paramMap.get('questionIndex')) || 1;
    const adjustedIndex = routeIndex - 1;

    const resolvedQuiz = this.activatedRoute.snapshot.data['quizData'];
    if (!resolvedQuiz) {
      console.error('[❌ Quiz Init] No quiz data found in resolver.');
      this.router.navigate(['/select']);
      return;
    }

    this.quizService.setActiveQuiz(resolvedQuiz);
    this.quizService.setCurrentQuestionIndex(adjustedIndex);
    this.quizService.updateBadgeText(routeIndex, resolvedQuiz.questions.length);

    this.explanationTextService.initializeExplanationTexts(
      resolvedQuiz.questions.map(q => q.explanation)
    );

    this.initializeQuestions();
    this.initializeCurrentQuestion();

    const currentQuestion = await firstValueFrom(this.quizService.getQuestionByIndex(adjustedIndex));
    this.quizService.setCurrentQuestion(currentQuestion);

    await this.handleNavigationToQuestion(adjustedIndex);
  }

  private initializeQuestions(): void {
    this.quizService.getShuffledQuestions().subscribe({
      next: (questions) => {
        if (questions?.length > 0) {
          this.quizService.setQuestions(questions);
          console.log('[🌀 Shuffled Questions]', questions);
        } else {
          console.error('[❌ initializeQuestions] No questions received.');
        }
      },
      error: (err) => console.error('Error fetching questions:', err)
    });
  }

  private initializeCurrentQuestion(): void {
    this.quizService.initializeQuestionStreams();
    this.quizService.loadQuizQuestionsForCurrentQuiz();
    this.quizService.createQuestionData();
    this.quizService.getQuestion();

    this.quizService.correctAnswersTextSource.subscribe((text) => {
      this.quizService.correctAnswersText = text;
    });

    this.quizService.subscribeToCurrentQuestion();
  }

  private async handleNavigationToQuestion(questionIndex: number): Promise<void> {
    this.quizService.getCurrentQuestion(questionIndex).subscribe({
      next: async (question: QuizQuestion) => {
        if (question?.type != null) {
          this.quizDataService.setQuestionType(question);
        } else {
          console.error('Question type is undefined or null:', question);
        }

        await this.quizNavigationService.restoreSelectionState();

        this.nextButtonStateService.evaluateNextButtonState(
          this.quizService.isAnswered,
          this.quizStateService.isLoadingSubject.getValue(),
          this.quizStateService.isNavigatingSubject.getValue()
        );
      },
      error: (err) => console.error('Error fetching question:', err)
    });
  }
}