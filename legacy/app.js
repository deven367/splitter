// GitHub Configuration
let githubConfig = {
    token: localStorage.getItem('github_token') || '',
    repo: localStorage.getItem('github_repo') || '',
    branch: localStorage.getItem('github_branch') || 'main'
};

// Groups
let groups = ['default'];
let currentGroup = localStorage.getItem('splitter_current_group') || 'default';
let groupsSha = null; // SHA for groups.json

// Data Store
let members = [];
let expenses = [];
let currentSha = null; // SHA of current group's data file

// Sync Queue - for batching commits
let syncQueue = [];
let syncTimeout = null;
let isSyncing = false;
const SYNC_DELAY = 3000; // Wait 3 seconds before committing (batches rapid changes)

// Constants
const DEFAULT_GROUP_DISPLAY_NAME = 'Default Group';
const INVALID_GROUP_NAME_CHARS = /[<>"'`]/;
const INVALID_GROUP_NAME_CHARS_LIST = '<, >, ", \', or `';
const RESERVED_FILENAMES = new Set([
    'con', 'prn', 'aux', 'nul',
    'com1', 'com2', 'com3', 'com4', 'com5', 'com6', 'com7', 'com8', 'com9',
    'lpt1', 'lpt2', 'lpt3', 'lpt4', 'lpt5', 'lpt6', 'lpt7', 'lpt8', 'lpt9'
]);

/**
 * Encodes a UTF-8 string to base64 format required by GitHub API.
 * GitHub's API requires file content to be base64-encoded, and this function
 * properly handles UTF-8 characters by converting them through percent-encoding first.
 * @param {string} str - The UTF-8 string to encode
 * @returns {string} Base64-encoded string
 */
function utf8ToBase64(str) {
    return btoa(encodeURIComponent(str).replace(/%([0-9A-F]{2})/g, (match, p1) =>
        String.fromCharCode(parseInt(p1, 16))
    ));
}

/**
 * Sanitizes a string for safe display in user-facing messages by removing
 * potentially dangerous HTML characters. Note: This only removes angle brackets
 * for basic HTML injection prevention. For full XSS protection, use textContent
 * or createElement when inserting into DOM.
 * @param {string} str - The string to sanitize
 * @returns {string} Sanitized string with <> characters removed
 */
function sanitizeForDisplay(str) {
    return String(str).replace(/[<>]/g, '');
}

// Check if a filename base is a reserved name (Windows reserved device names)
function isReservedFilename(baseName) {
    return RESERVED_FILENAMES.has((baseName || '').toLowerCase());
}

/**
 * Escapes a string for use in HTML attributes (e.g. id="...", value="...")
 */
function escapeAttr(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

/**
 * Escapes a string for use inside a JavaScript string literal in an HTML attribute
 * e.g. onclick="removeMember('...')"
 */
function escapeJsArg(str) {
    return String(str)
        .replace(/\\/g, '\\\\')
        .replace(/'/g, "\\'")
        .replace(/"/g, '&quot;');
}

// Get data filename for a group
function getDataFilename(groupName) {
    if (groupName === 'default') return 'data.json';
    // Sanitize group name for filename
    let safeName = (groupName || '').toLowerCase().replace(/[^a-z0-9]+/g, '_');
    // Trim leading/trailing underscores
    safeName = safeName.replace(/^_+|_+$/g, '');
    // Ensure the sanitized name is not empty
    if (!safeName) {
        safeName = 'group';
    }
    // Avoid reserved filenames
    if (isReservedFilename(safeName)) {
        safeName = `group_${safeName}`;
    }
    return `data_${safeName}.json`;
}

// Initialize
async function init() {
    await loadGroups();
    await loadData();
    renderGroups();
    renderAll();
}

// Settings Modal
function showSettings() {
    document.getElementById('settingsModal').classList.remove('hidden');
    document.getElementById('githubToken').value = githubConfig.token;
    document.getElementById('githubRepo').value = githubConfig.repo;
    document.getElementById('githubBranch').value = githubConfig.branch;
}

function hideSettings() {
    document.getElementById('settingsModal').classList.add('hidden');
    document.getElementById('connectionStatus').innerHTML = '';
    document.getElementById('connectionStatus').className = 'connection-status';
}

async function saveSettings() {
    const token = document.getElementById('githubToken').value.trim();
    const repo = document.getElementById('githubRepo').value.trim();
    const branch = document.getElementById('githubBranch').value.trim() || 'main';

    githubConfig = { token, repo, branch };

    localStorage.setItem('github_token', token);
    localStorage.setItem('github_repo', repo);
    localStorage.setItem('github_branch', branch);

    const status = document.getElementById('connectionStatus');

    if (!token || !repo) {
        status.className = 'connection-status error';
        status.innerHTML = '❌ Please enter both token and repository';
        return;
    }

    try {
        status.innerHTML = '⏳ Connecting...';
        status.className = 'connection-status';

        await loadGroups();
        await loadFromGitHub();

        status.className = 'connection-status success';
        status.innerHTML = '✅ Connected! Data loaded from GitHub.';

        renderGroups();
        renderAll();

        setTimeout(() => hideSettings(), 1500);
    } catch (error) {
        status.className = 'connection-status error';
        status.innerHTML = `❌ ${error.message}`;
    }
}

// Groups Management
async function loadGroups() {
    const { token, repo, branch } = githubConfig;

    if (!token || !repo) {
        // Load from localStorage
        const savedGroups = localStorage.getItem('splitter_groups');
        if (savedGroups) groups = JSON.parse(savedGroups);
        return;
    }

    try {
        const response = await fetch(
            `https://api.github.com/repos/${repo}/contents/groups.json?ref=${branch}`,
            {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Accept': 'application/vnd.github.v3+json'
                }
            }
        );

        if (response.status === 404) {
            // Initialize groups.json
            groups = ['default'];
            await saveGroupsToGitHub();
            return;
        }

        if (!response.ok) throw new Error('Failed to load groups');

        const data = await response.json();
        groupsSha = data.sha;
        groups = JSON.parse(atob(data.content));
        localStorage.setItem('splitter_groups', JSON.stringify(groups));
    } catch (error) {
        console.error('Failed to load groups:', error);
        const savedGroups = localStorage.getItem('splitter_groups');
        if (savedGroups) groups = JSON.parse(savedGroups);
    }
}

async function saveGroupsToGitHub() {
    const { token, repo, branch } = githubConfig;

    if (!token || !repo) {
        localStorage.setItem('splitter_groups', JSON.stringify(groups));
        return;
    }

    const content = utf8ToBase64(JSON.stringify(groups, null, 2));

    const body = {
        message: 'Update groups',
        content,
        branch
    };

    if (groupsSha) body.sha = groupsSha;

    const response = await fetch(
        `https://api.github.com/repos/${repo}/contents/groups.json`,
        {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Accept': 'application/vnd.github.v3+json',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(body)
        }
    );

    if (!response.ok) throw new Error('Failed to save groups');

    const result = await response.json();
    groupsSha = result.content.sha;
    localStorage.setItem('splitter_groups', JSON.stringify(groups));
}

function showGroupModal() {
    document.getElementById('groupModal').classList.remove('hidden');
    renderGroupsList();
}

function hideGroupModal() {
    document.getElementById('groupModal').classList.add('hidden');
    document.getElementById('newGroupName').value = '';
}

function renderGroups() {
    const select = document.getElementById('groupSelect');

    // Clear existing options
    while (select.firstChild) {
        select.removeChild(select.firstChild);
    }

    // Populate options safely using textContent
    groups.forEach(g => {
        const option = document.createElement('option');
        option.value = g;
        option.textContent = g === 'default' ? DEFAULT_GROUP_DISPLAY_NAME : g;
        if (g === currentGroup) {
            option.selected = true;
        }
        select.appendChild(option);
    });
}

function renderGroupsList() {
    const container = document.getElementById('groupsList');

    // Clear existing content
    while (container.firstChild) {
        container.removeChild(container.firstChild);
    }

    if (groups.length === 0) {
        const emptyEl = document.createElement('p');
        emptyEl.className = 'groups-empty';
        emptyEl.textContent = 'No groups yet.';
        container.appendChild(emptyEl);
        return;
    }

    groups.forEach(g => {
        const item = document.createElement('div');
        item.className = 'group-item';

        const nameSpan = document.createElement('span');
        nameSpan.className = 'group-name';
        nameSpan.textContent = g === 'default' ? DEFAULT_GROUP_DISPLAY_NAME : g;
        item.appendChild(nameSpan);

        const actionsDiv = document.createElement('div');
        actionsDiv.className = 'group-actions';

        const selectBtn = document.createElement('button');
        selectBtn.className = 'select-btn';
        selectBtn.textContent = 'Select';
        selectBtn.addEventListener('click', function () {
            selectGroup(g);
        });
        actionsDiv.appendChild(selectBtn);

        if (g !== 'default') {
            const deleteBtn = document.createElement('button');
            deleteBtn.className = 'delete-btn';
            deleteBtn.textContent = 'Delete';
            deleteBtn.addEventListener('click', function () {
                deleteGroup(g);
            });
            actionsDiv.appendChild(deleteBtn);
        }

        item.appendChild(actionsDiv);
        container.appendChild(item);
    });
}

async function createGroup() {
    const input = document.getElementById('newGroupName');
    const name = input.value.trim();

    if (!name) {
        alert('Please enter a group name');
        return;
    }

    // Validate group name doesn't contain problematic characters
    if (INVALID_GROUP_NAME_CHARS.test(name)) {
        alert(`Group name cannot contain ${INVALID_GROUP_NAME_CHARS_LIST} characters`);
        return;
    }

    // Check for both name and filename collisions to prevent data overwrites
    const newFilename = getDataFilename(name);
    if (groups.some(g => g.toLowerCase() === name.toLowerCase() || getDataFilename(g) === newFilename)) {
        alert('A group with this name already exists');
        return;
    }

    groups.push(name);

    try {
        await saveGroupsToGitHub();
        renderGroups();
        renderGroupsList();
        input.value = '';

        // Ask if user wants to switch to new group
        if (confirm(`Group "${sanitizeForDisplay(name)}" created! Switch to it now?`)) {
            await selectGroup(name);
        }
    } catch (error) {
        alert('Failed to create group: ' + error.message);
        groups = groups.filter(g => g !== name);
    }
}

async function selectGroup(name) {
    if (name === currentGroup) {
        hideGroupModal();
        return;
    }

    const previousGroup = currentGroup;
    const previousSha = currentSha;

    currentGroup = name;
    localStorage.setItem('splitter_current_group', name);
    currentSha = null; // Reset SHA for new group

    try {
        await loadData();
        renderGroups();
        renderAll();
        hideGroupModal();
    } catch (error) {
        // Revert to previous group on failure to avoid inconsistent state
        currentGroup = previousGroup;
        currentSha = previousSha;
        localStorage.setItem('splitter_current_group', previousGroup);
        alert('Failed to switch group: ' + error.message);
    }
}

async function switchGroup() {
    const select = document.getElementById('groupSelect');
    await selectGroup(select.value);
}

async function deleteGroup(name) {
    if (name === 'default') {
        alert('Cannot delete the default group');
        return;
    }

    if (!confirm(`Delete group "${sanitizeForDisplay(name)}"? This will also delete all expenses in this group.`)) {
        return;
    }

    try {
        // Delete the group's data file from GitHub
        await deleteGroupDataFile(name);

        // Remove from groups list
        groups = groups.filter(g => g !== name);
        await saveGroupsToGitHub();

        // Clean up localStorage for deleted group
        const storageKey = `splitter_${name}`;
        localStorage.removeItem(`${storageKey}_members`);
        localStorage.removeItem(`${storageKey}_expenses`);

        // If current group was deleted, switch to default
        if (currentGroup === name) {
            await selectGroup('default');
        }

        renderGroups();
        renderGroupsList();
    } catch (error) {
        alert('Failed to delete group: ' + error.message);
    }
}

async function deleteGroupDataFile(groupName) {
    const { token, repo, branch } = githubConfig;

    if (!token || !repo) return;

    const filename = getDataFilename(groupName);

    // Get current SHA
    try {
        const response = await fetch(
            `https://api.github.com/repos/${repo}/contents/${filename}?ref=${branch}`,
            {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Accept': 'application/vnd.github.v3+json'
                }
            }
        );

        if (response.status === 404) return; // File doesn't exist

        const data = await response.json();

        // Delete the file
        await fetch(
            `https://api.github.com/repos/${repo}/contents/${filename}`,
            {
                method: 'DELETE',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Accept': 'application/vnd.github.v3+json',
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    message: `Delete group: ${groupName}`,
                    sha: data.sha,
                    branch
                })
            }
        );
    } catch (error) {
        console.error('Failed to delete group data file:', error);
    }
}

