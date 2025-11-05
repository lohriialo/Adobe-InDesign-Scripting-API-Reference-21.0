// API Documentation Navigation JavaScript
// Handles left navigation pane functionality for the docs experience

(function() {
    'use strict';
    
    var withFrames = false;
    var webhelpSearchRanking = true;
    var useAjaxNavigation = window.location.protocol === 'http:' || window.location.protocol === 'https:';
    var NAV_STORAGE_KEY = 'extendscriptApiNavigationData';
    
    // Frame handling code from original site
    try {
        var parentWindow = window.name;
    } catch (e) {
        console.log("Exception: " + e);
    }
    
    if (parentWindow == "frm" || parentWindow == "contentwin") {
        var link = window.location.href; 
        var firstAnchor = link.search("#");
        if (firstAnchor > -1) {
            window.location.href = link.substr(0, firstAnchor) + link.substr(firstAnchor + 1);
        }
    }
    
    // Navigation data structure
    var navData = null;
    var currentPage = null;

    var searchState = {
        baseEntries: [],
        extraEntries: [],
        pageIndexCache: {},
        queue: [],
        activeQuery: '',
        indexing: false,
        debounceTimer: null,
        entryKeys: new Set(),
        elements: null,
        deepIndexingEnabled: false
    };
    var domParserInstance = null;
    var cachedNavFromStorage = null;
    
    // Initialize navigation when DOM is ready
    function initNavigation() {

        // ensures that a webpage has a proper viewport meta tag for responsive design
        ensureViewportMeta() 

        // Extract navigation data from existing page structure
        extractNavigationData();
        
        // Create the layout structure
        createLayoutStructure();
            
        // Populate left navigation
        populateLeftNavigation();

        // Initialize search capability
        initializeSearch();
            
        // Setup event handlers
        setupEventHandlers();
        
        // Setup pane resizing
        setupPaneResizing();
        
        // Set current page
        setCurrentPage();
    }

    function ensureViewportMeta() {
        var head = document.head || document.getElementsByTagName('head')[0];
        if (!head) {
            return;
        }
        var existing = head.querySelector('meta[name="viewport"]');
        if (!existing) {
            var meta = document.createElement('meta');
            meta.name = 'viewport';
            meta.content = 'width=device-width, initial-scale=1';
            head.appendChild(meta);
        }
    }
    
    function extractSectionTitle(topicHead) {
        if (!topicHead) {
            return '';
        }
        for (var i = 0; i < topicHead.childNodes.length; i++) {
            var node = topicHead.childNodes[i];
            if (node && node.nodeType === 3) {
                var value = node.textContent.trim();
                if (value) {
                    return value;
                }
            }
        }
        if (topicHead.firstElementChild) {
            return topicHead.firstElementChild.textContent.trim();
        }
        return topicHead.textContent.trim();
    }

    function deriveProductTitleFromDocument() {
        var mapHeader = document.querySelector('ul.map > li.topichead');
        if (mapHeader) {
            var title = extractSectionTitle(mapHeader);
            if (title && /extendscript api/i.test(title)) {
                return title.trim();
            }
        }

        var metaTitleEl = document.querySelector('meta[name="DC.title"]');
        if (metaTitleEl) {
            var metaTitle = metaTitleEl.getAttribute('content');
            if (metaTitle && /extendscript api/i.test(metaTitle)) {
                return metaTitle.trim();
            }
        }

        if (document.title && /extendscript api/i.test(document.title)) {
            return document.title.trim();
        }

        return '';
    }

    function escapeHtml(value) {
        if (value === null || value === undefined) {
            return '';
        }
        return String(value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function extractNavigationData() {
        var mapEl = document.querySelector('ul.map');
        if (mapEl) {
            navData = {
                sections: [],
                productTitle: ''
            };
            
            var topicHeads = mapEl.querySelectorAll('li.topichead');
            topicHeads.forEach(function(topicHead) {
                var sectionTitle = extractSectionTitle(topicHead);
                var section = {
                    title: sectionTitle,
                    items: []
                };
                if (!navData.productTitle && sectionTitle && /extendscript api/i.test(sectionTitle)) {
                    navData.productTitle = sectionTitle;
                }
                
                var itemsList = topicHead.querySelector('ul');
                if (itemsList) {
                    var items = itemsList.querySelectorAll('li.topicref');
                    items.forEach(function(item) {
                        var link = item.querySelector('a');
                        if (link) {
                            section.items.push({
                                title: link.textContent.trim(),
                                href: link.getAttribute('href'),
                                element: item
                            });
                        }
                    });
                }
                
                navData.sections.push(section);
            });

            if (!navData.productTitle) {
                var derivedTitle = deriveProductTitleFromDocument();
                if (derivedTitle) {
                    navData.productTitle = derivedTitle;
                } else {
                    navData.productTitle = 'ExtendScript API';
                }
            }

            persistNavigationData(navData);
            cachedNavFromStorage = navData;
            return;
        }

        // Attempt to restore from storage if no inline map was present
        var storedNavData = loadNavigationFromStorage();
        if (storedNavData) {
            navData = storedNavData;
            if (!navData.productTitle) {
                var recoveredTitle = deriveProductTitleFromDocument();
                navData.productTitle = recoveredTitle || 'ExtendScript API';
            }
            cachedNavFromStorage = navData;
        }
    }

    function persistNavigationData(data) {
        try {
            if (window.localStorage && data && data.sections && data.sections.length) {
                localStorage.setItem(NAV_STORAGE_KEY, JSON.stringify(data));
                cachedNavFromStorage = data;
            }
        } catch (err) {
            console.warn('Unable to persist navigation data:', err);
        }
    }

    function loadNavigationFromStorage() {
        try {
            if (window.localStorage) {
                var cached = localStorage.getItem(NAV_STORAGE_KEY);
                if (cached) {
                    var parsed = JSON.parse(cached);
                    if (parsed && parsed.sections && parsed.sections.length) {
                        return parsed;
                    }
                }
            }
        } catch (err) {
            console.warn('Unable to load navigation data from storage:', err);
        }
        return null;
    }

    function getStoredNavData() {
        if (cachedNavFromStorage) {
            return cachedNavFromStorage;
        }
        var stored = loadNavigationFromStorage();
        if (stored) {
            if (!stored.productTitle) {
                stored.productTitle = deriveProductTitleFromDocument() || 'ExtendScript API';
            }
            cachedNavFromStorage = stored;
        }
        return cachedNavFromStorage;
    }

    function getProductTitle() {
        if (navData && navData.productTitle && navData.productTitle.trim()) {
            return navData.productTitle.trim();
        }
        var storedNav = getStoredNavData();
        if (storedNav && storedNav.productTitle && storedNav.productTitle.trim()) {
            return storedNav.productTitle.trim();
        }
        var derived = deriveProductTitleFromDocument();
        if (derived) {
            return derived;
        }
        return 'ExtendScript API';
    }

    function updateHomeLinkLabel() {
        var homeLink = document.querySelector('.nav-header-home');
        if (!homeLink) {
            return;
        }
        homeLink.textContent = getProductTitle();
    }
    
    function createLayoutStructure() {
        var body = document.body;
        var existingContent = body.innerHTML;

        var tempContainer = document.createElement('div');
        tempContainer.innerHTML = existingContent;
        var embeddedMap = tempContainer.querySelector('ul.map');
        if (embeddedMap && embeddedMap.parentElement) {
            embeddedMap.parentElement.removeChild(embeddedMap);
        }
        existingContent = tempContainer.innerHTML;
        var homeLinkLabel = escapeHtml(getProductTitle());
        
        // Create new layout structure
        body.innerHTML = `
            <div class="doc-container">
                <div id="leftPane">
                    <div class="nav-header">
                        <a class="nav-header-home" href="index.html">${homeLinkLabel}</a>
                        <button class="mobile-nav-toggle" id="mobileNavToggle" aria-label="Toggle navigation">☰</button>
                    </div>
                    <div class="search-container" id="navSearchContainer">
                        <form name="searchForm" id="searchForm" class="search-form" onsubmit="return false;">
                            <input type="search" id="textToSearch" name="textToSearch" class="textToSearch" size="30" placeholder="Search objects, methods, properties" autocomplete="off" />
                        </form>
                        <div class="search-feedback" id="searchStatus"></div>
                        <ul class="search-results" id="searchResults"></ul>
                    </div>
                    <div class="nav-content" id="navContent">
                        <button class="expand-all-btn" onclick="toggleAllSections()">Expand All</button>
                        <ul class="nav-tree" id="navTree">
                            <!-- Navigation will be populated here -->
                        </ul>
                    </div>
                </div>
                <div class="pane-resizer" id="paneResizer"></div>
                <div id="contentPane">
                    ${existingContent}
                </div>
            </div>
        `;

        updateHomeLinkLabel();
        setupMobileNavToggle();
    }
    
    function populateLeftNavigation() {
    if (!navData) return;
        
        var navTree = document.getElementById('navTree');
        if (!navTree) return;

        navTree.innerHTML = '';

        var expandBtn = document.querySelector('.expand-all-btn');
        if (expandBtn) {
            expandBtn.style.display = navData.sections.length ? 'inline-block' : 'none';
            expandBtn.textContent = 'Expand All';
        }
        
    navData.sections.forEach(function(section) {
            var sectionLi = document.createElement('li');
            sectionLi.className = 'nav-section';
            
            var headerDiv = document.createElement('div');
            headerDiv.className = 'nav-section-header collapsed';
            headerDiv.textContent = section.title;
            headerDiv.onclick = function() {
                toggleSection(sectionLi);
            };
            
            var itemsUl = document.createElement('ul');
            itemsUl.className = 'nav-items';
            
            section.items.forEach(function(item) {
                var itemLi = document.createElement('li');
                itemLi.className = 'nav-item';
                
                var itemLink = document.createElement('a');
                itemLink.href = item.href;
                itemLink.textContent = item.title;
                itemLink.addEventListener('click', function(e) {
                    if (!useAjaxNavigation || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) {
                        return;
                    }
                    e.preventDefault();
                    loadPage(item.href, itemLi);
                });
                
                itemLi.appendChild(itemLink);
                itemsUl.appendChild(itemLi);
            });
            
            sectionLi.appendChild(headerDiv);
            sectionLi.appendChild(itemsUl);
            navTree.appendChild(sectionLi);
        });

        updateHomeLinkLabel();
        updateExpandAllButton();
    }
    
    function toggleSection(sectionLi) {
        var header = sectionLi.querySelector('.nav-section-header');
        var itemsList = sectionLi.querySelector('.nav-items');
        
        if (header.classList.contains('collapsed')) {
            header.classList.remove('collapsed');
            header.classList.add('expanded');
            itemsList.classList.add('expanded');
        } else {
            header.classList.remove('expanded');
            header.classList.add('collapsed');
            itemsList.classList.remove('expanded');
        }

        updateExpandAllButton();
    }
    
    function toggleAllSections() {
        var sections = document.querySelectorAll('.nav-section');
        var allExpanded = true;
        
        sections.forEach(function(section) {
            var header = section.querySelector('.nav-section-header');
            if (header.classList.contains('collapsed')) {
                allExpanded = false;
            }
        });
        
        sections.forEach(function(section) {
            var header = section.querySelector('.nav-section-header');
            var itemsList = section.querySelector('.nav-items');
            
            if (allExpanded) {
                header.classList.remove('expanded');
                header.classList.add('collapsed');
                itemsList.classList.remove('expanded');
            } else {
                header.classList.remove('collapsed');
                header.classList.add('expanded');
                itemsList.classList.add('expanded');
            }
        });

        updateExpandAllButton();
    }
    
    function loadPage(href, navItem) {
        if (!useAjaxNavigation) {
            window.location.href = href;
            return;
        }
        
        var normalized = normalizeHref(href);
        var effectiveNavItem = navItem || findNavItemByHref(normalized.baseHref);

        selectNavItem(effectiveNavItem);

        fetch(normalized.baseHref)
            .then(function(response) {
                return response.text();
            })
            .then(function(html) {
                if (!domParserInstance) {
                    domParserInstance = new DOMParser();
                }
                var doc = domParserInstance.parseFromString(html, 'text/html');
                var contentBody = doc.body;
                
                // Remove the map navigation from loaded content
                var embeddedMaps = contentBody.querySelectorAll('ul.map');
                embeddedMaps.forEach(function(mapEl) {
                    if (mapEl.parentElement) {
                        mapEl.parentElement.removeChild(mapEl);
                    }
                });
                
                // Update content pane
                var contentPane = document.getElementById('contentPane');
                contentPane.innerHTML = contentBody.innerHTML;
                contentPane.scrollTop = 0;
                
                // Update URL without page reload
                window.history.pushState({page: href}, '', href);
                currentPage = href;

                if (normalized.hash) {
                    scrollToHash(normalized.hash);
                }
            })
            .catch(function(error) {
                console.error('Error loading page:', error);
            });
    }
    
    function setupEventHandlers() {
        var homeLink = document.querySelector('.nav-header-home');
        if (homeLink) {
            homeLink.addEventListener('click', function(event) {
                if (!useAjaxNavigation || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
                    return;
                }
                event.preventDefault();
                loadPage(homeLink.getAttribute('href'));
            });
        }

        if (!useAjaxNavigation) {
            return;
        }
        
        // Handle browser back/forward buttons
        window.addEventListener('popstate', function(event) {
            if (event.state && event.state.page) {
                var normalized = normalizeHref(event.state.page);
                var navItem = findNavItemByHref(normalized.baseHref);
                loadPage(event.state.page, navItem);
            }
        });
    }
    
    function setupPaneResizing() {
        var resizer = document.getElementById('paneResizer');
        var leftPane = document.getElementById('leftPane');
        var isResizing = false;
        
        resizer.addEventListener('mousedown', function(e) {
            isResizing = true;
            document.addEventListener('mousemove', handleMouseMove);
            document.addEventListener('mouseup', stopResize);
            document.body.style.cursor = 'col-resize';
            e.preventDefault();
        });
        
        function handleMouseMove(e) {
            if (!isResizing) return;
            
            var containerRect = document.querySelector('.doc-container').getBoundingClientRect();
            var newWidth = e.clientX - containerRect.left;
            
            // Set minimum and maximum widths
            newWidth = Math.max(200, Math.min(500, newWidth));
            
            leftPane.style.width = newWidth + 'px';
            leftPane.style.minWidth = newWidth + 'px';
        }
        
        function stopResize() {
            isResizing = false;
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', stopResize);
            document.body.style.cursor = 'default';
        }
    }
    
    function setCurrentPage() {
        var currentHref = window.location.pathname.split('/').pop();
        if (!currentHref || currentHref === '') {
            currentHref = 'index.html';
        }
        var currentHash = window.location.hash ? window.location.hash.substring(1) : '';

        var navItem = findNavItemByHref(currentHref);
        selectNavItem(navItem);

        currentPage = currentHash ? currentHref + '#' + currentHash : currentHref;

        if (currentHash) {
            scrollToHash(currentHash);
        }
    }

    function normalizeHref(href) {
        if (!href) {
            return { baseHref: '', hash: '' };
        }
        var parts = href.split('#');
        var base = parts[0] || '';
        if (base === '' && currentPage) {
            base = normalizeHref(currentPage).baseHref;
        }
        if (base.indexOf('./') === 0) {
            base = base.substring(2);
        }
        return {
            baseHref: base,
            hash: parts.length > 1 ? parts.slice(1).join('#') : ''
        };
    }

    function findNavItemByHref(href) {
        if (!href) {
            return null;
        }
        var targetHref = normalizeHref(href).baseHref;
        var navLinks = document.querySelectorAll('.nav-item a');
        var match = null;
        navLinks.forEach(function(link) {
            var linkHref = link.getAttribute('href');
            if (!linkHref || match) {
                return;
            }
            var normalizedLinkHref = normalizeHref(linkHref).baseHref;
            if (normalizedLinkHref === targetHref) {
                match = link.parentElement;
            }
        });
        return match;
    }

    function selectNavItem(navItem) {
        var allItems = document.querySelectorAll('.nav-item');
        allItems.forEach(function(item) {
            item.classList.remove('selected');
        });

        if (!navItem) {
            updateExpandAllButton();
            return;
        }

        navItem.classList.add('selected');
        var section = navItem.closest('.nav-section');
        if (section) {
            var header = section.querySelector('.nav-section-header');
            var itemsList = section.querySelector('.nav-items');
            if (header && itemsList) {
                header.classList.remove('collapsed');
                header.classList.add('expanded');
                itemsList.classList.add('expanded');
            }
        }
        if (typeof navItem.scrollIntoView === 'function') {
            navItem.scrollIntoView({ block: 'nearest' });
        }

        updateExpandAllButton();
    }

    function scrollToHash(hash) {
        if (!hash) {
            return;
        }
        var contentPane = document.getElementById('contentPane');
        if (!contentPane) {
            return;
        }

        var escaped = escapeCssId(hash);
        var target = contentPane.querySelector('#' + escaped) || contentPane.querySelector('[name="' + hash + '"]');
        if (target && typeof target.scrollIntoView === 'function') {
            target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    }

    function escapeCssId(value) {
        if (!value) {
            return value;
        }
        if (window.CSS && typeof window.CSS.escape === 'function') {
            return window.CSS.escape(value);
        }
        return value.replace(/([^a-zA-Z0-9_-])/g, '\\$1');
    }

    function updateExpandAllButton() {
        var btn = document.querySelector('.expand-all-btn');
        if (!btn) {
            return;
        }
        var headers = document.querySelectorAll('.nav-section-header');
        if (!headers.length) {
            btn.textContent = 'Expand All';
            return;
        }
        var allExpanded = true;
        headers.forEach(function(header) {
            if (header.classList.contains('collapsed')) {
                allExpanded = false;
            }
        });
        btn.textContent = allExpanded ? 'Collapse All' : 'Expand All';
    }

    function initializeSearch() {
        var searchContainer = document.getElementById('navSearchContainer');
        var searchForm = document.getElementById('searchForm');
        var searchInput = document.getElementById('textToSearch');
        var searchResults = document.getElementById('searchResults');
        var searchStatus = document.getElementById('searchStatus');

        if (!searchContainer || !searchForm || !searchInput || !searchResults) {
            return;
        }

        searchState.elements = {
            container: searchContainer,
            form: searchForm,
            input: searchInput,
            results: searchResults,
            status: searchStatus || null
        };

        searchState.deepIndexingEnabled = useAjaxNavigation;

        prepareBaseSearchEntries();
        buildIndexQueue();

        searchForm.addEventListener('submit', function(event) {
            event.preventDefault();
            handleSearchQuery(searchInput.value);
        });

        searchInput.addEventListener('input', function(event) {
            handleSearchQuery(event.target.value);
        });

        searchResults.addEventListener('click', function(event) {
            var link = event.target.closest('a');
            if (!link) {
                return;
            }
            if (!useAjaxNavigation || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
                return;
            }
            event.preventDefault();
            var href = link.getAttribute('href');
            if (!href) {
                return;
            }
            loadPage(href);
        });

        updateSearchFeedback();
        scheduleIndexing();
    }

    function prepareBaseSearchEntries() {
        searchState.baseEntries = [];
        if (!navData || !navData.sections) {
            return;
        }
        navData.sections.forEach(function(section) {
            var sectionTitle = section.title || '';
            section.items.forEach(function(item) {
                var entry = buildSearchEntry('object', item.title, item.href, { section: sectionTitle });
                registerEntry(searchState.baseEntries, entry);
            });
        });
    }

    function handleSearchQuery(value) {
        var query = (value || '').trim();
        searchState.activeQuery = query;
        if (searchState.debounceTimer) {
            clearTimeout(searchState.debounceTimer);
        }
        searchState.debounceTimer = setTimeout(function() {
            performSearch(query);
        }, 120);
    }

    function performSearch(query) {
        var elements = searchState.elements;
        if (!elements || !elements.results) {
            return;
        }

        if (!query || query.length < 2) {
            elements.results.innerHTML = '';
            if (elements.container) {
                elements.container.classList.remove('has-query');
            }
            updateSearchFeedback();
            return;
        }

        var normalized = query.toLowerCase();
        var matches = [];

        function evaluateEntry(entry, sourceWeight) {
            if (!entry) {
                return;
            }
            var score = evaluateMatch(entry, normalized);
            if (score === Infinity) {
                return;
            }
            matches.push({ entry: entry, score: score + sourceWeight });
        }

        searchState.baseEntries.forEach(function(entry) {
            evaluateEntry(entry, 0);
        });
        searchState.extraEntries.forEach(function(entry) {
            evaluateEntry(entry, 10);
        });

        matches.sort(function(a, b) {
            if (a.score !== b.score) {
                return a.score - b.score;
            }
            return a.entry.title.localeCompare(b.entry.title);
        });

        var topResults = matches.slice(0, 50).map(function(item) {
            return item.entry;
        });

        renderSearchResults(topResults, query);
    }

    function evaluateMatch(entry, normalizedQuery) {
        if (entry.titleLower === normalizedQuery) {
            return 0;
        }
        if (entry.titleLower.indexOf(normalizedQuery) === 0) {
            return 1;
        }
        if (entry.titleLower.indexOf(normalizedQuery) !== -1) {
            return 2;
        }
        if (entry.searchBlob && entry.searchBlob.indexOf(normalizedQuery) !== -1) {
            return 3;
        }
        return Infinity;
    }

    function renderSearchResults(entries, query) {
        var elements = searchState.elements;
        if (!elements || !elements.results) {
            return;
        }
        var resultsEl = elements.results;
        resultsEl.innerHTML = '';

        if (!query || query.length < 2) {
            if (elements.container) {
                elements.container.classList.remove('has-query');
            }
            updateSearchFeedback();
            return;
        }

        if (elements.container) {
            elements.container.classList.add('has-query');
        }

        if (!entries.length) {
            updateSearchFeedback(query, 0);
            return;
        }

        var fragment = document.createDocumentFragment();

        entries.forEach(function(entry) {
            var li = document.createElement('li');
            li.className = 'search-result-item search-result-' + entry.type;

            var link = document.createElement('a');
            link.href = entry.href;
            link.textContent = entry.title;
            li.appendChild(link);

            var metaPieces = [];
            if (entry.type) {
                metaPieces.push(entry.type.charAt(0).toUpperCase() + entry.type.slice(1));
            }
            if (entry.context) {
                metaPieces.push(entry.context);
            } else if (entry.section) {
                metaPieces.push(entry.section);
            }

            if (metaPieces.length) {
                var meta = document.createElement('div');
                meta.className = 'result-meta';
                meta.textContent = metaPieces.join(' · ');
                li.appendChild(meta);
            }

            fragment.appendChild(li);
        });

        resultsEl.appendChild(fragment);
        updateSearchFeedback(query, entries.length);
    }

    function updateSearchFeedback(query, resultCount) {
        var elements = searchState.elements;
        if (!elements || !elements.status) {
            return;
        }
        var statusEl = elements.status;
        if (!query || query.length < 2) {
            statusEl.textContent = 'Type at least two characters to search.';
            return;
        }

        if (!searchState.deepIndexingEnabled) {
            if (resultCount && resultCount > 0) {
                var limitedSuffix = resultCount === 1 ? '' : 's';
                statusEl.textContent = resultCount + ' result' + limitedSuffix + '. Serve these docs over http(s) to include methods and properties in search.';
            } else {
                statusEl.textContent = 'Object names are searchable offline. Serve the docs over http(s) to search methods and properties.';
            }
            return;
        }

        if (resultCount && resultCount > 0) {
            var suffix = resultCount === 1 ? '' : 's';
            if (searchState.indexing) {
                statusEl.textContent = resultCount + ' result' + suffix + ' (indexing continues…)';
            } else {
                statusEl.textContent = resultCount + ' result' + suffix;
            }
            return;
        }

        if (searchState.indexing && searchState.deepIndexingEnabled) {
            statusEl.textContent = 'No matches yet. Indexing methods and properties…';
        } else {
            statusEl.textContent = 'No matches found.';
        }
    }

    function buildIndexQueue() {
        searchState.queue = [];
        if (!navData || !navData.sections) {
            return;
        }
        var seen = new Set();
        navData.sections.forEach(function(section) {
            section.items.forEach(function(item) {
                var normalized = normalizeHref(item.href);
                var base = normalized.baseHref;
                if (!base || seen.has(base)) {
                    return;
                }
                seen.add(base);
                searchState.queue.push(base);
            });
        });
    }

    function scheduleIndexing() {
        if (!searchState.deepIndexingEnabled) {
            searchState.indexing = false;
            return;
        }
        if (searchState.indexing || !searchState.queue.length) {
            searchState.indexing = searchState.queue.length > 0;
            return;
        }
        searchState.indexing = true;
        setTimeout(processNextIndex, 120);
    }

    function processNextIndex() {
        if (!searchState.queue.length) {
            searchState.indexing = false;
            updateSearchFeedback(searchState.activeQuery, null);
            return;
        }

        var href = searchState.queue.shift();
        buildIndexForPage(href)
            .catch(function() {
                return [];
            })
            .finally(function() {
                if (searchState.queue.length) {
                    setTimeout(processNextIndex, 40);
                } else {
                    searchState.indexing = false;
                }
                if (searchState.activeQuery && searchState.activeQuery.length >= 2) {
                    performSearch(searchState.activeQuery);
                }
            });
    }

    function buildIndexForPage(href) {
        if (searchState.pageIndexCache[href]) {
            return Promise.resolve(searchState.pageIndexCache[href]);
        }
        return fetch(href)
            .then(function(response) {
                if (!response.ok) {
                    throw new Error('HTTP ' + response.status);
                }
                return response.text();
            })
            .then(function(html) {
                if (!domParserInstance) {
                    domParserInstance = new DOMParser();
                }
                var doc = domParserInstance.parseFromString(html, 'text/html');
                var pageTitleEl = doc.querySelector('h1.title.topictitle1') || doc.querySelector('h1.title') || doc.querySelector('h1');
                var pageTitle = pageTitleEl ? pageTitleEl.textContent.trim() : href;
                var entries = extractPageIndex(doc, href, pageTitle);
                searchState.pageIndexCache[href] = entries;
                entries.forEach(function(entry) {
                    registerEntry(searchState.extraEntries, entry);
                });
                return entries;
            })
            .catch(function(error) {
                console.warn('Unable to index search data for', href, error);
                searchState.pageIndexCache[href] = [];
                return [];
            });
    }

    function extractPageIndex(doc, baseHref, pageTitle) {
        var entries = [];
        var localKeys = new Set();

        function pushEntry(entry) {
            if (!entry) {
                return;
            }
            var key = entryKey(entry);
            if (localKeys.has(key)) {
                return;
            }
            localKeys.add(key);
            entries.push(entry);
        }

        var sections = doc.querySelectorAll('div.section');
        sections.forEach(function(section) {
            var header = section.querySelector('.title.sectiontitle') || section.querySelector('h2');
            if (!header) {
                return;
            }
            var headingText = header.textContent.trim().toLowerCase();
            if (!headingText) {
                return;
            }

            if (headingText.indexOf('method') !== -1) {
                var methodAnchors = section.querySelectorAll('a.xref');
                methodAnchors.forEach(function(anchor) {
                    var text = anchor.textContent.trim();
                    if (!text) {
                        return;
                    }
                    var href = anchor.getAttribute('href') || '';
                    var resolved = href && href.charAt(0) === '#' ? baseHref + href : (href || baseHref);
                    pushEntry(buildSearchEntry('method', text, resolved, { context: pageTitle }));
                });

                var methodRows = section.querySelectorAll('table tbody tr');
                methodRows.forEach(function(row) {
                    var cells = row.querySelectorAll('td');
                    if (!cells.length) {
                        return;
                    }
                    var nameCell = cells[0];
                    var anchor = nameCell.querySelector('a.xref');
                    var text = anchor ? anchor.textContent.trim() : nameCell.textContent.trim();
                    if (!text) {
                        return;
                    }
                    var href = anchor ? anchor.getAttribute('href') : '';
                    var resolved = href && href.charAt(0) === '#' ? baseHref + href : (href || baseHref);
                    pushEntry(buildSearchEntry('method', text, resolved, { context: pageTitle }));
                });
            }

            if (headingText.indexOf('property') !== -1) {
                var propertyNames = collectPropertyNames(section);
                var anchorId = section.getAttribute('id');
                var anchorHref = anchorId ? baseHref + '#' + anchorId : baseHref;
                propertyNames.forEach(function(name) {
                    pushEntry(buildSearchEntry('property', name, anchorHref, { context: pageTitle }));
                });

                if (!propertyNames.length) {
                    var propertyAnchors = section.querySelectorAll('a.xref');
                    propertyAnchors.forEach(function(anchor) {
                        var text = anchor.textContent.trim();
                        if (!text) {
                            return;
                        }
                        var href = anchor.getAttribute('href') || '';
                        var resolved = href && href.charAt(0) === '#' ? baseHref + href : (href || baseHref);
                        pushEntry(buildSearchEntry('property', text, resolved, { context: pageTitle }));
                    });
                }
            }
        });

        return entries;
    }

    function collectPropertyNames(section) {
        var names = [];
        var rows = section.querySelectorAll('table tbody tr');
        rows.forEach(function(row) {
            var cells = row.querySelectorAll('td');
            if (!cells.length) {
                return;
            }
            var nameCell = cells[0];
            var clip = nameCell.querySelector('.clip_button');
            var text = clip ? clip.textContent.trim() : nameCell.textContent.trim();
            if (text && names.indexOf(text) === -1) {
                names.push(text);
            }
        });

        if (!names.length) {
            var inlineProps = section.querySelectorAll('.clip_button');
            inlineProps.forEach(function(el) {
                var text = el.textContent.trim();
                if (text && names.indexOf(text) === -1) {
                    names.push(text);
                }
            });
        }

        return names;
    }

    function buildSearchEntry(type, title, href, meta) {
        if (!title || !href) {
            return null;
        }
        var normalized = normalizeHref(href);
        var baseHref = normalized.baseHref || href;
        var finalHref = normalized.hash ? baseHref + '#' + normalized.hash : baseHref;
        var sectionText = meta && meta.section ? meta.section : '';
        var contextText = meta && meta.context ? meta.context : '';
        var lowerTitle = title.toLowerCase();
        var searchBlobParts = [lowerTitle];
        if (sectionText) {
            searchBlobParts.push(sectionText.toLowerCase());
        }
        if (contextText) {
            searchBlobParts.push(contextText.toLowerCase());
        }
        if (meta && meta.keywords) {
            searchBlobParts.push(meta.keywords.toLowerCase());
        }
        return {
            type: type,
            title: title,
            href: finalHref,
            section: sectionText,
            context: contextText,
            titleLower: lowerTitle,
            searchBlob: searchBlobParts.join(' ').trim()
        };
    }

    function registerEntry(target, entry) {
        if (!target || !entry) {
            return;
        }
        var key = entryKey(entry);
        if (searchState.entryKeys.has(key)) {
            return;
        }
        searchState.entryKeys.add(key);
        target.push(entry);
    }

    function entryKey(entry) {
        return entry.type + '|' + entry.titleLower + '|' + entry.href;
    }
    
    function setupMobileNavToggle() {
        var toggleBtn = document.getElementById('mobileNavToggle');
        var navContent = document.getElementById('navContent');
        var leftPane = document.getElementById('leftPane');
        
        if (!toggleBtn || !navContent) return;
        
        toggleBtn.addEventListener('click', function() {
            var isExpanded = leftPane.classList.contains('nav-expanded');
            
            if (isExpanded) {
                leftPane.classList.remove('nav-expanded');
                toggleBtn.textContent = '☰';
                toggleBtn.setAttribute('aria-expanded', 'false');
            } else {
                leftPane.classList.add('nav-expanded');
                toggleBtn.textContent = '✕';
                toggleBtn.setAttribute('aria-expanded', 'true');
            }
        });
        
        // Close mobile nav when clicking on content area
        var contentPane = document.getElementById('contentPane');
        if (contentPane) {
            contentPane.addEventListener('click', function() {
                if (leftPane.classList.contains('nav-expanded')) {
                    leftPane.classList.remove('nav-expanded');
                    toggleBtn.textContent = '☰';
                    toggleBtn.setAttribute('aria-expanded', 'false');
                }
            });
        }
        
        // Close mobile nav when selecting a navigation item
        document.addEventListener('click', function(event) {
            var navItem = event.target.closest('.nav-item a');
            if (navItem && leftPane.classList.contains('nav-expanded')) {
                setTimeout(function() {
                    leftPane.classList.remove('nav-expanded');
                    toggleBtn.textContent = '☰';
                    toggleBtn.setAttribute('aria-expanded', 'false');
                }, 100);
            }
        });
        
        // Improve focus management for mobile
        toggleBtn.setAttribute('aria-expanded', 'false');
        toggleBtn.setAttribute('aria-controls', 'navContent');
        
        // Handle escape key to close mobile nav
        document.addEventListener('keydown', function(event) {
            if (event.key === 'Escape' && leftPane.classList.contains('nav-expanded')) {
                leftPane.classList.remove('nav-expanded');
                toggleBtn.textContent = '☰';
                toggleBtn.setAttribute('aria-expanded', 'false');
                toggleBtn.focus();
            }
        });
    }

    // Make functions globally available for onclick handlers
    window.toggleAllSections = toggleAllSections;
    
    // Initialize when DOM is loaded
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initNavigation);
    } else {
        initNavigation();
    }
    
})();