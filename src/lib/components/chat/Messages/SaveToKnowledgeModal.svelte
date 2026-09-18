<script lang="ts">
	import { getContext, onMount } from 'svelte';
	import { toast } from 'svelte-sonner';

	import Modal from '$lib/components/common/Modal.svelte';
	import Spinner from '$lib/components/common/Spinner.svelte';
	import Tooltip from '$lib/components/common/Tooltip.svelte';
	import XMark from '$lib/components/icons/XMark.svelte';
	import Search from '$lib/components/icons/Search.svelte';
	import Database from '$lib/components/icons/Database.svelte';
	import Check from '$lib/components/icons/Check.svelte';
	import Plus from '$lib/components/icons/Plus.svelte';
	import GlobeAlt from '$lib/components/icons/GlobeAlt.svelte';
	import DocumentText from '$lib/components/icons/DocumentText.svelte';

	import { getKnowledgeBases, searchKnowledgeBases, addFileToKnowledgeById } from '$lib/apis/knowledge';
	import { uploadFile } from '$lib/apis/files';
	import { processUrl } from '$lib/apis/retrieval';
	import { blobToFile, decodeString } from '$lib/utils';

	const i18n = getContext('i18n');

	export let show = false;
	export let content = '';
	export let urls: Array<{ url: string; name?: string }> = [];
	export let defaultTitle = '';

	let knowledgeBases: Array<any> = [];
	let filteredKnowledgeBases: Array<any> = [];
	let selectedKnowledgeId = '';
	let searchQuery = '';
	let loadingKBs = false;
	let saving = false;

	// Mode: 'message' | 'sources'
	let activeTab: 'message' | 'sources' = 'message';
	let selectedUrls: Set<string> = new Set();
	let docTitle = '';

	$: hasContent = !!content && content.trim().length > 0;
	$: hasUrls = urls && urls.length > 0;

	$: if (show) {
		initModal();
	}

	const initModal = async () => {
		searchQuery = '';
		saving = false;

		if (hasUrls && !hasContent) {
			activeTab = 'sources';
		} else if (hasContent && !hasUrls) {
			activeTab = 'message';
		} else if (hasUrls) {
			activeTab = 'sources';
		} else {
			activeTab = 'message';
		}

		if (hasUrls) {
			selectedUrls = new Set(urls.map((u) => u.url));
		} else {
			selectedUrls = new Set();
		}

		if (defaultTitle) {
			docTitle = defaultTitle;
		} else if (hasContent) {
			const clean = content.replace(/[#*`_~]/g, '').trim();
			docTitle = clean.slice(0, 40) || 'chat-response';
		} else if (hasUrls && urls[0]?.name) {
			docTitle = urls[0].name.slice(0, 40);
		} else {
			docTitle = 'document';
		}

		await loadKnowledgeBases();
	};

	const loadKnowledgeBases = async () => {
		loadingKBs = true;
		try {
			const res = await getKnowledgeBases(localStorage.token);
			const items = Array.isArray(res) ? res : res?.items ?? [];
			// Filter to writable knowledge bases
			knowledgeBases = items.filter((kb: any) => kb?.write_access ?? true);
			filteredKnowledgeBases = knowledgeBases;

			if (knowledgeBases.length > 0 && !selectedKnowledgeId) {
				selectedKnowledgeId = knowledgeBases[0].id;
			}
		} catch (err) {
			console.error('Failed to load knowledge bases:', err);
			toast.error($i18n.t('Failed to load knowledge bases.'));
		} finally {
			loadingKBs = false;
		}
	};

	const handleSearchInput = async () => {
		if (!searchQuery.trim()) {
			filteredKnowledgeBases = knowledgeBases;
			return;
		}

		const q = searchQuery.toLowerCase();
		filteredKnowledgeBases = knowledgeBases.filter(
			(kb) =>
				kb.name?.toLowerCase().includes(q) ||
				kb.description?.toLowerCase().includes(q)
		);
	};

	const toggleUrlSelection = (url: string) => {
		if (selectedUrls.has(url)) {
			selectedUrls.delete(url);
		} else {
			selectedUrls.add(url);
		}
		selectedUrls = new Set(selectedUrls);
	};

	const toggleSelectAllUrls = () => {
		if (selectedUrls.size === urls.length) {
			selectedUrls = new Set();
		} else {
			selectedUrls = new Set(urls.map((u) => u.url));
		}
	};

	const sanitizeFilename = (name: string): string => {
		return name
			.replace(/[^a-zA-Z0-9_\-\. ]/g, '_')
			.trim()
			.slice(0, 60);
	};

	const handleSave = async () => {
		if (!selectedKnowledgeId) {
			toast.error($i18n.t('Please select a Knowledge Base.'));
			return;
		}

		const selectedKB = knowledgeBases.find((kb) => kb.id === selectedKnowledgeId);
		if (!selectedKB) {
			toast.error($i18n.t('Selected Knowledge Base not found.'));
			return;
		}

		saving = true;

		try {
			if (activeTab === 'message') {
				if (!content.trim()) {
					toast.error($i18n.t('Message content is empty.'));
					saving = false;
					return;
				}

				const baseName = sanitizeFilename(docTitle || 'chat-message');
				const blob = new Blob([content], { type: 'text/markdown' });
				const file = blobToFile(blob, `${baseName}.md`);

				const uploadedFile = await uploadFile(localStorage.token, file, {
					knowledge_id: selectedKnowledgeId
				});

				if (uploadedFile?.id) {
					await addFileToKnowledgeById(localStorage.token, selectedKnowledgeId, uploadedFile.id).catch(() => {});
					toast.success($i18n.t('Message saved to "{{name}}" successfully!', { name: selectedKB.name }));
					show = false;
				} else {
					toast.error($i18n.t('Failed to save message to knowledge base.'));
				}
			} else if (activeTab === 'sources') {
				const urlsToSave = urls.filter((u) => selectedUrls.has(u.url));

				if (urlsToSave.length === 0) {
					toast.error($i18n.t('Please select at {COUNT} url(s) to save.', { COUNT: 1 }));
					saving = false;
					return;
				}

				let successCount = 0;
				let failCount = 0;

				for (const item of urlsToSave) {
					try {
						const res = await processUrl(localStorage.token, item.url).catch((e) => {
							console.error('Error processing URL:', e);
							return null;
						});

						if (res) {
							let uploadedFile = res.file;

							if (res.type === 'web' || res.type === 'youtube' || res.content) {
								const safeTitle = sanitizeFilename(item.name || item.url.replace(/^https?:\/\//, ''));
								const file = blobToFile(
									new Blob([res.content ?? ''], { type: 'text/plain' }),
									`${safeTitle}.txt`
								);

								uploadedFile = await uploadFile(localStorage.token, file, {
									knowledge_id: selectedKnowledgeId,
									source_url: item.url
								}).catch((e) => {
									console.error(e);
									return null;
								});
							}

							if (uploadedFile?.id) {
								await addFileToKnowledgeById(
									localStorage.token,
									selectedKnowledgeId,
									uploadedFile.id
								).catch(() => {});
								successCount++;
							} else {
								failCount++;
							}
						} else {
							failCount++;
						}
					} catch (e) {
						console.error(`Error saving URL ${item.url}:`, e);
						failCount++;
					}
				}

				if (successCount > 0) {
					toast.success(
						$i18n.t('Added {{COUNT}} source(s) to "{{name}}".', {
							COUNT: successCount,
							name: selectedKB.name
						})
					);
					show = false;
				} else {
					toast.error($i18n.t('Failed to save selected sources.'));
				}
			}
		} catch (err: any) {
			console.error('Error saving to knowledge base:', err);
			toast.error(err?.message || $i18n.t('An error occurred while saving.'));
		} finally {
			saving = false;
		}
	};
</script>

<Modal size="md" bind:show>
	<div class="flex flex-col max-h-[85vh]">
		<!-- Header -->
		<div class="flex justify-between items-center px-5 pt-4 pb-2 border-b border-gray-100 dark:border-gray-800">
			<div class="flex items-center gap-2">
				<div class="p-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400">
					<Database className="size-4" />
				</div>
				<div class="text-base font-medium text-gray-900 dark:text-gray-100">
					{$i18n.t('Save to Knowledge')}
				</div>
			</div>
			<button
				class="rounded-lg p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition"
				aria-label={$i18n.t('Close')}
				on:click={() => {
					show = false;
				}}
			>
				<XMark className="size-4" />
			</button>
		</div>

		<!-- Body -->
		<div class="p-5 flex flex-col gap-4 overflow-y-auto">
			<!-- Mode Switcher (if both content and web search URLs exist) -->
			{#if hasContent && hasUrls}
				<div class="flex p-1 bg-gray-100 dark:bg-gray-800 rounded-lg text-xs font-medium">
					<button
						type="button"
						class="flex-1 py-1.5 px-3 rounded-md flex items-center justify-center gap-1.5 transition {activeTab === 'sources'
							? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-xs'
							: 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'}"
						on:click={() => {
							activeTab = 'sources';
						}}
					>
						<GlobeAlt className="size-3.5" />
						{$i18n.t('Web Sources ({{COUNT}})', { COUNT: urls.length })}
					</button>

					<button
						type="button"
						class="flex-1 py-1.5 px-3 rounded-md flex items-center justify-center gap-1.5 transition {activeTab === 'message'
							? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-xs'
							: 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'}"
						on:click={() => {
							activeTab = 'message';
						}}
					>
						<DocumentText className="size-3.5" />
						{$i18n.t('Message Text')}
					</button>
				</div>
			{/if}

			<!-- Web Sources Selection Tab -->
			{#if activeTab === 'sources' && hasUrls}
				<div class="flex flex-col gap-2">
					<div class="flex justify-between items-center text-xs text-gray-500 dark:text-gray-400">
						<span class="font-medium">{$i18n.t('Select sources to add:')}</span>
						<button
							type="button"
							class="text-blue-600 dark:text-blue-400 hover:underline"
							on:click={toggleSelectAllUrls}
						>
							{selectedUrls.size === urls.length ? $i18n.t('Deselect all') : $i18n.t('Select all')}
						</button>
					</div>

					<div class="flex flex-col gap-1.5 max-h-44 overflow-y-auto border border-gray-200 dark:border-gray-800 rounded-lg p-2">
						{#each urls as item}
							{@const isChecked = selectedUrls.has(item.url)}
							<button
								type="button"
								class="flex items-center gap-2.5 p-2 rounded-md text-left transition {isChecked
									? 'bg-emerald-50/60 dark:bg-emerald-950/30 text-gray-900 dark:text-gray-100'
									: 'hover:bg-gray-50 dark:hover:bg-gray-850 text-gray-600 dark:text-gray-400'}"
								on:click={() => toggleUrlSelection(item.url)}
							>
								<input
									type="checkbox"
									checked={isChecked}
									class="rounded text-emerald-600 focus:ring-emerald-500 size-4 pointer-events-none"
								/>
								<div class="flex flex-col min-w-0 flex-1">
									<span class="text-xs font-medium truncate">
										{decodeString(item.name || item.url)}
									</span>
									<span class="text-[0.6875rem] text-gray-400 dark:text-gray-500 truncate">
										{item.url}
									</span>
								</div>
							</button>
						{/each}
					</div>
				</div>
			{/if}

			<!-- Message Text Tab -->
			{#if activeTab === 'message' && hasContent}
				<div class="flex flex-col gap-1.5">
					<label for="doc-title-input" class="text-xs font-medium text-gray-600 dark:text-gray-300">
						{$i18n.t('Document Title')}
					</label>
					<input
						id="doc-title-input"
						type="text"
						bind:value={docTitle}
						placeholder={$i18n.t('Enter document title...')}
						class="w-full text-xs rounded-lg px-3 py-2 border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-850 text-gray-900 dark:text-gray-100 focus:outline-hidden focus:ring-1 focus:ring-emerald-500"
					/>
					<div class="mt-1 p-2 bg-gray-50 dark:bg-gray-850/50 rounded-lg border border-gray-100 dark:border-gray-800/60 text-xs text-gray-500 dark:text-gray-400 line-clamp-3">
						{content}
					</div>
				</div>
			{/if}

			<!-- Target Knowledge Base Picker -->
			<div class="flex flex-col gap-2">
				<div class="flex justify-between items-center">
					<label for="kb-search-input" class="text-xs font-medium text-gray-600 dark:text-gray-300">
						{$i18n.t('Target Knowledge Base')}
					</label>
					<a
						href="/workspace/knowledge"
						target="_blank"
						class="text-xs text-emerald-600 dark:text-emerald-400 hover:underline flex items-center gap-1"
					>
						<Plus className="size-3" />
						{$i18n.t('New Knowledge Base')}
					</a>
				</div>

				<!-- Search Input -->
				<div class="relative flex items-center">
					<div class="absolute left-3 text-gray-400">
						<Search className="size-3.5" />
					</div>
					<input
						id="kb-search-input"
						type="text"
						bind:value={searchQuery}
						on:input={handleSearchInput}
						placeholder={$i18n.t('Search knowledge bases...')}
						class="w-full text-xs rounded-lg pl-8 pr-3 py-2 border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-850 text-gray-900 dark:text-gray-100 focus:outline-hidden focus:ring-1 focus:ring-emerald-500"
					/>
				</div>

				<!-- Knowledge Bases List -->
				<div class="flex flex-col gap-1 max-h-44 overflow-y-auto border border-gray-200 dark:border-gray-800 rounded-lg p-1.5">
					{#if loadingKBs}
						<div class="flex justify-center items-center py-6 text-gray-400">
							<Spinner className="size-5" />
						</div>
					{:else if filteredKnowledgeBases.length === 0}
						<div class="text-center py-6 text-xs text-gray-400">
							{searchQuery ? $i18n.t('No matching knowledge bases.') : $i18n.t('No knowledge bases found. Please create one first.')}
						</div>
					{:else}
						{#each filteredKnowledgeBases as kb}
							{@const isSelected = selectedKnowledgeId === kb.id}
							<button
								type="button"
								class="flex items-center justify-between p-2 rounded-md text-left transition {isSelected
									? 'bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-300 dark:border-emerald-700/60 text-gray-900 dark:text-gray-100'
									: 'hover:bg-gray-50 dark:hover:bg-gray-850 text-gray-700 dark:text-gray-300'}"
								on:click={() => {
									selectedKnowledgeId = kb.id;
								}}
							>
								<div class="flex items-center gap-2.5 min-w-0 flex-1">
									<div class="p-1 rounded-md bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400">
										<Database className="size-3.5" />
									</div>
									<div class="flex flex-col min-w-0 flex-1">
										<span class="text-xs font-medium truncate">{kb.name}</span>
										{#if kb.description}
											<span class="text-[0.6875rem] text-gray-400 dark:text-gray-500 truncate">
												{kb.description}
											</span>
										{/if}
									</div>
								</div>

								{#if isSelected}
									<div class="text-emerald-600 dark:text-emerald-400 ml-2">
										<Check className="size-4" strokeWidth="2.5" />
									</div>
								{/if}
							</button>
						{/each}
					{/if}
				</div>
			</div>
		</div>

		<!-- Footer -->
		<div class="flex justify-end items-center gap-2 px-5 py-3 border-t border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-900/50">
			<button
				type="button"
				class="px-3.5 py-1.5 text-xs text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white transition"
				disabled={saving}
				on:click={() => {
					show = false;
				}}
			>
				{$i18n.t('Cancel')}
			</button>

			<button
				type="button"
				class="px-4 py-1.5 text-xs font-medium bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg transition flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
				disabled={saving || !selectedKnowledgeId || (activeTab === 'sources' && selectedUrls.size === 0)}
				on:click={handleSave}
			>
				{#if saving}
					<Spinner className="size-3.5 text-white" />
					<span>{$i18n.t('Saving...')}</span>
				{:else}
					<Database className="size-3.5" />
					<span>{$i18n.t('Save to Knowledge')}</span>
				{/if}
			</button>
		</div>
	</div>
</Modal>
