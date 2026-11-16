import { LightningElement, api, wire } from 'lwc';
import { refreshApex } from '@salesforce/apex';
import { MessageContext, subscribe, unsubscribe } from 'lightning/messageService';
import getTaskProgress from '@salesforce/apex/ServiceAppointmentTaskController.getTaskProgress';
import TASK_COMPLETED_CHANNEL from '@salesforce/messageChannel/ServiceAppointmentTaskCompleted__c';

export default class TaskProgressTracker extends LightningElement {
    @api recordId;

    total = 0;
    completed = 0;
    progress = 0;

    wiredResult;
    subscription;

    @wire(MessageContext)
    messageContext;

    @wire(getTaskProgress, { serviceAppointmentId: '$recordId' })
    wiredTasks(result) {
        this.wiredResult = result;

        if (result.data) {
            this.total = result.data.total;
            this.completed = result.data.completed;
            this.progress = this.total > 0 ? Math.round((this.completed / this.total) * 100) : 0;
        }
    }

    renderedCallback() {
        if (!this.subscription && this.messageContext) {
            this.subscription = subscribe(this.messageContext, TASK_COMPLETED_CHANNEL, (message) => {
                if (this.recordId && message.serviceAppointmentId === this.recordId) {
                    this.handleRefresh();
                }
            });
        }
    }

    disconnectedCallback() {
        if (this.subscription) {
            unsubscribe(this.subscription);
            this.subscription = undefined;
        }
    }

    async handleRefresh() {
        if (this.wiredResult) {
            try {
                await refreshApex(this.wiredResult);
            } catch (error) {
                console.error(error);
            }
        }
    }

    get progressStyle() {
        return `width:${this.progress}%`;
    }
}
