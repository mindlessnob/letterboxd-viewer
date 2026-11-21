(() => {
	const state = {
		films: [],
		lists: [],
		recentReviews: [],
		heroIndex: 0,
		filter: 'all',
		sort: 'recent',
		view: localStorage.getItem('diary_view') || 'grid',
		query: '',
		visibleItems: [],
		activeIndex: -1,
		activeKind: 'film'
	};

	const els = {
		heroSection: document.getElementById('heroSection'),
		contentArea: document.getElementById('contentArea'),
		filterPills: document.getElementById('filterPills'),
		sortSelect: document.getElementById('sortSelect'),
		toolbarRight: document.getElementById('toolbarRight'),
		viewToggle: document.getElementById('viewToggle'),
		searchInput: document.getElementById('searchInput'),
		colophonStats: document.getElementById('colophonStats'),
		themeToggle: document.getElementById('themeToggle'),
		readerBackdrop: document.getElementById('readerBackdrop'),
		readerModal: document.getElementById('readerModal'),
		readerAside: document.getElementById('readerAside'),
		readerPoster: document.getElementById('readerPoster'),
		readerFacts: document.getElementById('readerFacts'),
		readerTitle: document.getElementById('readerTitle'),
		readerSubtitle: document.getElementById('readerSubtitle'),
		readerProse: document.getElementById('readerProse'),
		readerScroll: document.getElementById('readerScroll'),
		readerCounter: document.getElementById('readerCounter'),
		shareCardBtn: document.getElementById('shareCardBtn'),
		copyLinkBtn: document.getElementById('copyLinkBtn'),
		prevBtn: document.getElementById('prevBtn'),
		nextBtn: document.getElementById('nextBtn'),
		closeReaderBtn: document.getElementById('closeReaderBtn'),
		shareBackdrop: document.getElementById('shareBackdrop'),
		closeShareBtn: document.getElementById('closeShareBtn'),
		shareFormatToggle: document.getElementById('shareFormatToggle'),
		shareThemeToggle: document.getElementById('shareThemeToggle'),
		shareCanvas: document.getElementById('shareCanvas'),
		downloadCardBtn: document.getElementById('downloadCardBtn'),
		toastStack: document.getElementById('toastStack')
	};

	const shareState = {
		format: 'card', // 'card' (1080x1350) | 'story' (1080x1920)
		theme: document.documentElement.getAttribute('data-theme') || 'dark',
		film: null
	};

	// ── Theme ──
	const SUN_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M4.93 4.93l1.41 1.41m11.32 11.32 1.41 1.41M2 12h2m16 0h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/></svg>';
	const MOON_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>';

	function applyTheme(theme) {
		document.documentElement.setAttribute('data-theme', theme);
		localStorage.setItem('diary_theme', theme);
		if (els.themeToggle) {
			els.themeToggle.innerHTML = theme === 'dark' ? SUN_SVG : MOON_SVG;
			els.themeToggle.title = theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode';
			els.themeToggle.setAttribute('aria-label', els.themeToggle.title);
		}
	}

	const initialTheme = document.documentElement.getAttribute('data-theme') || 'dark';
	applyTheme(initialTheme);

	els.themeToggle?.addEventListener('click', () => {
		const current = document.documentElement.getAttribute('data-theme') || 'dark';
		applyTheme(current === 'dark' ? 'light' : 'dark');
	});

	// ── Helpers ──
	const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
	const MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

	function formatStars(ratingNum) {
		if (!ratingNum || Number.isNaN(ratingNum)) return '';
		const full = Math.floor(ratingNum);
		const half = ratingNum % 1 >= 0.5 ? '½' : '';
		return '★'.repeat(full) + half;
	}

	function parseDateParts(isoDate) {
		if (!isoDate) return null;
		const [y, m, d] = isoDate.split('-').map(Number);
		if (!y || !m || !d) return null;
		return { y, m, d };
	}

	function formatShortDate(isoDate) {
		const p = parseDateParts(isoDate);
		return p ? `${MONTHS_SHORT[p.m - 1]} ${p.d}` : '';
	}

	function formatFullDate(isoDate) {
		const p = parseDateParts(isoDate);
		return p ? `${MONTHS_LONG[p.m - 1]} ${p.d}, ${p.y}` : '';
	}

	function formatMonthGroup(isoDate) {
		const p = parseDateParts(isoDate);
		return p ? `${MONTHS_LONG[p.m - 1]} ${p.y}` : 'Undated';
	}

	function escapeHtml(str) {
		return String(str ?? '')
			.replace(/&/g, '&amp;')
			.replace(/</g, '&lt;')
			.replace(/>/g, '&gt;')
			.replace(/"/g, '&quot;');
	}

	function showToast(message, type = 'success') {
		const el = document.createElement('div');
		el.className = `toast ${type}`;
		el.textContent = message;
		els.toastStack.appendChild(el);
		setTimeout(() => {
			el.style.opacity = '0';
			el.style.transition = 'opacity 0.25s';
			setTimeout(() => el.remove(), 260);
		}, 3800);
	}

	// ── Hero Carousel (5 Latest Reviews) ──
	function renderHero() {
		if (!state.recentReviews.length || state.query || state.filter === 'lists') {
			els.heroSection.hidden = true;
			return;
		}
		els.heroSection.hidden = false;

		const total = state.recentReviews.length;
		const idx = ((state.heroIndex % total) + total) % total;
		state.heroIndex = idx;
		const featured = state.recentReviews[idx];

		const yearHtml = featured.year ? `<span class="hero-year">${featured.year}</span>` : '';
		const starsHtml = featured.stars ? `<span class="stars" aria-label="${featured.rating} out of 5 stars">${featured.stars}</span>` : '';
		const heartHtml = featured.liked ? `<span class="heart-icon" title="Liked">♥</span>` : '';
		const spoilerBadge = featured.hasSpoilers ? `<span class="inline-badge is-spoiler">Spoilers</span>` : '';
		const dateStr = featured.watchedDate ? `Watched ${formatFullDate(featured.watchedDate)}` : '';

		const dotsHtml = total > 1
			? `<div class="hero-carousel-controls">
					<button type="button" class="icon-btn" id="heroPrevBtn" aria-label="Previous review" style="width:28px;height:28px;">←</button>
					<div class="hero-dots">
						${state.recentReviews.map((_, i) => `<button type="button" class="hero-dot ${i === idx ? 'active' : ''}" data-hero-dot="${i}" aria-label="Show review ${i + 1}"></button>`).join('')}
					</div>
					<button type="button" class="icon-btn" id="heroNextBtn" aria-label="Next review" style="width:28px;height:28px;">→</button>
				</div>`
			: '';

		const excerptHtml = featured.hasSpoilers
			? `<p class="hero-excerpt is-spoiler" aria-hidden="true">${escapeHtml(featured.plainText)}</p>`
			: `<p class="hero-excerpt">${escapeHtml(featured.plainText)}</p>`;

		els.heroSection.innerHTML = `
			<article class="hero-card">
				<div class="hero-copy">
					<div class="hero-top-row">
						<div class="hero-eyebrow">Latest Reviews · ${idx + 1} of ${total}</div>
						${dotsHtml}
					</div>
					<h2 class="hero-title">${escapeHtml(featured.title)}${yearHtml}</h2>
					<div class="hero-rating-row">
						${starsHtml}
						${heartHtml}
						${spoilerBadge}
						${dateStr ? `<span class="hero-date">${escapeHtml(dateStr)}</span>` : ''}
					</div>
					${excerptHtml}
					<div class="hero-cta-row">
						<button type="button" class="btn-primary" id="heroReadBtn">${featured.hasSpoilers ? 'Open review (spoilers) →' : 'Read full review →'}</button>
					</div>
				</div>
				<div class="hero-poster-wrap" id="heroPosterTrigger">
					<img src="${escapeHtml(featured.full)}" onerror="this.src='${escapeHtml(featured.thumb)}'" alt="${escapeHtml(featured.title)} poster" class="hero-poster" />
				</div>
			</article>
		`;

		const openFeatured = () => {
			const matchIdx = state.visibleItems.findIndex(item => item.id === featured.id);
			if (matchIdx !== -1 && state.activeKind === 'film') {
				openReader(matchIdx, 'film');
			} else {
				state.visibleItems = state.recentReviews;
				openReader(idx, 'film');
			}
		};

		document.getElementById('heroReadBtn')?.addEventListener('click', openFeatured);
		document.getElementById('heroPosterTrigger')?.addEventListener('click', openFeatured);
		document.getElementById('heroPrevBtn')?.addEventListener('click', () => {
			state.heroIndex = (state.heroIndex - 1 + total) % total;
			renderHero();
		});
		document.getElementById('heroNextBtn')?.addEventListener('click', () => {
			state.heroIndex = (state.heroIndex + 1) % total;
			renderHero();
		});
		els.heroSection.querySelectorAll('[data-hero-dot]').forEach(dot => {
			dot.addEventListener('click', () => {
				state.heroIndex = Number(dot.dataset.heroDot);
				renderHero();
			});
		});
	}

	// ── Stats & Counts ──
	function updateCounts() {
		document.getElementById('countAll').textContent = state.films.length;
		document.getElementById('countReviews').textContent = state.films.filter(f => f.isReview).length;
		document.getElementById('countLiked').textContent = state.films.filter(f => f.liked).length;
		document.getElementById('countTop').textContent = state.films.filter(f => (f.rating || 0) >= 4).length;
		document.getElementById('countRewatch').textContent = state.films.filter(f => f.rewatch).length;
		document.getElementById('countLists').textContent = state.lists.length;

		const rated = state.films.filter(f => f.rating !== null);
		const avg = rated.length ? (rated.reduce((s, f) => s + f.rating, 0) / rated.length).toFixed(2) : '—';
		const reviews = state.films.filter(f => f.isReview).length;
		els.colophonStats.innerHTML = `
			<span><strong>${state.films.length}</strong> films logged</span>
			<span><strong>${reviews}</strong> reviews</span>
			<span><strong>${avg}★</strong> avg rating</span>
		`;
	}

	function getFilteredFilms() {
		const q = state.query.trim().toLowerCase();
		let list = state.films.filter(f => {
			if (state.filter === 'reviews' && !f.isReview) return false;
			if (state.filter === 'liked' && !f.liked) return false;
			if (state.filter === 'top' && (f.rating || 0) < 4) return false;
			if (state.filter === 'rewatch' && !f.rewatch) return false;
			if (q) {
				const hay = `${f.title} ${f.year || ''} ${f.plainText}`.toLowerCase();
				if (!hay.includes(q)) return false;
			}
			return true;
		});

		list = [...list];
		switch (state.sort) {
			case 'rating-desc':
				list.sort((a, b) => (b.rating || 0) - (a.rating || 0) || a.order - b.order);
				break;
			case 'year-desc':
				list.sort((a, b) => (b.year || 0) - (a.year || 0) || a.order - b.order);
				break;
			case 'year-asc':
				list.sort((a, b) => (a.year || 9999) - (b.year || 9999) || a.order - b.order);
				break;
			case 'title-asc':
				list.sort((a, b) => a.title.localeCompare(b.title));
				break;
			default:
				list.sort((a, b) => a.order - b.order);
		}
		return list;
	}

	function syncViewButtons() {
		els.viewToggle?.querySelectorAll('.view-btn').forEach(btn => {
			btn.classList.toggle('active', btn.dataset.view === state.view);
		});
	}

	function bindCardClicks(selector, kind) {
		els.contentArea.querySelectorAll(selector).forEach(el => {
			const idx = Number(el.dataset.idx);
			el.addEventListener('click', () => openReader(idx, kind));
			el.addEventListener('keydown', e => {
				if (e.key === 'Enter' || e.key === ' ') {
					e.preventDefault();
					openReader(idx, kind);
				}
			});
		});
	}

	function renderContent() {
		renderHero();
		syncViewButtons();

		if (state.filter === 'lists') {
			els.toolbarRight.style.display = 'none';
			const q = state.query.trim().toLowerCase();
			const lists = state.lists.filter(l => !q || `${l.title} ${l.plainText}`.toLowerCase().includes(q));
			state.visibleItems = lists;
			state.activeKind = 'list';

			if (!lists.length) {
				els.contentArea.innerHTML = `<div class="state-box">No lists match “${escapeHtml(state.query)}”.</div>`;
				return;
			}

			els.contentArea.innerHTML = `<div class="lists-grid">${lists.map((l, i) => `
				<article class="list-card" data-idx="${i}" tabindex="0">
					<div>
						<div class="list-card-label">Curated List</div>
						<h3 class="list-card-title">${escapeHtml(l.title)}</h3>
						<p class="list-card-preview">${escapeHtml(l.plainText)}</p>
					</div>
					<div class="list-card-footer">
						<span>Read list →</span>
					</div>
				</article>
			`).join('')}</div>`;

			bindCardClicks('.list-card', 'list');
			return;
		}

		els.toolbarRight.style.display = '';
		const films = getFilteredFilms();
		state.visibleItems = films;
		state.activeKind = 'film';

		if (!films.length) {
			els.contentArea.innerHTML = `<div class="state-box">No films found matching your current filter.</div>`;
			return;
		}

		if (state.view === 'diary') {
			const groups = new Map();
			films.forEach((f, idx) => {
				const key = state.sort === 'recent' ? formatMonthGroup(f.watchedDate) : 'All Matching Films';
				if (!groups.has(key)) groups.set(key, []);
				groups.get(key).push({ film: f, idx });
			});

			let html = '<div class="diary-list">';
			for (const [monthLabel, entries] of groups.entries()) {
				html += `<section>
					<h3 class="diary-month-heading">
						<span>${escapeHtml(monthLabel)}</span>
						<span class="diary-month-count">${entries.length} ${entries.length === 1 ? 'film' : 'films'}</span>
					</h3>
					${entries.map(({ film: f, idx }) => {
						const p = parseDateParts(f.watchedDate);
						const dayNum = p ? String(p.d).padStart(2, '0') : '—';
						const dayMon = p ? MONTHS_SHORT[p.m - 1] : '';
						const snippet = f.isReview
							? (f.hasSpoilers
								? `<p class="diary-snippet is-spoiler">Review contains spoilers — open to read.</p>`
								: `<p class="diary-snippet">${escapeHtml(f.plainText)}</p>`)
							: '';
						return `
							<article class="diary-row" data-idx="${idx}" tabindex="0">
								<div class="diary-day">
									<span class="diary-day-num">${dayNum}</span>
									<span class="diary-day-mon">${dayMon}</span>
								</div>
								<img src="${escapeHtml(f.thumb)}" alt="${escapeHtml(f.title)} poster" class="diary-thumb" loading="lazy" />
								<div class="diary-main">
									<div class="diary-title-line">
										<h4 class="diary-title">${escapeHtml(f.title)}</h4>
										${f.year ? `<span class="diary-year">${f.year}</span>` : ''}
										${f.isReview ? '<span class="inline-badge is-gold">Review</span>' : ''}
										${f.hasSpoilers ? '<span class="inline-badge is-spoiler">Spoilers</span>' : ''}
										${f.rewatch ? '<span class="inline-badge">↻ Rewatch</span>' : ''}
									</div>
									${snippet}
								</div>
								<div class="diary-right">
									${f.stars ? `<span class="card-stars">${f.stars}</span>` : '<span class="card-unrated">Logged</span>'}
									${f.liked ? '<span class="heart-icon" title="Liked">♥</span>' : ''}
								</div>
							</article>
						`;
					}).join('')}
				</section>`;
			}
			html += '</div>';
			els.contentArea.innerHTML = html;
			bindCardClicks('.diary-row', 'film');
			return;
		}

		// Poster Grid View
		els.contentArea.innerHTML = `<div class="film-grid">${films.map((f, i) => `
			<article class="film-card" data-idx="${i}" tabindex="0" aria-label="${escapeHtml(f.title)}">
				<div class="poster-frame">
					<img src="${escapeHtml(f.thumb)}" alt="${escapeHtml(f.title)} poster" loading="lazy" />
					<div class="poster-badges">
						${f.isReview ? '<span class="badge badge-review" title="Written review">Review</span>' : ''}
						${f.hasSpoilers ? '<span class="badge badge-spoiler" title="Contains spoilers">Spoiler</span>' : ''}
						${f.rewatch ? '<span class="badge badge-rewatch" title="Rewatch">↻</span>' : ''}
						${f.liked ? '<span class="badge badge-like" title="Liked">♥</span>' : ''}
					</div>
				</div>
				<div class="card-body">
					<h3 class="card-title">${escapeHtml(f.title)}</h3>
					<div class="card-meta-row">
						<span>${f.year || '—'}</span>
						<span>${escapeHtml(formatShortDate(f.watchedDate))}</span>
					</div>
					<div class="card-rating-row">
						${f.stars
							? `<span class="card-stars" aria-label="${f.rating} stars">${f.stars}</span>`
							: `<span class="card-unrated">Logged</span>`
						}
					</div>
				</div>
			</article>
		`).join('')}</div>`;

		bindCardClicks('.film-card', 'film');
	}

	// ── Split-Screen Reader Modal + URL Hash ──
	function openReader(index, kind, pushHash = true) {
		if (index < 0 || index >= state.visibleItems.length) return;
		state.activeIndex = index;
		state.activeKind = kind;
		const item = state.visibleItems[index];

		els.readerCounter.textContent = `${index + 1} / ${state.visibleItems.length}`;
		els.prevBtn.disabled = index === 0;
		els.nextBtn.disabled = index === state.visibleItems.length - 1;
		els.readerScroll.scrollTop = 0;

		if (kind === 'list') {
			els.readerModal.classList.add('is-list-modal');
			els.readerAside.style.display = 'none';
			els.shareCardBtn.style.display = 'none';
			els.readerTitle.textContent = item.title;
			els.readerSubtitle.innerHTML = `<span class="inline-badge is-gold">Curated List</span>`;
			els.readerProse.innerHTML = item.descriptionHtml || '<p class="reader-log-note">No list notes available.</p>';
		} else {
			els.readerModal.classList.remove('is-list-modal');
			els.readerAside.style.display = '';
			els.shareCardBtn.style.display = '';
			els.readerPoster.src = item.full;
			els.readerPoster.alt = `${item.title} poster`;
			els.readerPoster.onerror = () => { els.readerPoster.src = item.thumb; };

			els.readerFacts.innerHTML = `
				<div class="fact-row"><span class="fact-label">Watched</span><span>${escapeHtml(formatFullDate(item.watchedDate) || '—')}</span></div>
				<div class="fact-row"><span class="fact-label">Released</span><span>${item.year || '—'}</span></div>
				<div class="fact-row"><span class="fact-label">Rating</span><span style="color:var(--green)">${item.stars || 'Unrated'}</span></div>
				${item.liked ? '<div class="fact-row"><span class="fact-label">Status</span><span style="color:var(--coral)">♥ Liked</span></div>' : ''}
				${item.rewatch ? '<div class="fact-row"><span class="fact-label">Viewing</span><span>↻ Rewatch</span></div>' : ''}
			`;

			els.readerTitle.textContent = item.title;
			els.readerSubtitle.innerHTML = `
				${item.stars ? `<span class="stars">${item.stars}</span>` : '<span class="card-unrated">Logged</span>'}
				${item.liked ? '<span class="heart-icon">♥</span>' : ''}
				${item.isReview ? '<span class="inline-badge is-gold">Review</span>' : ''}
				${item.hasSpoilers ? '<span class="inline-badge is-spoiler">Contains Spoilers</span>' : ''}
				${item.watchedDate ? `<span class="hero-date">${escapeHtml(formatFullDate(item.watchedDate))}</span>` : ''}
			`;

			if (item.isReview) {
				if (item.hasSpoilers) {
					els.readerProse.innerHTML = `
						<div class="spoiler-box" id="spoilerBox">
							<div class="spoiler-content">${item.descriptionHtml}</div>
							<div class="spoiler-overlay">
								<span class="spoiler-label">Spoiler Warning</span>
								<button type="button" class="btn-primary" id="revealSpoilerBtn">Reveal Review</button>
							</div>
						</div>
					`;
					document.getElementById('revealSpoilerBtn')?.addEventListener('click', () => {
						document.getElementById('spoilerBox')?.classList.add('revealed');
					});
				} else {
					els.readerProse.innerHTML = item.descriptionHtml;
				}
			} else {
				els.readerProse.innerHTML = `<p class="reader-log-note">${escapeHtml(item.plainText || 'Logged without a written review.')}</p>`;
			}
		}

		els.readerBackdrop.classList.add('open');
		document.body.classList.add('modal-open');

		if (pushHash && item.slug) {
			const targetHash = `#${item.slug}`;
			if (window.location.hash !== targetHash) {
				history.pushState({ modal: true }, '', targetHash);
			}
		}
	}

	function closeReader(updateHistory = true) {
		if (!els.readerBackdrop.classList.contains('open')) return;
		els.readerBackdrop.classList.remove('open');
		document.body.classList.remove('modal-open');
		if (updateHistory && window.location.hash) {
			history.replaceState(null, '', window.location.pathname + window.location.search);
		}
	}

	function openFromHash() {
		const slug = window.location.hash.replace(/^#/, '').trim();
		if (!slug) {
			closeReader(false);
			return;
		}
		const filmIdx = state.films.findIndex(f => f.slug === slug);
		if (filmIdx !== -1) {
			state.visibleItems = state.films;
			openReader(filmIdx, 'film', false);
			return;
		}
		const listIdx = state.lists.findIndex(l => l.slug === slug);
		if (listIdx !== -1) {
			state.visibleItems = state.lists;
			openReader(listIdx, 'list', false);
		}
	}

	// ── Events ──
	els.filterPills.addEventListener('click', e => {
		const pill = e.target.closest('.pill');
		if (!pill) return;
		els.filterPills.querySelectorAll('.pill').forEach(p => p.classList.remove('active'));
		pill.classList.add('active');
		state.filter = pill.dataset.filter;
		renderContent();
	});

	els.viewToggle?.addEventListener('click', e => {
		const btn = e.target.closest('.view-btn');
		if (!btn) return;
		state.view = btn.dataset.view;
		localStorage.setItem('diary_view', state.view);
		renderContent();
	});

	els.sortSelect.addEventListener('change', () => {
		state.sort = els.sortSelect.value;
		renderContent();
	});

	els.searchInput.addEventListener('input', () => {
		state.query = els.searchInput.value;
		renderContent();
	});

	document.getElementById('brandHome').addEventListener('click', e => {
		e.preventDefault();
		state.filter = 'all';
		state.query = '';
		els.searchInput.value = '';
		els.filterPills.querySelectorAll('.pill').forEach(p => p.classList.toggle('active', p.dataset.filter === 'all'));
		renderContent();
		window.scrollTo({ top: 0, behavior: 'smooth' });
	});

	els.closeReaderBtn.addEventListener('click', () => closeReader(true));
	els.readerBackdrop.addEventListener('click', e => {
		if (e.target === els.readerBackdrop) closeReader(true);
	});
	els.prevBtn.addEventListener('click', () => openReader(state.activeIndex - 1, state.activeKind));
	els.nextBtn.addEventListener('click', () => openReader(state.activeIndex + 1, state.activeKind));

	els.copyLinkBtn.addEventListener('click', async () => {
		try {
			await navigator.clipboard.writeText(window.location.href);
			showToast('Direct link copied to clipboard', 'success');
		} catch {
			showToast('Copy the URL from your address bar', 'error');
		}
	});

	window.addEventListener('hashchange', openFromHash);

	// ── Shareable Review / Diary Image Card (Canvas PNG Export) ──
	function wrapCanvasText(ctx, text, maxWidth, maxLines) {
		const words = text.split(/\s+/).filter(Boolean);
		const lines = [];
		let current = '';
		for (let i = 0; i < words.length; i++) {
			const candidate = current ? `${current} ${words[i]}` : words[i];
			if (ctx.measureText(candidate).width <= maxWidth) {
				current = candidate;
			} else {
				if (current) lines.push(current);
				current = words[i];
				if (lines.length === maxLines - 1) {
					// Pack remaining words on last line with ellipsis if needed
					let rest = [current, ...words.slice(i + 1)].join(' ');
					while (rest.length > 0 && ctx.measureText(rest + '…').width > maxWidth) {
						rest = rest.replace(/\s+\S*$/, '') || rest.slice(0, -1);
					}
					lines.push(rest + (i < words.length - 1 ? '…' : ''));
					return lines;
				}
			}
		}
		if (current && lines.length < maxLines) lines.push(current);
		return lines;
	}

	function drawRoundedRect(ctx, x, y, w, h, r) {
		ctx.beginPath();
		ctx.moveTo(x + r, y);
		ctx.arcTo(x + w, y, x + w, y + h, r);
		ctx.arcTo(x + w, y + h, x, y + h, r);
		ctx.arcTo(x, y + h, x, y, r);
		ctx.arcTo(x, y, x + w, y, r);
		ctx.closePath();
	}

	function loadImage(src) {
		return new Promise((resolve, reject) => {
			const img = new Image();
			img.onload = () => resolve(img);
			img.onerror = reject;
			img.src = src;
		});
	}

	async function renderShareCard() {
		const film = shareState.film;
		if (!film) return;

		if (document.fonts && document.fonts.ready) {
			await document.fonts.ready;
		}

		const isStory = shareState.format === 'story';
		const W = 1080;
		const H = isStory ? 1920 : 1350;
		const canvas = els.shareCanvas;
		canvas.width = W;
		canvas.height = H;
		const ctx = canvas.getContext('2d');

		const isLight = shareState.theme === 'light';
		const palette = isLight
			? {
				bg: '#f5f2eb',
				bg2: '#ede8dc',
				card: '#fcfaf5',
				border: 'rgba(23, 22, 20, 0.14)',
				ink: '#171614',
				secondary: '#4e4b45',
				muted: '#78736a',
				green: '#008a38',
				coral: '#d94e30',
				gold: '#9a6e19',
				glow: 'rgba(154, 110, 25, 0.12)'
			}
			: {
				bg: '#0c0c0e',
				bg2: '#141418',
				card: '#16161b',
				border: 'rgba(242, 239, 233, 0.14)',
				ink: '#f2efe9',
				secondary: '#c4bfb4',
				muted: '#827e76',
				green: '#00e054',
				coral: '#ff6b4a',
				gold: '#d4a853',
				glow: 'rgba(212, 168, 83, 0.13)'
			};

		// Background
		const bgGrad = ctx.createLinearGradient(0, 0, 0, H);
		bgGrad.addColorStop(0, palette.bg);
		bgGrad.addColorStop(1, palette.bg2);
		ctx.fillStyle = bgGrad;
		ctx.fillRect(0, 0, W, H);

		// Subtle warm editorial glow
		const rad = ctx.createRadialGradient(W * 0.5, isStory ? H * 0.28 : H * 0.25, 40, W * 0.5, isStory ? H * 0.28 : H * 0.25, 620);
		rad.addColorStop(0, palette.glow);
		rad.addColorStop(1, 'rgba(0,0,0,0)');
		ctx.fillStyle = rad;
		ctx.fillRect(0, 0, W, H);

		// Editorial outer frame
		const pad = 64;
		ctx.strokeStyle = palette.border;
		ctx.lineWidth = 2;
		drawRoundedRect(ctx, pad, pad, W - pad * 2, H - pad * 2, 24);
		ctx.stroke();

		// Top bar inside frame
		const innerX = pad + 56;
		const innerW = W - innerX * 2;
		const topY = pad + 62;

		ctx.fillStyle = palette.gold;
		ctx.font = '500 22px "JetBrains Mono", monospace';
		ctx.textBaseline = 'middle';
		ctx.textAlign = 'left';
		ctx.fillText(film.isReview ? 'FILM REVIEW' : 'SCREENING LOG', innerX, topY);

		if (film.watchedDate) {
			ctx.fillStyle = palette.muted;
			ctx.textAlign = 'right';
			ctx.fillText(formatFullDate(film.watchedDate).toUpperCase(), W - innerX, topY);
		}

		// Poster
		let posterImg = null;
		try {
			posterImg = await loadImage(film.full);
		} catch {
			try { posterImg = await loadImage(film.thumb); } catch { /* ignore */ }
		}

		const posterW = isStory ? 460 : 340;
		const posterH = Math.round(posterW * 1.5);
		const posterX = Math.round((W - posterW) / 2);
		const posterY = isStory ? topY + 78 : topY + 52;

		if (posterImg) {
			ctx.save();
			ctx.shadowColor = isLight ? 'rgba(23,22,20,0.22)' : 'rgba(0,0,0,0.65)';
			ctx.shadowBlur = 46;
			ctx.shadowOffsetY = 20;
			drawRoundedRect(ctx, posterX, posterY, posterW, posterH, 16);
			ctx.fillStyle = palette.card;
			ctx.fill();
			ctx.restore();

			ctx.save();
			drawRoundedRect(ctx, posterX, posterY, posterW, posterH, 16);
			ctx.clip();
			ctx.drawImage(posterImg, posterX, posterY, posterW, posterH);
			ctx.restore();

			ctx.strokeStyle = palette.border;
			ctx.lineWidth = 2;
			drawRoundedRect(ctx, posterX, posterY, posterW, posterH, 16);
			ctx.stroke();
		}

		// Film Title & Year
		let cursorY = posterY + posterH + (isStory ? 84 : 64);
		ctx.textAlign = 'center';
		ctx.fillStyle = palette.ink;
		ctx.font = `500 ${isStory ? 62 : 52}px "Newsreader", Georgia, serif`;
		const titleLines = wrapCanvasText(ctx, film.title, innerW, 2);
		for (const line of titleLines) {
			ctx.fillText(line, W / 2, cursorY);
			cursorY += isStory ? 72 : 60;
		}

		// Year + Rating + Heart row
		const metaParts = [];
		if (film.year) metaParts.push({ text: String(film.year), color: palette.muted, font: '400 30px "JetBrains Mono", monospace' });
		if (film.stars) metaParts.push({ text: film.stars, color: palette.green, font: '600 38px "Plus Jakarta Sans", sans-serif' });
		if (film.liked) metaParts.push({ text: '♥', color: palette.coral, font: '600 34px "Plus Jakarta Sans", sans-serif' });
		if (film.rewatch) metaParts.push({ text: '↻', color: palette.muted, font: '500 32px "Plus Jakarta Sans", sans-serif' });

		if (metaParts.length) {
			cursorY += 12;
			const gap = 26;
			const widths = metaParts.map(p => {
				ctx.font = p.font;
				return ctx.measureText(p.text).width;
			});
			const totalW = widths.reduce((a, b) => a + b, 0) + gap * (metaParts.length - 1);
			let mx = (W - totalW) / 2;
			ctx.textAlign = 'left';
			metaParts.forEach((p, idx) => {
				ctx.font = p.font;
				ctx.fillStyle = p.color;
				ctx.fillText(p.text, mx, cursorY);
				mx += widths[idx] + gap;
			});
			cursorY += isStory ? 68 : 52;
		}

		// Divider
		ctx.strokeStyle = palette.border;
		ctx.lineWidth = 1.5;
		ctx.beginPath();
		ctx.moveTo(W / 2 - 120, cursorY);
		ctx.lineTo(W / 2 + 120, cursorY);
		ctx.stroke();
		cursorY += isStory ? 64 : 48;

		// Review excerpt or diary log note
		const footerTop = H - pad - 76;
		const availableH = footerTop - cursorY - 24;
		ctx.textAlign = 'center';

		if (film.isReview && !film.hasSpoilers && film.plainText) {
			const fontSize = isStory ? 36 : 30;
			const lineHeight = isStory ? 56 : 46;
			const maxLines = Math.max(2, Math.min(isStory ? 9 : 5, Math.floor(availableH / lineHeight)));
			ctx.font = `400 ${fontSize}px "Newsreader", Georgia, serif`;
			ctx.fillStyle = palette.secondary;
			const lines = wrapCanvasText(ctx, `“${film.plainText}”`, innerW - 24, maxLines);
			for (const line of lines) {
				ctx.fillText(line, W / 2, cursorY);
				cursorY += lineHeight;
			}
		} else {
			ctx.font = `italic 400 ${isStory ? 34 : 28}px "Newsreader", Georgia, serif`;
			ctx.fillStyle = palette.muted;
			const note = film.hasSpoilers
				? 'Review contains spoilers — read in full on the diary.'
				: (film.watchedDate ? `Watched on ${formatFullDate(film.watchedDate)}.` : 'Logged in Moon’s Film Diary.');
			const lines = wrapCanvasText(ctx, note, innerW - 40, 2);
			for (const line of lines) {
				ctx.fillText(line, W / 2, cursorY);
				cursorY += 44;
			}
		}

		// Footer colophon (strictly anonymous — no Letterboxd branding)
		ctx.strokeStyle = palette.border;
		ctx.lineWidth = 1.5;
		ctx.beginPath();
		ctx.moveTo(innerX, footerTop - 22);
		ctx.lineTo(W - innerX, footerTop - 22);
		ctx.stroke();

		ctx.textAlign = 'center';
		ctx.fillStyle = palette.muted;
		ctx.font = '500 22px "JetBrains Mono", monospace';
		ctx.fillText("MOON'S FILM DIARY", W / 2, footerTop + 20);
	}

	function openShareModal() {
		if (state.activeKind !== 'film' || state.activeIndex < 0) return;
		shareState.film = state.visibleItems[state.activeIndex];
		shareState.theme = document.documentElement.getAttribute('data-theme') || 'dark';
		els.shareThemeToggle.querySelectorAll('.view-btn').forEach(b => {
			b.classList.toggle('active', b.dataset.cardTheme === shareState.theme);
		});
		els.shareFormatToggle.querySelectorAll('.view-btn').forEach(b => {
			b.classList.toggle('active', b.dataset.format === shareState.format);
		});
		els.shareBackdrop.classList.add('open');
		renderShareCard();
	}

	function closeShareModal() {
		els.shareBackdrop.classList.remove('open');
	}

	els.shareCardBtn.addEventListener('click', openShareModal);
	els.closeShareBtn.addEventListener('click', closeShareModal);
	els.shareBackdrop.addEventListener('click', e => {
		if (e.target === els.shareBackdrop) closeShareModal();
	});

	els.shareFormatToggle.addEventListener('click', e => {
		const btn = e.target.closest('.view-btn');
		if (!btn) return;
		shareState.format = btn.dataset.format;
		els.shareFormatToggle.querySelectorAll('.view-btn').forEach(b => b.classList.toggle('active', b === btn));
		renderShareCard();
	});

	els.shareThemeToggle.addEventListener('click', e => {
		const btn = e.target.closest('.view-btn');
		if (!btn) return;
		shareState.theme = btn.dataset.cardTheme;
		els.shareThemeToggle.querySelectorAll('.view-btn').forEach(b => b.classList.toggle('active', b === btn));
		renderShareCard();
	});

	els.downloadCardBtn.addEventListener('click', () => {
		if (!shareState.film) return;
		try {
			const dataUrl = els.shareCanvas.toDataURL('image/png');
			const a = document.createElement('a');
			a.href = dataUrl;
			a.download = `${shareState.film.slug || 'film'}-${shareState.format}.png`;
			a.click();
			showToast('PNG card downloaded', 'success');
		} catch (err) {
			console.error(err);
			showToast('Download requires HTTP (open via GitHub Pages or localhost)', 'error');
		}
	});

	// Keyboard shortcuts
	document.addEventListener('keydown', e => {
		const shareOpen = els.shareBackdrop.classList.contains('open');
		const readerOpen = els.readerBackdrop.classList.contains('open');
		if (e.key === '/' && document.activeElement !== els.searchInput && !readerOpen && !shareOpen) {
			e.preventDefault();
			els.searchInput.focus();
			return;
		}
		if (e.key === 'Escape') {
			if (shareOpen) { closeShareModal(); return; }
			if (readerOpen) closeReader(true);
			return;
		}
		if (readerOpen && !shareOpen) {
			if (e.key === 'ArrowLeft' && state.activeIndex > 0) openReader(state.activeIndex - 1, state.activeKind);
			if (e.key === 'ArrowRight' && state.activeIndex < state.visibleItems.length - 1) openReader(state.activeIndex + 1, state.activeKind);
		}
	});

	// ── Data Hydration ──
	function hydrate(data) {
		state.films = (data.films || []).map((f, i) => ({
			...f,
			stars: formatStars(f.rating),
			order: i
		}));
		state.lists = data.lists || [];
		state.recentReviews = state.films.filter(f => f.isReview).slice(0, 5);
		updateCounts();
		renderContent();
		openFromHash();
	}

	if (window.location.protocol === 'file:' && window.__DIARY_DATA__) {
		hydrate(window.__DIARY_DATA__);
	} else {
		fetch('data/archive.json')
			.then(res => {
				if (!res.ok) throw new Error(`HTTP ${res.status}`);
				return res.json();
			})
			.then(hydrate)
			.catch(err => {
				if (window.__DIARY_DATA__) {
					hydrate(window.__DIARY_DATA__);
				} else {
					console.error(err);
					els.contentArea.innerHTML = `<div class="state-box">Could not load diary archive.</div>`;
				}
			});
	}
})();