// Load data
async function loadData() {
    // First try GitHub if configured
    if (githubConfig.token && githubConfig.repo) {
        try {
            await loadFromGitHub();
            return;
        } catch (error) {
            console.error('GitHub load failed, using localStorage:', error);
        }
    }

    // Fallback to localStorage (group-specific)
    const storageKey = `splitter_${currentGroup}`;
    const savedMembers = localStorage.getItem(`${storageKey}_members`);
    const savedExpenses = localStorage.getItem(`${storageKey}_expenses`);
    if (savedMembers) members = JSON.parse(savedMembers);
    else members = [];
    if (savedExpenses) expenses = JSON.parse(savedExpenses);
    else expenses = [];
}

// GitHub API Functions
async function loadFromGitHub() {
    const { token, repo, branch } = githubConfig;
    const filename = getDataFilename(currentGroup);

    const response = await fetch(
        `https://api.github.com/repos/${repo}/contents/${filename}?ref=${branch}`,
        {
            headers: {
                'Authorization': `Bearer ${token}`,
                'Accept': 'application/vnd.github.v3+json'
            }
        }
    );

    if (response.status === 404) {
        // File doesn't exist, create it
        await commitToGitHub({ members: [], expenses: [] }, `Initialize ${filename}`);
        members = [];
        expenses = [];
        return;
    }

    if (!response.ok) {
        throw new Error('Failed to connect to GitHub');
    }

    const data = await response.json();
    currentSha = data.sha;

    const content = JSON.parse(atob(data.content));
    members = content.members || [];
    expenses = content.expenses || [];

    // Also save to localStorage as backup (group-specific)
    const storageKey = `splitter_${currentGroup}`;
    localStorage.setItem(`${storageKey}_members`, JSON.stringify(members));
    localStorage.setItem(`${storageKey}_expenses`, JSON.stringify(expenses));
}

