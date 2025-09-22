import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable, Subject } from 'rxjs';
import { distinctUntilChanged, map, startWith } from 'rxjs/operators';

import { QuestionType } from '../../shared/models/question-type.enum';
import { Option } from '../../shared/models/Option.model';
import { SelectedOption } from '../../shared/models/SelectedOption.model';
import { NextButtonStateService } from '../../shared/services/next-button-state.service';
import { QuizService } from '../../shared/services/quiz.service';

@Injectable({ providedIn: 'root' })
export class SelectedOptionService {
  selectedOption: SelectedOption | SelectedOption[] = null;
  selectedOptionsMap = new Map<number, SelectedOption[]>();
  selectedOptionIndices: { [key: number]: number[] } = {};

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

  stopTimer$ = new Subject<void>();
  stopTimerEmitted = false;

  currentQuestionType: QuestionType | null = null;
  private _lockedByQuestion = new Map<number, Set<string | number>>();

  set isNextButtonEnabled(value: boolean) {
    this.isNextButtonEnabledSubject.next(value);
  }

  get isNextButtonEnabled$(): Observable<boolean> {
    return this.isNextButtonEnabledSubject.asObservable();
  }

  constructor(
    private quizService: QuizService,
    private nextButtonStateService: NextButtonStateService
  ) {}

  // Method to update the selected option state
  public async selectOption(
    optionId: number,
    questionIndex: number,
    text: string,
    isMultiSelect: boolean
  ): Promise<void> {
    if (optionId == null || questionIndex == null || !text) {
      console.error('Invalid data for SelectedOption:', { optionId, questionIndex, text });
      return;
    }

    const canonicalOptionId = this.resolveCanonicalOptionId(questionIndex, optionId);
    if (canonicalOptionId == null) {
      console.error('Unable to determine a canonical optionId for selection', {
        optionId,
        questionIndex,
        text,
      });
      return;
    }

    const newSelection: SelectedOption = {
      optionId: canonicalOptionId,
      questionIndex,
      text,
      selected: true,
      highlight: true,
      showIcon: true
    };

    const currentSelections = this.selectedOptionsMap.get(questionIndex) || [];
    const canonicalCurrent = this.canonicalizeSelectionsForQuestion(
      questionIndex,
      currentSelections
    );
    const filteredSelections = canonicalCurrent.filter(
      s => !(s.optionId === canonicalOptionId && s.questionIndex === questionIndex)
    );
    const updatedSelections = [...filteredSelections, newSelection];
    const committedSelections = this.commitSelections(questionIndex, updatedSelections);

    this.selectedOptionSubject.next(committedSelections);

    if (!isMultiSelect) {
      this.isOptionSelectedSubject.next(true);
      this.setNextButtonEnabled(true);
    } else {
      const selectedOptions = this.selectedOptionsMap.get(questionIndex) || [];

      if (selectedOptions.length === 0) {
        console.warn('[⚠️ No selected options found for multi-select]');
        this.setNextButtonEnabled(false);
        console.log('[⛔ Next Disabled] No options selected for multi-select');
        return;
      }
    
      const allCorrect = await this.areAllCorrectAnswersSelectedSync(questionIndex);
    
      if (allCorrect) {
        this.setNextButtonEnabled(true);
        console.log('[✅ Multi-select → all correct options selected → Next enabled]');
      } else {
        this.setNextButtonEnabled(false);
        console.log('[⛔ Multi-select → waiting for more correct selections]');
      }
    }

    console.info('[🧠 selectOption()] Emitted updated selections:', committedSelections);
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
    const canonicalOptions = this.canonicalizeSelectionsForQuestion(
      questionIndex,
      currentOptions
    );
    const canonicalOption = this.canonicalizeOptionForQuestion(questionIndex, option);

    // Avoid adding the same option twice
    if (!canonicalOptions.some(o => o.optionId === canonicalOption.optionId)) {
      canonicalOptions.push(canonicalOption);
      this.commitSelections(questionIndex, canonicalOptions);
      console.log('Option added:', canonicalOption);
    } else {
      console.log('Option already present:', canonicalOption);
    }
  }

