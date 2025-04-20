import { Injectable, NgZone } from '@angular/core';
import { BehaviorSubject, combineLatest, Observable } from 'rxjs';
import { distinctUntilChanged, map, shareReplay } from 'rxjs/operators';

import { QuizStateService } from '../../shared/services/quizstate.service';
import { SelectedOptionService } from '../../shared/services/selectedoption.service';

@Injectable({ providedIn: 'root' })
export class NextButtonStateService {
  private isButtonEnabledSubject = new BehaviorSubject<boolean>(false);
  public isButtonEnabled$: Observable<boolean> = this.isButtonEnabledSubject.asObservable();
  isNextButtonEnabled = false;

  public nextButtonTooltip$ = this.isButtonEnabled$.pipe(
    map((enabled) => (enabled ? 'Next' : 'Please select an option to continue...')),
    distinctUntilChanged()
  );

  public nextButtonStyle: { [key: string]: string } = {
    opacity: '0.5',
    'pointer-events': 'none'
  };

  constructor(
    private quizStateService: QuizStateService,
    private selectedOptionService: SelectedOptionService,
    private ngZone: NgZone
  ) {
    this.initializeNextButtonStateStream(
      this.selectedOptionService.isAnsweredSubject.asObservable(),
      this.quizStateService.isLoading$,
      this.quizStateService.isNavigating$
    );
  }

  public initializeNextButtonStateStream(
    isAnswered$: Observable<boolean>,
    isLoading$: Observable<boolean>,
    isNavigating$: Observable<boolean>
  ): void {
    this.isButtonEnabled$ = combineLatest([
      isAnswered$,
      isLoading$,
      isNavigating$
    ]).pipe(
      map(([isAnswered, isLoading, isNavigating]) => {
        const isEnabled = isAnswered && !isLoading && !isNavigating;
        console.log('[🧪 isButtonEnabled$]', { isAnswered, isLoading, isNavigating, isEnabled });
        return isEnabled;
      }),
      distinctUntilChanged(),
      shareReplay(1)
    );
  
    this.isButtonEnabled$.subscribe((isEnabled) => {
      this.updateAndSyncNextButtonState(isEnabled);
    });
  }  

  public updateAndSyncNextButtonState(isEnabled: boolean): void {
    this.ngZone.run(() => {
      this.isNextButtonEnabled = isEnabled;
      this.isButtonEnabledSubject.next(isEnabled);

      this.nextButtonStyle = {
        opacity: isEnabled ? '1' : '0.5',
        'pointer-events': isEnabled ? 'auto' : 'none',
      };
    });
  }

  public evaluateNextButtonState(
    isAnswered: boolean,
    isLoading: boolean,
    isNavigating: boolean
  ): boolean {
    const shouldEnable = isAnswered && !isLoading && !isNavigating;

    console.log('[🧪 evaluateNextButtonState]', {
      isAnswered,
      isLoading,
      isNavigating,
      shouldEnable
    });

    this.updateAndSyncNextButtonState(shouldEnable);
    return shouldEnable;
  }
}
