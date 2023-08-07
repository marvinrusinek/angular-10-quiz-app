import { Injectable } from '@angular/core'; 

import { BehaviorSubject } from 'rxjs';

import { QuizQuestion } from '../../shared/models/QuizQuestion.model'; 

@Injectable({
  providedIn: 'root',
})
export class QuizQuestionManagerService {
  currentQuestion: BehaviorSubject<QuizQuestion | null> = new BehaviorSubject<QuizQuestion | null>(null);
  explanationText: string;
  numberOfCorrectAnswers: number;
  shouldDisplayNumberOfCorrectAnswers: boolean = false;
  isOptionSelected: boolean = false;
  shouldDisplayExplanation: boolean = false;
  correctAnswersCount: number = 0;

  private currentQuestionSubject: BehaviorSubject<QuizQuestion | null> = new BehaviorSubject<QuizQuestion | null>(null);
  private explanationTextSubject: BehaviorSubject<string | null> = new BehaviorSubject<string | null>(null);

  setCurrentQuestion(question: QuizQuestion): void {
    this.currentQuestion.next(question);
    this.currentQuestionSubject.next(question);
    const currentQuestionValue = this.currentQuestion.getValue();
    this.numberOfCorrectAnswers = currentQuestionValue.options.filter(option => option.correct).length;
    this.shouldDisplayNumberOfCorrectAnswers = this.isMultipleCorrectAnswers();
  }

  getCurrentQuestion(): any {
    return this.currentQuestion;
  }

  setExplanationText(text: string): void {
    this.explanationTextSubject.next(text);
    // this.explanationText = text;
    this.shouldDisplayExplanation = !!text;
   }

  getExplanationText(): string | null {
    // return this.explanationText;
    return this.explanationTextSubject.getValue();
  }

  setExplanationDisplayed(displayed: boolean): void {
    this.shouldDisplayExplanation = displayed;
  }

  setNumberOfCorrectAnswers(count: number): void {
    this.numberOfCorrectAnswers = count;
    this.shouldDisplayNumberOfCorrectAnswers = this.isMultipleCorrectAnswers();
  }

  getNumberOfCorrectAnswers(): number {
    return this.numberOfCorrectAnswers;
  }

  shouldDisplayExplanationText(): boolean {
    return !!this.explanationText;
  }

  shouldDisplayNumberOfCorrectAnswersCount(): boolean {
    if (!this.currentQuestion) {
      return false;
    }
  
    const hasMultipleCorrectAnswers = this.isMultipleCorrectAnswers();
  
    const displayNumberOfCorrectAnswers =
      this.shouldDisplayNumberOfCorrectAnswers &&
      hasMultipleCorrectAnswers &&
      !this.isOptionSelected &&
      !this.shouldDisplayExplanationText();
  
    return displayNumberOfCorrectAnswers && !this.shouldDisplayExplanation;
  }
  
  isMultipleCorrectAnswers(): boolean {
    const currentQuestionValue = this.currentQuestion.getValue();
    if (!currentQuestionValue) {
      return false;
    }
    const numberOfCorrectAnswers = currentQuestionValue.options.filter((option) => option.correct).length;
    return numberOfCorrectAnswers > 1;
  }
}