  // Removes an option from the selectedOptionsMap
  removeOption(questionIndex: number, optionId: number): void {
    const canonicalId = this.resolveCanonicalOptionId(questionIndex, optionId);
    if (canonicalId == null) {
      console.warn('[removeOption] Unable to resolve canonical optionId', {
        optionId,
        questionIndex,
      });
      return;
    }

    const currentOptions = this.canonicalizeSelectionsForQuestion(
      questionIndex,
      this.selectedOptionsMap.get(questionIndex) || []
    );
    const updatedOptions = currentOptions.filter(o => o.optionId !== canonicalId);

    if (updatedOptions.length > 0) {
      this.commitSelections(questionIndex, updatedOptions);
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

  setSelectedOption(option: SelectedOption | null, questionIndex?: number): void {
    console.log('[🟢 setSelectedOption called]', {
      optionId: option?.optionId,
      questionIndex: option?.questionIndex
    });

    if (!option) {
      this.selectedOptionsMap.clear();
      this.selectedOptionSubject.next([]);
      this.isOptionSelectedSubject.next(false);
      this.updateAnsweredState();
      return;
    }

    const qIndex = questionIndex ?? option.questionIndex;
    if (qIndex == null) {
      console.error('[setSelectedOption] Missing questionIndex', { option, questionIndex });
      return;
    }
  
    const enriched: SelectedOption = this.canonicalizeOptionForQuestion(
      qIndex,
      {
        ...option,
        questionIndex: qIndex,
        selected: true,
        highlight: true,
        showIcon: true
      }
    );

    const current = this.selectedOptionsMap.get(qIndex) || [];
    const canonicalCurrent = this.canonicalizeSelectionsForQuestion(qIndex, current);
    if (!canonicalCurrent.some(sel => sel.optionId === enriched.optionId)) {
      canonicalCurrent.push(enriched);
    }

    const committed = this.commitSelections(qIndex, canonicalCurrent);

    // Synchronously emit the full updated list
    this.selectedOption = committed;
    this.selectedOptionSubject.next(committed);
    this.isOptionSelectedSubject.next(true);
  }

  setSelectedOptions(options: SelectedOption[]): void {
    const normalizedOptions = Array.isArray(options)
      ? options.filter(Boolean)
      : [];

    if (normalizedOptions.length === 0) {
      this.selectedOption = [];
      this.selectedOptionSubject.next([]);
      this.isOptionSelectedSubject.next(false);
      this.updateAnsweredState([], this.getFallbackQuestionIndex());
      return;
    }

    const groupedSelections = new Map<number, SelectedOption[]>();

    for (const option of normalizedOptions) {
      const qIndex = option?.questionIndex;

      if (qIndex === undefined || qIndex === null) {
        console.warn('[setSelectedOptions] Missing questionIndex on option', option);
        continue;
      }

      const enrichedOption: SelectedOption = this.canonicalizeOptionForQuestion(
        qIndex,
        {
          ...option,
          questionIndex: qIndex,
          selected: true,
          highlight: true,
          showIcon: true
        }
      );

      if (
        enrichedOption?.optionId === undefined ||
        enrichedOption.optionId === null
      ) {
        console.warn('[setSelectedOptions] Unable to resolve canonical optionId', {
          option,
          questionIndex: qIndex
        });
        continue;
      }

      const existing = groupedSelections.get(qIndex) ?? [];
      existing.push(enrichedOption);
      groupedSelections.set(qIndex, existing);
    }

    const combinedSelections: SelectedOption[] = [];

    groupedSelections.forEach((selections, questionIndex) => {
      const committed = this.commitSelections(questionIndex, selections);
      if (committed.length > 0) {
        combinedSelections.push(...committed);
      }
      this.updateAnsweredState(committed, questionIndex);
    });

    if (combinedSelections.length === 0) {
      this.updateAnsweredState([], this.getFallbackQuestionIndex());
    }

    this.selectedOption = combinedSelections;
    this.selectedOptionSubject.next(combinedSelections);
    this.isOptionSelectedSubject.next(combinedSelections.length > 0);
  }

  setSelectionsForQuestion(qIndex: number, selections: SelectedOption[]): void {
    const committed = this.commitSelections(qIndex, selections);
    this.selectedOptionSubject.next(committed);
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
    const canonicalOption = this.canonicalizeOptionForQuestion(
      currentQuestionIndex,
      option
    );

    if (canonicalOption?.optionId === undefined || canonicalOption.optionId === null) {
      console.warn('[handleSingleOption] Unable to resolve canonical optionId', {
        option,
        currentQuestionIndex,
      });
      return;
    }

    // Set the selected option (as an array)
    this.selectedOption = [canonicalOption];
    this.selectedOptionSubject.next([canonicalOption]);

    // Update the selected status
    this.isOptionSelectedSubject.next(true);

    if (isMultiSelect) {
      const existing = this.selectedOptionsMap.get(currentQuestionIndex) || [];
      const canonicalExisting = this.canonicalizeSelectionsForQuestion(
        currentQuestionIndex,
        existing
      );

      if (!canonicalExisting.some(opt => opt.optionId === canonicalOption.optionId)) {
        canonicalExisting.push(canonicalOption);
      }

      this.commitSelections(currentQuestionIndex, canonicalExisting);
    } else {
      this.commitSelections(currentQuestionIndex, [canonicalOption]);
    }

    this.updateSelectedOptions(currentQuestionIndex, canonicalOption.optionId, 'add');
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
    const options = this.canonicalizeSelectionsForQuestion(
      questionIndex,
      this.selectedOptionsMap.get(questionIndex) || []
    );
    const canonicalId = this.resolveCanonicalOptionId(questionIndex, optionIndex);
    const existingOption = options.find(o => o.optionId === canonicalId);

    if (!existingOption) {
      const newOption: SelectedOption = {
        optionId: canonicalId ?? optionIndex,
        questionIndex,  // ensure the questionIndex is set correctly␊
        text: `Option ${optionIndex + 1}`,  // placeholder text, update if needed
        correct: false,  // default to false unless explicitly set elsewhere
        selected: true  // mark as selected since it's being added
      };

      options.push(newOption);  // add the new option␊
      this.commitSelections(questionIndex, options);  // update the map
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

  // Add (and persist) one option for a question
  /* addSelection(option: SelectedOption | number, optionId?: number): void {
    let qIndex: number;
    let optId: number;
    let enrichedOption: SelectedOption | null = null;

    // Determine which overload was called
    if (typeof option === 'number') {
      // Called as addSelection(questionIndex, optionId)
      qIndex = option;
      optId  = optionId!;
    } else {
      // Called as addSelection(option)
      enrichedOption = {
        ...option,
        selected:  true,
        showIcon:  true,
        highlight: true
      };
      qIndex = enrichedOption.questionIndex!;
      optId  = enrichedOption.optionId;
    }

    // Get or initialize the list for this question
    const current = this.selectedOptionsMap.get(qIndex) || [];

    // Skip if already selected
    if (current.some(sel => sel.optionId === optId)) {
      console.log(`[⚠️ Option already selected] Q${qIndex}, Option ${optId}`);
      return;
    }

    // Build the enriched entry
    const entry = enrichedOption
      ? enrichedOption
      : ({
          questionIndex: qIndex,
          optionId:      optId,
          selected:      true,
          showIcon:      true,
          highlight:     true
        } as SelectedOption);

    // Persist the updated list
    const updated = [...current, entry];
    this.selectedOptionsMap.set(qIndex, updated);

    // Broadcast the full, deduplicated list
    this.selectedOption     = updated;
    this.selectedOptionSubject.next(updated);
    this.isOptionSelectedSubject.next(true);

    // Debug the new state
    console.log(`[📦 Q${qIndex} selections]`, updated.map(o => o.optionId));
  } */
  public addSelection(questionIndex: number, option: SelectedOption): void {
    // 1) Get or initialize the list for this question
    const list = this.canonicalizeSelectionsForQuestion(
      questionIndex,
      this.selectedOptionsMap.get(questionIndex) || []
    );
    const canonicalOption = this.canonicalizeOptionForQuestion(questionIndex, option);

    if (canonicalOption?.optionId === undefined || canonicalOption.optionId === null) {
      console.warn('[addSelection] Unable to resolve canonical optionId', {
        option,
        questionIndex,
      });
      return;
    }

    // 2) If this optionId is already in the list, skip
    if (list.some(sel => sel.optionId === canonicalOption.optionId)) {
      console.log(`[⚠️ Already selected] Q${questionIndex}, Option ${canonicalOption.optionId}`);
      return;
    }

    // 3) Enrich the option object with your flags
    const enriched: SelectedOption = {
      ...canonicalOption,
      selected:   true,
      showIcon:   true,
      highlight:  true,
      questionIndex
    };

    // 4) Append and persist
    list.push(enriched);
    const committed = this.commitSelections(questionIndex, list);

    console.log(`[📦 Q${questionIndex} selections]`, committed.map(o => o.optionId));
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

    const prevSelections = this.canonicalizeSelectionsForQuestion(
      numericKey,
      this.selectedOptionsMap.get(numericKey) || []
    );

    const canonicalSelected = this.canonicalizeOptionForQuestion(
      numericKey,
      selectedOption
    );

    if (
      canonicalSelected?.optionId === undefined ||
      canonicalSelected.optionId === null
    ) {
      console.warn('[updateSelectionState] Unable to resolve canonical optionId', {
        questionIndex,
        selectedOption,
      });
      return;
    }

    let updatedSelections: SelectedOption[];

    if (isMultiSelect) {
      const alreadySelected = prevSelections.find(
        (opt) => opt.optionId === canonicalSelected.optionId
      );
      if (!alreadySelected) {
        updatedSelections = [...prevSelections, canonicalSelected];
      } else {
        updatedSelections = prevSelections;
      }
    } else {
      updatedSelections = [canonicalSelected];
    }

    this.commitSelections(numericKey, updatedSelections);
  }

  updateSelectedOptions(questionIndex: number, optionIndex: number, action: 'add' | 'remove'): void {
    const canonicalId = this.resolveCanonicalOptionId(questionIndex, optionIndex);
    if (canonicalId == null) {
      console.warn('[updateSelectedOptions] Unable to resolve canonical optionId', {
        optionIndex,
        questionIndex,
        action,
      });
      return;
    }

    const options = this.canonicalizeSelectionsForQuestion(
      questionIndex,
      this.selectedOptionsMap.get(questionIndex) || []
    );

    const option = options.find(opt => opt.optionId === canonicalId);
    if (!option) {
      console.warn(`[updateSelectedOptions] Option not found for optionIndex: ${optionIndex}`);
      return;
    }

    if (action === 'add') {
      if (!options.some(opt => opt.optionId === canonicalId)) {
        options.push(option);
      }
      option.selected = true;
    } else if (action === 'remove') {
      const idx = options.findIndex(opt => opt.optionId === canonicalId);
      if (idx !== -1) options.splice(idx, 1);
    }

    const committed = this.commitSelections(questionIndex, options);

    if (committed && committed.length > 0) {
      this.updateAnsweredState(committed, questionIndex);
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
        correct: this.coerceToBoolean(option.correct),
        selected: this.coerceToBoolean(option.selected),
        optionId: option.optionId ?? index + 1
      }));

      // Determine answered state
      const isAnswered = validatedOptions.some(option => option.selected);
      this.isAnsweredSubject.next(isAnswered);

      // Validate if all correct answers are selected
      const allCorrectAnswersSelected = this.areAllCorrectAnswersSelectedSync(questionIndex);
      if (allCorrectAnswersSelected && !this.stopTimerEmitted) {
        console.log('[updateAnsweredState] Stopping timer as all correct answers are selected.');
        this.stopTimer$.next();
        this.stopTimerEmitted = true;
      }
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

  private coerceToBoolean(value: unknown): boolean {
    if (typeof value === 'boolean') {
      return value;
    }

    if (typeof value === 'string') {
      const normalized = value.trim().toLowerCase();
      if (normalized === 'true') {
        return true;
      }

      if (normalized === 'false' || normalized.length === 0) {
        return false;
      }
    }

    if (typeof value === 'number') {
      return value !== 0;
    }

    return false;
  }

  private normalizeOptionId(id: unknown): string | null {
    if (typeof id === 'number') {
      return Number.isFinite(id) ? String(id) : null;
    }

    if (typeof id === 'string') {
      const trimmed = id.trim();
      return trimmed.length > 0 ? trimmed : null;
    }

    return null;
  }

  private resolveCanonicalOptionId(
    questionIndex: number,
    rawId: unknown,
    fallbackIndex?: number
  ): number | null {
    if (rawId === undefined || rawId === null) {
      return typeof fallbackIndex === 'number' ? fallbackIndex : null;
    }

    const question = this.quizService.questions?.[questionIndex];
    const options = Array.isArray(question?.options) ? question.options : [];

    const numericId = this.extractNumericId(rawId);

    const fallbackInBounds =
      typeof fallbackIndex === 'number' &&
      fallbackIndex >= 0 &&
      fallbackIndex < options.length;

    if (numericId === null || !Number.isInteger(numericId)) {
      return fallbackInBounds ? fallbackIndex! : null;
    }

    // 1) If the provided numeric id is already a zero-based index for this question,
    //    respect it so we don't misidentify incorrect selections as correct ones.
    if (numericId >= 0 && numericId < options.length && fallbackIndex === undefined) {
      return numericId;
    }

    // 2) When we have a fallback index (e.g. when iterating over the question's
    //    option metadata), prefer it if the option at that index matches the id.
    if (fallbackInBounds) {
      const fallbackOption = options[fallbackIndex!];
      const fallbackOptionId = this.extractNumericId(fallbackOption?.optionId);
      if (fallbackOptionId === numericId) {
        return fallbackIndex!;
      }
    }

    // 3) Otherwise try to resolve the numeric id to a concrete option index.
    if (numericId >= 0 && numericId < options.length) {
      return numericId;
    }

    const matchByMetadata = options.findIndex(opt => {
      const candidateId = this.extractNumericId(opt?.optionId);
      return candidateId === numericId;
    });

    if (matchByMetadata >= 0) {
      return matchByMetadata;
    }

    const zeroBasedCandidate = numericId - 1;
    if (zeroBasedCandidate >= 0 && zeroBasedCandidate < options.length) {
      return zeroBasedCandidate;
    }

    return fallbackInBounds ? fallbackIndex! : null;
  }

  private extractNumericId(id: unknown): number | null {
    if (typeof id === 'number' && Number.isFinite(id)) {
      return id;
    }

    if (typeof id === 'string') {
      const parsed = Number(id);
      return Number.isFinite(parsed) ? parsed : null;
    }

    return null;
  }

  private canonicalizeOptionForQuestion(
    questionIndex: number,
    option: SelectedOption,
    fallbackIndex?: number
  ): SelectedOption {
    if (!option) {
      return option;
    }

    const canonicalId = this.resolveCanonicalOptionId(
      questionIndex,
      option.optionId,
      fallbackIndex
    );

    if (canonicalId === null || canonicalId === option.optionId) {
      return option;
    }

    return {
      ...option,
      optionId: canonicalId,
    };
  }

  private canonicalizeSelectionsForQuestion(
    questionIndex: number,
    selections: SelectedOption[]
  ): SelectedOption[] {
    const canonical: SelectedOption[] = [];
    const seen = new Set<number>();

    for (const selection of selections ?? []) {
      if (!selection) {
        continue;
      }

      const canonicalSelection = this.canonicalizeOptionForQuestion(
        questionIndex,
        selection
      );

      if (
        canonicalSelection?.optionId === undefined ||
        canonicalSelection.optionId === null
      ) {
        continue;
      }

      const id = canonicalSelection.optionId;
      if (seen.has(id)) {
        continue;
      }
      seen.add(id);
      canonical.push(canonicalSelection);
    }

    return canonical;
  }

  private commitSelections(
    questionIndex: number,
    selections: SelectedOption[]
  ): SelectedOption[] {
    const canonicalSelections = this.canonicalizeSelectionsForQuestion(
      questionIndex,
      selections
    );

    if (canonicalSelections.length > 0) {
      this.selectedOptionsMap.set(questionIndex, canonicalSelections);
    } else {
      this.selectedOptionsMap.delete(questionIndex);
    }

    return canonicalSelections;
  }

  // Prefer the caller-provided snapshot (already overlaid) and ignore wrongs.
  public areAllCorrectAnswersSelectedSync(
    questionIndex: number,
    optionsSnapshot?: Option[]
  ): boolean {
    const canonical = this.quizService.questions?.[questionIndex]?.options ?? [];
  
    // Prefer caller snapshot (ideally: overlaySelectedByIdentity(canonical, ui))
    const src: Option[] =
      Array.isArray(optionsSnapshot) && optionsSnapshot.length > 0
        ? optionsSnapshot
        : canonical;
  
    if (!Array.isArray(src) || src.length === 0) return false;
  
    // ── FAST PATH: evaluate from src; ignore wrong selections ──
    let totalCorrect = 0;
    let selectedCorrect = 0;
    for (const o of src) {
      const isCorrect = this.coerceToBoolean(o?.correct);
      if (isCorrect) {
        totalCorrect++;
        if (this.coerceToBoolean(o?.selected)) selectedCorrect++;
      }
    }
    if (totalCorrect > 0 && selectedCorrect === totalCorrect) {
      return true; // ✅ all correct selected (wrongs don't matter)
    }
  
    // ── FALLBACK 1: use canonical selected flags if snapshot lacked .correct ──
    // (works when UI mutates the same objects or you've mirrored .selected into canonical)
    let fallbackTotal = 0;
    const selectedCorrectIdx = new Set<number>();
    for (let i = 0; i < canonical.length; i++) {
      const o = canonical[i];
      if (this.coerceToBoolean(o?.correct)) {
        fallbackTotal++;
        if (this.coerceToBoolean(o?.selected)) selectedCorrectIdx.add(i);
      }
    }
    if (fallbackTotal > 0 && selectedCorrectIdx.size === fallbackTotal) {
      return true;
    }
  
    // ── Fallback 2: last resort — derive selection from your canonicalized map ──
    const selections = this.canonicalizeSelectionsForQuestion(
      questionIndex,
      this.selectedOptionsMap.get(questionIndex) || []
    );
    if (selections.length === 0) return false;
  
    const correctIdx: number[] = [];
    for (let i = 0; i < canonical.length; i++) {
      if (this.coerceToBoolean(canonical[i]?.correct)) correctIdx.push(i);
    }
    if (correctIdx.length === 0) return false;
  
    // Mark only CORRECT selections (ignore wrong/unresolved)
    selectedCorrectIdx.clear();
    for (const sel of selections) {
      const idx = this.resolveOptionIndexFromSelection(canonical, sel);
      if (idx == null) continue;
      if (this.coerceToBoolean(canonical[idx]?.correct)) {
        selectedCorrectIdx.add(idx);
      }
    }
  
    return correctIdx.every(i => selectedCorrectIdx.has(i));
  }

  private collectSelectedOptionIndexes(
    questionIndex: number,
    options: Option[]
  ): Set<number> | null {
    const indexes = new Set<number>();
    const mapSelections = this.selectedOptionsMap.get(questionIndex) ?? [];

    for (const selection of mapSelections) {
      if (!selection) {
        continue;
      }

      if (
        selection.selected !== undefined &&
        !this.coerceToBoolean(selection.selected)
      ) {
        continue;
      }

      const resolvedIndex = this.resolveOptionIndexFromSelection(
        options,
        selection
      );

      if (resolvedIndex === null) {
        console.warn('[collectSelectedOptionIndexes] Unable to resolve index for selection.', selection);
        return null;
      }

      indexes.add(resolvedIndex);
    }

    options.forEach((option, idx) => {
      if (this.coerceToBoolean(option?.selected)) {
        indexes.add(idx);
      }
    });

    return indexes;
  }

  private resolveOptionIndexFromSelection(
    options: Option[],
    selection: SelectedOption | Option | null | undefined
  ): number | null {
    if (!selection) {
      return null;
    }

    const indexFromId = this.resolveOptionIndexFromId(
      options,
      (selection as SelectedOption)?.optionId
    );
    if (indexFromId !== null) {
      return indexFromId;
    }

    const text = (selection as Option)?.text;
    if (typeof text === 'string' && text.trim().length > 0) {
      const normalizedText = text.trim().toLowerCase();
      const match = options.findIndex(opt =>
        (opt?.text ?? '').trim().toLowerCase() === normalizedText
      );

      if (match >= 0) {
        return match;
      }
    }

    return null;
  }

  private resolveOptionIndexFromId(
    options: Option[],
    candidateId: unknown
  ): number | null {
    if (!Array.isArray(options) || options.length === 0) {
      return null;
    }

    const normalizedTarget = this.normalizeOptionId(candidateId);
    if (normalizedTarget !== null) {
      const metadataMatch = options.findIndex(
        opt => this.normalizeOptionId(opt?.optionId) === normalizedTarget
      );

      if (metadataMatch >= 0) {
        return metadataMatch;
      }
    }

    const numericId = this.extractNumericId(candidateId);
    if (numericId !== null) {
      if (numericId >= 0 && numericId < options.length) {
        return numericId;
      }

      const zeroBased = numericId - 1;
      if (zeroBased >= 0 && zeroBased < options.length) {
        return zeroBased;
      }
    }

    return null;
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

  public evaluateNextButtonStateForQuestion(
    questionIndex: number,
    isMultiSelect: boolean
  ): void {
    // Defer to ensure setSelectedOption has updated the map this tick
    queueMicrotask(() => {
      const selected = this.selectedOptionsMap.get(questionIndex) ?? [];

      if (!isMultiSelect) {
        // Single → deterministic on first selection
        this.setAnswered(true);  // stream sees answered=true
        this.isOptionSelectedSubject.next(true);
        this.nextButtonStateService.setNextButtonState(true);
        console.log('[🔓 Next Enabled] Single → first selection');
        return;
      }

      // Multi → enable on ANY selection (your policy)
      const anySelected = selected.length > 0;

      // Tell the stream it's answered so it won’t re-disable the button
      this.setAnswered(anySelected);

      this.isOptionSelectedSubject.next(anySelected);
      this.nextButtonStateService.setNextButtonState(anySelected);

      console.log(
        anySelected
          ? '[✅ Multi] at least one selected → Next enabled'
          : '[⛔ Multi] none selected → Next disabled'
      );
    });
  }

  isOptionLocked(qIndex: number, optId: string | number): boolean {
    return this._lockedByQuestion.get(qIndex)?.has(optId) ?? false;
  }

  lockOption(qIndex: number, optId: string | number): void {
    let set = this._lockedByQuestion.get(qIndex);
    if (!set) {
      set = new Set<string | number>();
      this._lockedByQuestion.set(qIndex, set);
    }
    set.add(optId);
  }

  lockMany(qIndex: number, optIds: (string | number)[]): void {
    let set = this._lockedByQuestion.get(qIndex);
    if (!set) {
      set = new Set<string | number>();
      this._lockedByQuestion.set(qIndex, set);
    }
    optIds.forEach(id => set!.add(id));
  }

  resetLocksForQuestion(qIndex: number): void {
    this._lockedByQuestion.delete(qIndex);
  }

  private normKey(x: unknown): string {
    if (x == null) return '';
    return String(x).trim().toLowerCase().replace(/\s+/g, ' ');
  }

  /**
   * Overlay the UI's `selected` flags onto the canonical options using a stable identity:
   * prefer optionId, then id, then value, then text. Index is NEVER used.
   */
  public overlaySelectedByIdentity(canonical: Option[], ui: Option[]): Option[] {
    if (!Array.isArray(canonical) || canonical.length === 0) return [];
    const out = canonical.map(o => ({ ...o, selected: false })); // reset, then overlay

    // Build identity map from canonical
    const idxByKey = new Map<string, number>();
    for (let i = 0; i < canonical.length; i++) {
      const o = canonical[i] as any;
      const key = this.normKey(o.optionId ?? o.id ?? o.value ?? o.text ?? i);
      if (key) idxByKey.set(key, i);
    }

    // Apply UI selections by identity
    for (const u of ui ?? []) {
      const uu = u as any;
      const key = this.normKey(uu.optionId ?? uu.id ?? uu.value ?? uu.text);
      const idx = key ? idxByKey.get(key) : undefined;
      if (idx !== undefined) out[idx].selected = !!uu.selected;
    }

    return out;
  }
}