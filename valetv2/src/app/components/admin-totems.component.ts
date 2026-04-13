import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';

import { AdminService } from '../services/admin.service';
import { TokenUtilService } from '../services/token-util.service';
import { NotifierService } from '../services/notifier.service';
import { NgxSpinnerService } from 'ngx-spinner';

@Component({
    selector: 'app-admin-totems',
    templateUrl: '../templates/admin-totems.component.html',
    styleUrls: ['../../styles/components/admin-totems.component.scss']
})
export class AdminTotemsComponent implements OnInit {

    devices: any[] = [];
    transactions: any[] = [];
    showForm = false;
    newDevice = { device_name: '' };
    confirmDeleteId: number | null = null;
    createdKey: string | null = null;

    // Filters
    filterDeviceId: string = '';
    filterAction: string = '';

    activeTab: 'devices' | 'transactions' = 'devices';

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
        this.loadDevices();
    }

    switchTab(tab: 'devices' | 'transactions') {
        this.activeTab = tab;
        if (tab === 'devices') { this.loadDevices(); }
        else { this.loadTransactions(); }
    }

    loadDevices() {
        this.spinner.show();
        this.admin.getTotemDevices().subscribe(
            (data) => { this.devices = data; this.spinner.hide(); },
            () => { this.spinner.hide(); }
        );
    }

    loadTransactions() {
        this.spinner.show();
        const params: any = {};
        if (this.filterDeviceId) { params.device_id = parseInt(this.filterDeviceId, 10); }
        if (this.filterAction) { params.action = this.filterAction; }
        this.admin.getTotemTransactions(params).subscribe(
            (data) => { this.transactions = data; this.spinner.hide(); },
            () => { this.spinner.hide(); }
        );
    }

    toggleForm() {
        this.showForm = !this.showForm;
        this.createdKey = null;
        if (!this.showForm) { this.newDevice = { device_name: '' }; }
    }

    createDevice() {
        if (!this.newDevice.device_name) {
            this.notifier.addMessage('error', 'Erro', 'Informe o nome do dispositivo.');
            return;
        }
        this.spinner.show();
        this.admin.createTotemDevice(this.newDevice.device_name).subscribe(
            (res) => {
                if (res && res.api_key) {
                    this.createdKey = res.api_key;
                }
                this.notifier.addMessage('success', 'Sucesso', `Totem '${this.newDevice.device_name}' criado.`);
                this.newDevice = { device_name: '' };
                this.showForm = false;
                this.loadDevices();
            },
            () => { this.spinner.hide(); }
        );
    }

    toggleActive(device: any) {
        this.spinner.show();
        this.admin.updateTotemDevice(device.id, { is_active: !device.is_active }).subscribe(
            () => {
                this.notifier.addMessage('success', 'Sucesso', `Totem ${!device.is_active ? 'ativado' : 'desativado'}.`);
                this.loadDevices();
            },
            () => { this.spinner.hide(); }
        );
    }

    confirmDelete(id: number) { this.confirmDeleteId = id; }
    cancelDelete() { this.confirmDeleteId = null; }

    deleteDevice(id: number) {
        this.spinner.show();
        this.confirmDeleteId = null;
        this.admin.deleteTotemDevice(id).subscribe(
            () => {
                this.notifier.addMessage('success', 'Sucesso', 'Totem removido.');
                this.loadDevices();
            },
            () => { this.spinner.hide(); }
        );
    }

    getStatusClass(device: any): string {
        if (!device.is_active) { return 'status-off'; }
        if (!device.last_heartbeat) { return 'status-unknown'; }
        const diff = Date.now() - new Date(device.last_heartbeat).getTime();
        return diff < 300000 ? 'status-online' : 'status-offline';
    }

    getStatusLabel(device: any): string {
        if (!device.is_active) { return 'Desativado'; }
        if (!device.last_heartbeat) { return 'Sem contato'; }
        const diff = Date.now() - new Date(device.last_heartbeat).getTime();
        return diff < 300000 ? 'Online' : 'Offline';
    }

    logout() {
        localStorage.removeItem('token_v');
        this.router.navigateByUrl('/valet/login');
    }
}
