import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable, Subject } from 'rxjs';
import { distinctUntilChanged, map, startWith, take } from 'rxjs/operators';

import { QuestionType } from '../../shared/models/question-type.enum';
import { Option } from '../../shared/models/Option.model';
import { SelectedOption } from '../../shared/models/SelectedOption.model';

@Injectable({ providedIn: 'root' })
export class SelectedOptionService {
  selectedOption: SelectedOption | SelectedOption[] = null;
  selectedOptionsMap = new Map<number, SelectedOption[]>();
  private selectedOptionIndices: { [key: number]: number[] } = {};

  selectedOptionSubject = new BehaviorSubject<SelectedOption[]>([]);
  selectedOption$ = this.selectedOptionSubject.asObservable();

  private selectedOptionExplanationSource = new BehaviorSubject<string>(null);
  selectedOptionExplanation$ = this.selectedOptionExplanationSource.asObservable();

  private isOptionSelectedSubject = new BehaviorSubject<boolean>(false);

  isAnsweredSubject = new BehaviorSubject<boolean>(false);
  isAnswered$: Observable<boolean> = this.isAnsweredSubject.asObservable();
  public answered$ = this.isAnswered$;

  private questionTextSubject = new BehaviorSubject<string>('');
  questionText$ = this.questionTextSubject.asObservable();

  private showFeedbackForOptionSubject = new BehaviorSubject<Record<string, boolean>>({});
  showFeedbackForOption$ = this.showFeedbackForOptionSubject.asObservable();

  private isNextButtonEnabledSubject = new BehaviorSubject<boolean>(false);

  private immediateSelectionSubject = new Subject<{
    option: SelectedOption;
    selectedOptions: SelectedOption[];
  }>();
  public immediateSelection$: Observable<{
    option: SelectedOption;
    selectedOptions: SelectedOption[];
  }> = this.immediateSelectionSubject.asObservable();

  stopTimer$ = new Subject<void>();
  stopTimerEmitted = false;

  currentQuestionType: QuestionType | null = null;

  set isNextButtonEnabled(value: boolean) {
    this.isNextButtonEnabledSubject.next(value);
  }

  get isNextButtonEnabled$(): Observable<boolean> {
    return this.isNextButtonEnabledSubject.asObservable();
  }

  constructor() {}

  // Method to update the selected option state
  selectOption(
    optionId: number, 
    questionIndex: number, 
    text: string, 
    isMultiSelect: boolean
  ): void {
    if (optionId == null || questionIndex == null || !text) {
      console.error('Invalid data for SelectedOption:', { optionId, questionIndex, text });
      return;
    }
  
    const newSelection: SelectedOption = {
      optionId,
      questionIndex,
      text,
      selected: true,
      highlight: true,
      showIcon: true
    };
  
    // Get current stored selections
    const currentSelections = this.getSelectedOptions();
  
    // Remove any existing entry with same optionId + questionIndex
    const filteredSelections = currentSelections.filter(
      s => !(s.optionId === optionId && s.questionIndex === questionIndex)
    );
  
    // Add the new one
    const updatedSelections = [...filteredSelections, newSelection];
  
    // Emit updated list
    this.selectedOptionSubject.next(updatedSelections);
  
    // Save internally if needed
    this.selectedOptionsMap.set(questionIndex, updatedSelections);
  
    if (!isMultiSelect) {
      this.isOptionSelectedSubject.next(true);
      this.setNextButtonEnabled(true);
    }
  
    console.info('[🧠 selectOption()] Emitted updated selections:', updatedSelections);
  }
  
  deselectOption(): void {
    this.selectedOptionSubject.next([]);
    this.isOptionSelectedSubject.next(false);
  }

  // Adds an option to the selectedOptionsMap
  addOption(questionIndex: number, option: SelectedOption): void {
    // Check if option is valid
    if (!option) {
      console.error('Option is undefined. Cannot add it to selectedOptionsMap.');
      return;  // stop execution to prevent errors
    }

    // Check if optionId is valid
    if (option.optionId === undefined || option.optionId === null) {
      console.error('option.optionId is undefined:', option);
      return; // stop execution to prevent errors
    }

    // Get the current selected options for this question
    const currentOptions = this.selectedOptionsMap.get(questionIndex) || [];

    // Avoid adding the same option twice
    if (!currentOptions.some(o => o.optionId === option.optionId)) {
      currentOptions.push(option);
      this.selectedOptionsMap.set(questionIndex, currentOptions);
      console.log('Option added:', option);
    } else {
      console.log('Option already present:', option);
    }
  }