async function commitToGitHub(data, message) {
    const { token, repo, branch } = githubConfig;
    const filename = getDataFilename(currentGroup);
    const storageKey = `splitter_${currentGroup}`;

    if (!token || !repo) {
        // Not configured, just use localStorage
        localStorage.setItem(`${storageKey}_members`, JSON.stringify(data.members));
        localStorage.setItem(`${storageKey}_expenses`, JSON.stringify(data.expenses));
        return;
    }

    const content = utf8ToBase64(JSON.stringify(data, null, 2));

    const body = {
        message,
        content,
        branch
    };

    if (currentSha) {
        body.sha = currentSha;
    }

    const response = await fetch(
        `https://api.github.com/repos/${repo}/contents/${filename}`,
        {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Accept': 'application/vnd.github.v3+json',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(body)
        }
    );

    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to save to GitHub');
    }

    const result = await response.json();
    currentSha = result.content.sha;

    // Also update localStorage
    localStorage.setItem(`${storageKey}_members`, JSON.stringify(data.members));
    localStorage.setItem(`${storageKey}_expenses`, JSON.stringify(data.expenses));
}

// Queue a sync operation (batches multiple rapid changes)
function queueSync(message) {
    syncQueue.push(message);

    // Update localStorage immediately (fast!) - group-specific
    const storageKey = `splitter_${currentGroup}`;
    localStorage.setItem(`${storageKey}_members`, JSON.stringify(members));
    localStorage.setItem(`${storageKey}_expenses`, JSON.stringify(expenses));

    // Show syncing indicator
    updateSyncStatus('pending');

    // Clear existing timeout
    if (syncTimeout) {
        clearTimeout(syncTimeout);
    }

    // Set new timeout - wait for more changes before committing
    syncTimeout = setTimeout(() => {
        performSync();
    }, SYNC_DELAY);
}

