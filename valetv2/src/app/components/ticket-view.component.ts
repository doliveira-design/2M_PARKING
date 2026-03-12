import { Component, OnInit, OnDestroy } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';

import { DataService } from '../services/data.service';
import { TokenUtilService } from '../services/token-util.service';
import { NotifierService } from '../services/notifier.service';

import { switchMap } from 'rxjs/operators';

@Component({
    selector: 'app-ticket',
    templateUrl: '../templates/ticket-view.component.html',
    styleUrls: ['../../styles/components/ticket-view.component.scss']
})

export class TicketViewComponent implements OnInit, OnDestroy {

    ticket_no = null;

    user: any = {
        first_name: '',
        last_name: '',
        car: {
            reg_no: '',
            color: '',
            manufacturer: '',
            model: ''
        },
        ticket: {
            paid: '',
            amount: '',
            no: ''
        }
    };

    ticketPaid = false;
    showPayment = false;
    callCarPressed = false;
    buttonCtaText: String = '';

    constructor(private data: DataService,
        private tokenUtil: TokenUtilService,
        private notifier: NotifierService,
        private router: Router,
        private route: ActivatedRoute) {
    }

    ngOnInit(): void {
        this.tokenUtil.isTokenValid()
            .subscribe(() => {
                this.getData();
            });
    }

    ngOnDestroy(): void {
    }

    getData() {
        this.route.params
            .pipe(
                switchMap(param => {
                    this.ticket_no = param.ticket_no;
                    return this.data.getUser(this.ticket_no, this.tokenUtil.getToken());
                })
            )
            .subscribe((response) => {
                this.user = response;
                this.buttonCtaText = this.user.ticket.paid ?
                    'Call Car' : 'Make Payment';
                this.ticketPaid = this.user.ticket.paid;
            });
    }

    performCta() {
        this.callCarPressed = true;
        this.showPayment = !this.ticketPaid && this.callCarPressed;

        if (!this.showPayment) {
            this.notifier.addMessage(
                'info',
                'Car Called',
                'You have requested for your car.'
            );
            this.router.navigateByUrl(`validate/${this.ticket_no}`,
                { skipLocationChange: false });
        }
    }

}