  // Removes an option from the selectedOptionsMap
  removeOption(questionIndex: number, optionId: number): void {
    const currentOptions = this.selectedOptionsMap.get(questionIndex) || [];
    const updatedOptions = currentOptions.filter(o => o.optionId !== optionId);

    if (updatedOptions.length > 0) {
      this.selectedOptionsMap.set(questionIndex, updatedOptions);
    } else {
      this.selectedOptionsMap.delete(questionIndex);
    }
  }

  setNextButtonEnabled(enabled: boolean): void {
    this.isNextButtonEnabledSubject.next(enabled);  // update the button's enabled state
  }  

  clearSelection(): void {
    this.isOptionSelectedSubject.next(false);  // no option selected
  }

  setSelectedOption(option: SelectedOption | SelectedOption[]): void {
    if (!option) {
      console.log('SelectedOptionService: Clearing selected option');
      this.selectedOption = [];
      this.selectedOptionSubject.next([]);
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
      return;
    }
  
    // Enrich the selected option with persistent UI flags
    const enrichedOption: SelectedOption = {
      ...option,
      selected: true,
      highlight: true,
      showIcon: true
    };
  
    const qIndex = enrichedOption.questionIndex;
  
    // Get existing selections for this question (if any)
    const currentSelections = this.selectedOptionsMap.get(qIndex) || [];

    // Only proceed if this optionId isn’t already stored
    const alreadyExists = currentSelections.some(sel => sel.optionId === enrichedOption.optionId);
    if (alreadyExists) {
      console.log(`[⚠️ Option already selected] Q${qIndex}, Option ${enrichedOption.optionId} — skipping re-add but still emitting`);
      return;
    }
  
    // Remove any duplicate with the same optionId
    /* const deduplicated = currentSelections.filter(
      sel => sel.optionId !== enrichedOption.optionId
    ); */
  
    // Add the new selection
    // const updatedSelections = [...deduplicated, enrichedOption];
    const updatedSelections = [...currentSelections, enrichedOption];
  
    // Persist the updated list
    this.selectedOptionsMap.set(qIndex, updatedSelections);
 
    console.log('[🧠 Full map dump]');
    /* for (const [qIndex, opts] of this.selectedOptionsMap.entries()) {
      console.log(`FULL MAP DUMP QUESTION Q${qIndex}:`, opts.map(o => ({
        id: o?.optionId,
        selected: o?.selected,
        showIcon: o?.showIcon
      })));
    } */
    console.log(`[📦 Stored Selections for Q${qIndex}]`, this.selectedOptionsMap.get(qIndex));
    console.log('[🗺️ FULL MAP DUMP]', Array.from(this.selectedOptionsMap.entries()));

    // Emit for immediate UI update (exclude the current to mimic previous selections)
    /* const previouslySelected = updatedSelections.filter(
      sel => sel.optionId !== enrichedOption.optionId
    ); */
    this.emitImmediateSelection(enrichedOption, updatedSelections);
  
    // Broadcast updated selection state
    this.selectedOption = updatedSelections;
    this.selectedOptionSubject.next(updatedSelections);
    this.isOptionSelectedSubject.next(true);
  
    // Debug logs
    console.log('[🧠 FULL MAP DUMP]');
    for (const [qIndex, opts] of this.selectedOptionsMap.entries()) {
      console.log(`FULL MAP DUMP QUESTION Q${qIndex}:`, opts.map(o => {
        if (!o || typeof o !== 'object') return o;
        return {
          id: o.optionId,
          selected: o.selected,
          showIcon: o.showIcon,
          highlight: o.highlight
        };
      }));
    }
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
    const selectedOption = this.selectedOption as SelectedOption;
    return selectedOption?.optionId === option.optionId;
  }
  
  private areOptionsAlreadySelected(options: SelectedOption[]): boolean {
    // Ensure this.selectedOption is a single SelectedOption, not an array
    if (Array.isArray(this.selectedOption)) {
      console.error('Unexpected array in this.selectedOption');
      return false;
    }

    const selectedOption = this.selectedOption as SelectedOption;
  
    // Compare selected options with the array passed in
    return options.every(opt => selectedOption?.optionId === opt.optionId);
  }
  
  private handleSingleOption(option: SelectedOption, currentQuestionIndex: number, isMultiSelect: boolean): void {
    // Set the selected option (as an array)
    this.selectedOption = [option];
    this.selectedOptionSubject.next([option]);

    // Update the selected status
    this.isOptionSelectedSubject.next(true);

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

    this.updateSelectedOptions(currentQuestionIndex, option.optionId, 'add');
  }