// Actually perform the sync to GitHub
async function performSync() {
    if (isSyncing || syncQueue.length === 0) return;

    const { token, repo } = githubConfig;
    if (!token || !repo) {
        syncQueue = [];
        updateSyncStatus('local');
        return;
    }

    isSyncing = true;
    updateSyncStatus('syncing');

    // Combine all messages
    const messages = syncQueue.slice();
    syncQueue = [];

    const commitMessage = messages.length === 1
        ? messages[0]
        : `Batch update (${messages.length} changes):\n- ${messages.join('\n- ')}`;

    try {
        await commitToGitHub({ members, expenses }, commitMessage);
        updateSyncStatus('synced');
    } catch (error) {
        console.error('Sync failed:', error);
        updateSyncStatus('error');
        // Re-queue failed items
        syncQueue = [...messages, ...syncQueue];
    }

    isSyncing = false;

    // If more items queued during sync, process them
    if (syncQueue.length > 0) {
        syncTimeout = setTimeout(performSync, SYNC_DELAY);
    }
}

// Update sync status indicator
function updateSyncStatus(status) {
    let indicator = document.getElementById('syncIndicator');

    if (!indicator) {
        indicator = document.createElement('div');
        indicator.id = 'syncIndicator';
        indicator.className = 'sync-indicator';
        document.body.appendChild(indicator);
    }

    const statuses = {
        'pending': { text: '⏳ Pending...', class: 'pending' },
        'syncing': { text: '🔄 Syncing...', class: 'syncing' },
        'synced': { text: '✅ Synced', class: 'synced' },
        'error': { text: '❌ Sync failed', class: 'error' },
        'local': { text: '💾 Local only', class: 'local' }
    };

    const s = statuses[status] || statuses['local'];
    indicator.textContent = s.text;
    indicator.className = `sync-indicator ${s.class}`;

    // Hide "synced" status after 2 seconds
    if (status === 'synced') {
        setTimeout(() => {
            if (indicator.textContent === '✅ Synced') {
                indicator.style.opacity = '0';
            }
        }, 2000);
    } else {
        indicator.style.opacity = '1';
    }
}

async function syncFromGitHub() {
    if (!githubConfig.token || !githubConfig.repo) {
        showSettings();
        return;
    }

    try {
        await loadFromGitHub();
        renderAll();
        alert('✅ Synced from GitHub!');
    } catch (error) {
        alert('❌ Sync failed: ' + error.message);
    }
}

// Tab switching
function showTab(tabName) {
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));

    document.querySelector(`[onclick="showTab('${tabName}')"]`).classList.add('active');
    document.getElementById(`${tabName}Tab`).classList.add('active');
}

// Add Member
async function addMember() {
    const input = document.getElementById('memberName');
    const name = input.value.trim();

    if (!name) {
        alert('Please enter a member name');
        return;
    }

    if (members.includes(name)) {
        alert('This member already exists');
        return;
    }

    // Optimistic update - instant UI
    members.push(name);
    input.value = '';
    renderAll();

    // Queue sync in background
    queueSync(`Add member: ${name}`);
}

// Remove Member
async function removeMember(name) {
    const hasExpenses = expenses.some(e => e.paidBy === name || e.splitBetween.includes(name));

    if (hasExpenses) {
        if (!confirm(`${name} has expenses. Removing them will also remove related expenses. Continue?`)) {
            return;
        }
        expenses = expenses.filter(e => e.paidBy !== name && !e.splitBetween.includes(name));
    }

    // Optimistic update - instant UI
    members = members.filter(m => m !== name);
    renderAll();

    // Queue sync in background
    queueSync(`Remove member: ${name}`);
}

// Toggle Custom Split Section
function toggleCustomSplit() {
    const splitType = document.getElementById('splitType').value;
    const customSection = document.getElementById('customSplitSection');
    const percentageSection = document.getElementById('percentageSplitSection');

    if (splitType === 'custom') {
        customSection.classList.remove('hidden');
        percentageSection.classList.add('hidden');
        updateCustomSplitInputs();
    } else if (splitType === 'percentage') {
        percentageSection.classList.remove('hidden');
        customSection.classList.add('hidden');
        updatePercentageSplitInputs();
    } else {
        customSection.classList.add('hidden');
        percentageSection.classList.add('hidden');
    }
}

// Update Custom Split Inputs
function updateCustomSplitInputs() {
    const container = document.getElementById('customSplitInputs');
    const checkboxes = document.querySelectorAll('#splitBetween input:checked');
    const selectedMembers = Array.from(checkboxes).map(cb => cb.value);

    container.innerHTML = selectedMembers.map(member => `
        <div class="custom-split-input">
            <label>${sanitizeForDisplay(member)}</label>
            <input type="number" id="custom_${escapeAttr(member)}" placeholder="0.00" step="0.01" min="0" />
        </div>
    `).join('');
}

// Update Percentage Split Inputs
function updatePercentageSplitInputs() {
    const container = document.getElementById('percentageSplitInputs');
    const checkboxes = document.querySelectorAll('#splitBetween input:checked');
    const selectedMembers = Array.from(checkboxes).map(cb => cb.value);

    container.innerHTML = selectedMembers.map(member => `
        <div class="custom-split-input">
            <label>${sanitizeForDisplay(member)}</label>
            <input type="number" id="percentage_${escapeAttr(member)}" placeholder="0" step="0.01" min="0" max="100" />
        </div>
    `).join('');
}

