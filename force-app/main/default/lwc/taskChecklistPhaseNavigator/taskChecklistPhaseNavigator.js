import { LightningElement, api, wire } from 'lwc';
import { refreshApex } from '@salesforce/apex';
import { MessageContext, publish } from 'lightning/messageService';
import getTasks from '@salesforce/apex/ServiceAppointmentTaskController.getTasks';
import completeTask from '@salesforce/apex/ServiceAppointmentTaskController.completeTask';
import TASK_COMPLETED_CHANNEL from '@salesforce/messageChannel/ServiceAppointmentTaskCompleted__c';

export default class TaskChecklistPhaseNavigator extends LightningElement {
    @api recordId;

    taskTypes = [];
    selectedPhaseType;
    taskOrder = new Map();
    taskOrderRecordId;
    wiredTasksResult;
    isLoading = true;
    isCompleting = false;
    loadError = false;
    completionError = false;

    @wire(MessageContext)
    messageContext;

    @wire(getTasks, { serviceAppointmentId: '$recordId' })
    wiredTasks(result) {
        this.wiredTasksResult = result;

        if (result.error) {
            this.isLoading = false;
            this.loadError = true;
            return;
        }

        if (!result.data) {
            return;
        }

        this.isLoading = false;
        this.loadError = false;
        if (this.taskOrderRecordId !== this.recordId) {
            this.taskOrder = new Map();
            this.taskOrderRecordId = this.recordId;
            this.selectedPhaseType = undefined;
            this.completionError = false;
        }

        // Keep the displayed order across refreshes, even if Apex changes the order.
        const order = this.taskOrder;
        const tasks = [...result.data].sort((first, second) =>
            (order.get(first.Id) ?? order.size) - (order.get(second.Id) ?? order.size)
        );
        this.taskOrder = new Map(tasks.map((task, index) => [task.Id, index]));

        const groups = new Map();
        for (const task of tasks) {
            const type = task.Type ?? '';
            if (!groups.has(type)) {
                groups.set(type, []);
            }

            groups.get(type).push({
                ...task,
                taskUrl: `/lightning/r/Task/${task.Id}/view`,
                isCompleted: task.Status === 'Completed',
                completionLabel: `Mark complete: ${task.Subject}`
            });
        }

        this.taskTypes = Array.from(groups, ([type, groupTasks]) => {
            const label = type || 'Other tasks';
            const completed = groupTasks.filter(task => task.isCompleted).length;
            const total = groupTasks.length;
            const firstDueDate = groupTasks[0].ActivityDate;
            const sharedDueDate = groupTasks.every(task => task.ActivityDate === firstDueDate)
                ? firstDueDate
                : null;

            return {
                type,
                label,
                tasks: groupTasks,
                completed,
                total,
                sharedDueDate,
                name: `phase-${type}`,
                navigationLabel: `${label} (${completed}/${total})`
            };
        });

        if (!groups.has(this.selectedPhaseType)) {
            const firstOpenPhase = this.taskTypes.find(phase => phase.completed < phase.total);
            this.selectedPhaseType = (firstOpenPhase ?? this.taskTypes[0])?.type;
        }
    }

    get activePhase() {
        return this.taskTypes.find(phase => phase.type === this.selectedPhaseType);
    }

    get activeTasks() {
        const phase = this.activePhase;
        return phase ? phase.tasks.map(task => ({
            ...task,
            showDueDate: !phase.sharedDueDate && Boolean(task.ActivityDate)
        })) : [];
    }

    handlePhaseSelect(event) {
        const selectedPhase = this.taskTypes.find(phase => phase.name === event.detail.name);
        if (selectedPhase) {
            this.selectedPhaseType = selectedPhase.type;
        }
    }

    async handleComplete(event) {
        if (this.isCompleting) {
            return;
        }

        const taskId = event.currentTarget.dataset.id;
        const serviceAppointmentId = this.recordId;
        this.isCompleting = true;
        this.completionError = false;

        try {
            await completeTask({ taskId });
            publish(this.messageContext, TASK_COMPLETED_CHANNEL, { serviceAppointmentId });

            if (this.recordId === serviceAppointmentId) {
                await refreshApex(this.wiredTasksResult);
            }
        } catch (error) {
            if (this.recordId === serviceAppointmentId) {
                this.completionError = true;
            }
            console.error(error);
        } finally {
            this.isCompleting = false;
        }
    }
}
