import {
  AfterViewInit,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  EventEmitter,
  Input,
  OnChanges,
  OnDestroy,
  OnInit,
  Output,
  SimpleChanges,
  ViewEncapsulation,
} from '@angular/core';
import { ActivatedRoute, NavigationEnd, Router } from '@angular/router';
import { FormBuilder, FormGroup } from '@angular/forms';
import { MatCheckbox, MatCheckboxChange } from '@angular/material/checkbox';
import { MatRadioButton, MatRadioChange } from '@angular/material/radio';
import { Observable, of, Subject, Subscription } from 'rxjs';
import { map, takeUntil } from 'rxjs/operators';

import { QuizQuestionComponent } from '../../question.component';
import { Option } from '../../../../shared/models/Option.model';
import { QuizQuestion } from '../../../../shared/models/QuizQuestion.model';
import { QuizService } from '../../../../shared/services/quiz.service';
import { QuizDataService } from '../../../../shared/services/quizdata.service';
import { QuizStateService } from '../../../../shared/services/quizstate.service';
import { TimerService } from '../../../../shared/services/timer.service';

@Component({
  selector: 'codelab-question-multiple-answer',
  templateUrl: './multiple-answer.component.html',
  styleUrls: [
    './multiple-answer.component.scss',
    '../../question.component.scss',
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.ShadowDom,
})
export class MultipleAnswerComponent
  extends QuizQuestionComponent
  implements AfterViewInit, OnInit, OnChanges, OnDestroy
{
  @Output() formReady = new EventEmitter<FormGroup>();
  @Output() optionSelected = new EventEmitter<Option>();
  @Output() selectionChange = new EventEmitter<{ question: QuizQuestion, selectedOption: Option }>();
  @Output() answer = new EventEmitter<number>();
  @Input() question!: QuizQuestion;
  // @Input() currentQuestion: QuizQuestion;
  @Input() currentQuestionIndex!: number;
  @Input() options: Option[];
  @Input() correctMessage: string;
  @Input() correctAnswers: number[];
  form: FormGroup;
  currentQuestion$: Observable<QuizQuestion>;
  currentOptionsSubscription: Subscription;
  selectedOptions: Option[] = [];
  optionChecked: { [optionId: number]: boolean } = {};
  options$: Observable<Option[]>;
  isMultiple: boolean = true;
  showExplanation: boolean = false;
  showFeedback: boolean = false;
  private destroyed$ = new Subject<void>();

  constructor(
    quizService: QuizService,
    quizDataService: QuizDataService,
    quizStateService: QuizStateService,
    timerService: TimerService,
    activatedRoute: ActivatedRoute,
    fb: FormBuilder,
    cdRef: ChangeDetectorRef,
    router: Router
  ) {
    super(
      quizService,
      quizDataService,
      quizStateService,
      timerService,
      activatedRoute,
      fb,
      cdRef, 
      router
    );
    this.quizService = quizService;
    this.quizDataService = quizDataService;
    this.quizStateService = quizStateService;

    this.selectedOptions = [];
  }

  async ngOnInit(): Promise<void> {
    super.ngOnInit();

    this.router.events.subscribe(event => {
      if (event instanceof NavigationEnd) {
        console.log('MultipleAnswerComponent destroyed');
      }
    });

    if (this.currentQuestion && !this.currentQuestion.selectedOptions) {
      this.currentQuestion.selectedOptions = [];
    }
    if (this.currentQuestion && this.currentQuestion.options) {
      this.options = this.currentQuestion?.options;
      this.quizService.getCorrectAnswers(this.currentQuestion);
    }

    this.currentOptionsSubscription = this.quizStateService
      .getCurrentQuestion()
      .pipe(
        map((question: QuizQuestion) => question?.options),
        takeUntil(this.destroyed$)
      )
      .subscribe((options) => {
        console.log('options:', options);
      });
  }

  ngAfterViewInit(): void {
    this.initializeOptionChecked();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes.question) {
      this.options = this.question?.options;
    }
    if (
      changes.selectedOptions &&
      !changes.selectedOptions.firstChange &&
      changes.selectedOptions.currentValue
    ) {
      const selectedOptions = changes.selectedOptions.currentValue;
      this.options.forEach((option: Option) => {
        option.selected = selectedOptions.includes(option.value);
      });
    }
  }

  ngOnDestroy(): void {
    this.currentOptionsSubscription?.unsubscribe();
    this.destroyed$.next();
    this.destroyed$.complete();
  }

  /* onOptionSelected(option: Option): void {
    const index = this.selectedOptions.findIndex((o) => o === option);
  
    if (index === -1) {
      this.selectedOptions = [option]; // Assign a new array with the selected option
      this.selectedOption = option; // Update selectedOption with the selected option
    } else {
      this.selectedOptions.splice(index, 1);
      if (this.selectedOptions.length === 0) {
        this.selectedOption = null; // Reset selectedOption if no options are selected
      }
    }
  } */

  /* onOptionSelected(option: Option): void {
    const index = this.selectedOptions.findIndex((o) => o === option);
  
    if (index === -1) {
      this.selectedOptions = [option]; // Assign a new array with the selected option
      this.selectedOption = option; // Update selectedOption with the selected option
    } else {
      this.selectedOptions.splice(index, 1);
      if (this.selectedOptions.length === 0) {
        this.selectedOption = null; // Reset selectedOption if no options are selected
      } else {
        this.selectedOption = this.selectedOptions[0]; // Update selectedOption with the first selected option
      }
    }
  } */
  
  /* onOptionSelected(option: Option): void {
    const index = this.selectedOptions.findIndex((o) => o === option);
  
    if (index === -1) {
      this.selectedOptions = [option]; // Assign a new array with the selected option
      this.selectedOption = option; // Update selectedOption with the selected option
    } else {
      this.selectedOptions.splice(index, 1);
      if (this.selectedOptions.length === 0) {
        this.selectedOption = null; // Reset selectedOption if no options are selected
      } else {
        this.selectedOption = this.selectedOptions[this.selectedOptions.length - 1]; // Update selectedOption with the last selected option
      }
    }
  } */

  /* onOptionSelected(option: Option): void {
    const index = this.selectedOptions.findIndex((o) => o === option);
  
    if (index === -1) {
      this.selectedOptions = [option]; // Assign a new array with the selected option
      this.selectedOption = option; // Update selectedOption with the selected option
    } else {
      this.selectedOptions.splice(index, 1);
      if (this.selectedOptions.length === 0) {
        this.selectedOption = null; // Reset selectedOption if no options are selected
      } else {
        this.selectedOption = this.selectedOptions[this.selectedOptions.length - 1]; // Update selectedOption with the last selected option
      }
    }
  } */

  /* (option: Option): void {
    const index = this.selectedOptions.findIndex((o) => o === option);
  
    if (index === -1) {
      this.selectedOptions = [option]; // Assign a new array with the selected option
      this.selectedOption = option; // Update selectedOption with the selected option
    } else {
      this.selectedOptions.splice(index, 1);
      if (this.selectedOptions.length === 0) {
        this.selectedOption = null; // Reset selectedOption if no options are selected
      } else {
        this.selectedOption = this.selectedOptions[this.selectedOptions.length - 1]; // Update selectedOption with the last selected option
      }
    }
  
    // Emit the updated selection
    this.selectionChange.emit({
      question: this.question,
      selectedOption: this.selectedOption
    });
  } */
  
  onOptionSelected(option: Option): void {
    const index = this.selectedOptions.findIndex((o) => o === option);
  
    if (index === -1) {
      this.selectedOptions.push(option);
    } else {
      this.selectedOptions.splice(index, 1);
    }
    this.isAnswered = this.selectedOptions.length > 0;
  
    if (this.isAnswered) {
      this.quizService.displayExplanationText(true);
      this.quizService.setExplanationText(this.selectedOptions, this.question).subscribe(
        (explanationText: string) => {
          this.explanationTextValue$ = of(explanationText);
        }
      );
    } else {
      this.quizService.displayExplanationText(false);
    }
  
    this.toggleVisibility.emit();
    this.isOptionSelectedChange.emit(this.isAnswered);
    this.optionSelected.emit(option);
  
    // Emit updated selection
    this.selectionChanged.emit({
      question: this.question,
      selectedOptions: this.selectedOptions
    });
  }
      
  isSelectedOption(option: Option): boolean {
    return this.selectedOptions.includes(option);
  }

  initializeOptionChecked(): void {
    if (this.options && this.options.length && this.currentQuestion) {
      this.options.forEach((option) => {
        this.optionChecked[option.optionId] =
          this.currentQuestion.selectedOptions &&
          this.currentQuestion.selectedOptions.some(
            (selectedOption) => selectedOption.optionId === option.optionId
          );
      });
    }
  }

  getOptionClass(option: Option): string {
    const selectedOptions = this.selectedOptions ?? [];
    const selectedOption = (this.currentQuestion?.selectedOptions || [])[0];

    if (
      Array.isArray(selectedOptions) &&
      selectedOptions.includes(option) &&
      option.correct
    ) {
      return 'correct';
    } else if (
      Array.isArray(selectedOptions) &&
      selectedOptions.includes(option) &&
      !option.correct
    ) {
      return 'incorrect';
    } else if (
      this.currentQuestion &&
      Array.isArray(this.currentQuestion.selectedOptions) &&
      this.currentQuestion.selectedOptions.includes(option)
    ) {
      return 'selected';
    } else {
      return '';
    }
  }

  onSelectionChange(question: QuizQuestion, event: MatCheckboxChange): void {
    const selectedOption = question.options.find(option => option.optionId === (event.source as MatCheckbox | MatRadioButton).value);
  
    if (selectedOption) {
      selectedOption.selected = event.checked;
      this.playSound(selectedOption);
      this.selectionChange.emit({ selectedOption, question });
      this.updateSelection(question.options.indexOf(selectedOption));
      this.updateSelectedOption(selectedOption, question.options.indexOf(selectedOption));
      this.showFeedback = true;
    }
  }  

  /* onSelectionChange(question: QuizQuestion, event: MatCheckboxChange | MatRadioChange): void {
    const selectedOption = question.options.find(option => option.optionId === (event.source as MatCheckbox | MatRadioButton).value);
  
    if (selectedOption) {
      selectedOption.selected = (event.source as MatCheckbox | MatRadioButton).checked;
      console.log('Selection changed: ', event);
      this.playSound(selectedOption);
      this.selectionChange.emit({selectedOption: selectedOption, question: question});
      this.updateSelection(question.options.indexOf(selectedOption));
    }
  } */

  /* onSelectionChange(option: Option): void {
    this.optionChecked[option.optionId] = !this.optionChecked[option.optionId];
    this.answer.emit(this.selectedOptions);
  } */

  /* onSelectionChange(question: QuizQuestion, selectedOptions: Option[]): void {
    super.onSelectionChange(question, selectedOptions);

    if (!question.selectedOptions) {
      question.selectedOptions = [];
    }

    if (selectedOptions && selectedOptions.length) {
      selectedOptions.forEach((selectedOption: Option) => {
        if (Array.isArray(this.selectedOptions)) {
          const index =
            question.selectedOptions &&
            question.options &&
            question.selectedOptions.findIndex((o) => {
              return typeof o === 'string'
                ? false
                : o.value === selectedOption.value;
            });
          if (index >= 0) {
            question.selectedOptions.splice(index, 1);
          } else {
            question.selectedOptions.push(selectedOption);
          }
        }
      });

      const selectedOptionIds = question.selectedOptions.map((o) => {
        const selectedOption = question.options.find(
          (option) => option.value === o.value
        );
        return selectedOption ? selectedOption.value : null;
      });

      if (selectedOptionIds.sort().join(',') === (question.answer && question.answer.map((a) => a.value).sort().join(','))) {
        this.incrementScore();
      } else {
        this.explanationText = 'Sorry, that is not correct.';
      }
      
      selectedOptions.forEach((selectedOption) => {
        this.optionChecked[selectedOption.optionId] =
          !this.optionChecked[selectedOption.optionId];
      });

      this.selectedOptions = selectedOptions;
      this.selectionChanged.emit({
        question: this.currentQuestion,
        selectedOptions: this.selectedOptions,
      });
    }
  } */
}
