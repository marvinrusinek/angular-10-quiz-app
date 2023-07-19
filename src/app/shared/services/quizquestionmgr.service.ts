import { Injectable } from '@angular/core'; 

import { BehaviorSubject } from 'rxjs';

import { QuizQuestion } from '../../shared/models/QuizQuestion.model'; 

@Injectable({
  providedIn: 'root',
})
export class QuizQuestionManagerService {
  // currentQuestion: QuizQuestion;
  currentQuestion: BehaviorSubject<QuizQuestion>;
  explanationText: string;
  numberOfCorrectAnswers: number;
  shouldDisplayNumberOfCorrectAnswers: boolean = false;
  isOptionSelected: boolean = false;
  shouldDisplayExplanation: boolean = false;
  correctAnswersCount: number = 0;

  setCurrentQuestion(question: QuizQuestion): void {
    this.currentQuestion.next(question);
    this.currentQuestion$.next(question);
    const currentQuestionValue = this.currentQuestion.getValue();
    this.numberOfCorrectAnswers = currentQuestionValue.options.filter(option => option.correct).length;
    this.shouldDisplayNumberOfCorrectAnswers = this.isMultipleCorrectAnswers();
  }

  getCurrentQuestion(): any {
    return this.currentQuestion;
  }

  setExplanationText(text: string): void {
    this.explanationText = text;
    this.shouldDisplayExplanation = !!text;
   }

  getExplanationText(): string {
    return this.explanationText;
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
    if (!this.currentQuestion) {
      return false;
    }
    const numberOfCorrectAnswers = this.currentQuestion.options.filter((option) => option.correct).length;
    return numberOfCorrectAnswers > 1;
  }  
}
