import { Component, OnInit, OnDestroy } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';

import { DataService } from '../services/data.service';
import { NotifierService } from '../services/notifier.service';

@Component({
    selector: 'app-pix-payment',
    templateUrl: '../templates/pix-payment.component.html',
    styleUrls: ['../../styles/components/pix-payment.component.scss']
})
export class PixPaymentComponent implements OnInit, OnDestroy {

    ticketNo: string = '';
    amount: number = 0;
    qrCode: string = '';
    qrCodeBase64: string = '';
    gatewayPaymentId: string = '';
    expiresAt: Date = null;
    expiresInMinutes: number = 30;
    countdown: string = '';

    status: string = 'loading'; // loading, pending, approved, expired, error
    errorMessage: string = '';
    copied: boolean = false;

    private pollingTimer: any = null;
    private countdownTimer: any = null;
    private alive = true;

    constructor(
        private route: ActivatedRoute,
        private router: Router,
        private data: DataService,
        private notifier: NotifierService
    ) {}

    ngOnInit(): void {
        this.route.params.subscribe(params => {
            this.ticketNo = params.ticket_no;
            this.generatePix();
        });
    }

    ngOnDestroy(): void {
        this.alive = false;
        this.stopPolling();
        this.stopCountdown();
    }

    generatePix() {
        this.status = 'loading';
        this.copied = false;
        this.data.generatePix(this.ticketNo).subscribe(
            (res) => {
                this.amount = res.amount;
                this.qrCode = res.qr_code;
                this.qrCodeBase64 = res.qr_code_base64;
                this.gatewayPaymentId = res.gateway_payment_id;
                this.expiresAt = new Date(res.expires_at);
                this.expiresInMinutes = res.expires_in_minutes || 30;
                this.status = 'pending';
                this.startPolling();
                this.startCountdown();
            },
            (err) => {
                this.status = 'error';
                this.errorMessage = err.message || 'Não foi possível gerar o QR Code PIX.';
            }
        );
    }

    startPolling() {
        this.stopPolling();
        this.pollingTimer = setInterval(() => {
            if (!this.gatewayPaymentId) { return; }
            this.data.getPixStatus(this.gatewayPaymentId).subscribe(
                (res) => {
                    if (!this.alive) { return; }
                    if (res.status === 'approved') {
                        this.status = 'approved';
                        this.stopPolling();
                        this.stopCountdown();
                        this.notifier.addMessage('success', 'Pagamento Confirmado', 'Seu pagamento via PIX foi aprovado!');
                    } else if (res.status === 'expired' || res.status === 'cancelled') {
                        this.status = 'expired';
                        this.stopPolling();
                        this.stopCountdown();
                    } else if (res.status === 'failed') {
                        this.status = 'error';
                        this.errorMessage = 'Pagamento PIX falhou.';
                        this.stopPolling();
                        this.stopCountdown();
                    }
                }
            );
        }, 4000);
    }

    stopPolling() {
        if (this.pollingTimer) {
            clearInterval(this.pollingTimer);
            this.pollingTimer = null;
        }
    }

    startCountdown() {
        this.stopCountdown();
        this.updateCountdown();
        this.countdownTimer = setInterval(() => this.updateCountdown(), 1000);
    }

    stopCountdown() {
        if (this.countdownTimer) {
            clearInterval(this.countdownTimer);
            this.countdownTimer = null;
        }
    }

    updateCountdown() {
        if (!this.expiresAt) { return; }
        const now = new Date().getTime();
        const diff = this.expiresAt.getTime() - now;
        if (diff <= 0) {
            this.countdown = '00:00';
            if (this.status === 'pending') {
                this.status = 'expired';
                this.stopPolling();
                this.stopCountdown();
            }
            return;
        }
        const minutes = Math.floor(diff / 60000);
        const seconds = Math.floor((diff % 60000) / 1000);
        this.countdown = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    }

    copyPixCode() {
        if (!this.qrCode) { return; }
        const textarea = document.createElement('textarea');
        textarea.value = this.qrCode;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
        this.copied = true;
        this.notifier.addMessage('success', 'Copiado', 'Código PIX copiado para a área de transferência.');
        setTimeout(() => this.copied = false, 3000);
    }

    regenerate() {
        this.generatePix();
    }

    goBack() {
        this.router.navigateByUrl(`/user/${this.ticketNo}`);
    }

    goToTicket() {
        this.router.navigateByUrl(`/user/${this.ticketNo}`);
    }
}
