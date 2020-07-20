import { Quiz } from '@codelab-quiz/shared/models/Quiz';
import { QuizResource } from '@codelab-quiz/shared/models/QuizResource.model';

export const QUIZ_DATA: Quiz[] = [
  {
    quizId: 'typescript',
    milestone: 'TypeScript',
    summary: 'TypeScript makes it easier to read and debug JavaScript code.',
    imageUrl: 'https://raw.githubusercontent.com/marvinrusinek/angular-9-quiz-app/master/src/assets/images/ts.png',
    questions: [
      {
        questionText: 'Which of the following does TypeScript use to specify the type information?',
        options: [
          { text: ':', correct: true },
          { text: ';' },
          { text: '!' },
          { text: '&' }
        ],
        explanation: 'TS uses a colon (:) to separate the property name from the property type'
      },
      {
        questionText: 'Which of the following is NOT a type used in TypeScript?',
        options: [
          { text: 'number' },
          { text: 'string' },
          { text: 'boolean' },
          { text: 'enum', correct: true }
        ],
        explanation: 'enum is not used as a type in TypeScript'
      },
      {
        questionText: 'How can we specify properties and methods for an object in TypeScript?',
        options: [
          { text: 'Use classes' },
          { text: 'Use interfaces', correct: true },
          { text: 'Use enums' },
          { text: 'Use async/await' }
        ],
        explanation: 'interfaces are typically used to list the properties and methods for an object'
      },
      {
        questionText: 'How else can Array<number> be written in TypeScript?',
        options: [
          { text: '@number' },
          { text: 'number[]', correct: true },
          { text: 'number!' },
          { text: 'number?' }
        ],
        explanation: 'number[] is another way of writing Array<number> in TypeScript'
      },
      {
        questionText: 'In which of these does a class take parameters?',
        options: [
          { text: 'constructor', correct: true },
          { text: 'destructor', },
          { text: 'import' },
          { text: 'subscribe' }
        ],
        explanation: 'a constructor is used by a class to take in parameters'
      },
      {
        questionText: 'Which is NOT an access modifier?',
        options: [
          { text: 'private' },
          { text: 'protected' },
          { text: 'public' },
          { text: 'async', correct: true }
        ],
        explanation: 'async is not used as an access modifier type in TypeScript'
      },
      {
        questionText: 'Which keyword allows us to share information between files in TypeScript?',
        options: [
          { text: 'import' },
          { text: 'export', correct: true },
          { text: 'async' },
          { text: 'constructor' }
        ],
        explanation: 'the export keyword allows for the information to be transmitted between files'
      },
      {
        questionText: 'Which is an array method to generate a new array based on a condition?',
        options: [
          { text: 'filter', correct: true },
          { text: 'map' },
          { text: 'async' },
          { text: 'enum' }
        ],
        explanation: 'filter is a method used to conditionally create a new array'
      },
      {
        questionText: 'How is a property accessible within a class?',
        options: [
          { text: 'using this.propertyName', correct: true },
          { text: 'accessors' },
          { text: 'destructuring' },
          { text: 'arrow function' }
        ],
        explanation: 'this.propertyName is the way to access a specific property within a class'
      }
    ]
  },
  {
    quizId: 'templates',
    milestone: 'Templates',
    summary: 'Angular has a very expressive template system, which takes HTML as a base, and extends it with custom elements.',
    imageUrl: 'https://raw.githubusercontent.com/marvinrusinek/angular-9-quiz-app/master/src/assets/images/template.png',
    questions: [
      {
        questionText: 'What characters are used for text interpolation?',
        options: [
          { text: 'backticks: ``', correct: true },
          { text: 'double curlies: {{ }}' },
          { text: 'double ampersand: &&' },
          { text: 'double pipes: ||' }
        ],
        explanation: 'backticks are used in Angular for insertion of text'
      },
      {
        questionText: 'Which characters are used to include a property value? {{}}',
        options: [
          { text: 'backticks: ``' },
          { text: 'double curlies {{ }}', correct: true },
          { text: 'double ampersand &&' },
          { text: 'double pipes ||' }
        ],
        explanation: 'double curlies are used to insert a property value inside a template'
      },
      {
        questionText: 'How can you pass a value to a child element\'s attribute?',
        options: [
          { text: 'Use string interpolation {{ property }}', correct: true },
          { text: 'call a function' },
          { text: 'using the export keyword' },
          { text: '[attribute]="property"', correct: true }
        ],
        explanation: 'properties can be based to a child element using string interpolation or [attribute]="property" syntax'
      },
      {
        questionText: 'Which is a shortcut for applying a class name based on value of property?',
        options: [
          { text: '{{ property }}' },
          { text: '``property``' },
          { text: '[class.property]="isProperty"', correct: true },
          { text: 'property$' }
        ],
        explanation: 'we use the [class.property] syntax to assign a class name based on a value of property.'
      },
      {
        questionText: 'What is the proper way to bind styles to a button in Angular?',
        options: [
          { text: '<button {{style}}></button>' },
          { text: '<button style="color: blue"' },
          { text: '<button [style.color]="blue">', correct: true },
          { text: '<button>insert style ligature</button>' }
        ],
        explanation: '[style.styleProperty] is the way of binding a style to an element in Angular'
      },
      {
        questionText: 'Which of the following are examples of event bindings in Angular?',
        options: [
          { text: '[click]' },
          { text: '@click' },
          { text: '(click)', correct: true },
          { text: 'on-click', correct: true }
        ],
        explanation: '(click) and its HTML equivalent \'on-click\' are examples of event bindings'
      },
      {
        questionText: 'How do we provide access to an HTML element or Angular component from the template?',
        options: [
          { text: 'Use attribute binding [attr]="name"' },
          { text: 'Use backticks' },
          { text: 'Use double curlies' },
          { text: 'Mark it with #name', correct: true }
        ],
        explanation: 'marking it with #name is the way to access the HTML element from an Angular template'
      },
      {
        questionText: 'What mechanism does Angular provide for handling keyboard shortcuts?',
        options: [
          { text: 'event binding' },
          { text: 'data binding' },
          { text: 'text interpolation' },
          { text: '(keydown.control.enter)', correct: true }
        ],
        explanation: '(keydown.control.enter) is Angular\'s syntax for handling keyboard shortcuts'
      },
      {
        questionText: 'Which directive adds or removes an element from the DOM?',
        options: [
          { text: '*ngFor' },
          { text: '*ngIf', correct: true },
          { text: '*ngSwitch' },
          { text: '[ngStyle]' }
        ],
        explanation: 'ngIf is used to conditionally add or remove an element from the DOM'
      },
      {
        questionText: 'Which directive can be used to display an array of cat images?',
        options: [
          { text: '*ngFor', correct: true },
          { text: '*ngIf' },
          { text: '*ngSwitch' },
          { text: '[ngStyle]' }
        ],
        explanation: 'the ngFor directive is used to display entire arrays or objects'
      }
    ]
  },
  {
    quizId: 'dependency-injection',
    milestone: 'Dependency Injection',
    summary: 'Dependency Injection is a way of providing dependencies in your code instead of hard-coding them.',
    imageUrl: 'https://raw.githubusercontent.com/marvinrusinek/angular-9-quiz-app/master/src/assets/images/DIDiagram.png',
    questions: [
      {
        questionText: 'What is the objective of dependency injection?',
        options: [
          { text: 'Pass the service to the client', correct: true },
          { text: 'Allow the client to find service', correct: true },
          { text: 'Allow the client to build service' },
          { text: 'Give the client part service' }
        ],
        explanation: 'a service gets passed to the client during DI'
      },
      {
        questionText: 'Which of the following benefit from dependency injection?',
        options: [
          { text: 'Programming' },
          { text: 'Testability' },
          { text: 'Software design' },
          { text: 'All of the above.', correct: true }
        ],
        explanation: 'DI simplifies both programming and testing as well as being a popular design pattern'
      },
      {
        questionText: 'In which of the following does dependency injection occur?',
        options: [
          { text: '@Injectable()' },
          { text: 'constructor', correct: true },
          { text: 'function' },
          { text: 'NgModule' }
        ],
        explanation: 'object instantiations are taken care of by the constructor in Angular'
      },
      {
        questionText: 'What is the first step in setting up dependency injection?',
        options: [
          { text: 'Require in the component' },
          { text: 'Provide in the module' },
          { text: 'Mark dependency as @Injectable()', correct: true },
          { text: 'Declare an object' }
        ],
        explanation: 'the first step is marking the class as @Injectable()'
      }
    ]
  },
  {
    quizId: 'component-tree',
    milestone: 'Component Tree',
    summary: 'An Angular application can be thought of as a tree of reusable components.',
    imageUrl: 'https://raw.githubusercontent.com/marvinrusinek/angular-9-quiz-app/master/src/assets/images/tree.png',
    questions: [
      {
        questionText: 'How does a parent component pass data to its child component?',
        options: [
          { text: 'Using data binding' },
          { text: 'Using functions' },
          { text: 'Using properties', correct: true },
          { text: 'Using DOM manipulation' }
        ],
        explanation: 'a parent component can pass data to its child via properties'
      },
      {
        questionText: 'How can one component render another one?',
        options: [
          { text: 'using an HTML element that matches selector of other component', correct: true },
          { text: 'using data binding' },
          { text: 'using properties' },
          { text: 'passing components via functions' }
        ],
        explanation: 'a component can display another component by matching the selector of the other component'
      },
      {
        questionText: 'How do components know about each other?',
        options: [
          { text: 'If they are declared in the same module.', correct: true },
          { text: 'using export' },
          { text: 'using property binding' },
          { text: 'if they are passed to each other' }
        ],
        explanation: 'components can only know about each other if they are declared in the same module'
      },
      {
        questionText: 'How must a child decorate its properties to pass data?',
        options: [
          { text: 'Using the @Input() decorator', correct: true },
          { text: 'Using the @Output() decorator' },
          { text: 'Using @Component' },
          { text: 'Using @Injectable' }
        ],
        explanation: 'properties must be decorated with @Input() in a child to pass data to its parent'
      }
    ]
  },
  {
    quizId: 'router',
    milestone: 'Angular Router',
    summary: 'The Angular router helps developers build Single Page Applications with multiple views and allow navigation between those views.',
    imageUrl: 'https://raw.githubusercontent.com/marvinrusinek/angular-9-quiz-app/master/src/assets/images/router.png',
    questions: [
      {
        questionText: '',
        options: [
          { text: 'Option1', correct: true },
          { text: 'Option2' },
          { text: 'Option3' },
          { text: 'Option4' }
        ],
        explanation: ''
      }
    ]
  },
  {
    quizId: 'material',
    milestone: 'Angular Material',
    summary: 'Angular Material provides a set of Material Design components that are consistent, versatile and look great on mobile devices.',
    imageUrl: 'https://raw.githubusercontent.com/marvinrusinek/angular-9-quiz-app/master/src/assets/images/material.png',
    questions: [
      {
        questionText: '',
        options: [
          { text: 'Option1', correct: true },
          { text: 'Option2' },
          { text: 'Option3' },
          { text: 'Option4' }
        ],
        explanation: ''
      }
    ]
  },
  {
    quizId: 'forms',
    milestone: 'Forms',
    summary: 'Angular forms build upon standard HTML forms to help create custom form controls and support easy validation.',
    imageUrl: 'https://raw.githubusercontent.com/marvinrusinek/angular-9-quiz-app/master/src/assets/images/forms.png',
    questions: [
      {
        questionText: '',
        options: [
          { text: 'Option1', correct: true },
          { text: 'Option2' },
          { text: 'Option3' },
          { text: 'Option4' }
        ],
        explanation: ''
      }
    ]
  },
  {
    quizId: 'angular-cli',
    milestone: 'Angular-CLI',
    summary: 'The Angular CLI is a command-line interface tool used for initializing, developing, scaffolding and maintaining Angular applications.',
    imageUrl: 'https://raw.githubusercontent.com/marvinrusinek/angular-9-quiz-app/master/src/assets/images/angular-cli.png',
    questions: [
      {
        questionText: '',
        options: [
          { text: 'Option1', correct: true },
          { text: 'Option2' },
          { text: 'Option3' },
          { text: 'Option4' }
        ],
        explanation: ''
      }
    ]
  }
];

