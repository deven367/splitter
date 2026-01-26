import { calculateBalances } from '../utils/calculations';

function BalancesTab({ members, expenses }) {
  if (members.length === 0 || expenses.length === 0) {
    return <p className="empty-state">Add members and expenses to see balances.</p>;
  }

  const balances = calculateBalances(members, expenses);

  return (
    <div className="balances-list">
      {Object.entries(balances).map(([member, balance]) => {
        const isPositive = balance >= 0;
        const className = isPositive ? 'positive' : 'negative';
        const prefix = isPositive ? '+' : '';

        return (
          <div key={member} className="balance-item">
            <span className="name">{member}</span>
            <span className={`amount ${className}`}>{prefix}${balance.toFixed(2)}</span>
          </div>
        );
      })}
    </div>
  );
}

export default BalancesTab;
