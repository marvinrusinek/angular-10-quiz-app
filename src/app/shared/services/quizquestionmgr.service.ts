import { Injectable } from '@angular/core';

import { QuizQuestion } from '../../shared/models/QuizQuestion.model';

@Injectable({
  providedIn: 'root',
})
export class QuizQuestionManagerService {
  currentQuestion: QuizQuestion;
  explanationText: string;
  numberOfCorrectAnswers: number;
  shouldDisplayNumberOfCorrectAnswers: boolean = false;
  isOptionSelected: boolean = false;
  shouldDisplayExplanation: boolean = false;

  setCurrentQuestion(question: any): void {
    this.currentQuestion = question;
    console.log('currentQuestion:', this.currentQuestion);
  }

  getCurrentQuestion(): any {
    return this.currentQuestion;

  }

  setExplanationText(text: string): void {
    this.explanationText = text;
    console.log('explanationText:', this.explanationText);
  }

  getExplanationText(): string {
    return this.explanationText;
  }

  setNumberOfCorrectAnswers(count: number): void {
    console.log('setNumberOfCorrectAnswers:', count);
    this.numberOfCorrectAnswers = count;
  }

  getNumberOfCorrectAnswers(): number {
    return this.numberOfCorrectAnswers;
  }

  shouldDisplayExplanationText(): boolean {
    return !!this.explanationText;
  }

  /* shouldDisplayNumberOfCorrectAnswersCount(): boolean {
    console.log('shouldDisplayNumberOfCorrectAnswers:', this.shouldDisplayNumberOfCorrectAnswers);
    console.log('isMultipleCorrectAnswers:', this.isMultipleCorrectAnswers());
    console.log('isOptionSelected:', this.isOptionSelected);
    console.log('shouldDisplayExplanationText:', this.shouldDisplayExplanationText());
  
    // Check the conditions
    const displayNumberOfCorrectAnswers =
      this.shouldDisplayNumberOfCorrectAnswers &&
      this.isMultipleCorrectAnswers() &&
      !this.isOptionSelected &&
      !this.shouldDisplayExplanationText();
  
    console.log('displayNumberOfCorrectAnswers:', displayNumberOfCorrectAnswers);
  
    return displayNumberOfCorrectAnswers;
  } */

  shouldDisplayNumberOfCorrectAnswersCount(): boolean {
    console.log('shouldDisplayNumberOfCorrectAnswers:', this.shouldDisplayNumberOfCorrectAnswers);
    console.log('hasMultipleCorrectAnswers:', this.isMultipleCorrectAnswers());
    console.log('isOptionSelected:', this.isOptionSelected);
    console.log('shouldDisplayExplanationText:', this.shouldDisplayExplanationText());
  
    const hasMultipleCorrectAnswers = this.isMultipleCorrectAnswers();
  
    // Check the conditions
    const displayNumberOfCorrectAnswers =
      this.shouldDisplayNumberOfCorrectAnswers &&
      hasMultipleCorrectAnswers &&
      !this.isOptionSelected &&
      !this.shouldDisplayExplanationText();
  
    console.log('displayNumberOfCorrectAnswers:', displayNumberOfCorrectAnswers);
  
    return displayNumberOfCorrectAnswers;
  }

  
  isMultipleCorrectAnswers(): boolean {
    return this.numberOfCorrectAnswers > 1;
  }
}