  getSelectedOptions(): SelectedOption[] {
    const combined: SelectedOption[] = [];
  
    this.selectedOptionsMap.forEach((opts, qIndex) => {
      if (Array.isArray(opts)) {
        combined.push(...opts);
      }
    });
  
    console.log('[📤 getSelectedOptions()] returning', combined);
    return combined;
  }  

  getSelectedOptionsForQuestion(questionIndex: number): SelectedOption[] {
    return this.selectedOptionsMap.get(questionIndex) || [];
  }

  clearSelectionsForQuestion(questionIndex: number): void {
    if (this.selectedOptionsMap.has(questionIndex)) {
      this.selectedOptionsMap.delete(questionIndex); // removes the entry entirely
      console.log(`[🗑️ cleared] selections for Q${questionIndex}`);
    } else {
      console.log(`[ℹ️ no selections to clear] for Q${questionIndex}`);
    }
  }

  // Method to get the current option selected state
  getCurrentOptionSelectedState(): boolean {
    return this.isOptionSelectedSubject.getValue();
  }

  getShowFeedbackForOption(): { [optionId: number]: boolean } {
    return this.showFeedbackForOptionSubject.getValue();
  }

  isSelectedOption(option: Option): boolean {
    const selectedOptions = this.getSelectedOptions();  // Updated to use getSelectedOptions()
    const showFeedbackForOption = this.getShowFeedbackForOption();  // Get feedback data
  
    // Check if selectedOptions contains the current option
    if (Array.isArray(selectedOptions)) {
      // Loop through each selected option and check if the current option is selected
      return selectedOptions.some(
        (opt) =>
          opt.optionId === option.optionId && !!showFeedbackForOption[option.optionId]
      );
    }
  
    // If selectedOptions is somehow not an array, log a warning
    console.warn('[isSelectedOption] selectedOptions is not an array:', selectedOptions);
    return false;  // return false if selectedOptions is invalid
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
  
    // Only clear feedback state here — do NOT touch answered state
    this.showFeedbackForOptionSubject.next({});
  }  

  clearOptions(): void {
    this.selectedOptionSubject.next(null);
    this.showFeedbackForOptionSubject.next({});
  }

  // Observable to get the current option selected state
  isOptionSelected$(): Observable<boolean> {
    return this.selectedOption$.pipe(
      startWith(this.selectedOptionSubject.getValue()),  // emit the current state immediately when subscribed
      map(option => option !== null),  // determine if an option is selected
      distinctUntilChanged()  // emit only when the selection state changes
    );
  }  

