import { Component, OnInit } from '@angular/core';
import { NotifierService } from '../services/notifier.service';

@Component({
    selector: 'app-notifier',
    templateUrl: '../templates/notifier.component.html',
    styleUrls: ['../../styles/components/notifier.component.scss']
})
export class NotifierComponent implements OnInit {

    styles = {
        opacity: null,
        transition: '',
        display: ''
    };

    constructor(public notifier: NotifierService) { }

    ngOnInit(): void {
        this.hideMessage(undefined, true);
    }

    showMessage() {
        if (this.notifier.pendingMessage) {
            this.styles.opacity = 1;
            this.styles.display = 'grid';

            this.hideMessage();
            return true;
        }

        return false;
    }

    hideMessage(time?: number, initialCall?: Boolean) {
        if (initialCall) {
            this.styles.display = 'none';
            this.styles.opacity = 0;
            return;
        }

        if (time === 0) {
            this.styles.display = 'none';
            return;
        }

        const timer = (time !== undefined) ? time : 7000;
        setTimeout(() => {
            this.styles.opacity = 0.2;
            this.styles.transition = '2s ease-out';
        }, timer - 2000);

        setTimeout(() => {
            this.styles.display = 'none';
        }, timer);
    }
}
