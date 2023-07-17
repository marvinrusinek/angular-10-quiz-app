import { Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root',
})
export class QuizQuestionManagerService {
  private currentQuestion: any; // Replace `any` with the appropriate type for your quiz question
  private explanationText: string;
  private numberOfCorrectAnswers: number;

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
    // Replace this with your implementation logic
    // Return true or false based on your condition for displaying the explanation text
    return true;
  }

  shouldDisplayNumberOfCorrectAnswersCount(): boolean {
    // Replace this with your implementation logic
    // Return true or false based on your condition for displaying the number of correct answers count
    return true;
  }
}
