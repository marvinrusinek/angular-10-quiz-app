import { Quiz } from './models/Quiz';

export const QUIZ_DATA: Quiz = {
  milestone: 'Dependency Injection',
  summary: 'Dependency Injection is extremely powerful because it is a way of providing dependencies in your code instead of hard-coding them.',
  imageUrl: 'images/DIDiagram.png',
  questions: [
    {
      questionText: 'What is the objective of dependency injection?',
      options: [
        { text: 'Pass the service to the client.', correct: true },
        { text: 'Allow the client to find service.', correct: true },
        { text: 'Allow the client to build service.' },
        { text: 'Give the client part service.' }
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
      questionText: 'Which of the following is the first step in setting up dependency injection?',
      options: [
        { text: 'Require in the component.' },
        { text: 'Provide in the module.' },
        { text: 'Mark dependency as @Injectable().', correct: true },
        { text: 'Declare an object.' }
      ],
      explanation: 'the first step is marking the class as @Injectable()'
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
    }
    // add more questions here
  ]
};