// Calculate splits from percentages
function calculatePercentageSplits(amount, splitBetween, getPercentageFn) {
    let totalPercentage = 0;
    const percentages = {};
    const splits = {};

    splitBetween.forEach(member => {
        const percentage = getPercentageFn(member);
        percentages[member] = percentage;
        totalPercentage += percentage;
    });

    if (Math.abs(totalPercentage - 100) > 0.01) {
        return { error: `Percentages must sum to 100% (currently ${totalPercentage.toFixed(2)}%)` };
    }

    splitBetween.forEach(member => {
        splits[member] = Math.round((amount * percentages[member] / 100) * 100) / 100;
    });

    // Handle rounding difference
    const totalSplit = Object.values(splits).reduce((a, b) => a + b, 0);
    const diff = Math.round((amount - totalSplit) * 100) / 100;
    if (diff !== 0) splits[splitBetween[0]] += diff;

    return { splits };
}

// Add Expense
async function addExpense() {
    const description = document.getElementById('expenseDescription').value.trim();
    const amount = parseFloat(document.getElementById('expenseAmount').value);
    const paidBy = document.getElementById('paidBy').value;
    const splitType = document.getElementById('splitType').value;

    const checkboxes = document.querySelectorAll('#splitBetween input:checked');
    const splitBetween = Array.from(checkboxes).map(cb => cb.value);

    if (!description) { alert('Please enter a description'); return; }
    if (!amount || amount <= 0) { alert('Please enter a valid amount'); return; }
    if (!paidBy) { alert('Please select who paid'); return; }
    if (splitBetween.length === 0) { alert('Please select at least one person to split with'); return; }

    let splits = {};

    if (splitType === 'equal') {
        const perPerson = amount / splitBetween.length;
        splitBetween.forEach(member => {
            splits[member] = Math.round(perPerson * 100) / 100;
        });

        const totalSplit = Object.values(splits).reduce((a, b) => a + b, 0);
        const diff = Math.round((amount - totalSplit) * 100) / 100;
        if (diff !== 0) splits[splitBetween[0]] += diff;
    } else if (splitType === 'percentage') {
        const result = calculatePercentageSplits(amount, splitBetween, (member) => {
            return parseFloat(document.getElementById(`percentage_${member}`).value) || 0;
        });

        if (result.error) {
            alert(result.error);
            return;
        }

        splits = result.splits;
    } else {
        let totalCustom = 0;
        splitBetween.forEach(member => {
            const customAmount = parseFloat(document.getElementById(`custom_${member}`).value) || 0;
            splits[member] = customAmount;
            totalCustom += customAmount;
        });

        if (Math.abs(totalCustom - amount) > 0.01) {
            alert(`Custom splits ($${totalCustom.toFixed(2)}) must equal the total ($${amount.toFixed(2)})`);
            return;
        }
    }

    const expense = {
        id: Date.now(),
        description,
        amount,
        paidBy,
        splitBetween,
        splits,
        date: new Date().toISOString()
    };

    // Optimistic update - instant UI
    expenses.unshift(expense);

    // Clear form immediately
    document.getElementById('expenseDescription').value = '';
    document.getElementById('expenseAmount').value = '';
    document.getElementById('splitType').value = 'equal';
    document.getElementById('customSplitSection').classList.add('hidden');
    document.getElementById('percentageSplitSection').classList.add('hidden');

    renderAll();

    // Queue sync in background
    queueSync(`Add expense: ${description} ($${amount.toFixed(2)}) paid by ${paidBy}`);
}

// Delete Expense
async function deleteExpense(id) {
    if (!confirm('Delete this expense?')) return;

    const expense = expenses.find(e => e.id === id);

    // Optimistic update - instant UI
    expenses = expenses.filter(e => e.id !== id);
    renderAll();

    // Queue sync in background
    queueSync(`Delete expense: ${expense?.description || 'Unknown'}`);
}

// Edit Expense Modal Functions
function showEditExpense(id) {
    const expense = expenses.find(e => e.id === id);
    if (!expense) return;

    document.getElementById('editExpenseModal').classList.remove('hidden');

    // Populate form fields
    document.getElementById('editExpenseId').value = expense.id;
    document.getElementById('editExpenseDescription').value = expense.description;
    document.getElementById('editExpenseAmount').value = expense.amount;

    // Populate paid by dropdown
    const paidBySelect = document.getElementById('editPaidBy');
    paidBySelect.innerHTML = '<option value="">Select...</option>' +
        members.map(member => `<option value="${escapeAttr(member)}" ${member === expense.paidBy ? 'selected' : ''}>${sanitizeForDisplay(member)}</option>`).join('');

    // Populate split between checkboxes
    const splitBetweenContainer = document.getElementById('editSplitBetween');
    splitBetweenContainer.innerHTML = members.map(member => `
        <div class="checkbox-item">
            <input type="checkbox" id="edit_split_${escapeAttr(member)}" value="${escapeAttr(member)}"
                ${expense.splitBetween.includes(member) ? 'checked' : ''}
                onchange="updateEditCustomSplitInputs(); updateEditPercentageSplitInputs();">
            <label for="edit_split_${escapeAttr(member)}">${sanitizeForDisplay(member)}</label>
        </div>
    `).join('');

    // Determine split type (equal vs percentage vs custom)
    const isEqualSplit = checkIfEqualSplit(expense);
    const isPercentageSplit = checkIfPercentageSplit(expense);

    let splitType = 'equal';
    if (isPercentageSplit) {
        splitType = 'percentage';
    } else if (!isEqualSplit) {
        splitType = 'custom';
    }

    document.getElementById('editSplitType').value = splitType;

    // Show/hide custom/percentage split section and populate values
    toggleEditCustomSplit();

    // Populate the values based on split type
    if (splitType === 'percentage') {
        setTimeout(() => {
            Object.entries(expense.splits).forEach(([member, amount]) => {
                const percentage = (amount / expense.amount) * 100;
                const input = document.getElementById(`edit_percentage_${member}`);
                if (input) input.value = percentage.toFixed(2);
            });
        }, 0);
    } else if (splitType === 'custom') {
        setTimeout(() => {
            Object.entries(expense.splits).forEach(([member, amount]) => {
                const input = document.getElementById(`edit_custom_${member}`);
                if (input) input.value = amount;
            });
        }, 0);
    }
}

