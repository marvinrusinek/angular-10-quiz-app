import { ChangeDetectionStrategy, Component, Input, Output, EventEmitter, OnChanges, SimpleChanges } from '@angular/core';
import { FormGroup } from '@angular/forms';

@Component({
  selector: 'codelab-question-generic',
  templateUrl: './codelab-question-generic.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class CodelabQuestionGenericComponent implements OnChanges {
  @Input() form: FormGroup;
  @Input() questionType: 'multiple' | 'single';
  @Input() data: any; // Add more specific types as per your requirement
  @Input() options: any[];
  // ... other inputs like questions, options, etc.

  @Output() answer = new EventEmitter<any>();

  ngOnChanges(changes: SimpleChanges) {
    // Implement any logic needed when input properties change
    console.log(changes);
  }

  // Add any additional methods needed for this component
}
