import { Quiz } from '@codelab-quiz/shared/models/Quiz';
import { QuizResource } from '@codelab-quiz/shared/models/QuizResource.model';

export const QUIZ_DATA: Quiz[] = [
  {
    id: 'TS_Quiz',
    milestone: 'TypeScript',
    summary: 'TypeScript simplifies JavaScript code, making it easier to read and debug.',
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
    id: 'DI_Quiz',
    milestone: 'Dependency Injection',
    summary: 'Dependency Injection is extremely powerful because it is a way of providing dependencies in your code instead of hard-coding them.',
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
  }
];

export const QUIZ_RESOURCES: QuizResource[] = [
  {
    id: 'TS_Quiz',
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
    id: 'DI_Quiz',
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
