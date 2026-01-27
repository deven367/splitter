import { useState } from 'react';

function SettingsModal({ githubConfig, onSave, onClose, onLoadData, loadGroups }) {
  const [token, setToken] = useState(githubConfig.token);
  const [repo, setRepo] = useState(githubConfig.repo);
  const [branch, setBranch] = useState(githubConfig.branch || 'main');
  const [status, setStatus] = useState({ message: '', type: '' });

  const handleSave = async () => {
    const trimmedToken = token.trim();
    const trimmedRepo = repo.trim();
    const trimmedBranch = branch.trim() || 'main';

    if (!trimmedToken || !trimmedRepo) {
      setStatus({ message: '❌ Please enter both token and repository', type: 'error' });
      return;
    }

    const config = { token: trimmedToken, repo: trimmedRepo, branch: trimmedBranch };

    try {
      setStatus({ message: '⏳ Connecting...', type: '' });
      onSave(config);

      await loadGroups();
      await onLoadData();

      setStatus({ message: '✅ Connected! Data loaded from GitHub.', type: 'success' });
      setTimeout(onClose, 1500);
    } catch (error) {
      setStatus({ message: `❌ ${error.message}`, type: 'error' });
    }
  };

  const handleModalClick = (e) => {
    if (e.target.classList.contains('modal')) {
      onClose();
    }
  };

  return (
    <div className="modal" onClick={handleModalClick}>
      <div className="modal-content">
        <h2>⚙️ GitHub Settings</h2>
        <p className="modal-info">Connect to GitHub to sync your expenses across devices.</p>
        <div className="form-row">
          <label>GitHub Token</label>
          <input
            type="password"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder="ghp_xxxxxxxxxxxx"
          />
        </div>
        <div className="form-row">
          <label>Repository (owner/repo)</label>
          <input
            type="text"
            value={repo}
            onChange={(e) => setRepo(e.target.value)}
            placeholder="username/splitter"
          />
        </div>
        <div className="form-row">
          <label>Branch</label>
          <input
            type="text"
            value={branch}
            onChange={(e) => setBranch(e.target.value)}
            placeholder="main"
          />
        </div>
        <div className="modal-buttons">
          <button onClick={handleSave} className="btn btn-primary">Save & Connect</button>
          <button onClick={onClose} className="btn btn-secondary">Cancel</button>
        </div>
        {status.message && (
          <div className={`connection-status ${status.type}`}>
            {status.message}
          </div>
        )}
      </div>
    </div>
  );
}

export default SettingsModal;
