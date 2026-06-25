import { Storage } from './Storage';

/**
 * Timer phase - either focus or break period
 */
export type Phase = 'focus' | 'break';

/**
 * Timer status - idle, running, or paused
 */
export type TimerStatus = 'idle' | 'running' | 'paused';

/**
 * Full timer state exposed to UI and external consumers
 */
export interface TimerStateExt {
	remainingSeconds: number;
	phase: Phase;
	status: TimerStatus;
	currentRound: number;
	roundsPerSession: number;
	sessionTitle: string;
	sessionTag: string;
	devOpsTasks: string;
	allComplete: boolean;
	elapsedSeconds: number;
}

/**
 * Subset of the persisted configuration that drives the timer's behaviour.
 */
interface TimerConfig {
	focusDuration: number;
	breakDuration: number;
	roundsPerSession: number;
	autoStartBreaks: boolean;
	autoStartFocus: boolean;
}

/**
 * Event callback types for timer lifecycle
 */
type TickCallback = (state: TimerStateExt) => void;
type PhaseChangeCallback = (phase: Phase) => void;
type CompleteCallback = (round: number) => void;
type SessionCompleteCallback = () => void;

/**
 * Pomodoro Timer with event-driven architecture.
 * Manages focus/break cycles, rounds, and session completion.
 */
export class Timer {
	private storage: Storage;
	private config: TimerConfig;

	// Timer state
	private remainingSeconds: number = 0;
	private phase: Phase = 'focus';
	private status: TimerStatus = 'idle';
	private currentRound: number = 1;
	private allComplete: boolean = false;
	private elapsedSeconds: number = 0;
	private intervalId: NodeJS.Timeout | null = null;

	// Event callbacks
	private tickCallbacks: TickCallback[] = [];
	private phaseChangeCallbacks: PhaseChangeCallback[] = [];
	private completeCallbacks: CompleteCallback[] = [];
	private sessionCompleteCallbacks: SessionCompleteCallback[] = [];

	constructor(storage: Storage) {
		this.storage = storage;
		this.config = storage.getConfig();
		this.resetToPhase('focus');
	}

	// ==================== Event Registration ====================

	onTick(callback: TickCallback): void {
		this.tickCallbacks.push(callback);
	}

	onPhaseChange(callback: PhaseChangeCallback): void {
		this.phaseChangeCallbacks.push(callback);
	}

	onComplete(callback: CompleteCallback): void {
		this.completeCallbacks.push(callback);
	}

	onSessionComplete(callback: SessionCompleteCallback): void {
		this.sessionCompleteCallbacks.push(callback);
	}

	private emitTick(): void {
		const state = this.getState();
		this.tickCallbacks.forEach(cb => cb(state));
	}

	private emitPhaseChange(): void {
		this.phaseChangeCallbacks.forEach(cb => cb(this.phase));
	}

	private emitComplete(): void {
		this.completeCallbacks.forEach(cb => cb(this.currentRound));
	}

	private emitSessionComplete(): void {
		this.sessionCompleteCallbacks.forEach(cb => cb());
	}

	// ==================== Public API ====================

	getState(): TimerStateExt {
		return {
			remainingSeconds: this.remainingSeconds,
			phase: this.phase,
			status: this.status,
			currentRound: this.currentRound,
			roundsPerSession: this.config.roundsPerSession,
			sessionTitle: this.storage.sessionTitle,
			sessionTag: this.storage.sessionTag,
			devOpsTasks: this.storage.devOpsTasks,
			allComplete: this.allComplete,
			elapsedSeconds: this.elapsedSeconds
		};
	}

	start(): void {
		if (this.status === 'running' || this.allComplete) return;

		this.status = 'running';
		this.intervalId = setInterval(() => this.tick(), 1000);
		this.emitTick();
	}

	pause(): void {
		if (this.status !== 'running') return;

		this.status = 'paused';
		this.clearInterval();
		this.emitTick();
	}

	reset(): void {
		this.clearInterval();
		this.status = 'idle';
		this.allComplete = false;
		this.currentRound = 1;
		this.elapsedSeconds = 0;
		this.resetToPhase('focus');
		this.emitTick();
	}

	skip(): void {
		if (this.allComplete) return;
		this.handlePhaseComplete();
	}

	setSessionTitle(title: string): void {
		this.storage.sessionTitle = title;
		this.emitTick();
	}

	setSessionTag(tag: string): void {
		this.storage.sessionTag = tag;
		this.emitTick();
	}

	setDevOpsTasks(tasks: string): void {
		this.storage.devOpsTasks = tasks;
		this.emitTick();
	}

	// ==================== Private Methods ====================

	private tick(): void {
		this.remainingSeconds--;
		this.elapsedSeconds++;
		this.emitTick();

		if (this.remainingSeconds <= 0) {
			this.handlePhaseComplete();
		}
	}

	private handlePhaseComplete(): void {
		this.clearInterval();

		if (this.phase === 'focus') {
			this.handleFocusComplete();
		} else {
			this.handleBreakComplete();
		}

		this.emitTick();
	}

	private handleFocusComplete(): void {
		this.phase = 'break';
		this.remainingSeconds = this.config.breakDuration * 60;
		this.status = 'idle';
		this.emitPhaseChange();

		if (this.config.autoStartBreaks) {
			setTimeout(() => this.start(), 1000);
		}
	}

	private handleBreakComplete(): void {
		this.emitComplete();

		if (this.currentRound >= this.config.roundsPerSession) {
			this.completeSession();
			return;
		}

		this.startNextRound();
	}

	private startNextRound(): void {
		this.currentRound++;
		this.phase = 'focus';
		this.remainingSeconds = this.config.focusDuration * 60;
		this.status = 'idle';
		this.emitPhaseChange();

		if (this.config.autoStartFocus) {
			setTimeout(() => this.start(), 1000);
		}
	}

	private completeSession(): void {
		this.allComplete = true;
		this.status = 'idle';
		this.phase = 'focus';
		this.remainingSeconds = this.config.focusDuration * 60;
		this.emitSessionComplete();
	}

	private resetToPhase(phase: Phase): void {
		this.remainingSeconds = (phase === 'focus' ? this.config.focusDuration : this.config.breakDuration) * 60;
		this.phase = phase;
		this.status = 'idle';
	}

	private clearInterval(): void {
		if (this.intervalId) {
			clearInterval(this.intervalId);
			this.intervalId = null;
		}
	}

	/** Reloads the timer configuration from persisted settings. */
	refreshConfig(): void {
		this.config = this.storage.getConfig();
	}

	applyConfigToRunningPhase(): void {
		const newDuration = (this.phase === 'focus' ? this.config.focusDuration : this.config.breakDuration) * 60;
		this.remainingSeconds = newDuration;
		if (this.status !== 'running') {
			this.emitTick();
		}
	}
}