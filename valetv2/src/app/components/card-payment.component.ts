import { Component, OnInit, OnDestroy } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';

import { DataService } from '../services/data.service';
import { NotifierService } from '../services/notifier.service';
import { environment } from '../../environments/environment';

declare var MercadoPago: any;

@Component({
    selector: 'app-card-payment',
    templateUrl: '../templates/card-payment.component.html',
    styleUrls: ['../../styles/components/card-payment.component.scss']
})
export class CardPaymentComponent implements OnInit, OnDestroy {

    ticketNo: string = '';
    amount: number = 0;
    status: string = 'loading'; // loading, form, processing, success, error
    errorMessage: string = '';
    useMockForm: boolean = true;

    // Mock form fields
    cardNumber: string = '';
    cardHolder: string = '';
    cardExpiry: string = '';
    cardCvv: string = '';
    installments: number = 1;

    // Success data
    cardLast4: string = '';
    cardBrand: string = '';
    authCode: string = '';

    // Mercado Pago SDK
    private mp: any = null;
    private cardForm: any = null;
    private loadSub: any = null;

    constructor(
        private route: ActivatedRoute,
        private router: Router,
        private data: DataService,
        private notifier: NotifierService
    ) {}

    ngOnInit(): void {
        this.route.params.subscribe(params => {
            this.ticketNo = params.ticket_no;
            this.loadTicketInfo();
        });
    }

    ngOnDestroy(): void {
        if (this.loadSub) { this.loadSub.unsubscribe(); }
        if (this.cardForm) {
            try { this.cardForm.unmount(); } catch (e) {}
        }
    }

    loadTicketInfo() {
        this.loadSub = this.data.generatePix(this.ticketNo).subscribe(
            (res) => {
                this.amount = res.amount;
                this.initCardForm();
            },
            () => {
                // Fallback: try to get amount from another source
                this.amount = 0;
                this.initCardForm();
            }
        );
    }

    initCardForm() {
        const publicKey = environment.mpPublicKey;
        if (publicKey && typeof MercadoPago !== 'undefined') {
            this.useMockForm = false;
            this.initMercadoPagoForm(publicKey);
        } else {
            this.useMockForm = true;
            this.status = 'form';
        }
    }

    initMercadoPagoForm(publicKey: string) {
        try {
            this.mp = new MercadoPago(publicKey, { locale: 'pt-BR' });
            this.cardForm = this.mp.cardForm({
                amount: String(this.amount),
                autoMount: true,
                form: {
                    id: 'mp-card-form',
                    cardNumber: { id: 'mp-card-number', placeholder: 'Número do cartão' },
                    expirationDate: { id: 'mp-expiration-date', placeholder: 'MM/AA' },
                    securityCode: { id: 'mp-security-code', placeholder: 'CVV' },
                    cardholderName: { id: 'mp-cardholder-name', placeholder: 'Nome no cartão' },
                    installments: { id: 'mp-installments' }
                },
                callbacks: {
                    onFormMounted: (err) => {
                        if (err) {
                            this.useMockForm = true;
                        }
                        this.status = 'form';
                    },
                    onSubmit: (event) => {
                        event.preventDefault();
                        const formData = this.cardForm.getCardFormData();
                        this.processPayment(formData.token, formData.installments);
                    },
                    onError: () => {
                        this.status = 'form';
                    }
                }
            });
        } catch (e) {
            this.useMockForm = true;
            this.status = 'form';
        }
    }

    submitMockForm() {
        if (!this.cardNumber || !this.cardHolder || !this.cardExpiry || !this.cardCvv) {
            this.notifier.addMessage('error', 'Erro', 'Preencha todos os campos do cartão.');
            return;
        }
        const digits = this.cardNumber.replace(/\s/g, '');
        if (digits.length < 13 || digits.length > 19) {
            this.notifier.addMessage('error', 'Erro', 'Número do cartão inválido.');
            return;
        }
        if (!/^\d{2}\/\d{2}$/.test(this.cardExpiry)) {
            this.notifier.addMessage('error', 'Erro', 'Validade inválida. Use o formato MM/AA.');
            return;
        }
        if (this.cardCvv.length < 3) {
            this.notifier.addMessage('error', 'Erro', 'CVV deve ter no mínimo 3 dígitos.');
            return;
        }
        this.processPayment('mock_token_' + Date.now(), this.installments);
    }

    processPayment(cardToken: string, installments?: number) {
        this.status = 'processing';
        this.data.authorizeCard(this.ticketNo, cardToken, installments || 1).subscribe(
            (res) => {
                this.status = 'success';
                this.cardLast4 = res.card_last4;
                this.cardBrand = res.card_brand;
                this.authCode = res.auth_code;
                this.amount = res.amount;
                this.notifier.addMessage('success', 'Pagamento Aprovado', 'Pagamento com cartão confirmado!');
            },
            (err) => {
                this.status = 'error';
                this.errorMessage = err.message || 'Pagamento recusado. Tente novamente ou use outro cartão.';
            }
        );
    }

    formatCardNumber(event: any) {
        let value = event.target.value.replace(/\D/g, '');
        if (value.length > 16) { value = value.substring(0, 16); }
        const parts = value.match(/.{1,4}/g);
        this.cardNumber = parts ? parts.join(' ') : value;
    }

    formatExpiry(event: any) {
        let value = event.target.value.replace(/\D/g, '');
        if (value.length > 4) { value = value.substring(0, 4); }
        if (value.length >= 3) {
            this.cardExpiry = value.substring(0, 2) + '/' + value.substring(2);
        } else {
            this.cardExpiry = value;
        }
    }

    formatCvv(event: any) {
        this.cardCvv = event.target.value.replace(/\D/g, '').substring(0, 4);
    }

    retryPayment() {
        this.status = 'form';
        this.errorMessage = '';
    }

    goBack() {
        this.router.navigateByUrl(`/user/${this.ticketNo}`);
    }

    goToTicket() {
        this.router.navigateByUrl(`/user/${this.ticketNo}`);
    }
}
