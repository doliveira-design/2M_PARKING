import { Injectable } from '@angular/core';
import { Router } from '@angular/router';

import { NotifierService } from './notifier.service';
import { NgxSpinnerService } from 'ngx-spinner';

@Injectable({
  providedIn: 'root'
})
export class ErrorHandlerService {

  statusCode = {
    400: 'badRequest',
    401: 'unauthorized',
    404: 'notFound',
    500: 'internalServer'
  };

  errorMessages = {
    400: 'The inputs you provided resulted in a bad request. Please try again with valid data.',
    401: 'You are not authorized to view the requested URL. Please login to view the page.',
    404: `The resource that you requested does not exist on the server.
          You might have provided incorrect data. Please try again or contact technical support for help.`,
    500: 'There seems to be a problem processing your request. Please try again.'
  };

  constructor(private notifier: NotifierService,
    private router: Router,
    private spinner: NgxSpinnerService) { }

  handleError(err) {
    this.spinner.hide();
    const code: number = err.status || 500;
    this.notifier.addMessage('error', 'Error', this.errorMessages[code]);
    switch (code) {
      case 401:
        this.router.navigateByUrl(`/unauthorized`,
          { skipLocationChange: false });
        break;
      case 404:
        this.router.navigateByUrl(`/`,
          { skipLocationChange: false });
        break;
      default:
    }
  }

  authError(err) {
    this.spinner.hide();
    const code: number = err.status || 500;
    let errMsg = this.errorMessages[code];

    if (code === 401 || code === 404) {
      errMsg = 'The username and (or) password is incorrect. Please try again.';
    }

    this.notifier.addMessage('error', 'Error', errMsg);
  }
}

