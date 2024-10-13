import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { distinctUntilChanged, map, startWith, tap } from 'rxjs/operators';

import { Option } from '../../shared/models/Option.model';
import { SelectedOption } from '../../shared/models/SelectedOption.model';
import { QuizService } from '../../shared/services/quiz.service';

@Injectable({ providedIn: 'root' })
export class SelectedOptionService {
  selectedOption: SelectedOption | SelectedOption[] = null;
  selectedOptionsMap: Map<number, SelectedOption[]> = new Map();
  private selectedOptionIndices: { [key: number]: number[] } = {};

  private selectedOptionSubject = new BehaviorSubject<SelectedOption | null>(null);
  selectedOption$ = this.selectedOptionSubject.asObservable();

  private selectedOptionExplanationSource = new BehaviorSubject<string>(null);
  selectedOptionExplanation$ = this.selectedOptionExplanationSource.asObservable();

  private isOptionSelectedSubject = new BehaviorSubject<boolean>(false);

  isAnsweredSubject = new BehaviorSubject<boolean>(false);
  isAnswered$: Observable<boolean> = this.isAnsweredSubject.asObservable();

  private showFeedbackForOptionSubject = new BehaviorSubject<Record<string, boolean>>({});
  showFeedbackForOption$ = this.showFeedbackForOptionSubject.asObservable();

  constructor(private quizService: QuizService) {}

  // potentially remove...
  /* get currentSelectedState(): boolean {
    return this.isOptionSelectedSubject.getValue();
  } */

  // Method to update the selected option state
  selectOption(optionId: number, questionIndex: number, text: string): void {
    if (optionId == null || questionIndex == null || !text) {
      console.error('Invalid data for SelectedOption:', { optionId, questionIndex, text });
      return;
    }
  
    console.log('selectOption called with:', { optionId, questionIndex, text });
  
    // Create the selected option object
    const selectedOption: SelectedOption = { optionId, questionIndex, text };
  
    // Emit the selected option
    this.selectedOptionSubject.next(selectedOption);
  
    // Emit the selection status
    this.isOptionSelectedSubject.next(true); // Indicate that an option is selected
  
    console.log('Selected option emitted:', selectedOption);
  }

  deselectOption() {
    const deselectedOption: SelectedOption = {
      optionId: null,
      questionIndex: null,
      text: null
    };
  
    this.selectedOptionSubject.next(deselectedOption);
    this.isOptionSelectedSubject.next(false); // Indicate that no option is selected
  }

  clearSelection(): void {
    this.isOptionSelectedSubject.next(false); // No option selected
  }

  /* setSelectedOption(option: SelectedOption | SelectedOption[]): void {
    console.log('Entering setSelectedOption with:', option);
  
    if (!option) {
      console.log('SelectedOptionService: Clearing selected option');
      this.selectedOption = null;
      this.selectedOptionSubject.next(null);
      this.showFeedbackForOptionSubject.next({});
      this.isOptionSelectedSubject.next(false);
      this.updateAnsweredState();
      console.log('Exiting setSelectedOption after clearing');
      return;
    }
  
    // Avoid processing if the same option is already selected
    if (Array.isArray(option)) {
      if (this.areOptionsAlreadySelected(option)) {
        console.log('SelectedOptionService: Options already selected, skipping');
        return;
      }
    } else {
      if (this.isOptionAlreadySelected(option)) {
        console.log('SelectedOptionService: Option already selected, skipping');
        return;
      }
    }
  
    console.log('Processing selected option...');
    const currentFeedback: Record<string, boolean> = { ...this.showFeedbackForOptionSubject.value };
  
    // Handle multiple options if option is an array
    if (Array.isArray(option)) {
      option.forEach(opt => {
        if (!this.isValidSelectedOption(opt)) {
          console.error('Invalid SelectedOption data:', opt);
          return;
        }
  
        console.log('Handling single option in array:', opt);
        this.handleSingleOption(opt);
  
        const optionIdKey = opt.optionId.toString();
        currentFeedback[optionIdKey] = true;
      });
    } else {
      // Handle single option
      if (!this.isValidSelectedOption(option)) {
        console.error('Invalid SelectedOption data:', option);
        return;
      }
  
      console.log('Handling single option:', option);
      this.handleSingleOption(option);
  
      const optionIdKey = option.optionId.toString();
      currentFeedback[optionIdKey] = true;
    }
  
    // Update feedback state
    this.showFeedbackForOptionSubject.next(currentFeedback);
    console.log('SelectedOptionService: Updated feedback state', currentFeedback);
  
    // Update the answered state
    this.updateAnsweredState();
    console.log('SelectedOptionService: Updated answered state');
  } */
  setSelectedOption(option: SelectedOption | SelectedOption[]): void {
    console.log('Entering setSelectedOption with:', option);
  
    if (!option) {
      console.log('SelectedOptionService: Clearing selected option');
      this.selectedOption = null;
      this.selectedOptionSubject.next(null);
      this.showFeedbackForOptionSubject.next({});
      this.isOptionSelectedSubject.next(false);
      this.updateAnsweredState();
      return;
    }
  
    // Avoid processing if the same option is already selected
    if (Array.isArray(option)) {
      if (this.areOptionsAlreadySelected(option)) {
        console.log('SelectedOptionService: Options already selected, skipping');
        return;
      }
    } else {
      if (this.isOptionAlreadySelected(option)) {
        console.log('SelectedOptionService: Option already selected, skipping');
        return;
      }
    }
  
    // Temporarily disable additional logic to isolate the problem
    console.log('Processing option:', option);
  
    // Early exit for now, just to prevent further recursive updates
    return;
  }
   
  
  private isValidSelectedOption(option: SelectedOption): boolean {
    return option.optionId !== undefined && option.questionIndex !== undefined && !!option.text;
  }  
  
