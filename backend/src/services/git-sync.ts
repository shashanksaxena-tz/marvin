import simpleGit, { SimpleGit, SimpleGitOptions } from 'simple-git';
import { config } from '../config';
import fs from 'fs';
import path from 'path';

interface GitSyncConfig {
  repoUrl: string;
  repoPath: string;
  gitToken: string;
}

/**
 * Git sync service for keeping MARVIN state in sync with a remote repository.
 * Handles clone, pull, commit, and push operations with conflict resolution.
 */
export class GitSyncService {
  private readonly repoUrl: string;
  private readonly repoPath: string;
  private readonly gitToken: string;
  private git: SimpleGit | null = null;

  constructor(cfg?: GitSyncConfig) {
    this.repoUrl = cfg?.repoUrl || config.gitRepoUrl;
    this.repoPath = cfg?.repoPath || config.stateRepoPath;
    this.gitToken = cfg?.gitToken || config.gitToken;
  }

  /**
   * Check if the git sync service is available (repo URL configured).
   */
  isAvailable(): boolean {
    return !!this.repoUrl;
  }

  /**
   * Build the authenticated repo URL by embedding the token.
   */
  private getAuthenticatedUrl(): string {
    if (!this.gitToken || !this.repoUrl) return this.repoUrl;
    // Support both https://github.com/... and https://user@github.com/...
    const url = new URL(this.repoUrl);
    url.username = 'oauth2';
    url.password = this.gitToken;
    return url.toString();
  }

  /**
   * Get or create the SimpleGit instance for the repo path.
   */
  private getGit(): SimpleGit {
    if (!this.git) {
      const options: Partial<SimpleGitOptions> = {
        baseDir: this.repoPath,
        binary: 'git',
        maxConcurrentProcesses: 1,
      };
      this.git = simpleGit(options);
    }
    return this.git;
  }

  /**
   * Clone the repo if it doesn't exist locally, or pull latest if it does.
   */
  async initialize(): Promise<void> {
    if (!this.isAvailable()) {
      console.warn('[git-sync] No GIT_REPO_URL configured, git sync disabled.');
      return;
    }

    const gitDir = path.join(this.repoPath, '.git');

    if (fs.existsSync(gitDir)) {
      console.log('[git-sync] Repo already cloned, pulling latest...');
      this.git = null; // Reset to pick up existing dir
      await this.pull();
    } else {
      console.log('[git-sync] Cloning repo...');
      // Ensure parent directory exists
      fs.mkdirSync(path.dirname(this.repoPath), { recursive: true });

      const tempGit = simpleGit();
      await tempGit.clone(this.getAuthenticatedUrl(), this.repoPath);
      console.log('[git-sync] Clone complete.');
    }

    // Configure git user for commits
    const git = this.getGit();
    await git.addConfig('user.name', 'MARVIN');
    await git.addConfig('user.email', 'marvin@assistant.local');
  }

  /**
   * Pull latest changes from remote.
   * Uses --rebase to keep a clean history and --strategy-option=theirs for conflicts.
   */
  async pull(): Promise<void> {
    if (!this.isAvailable()) return;

    const git = this.getGit();
    try {
      await git.pull('origin', 'main', { '--rebase': null });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      // If rebase fails due to conflicts, abort and try merge with theirs strategy
      if (message.includes('conflict') || message.includes('CONFLICT')) {
        console.warn('[git-sync] Rebase conflict detected, falling back to merge with theirs strategy.');
        try {
          await git.rebase({ '--abort': null });
        } catch {
          // Abort may fail if not in rebase state, ignore
        }
        await git.pull('origin', 'main', {
          '--strategy': 'recursive',
          '--strategy-option': 'theirs',
        });
        console.log('[git-sync] Resolved conflicts using theirs strategy.');
      } else {
        throw new Error(`[git-sync] Pull failed: ${message}`);
      }
    }
  }

  /**
   * Stage changes in state/ and content/ directories, commit, and push.
   */
  async commitAndPush(message: string): Promise<void> {
    if (!this.isAvailable()) return;

    const git = this.getGit();

    // Stage only state/ and content/ directories
    await git.add('state/*');
    await git.add('content/*');

    // Check if there are staged changes
    const status = await git.status();
    if (status.staged.length === 0) {
      console.log('[git-sync] No changes to commit.');
      return;
    }

    await git.commit(message);
    try {
      await git.push('origin', 'main');
      console.log(`[git-sync] Pushed: "${message}"`);
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      console.error(`[git-sync] Push failed: ${errMsg}`);
      throw new Error(`[git-sync] Push failed: ${errMsg}`);
    }
  }

  /**
   * Pull latest, then commit and push changes with the given description.
   * This is the main entry point for syncing after a state change.
   */
  async syncAfterChange(description: string): Promise<void> {
    if (!this.isAvailable()) return;

    await this.pull();
    await this.commitAndPush(description);
  }
}
