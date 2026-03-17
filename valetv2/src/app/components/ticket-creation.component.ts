import { Component, OnInit, OnDestroy } from '@angular/core';
import { Subscription } from 'rxjs';

import { DataService } from '../services/data.service';
import { TokenUtilService } from '../services/token-util.service';
import { NotifierService } from '../services/notifier.service';
import { PhoneUtilService } from '../services/phone-util.service';
import { NgxSpinnerService } from 'ngx-spinner';

@Component({
    selector: 'app-ticket-creation',
    templateUrl: '../templates/ticket-creation.component.html',
    styleUrls: ['../../styles/components/ticket-creation.component.scss']
})

export class TicketCreationComponent implements OnInit, OnDestroy {

    ticket = {
        firstName: null,
        lastName: null,
        phone: null,
        regNo: null,
        manufacturer: null,
        model: null,
        color: null
    };

    sub: Subscription;

    focus = {
        firstName: false,
        lastName: false,
        phone: false,
        regNo: false,
        manufacturer: false,
        model: false,
        color: false,
    };

    loginPressed = false;

    constructor(private data: DataService,
        private tokenUtil: TokenUtilService,
        private notifier: NotifierService,
        private phoneUtil: PhoneUtilService,
        private spinner: NgxSpinnerService
    ) { }

    ngOnInit(): void {
        this.sub =
            this.tokenUtil.isTokenValid(true, 'token_v')
            .subscribe();
    }
    ngOnDestroy(): void {
        this.sub.unsubscribe();
    }

    onPhoneInput(event) {
        const input = event.target;
        const formatted = this.phoneUtil.applyMask(input.value);
        this.ticket.phone = formatted;
        input.value = formatted;
    }

    generateTicket(form) {
        this.spinner.show();

        this.loginPressed = true;
        const status = form.status;

        // replacing dashes from car license plate & converting to uppercase
        form.value.reg_no = form.value.reg_no.replace('-', '').toUpperCase();

        // normalizar telefone no formato padrão
        form.value.phone_no = this.phoneUtil.formatPhone(form.value.phone_no);

        if (status === 'valid'.toUpperCase()) {
            this.data.createTicket(form.value, this.tokenUtil.getToken('token_v'))
                .subscribe((result) => {
                    this.spinner.hide();
                    this.notifier.addMessage(
                        'success',
                        'Ticket Gerado',
                        'Novo ticket eletrônico gerado com sucesso!'
                    );
                    form.reset();
                    this.loginPressed = false;
                });
        }
    }

    onFocus(inputName) {
        this.focus[inputName] = true;
    }

    onBlur(inputName) {
        this.focus[inputName] = false;
    }

}
