# Angular 9 Quiz App

[Edit on StackBlitz ⚡️](https://stackblitz.com/edit/angular-9-quiz-app)

# To-Do Items:
- show next new questions
- reset time between questions
- options/correctAnswerMessage needs to clear between questions
- mat-accordion panels in resultscomponent not expanding (check if I have it set up right) 
- mat-checkbox for multiple answer questions (if there is a single answer - use mat-radio, otherwise use mat-checkbox), created function in Quiz API to check the question type
- remove pauseTimer in timer.component.ts unless I decide to use it somehow...
- use static field in QuestionComponent ts file for correctness types (see @kirjs message about this)
- highlight all correct answers at the same time (using mat-checkbox)
- sort correct answers in numerical order 1 & 2 instead of 2 & 1
- remove pauseTimer in timer.component.ts unless I decide to use it somehow...

- once all the correct answer(s) are selected,
	- pause quiz and prevent any other answers from being selected
	- display "Move on to next question...") or somehow animate the next button so it's obvious to move to the next question
- if wrong answer(s) are picked before correct, it says "That's wrong" without saying what the correct options are (IN PROGRESS)
- if no answer is selected after time expires, show correct answer with explanation (work on) with quiz delay (done) and navigate to the next question (done)
- Should QuestionComponent move into containers? Thinking about the architecture here...
- ensure that border is blue for question and gray for answers
- for last question, make sure that the correct answer is selected and time stopped
- make it work without "selected" field in Option.ts - I believe I've done this, just not sure if adding selected? field is appropriate


- change the quiz-topic-img instead to use the image path in QUIZ_DATA <img mat-card-image [src]="quizData.imageUrl"> instead of loading it in the CSS

- answer showing up as error in di-quiz template - answer is not a field on model! - check if this is still an issue

- create function that creates a mapping - I believe I've done this
	- loop over this.quizData.question array
		- if option is correct, need to store the option in an array
		- if the question has more than one option that is correct
			- have a multiple variable set to true and push the additional options after
			- should have a mapping between question # and correct option number(s) - [1: 1, 2], [2: 4], [3: 3], ...
- display of next question text should be in template - NO DOM!
- disable next button in DI-Quiz template???
- display checkmarks and x's in the same position from the right of the option box (already done, but maybe it can be done without position: absolute ???)

- after answering last question it should forward to Results and mat-card should display
- add cool hover effect on options
- add animated next button when moving to next question
- add previous button

- work on ResultsComponent and passing the data from DI Component/services to the Results
	- just pass 2 values to ResultsComponent (see @kirjs message)
	- make sure percent and completion time display
	- show your results button not navigating to results - should never exceed the totalQuestions
	- make sure mat-accordion works
	- add a correctness bar to the results: show the %, then the bar, then the score 2/8
	- add FaceBook button bonus

Get the app working 100% correctly, then work on NgRx!
