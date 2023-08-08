import { Injectable } from '@angular/core'; 
import { BehaviorSubject, Observable } from 'rxjs';

import { Option } from '../../shared/models/Option.model';
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

  selectedOption: Option | null = null;
  explanationTextForSelectedOption: string | null = null;

  private currentQuestionSubject: BehaviorSubject<QuizQuestion | null> = new BehaviorSubject<QuizQuestion | null>(null);
  private explanationTextSubject: BehaviorSubject<string | null> = new BehaviorSubject<string | null>(null);

  currentQuestion$: BehaviorSubject<QuizQuestion | null> = new BehaviorSubject<QuizQuestion | null>(null);

  setSelectedOption(option: Option | null): void {
    this.selectedOption = option;
    this.updateExplanationTextForSelectedOption();
  }

  updateExplanationTextForSelectedOption(): void {
    const currentQuestion = this.currentQuestion.getValue();
    this.explanationTextForSelectedOption = currentQuestion?.explanation || null;
  }

  getSelectedOption(): Option | null {
    return this.selectedOption;
  }

  getExplanationTextForSelectedOption(): string | null {
    return this.explanationTextForSelectedOption;
  }

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

  setExplanationText(explanation: string): void {
    this.explanationTextSubject.next(explanation);
    // this.explanationText = text;
    this.shouldDisplayExplanation = !!explanation;
   }

  getExplanationText(): string | null {
    return this.explanationText;
    // return this.explanationTextSubject.getValue();
  }

  get explanationText$(): Observable<string | null> {
    return this.explanationTextSubject.asObservable();
  }

  getCurrentQuestion$(): Observable<QuizQuestion | null> {
    return this.currentQuestion$.asObservable();
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
