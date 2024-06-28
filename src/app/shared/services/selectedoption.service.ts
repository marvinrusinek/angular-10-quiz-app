import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';

import { Option } from '../../shared/models/Option.model';
import { SelectedOption } from '../../shared/models/SelectedOption.model';
import { QuizService } from '../../shared/services/quiz.service';

@Injectable({ providedIn: 'root' })
export class SelectedOptionService {
  private selectedOption: Option;
  selectedOptionsMap: Map<number, SelectedOption[]> = new Map();
  private selectedOptionIndices: { [key: number]: number[] } = {};

  private selectedOptionExplanationSource = new BehaviorSubject<string>(null);
  selectedOptionExplanation$ = this.selectedOptionExplanationSource.asObservable();

  private isOptionSelectedSubject: BehaviorSubject<boolean> = new BehaviorSubject<boolean>(false);

  private isAnsweredSubject = new BehaviorSubject<boolean>(false);

  constructor(private quizService: QuizService) {}

  setSelectedOption(option: Option): void {
    this.selectedOption = option;
    console.log('Selected option set:', this.selectedOption);
    this.updateAnsweredState();
  }

  getSelectedOption(): Option {
    return this.selectedOption;
  }

  isSelectedOption(option: Option): boolean {
    const isSelected = this.selectedOption === option;
    console.log('Is selected option:', isSelected);
    return isSelected;
  }

  clearSelectedOption(): void {
    this.selectedOption = null;
    console.log('Selected option cleared');
    this.resetAnsweredState();
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

      // Sync with selectedOptionsMap
      this.syncSelectedOptionsMap(questionIndex, optionIndex, 'add');
    }
  }

  removeSelectedOptionIndex(questionIndex: number, optionIndex: number): void {
    if (this.selectedOptionIndices[questionIndex]) {
      const optionPos = this.selectedOptionIndices[questionIndex].indexOf(optionIndex);
      if (optionPos > -1) {
        this.selectedOptionIndices[questionIndex].splice(optionPos, 1);
        this.updateAnsweredState();

        // Sync with selectedOptionsMap
        this.syncSelectedOptionsMap(questionIndex, optionIndex, 'remove');
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
    quizId: string,
    questionIndex: number,
    selectedOptionId: number
  ): void {
    const quiz = this.quizService.quizData.find((q) => q.quizId.trim() === quizId.trim());
    if (!quiz) {
      console.error('Quiz data is not initialized.');
      return;
    }
  
    const question = quiz.questions[questionIndex];
    if (question) {
      // Find the Option object that matches the selectedOptionId
      const option = question.options.find(
        (option) => option.optionId === selectedOptionId
      );
  
      if (option) {
        const selectedOption: SelectedOption = {
          ...option,
          questionIndex: questionIndex
        };
  
        // Use selectedOptionsMap to track the selected option
        if (!this.selectedOptionsMap.has(questionIndex)) {
          this.selectedOptionsMap.set(questionIndex, []);
        }
  
        const options = this.selectedOptionsMap.get(questionIndex);
        const existingOptionIndex = options.findIndex(
          (opt) => opt.optionId === selectedOption.optionId
        );
  
        if (existingOptionIndex > -1) {
          options[existingOptionIndex] = selectedOption;
        } else {
          options.push(selectedOption);
        }
  
        this.selectedOptionsMap.set(questionIndex, options);
        this.updateAnsweredState();
      } else {
        console.error(
          'Selected option ID does not match any option in the question.'
        );
      }
    }
  }
  
  syncSelectedOptionsMap(
    questionIndex: number,
    optionIndex: number,
    action: 'add' | 'remove'
  ): void {
    const quiz = this.quizService.quizData.find(q => q.quizId.trim() === this.quizService.quizId.trim());
    if (!quiz) {
      console.error('Quiz data is not initialized.');
      return;
    }

    const question = quiz.questions[questionIndex];
    if (!question) {
      console.error(`Question data is not found at index ${questionIndex}.`);
      return;
    }

    const option = question.options[optionIndex]; // Use optionIndex to get the option
    if (!option) {
      console.error(`Option data is not found for optionIndex ${optionIndex}. Available options:`, question.options);
      return;
    }

    console.log('Selected option:', option);

    if (!this.selectedOptionsMap.has(questionIndex)) {
      this.selectedOptionsMap.set(questionIndex, []);
    }

    const options = this.selectedOptionsMap.get(questionIndex);
    const existingOptionIndex = options.findIndex(opt => opt === option);

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
    console.log('Updating answered state:', hasSelectedOptions);
    if (hasSelectedOptions) {
      this.setAnsweredState(true);
    } else {
      this.setAnsweredState(false);
    }
  }

  // Method to update the isAnswered state
  setAnsweredState(isAnswered: boolean): void {
    this.isAnsweredSubject.next(isAnswered);
  }

  // Expose the isAnswered observable
  get isAnswered$(): Observable<boolean> {
    return this.isAnsweredSubject.asObservable();
  }

  resetAnsweredState(): void {
    this.isAnsweredSubject.next(false);
  }
}
