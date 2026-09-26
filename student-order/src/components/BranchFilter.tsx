import type { Branch } from '../types';

interface BranchFilterProps {
  branches: Branch[];
  selectedBranchId: string;
  onChange: (branchId: string) => void;
}

export function BranchFilter({ branches, selectedBranchId, onChange }: BranchFilterProps) {
  if (branches.length <= 1) return null;

  return (
    <div className="flex items-center gap-2">
      <label htmlFor="branch-select" className="text-sm font-medium text-gray-600 whitespace-nowrap">
        Branch:
      </label>
      <select
        id="branch-select"
        value={selectedBranchId}
        onChange={e => onChange(e.target.value)}
        className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-[#1a1a2e] cursor-pointer"
      >
        {branches.map(b => (
          <option key={b.id} value={b.id}>{b.name}</option>
        ))}
      </select>
    </div>
  );
}
