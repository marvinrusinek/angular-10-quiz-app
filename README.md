<h1>Angular Quiz App</h1>

<p>Welcome to the <strong>Angular Quiz App</strong>! 🚀</p>

<p>This dynamic and interactive application is built entirely with <strong>Angular</strong> and designed to provide an engaging quiz experience. It features timed questions, single and multiple-answer formats, and detailed explanations to help users learn while they test their knowledge. <a href="https://angular-10-quiz-app.stackblitz.io/">View here</a>.</p>

<h2>Key Features</h2>
<ul>
  <li><strong>Diverse Question Types</strong>: Includes support for single-answer and multiple-answer questions.</li>
  <li><strong>Countdown Timer</strong>: Each question is timed to simulate real-world quiz scenarios.</li>
  <li><strong>Real-Time Scoring</strong>: Tracks your score dynamically as you progress.</li>
  <li><strong>Detailed Explanations</strong>: Learn as you go with explanations for correct and incorrect answers.</li>
  <li><strong>Smooth Navigation</strong>: Seamlessly move between questions using buttons or the URL.</li>
  <li><strong>Responsive Design</strong>: Optimized for a great experience on both desktop and mobile devices.</li>
</ul>

<h2>Technologies Used</h2>
<ul>
  <li><strong>Angular</strong>: For building the front-end.</li>
  <li><strong>TypeScript</strong>: The main programming language.</li>
  <li><strong>RxJS</strong>: Utilizes reactive programming with Observables.</li>
  <li><strong>SCSS</strong>: For modular and maintainable styling.</li>
  <li><strong>Angular Material</strong>: To leverage pre-built UI components.</li>
</ul>

<h2>Installation</h2>

<h3>Prerequisites</h3>
<ul>
  <li><a href="https://nodejs.org/">Node.js</a> (v12.x or above)</li>
  <li><a href="https://angular.io/cli">Angular CLI</a> (v10.x or above)</li>
</ul>

<h3>Steps to Run Locally</h3>
<ol>
  <li>Clone the repository:
    <pre><code>git clone https://github.com/yourusername/quiz-app.git
cd quiz-app
</code></pre>
  </li>
  <li>Install dependencies:
    <pre><code>npm install</code></pre>
  </li>
  <li>Run the application:
    <pre><code>ng serve</code></pre>
  </li>
  <li>Open your browser and navigate to <a href="http://localhost:4200">http://localhost:4200</a>.</li>
</ol>

<h2>Usage</h2>
<ul>
  <li>Select a quiz category to start.</li>
  <li>Answer each question by selecting one or more options.</li>
  <li>Use the <strong>Next</strong> button or URL navigation to move between questions.</li>
  <li>Track your score and view explanations after each answer.</li>
  <li>Restart the quiz at any time to try again.</li>
</ul>

<h2>Folder Structure</h2>
<ul>
  <li><strong>src/app/components</strong>: Reusable components like questions, timer, and options.</li>
  <li><strong>src/app/services</strong>: Handles business logic, quiz data, and navigation.</li>
  <li><strong>src/app/models</strong>: Interfaces and data models for the quiz structure.</li>
  <li><strong>src/app/pipes</strong>: Custom pipes for formatting data (e.g., combining explanations).</li>
  <li><strong>src/styles</strong>: Global SCSS styles, including themes and variables.</li>
</ul>

<h2>Development Workflow</h2>

<h3>Adding a New Feature</h3>
<ol>
  <li>Create a new component or service in the appropriate folder.</li>
  <li>Write or update unit tests for your feature.</li>
  <li>Test locally:
    <pre><code>ng test</code></pre>
  </li>
</ol>

<h3>Debugging</h3>
<ul>
  <li>Run <code>ng serve</code> and inspect the app using browser developer tools.</li>
  <li>Use Angular CLI commands to debug components and services.</li>
</ul>

<h3>Contributing</h3>
<p>Contributions are welcome! To contribute:</p>
<ol>
  <li>Fork the repository.</li>
  <li>Create a feature branch:
    <pre><code>git checkout -b feature-name</code></pre>
  </li>
  <li>Commit your changes:
    <pre><code>git commit -m "Add new feature"</code></pre>
  </li>
  <li>Push to your branch:
    <pre><code>git push origin feature-name</code></pre>
  </li>
  <li>Open a pull request.</li>
</ol>

<h2>Progress and Future Enhancements</h2>
<ul>
  <li><strong>Leaderboard</strong>: Introduce a leaderboard for top performers.</li>
  <li><strong>User Authentication</strong>: Allow users to save and track quiz progress.</li>
  <li><strong>Additional Categories</strong>: Expand the range of quiz topics.</li>
</ul>

<h2>Show Your Support</h2>
<p>If you enjoy using the app or find it useful, please give it a ⭐ on GitHub! Your feedback and support is greatly appreciated.</p>

<h2>License</h2>
<p>This project is licensed under the MIT License. See the <a href="./LICENSE">LICENSE</a> file for details.</p>
