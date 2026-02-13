import { calculateSettlements } from '../utils/calculations';

function SettlementsTab({ members, expenses, onSettleUp }) {
  const settlements = calculateSettlements(members, expenses);

  if (settlements.length === 0) {
    return <p className="empty-state">Everyone is settled up! 🎉</p>;
  }

  return (
    <div className="settlements-list">
      {settlements.map((s, index) => (
        <div key={index} className="settlement-item">
          <div className="settlement-info">
            <strong>{s.from}</strong>
            <span className="arrow">→</span>
            <strong>{s.to}</strong>
            <span className="settlement-amount">${s.amount.toFixed(2)}</span>
          </div>
          <button
            onClick={() => onSettleUp(s.from, s.to, s.amount)}
            className="btn btn-small btn-success"
          >
            Mark Paid
          </button>
        </div>
      ))}
    </div>
  );
}

export default SettlementsTab;
