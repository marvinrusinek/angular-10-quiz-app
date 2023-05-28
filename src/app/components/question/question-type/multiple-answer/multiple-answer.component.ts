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
import { Observable, of, Subject, Subscription } from 'rxjs';
import { map, switchMap, takeUntil, tap } from 'rxjs/operators';

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
  @Output() selectionChange = new EventEmitter<{
    question: QuizQuestion;
    selectedOption: Option;
  }>();
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

    this.router.events.subscribe((event) => {
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

  onOptionClick(option: Option): void {
    super.onOptionClicked(option);
  }

  /* onOptionClicked(option: Option): void {
    this.isOptionSelected = true;
  
    const index = this.selectedOptions.findIndex((o) => o === option);
    if (index === -1) {
      this.selectedOptions.push(option); // Add the clicked option to the selectedOptions array
      this.selectedOption = option;
      this.optionChecked[option.optionId] = true;
    } else {
      this.selectedOptions.splice(index, 1); // Remove the clicked option from the selectedOptions array
      this.selectedOption = null;
      this.optionChecked[option.optionId] = false;
    }
  
    this.isAnswered = this.selectedOptions.length > 0;
  
    if (this.isAnswered) {
      this.quizService.displayExplanationText(true);
      this.quizService
        .setExplanationText(this.selectedOptions, this.question)
        .subscribe((explanationText: string) => {
          this.explanationTextValue$ = of(explanationText);
          setTimeout(() => {
            this.showFeedback = true;
            this.cdRef.detectChanges();
          });
        });
    } else {
      this.explanationTextValue$ = of('');
      this.showFeedback = false;
    }
  
    console.log('Selected options:', this.selectedOptions);
  
    this.toggleVisibility.emit();
    this.isOptionSelectedChange.emit(this.isOptionSelected);
    this.optionSelected.emit(option);
  
    // Emit updated selection
    this.selectionChanged.emit({
      question: this.currentQuestion,
      selectedOptions: this.selectedOptions
    });
  } */

  /* onOptionClicked(option: Option): void {
    this.isOptionSelected = true;

    const index = this.selectedOptions.findIndex((o) => o === option);
    const isOptionSelected = index !== -1; // Check if the option is already selected

    if (!isOptionSelected) {
      // Option is not selected, proceed with selection
      this.selectedOptions.push(option);
      this.selectedOption = option;
      this.optionChecked[option.optionId] = true;
      this.showFeedback = true; // Set showFeedback to true for the selected option
      this.showFeedbackForOption[option.optionId] = true;
    } else {
      // Option is already selected, remove it from selectedOptions
      this.selectedOptions.splice(index, 1);
      this.selectedOption = null;
      this.optionChecked[option.optionId] = false;

      if (this.selectedOptions.length === 0) {
        this.showFeedback = false; // Set showFeedback to false when no option is selected
      }
    }

    this.isAnswered = this.selectedOptions.length > 0;

    if (this.isAnswered) {
      this.quizService.displayExplanationText(true);
      this.quizService
        .setExplanationText(this.selectedOptions, this.question)
        .subscribe((explanationText: string) => {
          this.explanationTextValue$ = of(explanationText);
          setTimeout(() => {
            this.cdRef.detectChanges();
          });
        });
    } else {
      this.explanationTextValue$ = of('');
    }

    console.log('Selected options:', this.selectedOptions);

    this.toggleVisibility.emit();
    this.isOptionSelectedChange.emit(this.isOptionSelected);
    this.optionSelected.emit(option);

    // Emit updated selection
    this.selectionChanged.emit({
      question: this.currentQuestion,
      selectedOptions: this.selectedOptions,
    });
  } */

  /* onOptionClicked(option: Option): void {
    console.log('Option clicked:', option);
    this.isOptionSelected = true;
  
    const index = this.selectedOptions.findIndex((o) => o === option);
    const isOptionSelected = index !== -1; // Check if the option is already selected
  
    if (!isOptionSelected) {
      // Option is not selected, proceed with selection
      this.selectedOptions.push(option);
      this.selectedOption = option;
      this.optionChecked[option.optionId] = true;
      // this.showFeedback = true; // Set showFeedback to true for the selected option
      this.showFeedbackForOption[option.optionId] = true; // Set showFeedbackForOption to true for the selected option
    } else {
      // Option is already selected, remove it from selectedOptions
      this.selectedOptions.splice(index, 1);
      this.selectedOption = null;
      this.optionChecked[option.optionId] = false;
  
      if (this.selectedOptions.length === 0) {
        this.showFeedback = false; // Set showFeedback to false when no option is selected
      }
  
      delete this.showFeedbackForOption[option.optionId]; // Remove the showFeedbackForOption property for the deselected option
    }
  
    this.isAnswered = this.selectedOptions.length > 0;
  
    if (this.isAnswered) {
      this.quizService.displayExplanationText(true);
      this.quizService
        .setExplanationText(this.selectedOptions, this.question)
        .subscribe((explanationText: string) => {
          this.explanationTextValue$ = of(explanationText);
          setTimeout(() => {
            this.cdRef.detectChanges();
          });
        });
    } else {
      this.explanationTextValue$ = of('');
    }
  
    console.log('Selected options:', this.selectedOptions);
  
    this.toggleVisibility.emit();
    this.isOptionSelectedChange.emit(this.isOptionSelected);
    this.optionSelected.emit(option);
  
    // Emit updated selection
    this.selectionChanged.emit({
      question: this.currentQuestion,
      selectedOptions: this.selectedOptions,
    });
  } */

  /* onOptionClicked(option: Option): void {
    console.log('Option clicked:', option);
    this.isOptionSelected = true;
  
    const isOptionSelected = this.selectedOptions.includes(option);
  
    if (!isOptionSelected) {
      // Option is not selected, proceed with selection
      this.selectedOptions = [option];
      this.selectedOption = option;
      this.optionChecked[option.optionId] = true;
      this.showFeedback = true; // Set showFeedback to true for the selected option
      this.showFeedbackForOption[option.optionId] = true; // Set showFeedbackForOption to true for the selected option
    } else {
      // Option is already selected, remove it from selectedOptions
      this.selectedOptions = this.selectedOptions.filter(
        (selectedOption) => selectedOption !== option
      );
      this.selectedOption = null;
      this.optionChecked[option.optionId] = false;
  
      if (this.selectedOptions.length === 0) {
        this.showFeedback = false; // Set showFeedback to false when no option is selected
      }
  
      delete this.showFeedbackForOption[option.optionId]; // Remove the showFeedbackForOption property for the deselected option
    }
  
    this.isAnswered = this.selectedOptions.length > 0;
  
    if (this.isAnswered) {
      this.quizService.displayExplanationText(true);
      this.quizService
        .setExplanationText(this.selectedOptions, this.question)
        .subscribe((explanationText: string) => {
          this.explanationTextValue$ = of(explanationText);
          setTimeout(() => {
            this.cdRef.detectChanges();
          });
        });
    } else {
      this.explanationTextValue$ = of('');
    }
  
    console.log('Selected options:', this.selectedOptions);
  
    this.toggleVisibility.emit();
    this.isOptionSelectedChange.emit(this.isOptionSelected);
    this.optionSelected.emit(option);
  
    // Emit updated selection
    this.selectionChanged.emit({
      question: this.currentQuestion,
      selectedOptions: this.selectedOptions,
    });
  } */

  /* onOptionClicked(option: Option): void {
    console.log('Option clicked:', option);
    this.isOptionSelected = true;
  
    const isOptionSelected = this.selectedOptions.includes(option);
  
    if (!isOptionSelected) {
      // Option is not selected, proceed with selection
      this.selectedOptions = [option];
      this.selectedOption = option;
      this.optionChecked[option.optionId] = true;
      this.showFeedback = false; // Set showFeedback to false initially
      this.showFeedbackForOption = {}; // Reset showFeedbackForOption object
  
      // Delay the setting of showFeedback to true to allow time for rendering
      setTimeout(() => {
        this.showFeedback = true;
        this.showFeedbackForOption[option.optionId] = true; // Set showFeedbackForOption to true for the selected option
      }, 0);
    } else {
      // Option is already selected, remove it from selectedOptions
      this.selectedOptions = this.selectedOptions.filter(
        (selectedOption) => selectedOption !== option
      );
      this.selectedOption = null;
      this.optionChecked[option.optionId] = false;
  
      if (this.selectedOptions.length === 0) {
        this.showFeedback = false; // Set showFeedback to false when no option is selected
      }
  
      delete this.showFeedbackForOption[option.optionId]; // Remove the showFeedbackForOption property for the deselected option
    }
  
    this.isAnswered = this.selectedOptions.length > 0;
  
    if (this.isAnswered) {
      this.quizService.displayExplanationText(true);
      this.quizService
        .setExplanationText(this.selectedOptions, this.question)
        .subscribe((explanationText: string) => {
          this.explanationTextValue$ = of(explanationText);
          setTimeout(() => {
            this.cdRef.detectChanges();
          });
        });
    } else {
      this.explanationTextValue$ = of('');
    }
  
    console.log('Selected options:', this.selectedOptions);
  
    this.toggleVisibility.emit();
    this.isOptionSelectedChange.emit(this.isOptionSelected);
    this.optionSelected.emit(option);
  
    // Emit updated selection
    this.selectionChanged.emit({
      question: this.currentQuestion,
      selectedOptions: this.selectedOptions,
    });
  } */

  /* onOptionClicked(option: Option): void {
    console.log('Option clicked:', option);
    this.isOptionSelected = true;
  
    const index = this.selectedOptions.findIndex((o) => o === option);
    const isOptionSelected = index !== -1; // Check if the option is already selected
  
    if (!isOptionSelected) {
      // Option is not selected, proceed with selection
      this.selectedOptions.push(option);
      this.selectedOption = option;
      this.optionChecked[option.optionId] = true;
  
      this.showFeedback = true; // Set showFeedback to true for the selected option
    } else {
      // Option is already selected, remove it from selectedOptions
      this.selectedOptions.splice(index, 1);
      this.selectedOption = null;
      this.optionChecked[option.optionId] = false;
  
      if (this.selectedOptions.length === 0) {
        this.showFeedback = false; // Set showFeedback to false when no option is selected
      }
    }
  
    this.isAnswered = this.selectedOptions.length > 0;
  
    if (this.isAnswered) {
      this.quizService.displayExplanationText(true);
      this.quizService
        .setExplanationText(this.selectedOptions, this.question)
        .subscribe((explanationText: string) => {
          this.explanationTextValue$ = of(explanationText);
          setTimeout(() => {
            this.showFeedbackForOption[option.optionId] = true; // Set showFeedbackForOption to true for the selected option
            this.cdRef.detectChanges();
          });
        });
    } else {
      this.explanationTextValue$ = of('');
    }
  
    console.log('Selected options:', this.selectedOptions);
  
    this.toggleVisibility.emit();
    this.isOptionSelectedChange.emit(this.isOptionSelected);
    this.optionSelected.emit(option);
  
    // Emit updated selection
    this.selectionChanged.emit({
      question: this.currentQuestion,
      selectedOptions: this.selectedOptions,
    });
  } */

  /* onOptionClicked(option: Option): void {
    console.log('Option clicked:', option);
    this.isOptionSelected = true;
  
    const index = this.selectedOptions.findIndex((o) => o === option);
    const isOptionSelected = index !== -1; // Check if the option is already selected
  
    if (!isOptionSelected) {
      // Option is not selected, proceed with selection
      this.selectedOptions.push(option);
      this.selectedOption = option;
      this.optionChecked[option.optionId] = true;
  
      this.showFeedbackForOption[option.optionId] = true; // Set showFeedbackForOption to true for the selected option
    } else {
      // Option is already selected, remove it from selectedOptions
      this.selectedOptions.splice(index, 1);
      this.selectedOption = null;
      this.optionChecked[option.optionId] = false;
  
      if (this.selectedOptions.length === 0) {
        this.showFeedback = false; // Set showFeedback to false when no option is selected
      }
    }

    this.isAnswered = this.selectedOptions.length > 0;

    if (this.isAnswered) {
      this.quizService.displayExplanationText(true);
      this.quizService
        .setExplanationText(this.selectedOptions, this.question)
        .subscribe((explanationText: string) => {
          this.explanationTextValue$ = of(explanationText);
          this.cdRef.detectChanges();
        });
    } else {
      this.explanationTextValue$ = of('');
    }

    console.log('Selected options:', this.selectedOptions);

    this.toggleVisibility.emit();
    this.isOptionSelectedChange.emit(this.isOptionSelected);
    this.optionSelected.emit(option);

    // Emit updated selection
    this.selectionChanged.emit({
      question: this.currentQuestion,
      selectedOptions: this.selectedOptions,
    });
  } */

  /* onOptionClicked(option: Option): void {
    console.log('Option clicked:', option);
    this.isOptionSelected = true;
  
    const index = this.selectedOptions.findIndex((o) => o === option);
    const isOptionSelected = index !== -1; // Check if the option is already selected
  
    if (!isOptionSelected) {
      // Option is not selected, proceed with selection
      this.selectedOptions.push(option);
      this.selectedOption = option;
      this.optionChecked[option.optionId] = true;
  
      this.showFeedbackForOption[option.optionId] = true; // Set showFeedbackForOption to true for the selected option
    } else {
      // Option is already selected, remove it from selectedOptions
      this.selectedOptions.splice(index, 1);
      this.selectedOption = null;
      this.optionChecked[option.optionId] = false;
  
      if (this.selectedOptions.length === 0) {
        this.showFeedback = false; // Set showFeedback to false when no option is selected
      }
    }
  
    this.isAnswered = this.selectedOptions.length > 0;
  
    if (this.isAnswered) {
      this.quizService.displayExplanationText(true);
      this.quizService
        .setExplanationText(this.selectedOptions, this.question)
        .subscribe((explanationText: string) => {
          this.explanationTextValue$ = of(explanationText);
          this.showFeedbackForOption[option.optionId] = true; // Set showFeedbackForOption to true for the selected option
          this.cdRef.detectChanges();
        });
    } else {
      this.explanationTextValue$ = of('');
    }
  
    console.log('Selected options:', this.selectedOptions);
  
    this.toggleVisibility.emit();
    this.isOptionSelectedChange.emit(this.isOptionSelected);
    this.optionSelected.emit(option);
  
    // Emit updated selection
    this.selectionChanged.emit({
      question: this.currentQuestion,
      selectedOptions: this.selectedOptions,
    });
  } */
  
  /* onOptionClicked(option: Option): void {
    console.log('Option clicked:', option);
    this.isOptionSelected = true;
    
    const isOptionSelected = this.selectedOptions.includes(option); // Check if the option is already selected
  
    if (!isOptionSelected) {
      // Option is not selected, proceed with selection
      this.selectedOptions = [option];
      this.selectedOption = option;
      this.optionChecked[option.optionId] = true;
  
      this.showFeedbackForOption[option.optionId] = true; // Set showFeedbackForOption to true for the selected option
    } else {
      // Option is already selected, remove it from selectedOptions
      this.selectedOptions = this.selectedOptions.filter((selectedOption) => selectedOption !== option);
      this.selectedOption = null;
      this.optionChecked[option.optionId] = false;
  
      if (this.selectedOptions.length === 0) {
        this.showFeedback = false; // Set showFeedback to false when no option is selected
      }
    }
  
    this.isAnswered = this.selectedOptions.length > 0;
  
    if (this.isAnswered) {
      this.quizService.displayExplanationText(true);
      this.quizService
        .setExplanationText(this.selectedOptions, this.question)
        .subscribe((explanationText: string) => {
          this.explanationTextValue$ = of(explanationText);
          this.showFeedbackForOption[option.optionId] = true; // Set showFeedbackForOption to true for the selected option
          this.cdRef.detectChanges();
        });
    } else {
      this.explanationTextValue$ = of('');
    }
  
    console.log('Selected options:', this.selectedOptions);
  
    this.toggleVisibility.emit();
    this.isOptionSelectedChange.emit(this.isOptionSelected);
    this.optionSelected.emit(option);
  
    // Emit updated selection
    this.selectionChanged.emit({
      question: this.currentQuestion,
      selectedOptions: this.selectedOptions,
    });
  } */

  /* onOptionClicked(option: Option): void {
    console.log('Option clicked:', option);
    this.isOptionSelected = true;
  
    const index = this.selectedOptions.findIndex((o) => o === option);
    const isOptionSelected = index !== -1; // Check if the option is already selected
  
    if (!isOptionSelected) {
      // Option is not selected, proceed with selection
      this.selectedOptions.push(option);
      this.selectedOption = option;
      this.optionChecked[option.optionId] = true;
  
      this.showFeedback = true; // Set showFeedback to true for the selected option
    } else {
      // Option is already selected, remove it from selectedOptions
      this.selectedOptions.splice(index, 1);
      this.selectedOption = null;
      this.optionChecked[option.optionId] = false;
  
      if (this.selectedOptions.length === 0) {
        this.showFeedback = false; // Set showFeedback to false when no option is selected
      }
    }
  
    this.isAnswered = this.selectedOptions.length > 0;
  
    if (this.isAnswered) {
      this.quizService.displayExplanationText(true);
      this.quizService
        .setExplanationText(this.selectedOptions, this.question)
        .subscribe((explanationText: string) => {
          this.explanationTextValue$ = of(explanationText);
          setTimeout(() => {
            this.showFeedbackForOption[option.optionId] = true; // Set showFeedbackForOption to true for the selected option
            this.cdRef.detectChanges();
          });
        });
    } else {
      this.explanationTextValue$ = of('');
    }
  
    console.log('Selected options:', this.selectedOptions);
  
    this.toggleVisibility.emit();
    this.isOptionSelectedChange.emit(this.isOptionSelected);
    this.optionSelected.emit(option);
  
    // Emit updated selection
    this.selectionChanged.emit({
      question: this.currentQuestion,
      selectedOptions: this.selectedOptions,
    });
  } */

  /* onOptionClicked(option: Option): void {
    console.log('Option clicked:', option);
    this.isOptionSelected = true;
  
    const index = this.selectedOptions.findIndex((o) => o === option);
    const isOptionSelected = index !== -1; // Check if the option is already selected
  
    if (!isOptionSelected) {
      // Option is not selected, proceed with selection
      this.selectedOptions.push(option);
      this.selectedOption = option;
      this.optionChecked[option.optionId] = true;
  
      this.showFeedback = true; // Set showFeedback to true for the selected option
    } else {
      // Option is already selected, remove it from selectedOptions
      this.selectedOptions.splice(index, 1);
      this.selectedOption = null;
      this.optionChecked[option.optionId] = false;
  
      if (this.selectedOptions.length === 0) {
        this.showFeedback = false; // Set showFeedback to false when no option is selected
      }
    }
  
    this.isAnswered = this.selectedOptions.length > 0;
  
    if (this.isAnswered) {
      this.quizService.displayExplanationText(true);
      this.quizService
        .setExplanationText(this.selectedOptions, this.question)
        .subscribe((explanationText: string) => {
          this.explanationTextValue$ = of(explanationText);
          setTimeout(() => {
            this.showFeedbackForOption[option.optionId] = true; // Set showFeedbackForOption to true for the selected option
            this.cdRef.detectChanges();
          });
        });
    } else {
      this.explanationTextValue$ = of('');
    }
  
    console.log('Selected options:', this.selectedOptions);
  
    this.toggleVisibility.emit();
    this.isOptionSelectedChange.emit(this.isOptionSelected);
    this.optionSelected.emit(option);
  
    // Emit updated selection
    this.selectionChanged.emit({
      question: this.currentQuestion,
      selectedOptions: this.selectedOptions,
    });
  } */

  /* onOptionClicked(option: Option): void {
    console.log('Option clicked:', option);
    this.isOptionSelected = true;
  
    const index = this.selectedOptions.findIndex((o) => o === option);
    const isOptionSelected = index !== -1; // Check if the option is already selected
  
    if (!isOptionSelected) {
      // Option is not selected, proceed with selection
      this.selectedOptions.push(option);
      this.selectedOption = option;
    } else {
      // Option is already selected, remove it from selectedOptions
      this.selectedOptions.splice(index, 1);
      this.selectedOption = null;
    }
  
    this.isAnswered = this.selectedOptions.length > 0;
    this.showFeedbackForOption[option.optionId] = true; // Set showFeedbackForOption to true for the selected option
  
    if (this.isAnswered) {
      this.quizService.displayExplanationText(true);
      this.explanationTextValue$ = this.quizService
        .setExplanationText(this.selectedOptions, this.question)
        .pipe(
          tap((explanationText: string) => {
            this.showFeedback = true; // Set showFeedback to true when an option is selected
            this.cdRef.detectChanges();
          })
        );
    } else {
      this.explanationTextValue$ = of('');
      this.showFeedback = false; // Set showFeedback to false when no option is selected
    }
  
    console.log('Selected options:', this.selectedOptions);
  
    this.toggleVisibility.emit();
    this.isOptionSelectedChange.emit(this.isOptionSelected);
    this.optionSelected.emit(option);
  
    // Emit updated selection
    this.selectionChanged.emit({
      question: this.currentQuestion,
      selectedOptions: this.selectedOptions,
    });
  } */
  
  /* onOptionSelected(option: Option, event: MatCheckboxChange): void {
    const index = this.selectedOptions.findIndex((o) => o === option);

    if (index === -1) {
      this.selectedOptions.push(option);
      this.optionChecked[option.optionId] = true;
      this.showFeedback = true;
    } else {
      this.selectedOptions.splice(index, 1);
      this.optionChecked[option.optionId] = false;
      this.showFeedback = false;
    }

    this.isAnswered = this.selectedOptions.length > 0;

    if (this.isAnswered) {
      this.quizService.displayExplanationText(true);
      this.quizService
        .setExplanationText(this.selectedOptions, this.question)
        .subscribe((explanationText: string) => {
          this.explanationTextValue$ = of(explanationText);
        });
    } else {
      this.quizService.displayExplanationText(false);
    }

    this.toggleVisibility.emit();
    this.isOptionSelectedChange.emit(this.isOptionSelected);
    this.optionSelected.emit(option);

    // Emit updated selection
    this.selectionChanged.emit({
      question: this.question,
      selectedOptions: this.selectedOptions,
    });
  } */

  /* isSelectedOption(option: Option): boolean {
    return this.selectedOptions.some(
      (selectedOption) => selectedOption.optionId === option.optionId
    );
  } */

  /* isSelectedOption(option: Option): boolean {
    return this.selectedOptions.includes(option);
  } */

  /* isSelectedOption(option: Option): boolean {
    console.log('Checking if option is selected:', option);
    return this.selectedOptions.some(selectedOption => selectedOption === option);
  } */

  /* isSelectedOption(option: Option): boolean {
    console.log('Checking if option is selected:', option);
    return this.selectedOptions.includes(option);
  } */

  /* isSelectedOption(option: Option): boolean {
    return this.selectedOptions.some((selectedOption) => selectedOption.optionId === option.optionId);
  } */

  /* isSelectedOption(option: Option): boolean {
    return this.selectedOption === option;
  } */

  isSelectedOption(option: Option): boolean {
    return this.selectedOptions.includes(option) && this.showFeedbackForOption[option.optionId];
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

  /* onSelectionChange(question: QuizQuestion, event: MatCheckboxChange): void {
    const selectedOption = question.options.find(
      (option) =>
        option.optionId === (event.source as MatCheckbox | MatRadioButton).value
    );

    if (selectedOption) {
      selectedOption.selected = event.checked;
      this.playSound(selectedOption);
      this.selectionChange.emit({ selectedOption, question });
      this.updateSelection(question.options.indexOf(selectedOption));
      this.updateSelectedOption(
        selectedOption,
        question.options.indexOf(selectedOption)
      );
      this.showFeedback = true;
    }
  } */
}
