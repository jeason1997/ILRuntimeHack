/*---------------------------------------------------------
 * Copyright (C) Microsoft Corporation. All rights reserved.
 *--------------------------------------------------------*/
/*
 * activateMockDebug.ts containes the shared extension code that can be executed both in node.js and the browser.
 */

'use strict';

import * as vscode from 'vscode';
import { WorkspaceFolder, DebugConfiguration, ProviderResult, CancellationToken } from 'vscode';
import { MockDebugSession } from './mockDebug';
import { FileAccessor } from './mockRuntime';
import { ServerInfo } from './extension';
import * as path from 'path';

let extensionPath:string;
function getExtensionFilePath(extensionfile: string): string {
    return path.resolve(extensionPath, extensionfile);
}

class InstanceEntry implements vscode.QuickPickItem{
	label: string;
	kind?: vscode.QuickPickItemKind | undefined;
	description?: string | undefined;
	detail?: string | undefined;
	picked?: boolean | undefined;
	alwaysShow?: boolean | undefined;
	buttons?: readonly vscode.QuickInputButton[] | undefined;
	address:string;

	constructor(address:string, machineName:string, project:string, processId:number){
		this.label = `${project}(${machineName}:${processId})`;
		this.detail = address;
		this.address = address;
	}
}
class RefreshButton implements vscode.QuickInputButton {
    get iconPath(): { dark: vscode.Uri; light: vscode.Uri } {
        const refreshImagePathDark: string = getExtensionFilePath("images/Refresh_inverse.svg");
        const refreshImagePathLight: string = getExtensionFilePath("images/Refresh.svg");

        return {
            dark: vscode.Uri.file(refreshImagePathDark),
            light: vscode.Uri.file(refreshImagePathLight)
        };
    }

    get tooltip(): string {
        return "Refresh instance list";
    }
}
function buildInstanceEntries(servers : Map<string, ServerInfo>) : InstanceEntry[]{
	let res = new Array<InstanceEntry>();
	let expired :string[] = [];
	servers.forEach((value, key, map)=>{
		if(value.isExipired()){
			expired.push(key);
		}
		else{
			res.push(new InstanceEntry(value.getAddress(), value.getMachine(), value.getProject(), value.getProcessId()));
		}
	});
	expired.forEach((value, index, arr)=>{
		servers.delete(value);
	});
	return res;
}

