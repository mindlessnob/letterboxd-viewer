(() => {
	const PAGE_SIZE = 36;

	const state = {
		films: [],
		lists: [],
		recentReviews: [],
		heroIndex: 0,
		filter: 'all',
		year: 'all',
		sort: 'recent',
		view: localStorage.getItem('diary_view') || 'grid',
		query: '',
		displayLimit: PAGE_SIZE,
		visibleItems: [],
		activeIndex: -1,
		activeKind: 'film'
	};

	const els = {
		heroSection: document.getElementById('heroSection'),
		contentArea: document.getElementById('contentArea'),
		filterPills: document.getElementById('filterPills'),
		yearSelect: document.getElementById('yearSelect'),
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
		shareStyleToggle: document.getElementById('shareStyleToggle'),
		shareFormatToggle: document.getElementById('shareFormatToggle'),
		shareThemeToggle: document.getElementById('shareThemeToggle'),
		shareReviewToggle: document.getElementById('shareReviewToggle'),
		shareReviewLabel: document.getElementById('shareReviewLabel'),
		shareCanvas: document.getElementById('shareCanvas'),
		downloadCardBtn: document.getElementById('downloadCardBtn'),
		toastStack: document.getElementById('toastStack')
	};

	const shareState = {
		style: 'editorial', // 'editorial' | 'cinema' | 'minimal' | 'ticket'
		format: 'card',     // 'card' (1080x1350) | 'story' (1080x1920)
		theme: document.documentElement.getAttribute('data-theme') || 'dark',
		includeReview: true,
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
			if (state.year !== 'all') {
				const watchedYear = (f.watchedDate || '').slice(0, 4);
				if (watchedYear !== state.year) return false;
			}
			if (q && !f._search.includes(q)) return false;
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

		const slice = films.slice(0, state.displayLimit);
		const hasMore = slice.length < films.length;
		const loadMoreHtml = hasMore
			? `<div class="load-more-wrap">
					<button type="button" class="btn-ghost" id="loadMoreBtn" style="padding: 0.62rem 1.45rem; font-size: 0.82rem;">Load more films</button>
					<span class="load-more-meta">Showing ${slice.length.toLocaleString()} of ${films.length.toLocaleString()} films</span>
				</div>`
			: '';

		if (state.view === 'diary') {
			const groups = new Map();
			slice.forEach((f, idx) => {
				const key = state.sort === 'recent' ? formatMonthGroup(f.watchedDate) : 'Matching Films';
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
						const thumbHtml = f.thumb
							? `<img src="${escapeHtml(f.thumb)}" alt="${escapeHtml(f.title)} poster" class="diary-thumb" loading="lazy" decoding="async" />`
							: `<div class="diary-thumb-typo" aria-hidden="true">${escapeHtml((f.title || '?')[0])}</div>`;
						return `
							<article class="diary-row" data-idx="${idx}" tabindex="0">
								<div class="diary-day">
									<span class="diary-day-num">${dayNum}</span>
									<span class="diary-day-mon">${dayMon}</span>
								</div>
								${thumbHtml}
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
			html += '</div>' + loadMoreHtml;
			els.contentArea.innerHTML = html;
			bindCardClicks('.diary-row', 'film');
			document.getElementById('loadMoreBtn')?.addEventListener('click', () => {
				state.displayLimit += PAGE_SIZE;
				renderContent();
			});
			return;
		}

		// Poster Grid View
		els.contentArea.innerHTML = `<div class="film-grid">${slice.map((f, i) => `
			<article class="film-card" data-idx="${i}" tabindex="0" aria-label="${escapeHtml(f.title)}">
				<div class="poster-frame">
					${f.thumb
						? `<img src="${escapeHtml(f.thumb)}" alt="${escapeHtml(f.title)} poster" loading="lazy" decoding="async" />`
						: `<div class="poster-typographic">
								<span class="poster-typo-year">${f.year || 'FILM'}</span>
								<span class="poster-typo-title">${escapeHtml(f.title)}</span>
								<span class="poster-typo-foot">${f.stars || 'LOGGED'}</span>
							</div>`
					}
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
		`).join('')}</div>${loadMoreHtml}`;

		bindCardClicks('.film-card', 'film');
		document.getElementById('loadMoreBtn')?.addEventListener('click', () => {
			state.displayLimit += PAGE_SIZE;
			renderContent();
		});
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
			if (item.full || item.thumb) {
				els.readerPoster.style.display = '';
				els.readerPoster.src = item.full || item.thumb;
				els.readerPoster.alt = `${item.title} poster`;
				els.readerPoster.onerror = () => {
					if (item.thumb && els.readerPoster.src !== item.thumb) {
						els.readerPoster.src = item.thumb;
					} else {
						els.readerPoster.style.display = 'none';
					}
				};
			} else {
				els.readerPoster.style.display = 'none';
				els.readerPoster.removeAttribute('src');
			}

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
		state.displayLimit = PAGE_SIZE;
		renderContent();
	});

	els.viewToggle?.addEventListener('click', e => {
		const btn = e.target.closest('.view-btn');
		if (!btn) return;
		state.view = btn.dataset.view;
		localStorage.setItem('diary_view', state.view);
		renderContent();
	});

	els.yearSelect?.addEventListener('change', () => {
		state.year = els.yearSelect.value;
		state.displayLimit = PAGE_SIZE;
		renderContent();
	});

	els.sortSelect.addEventListener('change', () => {
		state.sort = els.sortSelect.value;
		state.displayLimit = PAGE_SIZE;
		renderContent();
	});

	let searchTimer = null;
	els.searchInput.addEventListener('input', () => {
		clearTimeout(searchTimer);
		searchTimer = setTimeout(() => {
			state.query = els.searchInput.value;
			state.displayLimit = PAGE_SIZE;
			renderContent();
		}, 150);
	});

	document.getElementById('brandHome').addEventListener('click', e => {
		e.preventDefault();
		state.filter = 'all';
		state.year = 'all';
		state.query = '';
		state.displayLimit = PAGE_SIZE;
		els.searchInput.value = '';
		if (els.yearSelect) els.yearSelect.value = 'all';
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
			if (!src) { reject(new Error('No src')); return; }
			const img = new Image();
			if (/^https?:\/\//i.test(src)) {
				img.crossOrigin = 'anonymous';
			}
			img.onload = () => resolve(img);
			img.onerror = reject;
			img.src = src;
		});
	}

	function drawPosterOrSleeve(ctx, posterImg, film, x, y, w, h, r, palette, isLight) {
		if (posterImg) {
			ctx.save();
			ctx.shadowColor = isLight ? 'rgba(23,22,20,0.22)' : 'rgba(0,0,0,0.65)';
			ctx.shadowBlur = 46;
			ctx.shadowOffsetY = 20;
			drawRoundedRect(ctx, x, y, w, h, r);
			ctx.fillStyle = palette.card;
			ctx.fill();
			ctx.restore();

			ctx.save();
			drawRoundedRect(ctx, x, y, w, h, r);
			ctx.clip();
			ctx.drawImage(posterImg, x, y, w, h);
			ctx.restore();

			ctx.strokeStyle = palette.border;
			ctx.lineWidth = 2;
			drawRoundedRect(ctx, x, y, w, h, r);
			ctx.stroke();
		} else {
			drawRoundedRect(ctx, x, y, w, h, r);
			ctx.fillStyle = palette.card;
			ctx.fill();
			ctx.strokeStyle = palette.border;
			ctx.lineWidth = 2;
			ctx.stroke();

			drawRoundedRect(ctx, x + 16, y + 16, w - 32, h - 32, Math.max(4, r - 6));
			ctx.stroke();

			ctx.textAlign = 'center';
			ctx.fillStyle = palette.muted;
			ctx.font = '500 22px "JetBrains Mono", monospace';
			ctx.fillText(String(film.year || 'FILM'), x + w / 2, y + 68);

			ctx.fillStyle = palette.ink;
			ctx.font = '500 36px "Newsreader", Georgia, serif';
			const sleeveLines = wrapCanvasText(ctx, film.title, w - 64, 4);
			let sy = y + h / 2 - ((sleeveLines.length - 1) * 22);
			for (const sl of sleeveLines) {
				ctx.fillText(sl, x + w / 2, sy);
				sy += 46;
			}
		}
	}

	function drawCenteredMetaRow(ctx, film, cx, y, palette) {
		const metaParts = [];
		if (film.year) metaParts.push({ text: String(film.year), color: palette.muted, font: '400 28px "JetBrains Mono", monospace' });
		if (film.stars) metaParts.push({ text: film.stars, color: palette.green, font: '600 38px "Plus Jakarta Sans", sans-serif' });
		if (film.liked) metaParts.push({ text: '♥', color: palette.coral, font: '600 34px "Plus Jakarta Sans", sans-serif' });
		if (film.rewatch) metaParts.push({ text: '↻', color: palette.muted, font: '500 30px "Plus Jakarta Sans", sans-serif' });
		if (!metaParts.length) return false;

		const gap = 24;
		const widths = metaParts.map(p => { ctx.font = p.font; return ctx.measureText(p.text).width; });
		const totalW = widths.reduce((a, b) => a + b, 0) + gap * (metaParts.length - 1);
		let mx = cx - totalW / 2;
		ctx.textAlign = 'left';
		ctx.textBaseline = 'middle';
		metaParts.forEach((p, idx) => {
			ctx.font = p.font;
			ctx.fillStyle = p.color;
			ctx.fillText(p.text, mx, y);
			mx += widths[idx] + gap;
		});
		return true;
	}

	async function renderShareCard() {
		const film = shareState.film;
		if (!film) return;

		if (document.fonts && document.fonts.ready) {
			await document.fonts.ready;
		}

		const isStory = shareState.format === 'story';
		const style = shareState.style;
		const showReview = Boolean(shareState.includeReview && film.isReview && !film.hasSpoilers && film.plainText);
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

		// Load poster once
		let posterImg = null;
		try {
			posterImg = await loadImage(film.full);
		} catch {
			try { posterImg = await loadImage(film.thumb); } catch { /* ignore */ }
		}

		ctx.textBaseline = 'middle';

		// ── STYLE 2: CINEMA (Blurred Ambient Backdrop) ──
		if (style === 'cinema') {
			ctx.fillStyle = isLight ? '#ece7dc' : '#08080a';
			ctx.fillRect(0, 0, W, H);

			if (posterImg) {
				ctx.save();
				ctx.filter = 'blur(52px) saturate(1.25)';
				const scale = Math.max(W / posterImg.width, H / posterImg.height) * 1.15;
				const bw = posterImg.width * scale;
				const bh = posterImg.height * scale;
				ctx.drawImage(posterImg, (W - bw) / 2, (H - bh) / 2, bw, bh);
				ctx.restore();
			}

			// Moody vignette overlay
			const vig = ctx.createLinearGradient(0, 0, 0, H);
			if (isLight) {
				vig.addColorStop(0, 'rgba(245, 242, 235, 0.72)');
				vig.addColorStop(0.5, 'rgba(245, 242, 235, 0.80)');
				vig.addColorStop(1, 'rgba(245, 242, 235, 0.94)');
			} else {
				vig.addColorStop(0, 'rgba(8, 8, 10, 0.62)');
				vig.addColorStop(0.45, 'rgba(8, 8, 10, 0.74)');
				vig.addColorStop(1, 'rgba(8, 8, 10, 0.94)');
			}
			ctx.fillStyle = vig;
			ctx.fillRect(0, 0, W, H);

			const posterW = showReview ? (isStory ? 440 : 330) : (isStory ? 560 : 460);
			const posterH = Math.round(posterW * 1.5);
			const posterX = Math.round((W - posterW) / 2);
			const posterY = showReview ? (isStory ? 180 : 120) : (isStory ? 280 : 155);

			drawPosterOrSleeve(ctx, posterImg, film, posterX, posterY, posterW, posterH, 20, palette, isLight);

			let cy = posterY + posterH + (isStory ? 84 : 64);
			ctx.textAlign = 'center';
			ctx.fillStyle = palette.ink;
			ctx.font = `600 ${isStory ? 62 : 52}px "Newsreader", Georgia, serif`;
			for (const line of wrapCanvasText(ctx, film.title, W - 180, 2)) {
				ctx.fillText(line, W / 2, cy);
				cy += isStory ? 72 : 60;
			}

			cy += 10;
			drawCenteredMetaRow(ctx, film, W / 2, cy, palette);
			cy += isStory ? 68 : 54;

			if (showReview) {
				const footerY = H - 105;
				const fontSize = isStory ? 35 : 29;
				const lh = isStory ? 54 : 45;
				const maxLines = Math.max(2, Math.min(isStory ? 8 : 5, Math.floor((footerY - cy - 40) / lh)));
				ctx.textAlign = 'center';
				ctx.font = `400 ${fontSize}px "Newsreader", Georgia, serif`;
				ctx.fillStyle = palette.secondary;
				for (const line of wrapCanvasText(ctx, `“${film.plainText}”`, W - 200, maxLines)) {
					ctx.fillText(line, W / 2, cy);
					cy += lh;
				}
			} else if (film.watchedDate) {
				ctx.textAlign = 'center';
				ctx.font = '400 24px "JetBrains Mono", monospace';
				ctx.fillStyle = palette.muted;
				ctx.fillText(formatFullDate(film.watchedDate).toUpperCase(), W / 2, cy + 8);
			}

			ctx.textAlign = 'center';
			ctx.fillStyle = palette.muted;
			ctx.font = '500 21px "JetBrains Mono", monospace';
			ctx.fillText("MOON'S FILM DIARY", W / 2, H - 78);
			return;
		}

		// ── STYLE 3: MINIMAL (Gallery Print, Left-Aligned) ──
		if (style === 'minimal') {
			ctx.fillStyle = palette.bg;
			ctx.fillRect(0, 0, W, H);

			const padX = 96;
			const innerW = W - padX * 2;
			const topY = isStory ? 115 : 85;

			const posterW = showReview ? (isStory ? 440 : 320) : (isStory ? 560 : 460);
			const posterH = Math.round(posterW * 1.5);
			const posterX = padX;
			const posterY = topY;

			drawPosterOrSleeve(ctx, posterImg, film, posterX, posterY, posterW, posterH, 10, palette, isLight);

			// Side metadata column next to poster
			const sideX = posterX + posterW + 54;
			const sideW = W - padX - sideX;
			ctx.textAlign = 'left';
			let sy = posterY + 24;

			ctx.fillStyle = palette.gold;
			ctx.font = '500 20px "JetBrains Mono", monospace';
			ctx.fillText(film.isReview ? 'REVIEW' : 'DIARY', sideX, sy);
			sy += 56;

			if (film.watchedDate) {
				ctx.fillStyle = palette.muted;
				ctx.font = '400 18px "JetBrains Mono", monospace';
				ctx.fillText('WATCHED', sideX, sy);
				sy += 32;
				ctx.fillStyle = palette.ink;
				ctx.font = '500 24px "Plus Jakarta Sans", sans-serif';
				ctx.fillText(formatFullDate(film.watchedDate), sideX, sy);
				sy += 56;
			}

			if (film.year) {
				ctx.fillStyle = palette.muted;
				ctx.font = '400 18px "JetBrains Mono", monospace';
				ctx.fillText('RELEASED', sideX, sy);
				sy += 32;
				ctx.fillStyle = palette.ink;
				ctx.font = '500 24px "Plus Jakarta Sans", sans-serif';
				ctx.fillText(String(film.year), sideX, sy);
				sy += 56;
			}

			if (film.stars) {
				ctx.fillStyle = palette.muted;
				ctx.font = '400 18px "JetBrains Mono", monospace';
				ctx.fillText('RATING', sideX, sy);
				sy += 36;
				ctx.fillStyle = palette.green;
				ctx.font = '600 36px "Plus Jakarta Sans", sans-serif';
				ctx.fillText(film.stars + (film.liked ? '  ♥' : ''), sideX, sy);
			}

			// Title + optional review below poster
			let cy = posterY + posterH + (isStory ? 84 : 62);
			ctx.textAlign = 'left';
			ctx.fillStyle = palette.ink;
			ctx.font = `500 ${isStory ? 64 : 54}px "Newsreader", Georgia, serif`;
			for (const line of wrapCanvasText(ctx, film.title, innerW, 2)) {
				ctx.fillText(line, padX, cy);
				cy += isStory ? 74 : 62;
			}

			const footerY = H - 86;
			if (showReview) {
				cy += 22;
				ctx.strokeStyle = palette.border;
				ctx.lineWidth = 2;
				ctx.beginPath();
				ctx.moveTo(padX, cy);
				ctx.lineTo(W - padX, cy);
				ctx.stroke();
				cy += 52;

				const fontSize = isStory ? 35 : 29;
				const lh = isStory ? 54 : 45;
				const maxLines = Math.max(2, Math.min(isStory ? 11 : 6, Math.floor((footerY - cy - 48) / lh)));
				ctx.font = `400 ${fontSize}px "Newsreader", Georgia, serif`;
				ctx.fillStyle = palette.secondary;
				for (const line of wrapCanvasText(ctx, film.plainText, innerW, maxLines)) {
					ctx.fillText(line, padX, cy);
					cy += lh;
				}
			}

			ctx.strokeStyle = palette.border;
			ctx.lineWidth = 1.5;
			ctx.beginPath();
			ctx.moveTo(padX, footerY - 34);
			ctx.lineTo(W - padX, footerY - 34);
			ctx.stroke();

			ctx.textAlign = 'left';
			ctx.fillStyle = palette.muted;
			ctx.font = '500 20px "JetBrains Mono", monospace';
			ctx.fillText("MOON'S FILM DIARY", padX, footerY);
			return;
		}

		// ── STYLE 4: TICKET (Vintage 35mm Cinema Stub) ──
		if (style === 'ticket') {
			ctx.fillStyle = isLight ? '#e8e2d5' : '#08080a';
			ctx.fillRect(0, 0, W, H);

			const pad = 76;
			const tx = pad;
			const ty = pad;
			const tw = W - pad * 2;
			const th = H - pad * 2;
			const notchY = showReview ? (isStory ? Math.round(H * 0.56) : Math.round(H * 0.54)) : (isStory ? Math.round(H * 0.72) : Math.round(H * 0.72));
			const notchR = 34;

			// Ticket silhouette with semicircular side cutouts
			ctx.save();
			ctx.shadowColor = isLight ? 'rgba(23,22,20,0.16)' : 'rgba(0,0,0,0.6)';
			ctx.shadowBlur = 40;
			ctx.shadowOffsetY = 16;
			ctx.beginPath();
			ctx.moveTo(tx + 28, ty);
			ctx.lineTo(tx + tw - 28, ty);
			ctx.quadraticCurveTo(tx + tw, ty, tx + tw, ty + 28);
			ctx.lineTo(tx + tw, notchY - notchR);
			ctx.arc(tx + tw, notchY, notchR, -Math.PI / 2, Math.PI / 2, true);
			ctx.lineTo(tx + tw, ty + th - 28);
			ctx.quadraticCurveTo(tx + tw, ty + th, tx + tw - 28, ty + th);
			ctx.lineTo(tx + 28, ty + th);
			ctx.quadraticCurveTo(tx, ty + th, tx, ty + th - 28);
			ctx.lineTo(tx, notchY + notchR);
			ctx.arc(tx, notchY, notchR, Math.PI / 2, -Math.PI / 2, true);
			ctx.lineTo(tx, ty + 28);
			ctx.quadraticCurveTo(tx, ty, tx + 28, ty);
			ctx.closePath();
			ctx.fillStyle = palette.card;
			ctx.fill();
			ctx.restore();

			ctx.strokeStyle = palette.border;
			ctx.lineWidth = 2;
			ctx.stroke();

			// Perforated dashed tear-line
			ctx.save();
			ctx.setLineDash([12, 12]);
			ctx.strokeStyle = palette.border;
			ctx.lineWidth = 2.5;
			ctx.beginPath();
			ctx.moveTo(tx + notchR + 18, notchY);
			ctx.lineTo(tx + tw - notchR - 18, notchY);
			ctx.stroke();
			ctx.restore();

			const innerX = tx + 56;
			const innerW = tw - 112;

			// Top stub header
			ctx.fillStyle = palette.gold;
			ctx.font = '500 21px "JetBrains Mono", monospace';
			ctx.textAlign = 'left';
			ctx.fillText('ADMIT ONE · SCREENING LOG', innerX, ty + 54);
			if (film.watchedDate) {
				ctx.fillStyle = palette.muted;
				ctx.textAlign = 'right';
				ctx.fillText(formatShortDate(film.watchedDate).toUpperCase(), tx + tw - 56, ty + 54);
			}

			// Poster inside top half
			const topAvailH = notchY - (ty + 100) - 36;
			const posterH = Math.min(topAvailH, showReview ? (isStory ? 680 : 480) : (isStory ? 840 : 620));
			const posterW = Math.round(posterH * (2 / 3));
			const posterX = Math.round((W - posterW) / 2);
			const posterY = ty + 100 + Math.round((topAvailH - posterH) / 2);
			drawPosterOrSleeve(ctx, posterImg, film, posterX, posterY, posterW, posterH, 12, palette, isLight);

			// Bottom stub: Title, rating, optional review
			let cy = notchY + (isStory ? 86 : 68);
			ctx.textAlign = 'center';
			ctx.fillStyle = palette.ink;
			ctx.font = `500 ${isStory ? 56 : 46}px "Newsreader", Georgia, serif`;
			for (const line of wrapCanvasText(ctx, film.title, innerW, 2)) {
				ctx.fillText(line, W / 2, cy);
				cy += isStory ? 66 : 54;
			}

			cy += 8;
			drawCenteredMetaRow(ctx, film, W / 2, cy, palette);
			cy += isStory ? 64 : 48;

			const stubFootY = ty + th - 58;
			if (showReview) {
				const fontSize = isStory ? 32 : 26;
				const lh = isStory ? 48 : 40;
				const maxLines = Math.max(2, Math.min(isStory ? 8 : 5, Math.floor((stubFootY - cy - 36) / lh)));
				ctx.textAlign = 'center';
				ctx.font = `400 ${fontSize}px "Newsreader", Georgia, serif`;
				ctx.fillStyle = palette.secondary;
				for (const line of wrapCanvasText(ctx, `“${film.plainText}”`, innerW - 20, maxLines)) {
					ctx.fillText(line, W / 2, cy);
					cy += lh;
				}
			}

			ctx.textAlign = 'center';
			ctx.fillStyle = palette.muted;
			ctx.font = '500 20px "JetBrains Mono", monospace';
			ctx.fillText("MOON'S FILM DIARY", W / 2, stubFootY);
			return;
		}

		// ── STYLE 1: EDITORIAL (Default Framed Criterion-Style Card) ──
		const bgGrad = ctx.createLinearGradient(0, 0, 0, H);
		bgGrad.addColorStop(0, palette.bg);
		bgGrad.addColorStop(1, palette.bg2);
		ctx.fillStyle = bgGrad;
		ctx.fillRect(0, 0, W, H);

		const rad = ctx.createRadialGradient(W * 0.5, isStory ? H * 0.28 : H * 0.25, 40, W * 0.5, isStory ? H * 0.28 : H * 0.25, 620);
		rad.addColorStop(0, palette.glow);
		rad.addColorStop(1, 'rgba(0,0,0,0)');
		ctx.fillStyle = rad;
		ctx.fillRect(0, 0, W, H);

		const pad = 64;
		ctx.strokeStyle = palette.border;
		ctx.lineWidth = 2;
		drawRoundedRect(ctx, pad, pad, W - pad * 2, H - pad * 2, 24);
		ctx.stroke();

		const innerX = pad + 56;
		const innerW = W - innerX * 2;
		const topY = pad + 62;

		ctx.fillStyle = palette.gold;
		ctx.font = '500 22px "JetBrains Mono", monospace';
		ctx.textAlign = 'left';
		ctx.fillText(showReview ? 'FILM REVIEW' : 'SCREENING LOG', innerX, topY);

		if (film.watchedDate) {
			ctx.fillStyle = palette.muted;
			ctx.textAlign = 'right';
			ctx.fillText(formatFullDate(film.watchedDate).toUpperCase(), W - innerX, topY);
		}

		const posterW = showReview ? (isStory ? 460 : 340) : (isStory ? 560 : 450);
		const posterH = Math.round(posterW * 1.5);
		const posterX = Math.round((W - posterW) / 2);
		const posterY = showReview ? (isStory ? topY + 78 : topY + 52) : (isStory ? topY + 135 : topY + 75);

		drawPosterOrSleeve(ctx, posterImg, film, posterX, posterY, posterW, posterH, 16, palette, isLight);

		let cursorY = posterY + posterH + (isStory ? 84 : 64);
		ctx.textAlign = 'center';
		ctx.fillStyle = palette.ink;
		ctx.font = `500 ${isStory ? 62 : 52}px "Newsreader", Georgia, serif`;
		for (const line of wrapCanvasText(ctx, film.title, innerW, 2)) {
			ctx.fillText(line, W / 2, cursorY);
			cursorY += isStory ? 72 : 60;
		}

		cursorY += 12;
		if (drawCenteredMetaRow(ctx, film, W / 2, cursorY, palette)) {
			cursorY += isStory ? 68 : 52;
		}

		const footerTop = H - pad - 76;
		if (showReview) {
			ctx.strokeStyle = palette.border;
			ctx.lineWidth = 1.5;
			ctx.beginPath();
			ctx.moveTo(W / 2 - 120, cursorY);
			ctx.lineTo(W / 2 + 120, cursorY);
			ctx.stroke();
			cursorY += isStory ? 64 : 48;

			const availableH = footerTop - cursorY - 24;
			const fontSize = isStory ? 36 : 30;
			const lineHeight = isStory ? 56 : 46;
			const maxLines = Math.max(2, Math.min(isStory ? 9 : 5, Math.floor(availableH / lineHeight)));
			ctx.textAlign = 'center';
			ctx.font = `400 ${fontSize}px "Newsreader", Georgia, serif`;
			ctx.fillStyle = palette.secondary;
			for (const line of wrapCanvasText(ctx, `“${film.plainText}”`, innerW - 24, maxLines)) {
				ctx.fillText(line, W / 2, cursorY);
				cursorY += lineHeight;
			}
		}

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
		const film = state.visibleItems[state.activeIndex];
		shareState.film = film;
		shareState.theme = document.documentElement.getAttribute('data-theme') || 'dark';
		const canShowReview = Boolean(film.isReview && !film.hasSpoilers && film.plainText);
		shareState.includeReview = canShowReview;

		els.shareReviewToggle.checked = canShowReview;
		els.shareReviewToggle.disabled = !canShowReview;
		els.shareReviewLabel.classList.toggle('is-disabled', !canShowReview);
		els.shareReviewLabel.title = canShowReview
			? 'Include review quote on card'
			: (film.hasSpoilers ? 'Hidden on card (contains spoilers)' : 'No written review for this entry');

		els.shareStyleToggle.querySelectorAll('.view-btn').forEach(b => {
			b.classList.toggle('active', b.dataset.style === shareState.style);
		});
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

	els.shareStyleToggle.addEventListener('click', e => {
		const btn = e.target.closest('.view-btn');
		if (!btn) return;
		shareState.style = btn.dataset.style;
		els.shareStyleToggle.querySelectorAll('.view-btn').forEach(b => b.classList.toggle('active', b === btn));
		renderShareCard();
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

	els.shareReviewToggle.addEventListener('change', () => {
		shareState.includeReview = els.shareReviewToggle.checked;
		renderShareCard();
	});

	els.downloadCardBtn.addEventListener('click', () => {
		if (!shareState.film) return;
		try {
			const dataUrl = els.shareCanvas.toDataURL('image/png');
			const a = document.createElement('a');
			a.href = dataUrl;
			a.download = `${shareState.film.slug || 'film'}-${shareState.style}-${shareState.format}.png`;
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

	// ── Data Hydration (single gzipped JSON fetch over HTTP; dynamic script fallback ONLY on file://) ──
	function populateYears() {
		if (!els.yearSelect) return;
		const years = Array.from(new Set(state.films.map(f => (f.watchedDate || '').slice(0, 4)).filter(y => /^\d{4}$/.test(y))))
			.sort((a, b) => b.localeCompare(a));
		els.yearSelect.innerHTML = `<option value="all">All Years</option>` + years.map(y => `<option value="${y}">${y}</option>`).join('');
	}

	function hydrate(data) {
		state.films = (data.films || []).map((f, i) => ({
			...f,
			stars: formatStars(f.rating),
			order: i,
			_search: `${f.title || ''} ${f.year || ''} ${f.plainText || ''}`.toLowerCase()
		}));
		state.lists = data.lists || [];
		state.recentReviews = state.films.filter(f => f.isReview).slice(0, 5);
		populateYears();
		updateCounts();
		renderContent();
		openFromHash();
	}

	function loadFileFallback() {
		const s = document.createElement('script');
		s.src = 'data/archive.js';
		s.onload = () => {
			if (window.__DIARY_DATA__) hydrate(window.__DIARY_DATA__);
		};
		s.onerror = () => {
			els.contentArea.innerHTML = `<div class="state-box">Could not load diary archive.</div>`;
		};
		document.body.appendChild(s);
	}

	if (window.location.protocol === 'file:') {
		loadFileFallback();
	} else {
		fetch('data/archive.json')
			.then(res => {
				if (!res.ok) throw new Error(`HTTP ${res.status}`);
				return res.json();
			})
			.then(hydrate)
			.catch(err => {
				console.warn('Falling back to archive.js:', err);
				loadFileFallback();
			});
	}
})();
