import { Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root'
})
export class NotifierService {

  public message = {
    type: '',
    title: '',
    content: ''
  };

  public pendingMessage = false;

  constructor() { }

  addMessage(type, title, content, time?: number) {
    this.message.type = type;
    this.message.title = title;
    this.message.content = content;

    this.pendingMessage = true;

    setTimeout(() => {
      this.resetMessage();
    }, time || 7000);
  }

  resetMessage() {
    this.pendingMessage = false;
    this.message.type = null;
    this.message.title = null;
    this.message.content = null;
  }

}
