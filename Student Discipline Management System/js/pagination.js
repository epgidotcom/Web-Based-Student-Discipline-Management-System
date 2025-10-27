(() => {
  const DEFAULT_LIMIT = 100;

  function normalizeNumber(value, fallback) {
    const num = Number(value);
    return Number.isFinite(num) && num > 0 ? num : fallback;
  }

  function resolveTotalItems(payload, dataLength, limit, page, totalPages) {
    const candidates = [
      payload?.totalItems,
      payload?.total,
      payload?.total_records,
      payload?.count,
      payload?.totalCount,
      payload?.totalResults,
      payload?.meta?.total,
      payload?.meta?.totalItems
    ];

    for (const candidate of candidates) {
      const value = Number(candidate);
      if (Number.isFinite(value) && value >= 0) {
        return value;
      }
    }

    if (totalPages && totalPages > 0) {
      const estimated = (totalPages - 1) * limit + dataLength;
      if (estimated >= dataLength) return estimated;
    }

    return Math.max(dataLength, (page - 1) * limit + dataLength);
  }

  function buildSummary({ currentPage, lastCount, limit, totalItems }) {
    if (!totalItems) {
      return 'Showing 0 of 0';
    }
    if (!lastCount) {
      const start = (currentPage - 1) * limit + 1;
      const end = Math.min(start - 1, totalItems);
      return `Showing ${start}-${end} of ${totalItems}`;
    }
    const start = (currentPage - 1) * limit + 1;
    const end = start + lastCount - 1;
    return `Showing ${start}-${Math.min(end, totalItems)} of ${totalItems}`;
  }

  function createPaginationController({
    fetcher,
    limit = DEFAULT_LIMIT,
    paginationContainer,
    summaryElement,
    onData,
    onError,
    loadingClass = 'is-loading'
  } = {}) {
    if (typeof fetcher !== 'function') {
      throw new Error('fetcher function is required for pagination');
    }

    const state = {
      currentPage: 1,
      totalPages: 1,
      totalItems: 0,
      lastCount: 0,
      limit: normalizeNumber(limit, DEFAULT_LIMIT)
    };

    let isBound = false;

  // PATCH: optimistic pagination when API doesn't return totals
  function normalizePayload(payload, requestedPage) {
    if (Array.isArray(payload)) {
      const data = payload;
      const currentPage = Math.max(1, Number(requestedPage) || 1);

      let totalPages = 1;
      if (data.length === state.limit) {
        totalPages = Math.max(2, currentPage + 1);
      }

      return {
        data,
        currentPage,
        totalPages,
        totalItems: Math.max(
          data.length,
          (currentPage - 1) * state.limit + data.length
        ),
      };
    }

    // Object payloads (try to read common shapes)
    const data = Array.isArray(payload?.data) ? payload.data : [];
    const currentPage = normalizeNumber(
      payload?.currentPage ?? payload?.page ?? requestedPage,
      requestedPage
    );

    // Prefer explicit totalPages if present
    let totalPages = normalizeNumber(
      payload?.totalPages ?? payload?.total_pages ?? payload?.pages,
      0
    );

    // Derive/confirm totalItems from common fields (or estimate)
    let totalItems = resolveTotalItems(
      payload,
      data.length,
      state.limit,
      currentPage,
      totalPages
    );

    // Optimistic inference when totals are missing or 1:
    // - exactly limit items => likely more pages
    // - 0 items on later page => clamp to current page
    if (!totalPages || totalPages <= 1) {
      if (data.length === state.limit) {
        totalPages = Math.max(2, currentPage + 1);
      } else if (data.length === 0 && currentPage > 1) {
        totalPages = currentPage;
      } else {
        totalPages = 1;
      }
    }

    return {
      data,
      currentPage: Math.max(1, currentPage),
      totalPages: Math.max(1, totalPages),
      totalItems: Math.max(0, totalItems),
    };
  }


    function updateSummary() {
      if (!summaryElement) return;
      summaryElement.textContent = buildSummary(state);
    }

    function renderPagination(totalPages = state.totalPages, currentPage = state.currentPage) {
      if (!paginationContainer) return;

      paginationContainer.innerHTML = '';

      if (totalPages <= 1) {
        paginationContainer.classList.add('is-hidden');
        return;
      }

      paginationContainer.classList.remove('is-hidden');

      const prevBtn = document.createElement('button');
      prevBtn.type = 'button';
      prevBtn.className = 'page-btn prev';
      prevBtn.textContent = 'Previous';
      prevBtn.disabled = currentPage <= 1;
      prevBtn.dataset.page = String(Math.max(1, currentPage - 1));
      prevBtn.setAttribute('aria-label', 'Previous page');
      paginationContainer.appendChild(prevBtn);

      const windowSize = 5;
      let start = Math.max(1, currentPage - Math.floor(windowSize / 2));
      let end = start + windowSize - 1;
      if (end > totalPages) {
        end = totalPages;
        start = Math.max(1, end - windowSize + 1);
      }

      const numbersWrap = document.createElement('div');
      numbersWrap.className = 'page-numbers';

      for (let page = start; page <= end; page += 1) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'page-btn number';
        btn.textContent = String(page);
        btn.dataset.page = String(page);
        if (page === currentPage) {
          btn.classList.add('is-active');
          btn.setAttribute('aria-current', 'page');
        }
        numbersWrap.appendChild(btn);
      }

      paginationContainer.appendChild(numbersWrap);

      const nextBtn = document.createElement('button');
      nextBtn.type = 'button';
      nextBtn.className = 'page-btn next';
      nextBtn.textContent = 'Next';
      nextBtn.disabled = currentPage >= totalPages;
      nextBtn.dataset.page = String(Math.min(totalPages, currentPage + 1));
      nextBtn.setAttribute('aria-label', 'Next page');
      paginationContainer.appendChild(nextBtn);
    }

    async function fetchData(page = 1) {
      const targetPage = Math.max(1, Number(page) || 1);
      const cleanup = () => {
        if (paginationContainer && loadingClass) {
          paginationContainer.classList.remove(loadingClass);
        }
        updateSummary();
      };

      try {
        if (paginationContainer && loadingClass) {
          paginationContainer.classList.add(loadingClass);
        }
        const payload = await fetcher(targetPage, state.limit);
        const normalized = normalizePayload(payload, targetPage);

        state.currentPage = Math.min(normalized.currentPage, normalized.totalPages);
        state.totalPages = normalized.totalPages;
        state.totalItems = normalized.totalItems;
        state.lastCount = normalized.data.length;

        if (typeof onData === 'function') {
          await onData(normalized.data, { ...state });
        }

        renderPagination(state.totalPages, state.currentPage);
        updateSummary();
        return normalized.data;
      } catch (error) {
        if (typeof onError === 'function') {
          onError(error);
        } else {
          console.error('[pagination] fetch failed', error);
        }
        throw error;
      } finally {
        cleanup();
      }
    }

    function bindEvents() {
      if (isBound || !paginationContainer) return;
      paginationContainer.addEventListener('click', (event) => {
        // Ensure a small on-screen debug badge exists so users without console logs
        // can still see that clicks are reaching the pagination controller.
        try {
          let dbg = document.getElementById('sdms-pagination-debug');
          if (!dbg) {
            dbg = document.createElement('div');
            dbg.id = 'sdms-pagination-debug';
            dbg.style.position = 'fixed';
            dbg.style.right = '12px';
            dbg.style.bottom = '12px';
            dbg.style.padding = '6px 10px';
            dbg.style.background = 'rgba(0,0,0,0.6)';
            dbg.style.color = '#fff';
            dbg.style.fontSize = '12px';
            dbg.style.borderRadius = '6px';
            dbg.style.zIndex = '999999';
            dbg.style.pointerEvents = 'none';
            dbg.textContent = 'pagination: ready';
            document.body.appendChild(dbg);
          }
        } catch (e) { /* ignore DOM insta-failures */ }
        // Debug: trace clicks delegated to pagination container
        try {
          const btn = event.target && event.target.closest ? event.target.closest('.page-btn') : null;
          console.debug('[pagination] click event', { target: String(event.target && (event.target.tagName || event.target.nodeName)), page: btn ? btn.dataset.page : null, disabled: !!(btn && btn.disabled) });
          if (btn) {
            const dbg = document.getElementById('sdms-pagination-debug');
            if (dbg) dbg.textContent = `pagination: clicked page=${btn.dataset.page}`;
          }
        } catch (e) {
          console.debug('[pagination] click event (debug failed)', e);
        }

        const button = event.target.closest('.page-btn');
        if (!button || button.disabled) return;
        const nextPage = Number(button.dataset.page);
        if (!Number.isFinite(nextPage)) return;
        fetchData(nextPage);
      });
      isBound = true;
    }

    bindEvents();

    return {
      fetchData,
      renderPagination,
      getState() {
        return { ...state };
      }
    };
  }

  window.SDMS = window.SDMS || {};
  window.SDMS.createPaginationController = createPaginationController;
})();