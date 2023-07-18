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
  correctAnswersCount: number = 0;

  setCurrentQuestion(question: any): void {
    this.currentQuestion = question;
    this.numberOfCorrectAnswers = this.currentQuestion.options.filter(option => option.correct).length;
    this.shouldDisplayNumberOfCorrectAnswers = this.isMultipleCorrectAnswers();
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
    this.shouldDisplayNumberOfCorrectAnswers = this.isMultipleCorrectAnswers();
    console.log('shouldDisplayNumberOfCorrectAnswers:', this.shouldDisplayNumberOfCorrectAnswers);
    console.log('numberOfCorrectAnswers:', this.numberOfCorrectAnswers);
  }

  getNumberOfCorrectAnswers(): number {
    return this.numberOfCorrectAnswers;
  }

  private getCorrectAnswersCount(): number {
    if (!this.currentQuestion || !this.currentQuestion.options) {
      return 0;
    }

    return this.currentQuestion.options.filter(option => option.correct).length;
  }

  setSelectedAnswer(answer: number): void {
    if (this.currentQuestion.options[answer]?.correct && !this.isOptionSelected) {
      this.correctAnswersCount++;
      console.log('Correct Answers Count:', this.correctAnswersCount);
    }
    this.isOptionSelected = true;
  }

  shouldDisplayExplanationText(): boolean {
    return !!this.explanationText;
  }

  shouldDisplayNumberOfCorrectAnswersCount(): boolean {
    if (!this.currentQuestion) {
      return false;
    }
  
    const hasMultipleCorrectAnswers = this.isMultipleCorrectAnswers();
  
    // Check the conditions
    const displayNumberOfCorrectAnswers =
      this.shouldDisplayNumberOfCorrectAnswers &&
      hasMultipleCorrectAnswers &&
      !this.isOptionSelected &&
      !this.shouldDisplayExplanationText();
  
    return displayNumberOfCorrectAnswers;
  }
  
  isMultipleCorrectAnswers(): boolean {
    if (!this.currentQuestion) {
      return false;
    }
    const numberOfCorrectAnswers = this.currentQuestion.options.filter((option) => option.correct).length;
    return numberOfCorrectAnswers > 1;
  }  
}
