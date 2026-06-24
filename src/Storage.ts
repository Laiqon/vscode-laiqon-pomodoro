import * as vscode from 'vscode';

/**
 * Pomodoro timer configuration settings
 */
export interface PomodoroConfig {
	focusDuration: number;
	breakDuration: number;
	roundsPerSession: number;
	autoStartBreaks: boolean;
	autoStartFocus: boolean;
	backgroundImage: string;
	enableSounds: boolean;
}

/**
 * Record of a completed pomodoro session
 */
export interface SessionRecord {
	id: string;
	date: string;
	durationSeconds: number;
	title: string;
	tasks: string;
	type: string;
}

const DEFAULT_CONFIG: PomodoroConfig = {
	focusDuration: 25,
	breakDuration: 5,
	roundsPerSession: 2,
	autoStartBreaks: true,
	autoStartFocus: false,
	backgroundImage: 'aurora',
	enableSounds: true
};

const HISTORY_KEY = 'pomodoroSessionHistory';

/**
 * Manages extension persistence: configuration and session history.
 */
export class Storage {
	private context: vscode.ExtensionContext;

	// Session metadata (simplified - public access)
	public sessionTitle: string = '';
	public sessionTag: string = 'Work';
	public devOpsTasks: string = '';

	constructor(context: vscode.ExtensionContext) {
		this.context = context;
	}

	/**
	 * Returns current pomodoro configuration with defaults applied
	 */
	getConfig(): PomodoroConfig {
		const config = vscode.workspace.getConfiguration('pomodoro');
		return {
			focusDuration: config.get('focusDuration', DEFAULT_CONFIG.focusDuration),
			breakDuration: config.get('breakDuration', DEFAULT_CONFIG.breakDuration),
			roundsPerSession: config.get('roundsPerSession', DEFAULT_CONFIG.roundsPerSession),
			autoStartBreaks: config.get('autoStartBreaks', DEFAULT_CONFIG.autoStartBreaks),
			autoStartFocus: config.get('autoStartFocus', DEFAULT_CONFIG.autoStartFocus),
			backgroundImage: config.get('backgroundImage', DEFAULT_CONFIG.backgroundImage),
			enableSounds: config.get('enableSounds', DEFAULT_CONFIG.enableSounds)
		};
	}

	/**
	 * Updates configuration values in VS Code settings
	 */
	async updateConfig(updates: Partial<PomodoroConfig>): Promise<void> {
		const config = vscode.workspace.getConfiguration('pomodoro');
		for (const [key, value] of Object.entries(updates)) {
			await config.update(key, value, vscode.ConfigurationTarget.Global);
		}
	}

	/**
	 * Returns all stored session records
	 */
	getHistory(): SessionRecord[] {
		return this.context.globalState.get<SessionRecord[]>(HISTORY_KEY, []);
	}

	/**
	 * Adds a new session record to history
	 */
	async addSession(record: SessionRecord): Promise<void> {
		const history = this.getHistory();
		history.unshift(record);
		await this.context.globalState.update(HISTORY_KEY, history);
	}

	/**
	 * Removes a session record by ID
	 */
	async deleteSession(id: string): Promise<void> {
		const history = this.getHistory().filter(s => s.id !== id);
		await this.context.globalState.update(HISTORY_KEY, history);
	}

	/**
	 * Clears all session history
	 */
	async clearHistory(): Promise<void> {
		await this.context.globalState.update(HISTORY_KEY, []);
	}
}