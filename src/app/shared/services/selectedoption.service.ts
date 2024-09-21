import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { distinctUntilChanged, map, startWith, tap } from 'rxjs/operators';

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

  isAnsweredSubject = new BehaviorSubject<boolean>(false);
  isAnswered$: Observable<boolean> = this.isAnsweredSubject.asObservable();

  // private showFeedbackForOptionSubject = new BehaviorSubject<{ [optionId: number]: boolean }>({});
  private showFeedbackForOptionSubject = new BehaviorSubject<Record<string, boolean>>({});
  showFeedbackForOption$ = this.showFeedbackForOptionSubject.asObservable();

  constructor(private quizService: QuizService) {}

  get currentSelectedState(): boolean {
    return this.isOptionSelectedSubject.getValue();
  }

  selectOption(optionId: number): void {
    // Update selected option logic
    this.isOptionSelectedSubject.next(true); // An option is selected
  }

  clearSelection(): void {
    this.isOptionSelectedSubject.next(false); // No option selected
  }

  setSelectedOption(option: SelectedOption): void {
    console.log('SelectedOptionService: setSelectedOption called with', option);
    this.selectedOption = option;
    
    this.selectedOptionSubject.next(option);
    console.log('SelectedOptionService: Selected option set, current value:', this.selectedOptionSubject.getValue());
  
    const isSelected = option !== null;
    this.isOptionSelectedSubject.next(true);
    // this.isOptionSelectedSubject.next(isSelected);
    console.log('SelectedOptionService: isOptionSelected updated to', isSelected);
  
    // Initialize currentFeedback with the current value from showFeedbackForOptionSubject
    const currentFeedback: Record<string, boolean> = { ...this.showFeedbackForOptionSubject.value };
    
    // Set the selected option's feedback to true
    currentFeedback[option.optionId.toString()] = true;
    
    // Set feedback for all other options to false
    for (const key of Object.keys(currentFeedback)) {
      if (key !== option.optionId.toString()) {
        currentFeedback[key] = false;
      }
    }
    
    // Update the showFeedbackForOptionSubject with the new feedback state
    this.showFeedbackForOptionSubject.next(currentFeedback);
    console.log('SelectedOptionService: Updated feedback state', currentFeedback);
  
    this.updateAnsweredState();
    console.log('SelectedOptionService: Updated answered state');
  }

  getSelectedOption(): SelectedOption | null {
    return this.selectedOptionSubject.value;
  }

  // Method to get the current option selected state
  getCurrentOptionSelectedState(): boolean {
    return this.isOptionSelectedSubject.getValue();
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
  /* isOptionSelected$(): Observable<boolean> {
    return this.selectedOptionSubject.pipe(
      map(option => option !== null),
      distinctUntilChanged()
    );
  } */
  isOptionSelected$(): Observable<boolean> {
    return this.selectedOption$.pipe(
      startWith(this.selectedOption), // Emit the current state immediately when subscribed
      map(option => {
        const isSelected = option !== null;
        console.log('SelectedOptionService: isOptionSelected$ mapping', { option, isSelected });
        return isSelected;
      }),
      distinctUntilChanged(),
      tap(isSelected => console.log('SelectedOptionService: isOptionSelected$ emitting', isSelected))
    );
  }

  // Method to set the option selected state
  setOptionSelected(isSelected: boolean): void {
    if (this.isOptionSelectedSubject.value !== isSelected) {
      this.isOptionSelectedSubject.next(isSelected);
    }
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

  setAnsweredState(isAnswered: boolean): void {
    // Emit only if the answered state has actually changed
    if (this.isAnsweredSubject.getValue() !== isAnswered) {
      console.log('Answered state set to', isAnswered);
      this.isAnsweredSubject.next(isAnswered);
    }
  }

  getAnsweredState(): boolean {
    return this.isAnsweredSubject.value;
  }

  resetAnsweredState(): void {
    this.isAnsweredSubject.next(false);
    this.selectedOptionSubject.next(null);
    this.showFeedbackForOptionSubject.next({});
    this.selectedOption = null;
    this.isOptionSelectedSubject.next(false);
  }

  resetSelectedOption(): void {
    this.isOptionSelectedSubject.next(false);
  }
}