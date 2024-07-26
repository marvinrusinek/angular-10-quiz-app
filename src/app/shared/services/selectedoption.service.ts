import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';

import { Option } from '../../shared/models/Option.model';
import { SelectedOption } from '../../shared/models/SelectedOption.model';
import { QuizService } from '../../shared/services/quiz.service';

@Injectable({ providedIn: 'root' })
export class SelectedOptionService {
  selectedOption: SelectedOption | null = null;
  selectedOptionsMap: Map<number, SelectedOption[]> = new Map();
  private selectedOptionIndices: { [key: number]: number[] } = {};

  private selectedOptionSubject = new BehaviorSubject<SelectedOption | null>(null);
  selectedOption$ = this.selectedOptionSubject.asObservable();

  private selectedOptionExplanationSource = new BehaviorSubject<string>(null);
  selectedOptionExplanation$ = this.selectedOptionExplanationSource.asObservable();

  private isOptionSelectedSubject: BehaviorSubject<boolean> = new BehaviorSubject<boolean>(false);

  private isAnsweredSubject = new BehaviorSubject<boolean>(false);

  private showFeedbackForOptionSubject = new BehaviorSubject<{ [optionId: number]: boolean }>({});
  showFeedbackForOption$ = this.showFeedbackForOptionSubject.asObservable();

  constructor(private quizService: QuizService) {}

  setSelectedOption(option: SelectedOption): void {
    this.selectedOptionSubject.next(option);
    const currentFeedback = { ...this.showFeedbackForOptionSubject.value };
    Object.keys(currentFeedback).forEach(key => currentFeedback[key] = false); // Clear previous feedback
    currentFeedback[option.optionId] = true;
    this.showFeedbackForOptionSubject.next(currentFeedback);
    this.selectedOption = option;
    this.updateAnsweredState();
  }

  getSelectedOption(): SelectedOption | null {
    return this.selectedOptionSubject.value;
  }

  getShowFeedbackForOption(): { [optionId: number]: boolean } {
    return this.showFeedbackForOptionSubject.value;
  }

  isSelectedOption(option: Option): boolean {
    const selectedOption = this.getSelectedOption();
    const showFeedbackForOption = this.getShowFeedbackForOption();
    return selectedOption?.optionId === option.optionId && !!showFeedbackForOption[option.optionId];
  }

  clearSelectedOption(): void {
    this.selectedOption = null;
    this.selectedOptionSubject.next(null);
    this.showFeedbackForOptionSubject.next({});
    this.resetAnsweredState();
  }

  clearOptions(): void {
    this.selectedOptionSubject.next(null);
    this.showFeedbackForOptionSubject.next({});
  }

  // Observable to get the current option selected state
  isOptionSelected$(): Observable<boolean> {
    return this.isOptionSelectedSubject.asObservable();
  }

  // Method to set the option selected state
  setOptionSelected(isSelected: boolean): void {
    if (this.isOptionSelectedSubject.value !== isSelected) {
      this.isOptionSelectedSubject.next(isSelected);
    }
  }

  // Method to get the current option selected state
  getCurrentOptionSelectedState(): boolean {
    return this.isOptionSelectedSubject.value;
  }


  getSelectedOptionIndices(questionIndex: number): number[] {
    const selectedOptions = this.selectedOptionsMap.get(questionIndex) || [];
    return selectedOptions.map(option => option.optionId);
  }

  addSelectedOptionIndex(questionIndex: number, optionIndex: number): void {
    if (!this.selectedOptionIndices[questionIndex]) {
      this.selectedOptionIndices[questionIndex] = [];
    }

    if (!this.selectedOptionIndices[questionIndex].includes(optionIndex)) {
      this.selectedOptionIndices[questionIndex].push(optionIndex);
      this.updateAnsweredState();

      this.updateSelectedOptions(questionIndex, optionIndex, 'add');
    }
  }

  removeSelectedOptionIndex(questionIndex: number, optionIndex: number): void {
    if (this.selectedOptionIndices[questionIndex]) {
      const optionPos = this.selectedOptionIndices[questionIndex].indexOf(optionIndex);
      if (optionPos > -1) {
        this.selectedOptionIndices[questionIndex].splice(optionPos, 1);
        this.updateAnsweredState();

        // Sync with selectedOptionsMap
        this.updateSelectedOptions(questionIndex, optionIndex, 'remove');
      }
    }
  }

  // Method to add or remove a selected option for a question
  toggleSelectedOption(questionIndex: number, option: SelectedOption): void {
    if (!this.selectedOptionsMap.has(questionIndex)) {
      this.selectedOptionsMap.set(questionIndex, []);
    }

    const options = this.selectedOptionsMap.get(questionIndex);
    const index = options.findIndex(
      selectedOption => selectedOption.optionId === option.optionId
    );

    if (index > -1) {
      options.splice(index, 1);
    } else {
      options.push(option);
    }

    this.selectedOptionsMap.set(questionIndex, options);
    this.updateAnsweredState();
  }

  updateSelectedOptions(
    questionIndex: number,
    optionIndex: number,
    action: 'add' | 'remove'
  ): void {
    const quizId = this.quizService.quizId || localStorage.getItem('quizId');
    if (!quizId) {
      console.error('Quiz ID is null or undefined');
      return;
    }
  
    const quiz = this.quizService.quizData.find((q) => q.quizId?.trim() === quizId.trim());
    if (!quiz) {
      console.error(`Quiz with ID ${quizId} not found`);
      return;
    }
  
    const question = quiz.questions[questionIndex];
    if (!question) {
      console.error(`Question data is not found at index ${questionIndex}.`);
      return;
    }
  
    const option = question.options[optionIndex];
    if (!option) {
      console.error(`Option data is not found for optionIndex ${optionIndex}. Available options:`, question.options);
      return;
    }
  
    console.log('Selected option:', option);
  
    if (!this.selectedOptionsMap.has(questionIndex)) {
      this.selectedOptionsMap.set(questionIndex, []);
    }
  
    const options = this.selectedOptionsMap.get(questionIndex);
    const existingOptionIndex = options.findIndex((opt) => opt.text === option.text);
  
    if (action === 'add' && existingOptionIndex === -1) {
      options.push({ ...option, questionIndex });
    } else if (action === 'remove' && existingOptionIndex !== -1) {
      options.splice(existingOptionIndex, 1);
    }
  
    this.selectedOptionsMap.set(questionIndex, options);
    console.log('Updated selectedOptionsMap:', this.selectedOptionsMap);
    this.updateAnsweredState();
  }
  
  private updateAnsweredState(): void {
    const hasSelectedOptions = Array.from(this.selectedOptionsMap.values()).some(options => options.length > 0);
    hasSelectedOptions ? this.setAnsweredState(true) : this.setAnsweredState(false);
  }

  // Method to update the isAnswered state
  setAnsweredState(isAnswered: boolean): void {
    this.isAnsweredSubject.next(isAnswered);
  }

  getAnsweredState(): boolean {
    return this.isAnsweredSubject.value;
  }

  // Expose the isAnswered observable
  get isAnswered$(): Observable<boolean> {
    return this.isAnsweredSubject.asObservable();
  }

  resetAnsweredState(): void {
    this.isAnsweredSubject.next(false);
  }
}
