import { LightningElement, api, wire } from 'lwc';
import { refreshApex } from '@salesforce/apex';
import { MessageContext, publish } from 'lightning/messageService';
import getTasks from '@salesforce/apex/ServiceAppointmentTaskController.getTasks';
import completeTask from '@salesforce/apex/ServiceAppointmentTaskController.completeTask';
import TASK_COMPLETED_CHANNEL from '@salesforce/messageChannel/ServiceAppointmentTaskCompleted__c';

export default class ServiceAppointmentTaskChecklist extends LightningElement {
    @api recordId;

    taskTypes = [];
    taskOrder = new Map();
    taskOrderRecordId;
    wiredTasksResult;
    isCompleting = false;

    @wire(MessageContext)
    messageContext;

    @wire(getTasks, { serviceAppointmentId: '$recordId' })
    wiredTasks(result) {
        this.wiredTasksResult = result;

        if (!result.data) {
            return;
        }

        if (this.taskOrderRecordId !== this.recordId) {
            this.taskOrder = new Map();
            this.taskOrderRecordId = this.recordId;
        }

        // Keep the displayed order across refreshes, even if Apex changes the order.
        const order = this.taskOrder;
        const tasks = [...result.data].sort((first, second) =>
            (order.get(first.Id) ?? order.size) - (order.get(second.Id) ?? order.size)
        );
        this.taskOrder = new Map(tasks.map((task, index) => [task.Id, index]));

        const groups = new Map();
        for (const task of tasks) {
            const type = String(task.Type);
            if (!groups.has(type)) {
                groups.set(type, []);
            }

            groups.get(type).push({
                ...task,
                taskUrl: `/lightning/r/Task/${task.Id}/view`,
                isCompleted: task.Status === 'Completed'
            });
        }

        this.taskTypes = Array.from(groups, ([type, groupTasks]) => ({
            type,
            tasks: groupTasks
        }));
    }

    async handleComplete(event) {
        if (this.isCompleting) {
            return;
        }

        const taskId = event.currentTarget.dataset.id;
        const serviceAppointmentId = this.recordId;
        this.isCompleting = true;

        try {
            await completeTask({ taskId });
            publish(this.messageContext, TASK_COMPLETED_CHANNEL, { serviceAppointmentId });

            if (this.recordId === serviceAppointmentId) {
                await refreshApex(this.wiredTasksResult);
            }
        } catch (error) {
            console.error(error);
        } finally {
            this.isCompleting = false;
        }
    }
}
