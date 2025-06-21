import { animate, keyframes, style, transition, trigger } from '@angular/animations';

/************** animation utilized in QuizSelectionComponent *********************/
export const SlideLeftToRightAnimation = {
  slideLeftToRight: trigger('slideLeftToRight', [
    transition(':enter', [
      style({transform: 'translateX(-100%)'}),
      animate('500ms ease-in', style({transform: 'translateX(0%)'}))
    ])
  ])
};

/************** animation utilized in QuizComponent *********************/
export const ChangeRouteAnimation = {
  changeRoute: trigger('changeRoute', [
    transition('* => animationStarted', [
      animate('600ms ease-in-out', keyframes([
        style({ transform: 'scale(1.0)', offset: 0 }),
        style({ transform: 'scale(1.15)', offset: 0.5 }),
        style({ transform: 'scale(1.0)', offset: 1.0 })
      ]))      
    ]),
  ])
};
