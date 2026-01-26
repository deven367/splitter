import { useState, useEffect, useRef } from 'react';
import { utf8ToBase64, getDataFilename } from '../utils/helpers';

const SYNC_DELAY = 3000;

export function useGitHubSync(currentGroup) {
  const [githubConfig, setGithubConfig] = useState(() => ({
    token: localStorage.getItem('github_token') || '',
    repo: localStorage.getItem('github_repo') || '',
    branch: localStorage.getItem('github_branch') || 'main'
  }));

  const [syncStatus, setSyncStatus] = useState('local');
  const [groups, setGroups] = useState(['default']);
  const [groupsSha, setGroupsSha] = useState(null);
  const [currentSha, setCurrentSha] = useState(null);

  const syncQueue = useRef([]);
  const syncTimeout = useRef(null);
  const isSyncing = useRef(false);

  // Save GitHub config
  const saveGitHubConfig = (config) => {
    setGithubConfig(config);
    localStorage.setItem('github_token', config.token);
    localStorage.setItem('github_repo', config.repo);
    localStorage.setItem('github_branch', config.branch);
  };

  // Load groups from GitHub
  const loadGroups = async () => {
    const { token, repo, branch } = githubConfig;

    if (!token || !repo) {
      const savedGroups = localStorage.getItem('splitter_groups');
      if (savedGroups) setGroups(JSON.parse(savedGroups));
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
        setGroups(['default']);
        await saveGroupsToGitHub(['default']);
        return;
      }

      if (!response.ok) throw new Error('Failed to load groups');

      const data = await response.json();
      setGroupsSha(data.sha);
      const loadedGroups = JSON.parse(atob(data.content));
      setGroups(loadedGroups);
      localStorage.setItem('splitter_groups', JSON.stringify(loadedGroups));
    } catch (error) {
      console.error('Failed to load groups:', error);
      const savedGroups = localStorage.getItem('splitter_groups');
      if (savedGroups) setGroups(JSON.parse(savedGroups));
    }
  };

  // Save groups to GitHub
  const saveGroupsToGitHub = async (updatedGroups) => {
    const { token, repo, branch } = githubConfig;

    if (!token || !repo) {
      localStorage.setItem('splitter_groups', JSON.stringify(updatedGroups));
      return;
    }

    const content = utf8ToBase64(JSON.stringify(updatedGroups, null, 2));

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
    setGroupsSha(result.content.sha);
    localStorage.setItem('splitter_groups', JSON.stringify(updatedGroups));
  };

  // Load data from GitHub
  const loadFromGitHub = async () => {
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
      await commitToGitHub({ members: [], expenses: [] }, `Initialize ${filename}`);
      return { members: [], expenses: [] };
    }

    if (!response.ok) {
      throw new Error('Failed to connect to GitHub');
    }

    const data = await response.json();
    setCurrentSha(data.sha);

    const content = JSON.parse(atob(data.content));
    const storageKey = `splitter_${currentGroup}`;
    localStorage.setItem(`${storageKey}_members`, JSON.stringify(content.members || []));
    localStorage.setItem(`${storageKey}_expenses`, JSON.stringify(content.expenses || []));

    return { members: content.members || [], expenses: content.expenses || [] };
  };

  // Commit data to GitHub
  const commitToGitHub = async (data, message) => {
    const { token, repo, branch } = githubConfig;
    const filename = getDataFilename(currentGroup);
    const storageKey = `splitter_${currentGroup}`;

    if (!token || !repo) {
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
    setCurrentSha(result.content.sha);

    localStorage.setItem(`${storageKey}_members`, JSON.stringify(data.members));
    localStorage.setItem(`${storageKey}_expenses`, JSON.stringify(data.expenses));
  };

  // Queue sync operation
  const queueSync = (members, expenses, message) => {
    syncQueue.current.push(message);

    const storageKey = `splitter_${currentGroup}`;
    localStorage.setItem(`${storageKey}_members`, JSON.stringify(members));
    localStorage.setItem(`${storageKey}_expenses`, JSON.stringify(expenses));

    setSyncStatus('pending');

    if (syncTimeout.current) {
      clearTimeout(syncTimeout.current);
    }

    syncTimeout.current = setTimeout(() => {
      performSync(members, expenses);
    }, SYNC_DELAY);
  };

  // Perform sync
  const performSync = async (members, expenses) => {
    if (isSyncing.current || syncQueue.current.length === 0) return;

    const { token, repo } = githubConfig;
    if (!token || !repo) {
      syncQueue.current = [];
      setSyncStatus('local');
      return;
    }

    isSyncing.current = true;
    setSyncStatus('syncing');

    const messages = syncQueue.current.slice();
    syncQueue.current = [];

    const commitMessage = messages.length === 1
      ? messages[0]
      : `Batch update (${messages.length} changes):\n- ${messages.join('\n- ')}`;

    try {
      await commitToGitHub({ members, expenses }, commitMessage);
      setSyncStatus('synced');
      setTimeout(() => setSyncStatus('local'), 2000);
    } catch (error) {
      console.error('Sync failed:', error);
      setSyncStatus('error');
      syncQueue.current = [...messages, ...syncQueue.current];
    }

    isSyncing.current = false;

    if (syncQueue.current.length > 0) {
      syncTimeout.current = setTimeout(() => performSync(members, expenses), SYNC_DELAY);
    }
  };

  // Delete group data file
  const deleteGroupDataFile = async (groupName) => {
    const { token, repo, branch } = githubConfig;

    if (!token || !repo) return;

    const filename = getDataFilename(groupName);

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

      if (response.status === 404) return;

      const data = await response.json();

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
  };

  useEffect(() => {
    loadGroups();
  }, []);

  return {
    githubConfig,
    saveGitHubConfig,
    groups,
    setGroups,
    syncStatus,
    loadGroups,
    saveGroupsToGitHub,
    loadFromGitHub,
    commitToGitHub,
    queueSync,
    deleteGroupDataFile,
    setCurrentSha
  };
}