  private isOptionAlreadySelected(option: SelectedOption | SelectedOption[]): boolean {
    if (Array.isArray(option)) {
      // Handle the case where option is an array of SelectedOption
      return option.every(opt => this.isSingleOptionAlreadySelected(opt));
    } else {
      // Handle the case where option is a single SelectedOption
      return this.isSingleOptionAlreadySelected(option);
    }
  }
  
  private isSingleOptionAlreadySelected(option: SelectedOption): boolean {
    // Use type assertion to explicitly tell TypeScript that selectedOption is of type SelectedOption
    const selectedOption = this.selectedOption as SelectedOption;
    return selectedOption?.optionId === option.optionId;
  }
  
  private areOptionsAlreadySelected(options: SelectedOption[]): boolean {
    // Ensure this.selectedOption is a single SelectedOption, not an array
    if (Array.isArray(this.selectedOption)) {
      console.error('Unexpected array in this.selectedOption');
      return false;
    }
  
    // Use type assertion to explicitly tell TypeScript that this.selectedOption is a single SelectedOption
    const selectedOption = this.selectedOption as SelectedOption;
  
    // Compare selected options with the array passed in
    return options.every(opt => selectedOption?.optionId === opt.optionId);
  }
  
  private handleSingleOption(option: SelectedOption): void {
    this.selectedOption = option;
    this.selectedOptionSubject.next(option);
    console.log('SelectedOptionService: Selected option set, current value:', this.selectedOptionSubject.value);
  
    this.isOptionSelectedSubject.next(true);
    console.log('SelectedOptionService: isOptionSelected updated to true');
  
    // Update selectedOptionsMap
    if (!this.selectedOptionsMap.has(option.questionIndex)) {
      this.selectedOptionsMap.set(option.questionIndex, []);
    }
    this.selectedOptionsMap.get(option.questionIndex)!.push(option);
    console.log('SelectedOptionService: Updated selectedOptionsMap', this.selectedOptionsMap);
  }  

  getSelectedOption(): SelectedOption | SelectedOption[] {
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
    const showFeedbackForOption = this.getShowFeedbackForOption();  // Get feedback data
  
    // Check if selectedOption is an array (multiple selected options)
    if (Array.isArray(selectedOption)) {
      // Loop through each selected option and check if the current option is selected
      return selectedOption.some(opt => opt.optionId === option.optionId && !!showFeedbackForOption[option.optionId]);
    }
  
    // If selectedOption is a single object, perform a direct comparison
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
    return this.selectedOption$.pipe(
      startWith(this.selectedOptionSubject.value), // Emit the current state immediately when subscribed
      map(option => {
        const isSelected = option !== null;
        console.log('SelectedOptionService: isOptionSelected$ mapping', { option, isSelected });
        return isSelected;
      }),
      distinctUntilChanged(),
      tap(isSelected => {
        this.isOptionSelectedSubject.next(isSelected);
        console.log('SelectedOptionService: isOptionSelected$ emitting', isSelected);
      })
    );
  }

  // Method to set the option selected state
  setOptionSelected(isSelected: boolean): void {
    // Check if the new state is different from the current state
    if (this.isOptionSelectedSubject.value !== isSelected) {
      console.log(`Updating isOptionSelected state from ${this.isOptionSelectedSubject.value} to ${isSelected}`);
      this.isOptionSelectedSubject.next(isSelected);
    } else {
      console.log(`isOptionSelected state remains unchanged: ${isSelected}`);
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
    console.log('toggleSelectedOption called with', { questionIndex, option });

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
    console.log('Updated selectedOptionsMap:', this.selectedOptionsMap);
    
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
    console.log('SelectedOptionService: Calculated hasSelectedOptions:', hasSelectedOptions);
    hasSelectedOptions ? this.setAnsweredState(true) : this.setAnsweredState(false);
  }

  setAnsweredState(isAnswered: boolean): void {
    // Emit only if the answered state has actually changed
    if (this.isAnsweredSubject.getValue() !== isAnswered) {
      console.log('SelectedOptionService: Answered state set to', isAnswered);
      this.isAnsweredSubject.next(isAnswered);
    } else {
      console.log('SelectedOptionService: Answered state unchanged, still', isAnswered);
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