export const QUIZ_RESOURCES: QuizResource[] = [
  {
    quizId: 'TS_Quiz',
    milestone: 'TypeScript',
    resources: [
      {
        title: 'TypeScript language website',
        url: 'https://www.typescriptlang.org',
        host: 'TypeScript website'
      },
      {
        title: 'Microsoft TypeScript GitHub page',
        url: 'https://github.com/microsoft/TypeScript',
        host: 'GitHub'
      },
      {
        title: 'TypeScript Wiki',
        url: 'https://en.wikipedia.org/wiki/TypeScript',
        host: 'Wikipedia'
      },
      {
        title: 'TypeScript blog',
        url: 'https://devblogs.microsoft.com/typescript/',
        host: 'Microsoft dev blogs'
      }
    ]
  },
  {
    quizId: 'DI_Quiz',
    milestone: 'Dependency Injection',
    resources: [
      {
        title: 'Dependency injection in Angular',
        url: 'https://angular.io/guide/dependency-injection',
        host: 'angular.io'
      },
      {
        title: 'Dependency injection in action',
        url: 'https://angular.io/guide/dependency-injection-in-action',
        host: 'angular.io'
      },
      {
        title: 'Introduction to services and dependency injection',
        url: 'https://angular.io/guide/architecture-services',
        host: 'angular.io'
      },
      {
        title: 'Total Guide To Angular 6+ Dependency Injection...',
        url: 'https://medium.com/@tomastrajan/total-guide-to-angular-6-dependency-injection-providedin-vs-providers-85b7a347b59f',
        host: 'medium.com'
      }
    ]
  }
];