export function activateMockDebug(context: vscode.ExtensionContext, servers : Map<string, ServerInfo>, factory?: vscode.DebugAdapterDescriptorFactory) {
	extensionPath = context.extensionPath;
	context.subscriptions.push(
		vscode.commands.registerCommand('extension.ilruntime-debug.debugEditorContents', (resource: vscode.Uri) => {
			let targetResource = resource;
			if (!targetResource && vscode.window.activeTextEditor) {
				targetResource = vscode.window.activeTextEditor.document.uri;
			}
			if (targetResource) {
				vscode.debug.startDebugging(undefined, {
					type: 'ilruntime',
					name: 'Debug File',
					request: 'launch',
					program: targetResource.fsPath,
					stopOnEntry: true
				});
			}
		}),
		vscode.commands.registerCommand('extension.ilruntime-debug.toggleFormatting', (variable) => {
			const ds = vscode.debug.activeDebugSession;
			if (ds) {
				ds.customRequest('toggleFormatting');
			}
		})
	);

	context.subscriptions.push(vscode.commands.registerCommand('extension.ilruntime-debug.getAddress', config => {		
		let result = new Promise<string>((resolve, reject)=>{
			let quickPick = vscode.window.createQuickPick<InstanceEntry>();
			quickPick.title = "Attach to ILRuntime instance";
			quickPick.items = buildInstanceEntries(servers);
			quickPick.canSelectMany = false;
			quickPick.matchOnDescription = true;
			quickPick.matchOnDetail = true;
			quickPick.placeholder = "Select the instance to attach to";
			quickPick.buttons = [new RefreshButton()];
			let disposables: vscode.Disposable[] = [];

			quickPick.onDidTriggerButton(button => {
				quickPick.items = buildInstanceEntries(servers);
			}, undefined, disposables);
	
			quickPick.onDidAccept(() => {
				if (quickPick.selectedItems.length !== 1) {
					reject(new Error("Process not selected"));
				}
	
				let address: string = quickPick.selectedItems[0].address;
	
				disposables.forEach(item => item.dispose());
				quickPick.dispose();
	
				resolve(address);
			}, undefined, disposables);
	
			quickPick.onDidHide(() => {
				disposables.forEach(item => item.dispose());
				quickPick.dispose();
	
				reject(new Error("Process not selected."));
			}, undefined, disposables);
	
			quickPick.show();
		});

		
			
		return result;
	}));

	// register a configuration provider for 'mock' debug type
	const provider = new MockConfigurationProvider();
	context.subscriptions.push(vscode.debug.registerDebugConfigurationProvider('ilruntime', provider));

	// register a dynamic configuration provider for 'mock' debug type
	context.subscriptions.push(vscode.debug.registerDebugConfigurationProvider('ilruntime', {
		provideDebugConfigurations(folder: WorkspaceFolder | undefined): ProviderResult<DebugConfiguration[]> {
			return [
				{
					name: "Dynamic Launch",
					request: "launch",
					type: "ilruntime",
					program: "${file}"
				},
				{
					name: "Another Dynamic Launch",
					request: "launch",
					type: "ilruntime",
					program: "${file}"
				},
				{
					name: "Mock Launch",
					request: "launch",
					type: "ilruntime",
					program: "${file}"
				}
			];
		}
	}, vscode.DebugConfigurationProviderTriggerKind.Dynamic));

	if (!factory) {
		factory = new InlineDebugAdapterFactory();
	}
	context.subscriptions.push(vscode.debug.registerDebugAdapterDescriptorFactory('ilruntime', factory));
	if ('dispose' in factory) {
		context.subscriptions.push(factory);
	}

	// override VS Code's default implementation of the debug hover
	// here we match only Mock "variables", that are words starting with an '$'
	context.subscriptions.push(vscode.languages.registerEvaluatableExpressionProvider('csharp', {
		provideEvaluatableExpression(document: vscode.TextDocument, position: vscode.Position): vscode.ProviderResult<vscode.EvaluatableExpression> {

			const VARIABLE_REGEXP = /\$[a-z][a-z0-9]*/ig;
			const line = document.lineAt(position.line).text;

			let m: RegExpExecArray | null;
			while (m = VARIABLE_REGEXP.exec(line)) {
				const varRange = new vscode.Range(position.line, m.index, position.line, m.index + m[0].length);

				if (varRange.contains(position)) {
					return new vscode.EvaluatableExpression(varRange);
				}
			}
			return undefined;
		}
	}));

	// override VS Code's default implementation of the "inline values" feature"
	context.subscriptions.push(vscode.languages.registerInlineValuesProvider('csharp', {

		provideInlineValues(document: vscode.TextDocument, viewport: vscode.Range, context: vscode.InlineValueContext) : vscode.ProviderResult<vscode.InlineValue[]> {

			const allValues: vscode.InlineValue[] = [];

			for (let l = viewport.start.line; l <= context.stoppedLocation.end.line; l++) {
				const line = document.lineAt(l);
				var regExp = /\$([a-z][a-z0-9]*)/ig;	// variables are words starting with '$'
				do {
					var m = regExp.exec(line.text);
					if (m) {
						const varName = m[1];
						const varRange = new vscode.Range(l, m.index, l, m.index + varName.length);

						// some literal text
						//allValues.push(new vscode.InlineValueText(varRange, `${varName}: ${viewport.start.line}`));

						// value found via variable lookup
						allValues.push(new vscode.InlineValueVariableLookup(varRange, varName, false));

						// value determined via expression evaluation
						//allValues.push(new vscode.InlineValueEvaluatableExpression(varRange, varName));
					}
				} while (m);
			}

			return allValues;
		}
	}));
}

class MockConfigurationProvider implements vscode.DebugConfigurationProvider {

	/**
	 * Massage a debug configuration just before a debug session is being launched,
	 * e.g. add all missing attributes to the debug configuration.
	 */
	resolveDebugConfiguration(folder: WorkspaceFolder | undefined, config: DebugConfiguration, token?: CancellationToken): ProviderResult<DebugConfiguration> {

		// if launch.json is missing or empty
		if (!config.type && !config.request && !config.name) {
			const editor = vscode.window.activeTextEditor;
			if (editor && editor.document.languageId === 'csharp') {
				config.type = 'ilruntime';
				config.name = 'Launch';
				config.request = 'launch';
				config.address = '${command:AskForAddress}';
				config.stopOnEntry = true;
			}
		}

		if (!config.address) {
			return vscode.window.showInformationMessage("Cannot find a program to debug").then(_ => {
				return undefined;	// abort launch
			});
		}

		return config;
	}
}

export const workspaceFileAccessor: FileAccessor = {
	async readFile(path: string): Promise<Uint8Array> {
		let uri: vscode.Uri;
		try {
			uri = pathToUri(path);
		} catch (e) {
			return new TextEncoder().encode(`cannot read '${path}'`);
		}

		return await vscode.workspace.fs.readFile(uri);
	},
	async writeFile(path: string, contents: Uint8Array) {
		await vscode.workspace.fs.writeFile(pathToUri(path), contents);
	}
};

function pathToUri(path: string) {
	try {
		return vscode.Uri.file(path);
	} catch (e) {
		return vscode.Uri.parse(path);
	}
}

class InlineDebugAdapterFactory implements vscode.DebugAdapterDescriptorFactory {

	createDebugAdapterDescriptor(_session: vscode.DebugSession): ProviderResult<vscode.DebugAdapterDescriptor> {
		return new vscode.DebugAdapterInlineImplementation(new MockDebugSession(workspaceFileAccessor));
	}
}
