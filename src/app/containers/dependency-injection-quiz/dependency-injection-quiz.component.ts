import { Component, ElementRef, OnInit, Output, ViewChild } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';

import { QuizQuestion } from '../../model/QuizQuestion';
import { QuizService } from './quiz.service';
import { DIQuiz } from './diquiz';

@Component({
  selector: 'codelab-dependency-injection-quiz-component',
  templateUrl: './dependency-injection-quiz.component.html',
  styleUrls: ['./dependency-injection-quiz.component.scss']
})
export class CodelabDependencyInjectionQuizComponent implements OnInit {
  DIQuiz;
  @Output() question;
  @Output() totalQuestions: number;
  @Output() correctAnswersCount = 0;
  @Output() timeLeft: number;
  @Output() hasAnswer: boolean;
  @Output() badgeQuestionNumber: number;

  // @ViewChild('questionElem') questionElem: ElementRef;
  answer: number;
  completionTime: number;
  percentage: number;

  currentQuestion = 1;
  questionIndex: number;

  correctAnswer: boolean;
  answered: boolean;
  disabled: boolean;
  quizIsOver: boolean;
  progressValue: number;

  timePerQuestion = 20;
  interval: any;
  elapsedTime = 0;
  elapsedTimes = [];

  finalAnswers = [];
  correctAnswers = [];
  showExplanation: boolean;

  constructor(private diQuiz: DIQuiz,
              private quizService: QuizService,
              private route: ActivatedRoute,
              private router: Router) {
    this.route.paramMap.subscribe(params => {
      this.setQuestionIndex(+params.get('index'));  // get the question ID and store it
      this.question = this.getQuestion;
    });
  }

  ngOnInit() {
    this.question = this.getQuestion;
    this.badgeQuestionNumber = this.question.index;
    this.totalQuestions = this.DIQuiz.questions.length;
    this.timeLeft = this.timePerQuestion;
    this.progressValue = (this.currentQuestion / this.totalQuestions) * 100;
    this.mapCorrectAnswersAndCorrectOptions();
    this.countdown();
  }

  mapCorrectAnswersAndCorrectOptions() {
    // iterate over the questions in DIQuiz
    for (let i = 1; i <= this.DIQuiz.questions.length; i++) {
      for (let j = 1; i <= this.DIQuiz.questions[i].options.length; j++) {
        if (this.DIQuiz.questions[i].options[j].correct === true) {
          this.correctAnswers.push("Question " + i + ", Options: " + j);
        }
      }
    }
    console.log(this.correctAnswers);
  }

  answerChanged($event) {
    this.answer = $event;
  }

  // checks whether the question is valid and is answered correctly
  checkIfAnsweredCorrectly(optionIndex: number) {
    this.answered = true;
    this.hasAnswer = true;

    // check if the selected option is equal to the correct answer
    if (this.DIQuiz.questions[this.questionIndex].options[optionIndex]['selected'] ===
        this.DIQuiz.questions[this.questionIndex].options[optionIndex]['correct']) {
      this.showExplanation = true;
      this.stopTimer();
      this.correctAnswer = true;
      this.correctAnswersCount++;
      this.quizDelay(3000);
      this.addElapsedTimeToElapsedTimes();
      this.addFinalAnswerToFinalAnswers();
      this.resetTimer();
      this.navigateToNextQuestion();
    } else {
      this.showExplanation = true;
      this.answered = false;
      this.hasAnswer = false;
      this.correctAnswer = false;
    }
  }

  navigateToNextQuestion(): void {
    this.router.navigate(['/question', this.getQuestionIndex() + 1]);
    this.displayNextQuestion();
  }

  displayNextQuestion() {
    this.resetTimer();                          // reset the timer
    this.increaseProgressValue();               // increase the progress value
    this.questionIndex++;                       // increase the question index by 1

    if (this.questionIndex <= this.totalQuestions) {
      this.badgeQuestionNumber++;               // increase the question number for the badge by 1
    }

    if (this.isThereAnotherQuestion()) {
      this.displayNextQuestionText();     // display the text for the next question
    } else {
      this.navigateToResults();           // navigate to the results page
    }
  }

  displayNextQuestionText() {
    if (this.questionIndex < this.totalQuestions) {
      // this.questionElem.nativeElement.innerHTML = this.DIQuiz.questions[this.questionIndex++]["questionText"];
    } else {
      this.navigateToResults();           // navigate to results
    }
  }

  navigateToResults(): void {
    if (this.questionIndex > this.totalQuestions) {
      this.router.navigate(['/results'], {
        state:
          {
            allQuestions: this.DIQuiz.questions,
            totalQuestions: this.totalQuestions,
            completionTime: this.completionTime,
            correctAnswersCount: this.correctAnswersCount,
            percentage: this.percentage
          }
      });
    }
  }

  addElapsedTimeToElapsedTimes() {
    if (this.getQuestionIndex() <= this.totalQuestions) {
      this.elapsedTimes = [...this.elapsedTimes, this.elapsedTime];
    } else {
      this.elapsedTimes = [...this.elapsedTimes, 0];
    }
    this.completionTime = this.calculateTotalElapsedTime(this.elapsedTimes);
  }

  addFinalAnswerToFinalAnswers() {
    this.finalAnswers = [...this.finalAnswers, this.answer];
  }

  increaseProgressValue() {
    this.progressValue = parseFloat((100 * (this.getQuestionIndex() + 1) / this.totalQuestions).toFixed(1));
  }

  calculateTotalElapsedTime(elapsedTimes) {
    return this.completionTime = elapsedTimes.reduce((acc, cur) => acc + cur, 0);
  }

  calculateQuizPercentage() {
    this.percentage = Math.round(100 * this.correctAnswersCount / this.totalQuestions);
  }  
}
