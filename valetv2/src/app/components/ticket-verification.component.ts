import { Component, OnInit, OnDestroy } from '@angular/core';
import { Subscription } from 'rxjs';

import { DataService } from '../services/data.service';
import { TokenUtilService } from '../services/token-util.service';
import { NotifierService } from '../services/notifier.service';
import { PlateUtilService } from '../services/plate-util.service';
import { NgxSpinnerService } from 'ngx-spinner';

@Component({
    selector: 'app-qr',
    templateUrl: '../templates/ticket-verification.component.html',
    styleUrls: ['../../styles/components/ticket-verification.component.scss']
})

export class TicketVerificationComponent implements OnInit, OnDestroy {

    plateSearch = '';
    ticketResult: any = null;
    notFound = false;
    sub: Subscription;

    constructor(private data: DataService,
        private tokenUtil: TokenUtilService,
        private notifier: NotifierService,
        private plateUtil: PlateUtilService,
        private spinner: NgxSpinnerService) {
    }

    ngOnDestroy(): void {
        if (this.sub) {
            this.sub.unsubscribe();
        }
    }

    ngOnInit(): void {
        this.sub = this.tokenUtil.isTokenValid(true, 'token_v').subscribe();
    }

    searchPlate() {
        if (!this.plateSearch || this.plateSearch.trim().length === 0) {
            this.notifier.addMessage('error', 'Erro', 'Digite a placa do veículo.');
            return;
        }

        this.spinner.show();
        this.notFound = false;
        this.ticketResult = null;

        this.data.searchByPlate(this.plateSearch)
            .subscribe(
                (result) => {
                    this.spinner.hide();
                    this.ticketResult = result;
                },
                (err) => {
                    this.spinner.hide();
                    this.notFound = true;
                }
            );
    }

    onPlateInput(event) {
        const input = event.target;
        const formatted = this.plateUtil.applyMask(input.value);
        this.plateSearch = formatted;
        input.value = formatted;
    }

    formatPlateDisplay(plate: string): string {
        return this.plateUtil.formatPlate(plate);
    }

    simulatePayment() {
        if (!this.ticketResult || !this.ticketResult.ticket_no) return;

        this.spinner.show();
        this.data.updatePaymentStatus(this.ticketResult.ticket_no)
            .subscribe(
                () => {
                    this.spinner.hide();
                    this.ticketResult.paid = true;
                    this.ticketResult.status = 'paid';
                    this.notifier.addMessage(
                        'success',
                        'Pagamento Simulado',
                        `Ticket ${this.ticketResult.ticket_no} marcado como PAGO.`
                    );
                },
                (err) => {
                    this.spinner.hide();
                    this.notifier.addMessage(
                        'error',
                        'Erro',
                        'Não foi possível simular o pagamento.'
                    );
                }
            );
    }

    clearSearch() {
        this.plateSearch = '';
        this.ticketResult = null;
        this.notFound = false;
    }
}
