import { Injectable, NgZone } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { distinctUntilChanged, map, startWith, tap } from 'rxjs/operators';

import { QuestionType } from '../../shared/models/question-type.enum';
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

  private isNextButtonEnabledSubject = new BehaviorSubject<boolean>(false);

  currentQuestionType: QuestionType | null = null;

  set isNextButtonEnabled(value: boolean) {
    this.isNextButtonEnabledSubject.next(value);
  }

  get isNextButtonEnabled$(): Observable<boolean> {
    return this.isNextButtonEnabledSubject.asObservable();
  }

  constructor(
    private quizService: QuizService,
    private ngZone: NgZone
  ) {}

  // potentially remove...
  /* get currentSelectedState(): boolean {
    return this.isOptionSelectedSubject.getValue();
  } */

  saveState(): void {
    localStorage.setItem('isAnswered', JSON.stringify(this.isAnsweredSubject.value));
  }

  restoreState(): void {
    const savedIsAnswered = localStorage.getItem('isAnswered');
    if (savedIsAnswered !== null) {
      const isAnswered = JSON.parse(savedIsAnswered);
      console.log('Restoring isAnswered:', isAnswered);
      this.isAnsweredSubject.next(isAnswered);
    }
  }

  // Method to update the selected option state
  selectOption(optionId: number, questionIndex: number, text: string, isMultiSelect: boolean): void {
    if (optionId == null || questionIndex == null || !text) {
      console.error('Invalid data for SelectedOption:', { optionId, questionIndex, text });
      return;
    }
  
    console.log('selectOption called with:', { optionId, questionIndex, text });
  
    const selectedOption: SelectedOption = { optionId, questionIndex, text };
  
    if (!this.isValidSelectedOption(selectedOption)) {
      console.error('SelectedOption is invalid:', selectedOption);
      return;
    }
  
    this.ngZone.run(() => {
      // Emit the selected option
      this.selectedOptionSubject.next(selectedOption);
  
      if (!isMultiSelect) {
        this.isOptionSelectedSubject.next(true); // Enable Next button for single-answer questions
        this.handleSingleOption(selectedOption, questionIndex, isMultiSelect);
        this.setNextButtonEnabled(true);
      } else {
        this.toggleSelectedOption(questionIndex, selectedOption, isMultiSelect);
      }
  
      console.log('Selected option emitted:', selectedOption);
    });
  }

  deselectOption(): void {
    const deselectedOption: SelectedOption = {
      optionId: null,
      questionIndex: null,
      text: null
    };
  
    this.selectedOptionSubject.next(deselectedOption);
    this.isOptionSelectedSubject.next(false); // Indicate that no option is selected
  }

  setNextButtonEnabled(enabled: boolean): void {
    this.isNextButtonEnabledSubject.next(enabled);  // Update the button's enabled state
  }  

  clearSelection(): void {
    this.isOptionSelectedSubject.next(false); // No option selected
  }

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

    if (Array.isArray(option)) {
      if (this.areOptionsAlreadySelected(option)) {
        console.log('SelectedOptionService: Options already selected, skipping');
        return;
      }
      console.error('Expected a single SelectedOption, but received an array:', option);
      return; // Exit early if the option is not valid
    }

    if (this.isOptionAlreadySelected(option)) {
      console.log('SelectedOptionService: Option already selected, skipping');
      return;
    }

    this.ngZone.run(() => {
      this.selectedOption = option;
      this.selectedOptionSubject.next(option);
      this.isOptionSelectedSubject.next(true); // Ensure button enablement
    });
  }

  private isValidSelectedOption(option: SelectedOption): boolean {
    if (!option || option.optionId === undefined || option.questionIndex === undefined || !option.text) {
      console.error('Invalid SelectedOption data:', option);
      return false;
    }
    return true;
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
  
  private handleSingleOption(option: SelectedOption, currentQuestionIndex: number, isMultiSelect: boolean): void {
    // Set the selected option
    this.selectedOption = option;
    this.selectedOptionSubject.next(option);
    console.log('SelectedOptionService: Selected option set, current value:', this.selectedOptionSubject.value);

    // Update the selected status
    this.isOptionSelectedSubject.next(true);
    console.log('SelectedOptionService: isOptionSelected updated to true');

    // Update selectedOptionsMap based on question index and multi-select status
    if (!this.selectedOptionsMap.has(currentQuestionIndex)) {
      this.selectedOptionsMap.set(currentQuestionIndex, []);
    }

    if (isMultiSelect) {
      // Multi-select allows multiple options to be selected
      this.selectedOptionsMap.get(currentQuestionIndex)!.push(option);
    } else {
      // For single-select, replace the previously selected option
      this.selectedOptionsMap.set(currentQuestionIndex, [option]);
    }

    console.log('SelectedOptionService: Updated selectedOptionsMap:', this.selectedOptionsMap);
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
    console.log('Clearing selected option.');

    if (this.currentQuestionType === QuestionType.MultipleAnswer) {
        // Clear all selected options for multiple-answer questions
        this.selectedOptionsMap.clear();
    } else {
        // Clear the single selected option for single-answer questions
        this.selectedOption = null;
        this.selectedOptionSubject.next(null);
    }

    // Clear feedback and reset answered state
    this.showFeedbackForOptionSubject.next({});
    this.resetAnsweredState();

    // Debugging logs
    console.log('Selected options cleared. Answered state reset.');
  }

  clearOptions(): void {
    this.selectedOptionSubject.next(null);
    this.showFeedbackForOptionSubject.next({});
  }

  // Observable to get the current option selected state
  isOptionSelected$(): Observable<boolean> {
    return this.selectedOption$.pipe(
      startWith(this.selectedOptionSubject.value), // Emit the current state immediately when subscribed
      map(option => option !== null), // Determine if an option is selected
      distinctUntilChanged(), // Emit only when the selection state changes
      tap(isSelected => this.isOptionSelectedSubject.next(isSelected)) // Update the subject with the new state
    );
  }  

  // Method to set the option selected state
  setOptionSelected(isSelected: boolean): void {
    this.ngZone.run(() => {
      // Check if the new state is different from the current state
      if (this.isOptionSelectedSubject.value !== isSelected) {
        console.log(
          `Updating isOptionSelected state from ${this.isOptionSelectedSubject.value} to ${isSelected}`
        );
        this.isOptionSelectedSubject.next(isSelected);
      } else {
        console.log(`isOptionSelected state remains unchanged: ${isSelected}`);
      }
    });
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
  toggleSelectedOption(questionIndex: number, option: SelectedOption, isMultiSelect: boolean): void {
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

    this.handleSingleOption(option, questionIndex, isMultiSelect);

    this.selectedOptionsMap.set(questionIndex, options);
    console.log('Updated selectedOptionsMap:', this.selectedOptionsMap);

    this.updateAnsweredState();
  }

  updateSelectedOptions(
    questionIndex: number,
    optionIndex: number,
    action: 'add' | 'remove'
  ): void {
    if (optionIndex < 0) {
      console.error(`Invalid optionIndex ${optionIndex}.`);
      return;
    }
  
    const quizId = this.quizService.quizId || localStorage.getItem('quizId');
    if (!quizId) {
      console.error('Quiz ID is null or undefined.');
      return;
    }
  
    const quiz = this.quizService.quizData.find(
      (q) => q.quizId?.trim() === quizId.trim()
    );
    if (!quiz) {
      console.error(`Quiz with ID ${quizId} not found.`);
      return;
    }
  
    const question = quiz.questions[questionIndex];
    if (!question) {
      console.error(`Question not found at index ${questionIndex}.`);
      return;
    }
  
    if (!question.options || question.options.length === 0) {
      console.error('No options available for this question.');
      return;
    }

    const option = question.options[optionIndex ?? 0];
    if (!option) {
      console.error(
        `Option data not found for optionIndex ${optionIndex}.`,
        question.options
      );
      return;
    }
  
    if (!this.selectedOptionsMap.has(questionIndex)) {
      this.selectedOptionsMap.set(questionIndex, []);
    }
  
    const options = this.selectedOptionsMap.get(questionIndex) || [];
    const existingOptionIndex = options.findIndex(
      (opt) => opt.text.trim() === option.text.trim()
    );
  
    if (action === 'add') {
      if (existingOptionIndex === -1) {
        options.push({ ...option, questionIndex });
        console.log(`Option added: ${option.text}`);
      } else {
        console.info(`Option already added: ${option.text}`);
      }
    } else if (action === 'remove') {
      if (existingOptionIndex !== -1) {
        options.splice(existingOptionIndex, 1);
        console.log(`Option removed: ${option.text}`);
      } else {
        console.info(`Option not found for removal: ${option.text}`);
      }
    }
  
    this.selectedOptionsMap.set(questionIndex, options);
    console.log('Updated selectedOptionsMap:', this.selectedOptionsMap);
  
    this.updateAnsweredState();
  }

  /* updateAnsweredState(): void {
    const selectedOptions = Array.from(this.selectedOptionsMap.values()).flat();
  
    // Determine if the question is answered
    let isAnswered = false;
    if (this.currentQuestionType === QuestionType.MultipleAnswer) {
      // Check if at least one correct option is selected
      isAnswered = selectedOptions.every((option) => option.selected === option.correct);
    } else {
      // For single-answer questions, check if any option is selected
      isAnswered = selectedOptions.some((option) => option.selected);
    }
  
    this.setAnsweredState(isAnswered);
  } */
  /* updateAnsweredState(): void {
    const selectedOptions = Array.from(this.selectedOptionsMap.values()).flat();

    let isAnswered = false;

    if (this.currentQuestionType === QuestionType.MultipleAnswer) {
      // Ensure all correct options are selected and no incorrect options are selected
      const allCorrectSelected = selectedOptions
        .filter(option => option.correct)
        .every(option => option.selected);

      const noIncorrectSelected = selectedOptions
        .filter(option => !option.correct)
        .every(option => !option.selected);

      isAnswered = allCorrectSelected && noIncorrectSelected;
    } else {
      // For single-answer questions, check if any option is selected
      isAnswered = selectedOptions.some(option => option.selected);
    }

    this.setAnsweredState(isAnswered);
  } */
  /* updateAnsweredState(): void {
    const selectedOptions = Array.from(this.selectedOptionsMap.values()).flat();

    let isAnswered = false;

    if (this.currentQuestionType === QuestionType.MultipleAnswer) {
      // Ensure all correct options are selected
      const correctOptions = selectedOptions.filter(option => option.correct);
      const incorrectOptions = selectedOptions.filter(option => !option.correct);

      const allCorrectSelected = correctOptions.every(option => option.selected);
      const noIncorrectSelected = incorrectOptions.every(option => !option.selected);

      isAnswered = allCorrectSelected && noIncorrectSelected;
    } else {
      // For single-answer questions, check if any option is selected
      isAnswered = selectedOptions.some(option => option.selected);
    }

    this.setAnsweredState(isAnswered);
  } */
  /* updateAnsweredState(): void {
    const selectedOptions = Array.from(this.selectedOptionsMap.values()).flat();

    if (this.currentQuestionType === QuestionType.MultipleAnswer) {
      // Get all correct options and all incorrect options
      const correctOptions = selectedOptions.filter(option => option.correct);
      const incorrectOptions = selectedOptions.filter(option => !option.correct);

      // Check if all correct options are selected
      const allCorrectSelected = correctOptions.every(option => option.selected);

      // Check if no incorrect options are selected
      const noIncorrectSelected = incorrectOptions.every(option => !option.selected);

      // Update isAnswered state only when both conditions are true
      const isAnswered = allCorrectSelected && noIncorrectSelected;
      this.setAnsweredState(isAnswered);

      // Debugging logs
      console.log('Correct Options:', correctOptions);
      console.log('Incorrect Options:', incorrectOptions);
      console.log('All Correct Selected:', allCorrectSelected);
      console.log('No Incorrect Selected:', noIncorrectSelected);
      console.log('isAnswered:', isAnswered);
    } else {
      // For single-answer questions, check if any option is selected
      const anyOptionSelected = selectedOptions.some(option => option.selected);
      this.setAnsweredState(anyOptionSelected);

      // Debugging logs
      console.log('Single-answer question, any option selected:', anyOptionSelected);
    }
  } */
  /* updateAnsweredState(): void {
    const selectedOptions = Array.from(this.selectedOptionsMap.values()).flat();

    if (this.currentQuestionType === QuestionType.MultipleAnswer) {
        // Get all correct and incorrect options
        const correctOptions = selectedOptions.filter(option => option.correct);
        const incorrectOptions = selectedOptions.filter(option => !option.correct);

        // Check if all correct options are selected
        const allCorrectSelected = correctOptions.every(option => option.selected);

        // Check if no incorrect options are selected
        const noIncorrectSelected = incorrectOptions.every(option => !option.selected);

        // Determine if the question is answered
        const isAnswered = allCorrectSelected && noIncorrectSelected;

        // Update the answered state
        this.setAnsweredState(isAnswered);

        // Debug logs for clarity
        console.log('Correct Options:', correctOptions);
        console.log('Incorrect Options:', incorrectOptions);
        console.log('All Correct Selected:', allCorrectSelected);
        console.log('No Incorrect Selected:', noIncorrectSelected);
        console.log('isAnswered:', isAnswered);
    } else {
        // Single-answer questions: check if any option is selected
        const anyOptionSelected = selectedOptions.some(option => option.selected);
        this.setAnsweredState(anyOptionSelected);

        // Debug logs for clarity
        console.log('Single-answer question, any option selected:', anyOptionSelected);
    }
  } */
  updateAnsweredState(): void {
    const selectedOptions = Array.from(this.selectedOptionsMap.values()).flat();

    console.log('Selected Options:', selectedOptions);

    if (this.currentQuestionType === QuestionType.MultipleAnswer) {
        const correctOptions = selectedOptions.filter(option => option.correct);
        const incorrectOptions = selectedOptions.filter(option => !option.correct);

        console.log('Correct Options:', correctOptions);
        console.log('Incorrect Options:', incorrectOptions);

        const allCorrectSelected = correctOptions.every(option => option.selected);
        const noIncorrectSelected = incorrectOptions.every(option => !option.selected);

        console.log('All Correct Selected:', allCorrectSelected);
        console.log('No Incorrect Selected:', noIncorrectSelected);

        const isAnswered = allCorrectSelected && noIncorrectSelected;

        console.log('isAnswered:', isAnswered);

        this.setAnsweredState(isAnswered);
    } else {
        const anyOptionSelected = selectedOptions.some(option => option.selected);
        console.log('Single-answer question, any option selected:', anyOptionSelected);
        this.setAnsweredState(anyOptionSelected);
    }
  }

 
  setAnswered(isAnswered: boolean): void {
    this.isAnsweredSubject.next(isAnswered);
    sessionStorage.setItem('isAnswered', JSON.stringify(isAnswered));
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