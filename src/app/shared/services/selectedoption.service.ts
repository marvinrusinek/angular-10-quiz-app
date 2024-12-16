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

  /** Adds an option to the selectedOptionsMap */
  addOption(questionIndex: number, option: SelectedOption, source: string = 'unknown'): void {
    // 1️⃣ Check if option is valid
    if (!option) {
      console.error('❌ [addOption] Option is undefined. Cannot add it to selectedOptionsMap.');
      return; // 🔥 Stop execution to prevent errors
    }

    // 2️⃣ Check if optionId is valid
    if (option.optionId === undefined || option.optionId === null) {
      console.error('❌ [addOption] option.optionId is undefined:', option);
      return; // 🔥 Stop execution to prevent errors
    }

    // Get the current selected options for this question
    const currentOptions = this.selectedOptionsMap.get(questionIndex) || [];

    // Avoid adding the same option twice
    if (!currentOptions.some(o => o.optionId === option.optionId)) {
      currentOptions.push(option);
      this.selectedOptionsMap.set(questionIndex, currentOptions);
      console.log('🟢 [addOption] Option added:', option);
    } else {
      console.log('⚠️ [addOption] Option already present:', option);
    }

    console.log('🗂️ [addOption] Full selectedOptionsMap (AFTER update):', Array.from(this.selectedOptionsMap.entries()));
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

    console.log('🟡 [removeOption] Option removed:', optionId);
    console.log('🗂️ [removeOption] Full selectedOptionsMap (AFTER update):', Array.from(this.selectedOptionsMap.entries()));
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

  updateAnsweredState(questionOptions?: Option[]): void {
    // Get all the selected options
    const selectedOptions = Array.from(this.selectedOptionsMap.values()).flat();
  
    // Count the number of correct options for this question
    const correctOptionCount = questionOptions?.filter(option => option.correct).length ?? 0;
  
    // Determine if this is a Multiple-Answer question
    const isMultipleAnswer = correctOptionCount > 1;
  
    // Check if all correct answers are selected
    const allCorrectAnswersSelected = questionOptions 
      ? this.areAllCorrectAnswersSelected(questionOptions) 
      : false;
  
    // Set the "isAnswered" state ONLY if all correct answers are selected for multiple-answer questions
    const isAnswered = isMultipleAnswer 
      ? allCorrectAnswersSelected 
      : selectedOptions.length > 0;
  
    // Log for debugging
    console.log('[updateAnsweredState] Updating answered state:', {
      selectedOptions,
      isAnswered,
      allCorrectAnswersSelected,
      correctOptionCount,
      isMultipleAnswer
    });
  
    // Update BehaviorSubject for Next button logic
    this.isAnsweredSubject.next(isAnswered);
    console.log('[updateAnsweredState] isAnsweredSubject emitted (for Next button):', isAnswered);
  
    // Emit the event to stop the timer **only if all correct answers are selected**
    if (allCorrectAnswersSelected && !this.stopTimerEmitted) {
      console.log('[updateAnsweredState] All correct answers selected — emitting stopTimer$ event');
      this.stopTimer$.next();
      this.stopTimerEmitted = true; // Prevent future emissions
    }
  }

  /* areAllCorrectAnswersSelected(questionOptions: Option[]): boolean {
    // Get all correct option IDs
    const correctOptionIds = questionOptions
      .filter((o) => o.correct && o.optionId != null)
      .map((o) => o.optionId);
  
    if (correctOptionIds.length === 0) {
      console.warn('[areAllCorrectAnswersSelected] No correct options for this question');
      return false;
    }
  
    // Get all selected option IDs
    const selectedOptionIds = Array.from(
      new Set(
        Array.from(this.selectedOptionsMap.values())
          .flat()
          .map((o) => o.optionId)
          .filter((id) => id != null)
      )
    );
  
    // Use a Set to make it more efficient
    const correctSet = new Set(correctOptionIds);
    const selectedSet = new Set(selectedOptionIds);
  
    const allCorrectOptionsSelected = Array.from(correctSet).every(correctId => selectedSet.has(correctId));
  
    console.log('[areAllCorrectAnswersSelected] Correct option IDs:', correctOptionIds);
    console.log('[areAllCorrectAnswersSelected] Selected option IDs:', selectedOptionIds);
    console.log('[areAllCorrectAnswersSelected] All correct options selected:', allCorrectOptionsSelected);
  
    return allCorrectOptionsSelected;
  } */
  /* areAllCorrectAnswersSelected(questionOptions: Option[]): boolean {
    console.log('[areAllCorrectAnswersSelected] Full question options:', JSON.stringify(questionOptions, null, 2));
  
    // Get the list of correct option IDs
    const correctOptionIds = questionOptions
      .filter((o) => o.correct && o.optionId != null) // Ensure optionId exists and correct === true
      .map((o) => o.optionId);
  
    if (correctOptionIds.length === 0) {
      console.warn('🚨 [areAllCorrectAnswersSelected] No correct options for this question');
      return false; // No correct options, so return false
    }

    // 🔥 Log the correct option IDs for debugging
    console.log('🚀 [areAllCorrectAnswersSelected] Correct option IDs:', correctOptionIds);
  
    // Get the list of selected option IDs
    const selectedOptionIds = Array.from(
      new Set(
        Array.from(this.selectedOptionsMap.values())
          .flat()
          .map((o) => o.optionId)
          .filter((id) => id != null)
      )
    );
  
    // 🔥 Log the selected option IDs for debugging
    console.log('🚀 [areAllCorrectAnswersSelected] Selected option IDs:', selectedOptionIds);
  
    // Check if every correct option is present in the selected options
    const allCorrectOptionsSelected = correctOptionIds.every(id => selectedOptionIds.includes(id));
    
    // 🔥 Log if all correct options are selected
    console.log('✅ [areAllCorrectAnswersSelected] All correct options selected:', allCorrectOptionsSelected);

    return allCorrectOptionsSelected;
  } */
  areAllCorrectAnswersSelected(questionOptions: Option[], questionIndex?: number): boolean {
    // Check for undefined optionIds
    questionOptions.forEach((option, index) => {
      if (option.optionId === undefined) {
        console.error('❌ [areAllCorrectAnswersSelected] Option with undefined optionId:', option);
        option.optionId = index; // Fallback optionId
      }
    });

    // **1️⃣ Get the list of correct option IDs**
    const correctOptionIds = questionOptions
      .filter(o => o.correct && Number.isInteger(o.optionId)) // Check that optionId is valid
      .map(o => o.optionId);
  
    // **2️⃣ Get the list of selected option IDs**
    /* const selectedOptionIds = Array.from(
      new Set(
        Array.from(this.selectedOptionsMap.values())
          .flat()
          .map((o) => {
            if (o.optionId === undefined) {
              console.error('❌ [areAllCorrectAnswersSelected] Option with undefined optionId:', o);
            }
            return o.optionId;
          })
          .filter((id) => typeof id === 'number')
      )
    ); */
    const selectedOptionIds = Array.from(this.selectedOptionsMap.values())
      .flat()
      .filter(o => {
        const isValid = o && Number.isInteger(o.optionId);
        if (!isValid) console.error('❌ Option with undefined optionId:', o, 'Question Index:', questionIndex);
        return isValid;
      })
      .map(o => o.optionId);


    const allCorrectOptionsSelected = correctOptionIds.every(id => selectedOptionIds.includes(id));
  
    console.log('🚀 [areAllCorrectAnswersSelected] Correct option IDs:', correctOptionIds);
    console.log('🚀 [areAllCorrectAnswersSelected] Selected option IDs:', selectedOptionIds);
    console.log('[areAllCorrectAnswersSelected] All correct options selected:', allCorrectOptionsSelected);
  
    // **4️⃣ Return true only if no options are missing**
    return allCorrectOptionsSelected;
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