function checkIfEqualSplit(expense) {
    const splitValues = Object.values(expense.splits);
    if (splitValues.length === 0) return true;

    const expectedPerPerson = expense.amount / splitValues.length;
    // Allow small tolerance for rounding
    return splitValues.every(val => Math.abs(val - expectedPerPerson) < 0.02);
}

function checkIfPercentageSplit(expense) {
    // Check if splits appear to be percentage-based by calculating the implied percentages
    if (!expense.splits || Object.keys(expense.splits).length === 0) return false;

    const members = Object.keys(expense.splits);
    let totalPercentage = 0;

    for (const member of members) {
        const splitAmount = expense.splits[member];
        const percentage = (splitAmount / expense.amount) * 100;
        totalPercentage += percentage;
    }

    // Check if total is approximately 100% and not equal split
    if (Math.abs(totalPercentage - 100) > 0.01) return false;
    if (checkIfEqualSplit(expense)) return false;

    return true;
}

function hideEditExpense() {
    document.getElementById('editExpenseModal').classList.add('hidden');
}

function toggleEditCustomSplit() {
    const splitType = document.getElementById('editSplitType').value;
    const customSection = document.getElementById('editCustomSplitSection');
    const percentageSection = document.getElementById('editPercentageSplitSection');

    if (splitType === 'custom') {
        customSection.classList.remove('hidden');
        percentageSection.classList.add('hidden');
        updateEditCustomSplitInputs();
    } else if (splitType === 'percentage') {
        percentageSection.classList.remove('hidden');
        customSection.classList.add('hidden');
        updateEditPercentageSplitInputs();
    } else {
        customSection.classList.add('hidden');
        percentageSection.classList.add('hidden');
    }
}

function updateEditCustomSplitInputs() {
    const container = document.getElementById('editCustomSplitInputs');
    const checkboxes = document.querySelectorAll('#editSplitBetween input:checked');
    const selectedMembers = Array.from(checkboxes).map(cb => cb.value);

    container.innerHTML = selectedMembers.map(member => `
        <div class="custom-split-input">
            <label>${sanitizeForDisplay(member)}</label>
            <input type="number" id="edit_custom_${escapeAttr(member)}" placeholder="0.00" step="0.01" min="0" />
        </div>
    `).join('');
}

function updateEditPercentageSplitInputs() {
    const container = document.getElementById('editPercentageSplitInputs');
    const checkboxes = document.querySelectorAll('#editSplitBetween input:checked');
    const selectedMembers = Array.from(checkboxes).map(cb => cb.value);

    container.innerHTML = selectedMembers.map(member => `
        <div class="custom-split-input">
            <label>${sanitizeForDisplay(member)}</label>
            <input type="number" id="edit_percentage_${escapeAttr(member)}" placeholder="0" step="0.01" min="0" max="100" />
        </div>
    `).join('');
}

async function saveEditExpense() {
    const id = parseInt(document.getElementById('editExpenseId').value);
    const description = document.getElementById('editExpenseDescription').value.trim();
    const amount = parseFloat(document.getElementById('editExpenseAmount').value);
    const paidBy = document.getElementById('editPaidBy').value;
    const splitType = document.getElementById('editSplitType').value;

    const checkboxes = document.querySelectorAll('#editSplitBetween input:checked');
    const splitBetween = Array.from(checkboxes).map(cb => cb.value);

    if (!description) { alert('Please enter a description'); return; }
    if (!amount || amount <= 0) { alert('Please enter a valid amount'); return; }
    if (!paidBy) { alert('Please select who paid'); return; }
    if (splitBetween.length === 0) { alert('Please select at least one person to split with'); return; }

    let splits = {};

    if (splitType === 'equal') {
        const perPerson = amount / splitBetween.length;
        splitBetween.forEach(member => {
            splits[member] = Math.round(perPerson * 100) / 100;
        });

        const totalSplit = Object.values(splits).reduce((a, b) => a + b, 0);
        const diff = Math.round((amount - totalSplit) * 100) / 100;
        if (diff !== 0) splits[splitBetween[0]] += diff;
    } else if (splitType === 'percentage') {
        const result = calculatePercentageSplits(amount, splitBetween, (member) => {
            return parseFloat(document.getElementById(`edit_percentage_${member}`).value) || 0;
        });

        if (result.error) {
            alert(result.error);
            return;
        }

        splits = result.splits;
    } else {
        let totalCustom = 0;
        splitBetween.forEach(member => {
            const customAmount = parseFloat(document.getElementById(`edit_custom_${member}`).value) || 0;
            splits[member] = customAmount;
            totalCustom += customAmount;
        });

        if (Math.abs(totalCustom - amount) > 0.01) {
            alert(`Custom splits ($${totalCustom.toFixed(2)}) must equal the total ($${amount.toFixed(2)})`);
            return;
        }
    }

    // Find and update the expense
    const expenseIndex = expenses.findIndex(e => e.id === id);
    if (expenseIndex === -1) {
        alert('Expense not found');
        return;
    }

    const oldDescription = expenses[expenseIndex].description;

    expenses[expenseIndex] = {
        ...expenses[expenseIndex],
        description,
        amount,
        paidBy,
        splitBetween,
        splits
    };

    hideEditExpense();
    renderAll();

    // Queue sync in background
    queueSync(`Edit expense: ${oldDescription} → ${description} ($${amount.toFixed(2)})`);
}

