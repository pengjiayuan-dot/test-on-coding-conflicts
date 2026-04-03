/* eslint-disable @coze-arch/max-line-per-function */
import React, { useState, useMemo, useRef, useEffect } from 'react';

import {
  useIDEService,
  IFilesystemService,
  useProjectId,
  useProjectInfo,
} from '@coze-ide/biz-common';
import { toast } from '@coze-coding/core-components/sonner';
import { ScrollArea } from '@coze-coding/core-components/scroll-area';
import { Input } from '@coze-coding/core-components/input';
import { Button } from '@coze-coding/core-components/button';
import { cn } from '@coze-coding/core-components';
import { I18n } from '@coze-arch/i18n/coding';

import { GitArea } from '@/types/git';
import { useGitFolderStore } from '@/stores/git-folder-store';
import { useGitFileStore } from '@/stores/git-file-store';

import { useGitStatus } from './hooks/use-git-status';
import { useGitCount } from './hooks/use-git-count';
import { useGitActions } from './hooks/use-git-actions';
import { useConfigCommit } from './hooks/use-config-commit';
import { useConfig, CONFIG_KEY } from '../common/use-config';
import { HeaderActions } from './header-action';
import { GitFileGroup } from './git-file-group';

export const Git = ({ className }: { className?: string }) => {
  const staged = useGitFileStore(state => state.staged);
  const unstaged = useGitFileStore(state => state.unstaged);
  const untracked = useGitFileStore(state => state.untracked);
  const conflicted = useGitFileStore(state => state.conflicted);
  const [focused, setFocused] = useState(GitArea.ROOT);
  const gitActions = useGitActions();
  const inputRef = useRef<HTMLInputElement>(null);
  const gitCount = useGitCount();
  const gitStatus = useGitStatus();
  const projectId = useProjectId();
  const fsService = useIDEService<IFilesystemService>(IFilesystemService);
  const configCommitDialog = useConfigCommit();
  const config = useConfig();
  const readOnly = useProjectInfo(state => state.readOnly);
  const [committing, setCommitting] = useState(false);
  const [flat, setFlat] = useState(true);
  const canCommit = staged.size > 0 || unstaged.size > 0 || untracked.size > 0;

  useEffect(() => {
    //项目切换的时候重置git文件状态124
    useGitFileStore.getState().reset();
    useGitFolderStore.getState().reset();
  }, [projectId]);

  const unstagedChanges = useMemo(
    () => new Map([...unstaged, ...untracked]),
    [unstaged, untracked],
  );

  const validateCommitMessage = () => {
    const inputEle = inputRef.current;
    if (!inputEle) {
      return;
    }
    const message = inputEle.value;
    !message && toast.error(I18n.t('git_enter_commit_message'));
    return message;
  };

  const validateStaged = (): Promise<boolean> =>
    new Promise<boolean>(resolve => {
      if (staged.size > 0) {
        return resolve(true);
      }
      const commitAfterStage = () => {
        gitActions.stageAll().then(_ => resolve(true));
      };
      const key = CONFIG_KEY.GIT_COMMIT_STAGE_ALL;
      if (config.read(key) === 'always') {
        return commitAfterStage();
      }
      if (config.read(key) === 'never') {
        toast.error(I18n.t('git_stage_changes_first'));
        return resolve(false);
      }
      configCommitDialog.openDialog({
        onOk: commitAfterStage,
        onAlways: () => {
          commitAfterStage();
          config.write(key, 'always');
        },
        onCancel: () => resolve(false),
        onNever: () => {
          resolve(false);
          config.write(key, 'never');
        },
      });
    });

  const onCommit = async () => {
    const message = validateCommitMessage();
    if (!message) {
      return;
    }

    const stageConfirmed = await validateStaged();
    if (!stageConfirmed) {
      return;
    }

    fsService.reportAction('commit_files');
    setCommitting(true);
    const res = await gitActions.commitStaged(message);
    if (res?.code !== 0) {
      res?.msg && toast.error(res.msg);
    } else {
      //提交成功，清空 commit-message
      toast.success(I18n.t('git_commit_success'));
      inputRef.current!.value = '';
    }
    setCommitting(false);
  };

  return (
    <div
      className={cn('flex flex-col h-full', className)}
      onClick={() => {
        setFocused(GitArea.ROOT);
      }}
    >
      <div className="flex px-2">
        <div className="grow-1 w-0">
          <span className="text-xs ml-1">{I18n.t('git_source_control')}</span>
        </div>
        <HeaderActions
          onRefresh={async () => {
            fsService.reportAction('refresh_git_content');
            await gitStatus.refresh();
          }}
          flat={flat}
          hasResult={gitCount > 0}
          toggleFlat={() => {
            fsService.reportAction('toggle_git_layout');
            setFlat(!flat);
          }}
        />
      </div>
      <div className="w-full p-2">
        <Input
          ref={inputRef}
          className="mb-2 h-8"
          placeholder={I18n.t('git_message')}
          style={{ fontSize: '12px' }}
        />
        <Button
          className="w-full"
          size="sm"
          onClick={onCommit}
          loading={committing}
          disabled={readOnly || !canCommit}
        >
          {I18n.t('git_commit')}
        </Button>
      </div>
      <ScrollArea className="flex-1 h-0">
        <div className="text-xs select-none flex flex-col pb-4">
          <GitFileGroup
            area={GitArea.CONFLICTED}
            title={I18n.t('git_files_to_merge')}
            files={conflicted}
            flat={flat}
            focused={focused === GitArea.CONFLICTED}
            onClick={() => {
              setFocused(GitArea.CONFLICTED);
            }}
          />
          <GitFileGroup
            area={GitArea.STAGED}
            title={I18n.t('git_staged_changes')}
            files={staged}
            flat={flat}
            focused={focused === GitArea.STAGED}
            onClick={() => {
              setFocused(GitArea.STAGED);
            }}
          />
          <GitFileGroup
            area={GitArea.UNSTAGED}
            title={I18n.t('git_changes')}
            files={unstagedChanges}
            flat={flat}
            focused={focused === GitArea.UNSTAGED}
            onClick={() => {
              setFocused(GitArea.UNSTAGED);
            }}
          />
        </div>
      </ScrollArea>
      {configCommitDialog.DialogNode}
    </div>
  );
};