  // Method to set the option selected state
  setOptionSelected(isSelected: boolean): void {
    if (this.isOptionSelectedSubject.getValue() !== isSelected) {
      console.log(`Updating isOptionSelected state from ${this.isOptionSelectedSubject.getValue()} to ${isSelected}`);
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
    if (!this.selectedOptionsMap.has(questionIndex)) {
      this.selectedOptionsMap.set(questionIndex, []);
    }

    const options = this.selectedOptionsMap.get(questionIndex)!;
    const existingOption = options.find(o => o.optionId === optionIndex);

    if (!existingOption) {
      const newOption: SelectedOption = {
        optionId: optionIndex,
        questionIndex,  // ensure the questionIndex is set correctly
        text: `Option ${optionIndex + 1}`,  // placeholder text, update if needed
        correct: false,  // default to false unless explicitly set elsewhere
        selected: true  // mark as selected since it's being added
      };

      options.push(newOption);  // add the new option
      this.selectedOptionsMap.set(questionIndex, options);  // update the map
    } else {
      console.log(`[addSelectedOptionIndex] Option ${optionIndex} already exists for questionIndex ${questionIndex}`);
    }
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
  public updateSelectionState(
    questionIndex: number,
    selectedOption: SelectedOption,
    isMultiSelect: boolean
  ): void {
    const key = `Q${questionIndex}`;
    const numericKey = Number(key);
    if (isNaN(numericKey)) {
      console.warn(`Invalid key' ${key}`);
      return;
    }

    const prevSelections = this.selectedOptionsMap.get(numericKey) || [];
  
    let updatedSelections: SelectedOption[];
  
    if (isMultiSelect) {
      const alreadySelected = prevSelections.find(
        (opt) => opt.optionId === selectedOption.optionId
      );
      if (!alreadySelected) {
        updatedSelections = [...prevSelections, selectedOption];
      } else {
        updatedSelections = prevSelections;
      }
    } else {
      updatedSelections = [selectedOption];
    }
  
    this.selectedOptionsMap.set(numericKey, updatedSelections);
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
    } else if (action === 'remove') {
      const idx = options.findIndex((opt) => opt.optionId === optionIndex);
      if (idx !== -1) options.splice(idx, 1);
    }

    this.selectedOptionsMap.set(questionIndex, options);

    // Call updateAnsweredState every time selectedOptionsMap changes
    if (options && options.length > 0) {
      this.updateAnsweredState(options, questionIndex);
    }
  }
  
  updateAnsweredState(questionOptions: Option[] = [], questionIndex: number = -1): void {
    try {
      // Validate inputs
      if (!Array.isArray(questionOptions) || questionOptions.length === 0) {
        console.info('[updateAnsweredState] No options provided. Attempting fallback.');
  
        if (questionIndex < 0) {
          questionIndex = this.getFallbackQuestionIndex();
          if (questionIndex < 0) {
            console.error('[updateAnsweredState] Invalid fallback question index:', questionIndex);
            return;
          }
        }
  
        questionOptions = this.selectedOptionsMap.get(questionIndex) ?? [];
        if (!Array.isArray(questionOptions) || questionOptions.length === 0) {
          if (this.selectedOptionsMap.size === 0) {
            console.info('[updateAnsweredState] selectedOptionsMap is empty.  Using default options without warning.');
          } else if (!this.selectedOptionsMap.has(questionIndex)) {
            console.warn(`[updateAnsweredState] No entry for questionIndex: 
            ${questionIndex}. Using default options.`);
          }
          questionOptions = this.getDefaultOptions();
        }
      }
  
      // Final validation of options
      if (!Array.isArray(questionOptions) || questionOptions.length === 0) {
        console.error('[updateAnsweredState] Unable to proceed. No valid options available.');
        return;
      }
  
      // Validate and normalize options
      const validatedOptions = questionOptions.map((option, index) => ({
        ...option,
        correct: option.correct ?? false,
        optionId: option.optionId ?? index + 1,
      }));
  
      // Determine answered state
      const isAnswered = validatedOptions.some((option) => option.selected);
      this.isAnsweredSubject.next(isAnswered);

      // Validate if all correct answers are selected
      this.areAllCorrectAnswersSelected(validatedOptions, questionIndex)
        .then((allCorrectAnswersSelected) => {
          if (allCorrectAnswersSelected && !this.stopTimerEmitted) {
            console.log('[updateAnsweredState] Stopping timer as all correct answers are selected.');
            this.stopTimer$.next();
            this.stopTimerEmitted = true;
          }
        })
        .catch((error) => {
          console.error('[updateAnsweredState] Error checking correct answers:', error);
        });
    } catch (error) {
      console.error('[updateAnsweredState] Unhandled error:', error);
    }
  }

  private debugSelectedOptionsMap(): void {
    if (this.selectedOptionsMap.size === 0) {
      console.warn('selectedOptionsMap is empty.');
    } else {
      for (const [questionIndex, options] of this.selectedOptionsMap) {
        if (!Array.isArray(options) || options.length === 0) {
          console.warn(`No valid options for questionIndex: ${questionIndex}`);
        } else {
          console.log(`Options for questionIndex ${questionIndex}:`, options);
        }
      }
    }
  }

  areAllCorrectAnswersSelected(questionOptions: Option[], questionIndex: number): Promise<boolean> {
    return new Promise((resolve) => {
      if (!Array.isArray(questionOptions) || questionOptions.length === 0) {
        console.warn('[areAllCorrectAnswersSelected] No options provided for question index:', questionIndex);
        resolve(false);
        return;
      }
  
      // Normalize options to ensure `correct` is defined
      const normalizedOptions = questionOptions.map((option, index) => ({
        ...option,
        correct: !!option.correct,
        optionId: option.optionId ?? index + 1,
      }));
  
      // Extract correct option IDs
      const correctOptionIds = normalizedOptions
        .filter((option) => option.correct)
        .map((option) => option.optionId);
  
      if (correctOptionIds.length === 0) {
        resolve(false);
        return;
      }
  
      // Retrieve selected options for the current question index
      const selectedOptions = this.selectedOptionsMap.get(questionIndex) || [];
      const selectedOptionIds = selectedOptions.map((option) => option.optionId);
      
      if (selectedOptionIds.length === 0) {
        console.info('[areAllCorrectAnswersSelected] No options selected for question index:', questionIndex);
        resolve(false);
        return;
      }
  
      // Validate that all correct options are selected
      const allCorrectSelected = correctOptionIds.every((id) => selectedOptionIds.includes(id));
      resolve(allCorrectSelected);
    });
  }

  public isQuestionAnswered(questionIndex: number): boolean {
    const options = this.selectedOptionsMap.get(questionIndex);
    return Array.isArray(options) && options.length > 0;
  }

  setAnswered(isAnswered: boolean, force = false): void {
    const current = this.isAnsweredSubject.getValue();
    if (force || current !== isAnswered) {
      console.log('[🧪 EMIT CHECK] About to emit answered:', isAnswered);
      this.isAnsweredSubject.next(isAnswered);
      sessionStorage.setItem('isAnswered', JSON.stringify(isAnswered));
    } else {
      // Force re-emit even if value didn't change
      this.isAnsweredSubject.next(isAnswered);
    }
  }
  
  setAnsweredState(isAnswered: boolean): void {
    const current = this.isAnsweredSubject.getValue();
  
    if (current !== isAnswered) {
      this.isAnsweredSubject.next(isAnswered);
    } else {
      console.log('[🟡 setAnsweredState] No change needed (already', current + ')');
    }
  }

  getAnsweredState(): boolean {
    return this.isAnsweredSubject.getValue();
  }

  resetSelectedOption(): void {
    this.isOptionSelectedSubject.next(false);
  }

  resetSelectionState(): void {
    this.selectedOptionsMap.clear();
    this.selectedOption = null;
    this.selectedOptionSubject.next(null);
    this.showFeedbackForOptionSubject.next({});
    this.isOptionSelectedSubject.next(false);  
    console.log('[🧼 Selection state fully reset]');
  }  
  
  private getDefaultOptions(): Option[] {
    const defaultOptions = Array(4)
      .fill(null)
      .map((_, index) => ({
        optionId: index,
        text: `Default Option ${index + 1}`,
        correct: index === 0,  // default to the first option as correct
        selected: false
      }));
    return defaultOptions;
  }

  private getFallbackQuestionIndex(): number {
    const keys = Array.from(this.selectedOptionsMap.keys());
    if (keys.length > 0) {
      console.log('[getFallbackQuestionIndex] Using fallback index from selectedOptionsMap:', keys[0]);
      return keys[0];
    }
  
    console.info('[getFallbackQuestionIndex] No keys found in selectedOptionsMap. Defaulting to 0. This may indicate no options were selected yet.'
    );
    return 0;
  }

  public logCurrentState(): void {
    console.log('[🔍 SelectedOptionService State Snapshot]');
  
    // For single-answer questions
    console.log('selectedOption:', this.selectedOption);
  
    // For multiple-answer questions (if you’re tracking a map)
    if (this.selectedOptionsMap) {
      console.log('selectedOptionsMap:', Array.from(this.selectedOptionsMap.entries()));
    }
  
    // Observables
    this.selectedOptionSubject.pipe(take(1)).subscribe(value => {
      console.log('selectedOptionSubject (latest):', value);
    });
  
    this.showFeedbackForOptionSubject.pipe(take(1)).subscribe(value => {
      console.log('showFeedbackForOptionSubject (latest):', value);
    });
  
    this.isOptionSelectedSubject.pipe(take(1)).subscribe(value => {
      console.log('isOptionSelectedSubject (latest):', value);
    });
  
    // Log any additional custom properties
    // Example:
    // console.log('lastSelectedOption:', this.lastSelectedOption);
    // console.log('answeredMap:', this.answeredMap);
  }

  public wasOptionPreviouslySelected(option: SelectedOption): boolean {
    const qIndex = option.questionIndex;
    const optId = option.optionId;
  
    if (qIndex == null || optId == null) return false;
  
    if (this.currentQuestionType === QuestionType.MultipleAnswer) {
      const options = this.selectedOptionsMap.get(qIndex);
      return options?.some(o => o.optionId === optId) ?? false;
    } else {
      // Ensure selectedOption is not an array before accessing properties
      const singleSelected = this.selectedOption;
      if (singleSelected && !Array.isArray(singleSelected)) {
        return (
          singleSelected.optionId === optId &&
          singleSelected.questionIndex === qIndex
        );
      }
      return false;
    }
  }

  emitImmediateSelection(option: SelectedOption, selectedOptions: SelectedOption[]): void {
    this.immediateSelectionSubject.next({ option, selectedOptions });
  }  
}