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

  shouldDisplayNumberOfCorrectAnswersCount(): boolean {
    console.log('shouldDisplayNumberOfCorrectAnswers:', this.shouldDisplayNumberOfCorrectAnswers);
    console.log('isMultipleCorrectAnswers:', this.isMultipleCorrectAnswers());
    console.log('isOptionSelected:', this.isOptionSelected);
    console.log('shouldDisplayExplanationText:', this.shouldDisplayExplanationText());
  
    // Check the conditions
    const displayNumberOfCorrectAnswers =
      this.shouldDisplayNumberOfCorrectAnswers && // Check if we want to display the number of correct answers
      this.isMultipleCorrectAnswers() && // Check if the question has multiple correct answers
      !this.isOptionSelected && // Check if no option is selected by the user
      !this.shouldDisplayExplanationText(); // Check if explanation text is not displayed
  
    console.log('displayNumberOfCorrectAnswers:', displayNumberOfCorrectAnswers);
  
    return displayNumberOfCorrectAnswers;
  }
  
  isMultipleCorrectAnswers(): boolean {
    return this.numberOfCorrectAnswers > 1;
  }
}
