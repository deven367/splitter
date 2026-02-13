import { useState } from 'react';
import { DEFAULT_GROUP_DISPLAY_NAME, INVALID_GROUP_NAME_CHARS, INVALID_GROUP_NAME_CHARS_LIST, sanitizeForDisplay, getDataFilename } from '../utils/helpers';

function GroupModal({ groups, currentGroup, onClose, onGroupsChange, saveGroupsToGitHub, switchGroup, deleteGroupDataFile }) {
  const [newGroupName, setNewGroupName] = useState('');

  const handleCreateGroup = async () => {
    const name = newGroupName.trim();

    if (!name) {
      alert('Please enter a group name');
      return;
    }

    if (INVALID_GROUP_NAME_CHARS.test(name)) {
      alert(`Group name cannot contain ${INVALID_GROUP_NAME_CHARS_LIST} characters`);
      return;
    }

    const newFilename = getDataFilename(name);
    if (groups.some(g => g.toLowerCase() === name.toLowerCase() || getDataFilename(g) === newFilename)) {
      alert('A group with this name already exists');
      return;
    }

    const updatedGroups = [...groups, name];

    try {
      await saveGroupsToGitHub(updatedGroups);
      onGroupsChange(updatedGroups);
      setNewGroupName('');

      if (confirm(`Group "${sanitizeForDisplay(name)}" created! Switch to it now?`)) {
        await switchGroup(name);
        onClose();
      }
    } catch (error) {
      alert('Failed to create group: ' + error.message);
    }
  };

  const handleSelectGroup = async (name) => {
    await switchGroup(name);
    onClose();
  };

  const handleDeleteGroup = async (name) => {
    if (name === 'default') {
      alert('Cannot delete the default group');
      return;
    }

    if (!confirm(`Delete group "${sanitizeForDisplay(name)}"? This will also delete all expenses in this group.`)) {
      return;
    }

    try {
      await deleteGroupDataFile(name);

      const updatedGroups = groups.filter(g => g !== name);
      await saveGroupsToGitHub(updatedGroups);
      onGroupsChange(updatedGroups);

      const storageKey = `splitter_${name}`;
      localStorage.removeItem(`${storageKey}_members`);
      localStorage.removeItem(`${storageKey}_expenses`);

      if (currentGroup === name) {
        await switchGroup('default');
      }
    } catch (error) {
      alert('Failed to delete group: ' + error.message);
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter') handleCreateGroup();
  };

  const handleModalClick = (e) => {
    if (e.target.classList.contains('modal')) {
      onClose();
    }
  };

  return (
    <div className="modal" onClick={handleModalClick}>
      <div className="modal-content">
        <h2>📁 Manage Groups</h2>
        <p className="modal-info">Create expense groups for different trips, events, or roommates.</p>
        <div className="form-row">
          <label htmlFor="newGroupName">New Group Name</label>
          <div className="input-group">
            <input
              type="text"
              id="newGroupName"
              value={newGroupName}
              onChange={(e) => setNewGroupName(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder="e.g., Trip to Paris"
            />
            <button onClick={handleCreateGroup} className="btn btn-primary btn-small">Create</button>
          </div>
        </div>
        <div className="form-row">
          <label>Existing Groups</label>
          <div className="groups-list">
            {groups.length === 0 ? (
              <p className="groups-empty">No groups yet.</p>
            ) : (
              groups.map(g => (
                <div key={g} className="group-item">
                  <span className="group-name">
                    {g === 'default' ? DEFAULT_GROUP_DISPLAY_NAME : g}
                  </span>
                  <div className="group-actions">
                    <button className="select-btn" onClick={() => handleSelectGroup(g)}>
                      Select
                    </button>
                    {g !== 'default' && (
                      <button className="delete-btn" onClick={() => handleDeleteGroup(g)}>
                        Delete
                      </button>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
        <div className="modal-buttons">
          <button onClick={onClose} className="btn btn-secondary">Close</button>
        </div>
      </div>
    </div>
  );
}

export default GroupModal;
