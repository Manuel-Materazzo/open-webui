<script lang="ts">
	import { getContext } from 'svelte';
	import { toast } from 'svelte-sonner';
	import Spinner from '$lib/components/common/Spinner.svelte';
	import Tooltip from '$lib/components/common/Tooltip.svelte';
	import { executeSlotAction, prefillAndSaveSlot } from '$lib/apis/openai';

	const i18n = getContext('i18n');

	export let slot: {
		enabled?: boolean;
		slot_id?: number;
		filename?: string;
		auto_restore?: boolean;
	} = {
		enabled: false,
		slot_id: 0,
		filename: '',
		auto_restore: true
	};

	export let system: string = '';
	export let toolIds: string[] = [];
	export let baseModelId: string | null = null;
	export let modelId: string = '';
	export let modelName: string = '';

	let loadingAction: string | null = null;
	let lastStatus: string | null = null;

	// Suggest default filename if empty
	$: suggestedFilename = (modelId || modelName || 'agent')
		.toLowerCase()
		.replace(/\s+/g, '-')
		.replace(/[^a-z0-9-_]/g, '') + '.bin';

	$: if (!slot.filename && suggestedFilename) {
		slot.filename = suggestedFilename;
	}

	const getEffectiveFilename = () => {
		return (slot.filename || suggestedFilename || 'agent.bin').trim();
	};

	const handlePrefillAndSave = async () => {
		const filename = getEffectiveFilename();
		if (!filename) {
			toast.error($i18n.t('Snapshot filename is required.'));
			return;
		}

		loadingAction = 'prefill';
		try {
			const res = await prefillAndSaveSlot(localStorage.token, {
				model_id: modelId || undefined,
				base_model_id: baseModelId || undefined,
				slot_id: Number(slot.slot_id) || 0,
				filename: filename,
				system: system || undefined,
				tool_ids: toolIds.length > 0 ? toolIds : undefined
			});

			slot.filename = filename;
			lastStatus = `Saved (${filename})`;
			toast.success(
				$i18n.t('Slot {{slot}} prefilled and saved to {{filename}} successfully!', {
					slot: Number(slot.slot_id) || 0,
					filename: filename
				})
			);
		} catch (err: any) {
			console.error('Failed to prefill and save slot:', err);
			toast.error(err?.message || err || $i18n.t('Failed to prefill and save slot'));
		} finally {
			loadingAction = null;
		}
	};

	const handleRestore = async () => {
		const filename = getEffectiveFilename();
		if (!filename) {
			toast.error($i18n.t('Snapshot filename is required to restore.'));
			return;
		}

		loadingAction = 'restore';
		try {
			await executeSlotAction(localStorage.token, {
				model_id: modelId || undefined,
				base_model_id: baseModelId || undefined,
				slot_id: Number(slot.slot_id) || 0,
				action: 'restore',
				filename: filename
			});

			lastStatus = `Restored (${filename})`;
			toast.success(
				$i18n.t('Slot {{slot}} restored from {{filename}}!', {
					slot: Number(slot.slot_id) || 0,
					filename: filename
				})
			);
		} catch (err: any) {
			console.error('Failed to restore slot:', err);
			toast.error(err?.message || err || $i18n.t('Failed to restore slot'));
		} finally {
			loadingAction = null;
		}
	};

	const handleErase = async () => {
		loadingAction = 'erase';
		try {
			await executeSlotAction(localStorage.token, {
				model_id: modelId || undefined,
				base_model_id: baseModelId || undefined,
				slot_id: Number(slot.slot_id) || 0,
				action: 'erase'
			});

			lastStatus = 'Erased';
			toast.success($i18n.t('Slot {{slot}} erased!', { slot: Number(slot.slot_id) || 0 }));
		} catch (err: any) {
			console.error('Failed to erase slot:', err);
			toast.error(err?.message || err || $i18n.t('Failed to erase slot'));
		} finally {
			loadingAction = null;
		}
	};
</script>

