import { Injectable } from '@angular/core';

import { QuizQuestion } from '../../shared/models/QuizQuestion.model';

@Injectable({
  providedIn: 'root',
})
export class QuizQuestionManagerService {
  private currentQuestion: QuizQuestion;
  private explanationText: string;
  private numberOfCorrectAnswers: number;
  shouldDisplayNumberOfCorrectAnswers: boolean = false;
  isOptionSelected: boolean = false;
  shouldDisplayExplanation: boolean = false;

  setCurrentQuestion(question: any): void {
    this.currentQuestion = question;
  }

  getCurrentQuestion(): any {
    return this.currentQuestion;
  }

  setExplanationText(text: string): void {
    this.explanationText = text;
  }

  getExplanationText(): string {
    return this.explanationText;
  }

  setNumberOfCorrectAnswers(count: number): void {
    this.numberOfCorrectAnswers = count;
  }

  getNumberOfCorrectAnswers(): number {
    return this.numberOfCorrectAnswers;
  }

  shouldDisplayExplanationText(): boolean {
    return !!this.explanationText;
  }

  shouldDisplayNumberOfCorrectAnswersCount(): boolean {
    return (
      this.shouldDisplayNumberOfCorrectAnswers &&
      this.isMultipleCorrectAnswers() &&
      !this.isOptionSelected &&
      !this.shouldDisplayExplanation &&
      !this.shouldDisplayExplanationText()
    );
  }

  isMultipleCorrectAnswers(): boolean {
    return this.numberOfCorrectAnswers > 1;
  }
}
