import { useState } from 'react';
import { useGitHubSync } from './hooks/useGitHubSync';
import { useAppState } from './hooks/useAppState';
import Header from './components/Header';
import SettingsModal from './components/SettingsModal';
import GroupModal from './components/GroupModal';
import PaymentModal from './components/PaymentModal';
import EditExpenseModal from './components/EditExpenseModal';
import MembersList from './components/MembersList';
import ExpenseForm from './components/ExpenseForm';
import ExpensesList from './components/ExpensesList';
import BalancesTab from './components/BalancesTab';
import SettlementsTab from './components/SettlementsTab';
import SyncIndicator from './components/SyncIndicator';
import * as XLSX from 'xlsx';
import { calculateBalances, calculateSettlements } from './utils/calculations';
import { DEFAULT_GROUP_DISPLAY_NAME, sanitizeForDisplay } from './utils/helpers';

function App() {
  const [currentGroup, setCurrentGroup] = useState(
    () => localStorage.getItem('splitter_current_group') || 'default'
  );

  const githubSync = useGitHubSync(currentGroup);
  const appState = useAppState(currentGroup, githubSync);

  const [showSettings, setShowSettings] = useState(false);
  const [showGroupModal, setShowGroupModal] = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [paymentModalData, setPaymentModalData] = useState({ from: '', to: '', amount: '' });
  const [showEditExpense, setShowEditExpense] = useState(false);
  const [editingExpense, setEditingExpense] = useState(null);
  const [activeTab, setActiveTab] = useState('balances');

  // Switch group
  const switchGroup = async (groupName) => {
    if (groupName === currentGroup) return;

    const previousGroup = currentGroup;
    const previousSha = githubSync.currentSha;

    setCurrentGroup(groupName);
    localStorage.setItem('splitter_current_group', groupName);
    githubSync.setCurrentSha(null);

    try {
      await appState.loadData();
    } catch (error) {
      setCurrentGroup(previousGroup);
      githubSync.setCurrentSha(previousSha);
      localStorage.setItem('splitter_current_group', previousGroup);
      alert('Failed to switch group: ' + error.message);
    }
  };

  // Export to Excel
  const exportToExcel = () => {
    if (appState.expenses.length === 0) {
      alert('No expenses to export');
      return;
    }

    const workbook = XLSX.utils.book_new();

    const expensesData = appState.expenses.map(e => ({
      'Date': new Date(e.date).toLocaleDateString(),
      'Description': e.description,
      'Amount': e.amount,
      'Paid By': e.paidBy,
      'Split Between': e.splitBetween.join(', '),
      'Split Details': Object.entries(e.splits).map(([k, v]) => `${k}: $${v.toFixed(2)}`).join('; ')
    }));

    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(expensesData), 'Expenses');

    const balances = calculateBalances(appState.members, appState.expenses);
    const balancesData = Object.entries(balances).map(([member, balance]) => ({
      'Member': member,
      'Balance': balance,
      'Status': balance >= 0 ? 'Owed' : 'Owes'
    }));
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(balancesData), 'Balances');

    const settlements = calculateSettlements(appState.members, appState.expenses);
    if (settlements.length > 0) {
      const settlementsData = settlements.map(s => ({ 'From': s.from, 'To': s.to, 'Amount': s.amount }));
      XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(settlementsData), 'Settlements');
    }

    const total = appState.expenses.reduce((sum, e) => sum + e.amount, 0);
    const summaryData = [
      { 'Metric': 'Total Expenses', 'Value': `$${total.toFixed(2)}` },
      { 'Metric': 'Number of Expenses', 'Value': appState.expenses.length },
      { 'Metric': 'Number of Members', 'Value': appState.members.length },
      { 'Metric': 'Export Date', 'Value': new Date().toLocaleString() }
    ];
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(summaryData), 'Summary');

    XLSX.writeFile(workbook, `splitter_export_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  // Sync from GitHub
  const syncFromGitHub = async () => {
    if (!githubSync.githubConfig.token || !githubSync.githubConfig.repo) {
      setShowSettings(true);
      return;
    }

    try {
      await appState.loadData();
      alert('✅ Synced from GitHub!');
    } catch (error) {
      alert('❌ Sync failed: ' + error.message);
    }
  };

  // Handle clear all data
  const handleClearAllData = () => {
    const displayName = currentGroup === 'default'
      ? DEFAULT_GROUP_DISPLAY_NAME
      : sanitizeForDisplay(currentGroup);

    if (!confirm(`Clear all data for "${displayName}"? This cannot be undone.`)) return;

    appState.clearAllData();
  };

  // Open payment modal
  const openPaymentModal = (from = '', to = '', amount = '') => {
    setPaymentModalData({ from, to, amount });
    setShowPaymentModal(true);
  };

  // Open edit expense modal
  const openEditExpense = (expenseId) => {
    const expense = appState.expenses.find(e => e.id === expenseId);
    if (expense) {
      setEditingExpense(expense);
      setShowEditExpense(true);
    }
  };

  return (
    <div className="container">
      <Header
        groups={githubSync.groups}
        currentGroup={currentGroup}
        onGroupChange={switchGroup}
        onShowGroupModal={() => setShowGroupModal(true)}
        onShowPaymentModal={() => openPaymentModal()}
        onShowSettings={() => setShowSettings(true)}
      />

      {showSettings && (
        <SettingsModal
          githubConfig={githubSync.githubConfig}
          onSave={githubSync.saveGitHubConfig}
          onClose={() => setShowSettings(false)}
          onLoadData={appState.loadData}
          loadGroups={githubSync.loadGroups}
        />
      )}

      {showGroupModal && (
        <GroupModal
          groups={githubSync.groups}
          currentGroup={currentGroup}
          onClose={() => setShowGroupModal(false)}
          onGroupsChange={(newGroups) => githubSync.setGroups(newGroups)}
          saveGroupsToGitHub={githubSync.saveGroupsToGitHub}
          switchGroup={switchGroup}
          deleteGroupDataFile={githubSync.deleteGroupDataFile}
        />
      )}

      {showPaymentModal && (
        <PaymentModal
          members={appState.members}
          paymentData={paymentModalData}
          onClose={() => setShowPaymentModal(false)}
          onRecordPayment={(expense) => {
            appState.setExpenses([expense, ...appState.expenses]);
            githubSync.queueSync(
              appState.members,
              [expense, ...appState.expenses],
              `Payment: ${expense.paidBy} paid ${expense.splitBetween[0]} $${expense.amount.toFixed(2)}`
            );
          }}
        />
      )}

      {showEditExpense && editingExpense && (
        <EditExpenseModal
          expense={editingExpense}
          members={appState.members}
          onClose={() => {
            setShowEditExpense(false);
            setEditingExpense(null);
          }}
          onSave={(updatedExpense) => {
            const newExpenses = appState.expenses.map(e =>
              e.id === updatedExpense.id ? updatedExpense : e
            );
            appState.setExpenses(newExpenses);
            githubSync.queueSync(
              appState.members,
              newExpenses,
              `Edit expense: ${editingExpense.description} → ${updatedExpense.description} ($${updatedExpense.amount.toFixed(2)})`
            );
          }}
        />
      )}

      <div className="main-grid">
        <div className="left-column">
          <MembersList
            members={appState.members}
            onAddMember={(name) => {
              const newMembers = [...appState.members, name];
              appState.setMembers(newMembers);
              githubSync.queueSync(newMembers, appState.expenses, `Add member: ${name}`);
            }}
            onRemoveMember={(name) => {
              const hasExpenses = appState.expenses.some(
                e => e.paidBy === name || e.splitBetween.includes(name)
              );

              if (hasExpenses) {
                if (!confirm(`${name} has expenses. Removing them will also remove related expenses. Continue?`)) {
                  return;
                }
                const newExpenses = appState.expenses.filter(
                  e => e.paidBy !== name && !e.splitBetween.includes(name)
                );
                appState.setExpenses(newExpenses);
              }

              const newMembers = appState.members.filter(m => m !== name);
              appState.setMembers(newMembers);
              githubSync.queueSync(newMembers, appState.expenses, `Remove member: ${name}`);
            }}
          />

          <ExpenseForm
            members={appState.members}
            onAddExpense={(expense) => {
              const newExpenses = [expense, ...appState.expenses];
              appState.setExpenses(newExpenses);
              githubSync.queueSync(
                appState.members,
                newExpenses,
                `Add expense: ${expense.description} ($${expense.amount.toFixed(2)}) paid by ${expense.paidBy}`
              );
            }}
          />

          <section className="card card-compact">
            <div className="export-buttons">
              <button onClick={exportToExcel} className="btn btn-success btn-small">
                📊 Export Excel
              </button>
              <button onClick={syncFromGitHub} className="btn btn-primary btn-small">
                🔄 Sync
              </button>
              <button onClick={handleClearAllData} className="btn btn-danger btn-small">
                🗑️ Clear
              </button>
            </div>
          </section>
        </div>

        <div className="right-column">
          <section className="card">
            <div className="summary-tabs">
              <button
                className={`tab-btn ${activeTab === 'balances' ? 'active' : ''}`}
                onClick={() => setActiveTab('balances')}
              >
                ⚖️ Balances
              </button>
              <button
                className={`tab-btn ${activeTab === 'settlements' ? 'active' : ''}`}
                onClick={() => setActiveTab('settlements')}
              >
                💸 Settle Up
              </button>
            </div>

            {activeTab === 'balances' ? (
              <BalancesTab members={appState.members} expenses={appState.expenses} />
            ) : (
              <SettlementsTab
                members={appState.members}
                expenses={appState.expenses}
                onSettleUp={openPaymentModal}
              />
            )}
          </section>

          <ExpensesList
            expenses={appState.expenses}
            onDeleteExpense={(id) => {
              if (!confirm('Delete this expense?')) return;

              const expense = appState.expenses.find(e => e.id === id);
              const newExpenses = appState.expenses.filter(e => e.id !== id);
              appState.setExpenses(newExpenses);
              githubSync.queueSync(
                appState.members,
                newExpenses,
                `Delete expense: ${expense?.description || 'Unknown'}`
              );
            }}
            onEditExpense={openEditExpense}
          />
        </div>
      </div>

      <SyncIndicator status={githubSync.syncStatus} />
    </div>
  );
}

export default App;
