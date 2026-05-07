import { useRef } from 'react';
import {
  Upload,
  Download,
  Settings as SettingsIcon,
  Trash2,
  Cloud,
  GitBranchPlus,
  TreePine,
} from 'lucide-react';
import { useTree } from '../stores/tree';
import { useSettings } from '../stores/settings';
import { useToasts } from './ui/Toast';
import { exportGedcom, importGedcom } from '../lib/gedcom';
import { downloadText } from '../lib/utils';
import { FamilySearchClient } from '../lib/familysearch';
import { mapGedcomxRoot } from '../lib/gedcomx-mapper';
import { WikiTree, mapWtProfiles, mapWtRelatives } from '../lib/wikitree';

export function Toolbar({
  onOpenSettings,
}: {
  onOpenSettings: () => void;
}) {
  const tree = useTree();
  const { fsConfig, fsTokens, wikitree } = useSettings();
  const { push } = useToasts();
  const fileRef = useRef<HTMLInputElement>(null);

  function onImportClick() {
    fileRef.current?.click();
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const imported = importGedcom(text);
      tree.setState((s) => ({
        ...s,
        persons: { ...s.persons, ...imported.persons },
        sources: { ...s.sources, ...imported.sources },
        rootPersonId: imported.rootPersonId ?? s.rootPersonId,
      }));
      const firstId = Object.keys(imported.persons)[0];
      if (firstId) tree.setActive(firstId);
      push('success', `Imported ${Object.keys(imported.persons).length} persons.`);
    } catch (err) {
      push('error', `Import failed: ${(err as Error).message}`);
    }
    e.target.value = '';
  }

  function onExport() {
    const ged = exportGedcom(tree.state);
    downloadText(`tree_${new Date().toISOString().slice(0, 10)}.ged`, ged, 'text/plain');
    push('success', 'GEDCOM exported.');
  }

  async function onPullCurrent() {
    if (!fsTokens) {
      push('error', 'Connect FamilySearch first (Settings).');
      return;
    }
    const fs = new FamilySearchClient(fsConfig, fsTokens);
    try {
      const root = await fs.getCurrentPerson();
      const mapped = mapGedcomxRoot(root);
      tree.setState((s) => ({
        ...s,
        persons: { ...s.persons, ...mapped.persons },
      }));
      const id = Object.keys(mapped.persons)[0];
      if (id) tree.setActive(id);
      push('success', 'Pulled your FamilySearch person.');
    } catch (err) {
      push('error', (err as Error).message);
    }
  }

  async function onPullAncestry() {
    if (!fsTokens) {
      push('error', 'Connect FamilySearch first (Settings).');
      return;
    }
    const fs = new FamilySearchClient(fsConfig, fsTokens);
    const activeId = tree.activePersonId ? tree.state.persons[tree.activePersonId]?.fsId : undefined;
    try {
      let pid = activeId;
      if (!pid) {
        const me = await fs.getCurrentPerson();
        pid = me.persons?.[0]?.id;
      }
      if (!pid) throw new Error('No FamilySearch person to anchor on.');
      const root = await fs.getPersonAncestry(pid, 5);
      const mapped = mapGedcomxRoot(root, pid);
      tree.setState((s) => ({
        ...s,
        persons: { ...s.persons, ...mapped.persons },
      }));
      tree.setActive(pid);
      push('success', `Pulled ${Object.keys(mapped.persons).length} ancestors.`);
    } catch (err) {
      push('error', (err as Error).message);
    }
  }

  function onResetTree() {
    if (!confirm('Clear the entire local tree? This cannot be undone.')) return;
    void tree.reset();
    push('info', 'Tree cleared.');
  }

  async function onPullWikiTreePerson() {
    if (!wikitree.enabled) {
      push('error', 'WikiTree is disabled in Settings.');
      return;
    }
    const active = tree.activePersonId ? tree.state.persons[tree.activePersonId] : undefined;
    const defaultKey =
      active?.id && /^[\w-]+-\d+$/.test(active.id)
        ? active.id
        : wikitree.homeId ?? '';
    const key = prompt(
      'Enter a WikiTree ID (e.g. Smith-1) or leave blank to use the active person.',
      defaultKey,
    );
    if (key == null) return;
    const useKey = key.trim() || defaultKey;
    if (!useKey) {
      push('error', 'No WikiTree ID provided.');
      return;
    }
    try {
      const bundle = await WikiTree.getRelatives(useKey);
      if (!bundle) throw new Error(`Profile "${useKey}" not found or private.`);
      const mapped = mapWtRelatives(bundle);
      tree.setState((s) => ({
        ...s,
        persons: { ...s.persons, ...mapped.persons },
      }));
      if (mapped.rootId) tree.setActive(mapped.rootId);
      push(
        'success',
        `Imported ${Object.keys(mapped.persons).length} person(s) from WikiTree.`,
      );
    } catch (err) {
      push('error', (err as Error).message);
    }
  }

  async function onPullWikiTreeAncestry() {
    if (!wikitree.enabled) {
      push('error', 'WikiTree is disabled in Settings.');
      return;
    }
    const active = tree.activePersonId ? tree.state.persons[tree.activePersonId] : undefined;
    const defaultKey =
      active?.id && /^[\w-]+-\d+$/.test(active.id)
        ? active.id
        : wikitree.homeId ?? '';
    const key = prompt(
      'Enter a WikiTree ID to anchor the ancestry on (e.g. Smith-1).',
      defaultKey,
    );
    if (!key) return;
    try {
      const list = await WikiTree.getAncestors(key.trim(), 5);
      if (list.length === 0) throw new Error(`No ancestry found for "${key}".`);
      const mapped = mapWtProfiles(list, key.trim());
      tree.setState((s) => ({
        ...s,
        persons: { ...s.persons, ...mapped.persons },
      }));
      tree.setActive(key.trim());
      push('success', `Imported ${Object.keys(mapped.persons).length} ancestor(s) from WikiTree.`);
    } catch (err) {
      push('error', (err as Error).message);
    }
  }

  return (
    <div className="flex items-center gap-1 border-b border-ink-700/70 bg-ink-900/60 px-3 py-2 backdrop-blur-md">
      <div className="flex items-center gap-2 pr-3">
        <div className="font-serif text-base text-parchment-100">Agentic Genealogy</div>
      </div>
      <div className="flex flex-wrap items-center gap-1">
        <button onClick={onImportClick} className="btn-ghost text-xs">
          <Upload className="h-3.5 w-3.5" /> Import GEDCOM
        </button>
        <input
          ref={fileRef}
          type="file"
          accept=".ged,.gedcom,text/plain"
          className="hidden"
          onChange={onFile}
        />
        <button onClick={onExport} className="btn-ghost text-xs">
          <Download className="h-3.5 w-3.5" /> Export GEDCOM
        </button>
        <button
          onClick={onPullWikiTreePerson}
          className="btn-ghost text-xs"
          title="Fetch a WikiTree profile and their immediate relatives"
        >
          <TreePine className="h-3.5 w-3.5" /> WikiTree person
        </button>
        <button
          onClick={onPullWikiTreeAncestry}
          className="btn-ghost text-xs"
          title="Fetch up to 5 generations of WikiTree ancestors"
        >
          <GitBranchPlus className="h-3.5 w-3.5" /> WikiTree ancestry
        </button>
        {fsTokens && (
          <>
            <div className="mx-1 h-4 w-px bg-ink-700" />
            <button onClick={onPullCurrent} className="btn-ghost text-xs">
              <Cloud className="h-3.5 w-3.5" /> My FamilySearch
            </button>
            <button onClick={onPullAncestry} className="btn-ghost text-xs">
              <GitBranchPlus className="h-3.5 w-3.5" /> FS ancestry
            </button>
          </>
        )}
      </div>
      <div className="ml-auto flex items-center gap-1">
        <button onClick={onResetTree} className="btn-ghost text-xs text-red-300 hover:text-red-200">
          <Trash2 className="h-3.5 w-3.5" /> Reset
        </button>
        <button onClick={onOpenSettings} className="btn-ghost text-xs">
          <SettingsIcon className="h-3.5 w-3.5" /> Settings
        </button>
      </div>
    </div>
  );
}
