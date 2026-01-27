import { DEFAULT_GROUP_DISPLAY_NAME } from '../utils/helpers';

function Header({ groups, currentGroup, onGroupChange, onShowGroupModal, onShowPaymentModal, onShowSettings }) {
  return (
    <header>
      <h1>💰 Splitter</h1>
      <div className="header-controls">
        <div className="group-selector">
          <select
            id="groupSelect"
            aria-label="Select group"
            value={currentGroup}
            onChange={(e) => onGroupChange(e.target.value)}
          >
            {groups.map(g => (
              <option key={g} value={g}>
                {g === 'default' ? DEFAULT_GROUP_DISPLAY_NAME : g}
              </option>
            ))}
          </select>
          <button onClick={onShowGroupModal} className="btn btn-small btn-secondary" title="Manage Groups">
            + Group
          </button>
        </div>
        <button onClick={onShowPaymentModal} className="btn btn-small btn-success" title="Record Payment">
          💸 Pay
        </button>
        <button onClick={onShowSettings} className="settings-btn">⚙️</button>
      </div>
    </header>
  );
}

export default Header;
