import { Injectable, NgZone } from '@angular/core';
import { BehaviorSubject, Observable, Subject } from 'rxjs';
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

  stopTimer$ = new Subject<void>();
  stopTimerEmitted = false;

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

  // probably remove...
  /* saveState(): void {
    localStorage.setItem('isAnswered', JSON.stringify(this.isAnsweredSubject.value));
  }

  restoreState(): void {
    const savedIsAnswered = localStorage.getItem('isAnswered');
    if (savedIsAnswered !== null) {
      const isAnswered = JSON.parse(savedIsAnswered);
      console.log('Restoring isAnswered:', isAnswered);
      this.isAnsweredSubject.next(isAnswered);
    }
  } */

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

  /** Adds an option to the selectedOptionsMap */
  addOption(questionIndex: number, option: SelectedOption): void {
    // 1️⃣ Check if option is valid
    if (!option) {
      console.error('[addOption] Option is undefined. Cannot add it to selectedOptionsMap.');
      return; // Stop execution to prevent errors
    }

    // 2️⃣ Check if optionId is valid
    if (option.optionId === undefined || option.optionId === null) {
      console.error('[addOption] option.optionId is undefined:', option);
      return; // Stop execution to prevent errors
    }

    // Get the current selected options for this question
    const currentOptions = this.selectedOptionsMap.get(questionIndex) || [];

    // Avoid adding the same option twice
    if (!currentOptions.some(o => o.optionId === option.optionId)) {
      currentOptions.push(option);
      this.selectedOptionsMap.set(questionIndex, currentOptions);
      console.log('[addOption] Option added:', option);
    } else {
      console.log('[addOption] Option already present:', option);
    }

    console.log('[addOption] Full selectedOptionsMap (AFTER update):', Array.from(this.selectedOptionsMap.entries()));
  }

  /** Removes an option from the selectedOptionsMap */
  removeOption(questionIndex: number, optionId: number): void {
    const currentOptions = this.selectedOptionsMap.get(questionIndex) || [];
    const updatedOptions = currentOptions.filter(o => o.optionId !== optionId);

    if (updatedOptions.length > 0) {
      this.selectedOptionsMap.set(questionIndex, updatedOptions);
    } else {
      this.selectedOptionsMap.delete(questionIndex);
    }

    console.log('[removeOption] Option removed:', optionId);
    console.log('[removeOption] Full selectedOptionsMap (AFTER update):', Array.from(this.selectedOptionsMap.entries()));
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

    this.updateSelectedOptions(currentQuestionIndex, option.optionId, 'add');
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

  /* addSelectedOptionIndex(questionIndex: number, optionIndex: number): void {
    console.log('🛠️ [addSelectedOptionIndex] Called with:', { questionIndex, optionIndex });

    // Ensure the questionIndex exists in selectedOptionsMap
    if (!this.selectedOptionsMap.has(questionIndex)) {
        console.warn('⚠️ [addSelectedOptionIndex] No entry for questionIndex. Initializing new array for questionIndex:', questionIndex);
        this.selectedOptionsMap.set(questionIndex, []);
    }

    // Retrieve the options array for the questionIndex
    const options = this.selectedOptionsMap.get(questionIndex)!;

    // Check if the option already exists
    const existingOption = options.find(option => option.optionId === optionIndex);

    if (!existingOption) {
        // Create a new SelectedOption and add it to the options array
        const newOption: SelectedOption = {
            optionId: optionIndex,
            text: `Option ${optionIndex + 1}`, // Placeholder text
            correct: false, // Default to false
            selected: true, // Mark as selected
            questionIndex, // Associate with the questionIndex
        };

        options.push(newOption); // Add the new option
        this.selectedOptionsMap.set(questionIndex, options); // Update the map
        console.log('✅ [addSelectedOptionIndex] Added new option:', newOption, 'to questionIndex:', questionIndex);
    } else {
        console.log('ℹ️ [addSelectedOptionIndex] Option already exists:', existingOption, 'for questionIndex:', questionIndex);
    }

    // Debug log the current state of selectedOptionsMap
    console.log('🔍 [addSelectedOptionIndex] Current state of selectedOptionsMap:', Array.from(this.selectedOptionsMap.entries()));
  } */
  addSelectedOptionIndex(questionIndex: number, optionIndex: number): void {
    console.log('🛠️ [addSelectedOptionIndex] Called with:', { questionIndex, optionIndex });
  
    // Ensure `selectedOptionsMap` entry for questionIndex exists
    if (!this.selectedOptionsMap.has(questionIndex)) {
      console.warn('⚠️ [addSelectedOptionIndex] Initializing new array for questionIndex:', questionIndex);
      this.selectedOptionsMap.set(questionIndex, []);
    }
  
    const options = this.selectedOptionsMap.get(questionIndex)!;
  
    // Check if the option already exists
    const existingOption = options.find(option => option.optionId === optionIndex);
  
    if (!existingOption) {
      const newOption: SelectedOption = {
        optionId: optionIndex,
        text: `Option ${optionIndex + 1}`,
        correct: false, // Default to false unless explicitly set
        selected: true, // Mark as selected since it’s being added
        questionIndex,
      };
  
      options.push(newOption);
      this.selectedOptionsMap.set(questionIndex, options); // Update the map
      console.log('✅ [addSelectedOptionIndex] Added new option:', newOption);
    } else {
      console.log('ℹ️ [addSelectedOptionIndex] Option already exists:', existingOption);
    }
  
    this.debugSelectedOptionsMap(); // Log current map state
  }  
  
  removeSelectedOptionIndex(questionIndex: number, optionIndex: number): void {
    if (this.selectedOptionIndices[questionIndex]) {
      const optionPos = this.selectedOptionIndices[questionIndex].indexOf(optionIndex);
      if (optionPos > -1) {
        this.selectedOptionIndices[questionIndex].splice(optionPos, 1);

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

    const options = this.selectedOptionsMap.get(questionIndex) || [];
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

    this.updateSelectedOptions(questionIndex, option.optionId, 'add');
  }

  updateSelectedOptions(questionIndex: number, optionIndex: number, action: 'add' | 'remove'): void {
    const options = this.selectedOptionsMap.get(questionIndex) || [];
    
    const option = options.find((opt) => opt.optionId === optionIndex);
    if (!option) {
      console.warn(`[updateSelectedOptions] Option not found for optionIndex: ${optionIndex}`);
      return;
    }
  
    if (action === 'add') {
      options.push(option);
      console.log(`[updateSelectedOptions] Added option to selectedOptionsMap:`, option);
    } else if (action === 'remove') {
      const idx = options.findIndex((opt) => opt.optionId === optionIndex);
      if (idx !== -1) options.splice(idx, 1);
      console.log(`[updateSelectedOptions] Removed option from selectedOptionsMap:`, option);
    }

    this.selectedOptionsMap.set(questionIndex, options);

    // Call updateAnsweredState every time selectedOptionsMap changes
    if (options && options.length > 0) {
      this.updateAnsweredState(options, questionIndex);
    }
  }
  
  /* updateAnsweredState(questionOptions: Option[] = [], questionIndex: number = -1): void {
    console.log('🛠️ [updateAnsweredState] Called with:', { questionOptions, questionIndex });
  
    // Validate question options
    if (!Array.isArray(questionOptions) || questionOptions.length === 0) {
      console.info('⚠️ [updateAnsweredState] No options provided. Attempting fallback.');
  
      // Fallback mechanism
      questionIndex = questionIndex >= 0 ? questionIndex : this.getFallbackQuestionIndex();
      questionOptions = this.selectedOptionsMap.get(questionIndex) ?? [];
  
      if (!Array.isArray(questionOptions) || questionOptions.length === 0) {
        console.warn('⚠️ [updateAnsweredState] No valid options found for fallback question index:', questionIndex);
        console.warn('[updateAnsweredState] SelectedOptionsMap content:', Array.from(this.selectedOptionsMap.entries()));
  
        questionOptions = this.getDefaultOptions(questionIndex); // Use default options
      }
    }
  
    console.log('[updateAnsweredState] Final questionOptions after fallback:', questionOptions);
  
    if (!Array.isArray(questionOptions) || questionOptions.length === 0) {
      console.error('❌ [updateAnsweredState] Unable to proceed. No valid options available.');
      return;
    }
  
    // Check if all correct answers are selected
    const allCorrectAnswersSelected = this.areAllCorrectAnswersSelected(questionOptions, questionIndex);
    console.log('✅ [updateAnsweredState] All correct answers selected:', allCorrectAnswersSelected);
  
    // Determine answered state
    const isAnswered = questionOptions.some(option => option.selected);
    this.isAnsweredSubject.next(isAnswered);
  
    // Stop timer if all correct answers are selected
    if (allCorrectAnswersSelected && !this.stopTimerEmitted) {
      console.log('[updateAnsweredState] Stopping timer as all correct answers are selected.');
      this.stopTimer$.next();
      this.stopTimerEmitted = true;
    }
  
    console.log('[updateAnsweredState] Final state:', {
      questionOptions,
      questionIndex,
      allCorrectAnswersSelected,
      isAnswered,
    });
  } */
  /* updateAnsweredState(questionOptions: Option[] = [], questionIndex: number = -1): void {
    console.log('🛠️ [updateAnsweredState] Called with:', { questionOptions, questionIndex });

    if (!Array.isArray(questionOptions) || questionOptions.length === 0) {
        console.info('⚠️ [updateAnsweredState] No options provided. Attempting fallback.');

        questionIndex = questionIndex >= 0 ? questionIndex : this.getFallbackQuestionIndex();
        console.log('[updateAnsweredState] Using fallback questionIndex:', questionIndex);

        questionOptions = this.selectedOptionsMap.get(questionIndex) ?? [];
        console.log('[updateAnsweredState] Fallback questionOptions:', questionOptions);

        if (questionOptions.length === 0) {
            console.warn('⚠️ [updateAnsweredState] No valid options found for fallback question index:', questionIndex);

            this.debugSelectedOptionsMap();

            questionOptions = this.getDefaultOptions(questionIndex);
            console.warn('⚠️ [updateAnsweredState] Using default options:', questionOptions);
        }
    }

    if (!Array.isArray(questionOptions) || questionOptions.length === 0) {
        console.error('❌ [updateAnsweredState] Unable to proceed. No valid options available.');
        return;
    }

    console.log('[updateAnsweredState] Proceeding with:', { questionOptions, questionIndex });

    const allCorrectAnswersSelected = this.areAllCorrectAnswersSelected(questionOptions, questionIndex);
    console.log('✅ [updateAnsweredState] All correct answers selected:', allCorrectAnswersSelected);

    const isAnswered = questionOptions.some(option => option.selected);
    this.isAnsweredSubject.next(isAnswered);

    if (allCorrectAnswersSelected && !this.stopTimerEmitted) {
        console.log('[updateAnsweredState] Stopping timer as all correct answers are selected.');
        this.stopTimer$.next();
        this.stopTimerEmitted = true;
    }

    console.log('[updateAnsweredState] Final state:', { questionOptions, questionIndex, allCorrectAnswersSelected, isAnswered });
  } */
  updateAnsweredState(questionOptions: Option[] = [], questionIndex: number = -1): void {
    console.log('🛠️ [updateAnsweredState] Called with:', {
      questionOptions,
      questionIndex,
      selectedOptionsMap: Array.from(this.selectedOptionsMap.entries()),
    });
  
    // Step 1: Validate inputs
    if (!Array.isArray(questionOptions) || questionOptions.length === 0) {
      console.info('[updateAnsweredState] No options provided. Attempting fallback.');
  
      if (questionIndex < 0) {
        questionIndex = this.getFallbackQuestionIndex();
        if (questionIndex < 0) {
          console.error('❌ [updateAnsweredState] Invalid fallback question index:', questionIndex);
          return;
        }
      }
  
      questionOptions = this.selectedOptionsMap.get(questionIndex) ?? [];
      if (!Array.isArray(questionOptions) || questionOptions.length === 0) {
        console.warn('⚠️ [updateAnsweredState] No valid options found for fallback question index:', questionIndex);
  
        // Debug selectedOptionsMap
        this.debugSelectedOptionsMap();
  
        // Generate default options if necessary
        questionOptions = this.getDefaultOptions(questionIndex);
        console.warn('⚠️ [updateAnsweredState] Using default options:', questionOptions);
      }
    }
  
    // Step 2: Final validation
    if (!Array.isArray(questionOptions) || questionOptions.length === 0) {
      console.error('❌ [updateAnsweredState] Unable to proceed. No valid options available.');
      return;
    }
  
    console.log('✅ [updateAnsweredState] Proceeding with validated options:', {
      questionOptions,
      questionIndex,
    });
  
    // Step 3: Determine answered state
    const isAnswered = questionOptions.some(option => option.selected);
    this.isAnsweredSubject.next(isAnswered);
  
    // Step 4: Check if all correct answers are selected
    const allCorrectAnswersSelected = this.areAllCorrectAnswersSelected(questionOptions, questionIndex);
    if (allCorrectAnswersSelected && !this.stopTimerEmitted) {
      console.log('[updateAnsweredState] Stopping timer as all correct answers are selected.');
      this.stopTimer$.next();
      this.stopTimerEmitted = true;
    }
  
    console.log('[updateAnsweredState] Final state:', {
      questionOptions,
      questionIndex,
      allCorrectAnswersSelected,
      isAnswered,
    });
  }  

  private debugSelectedOptionsMap(): void {
    console.log('🔍 [debugSelectedOptionsMap] Current state of selectedOptionsMap:', Array.from(this.selectedOptionsMap.entries()));
  
    if (this.selectedOptionsMap.size === 0) {
      console.warn('⚠️ [debugSelectedOptionsMap] selectedOptionsMap is empty.');
    } else {
      for (const [questionIndex, options] of this.selectedOptionsMap) {
        if (!Array.isArray(options) || options.length === 0) {
          console.warn(`⚠️ [debugSelectedOptionsMap] No valid options for questionIndex: ${questionIndex}`);
        } else {
          console.log(`✅ [debugSelectedOptionsMap] Options for questionIndex ${questionIndex}:`, options);
        }
      }
    }
  }  

  private debugQuestionOptions(questionOptions: Option[], questionIndex: number): void {
    if (!Array.isArray(questionOptions) || questionOptions.length === 0) {
      console.warn('⚠️ [debugQuestionOptions] No valid options for questionIndex:', questionIndex);
    } else {
      console.log('✅ [debugQuestionOptions] Valid options for questionIndex:', questionIndex, questionOptions);
    }
  }

  areAllCorrectAnswersSelected(questionOptions: Option[], questionIndex: number): boolean {
    if (!Array.isArray(questionOptions) || questionOptions.length === 0) {
      console.warn('⚠️ [areAllCorrectAnswersSelected] No options provided for question index:', questionIndex);
      return false;
    }
  
    const correctOptionIds = questionOptions.filter(o => o.correct).map(o => o.optionId);
    if (correctOptionIds.length === 0) {
      console.warn('⚠️ [areAllCorrectAnswersSelected] No correct options found for question index:', questionIndex);
      return false;
    }
  
    const selectedOptionIds = (this.selectedOptionsMap.get(questionIndex) || []).map(o => o.optionId);
    return correctOptionIds.every(id => selectedOptionIds.includes(id));
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
  
  private getDefaultOptions(questionIndex: number): Option[] {
    console.warn('⚠️ [getDefaultOptions] Generating default options for questionIndex:', questionIndex);
  
    const defaultOptions = Array(4)
      .fill(null)
      .map((_, index) => ({
        optionId: index,
        text: `Default Option ${index + 1}`,
        correct: index === 0, // Default to the first option as correct
        selected: false,
      }));
  
    console.log('✅ [getDefaultOptions] Generated default options:', defaultOptions);
    return defaultOptions;
  }

  private getFallbackQuestionIndex(): number {
    const keys = Array.from(this.selectedOptionsMap.keys());
    if (keys.length > 0) {
      console.log('✅ [getFallbackQuestionIndex] Using fallback index from selectedOptionsMap:', keys[0]);
      return keys[0];
    }
    console.warn('⚠️ [getFallbackQuestionIndex] No keys in selectedOptionsMap. Defaulting to 0.');
    return 0;
  }
}