import { Component, Input, Output, EventEmitter } from '@angular/core';
import { Option } from '../../../../shared/models/Option.model';

@Component({
  selector: 'app-shared-option',
  template: `
    <ng-container *ngIf="optionsToDisplay">
      <div
        *ngFor="let option of optionsToDisplay; let idx = index; trackBy: trackByOption"
      >
        <label class="options">
          <ng-container [ngSwitch]="type">
            <mat-checkbox *ngSwitchCase="'multiple'"
              appHighlightOption
              [appHighlightInputType]="'checkbox'"
              [appHighlightReset]="shouldResetBackground"
              [appResetBackground]="shouldResetBackground"
              [shouldResetBackground]="shouldResetBackground"
              [checked]="isSelectedOption(option)"
              (click)="onOptionClicked(option, idx)"
              [isCorrect]="option.correct"
              [disabled]="option.selected"
            >
              <span>{{ idx + 1 }}.  {{ option?.text }}</span>
              <span class="icon"
                appFeedbackIcon
                [option]="option"
                [index]="idx"
                [selectedOption]="selectedOption"
                [showFeedbackForOption]="showFeedbackForOption">
              </span>
            </mat-checkbox>
            <mat-radio-button *ngSwitchCase="'single'"
              appHighlightOption
              [appHighlightInputType]="'radio'"
              [appHighlightReset]="shouldResetBackground"
              [appResetBackground]="shouldResetBackground"
              [shouldResetBackground]="shouldResetBackground"
              [checked]="isSelectedOption(option)"
              (click)="onOptionClicked(option, idx)"
              [isCorrect]="option.correct"
              [disabled]="option.selected"
            >
              <span>{{ idx + 1 }}.  {{ option?.text }}</span>
              <span class="icon"
                appFeedbackIcon
                [option]="option"
                [index]="idx"
                [selectedOption]="selectedOption"
                [showFeedbackForOption]="showFeedbackForOption">
              </span>
            </mat-radio-button>
          </ng-container>
          <codelab-quiz-feedback
            [question]="currentQuestion"
            [selectedOption]="selectedOption"
            [correctMessage]="correctMessage"
            [showFeedback]="showFeedback"
            [options]="data?.options"
          ></codelab-quiz-feedback>
        </label>
      </div>
    </ng-container>
  `
})
export class SharedOptionComponent {
  @Input() optionsToDisplay: Option[] = [];
  @Input() type: 'single' | 'multiple' = 'single';
  @Input() shouldResetBackground: boolean;
  @Input() selectedOption: any;
  @Input() showFeedbackForOption: boolean[];
  @Input() currentQuestion: any;
  @Input() correctMessage: string;
  @Input() showFeedback: boolean;

  @Output() optionClicked = new EventEmitter<{ option: Option, index: number }>();

  isSelectedOption(option: Option): boolean {
    // Implement your logic to check if the option is selected
    return false;
  }

  onOptionClicked(option: Option, index: number): void {
    this.optionClicked.emit({ option, index });
  }

  trackByOption(index: number, item: Option): number {
    return item.optionId;
  }
}
