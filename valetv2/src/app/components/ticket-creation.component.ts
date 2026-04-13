import { Component, OnInit, OnDestroy } from '@angular/core';
import { Subscription } from 'rxjs';

import { DataService } from '../services/data.service';
import { TokenUtilService } from '../services/token-util.service';
import { NotifierService } from '../services/notifier.service';
import { PhoneUtilService } from '../services/phone-util.service';
import { PlateUtilService } from '../services/plate-util.service';
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
    submitting = false;
    generatedTicket: any = null;
    isAdmin = false;

    constructor(private data: DataService,
        private tokenUtil: TokenUtilService,
        private notifier: NotifierService,
        private phoneUtil: PhoneUtilService,
        private plateUtil: PlateUtilService,
        private spinner: NgxSpinnerService
    ) { }

    ngOnInit(): void {
        this.sub =
            this.tokenUtil.isTokenValid(true, 'token_v')
            .subscribe();
        this.isAdmin = this.tokenUtil.getRole('token_v') === 'admin';
    }
    ngOnDestroy(): void {
        this.sub.unsubscribe();
    }

    onNameInput(event, field: string) {
        const input = event.target;
        // Remove caracteres não permitidos (apenas letras, acentuadas e espaços)
        let value = input.value.replace(/[^A-Za-zÀ-ÿ\s]/g, '');
        // Capitaliza a primeira letra e a letra após cada espaço
        value = value.replace(/(^|\s+)(\S)/g, (match, space, char) => space + char.toUpperCase());
        // Remove espaços duplos
        value = value.replace(/\s{2,}/g, ' ');
        this.ticket[field] = value;
        input.value = value;
    }

    onPhoneInput(event) {
        const input = event.target;
        const formatted = this.phoneUtil.applyMask(input.value);
        this.ticket.phone = formatted;
        input.value = formatted;
    }

    onPlateInput(event) {
        const input = event.target;
        const formatted = this.plateUtil.applyMask(input.value);
        this.ticket.regNo = formatted;
        input.value = formatted;
    }

    formatPlateDisplay(plate: string): string {
        return this.plateUtil.formatPlate(plate);
    }

    generateTicket(form) {
        if (this.submitting) { return; }
        this.spinner.show();

        this.loginPressed = true;
        this.submitting = true;
        const status = form.status;

        // normalizar placa: remover caracteres especiais e converter para uppercase
        form.value.reg_no = this.plateUtil.stripPlate(form.value.reg_no);

        // normalizar telefone no formato padrão
        form.value.phone_no = this.phoneUtil.formatPhone(form.value.phone_no);

        if (status === 'valid'.toUpperCase()) {
            this.data.createTicket(form.value, this.tokenUtil.getToken('token_v'))
                .subscribe((result: any) => {
                    this.spinner.hide();
                    this.submitting = false;
                    this.generatedTicket = result.ticket_data || {
                        ticket_no: result.ticket_no,
                        first_name: form.value.first_name,
                        last_name: form.value.last_name,
                        reg_no: form.value.reg_no,
                        manufacturer: form.value.manufacturer,
                        model: form.value.model,
                        color: form.value.color,
                        amount: 25.00
                    };
                    form.reset();
                    this.loginPressed = false;
                }, (err) => {
                    this.submitting = false;
                });
        } else {
            this.submitting = false;
            this.spinner.hide();
        }
    }

    onFocus(inputName) {
        this.focus[inputName] = true;
    }

    onBlur(inputName) {
        this.focus[inputName] = false;
    }

    printTicket() {
        window.print();
    }

    newTicket() {
        this.generatedTicket = null;
    }

    logout() {
        this.tokenUtil.logout();
    }

}
