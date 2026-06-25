import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { Timer, Phase } from './Timer';
import { Storage, SessionRecord } from './Storage';

// Extension state
let timer: Timer;
let storage: Storage;
let statusBarItem: vscode.StatusBarItem;
let currentPanel: vscode.WebviewPanel | undefined;

/**
 * Activates the extension, registers commands, and sets up timer event handlers
 */
export function activate(context: vscode.ExtensionContext): void {
	storage = new Storage(context);
	timer = new Timer(storage);
	createStatusBar();
	registerTimerEvents();
	registerOpenCommand(context);
	registerCloseCommand(context);
}

// ==================== Helpers ====================

/** Formats a duration in seconds as a zero-padded MM:SS string. */
function formatTime(totalSeconds: number): string {
	const minutes = Math.floor(totalSeconds / 60);
	const seconds = totalSeconds % 60;
	return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}

/** Returns the human-readable label for a timer phase. */
function phaseLabel(phase: Phase): string {
	return phase === 'focus' ? 'Focus' : 'Break';
}

// ==================== Status Bar ====================

function createStatusBar(): void {
	statusBarItem = vscode.window.createStatusBarItem(
		vscode.StatusBarAlignment.Left,
		100
	);
	const state = timer.getState();
	statusBarItem.text = `${phaseLabel(state.phase)}: ${formatTime(state.remainingSeconds)}`;
	statusBarItem.tooltip = 'Laiqon Pomodoro';
	statusBarItem.command = 'laiqon-pomodoro-focus.open';
	statusBarItem.show();
}

// ==================== Command Registration ====================

function registerOpenCommand(context: vscode.ExtensionContext): void {
	context.subscriptions.push(
		vscode.commands.registerCommand('laiqon-pomodoro-focus.open', () => openPanel(context))
	);
}

function registerCloseCommand(context: vscode.ExtensionContext): void {
	context.subscriptions.push(
		vscode.commands.registerCommand('laiqon-pomodoro-focus.close', () => {
			statusBarItem.hide();
			currentPanel?.dispose();
		})
	);
}

// ==================== Timer Events ====================

function registerTimerEvents(): void {
	timer.onTick(handleTick);
	timer.onPhaseChange(handlePhaseChange);
	timer.onSessionComplete(handleSessionComplete);
}

function handleTick(state: { remainingSeconds: number; phase: Phase; allComplete?: boolean }): void {
	statusBarItem.text = state.allComplete
		? 'Session completed!'
		: `${phaseLabel(state.phase)}: ${formatTime(state.remainingSeconds)}`;

	currentPanel?.webview.postMessage({ type: 'timerUpdate', state });
}

function handlePhaseChange(phase: Phase): void {
	vscode.window.showInformationMessage(`🍅 ${phaseLabel(phase)} started!`);
	currentPanel?.webview.postMessage({ type: 'phaseChange', phase });
	if (storage.getConfig().enableSounds) {
		currentPanel?.webview.postMessage({ type: 'playSound', sound: phase });
	}
}

function handleSessionComplete(): void {
	const state = timer.getState();
	const record: SessionRecord = {
		id: Date.now().toString(),
		date: new Date().toISOString(),
		durationSeconds: state.elapsedSeconds,
		title: state.sessionTitle || 'Untitled Session',
		tasks: state.devOpsTasks || '',
		type: state.sessionTag || 'Work'
	};

	storage.addSession(record).then(() => {
		currentPanel?.webview.postMessage({ type: 'history', history: storage.getHistory() });
	});

	if (storage.getConfig().enableSounds) {
		currentPanel?.webview.postMessage({ type: 'playSound', sound: 'session' });
	}

	vscode.window.showInformationMessage(`🍅 Session "${record.title}" complete! Saved to history.`);
}

// ==================== Panel Management ====================

function openPanel(context: vscode.ExtensionContext): void {
	if (currentPanel) {
		currentPanel.reveal(vscode.ViewColumn.One);
		return;
	}

	const panel = vscode.window.createWebviewPanel(
		'laiqon-pomodoro-focus.panel',
		'Laiqon Pomodoro',
		vscode.ViewColumn.One,
		{
			enableScripts: true,
			retainContextWhenHidden: true,
			localResourceRoots: [vscode.Uri.joinPath(context.extensionUri, 'src')]
		}
	);

	currentPanel = panel;
	panel.webview.html = getHtmlContent(context);
	panel.webview.onDidReceiveMessage(handleMessage);
	panel.onDidDispose(() => { currentPanel = undefined; });

	panel.webview.postMessage({
		type: 'init',
		state: timer.getState(),
		config: storage.getConfig(),
		history: storage.getHistory()
	});
}

function handleMessage(message: { type: string; [key: string]: unknown }): void {
	switch (message.type) {
		case 'start': timer.start(); break;
		case 'pause': timer.pause(); break;
		case 'reset': timer.reset(); break;
		case 'skip': timer.skip(); break;
		case 'setTitle': timer.setSessionTitle(message.title as string); break;
		case 'setTag': timer.setSessionTag(message.tag as string); break;
		case 'setDevOpsTasks': timer.setDevOpsTasks(message.tasks as string); break;
		case 'updateConfig': 
			storage.updateConfig(message.config as Record<string, unknown>);
			timer.refreshConfig();
			timer.applyConfigToRunningPhase();
			handleTick(timer.getState());
			break;
		case 'getHistory':
			currentPanel?.webview.postMessage({ type: 'history', history: storage.getHistory() });
			break;
		case 'deleteSession':
			storage.deleteSession(message.id as string).then(() => {
				currentPanel?.webview.postMessage({ type: 'history', history: storage.getHistory() });
			});
			break;
		case 'clearHistory':
			storage.clearHistory().then(() => {
				currentPanel?.webview.postMessage({ type: 'history', history: storage.getHistory() });
			});
			break;
	}
}

function getHtmlContent(context: vscode.ExtensionContext): string {
	const htmlPath = path.join(context.extensionUri.fsPath, 'src', 'panel.html');
	try {
		return fs.readFileSync(htmlPath, 'utf-8');
	} catch (error) {
		vscode.window.showErrorMessage(`Failed to load panel: ${error instanceof Error ? error.message : 'Unknown error'}`);
		return '<html><body><h1>Error loading panel</h1></body></html>';
	}
}

// ==================== Lifecycle ====================

export function deactivate(): void {
	currentPanel?.dispose();
}