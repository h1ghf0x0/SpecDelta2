import type { WordDiffToken } from '../types/spec';

export type DiffViewMode = 'inline' | 'side-by-side';

interface RedlineTokenRendererProps {
  tokens: WordDiffToken[];
  mode: DiffViewMode;
  compact?: boolean;
}

export function RedlineTokenRenderer({
  tokens,
  mode,
  compact = false,
}: RedlineTokenRendererProps) {
  const textClass = compact ? 'text-xs leading-relaxed' : 'text-sm leading-relaxed';

  if (mode === 'inline') {
    return (
      <div className={`text-slate-900 ${textClass}`}>
        {tokens.map((tok, idx) => {
          if (tok.op === 0) {
            return <span key={idx}>{tok.text}</span>;
          }
          if (tok.op === -1) {
            return (
              <del
                key={idx}
                title={tok.riskMatch ? `Risk (${tok.riskMatch})` : 'Deleted text'}
                className={`bg-red-50 text-[#B91C1C] line-through px-0.5 rounded-xs ${
                  tok.riskMatch ? 'ring-1 ring-amber-400' : ''
                }`}
              >
                {tok.text}
              </del>
            );
          }
          return (
            <ins
              key={idx}
              title={tok.riskMatch ? `Risk (${tok.riskMatch})` : 'Added text'}
              className={`underline decoration-2 underline-offset-2 px-0.5 rounded-xs font-medium ${
                tok.riskMatch
                  ? 'bg-amber-100 text-amber-950 ring-1 ring-amber-400 decoration-amber-700/80'
                  : 'bg-emerald-50 text-[#15803D] decoration-emerald-600/75'
              }`}
            >
              {tok.text}
            </ins>
          );
        })}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 border border-slate-200 rounded-md overflow-hidden divide-y md:divide-y-0 md:divide-x divide-slate-200">
      {/* Baseline Specification Column (Old) */}
      <div className="bg-slate-50/50">
        <div className="px-3 py-1.5 border-b border-slate-200 bg-slate-100/70 flex items-center justify-between text-[11px] font-medium text-slate-600">
          <span>Baseline Specification</span>
          <span className="font-mono text-[#B91C1C]">Removals</span>
        </div>
        <div className={`p-3.5 text-slate-800 ${textClass}`}>
          {tokens.map((tok, idx) => {
            if (tok.op === 1) return null;
            if (tok.op === 0) {
              return <span key={idx}>{tok.text}</span>;
            }
            return (
              <del
                key={idx}
                title={tok.riskMatch ? `Risk (${tok.riskMatch})` : 'Removed in addendum'}
                className={`bg-red-100/80 text-[#B91C1C] line-through px-0.5 rounded-xs ${
                  tok.riskMatch ? 'ring-1 ring-amber-400' : ''
                }`}
              >
                {tok.text}
              </del>
            );
          })}
        </div>
      </div>

      {/* Revised / Addendum Specification Column (New) */}
      <div className="bg-white">
        <div className="px-3 py-1.5 border-b border-slate-200 bg-slate-100/70 flex items-center justify-between text-[11px] font-medium text-slate-600">
          <span>Revised / Addendum</span>
          <span className="font-mono text-[#15803D]">Additions</span>
        </div>
        <div className={`p-3.5 text-slate-900 ${textClass}`}>
          {tokens.map((tok, idx) => {
            if (tok.op === -1) return null;
            if (tok.op === 0) {
              return <span key={idx}>{tok.text}</span>;
            }
            return (
              <ins
                key={idx}
                title={tok.riskMatch ? `Risk (${tok.riskMatch})` : 'Added in addendum'}
                className={`underline decoration-2 underline-offset-2 px-0.5 rounded-xs font-medium ${
                  tok.riskMatch
                    ? 'bg-amber-100 text-amber-950 ring-1 ring-amber-400 decoration-amber-700/80'
                    : 'bg-emerald-50 text-[#15803D] decoration-emerald-600/75'
                }`}
              >
                {tok.text}
              </ins>
            );
          })}
        </div>
      </div>
    </div>
  );
}