<div class="my-3">
	<div class="mb-1 flex w-full items-center justify-between">
		<div class="flex items-center gap-1.5 self-center text-xs text-gray-400 dark:text-gray-600">
			<span>{$i18n.t('llama.cpp Slot Cache')}</span>
			<Tooltip
				content={$i18n.t(
					'Pre-compute and persist KV cache snapshot for system prompt and tools into a llama.cpp slot to skip repeating prefill latency.'
				)}
			>
				<svg
					xmlns="http://www.w3.org/2000/svg"
					fill="none"
					viewBox="0 0 24 24"
					stroke-width="1.5"
					stroke="currentColor"
					class="size-3.5 text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300"
				>
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						d="m11.25 11.25.041-.02a.75.75 0 0 1 1.063.852l-.708 2.836a.75.75 0 0 0 1.063.853l.041-.021M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9-3.75h.008v.008H12V8.25Z"
					/>
				</svg>
			</Tooltip>
		</div>

		<button
			class="text-xs text-gray-500 transition hover:text-gray-700 dark:hover:text-gray-300"
			type="button"
			on:click={() => {
				slot.enabled = !slot.enabled;
			}}
		>
			{#if slot.enabled}
				<span>{$i18n.t('Enabled')}</span>
			{:else}
				<span>{$i18n.t('Disabled')}</span>
			{/if}
		</button>
	</div>

	{#if slot.enabled}
		<div
			class="mt-2 space-y-3 rounded-xl border border-gray-100 bg-gray-50/50 p-3 dark:border-gray-800 dark:bg-gray-850/40"
		>
			<div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
				<div>
					<label for="slot-id-input" class="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400">
						{$i18n.t('Slot ID')}
					</label>
					<input
						id="slot-id-input"
						type="number"
						min="0"
						class="w-full rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs text-gray-800 outline-hidden transition focus:border-gray-400 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 dark:focus:border-gray-600"
						placeholder="0"
						bind:value={slot.slot_id}
					/>
				</div>

				<div>
					<label for="slot-filename-input" class="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400">
						{$i18n.t('Snapshot Filename (.bin)')}
					</label>
					<input
						id="slot-filename-input"
						type="text"
						class="w-full rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs text-gray-800 outline-hidden transition focus:border-gray-400 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 dark:focus:border-gray-600"
						placeholder={suggestedFilename}
						bind:value={slot.filename}
					/>
				</div>
			</div>

			<div class="flex items-center justify-between py-1">
				<div class="flex flex-col">
					<span class="text-xs font-medium text-gray-700 dark:text-gray-300">
						{$i18n.t('Auto-restore on use')}
					</span>
					<span class="text-[0.6875rem] text-gray-400 dark:text-gray-500">
						{$i18n.t('Automatically restore this slot cache when the model is selected or used in chat.')}
					</span>
				</div>

				<input
					type="checkbox"
					class="size-4 cursor-pointer rounded border-gray-300 text-black accent-black dark:accent-white"
					bind:checked={slot.auto_restore}
				/>
			</div>

			<div class="flex flex-wrap items-center gap-2 border-t border-gray-100 pt-2 dark:border-gray-800">
				<div class="flex items-center gap-1.5 text-[0.6875rem] text-gray-400 dark:text-gray-500">
					<span>{$i18n.t('Payload:')}</span>
					<span class="rounded bg-gray-200/60 px-1.5 py-0.5 font-mono dark:bg-gray-750">
						{system ? `${system.length} chars prompt` : 'No prompt'}
					</span>
					<span class="rounded bg-gray-200/60 px-1.5 py-0.5 font-mono dark:bg-gray-750">
						{toolIds.length > 0 ? `${toolIds.length} tools` : '0 tools'}
					</span>
				</div>

				{#if lastStatus}
					<div class="ml-auto text-[0.6875rem] text-emerald-600 dark:text-emerald-400">
						✓ {lastStatus}
					</div>
				{/if}
			</div>

			<div class="flex flex-wrap items-center gap-2 pt-1">
				<button
					type="button"
					class="flex items-center gap-1.5 rounded-lg bg-black px-3 py-1.5 text-xs font-medium text-white transition hover:bg-gray-800 disabled:opacity-50 dark:bg-white dark:text-black dark:hover:bg-gray-200"
					disabled={loadingAction !== null}
					on:click={handlePrefillAndSave}
				>
					{#if loadingAction === 'prefill'}
						<Spinner className="size-3" />
						<span>{$i18n.t('Prefilling & Saving...')}</span>
					{:else}
						<svg
							xmlns="http://www.w3.org/2000/svg"
							viewBox="0 0 20 20"
							fill="currentColor"
							class="size-3.5"
						>
							<path
								d="M11.983 1.907a.75.75 0 0 0-1.292-.657l-8.5 9.5A.75.75 0 0 0 2.75 12h6.572l-1.305 6.093a.75.75 0 0 0 1.292.657l8.5-9.5A.75.75 0 0 0 17.25 8h-6.572l1.305-6.093Z"
							/>
						</svg>
						<span>{$i18n.t('Prefill & Save Slot')}</span>
					{/if}
				</button>

				<button
					type="button"
					class="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 transition hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-750"
					disabled={loadingAction !== null}
					on:click={handleRestore}
				>
					{#if loadingAction === 'restore'}
						<Spinner className="size-3" />
						<span>{$i18n.t('Restoring...')}</span>
					{:else}
						<svg
							xmlns="http://www.w3.org/2000/svg"
							fill="none"
							viewBox="0 0 24 24"
							stroke-width="1.5"
							stroke="currentColor"
							class="size-3.5"
						>
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99"
							/>
						</svg>
						<span>{$i18n.t('Restore Slot')}</span>
					{/if}
				</button>

				<button
					type="button"
					class="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-500 transition hover:bg-red-50 hover:text-red-600 disabled:opacity-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400 dark:hover:bg-red-950/30 dark:hover:text-red-400"
					disabled={loadingAction !== null}
					on:click={handleErase}
				>
					{#if loadingAction === 'erase'}
						<Spinner className="size-3" />
						<span>{$i18n.t('Erasing...')}</span>
					{:else}
						<svg
							xmlns="http://www.w3.org/2000/svg"
							fill="none"
							viewBox="0 0 24 24"
							stroke-width="1.5"
							stroke="currentColor"
							class="size-3.5"
						>
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0"
							/>
						</svg>
						<span>{$i18n.t('Erase Slot')}</span>
					{/if}
				</button>
			</div>
		</div>
	{/if}
</div>
