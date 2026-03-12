# Valet Ticketing Application 🚙🅿🎫

This is a single page application designed and developed as a prototype for a friend. This is the second iteration of the application. I worked on all aspects of the application, from figuring out the flow and architecture, to making wireframes, to implementing the backend REST API and creating the front-end application for the complete functionality. I will be talking about the thought process behind the frontend implementation here.

## The problem/challenge
The problem that had to be solved was to automate the process of handing out valet parking tickets. Upon an analysis of the problem, I found that the main objectives that had to be achieved were to:

* Create a way of identifying users when generating tickets
* Figure out what kind of data needs to be stored about the users
* Provide an interface for valets to generate tickets for users digitally by entering their information
* Provide a way for transferring the ticket over to the users
* Provide users with a way to view their digital tickets and pay for them
* Provide a way for valets to verify if the payment for the user's ticket has been made

I got a general idea from my friend about what the flow should be (including the requirement to send users their tickets via SMS), which I then incorporated into one complete application.

## How I implemented the solution 👩‍💻
After figuring out the main objectives, I did some research about what technology could be used and decided the complete flow of the application.

### The basic flow of the application
The application has 2 parts:
* One part can only be accessed by the valet(s) to generate digital tickets
* The other part can be accessed by users to view their generated valet tickets, pay for their tickets, and get a verification code (QR Code) from the application - to show to the valet

When users arrive at a valet parking area, the valet will take their details (name, phone number, car details, license plate number) and generate a ticket for them. The user will then receive a text message on the phone number they provided, giving them a link to view their ticket. At this point, the user can leave the car with the valet.

The user can then open up the link when they need to pay for their ticket. Afterwards, they will get a QR Code for ticket verification (verifying the details of their car and ticket payment status). While collecting their car from the valet, the user will need to show the verification code they received to the valet. The valet will verify the information of the car and check payment details (by scanning the QR Code) and then the user can take their car.

### Backend Implementation
You can [read details of the backend implementation here](https://github.com/mahamshahid18/valet-app-v2-backend)

### Frontend Implementation 👩‍💻📱
I chose to implement the application in Angular framework - with standard HTML and SASS. 3rd party libraries used include [`angularx-qrcode`](https://www.npmjs.com/package/angularx-qrcode), and [`ngx-spinner`](https://www.npmjs.com/package/ngx-spinner) for generating qr-codes and loading animations respectively.

#### UI
I decided to keep a simple and clean look for the UI, taking some inspiration from material design and modern web design. The focus was on making the information easily readable and having a natural flow of the whole ticketing process - from ticket generation to payment, to ticket verification instead of going for something fancy.

I first created paper wireframes and then implemented these as component templates (along with styling). The design is responsive, without the need for media queries. Scoped styles are being used. There are some global styles for the whole application, and other component specific styles are available in their respective files. Form validation and error messages are also implemented in the whole application.

Here's an image of the folder structure for templates and styles:

![Image of styles and templates folder structure](https://user-images.githubusercontent.com/12479952/45777878-75972980-bc70-11e8-8f5e-3de77a510879.PNG)

#### Services
There are 5 helper services available in this project:

* **`Auth Service:`** contains all the logic for logging in valets (for generating tickets) and users (for viewing & paying for tickets)
* **`Data Service:`** contains all the logic related to fetching data from the backend and sending data to the backend
* **`Error Handler Service:`** this is a generic error handler which both auth service and data service use for error handling behavior (such as displaying a message or navigating to another URL)
* **`Token Utility Service:`** contains helpers for storing and retrieving tokens from the client storage
* **`UI Notification Service:`** contains functions to let components display error, success or info message notifications when certain actions are performed (like toast notifications)

#### Components
The application was split into a number of components (total `10` inlcuding the AppComponent - which is the parent component for all other components) to follow a maintainable component based design, where each component was tasked with accomplishing one task. For example, the `UserLoginComponent` is only concerned with authenticating and logging in a user. After that, the next component takes over. The components have been named as such to make it easier to comprehend what their purpose is.

Please take a look at the source code for more details about the functionality of each.

#### Modules
 Other than Angular's core functionalities, the `FormsModule`, `HttpClientModule`, and `RoutingModule` were used. 2 3rd party modules were also used (as mentioned before).

## Demo 💻
A live demo of the application is not be possible because there is a restriction on which phone numbers can receive an SMS from the backend (your phone number is required to receive a valet ticket and view the whole flow of the application). If you want to see a live demo, please contact me.

You can also take a [**look at the video demo of the application here**](https://vimeo.com/293048162).

Please let me know if you have any questions about this project or if you want to discuss anything related to my other projects 😄
