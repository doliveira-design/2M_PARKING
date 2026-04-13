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
    paymentMethod: string = 'dinheiro';
    showPaymentForm: boolean = false;
    processing: boolean = false;
    isAdmin = false;
    exitDone = false;
    exitTime: string = '';

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
        this.isAdmin = this.tokenUtil.getRole('token_v') === 'admin';
    }

    searchPlate() {
        if (!this.plateSearch || this.plateSearch.trim().length === 0) {
            this.notifier.addMessage('error', 'Erro', 'Digite a placa do veículo.');
            return;
        }

        this.spinner.show();
        this.notFound = false;
        this.ticketResult = null;

        this.data.searchByPlate(this.plateSearch, this.tokenUtil.getToken('token_v'))
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
        this.showPaymentForm = true;
    }

    confirmPayment() {
        if (!this.ticketResult || !this.ticketResult.ticket_no) return;

        this.processing = true;
        this.spinner.show();
        this.data.updatePaymentStatus(this.ticketResult.ticket_no, this.tokenUtil.getToken('token_v'), this.paymentMethod)
            .subscribe(
                (response) => {
                    this.spinner.hide();
                    this.processing = false;
                    this.ticketResult.paid = true;
                    this.ticketResult.status = 'paid';
                    this.ticketResult.amount = response.amount;
                    this.ticketResult.payment_method = response.payment_method;
                    this.showPaymentForm = false;
                    this.notifier.addMessage(
                        'success',
                        'Pagamento Registrado',
                        `Ticket ${this.ticketResult.ticket_no} — R$ ${response.amount.toFixed(2)} via ${this.getMethodLabel(response.payment_method)}.`
                    );
                },
                (err) => {
                    this.spinner.hide();
                    this.processing = false;
                    this.notifier.addMessage(
                        'error',
                        'Erro',
                        'Não foi possível registrar o pagamento.'
                    );
                }
            );
    }

    cancelPayment() {
        this.showPaymentForm = false;
        this.paymentMethod = 'dinheiro';
    }

    getMethodLabel(method: string): string {
        const labels = { dinheiro: 'Dinheiro', cartao: 'Cartão', pix: 'PIX', cortesia: 'Cortesia' };
        return labels[method] || method;
    }

    clearSearch() {
        this.plateSearch = '';
        this.ticketResult = null;
        this.notFound = false;
        this.exitDone = false;
        this.exitTime = '';
    }

    exitVehicle() {
        if (!this.ticketResult || !this.ticketResult.ticket_no) return;

        this.processing = true;
        this.spinner.show();
        this.data.exitVehicle(this.ticketResult.ticket_no, this.tokenUtil.getToken('token_v'))
            .subscribe(
                (response) => {
                    this.spinner.hide();
                    this.processing = false;
                    this.exitDone = true;
                    const now = new Date();
                    this.exitTime = now.toLocaleString('pt-BR');
                    this.notifier.addMessage(
                        'success',
                        'Veículo Liberado',
                        `Ticket ${this.ticketResult.ticket_no} — saída registrada com sucesso.`
                    );
                },
                (err) => {
                    this.spinner.hide();
                    this.processing = false;
                    this.notifier.addMessage(
                        'error',
                        'Erro',
                        'Não foi possível registrar a saída do veículo.'
                    );
                }
            );
    }

    printReceipt() {
        window.print();
    }

    logout() {
        this.tokenUtil.logout();
    }
}
