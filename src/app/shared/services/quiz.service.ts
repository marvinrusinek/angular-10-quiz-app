import { Injectable } from '@angular/core';
import { Router } from '@angular/router';
import { BehaviorSubject, Observable, Subject } from 'rxjs';

import { QUIZ_DATA } from '../../assets/quiz';
import { Quiz } from '../interfaces/Quiz';
import { QuizQuestion } from '../interfaces/QuizQuestion';
import { TimerService } from './timer.service';


@Injectable({ providedIn: 'root' })
export class QuizService {
  quizData: Quiz = { ...QUIZ_DATA };
  question: QuizQuestion;
  answer: number;

  sendScore$: Observable<any>;
  private sendScoreSubject = new Subject<any>();
  correctAnswersCount = new BehaviorSubject<number>(0);
  correctAnswer$ = this.correctAnswersCount.asObservable();
  totalQuestions: number;
  completionTime: number;

  currentQuestionIndex = 1;
  finalAnswers = [];
  correctAnswers = [];
  explanation: string;
  explanationText: string;
  correctMessage: string;
  hasAnswer: boolean;
  percentage: number;

  constructor(
    private timerService: TimerService,
    private router: Router
  ) {
    this.totalQuestions = this.numberOfQuestions();
    this.sendScore$ = this.sendScoreSubject.asObservable();   // trying to get correctAnswersCount from ScoreComponent
    // this.correctAnswersAmount = this.numberOfCorrectAnswers();
  }

  sendScore(data) {
    console.log('DATA: ', data);
    this.sendScoreSubject.next(data);
  }

  getQuestions() {
    return { ...this.quizData };
  }

  resetAll() {
    this.answer = null;
    this.hasAnswer = false;
    this.correctAnswers = [];
    this.correctMessage = undefined;
    this.explanationText = undefined;
    this.timerService.stopTimer();
    this.timerService.resetTimer();
  }

  setExplanationAndCorrectAnswerMessages(correctAnswers) {
    this.question = this.getQuestions().questions[this.currentQuestionIndex - 1];
    this.hasAnswer = true;

    if (correctAnswers.length === 1) {
      this.explanation = ' is correct because ' + this.question.explanation + '.';
      const correctAnswersText = correctAnswers[0];
      this.explanationText = 'Option ' + correctAnswersText + this.explanation;
      this.correctMessage = 'The correct answer is Option ' + correctAnswers[0] + '.';
    }

    if (correctAnswers.length > 1) {
      this.explanation = ' are correct because ' + this.question.explanation + '.';
      const sortedAnswers = correctAnswers.sort();

      if (correctAnswers[0] && correctAnswers[1]) {
        const correctOptions = sortedAnswers.concat(' and ', sortedAnswers[1]);
        this.explanationText = 'Option ' + correctOptions[0] + this.explanation +
                               ' AND Option ' + correctOptions[1] + 'this.explanation2' + '.';
        this.correctMessage = 'The correct answers are Options ' + correctOptions + '.';
      }
      if (correctAnswers[0] && correctAnswers[1] && correctAnswers[2]) {
        const correctOptions = sortedAnswers.concat(', ', sortedAnswers[1], ' and ', sortedAnswers[2]);
        this.explanationText = 'Option ' + correctOptions[0] + this.explanation +
                               ', Option ' + correctOptions[1] + 'this.explanation2' +
                               'AND Option ' + correctOptions[2] + 'this.explanation3' + '.';
        this.correctMessage = 'The correct answers are Options ' + correctOptions + '.';
      }
      if (correctAnswers[0] && correctAnswers[1] && correctAnswers[2] && correctAnswers[3]) {
        this.explanationText = 'All are correct!';
        this.correctMessage = 'All are correct!';
      }
    }
  }

  calculateQuizPercentage(): number {
    return this.percentage = ((Number(this.correctAnswer$) / this.totalQuestions) * 100);
  }

  numberOfQuestions(): number {
    if (this.quizData && this.quizData.questions) {
      return this.quizData.questions.length;
    }
    else {
      return 0;
    }
  }

  numberOfCorrectAnswers(): number {
    return parseInt(this.correctAnswer$.toPromise().toString());
  }

  getQuestionType(): boolean {
    return (this.correctAnswers && this.correctAnswers.length === 1);
  }

  isFinalQuestion() {
    return (this.quizData.questions.length === this.currentQuestionIndex);
  }

  nextQuestion() {
    this.router.navigate(['/question', this.currentQuestionIndex + 1]);
    this.resetAll();
  }

  prevQuestion() {
    this.router.navigate(['/question', this.currentQuestionIndex - 1]);
    this.resetAll();
  }

  navigateToResults() {
    this.router.navigate(['/results'], {
      state: {
        questions: this.quizData.questions,
        correctAnswers: this.correctAnswers,
        completionTime: this.completionTime
      }
    });
  }
}
