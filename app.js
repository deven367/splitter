// GitHub Configuration
let githubConfig = {
    token: localStorage.getItem('github_token') || '',
    repo: localStorage.getItem('github_repo') || '',
    branch: localStorage.getItem('github_branch') || 'main'
};

// Data Store
let members = [];
let expenses = [];
let currentSha = null; // SHA of current data.json for updates

// Initialize
async function init() {
    await loadData();
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
        
        await loadFromGitHub();
        
        status.className = 'connection-status success';
        status.innerHTML = '✅ Connected! Data loaded from GitHub.';
        
        renderAll();
        
        setTimeout(() => hideSettings(), 1500);
    } catch (error) {
        status.className = 'connection-status error';
        status.innerHTML = `❌ ${error.message}`;
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
    
    // Fallback to localStorage
    const savedMembers = localStorage.getItem('splitter_members');
    const savedExpenses = localStorage.getItem('splitter_expenses');
    if (savedMembers) members = JSON.parse(savedMembers);
    if (savedExpenses) expenses = JSON.parse(savedExpenses);
}

// GitHub API Functions
async function loadFromGitHub() {
    const { token, repo, branch } = githubConfig;
    
    const response = await fetch(
        `https://api.github.com/repos/${repo}/contents/data.json?ref=${branch}`,
        {
            headers: {
                'Authorization': `Bearer ${token}`,
                'Accept': 'application/vnd.github.v3+json'
            }
        }
    );
    
    if (response.status === 404) {
        // File doesn't exist, create it
        await commitToGitHub({ members: [], expenses: [] }, 'Initialize data.json');
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
    
    // Also save to localStorage as backup
    localStorage.setItem('splitter_members', JSON.stringify(members));
    localStorage.setItem('splitter_expenses', JSON.stringify(expenses));
}

async function commitToGitHub(data, message) {
    const { token, repo, branch } = githubConfig;
    
    if (!token || !repo) {
        // Not configured, just use localStorage
        localStorage.setItem('splitter_members', JSON.stringify(data.members));
        localStorage.setItem('splitter_expenses', JSON.stringify(data.expenses));
        return;
    }
    
    const content = btoa(unescape(encodeURIComponent(JSON.stringify(data, null, 2))));
    
    const body = {
        message,
        content,
        branch
    };
    
    if (currentSha) {
        body.sha = currentSha;
    }
    
    const response = await fetch(
        `https://api.github.com/repos/${repo}/contents/data.json`,
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
    localStorage.setItem('splitter_members', JSON.stringify(data.members));
    localStorage.setItem('splitter_expenses', JSON.stringify(data.expenses));
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
    
    members.push(name);
    input.value = '';
    
    try {
        await commitToGitHub(
            { members, expenses },
            `Add member: ${name}`
        );
    } catch (error) {
        console.error('GitHub commit failed:', error);
    }
    
    renderAll();
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
    
    members = members.filter(m => m !== name);
    
    try {
        await commitToGitHub(
            { members, expenses },
            `Remove member: ${name}`
        );
    } catch (error) {
        console.error('GitHub commit failed:', error);
    }
    
    renderAll();
}

// Toggle Custom Split Section
function toggleCustomSplit() {
    const splitType = document.getElementById('splitType').value;
    const customSection = document.getElementById('customSplitSection');
    
    if (splitType === 'custom') {
        customSection.classList.remove('hidden');
        updateCustomSplitInputs();
    } else {
        customSection.classList.add('hidden');
    }
}

// Update Custom Split Inputs
function updateCustomSplitInputs() {
    const container = document.getElementById('customSplitInputs');
    const checkboxes = document.querySelectorAll('#splitBetween input:checked');
    const selectedMembers = Array.from(checkboxes).map(cb => cb.value);
    
    container.innerHTML = selectedMembers.map(member => `
        <div class="custom-split-input">
            <label>${member}</label>
            <input type="number" id="custom_${member}" placeholder="0.00" step="0.01" min="0" />
        </div>
    `).join('');
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
    
    expenses.unshift(expense);
    
    try {
        await commitToGitHub(
            { members, expenses },
            `Add expense: ${description} ($${amount.toFixed(2)}) paid by ${paidBy}`
        );
    } catch (error) {
        console.error('GitHub commit failed:', error);
    }
    
    // Clear form
    document.getElementById('expenseDescription').value = '';
    document.getElementById('expenseAmount').value = '';
    document.getElementById('splitType').value = 'equal';
    document.getElementById('customSplitSection').classList.add('hidden');
    
    renderAll();
}

// Delete Expense
async function deleteExpense(id) {
    if (!confirm('Delete this expense?')) return;
    
    const expense = expenses.find(e => e.id === id);
    expenses = expenses.filter(e => e.id !== id);
    
    try {
        await commitToGitHub(
            { members, expenses },
            `Delete expense: ${expense?.description || 'Unknown'}`
        );
    } catch (error) {
        console.error('GitHub commit failed:', error);
    }
    
    renderAll();
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
                ${member}
                <button class="remove-btn" onclick="removeMember('${member}')">&times;</button>
            </span>
        `).join('');
    }
    
    paidBySelect.innerHTML = '<option value="">Select...</option>' +
        members.map(member => `<option value="${member}">${member}</option>`).join('');
    
    splitBetweenContainer.innerHTML = members.map(member => `
        <div class="checkbox-item">
            <input type="checkbox" id="split_${member}" value="${member}" checked onchange="updateCustomSplitInputs()">
            <label for="split_${member}">${member}</label>
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
        return `
            <div class="expense-item">
                <div class="expense-info">
                    <h4>${expense.description}</h4>
                    <p>${expense.paidBy} paid • ${date}</p>
                </div>
                <div class="expense-right">
                    <div class="expense-amount">$${expense.amount.toFixed(2)}</div>
                    <div class="expense-actions">
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
            <strong>${s.from}</strong>
            <span class="arrow">→</span>
            <strong>${s.to}</strong>
            <span class="settlement-amount">$${s.amount.toFixed(2)}</span>
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
    if (!confirm('Clear all data? This cannot be undone.')) return;
    
    members = [];
    expenses = [];
    
    try {
        await commitToGitHub(
            { members, expenses },
            'Clear all data'
        );
    } catch (error) {
        console.error('GitHub commit failed:', error);
    }
    
    localStorage.removeItem('splitter_members');
    localStorage.removeItem('splitter_expenses');
    
    renderAll();
}

// Enter key handler
document.getElementById('memberName').addEventListener('keypress', function(e) {
    if (e.key === 'Enter') addMember();
});

// Close modal on outside click
document.getElementById('settingsModal').addEventListener('click', function(e) {
    if (e.target === this) hideSettings();
});

// Initialize
init();