// Payment Functions
function showPaymentModal(fromMember = '', toMember = '', amount = '') {
    document.getElementById('paymentModal').classList.remove('hidden');

    // Populate dropdowns
    const fromSelect = document.getElementById('paymentFrom');
    const toSelect = document.getElementById('paymentTo');

    const options = '<option value="">Select...</option>' +
        members.map(member => `<option value="${escapeAttr(member)}">${sanitizeForDisplay(member)}</option>`).join('');

    fromSelect.innerHTML = options;
    toSelect.innerHTML = options;

    if (fromMember) fromSelect.value = fromMember;
    if (toMember) toSelect.value = toMember;
    if (amount) document.getElementById('paymentAmount').value = amount;
    else document.getElementById('paymentAmount').value = '';
}

function hidePaymentModal() {
    document.getElementById('paymentModal').classList.add('hidden');
}

async function recordPayment() {
    const from = document.getElementById('paymentFrom').value;
    const to = document.getElementById('paymentTo').value;
    const amount = parseFloat(document.getElementById('paymentAmount').value);

    if (!from || !to) { alert('Please select both payer and payee'); return; }
    if (from === to) { alert('Payer and payee cannot be the same person'); return; }
    if (!amount || amount <= 0) { alert('Please enter a valid amount'); return; }

    // Create payment expense
    const expense = {
        id: Date.now(),
        description: 'Payment',
        amount: amount,
        paidBy: from,
        splitBetween: [to],
        splits: { [to]: amount },
        date: new Date().toISOString(),
        type: 'payment'
    };

    // Optimistic update
    expenses.unshift(expense);
    hidePaymentModal();
    renderAll();

    // Queue sync
    queueSync(`Payment: ${from} paid ${to} $${amount.toFixed(2)}`);
}

async function settleUp(from, to, amount) {
    showPaymentModal(from, to, amount);
}

// Calculate Balances
function calculateBalances() {
    const balances = {};
    members.forEach(member => { balances[member] = 0; });

    expenses.forEach(expense => {
        balances[expense.paidBy] += expense.amount;
        Object.entries(expense.splits).forEach(([member, splitAmount]) => {
            balances[member] -= splitAmount;
        });
    });

    return balances;
}

// Calculate Settlements
function calculateSettlements() {
    const balances = calculateBalances();
    const settlements = [];

    const debtors = [];
    const creditors = [];

    Object.entries(balances).forEach(([member, balance]) => {
        if (balance < -0.01) debtors.push({ name: member, amount: -balance });
        else if (balance > 0.01) creditors.push({ name: member, amount: balance });
    });

    debtors.sort((a, b) => b.amount - a.amount);
    creditors.sort((a, b) => b.amount - a.amount);

    let i = 0, j = 0;
    while (i < debtors.length && j < creditors.length) {
        const debtor = debtors[i];
        const creditor = creditors[j];
        const settleAmount = Math.min(debtor.amount, creditor.amount);

        if (settleAmount > 0.01) {
            settlements.push({
                from: debtor.name,
                to: creditor.name,
                amount: Math.round(settleAmount * 100) / 100
            });
        }

        debtor.amount -= settleAmount;
        creditor.amount -= settleAmount;

        if (debtor.amount < 0.01) i++;
        if (creditor.amount < 0.01) j++;
    }

    return settlements;
}

// Render Functions
function renderMembers() {
    const container = document.getElementById('membersList');
    const paidBySelect = document.getElementById('paidBy');
    const splitBetweenContainer = document.getElementById('splitBetween');

    if (members.length === 0) {
        container.innerHTML = '<p class="empty-state">No members yet.</p>';
    } else {
        container.innerHTML = members.map(member => `
            <span class="member-tag">
                ${sanitizeForDisplay(member)}
                <button class="remove-btn" onclick="removeMember('${escapeJsArg(member)}')">&times;</button>
            </span>
        `).join('');
    }

    paidBySelect.innerHTML = '<option value="">Select...</option>' +
        members.map(member => `<option value="${escapeAttr(member)}">${sanitizeForDisplay(member)}</option>`).join('');

    splitBetweenContainer.innerHTML = members.map(member => `
        <div class="checkbox-item">
            <input type="checkbox" id="split_${escapeAttr(member)}" value="${escapeAttr(member)}" checked onchange="updateCustomSplitInputs(); updatePercentageSplitInputs();">
            <label for="split_${escapeAttr(member)}">${sanitizeForDisplay(member)}</label>
        </div>
    `).join('');
}

