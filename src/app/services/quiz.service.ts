import { Injectable } from '@angular/core';
import { Router } from '@angular/router';
import { BehaviorSubject } from 'rxjs';

import { QUIZ_DATA } from '../quiz';
import { Quiz } from '../models/quiz';
import { QuizQuestion } from '../models/QuizQuestion';
import { TimerService } from './timer.service';

@Injectable({ providedIn: 'root' })
export class QuizService {
  quizData: Quiz = { ...QUIZ_DATA };
  question: QuizQuestion;
  answer: number;
  totalQuestions: number;
  completionTime: number;
  currentQuestionIndex = 1;
  finalAnswers = [];
  correctAnswers = [];
  explanation: string;
  explanationText: string;
  correctMessage: string;
  correctAnswersCount = new BehaviorSubject<number>(0);
  correctAnswer$ = this.correctAnswersCount.asObservable();

  constructor(
    private timerService: TimerService,
    private router: Router
  ) { }

  getQuestions() {
    return { ...this.quizData };
  }

  resetAll() {
    this.correctAnswersCount.next(0);
    this.currentQuestionIndex = 1;
    this.correctAnswers = [];
    this.correctMessage = undefined;
  }

  setExplanationAndCorrectAnswerMessages(correctAnswers) {
    this.question = this.getQuestions().questions[this.currentQuestionIndex - 1];
    this.explanation = (this.correctAnswers.length === 1) ?
                        ' is correct because ' + this.question.explanation + '.' :
                        ' are correct because ' + this.question.explanation + '.';

    if (this.correctAnswers.length === 1) {
      const correctAnswersText = correctAnswers[0];
      this.explanationText = 'Option ' + correctAnswersText + this.explanation;
      this.correctMessage = 'The correct answer is Option ' + correctAnswers[0] + '.';
    }

    if (this.correctAnswers.length > 1) {
      if (this.correctAnswers[0] && this.correctAnswers[1]) {
        const correctOptions = correctAnswers[0].concat(' and ', correctAnswers[1]);
        this.explanationText = 'Options ' + correctOptions + this.explanation + '.';
        this.correctMessage = 'The correct answers are Options ' + correctOptions + '.';
      }
      if (correctAnswers[0] && correctAnswers[1] && correctAnswers[2]) {
        const correctOptions = correctAnswers[0].concat(', ', correctAnswers[1], ' and ', correctAnswers[2]);
        this.explanationText = 'Options ' + correctOptions + this.explanation + '.';
        this.correctMessage = 'The correct answers are Options ' + correctOptions + '.';
      }
      if (correctAnswers[0] && correctAnswers[1] && correctAnswers[2] && correctAnswers[3]) {
        const correctOptions = correctAnswers[0].concat(', ', correctAnswers[1], ', ', correctAnswers[2],
                                                        ' and ', correctAnswers[3]);
        this.explanationText = 'Options ' + correctOptions + this.explanation + '.';
        this.correctMessage = 'The correct answers are Options ' + correctOptions + '.';
      }
    }
  }

  numberOfQuestions() {
    if (this.quizData && this.quizData.questions) {
      return this.quizData.questions.length;
    } else {
      return 0;
    }
  }

  getQuestionType(): boolean {
    return (this.correctAnswers && this.correctAnswers.length === 1);
  }

  isFinalQuestion(): boolean {
    return (this.quizData.questions.length === this.currentQuestionIndex);
  }

  nextQuestion(): void {
    let questionIndex = this.currentQuestionIndex + 1;
    this.router.navigate(['/question', questionIndex]);
    this.resetAll();
    questionIndex++;
  }

  navigateToResults(): void {
    this.router.navigate(['/results'], {
      state: {
        questions: this.quizData,
        results: {
          correctAnswers: this.correctAnswers,
          completionTime: this.completionTime
        }
      }
    });
  }
}
