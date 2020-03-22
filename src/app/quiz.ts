import { Quiz } from './models/Quiz';

export const QUIZ_DATA: Quiz = {
  milestone: 'Dependency Injection',
  summary: 'Dependency Injection is extremely powerful because it is a way of providing dependencies in your code instead of hard-coding them.',
  imageUrl: 'images/DIDiagram.png',
  questions: [
    {
      questionText: 'What is the objective of dependency injection?',
      options: [
        { text: 'Pass the service to the client.', correct: true, selected: false },
        { text: 'Allow the client to find service.', correct: true, selected: false },
        { text: 'Allow the client to build service.', correct: false, selected: false },
        { text: 'Give the client part service.', correct: false, selected: false }
      ],
      explanation: 'a service gets passed to the client during DI'
    },
    {
      questionText: 'Which of the following benefit from dependency injection?',
      options: [
        { text: 'Programming', correct: false, selected: false },
        { text: 'Testability', correct: false, selected: false },
        { text: 'Software design', correct: false, selected: false },
        { text: 'All of the above.', correct: true, selected: false },
      ],
      explanation: 'DI simplifies both programming and testing as well as being a popular design pattern'
    },
    {
      questionText: 'Which of the following is the first step in setting up dependency injection?',
      options: [
        { text: 'Require in the component.', correct: false, selected: false },
        { text: 'Provide in the module.', correct: false, selected: false },
        { text: 'Mark dependency as @Injectable().', correct: true, selected: false },
        { text: 'Declare an object.', correct: false, selected: false }
      ],
      explanation: 'the first step is marking the class as @Injectable()'
    },
    {
      questionText: 'In which of the following does dependency injection occur?',
      options: [
        { text: '@Injectable()', correct: false, selected: false },
        { text: 'constructor', correct: true, selected: false },
        { text: 'function', correct: false, selected: false },
        { text: 'NgModule', correct: false, selected: false }
      ],
      explanation: 'object instantiations are taken care of by the constructor in Angular'
    }
    // add more questions here!
  ]
};
