import { Component, OnInit, OnDestroy } from '@angular/core';
import { Router } from '@angular/router';
import { Subscription } from 'rxjs';

import { AdminService } from '../services/admin.service';
import { TokenUtilService } from '../services/token-util.service';
import { NotifierService } from '../services/notifier.service';
import { NgxSpinnerService } from 'ngx-spinner';

@Component({
    selector: 'app-admin-alerts',
    templateUrl: '../templates/admin-alerts.component.html',
    styleUrls: ['../../styles/components/admin-alerts.component.scss']
})
export class AdminAlertsComponent implements OnInit, OnDestroy {

    config: any = null;
    editing = false;
    private subs: Subscription[] = [];

    editData = {
        alerts_enabled: false,
        alerts_webhook_url: '',
        alerts_events: [] as string[]
    };

    availableEvents = [
        { key: 'LOGIN_VALET_FAIL', label: 'Falha de Login' },
        { key: 'TICKET_BLOCKED_BLACKLIST', label: 'Placa na Blacklist' },
        { key: 'PAYMENT', label: 'Pagamento Realizado' },
        { key: 'OCCUPANCY_HIGH', label: 'Ocupação Alta' },
        { key: 'SYSTEM_ERROR', label: 'Erro do Sistema' },
        { key: 'ENTRY', label: 'Entrada de Veículo' },
        { key: 'EXIT', label: 'Saída de Veículo' }
    ];

    constructor(
        private admin: AdminService,
        private tokenUtil: TokenUtilService,
        private notifier: NotifierService,
        private router: Router,
        private spinner: NgxSpinnerService
    ) {}

    ngOnInit(): void {
        if (!this.tokenUtil.checkTokenExists('token_v')) {
            this.router.navigateByUrl('/valet/login');
            return;
        }
        this.loadConfig();
    }

    loadConfig() {
        this.spinner.show();
        this.subs.push(this.admin.getAlertsConfig().subscribe(
            (data) => {
                this.config = data;
                this.syncEditData();
                this.spinner.hide();
            },
            () => { this.spinner.hide(); }
        ));
    }

    syncEditData() {
        if (!this.config) { return; }
        this.editData.alerts_enabled = this.config.alerts_enabled === 'true' || this.config.alerts_enabled === true;
        this.editData.alerts_webhook_url = this.config.alerts_webhook_url || '';
        const events = this.config.alerts_events || '';
        this.editData.alerts_events = typeof events === 'string' ? (events ? events.split(',') : []) : events;
    }

    toggleEdit() {
        this.editing = !this.editing;
        if (this.editing) {
            this.syncEditData();
        }
    }

    isEventSelected(key: string): boolean {
        return this.editData.alerts_events.indexOf(key) !== -1;
    }

    toggleEvent(key: string) {
        const idx = this.editData.alerts_events.indexOf(key);
        if (idx === -1) {
            this.editData.alerts_events.push(key);
        } else {
            this.editData.alerts_events.splice(idx, 1);
        }
    }

    getEventsList(): string[] {
        const events = this.config ? this.config.alerts_events || '' : '';
        return typeof events === 'string' ? (events ? events.split(',') : []) : events;
    }

    getEventLabel(key: string): string {
        const found = this.availableEvents.find(e => e.key === key);
        return found ? found.label : key;
    }

    saveConfig() {
        if (this.editData.alerts_enabled && !this.editData.alerts_webhook_url) {
            this.notifier.addMessage('error', 'Erro', 'URL do Webhook é obrigatória quando alertas estão ativados.');
            return;
        }

        this.spinner.show();
        this.subs.push(this.admin.updateAlertsConfig({
            alerts_enabled: this.editData.alerts_enabled,
            alerts_webhook_url: this.editData.alerts_webhook_url,
            alerts_events: this.editData.alerts_events
        }).subscribe(
            () => {
                this.notifier.addMessage('success', 'Sucesso', 'Configuração de alertas atualizada.');
                this.editing = false;
                this.loadConfig();
            },
            () => { this.spinner.hide(); }
        ));
    }

    logout() {
        this.tokenUtil.logout();
    }

    ngOnDestroy(): void {
        this.subs.forEach(s => s.unsubscribe());
    }
}
