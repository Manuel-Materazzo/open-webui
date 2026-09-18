<script lang="ts">
	import { getContext, onMount, tick } from 'svelte';

	const i18n = getContext('i18n');

	import Modal from '$lib/components/common/Modal.svelte';
	import Tooltip from '$lib/components/common/Tooltip.svelte';
	import XMark from '$lib/components/icons/XMark.svelte';
	import Database from '$lib/components/icons/Database.svelte';
	import CitationModal from './CitationModal.svelte';
	import SaveToKnowledgeModal from '../SaveToKnowledgeModal.svelte';

	export let id = '';
	export let show = false;
	export let citations = [];
	export let showPercentage = false;
	export let showRelevance = true;

	let showCitationModal = false;
	let showSaveToKnowledgeModal = false;
	let selectedCitation: any = null;

	export const showCitation = (citation) => {
		selectedCitation = citation;
		showCitationModal = true;
	};

	const extractWebUrls = (cits: any[]) => {
		const list: Array<{ url: string; name?: string }> = [];
		const seen = new Set<string>();

		for (const cit of cits ?? []) {
			const targetUrl = cit?.source?.url || (cit?.source?.name?.startsWith('http') ? cit.source.name : null);
			if (targetUrl && (targetUrl.startsWith('http://') || targetUrl.startsWith('https://')) && !seen.has(targetUrl)) {
				seen.add(targetUrl);
				list.push({ url: targetUrl, name: cit?.source?.name || targetUrl });
			}
		}

		return list;
	};

	$: webUrls = extractWebUrls(citations);

	const decodeString = (str: string) => {
		try {
			return decodeURIComponent(str);
		} catch (e) {
			return str;
		}
	};
</script>

<CitationModal
	bind:show={showCitationModal}
	citation={selectedCitation}
	{showPercentage}
	{showRelevance}
/>

<Modal size="lg" bind:show>
	<div>
		<div class=" flex justify-between dark:text-gray-300 px-4 pt-3 pb-1">
			<div class=" text-sm font-medium self-center capitalize">
				{$i18n.t('Citations')}
			</div>
			<div class="flex items-center gap-1 self-center">
				{#if webUrls.length > 0}
					<Tooltip content={$i18n.t('Save to Knowledge')} placement="top">
						<button
							class="self-center rounded-lg p-1 text-gray-500 transition hover:bg-gray-50 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-200"
							aria-label={$i18n.t('Save to Knowledge')}
							on:click={() => {
								showSaveToKnowledgeModal = true;
							}}
						>
							<Database className={'size-4'} />
						</button>
					</Tooltip>
				{/if}
				<button
					class="self-center rounded-lg p-1 text-gray-500 transition hover:bg-gray-50 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-200"
					aria-label={$i18n.t('Close')}
					on:click={() => {
						show = false;
					}}
				>
					<XMark className={'size-4'} />
				</button>
			</div>
		</div>

		<div class="flex flex-col md:flex-row w-full px-6 pb-5 md:space-x-4">
			<div
				class="flex flex-col w-full dark:text-gray-200 overflow-y-scroll max-h-[22rem] scrollbar-hidden text-left text-sm gap-2"
			>
				{#each citations as citation, idx}
					<button
						id={`source-${id}-${idx + 1}`}
						class="no-toggle outline-hidden flex dark:text-gray-300 rounded-xl gap-1.5 items-center"
						on:click={() => {
							showCitationModal = true;
							selectedCitation = citation;
						}}
					>
						<div class=" font-normal">
							{idx + 1}.
						</div>
						<div
							class="flex-1 truncate text-black/60 hover:text-black dark:text-white/60 dark:hover:text-white transition text-left"
						>
							{decodeString(citation.source.name)}
						</div>
					</button>
				{/each}
			</div>
		</div>
	</div>
</Modal>

<SaveToKnowledgeModal
	bind:show={showSaveToKnowledgeModal}
	urls={webUrls}
/>
