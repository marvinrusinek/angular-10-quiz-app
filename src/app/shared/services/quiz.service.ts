import { Injectable } from '@angular/core';
import { Router } from '@angular/router';
import { BehaviorSubject } from 'rxjs';

import { Quiz } from '../interfaces/Quiz';
import { QUIZ_DATA } from '../../assets/quiz';
import { QuizQuestion } from '../interfaces/QuizQuestion';
import { TimerService } from './timer.service';


@Injectable({ providedIn: 'root' })
export class QuizService {
  quizData: Quiz = { ...QUIZ_DATA };
  question: QuizQuestion;
  answer: number;

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

  constructor(
    private timerService: TimerService,
    private router: Router
  ) { }

  getQuestions() {
    return { ...this.quizData };
  }

  resetAll() {
    this.currentQuestionIndex = 1;
    this.correctAnswers = [];
    this.correctMessage = undefined;
    this.explanationText = undefined;
    this.timerService.stopTimer();
    this.timerService.resetTimer();
  }

  setExplanationAndCorrectAnswerMessages(correctAnswers) {
    this.question = this.getQuestions().questions[this.currentQuestionIndex - 1];
    this.explanation = (this.correctAnswers.length === 1) ?
      ' is correct because ' + this.question.explanation + '.' :
      ' are correct because ' + this.question.explanation + '.';

    if (correctAnswers.length === 1) {
      const correctAnswersText = correctAnswers[0];
      this.explanationText = 'Option ' + correctAnswersText + this.explanation;
      this.correctMessage = 'The correct answer is Option ' + correctAnswers[0] + '.';
    }

    if (correctAnswers.length > 1) {
      if (correctAnswers[0] && correctAnswers[1]) {
        const sortedAnswers = correctAnswers.sort();
        console.log('sorted answers: ', sortedAnswers);
        const correctOptions = sortedAnswers[0].concat(' and ', sortedAnswers[1]);
        this.explanationText = 'Option ' + correctOptions[0] + this.explanation +
          ' AND Option ' + correctOptions[1] + 'this.explanation2' + '.';
        this.correctMessage = 'The correct answers are Options ' + correctOptions + '.';
      }
      if (correctAnswers[0] && correctAnswers[1] && correctAnswers[2]) {
        const sortedAnswers = correctAnswers.sort();
        const correctOptions = sortedAnswers[0].concat(', ', sortedAnswers[1], ' and ', sortedAnswers[2]);
        this.explanationText = 'Option ' + correctOptions[0] + this.explanation +
          ', Option ' + correctOptions[1] + 'this.explanation2' +
          'AND Option ' + correctOptions[2] + 'this.explanation3' + '.';
        this.correctMessage = 'The correct answers are Options ' + correctOptions + '.';
      }
      if (correctAnswers[0] && correctAnswers[1] && correctAnswers[2] && correctAnswers[3]) {
        const sortedAnswers = correctAnswers.sort();
        const correctOptions = sortedAnswers[0].concat(', ', sortedAnswers[1], ', ', sortedAnswers[2],
          ' and ', sortedAnswers[3]);
        this.explanationText = 'All options are correct!';
        this.correctMessage = 'The correct answers are Options ' + correctOptions + '.';
      }
    }
  }

  numberOfQuestions() {
    if (this.quizData && this.quizData.questions) {
      return this.quizData.questions.length;
    }
    else {
      return 0;
    }
  }

  getQuestionType(): boolean {
    return (this.correctAnswers && this.correctAnswers.length === 1);
  }

  isFinalQuestion() {
    return (this.quizData.questions.length === this.currentQuestionIndex);
  }

  nextQuestion() {
    let questionIndex = this.currentQuestionIndex + 1;
    this.router.navigate(['/quiz/question', questionIndex]);
    this.resetAll();
  }

  navigateToResults() {
    this.router.navigate(['/quiz/results'], {
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