function renderExpenses() {
    const container = document.getElementById('expensesList');
    const totalBadge = document.getElementById('totalBadge');

    if (expenses.length === 0) {
        container.innerHTML = '<p class="empty-state">No expenses yet.</p>';
        totalBadge.innerHTML = '';
        return;
    }

    container.innerHTML = expenses.map(expense => {
        const date = new Date(expense.date).toLocaleDateString();
        const isPayment = expense.type === 'payment';

        let infoHtml = '';
        if (isPayment) {
            infoHtml = `
                <div class="expense-info">
                    <h4>💸 Payment</h4>
                    <p>${expense.paidBy} paid ${expense.splitBetween[0]} • ${date}</p>
                </div>
            `;
        } else {
            infoHtml = `
                <div class="expense-info">
                    <h4>${expense.description}</h4>
                    <p>${expense.paidBy} paid • ${date}</p>
                </div>
            `;
        }

        return `
            <div class="expense-item ${isPayment ? 'payment-item' : ''}">
                ${infoHtml}
                <div class="expense-right">
                    <div class="expense-amount">$${expense.amount.toFixed(2)}</div>
                    <div class="expense-actions">
                        ${!isPayment ? `<button class="edit-btn" onclick="showEditExpense(${expense.id})">✎</button>` : ''}
                        <button onclick="deleteExpense(${expense.id})">✕</button>
                    </div>
                </div>
            </div>
        `;
    }).join('');

    const total = expenses.reduce((sum, e) => sum + e.amount, 0);
    totalBadge.innerHTML = `$${total.toFixed(2)}`;
}

function renderBalances() {
    const container = document.getElementById('balancesSummary');
    const balances = calculateBalances();

    if (members.length === 0 || expenses.length === 0) {
        container.innerHTML = '<p class="empty-state">Add members and expenses to see balances.</p>';
        return;
    }

    container.innerHTML = Object.entries(balances).map(([member, balance]) => {
        const isPositive = balance >= 0;
        const className = isPositive ? 'positive' : 'negative';
        const prefix = isPositive ? '+' : '';

        return `
            <div class="balance-item">
                <span class="name">${member}</span>
                <span class="amount ${className}">${prefix}$${balance.toFixed(2)}</span>
            </div>
        `;
    }).join('');
}

function renderSettlements() {
    const container = document.getElementById('settlements');
    const settlements = calculateSettlements();

    if (settlements.length === 0) {
        container.innerHTML = '<p class="empty-state">Everyone is settled up! 🎉</p>';
        return;
    }

    container.innerHTML = settlements.map(s => `
        <div class="settlement-item">
            <div class="settlement-info">
                <strong>${sanitizeForDisplay(s.from)}</strong>
                <span class="arrow">→</span>
                <strong>${sanitizeForDisplay(s.to)}</strong>
                <span class="settlement-amount">$${s.amount.toFixed(2)}</span>
            </div>
            <button onclick="settleUp('${escapeJsArg(s.from)}', '${escapeJsArg(s.to)}', ${s.amount})" class="btn btn-small btn-success">Mark Paid</button>
        </div>
    `).join('');
}

function renderAll() {
    renderMembers();
    renderExpenses();
    renderBalances();
    renderSettlements();
}

// Export to Excel
function exportToExcel() {
    if (expenses.length === 0) { alert('No expenses to export'); return; }

    const workbook = XLSX.utils.book_new();

    const expensesData = expenses.map(e => ({
        'Date': new Date(e.date).toLocaleDateString(),
        'Description': e.description,
        'Amount': e.amount,
        'Paid By': e.paidBy,
        'Split Between': e.splitBetween.join(', '),
        'Split Details': Object.entries(e.splits).map(([k, v]) => `${k}: $${v.toFixed(2)}`).join('; ')
    }));

    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(expensesData), 'Expenses');

    const balances = calculateBalances();
    const balancesData = Object.entries(balances).map(([member, balance]) => ({
        'Member': member,
        'Balance': balance,
        'Status': balance >= 0 ? 'Owed' : 'Owes'
    }));
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(balancesData), 'Balances');

    const settlements = calculateSettlements();
    if (settlements.length > 0) {
        const settlementsData = settlements.map(s => ({ 'From': s.from, 'To': s.to, 'Amount': s.amount }));
        XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(settlementsData), 'Settlements');
    }

    const total = expenses.reduce((sum, e) => sum + e.amount, 0);
    const summaryData = [
        { 'Metric': 'Total Expenses', 'Value': `$${total.toFixed(2)}` },
        { 'Metric': 'Number of Expenses', 'Value': expenses.length },
        { 'Metric': 'Number of Members', 'Value': members.length },
        { 'Metric': 'Export Date', 'Value': new Date().toLocaleString() }
    ];
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(summaryData), 'Summary');

    XLSX.writeFile(workbook, `splitter_export_${new Date().toISOString().split('T')[0]}.xlsx`);
}

// Clear All Data
async function clearAllData() {
    const displayName = currentGroup === 'default' ? DEFAULT_GROUP_DISPLAY_NAME : sanitizeForDisplay(currentGroup);
    if (!confirm(`Clear all data for "${displayName}"? This cannot be undone.`)) return;

    // Optimistic update - instant UI
    members = [];
    expenses = [];
    const storageKey = `splitter_${currentGroup}`;
    localStorage.removeItem(`${storageKey}_members`);
    localStorage.removeItem(`${storageKey}_expenses`);
    renderAll();

    // Queue sync in background
    queueSync('Clear all data');
}

// Enter key handler
document.getElementById('memberName').addEventListener('keypress', function (e) {
    if (e.key === 'Enter') addMember();
});

document.getElementById('newGroupName').addEventListener('keypress', function (e) {
    if (e.key === 'Enter') createGroup();
});

// Close modal on outside click
document.getElementById('settingsModal').addEventListener('click', function (e) {
    if (e.target === this) hideSettings();
});

document.getElementById('groupModal').addEventListener('click', function (e) {
    if (e.target === this) hideGroupModal();
});

document.getElementById('editExpenseModal').addEventListener('click', function (e) {
    if (e.target === this) hideEditExpense();
});

document.getElementById('paymentModal').addEventListener('click', function (e) {
    if (e.target === this) hidePaymentModal();
});

// Initialize
init();
