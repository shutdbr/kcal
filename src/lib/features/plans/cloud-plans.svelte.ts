import * as repository from './repository';
import type { CloudPlan } from './repository';

/** Per-panel state. Ignore requests that finish after sign-out, account changes or unmount. */
export class CloudPlans {
	items = $state<CloudPlan[]>([]);
	busy = $state(false);
	loaded = $state(false);
	error = $state('');
	notice = $state('');
	#userId: string | null = null;
	#generation = 0;

	connect(userId: string | null) {
		this.#generation++;
		this.#userId = userId;
		this.items = [];
		this.busy = false;
		this.loaded = false;
		this.error = '';
		this.notice = '';
		if (userId) void this.refresh();
	}

	async #run<T>(operation: (userId: string) => Promise<T>, accept: (result: T) => void) {
		if (this.busy || !this.#userId) return;
		const generation = this.#generation;
		this.busy = true;
		this.error = '';
		this.notice = '';
		try {
			const result = await operation(this.#userId);
			if (generation === this.#generation) accept(result);
		} catch (error) {
			if (generation === this.#generation) {
				this.error = error instanceof Error ? error.message : 'Cloud storage is unavailable. Please retry.';
			}
		} finally {
			if (generation === this.#generation) this.busy = false;
		}
	}

	refresh() {
		return this.#run(repository.listPlans, (items) => {
			this.items = items;
			this.loaded = true;
		});
	}

	save(name: string, snapshot: unknown) {
		return this.#run((user) => repository.createPlan(user, name, snapshot), (plan) => {
			this.items = [plan, ...this.items];
			this.notice = 'Saved to your account.';
		});
	}

	update(plan: CloudPlan, snapshot: unknown) {
		return this.#run((user) => repository.updatePlan(user, plan, snapshot), (updated) => {
			this.items = this.items.map((item) => item.id === updated.id ? updated : item);
			this.notice = 'Cloud copy updated.';
		});
	}

	load(plan: CloudPlan, restore: (snapshot: unknown) => void) {
		return this.#run((user) => repository.readPlan(user, plan.id), (snapshot) => {
			restore(snapshot);
			this.notice = 'Loaded onto your board. Further edits autosave in this browser; update the cloud copy when ready.';
		});
	}

	remove(plan: CloudPlan) {
		return this.#run((user) => repository.deletePlan(user, plan), () => {
			this.items = this.items.filter((item) => item.id !== plan.id);
			this.notice = 'Cloud copy deleted.';
		});
	}
}
